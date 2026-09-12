import { createHash } from 'node:crypto';
import type {
  HistoricalBar,
  TournamentCandidateSummary,
  TournamentResult,
  ValidationMetrics,
  WfaBacktestReport,
  WfaStrategyFamily,
  WfaWindowReport,
} from '../../src/types.js';

export interface BacktestCosts {
  feeRateBps: number;
  slippageBps: number;
  positionPct: number;
}

export interface StrategyCandidate {
  strategy_id: string;
  strategy_family: WfaStrategyFamily;
  params: Record<string, number>;
}

interface InternalTrade {
  entryTime: string;
  exitTime: string;
  side: 1 | -1;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  grossPnl: number;
  netPnl: number;
  fees: number;
  slippage: number;
}

interface InternalRun {
  initialBalance: number;
  finalBalance: number;
  equityCurve: Array<{ timestamp: string; balance: number }>;
  trades: InternalTrade[];
  metrics: ValidationMetrics;
}

interface WindowDefinition {
  windowId: number;
  trainStart: number;
  trainEnd: number;
  validationStart: number;
  validationEnd: number;
  testStart: number;
  testEnd: number;
}

const MIN_WALK_FORWARD_WINDOWS = 8;
const MIN_BARS = 240;
const EPSILON = 1e-9;

function round(value: number, digits = 6): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function sma(closes: number[], endIndex: number, period: number): number | null {
  const start = endIndex - period + 1;
  if (start < 0 || period <= 0) return null;
  return mean(closes.slice(start, endIndex + 1));
}

function rsi(closes: number[], endIndex: number, period: number): number | null {
  if (period <= 0 || endIndex < period) return null;
  let gains = 0;
  let losses = 0;
  for (let index = endIndex - period + 1; index <= endIndex; index += 1) {
    const delta = closes[index] - closes[index - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return gains === 0 ? 50 : 100;
  const relativeStrength = gains / losses;
  return 100 - 100 / (1 + relativeStrength);
}

function highest(bars: HistoricalBar[], start: number, end: number, field: 'high' | 'low'): number | null {
  if (start < 0 || end < start) return null;
  const values = bars.slice(start, end + 1).map((bar) => bar[field]);
  return values.length ? (field === 'high' ? Math.max(...values) : Math.min(...values)) : null;
}

function maxLookback(candidate: StrategyCandidate): number {
  if (candidate.strategy_family === 'trend_following') {
    return Math.max(candidate.params.fast_period || 10, candidate.params.slow_period || 40) + 2;
  }
  if (candidate.strategy_family === 'mean_reversion') return (candidate.params.rsi_period || 14) + 2;
  return (candidate.params.breakout_period || 20) + 2;
}

function signalAt(
  bars: HistoricalBar[],
  closes: number[],
  index: number,
  candidate: StrategyCandidate
): 1 | -1 | 0 {
  if (index < maxLookback(candidate)) return 0;

  if (candidate.strategy_family === 'trend_following') {
    const fastPeriod = candidate.params.fast_period;
    const slowPeriod = candidate.params.slow_period;
    const fast = sma(closes, index, fastPeriod);
    const slow = sma(closes, index, slowPeriod);
    if (fast === null || slow === null) return 0;
    if (closes[index] > fast && fast > slow) return 1;
    if (closes[index] < fast && fast < slow) return -1;
    return 0;
  }

  if (candidate.strategy_family === 'mean_reversion') {
    const value = rsi(closes, index, candidate.params.rsi_period);
    if (value === null) return 0;
    if (value <= candidate.params.lower_rsi) return 1;
    if (value >= candidate.params.upper_rsi) return -1;
    return 0;
  }

  const period = candidate.params.breakout_period;
  // Deliberately exclude the signal candle from the reference range. The
  // candle is closed before signalAt is called, and execution happens next bar.
  const previousHigh = highest(bars, index - period, index - 1, 'high');
  const previousLow = highest(bars, index - period, index - 1, 'low');
  if (previousHigh === null || previousLow === null) return 0;
  if (closes[index] > previousHigh) return 1;
  if (closes[index] < previousLow) return -1;
  return 0;
}

function entryFill(rawPrice: number, side: 1 | -1, slippageBps: number): number {
  const slippage = Math.max(0, slippageBps) / 10000;
  return rawPrice * (1 + side * slippage);
}

function exitFill(rawPrice: number, side: 1 | -1, slippageBps: number): number {
  const slippage = Math.max(0, slippageBps) / 10000;
  return rawPrice * (1 - side * slippage);
}

function calculateMetrics(
  equityCurve: Array<{ timestamp: string; balance: number }>,
  trades: InternalTrade[],
  timeframe: string
): ValidationMetrics {
  const balances = equityCurve.map((point) => point.balance).filter(Number.isFinite);
  const returns: number[] = [];
  for (let index = 1; index < balances.length; index += 1) {
    if (balances[index - 1] > EPSILON) returns.push(balances[index] / balances[index - 1] - 1);
  }

  const initialBalance = balances[0] || 0;
  const finalBalance = balances[balances.length - 1] || initialBalance;
  const grossProfit = trades.reduce((sum, trade) => sum + (trade.netPnl > 0 ? trade.netPnl : 0), 0);
  const grossLoss = trades.reduce((sum, trade) => sum + (trade.netPnl < 0 ? Math.abs(trade.netPnl) : 0), 0);
  const wins = trades.filter((trade) => trade.netPnl > 0).length;

  let peak = initialBalance;
  let maxDrawdown = 0;
  for (const balance of balances) {
    peak = Math.max(peak, balance);
    if (peak > EPSILON) maxDrawdown = Math.max(maxDrawdown, ((peak - balance) / peak) * 100);
  }

  const periodDays =
    equityCurve.length > 1
      ? Math.max(
          1 / 365,
          (new Date(equityCurve[equityCurve.length - 1].timestamp).getTime() -
            new Date(equityCurve[0].timestamp).getTime()) /
            86400000
        )
      : 1 / 365;
  const cagr =
    initialBalance > EPSILON && finalBalance > EPSILON
      ? (Math.pow(finalBalance / initialBalance, 365 / periodDays) - 1) * 100
      : finalBalance <= 0
        ? -100
        : 0;

  const periodsPerYear: Record<string, number> = {
    '1m': 252 * 390,
    '5m': 252 * 78,
    '15m': 252 * 26,
    '1h': 252 * 6.5,
    '1d': 252,
  };
  const annualization = Math.sqrt(periodsPerYear[timeframe] || 252);
  const returnStd = standardDeviation(returns);
  const averageReturn = mean(returns);
  const sharpe = returnStd > EPSILON ? (averageReturn / returnStd) * annualization : 0;
  const negativeReturns = returns.filter((value) => value < 0);
  const downsideDeviation = standardDeviation(negativeReturns);
  const sortino = downsideDeviation > EPSILON ? (averageReturn / downsideDeviation) * annualization : 0;

  return {
    n_trades: trades.length,
    win_rate: round(trades.length ? (wins / trades.length) * 100 : 0, 4),
    profit_factor: round(grossLoss > EPSILON ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0, 4),
    expectancy: round(trades.length ? mean(trades.map((trade) => trade.netPnl)) : 0, 8),
    sharpe: round(sharpe, 4),
    sortino: round(sortino, 4),
    calmar: round(maxDrawdown > EPSILON ? cagr / maxDrawdown : 0, 4),
    max_drawdown: round(maxDrawdown, 4),
    cagr: round(cagr, 4),
    total_return: round(initialBalance > EPSILON ? ((finalBalance / initialBalance) - 1) * 100 : 0, 4),
    gross_profit: round(grossProfit, 8),
    gross_loss: round(grossLoss, 8),
    fees_total: round(trades.reduce((sum, trade) => sum + trade.fees, 0), 8),
    slippage_total: round(trades.reduce((sum, trade) => sum + trade.slippage, 0), 8),
    avg_trade: round(trades.length ? mean(trades.map((trade) => trade.netPnl)) : 0, 8),
    best_trade: round(trades.length ? Math.max(...trades.map((trade) => trade.netPnl)) : 0, 8),
    worst_trade: round(trades.length ? Math.min(...trades.map((trade) => trade.netPnl)) : 0, 8),
  };
}

function verifyNoLookahead(bars: HistoricalBar[], candidate: StrategyCandidate): boolean {
  const first = maxLookback(candidate);
  for (let index = first; index < bars.length; index += Math.max(1, Math.floor(bars.length / 32))) {
    const fullHistorySignal = signalAt(bars, bars.map((bar) => bar.close), index, candidate);
    const closedHistory = bars.slice(0, index + 1);
    const prefixSignal = signalAt(closedHistory, closedHistory.map((bar) => bar.close), index, candidate);
    if (fullHistorySignal !== prefixSignal) return false;
  }
  return true;
}

function emptyMetrics(): ValidationMetrics {
  return {
    n_trades: 0,
    win_rate: 0,
    profit_factor: 0,
    expectancy: 0,
    sharpe: 0,
    sortino: 0,
    calmar: 0,
    max_drawdown: 0,
    cagr: 0,
    total_return: 0,
    gross_profit: 0,
    gross_loss: 0,
    fees_total: 0,
    slippage_total: 0,
    avg_trade: 0,
    best_trade: 0,
    worst_trade: 0,
  };
}

function runSegment(
  bars: HistoricalBar[],
  candidate: StrategyCandidate,
  timeframe: string,
  initialCapital: number,
  costs: BacktestCosts,
  evaluationStart: number,
  evaluationEnd: number
): InternalRun {
  const safeStart = Math.max(0, evaluationStart);
  const safeEnd = Math.min(bars.length, evaluationEnd);
  const closes = bars.map((bar) => bar.close);
  const warmup = maxLookback(candidate);
  let equity = initialCapital;
  let position: {
    side: 1 | -1;
    entryPrice: number;
    rawEntryPrice: number;
    quantity: number;
    entryFee: number;
    entryTime: string;
  } | null = null;
  const trades: InternalTrade[] = [];
  const equityCurve: Array<{ timestamp: string; balance: number }> = [];

  if (safeStart < safeEnd && bars[safeStart]) {
    equityCurve.push({ timestamp: bars[safeStart].timestamp, balance: equity });
  }

  const closePosition = (rawExitPrice: number, exitTime: string) => {
    if (!position) return;
    const exitPrice = exitFill(rawExitPrice, position.side, costs.slippageBps);
    const exitNotional = Math.abs(exitPrice * position.quantity);
    const exitFee = exitNotional * Math.max(0, costs.feeRateBps) / 10000;
    const grossPnl = (exitPrice - position.entryPrice) * position.quantity * position.side;
    const slippage =
      Math.abs(position.entryPrice - position.rawEntryPrice) * position.quantity +
      Math.abs(exitPrice - rawExitPrice) * position.quantity;
    const netPnl = grossPnl - position.entryFee - exitFee;
    equity += grossPnl - exitFee;
    trades.push({
      entryTime: position.entryTime,
      exitTime,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      grossPnl,
      netPnl,
      fees: position.entryFee + exitFee,
      slippage,
    });
    position = null;
  };

  // A signal is calculated from candle i - 1, which is closed before the
  // order is filled at candle i's open. This is the look-ahead guard.
  for (let index = Math.max(safeStart, warmup + 1); index < safeEnd; index += 1) {
    const signal = signalAt(bars, closes, index - 1, candidate);
    if (position && signal !== 0 && signal !== position.side) {
      closePosition(bars[index].open, bars[index].timestamp);
    }

    if (!position && signal !== 0) {
      const rawEntryPrice = bars[index].open;
      const entryPrice = entryFill(rawEntryPrice, signal, costs.slippageBps);
      const notional = Math.max(0, equity) * Math.max(0, Math.min(costs.positionPct, 1));
      const quantity = entryPrice > EPSILON ? notional / entryPrice : 0;
      const entryFee = notional * Math.max(0, costs.feeRateBps) / 10000;
      if (quantity > EPSILON && entryFee < equity) {
        equity -= entryFee;
        position = {
          side: signal,
          entryPrice,
          rawEntryPrice,
          quantity,
          entryFee,
          entryTime: bars[index].timestamp,
        };
      }
    }

    const markedBalance = position
      ? equity + (bars[index].close - position.entryPrice) * position.quantity * position.side
      : equity;
    equityCurve.push({ timestamp: bars[index].timestamp, balance: Math.max(0, markedBalance) });
  }

  // Close at the last available close solely to finalize the report. No new
  // entry decision is made from that close.
  if (position && safeEnd > safeStart) {
    closePosition(bars[safeEnd - 1].close, bars[safeEnd - 1].timestamp);
    const lastPoint = equityCurve[equityCurve.length - 1];
    if (lastPoint) lastPoint.balance = Math.max(0, equity);
  }

  if (equityCurve.length === 0 && bars[safeStart]) {
    equityCurve.push({ timestamp: bars[safeStart].timestamp, balance: equity });
  }
  const finalBalance = equityCurve.length ? equityCurve[equityCurve.length - 1].balance : equity;
  return {
    initialBalance: initialCapital,
    finalBalance,
    equityCurve,
    trades,
    metrics: calculateMetrics(equityCurve, trades, timeframe),
  };
}

function combineRuns(runs: InternalRun[], timeframe: string, initialCapital: number): InternalRun {
  if (runs.length === 0) {
    return {
      initialBalance: initialCapital,
      finalBalance: initialCapital,
      equityCurve: [],
      trades: [],
      metrics: emptyMetrics(),
    };
  }

  let capital = initialCapital;
  const equityCurve: Array<{ timestamp: string; balance: number }> = [];
  const trades: InternalTrade[] = [];
  for (const run of runs) {
    const scale = run.initialBalance > EPSILON ? capital / run.initialBalance : 1;
    const points = run.equityCurve;
    for (let index = 0; index < points.length; index += 1) {
      if (equityCurve.length && index === 0) continue;
      equityCurve.push({ timestamp: points[index].timestamp, balance: points[index].balance * scale });
    }
    for (const trade of run.trades) {
      trades.push({
        ...trade,
        grossPnl: trade.grossPnl * scale,
        netPnl: trade.netPnl * scale,
        fees: trade.fees * scale,
        slippage: trade.slippage * scale,
      });
    }
    capital = run.finalBalance * scale;
  }

  return {
    initialBalance: initialCapital,
    finalBalance: capital,
    equityCurve,
    trades,
    metrics: calculateMetrics(equityCurve, trades, timeframe),
  };
}

function buildWindows(barCount: number): WindowDefinition[] {
  if (barCount < MIN_BARS) return [];
  let testLength = Math.max(5, Math.floor(barCount * 0.05));
  let firstTestStart = barCount - testLength * MIN_WALK_FORWARD_WINDOWS;
  const validationLength = Math.max(20, Math.floor(barCount * 0.08));
  const minimumTrainLength = Math.max(100, Math.floor(barCount * 0.25));

  if (firstTestStart - validationLength < minimumTrainLength) {
    testLength = Math.max(5, Math.floor((barCount - validationLength - minimumTrainLength) / MIN_WALK_FORWARD_WINDOWS));
    firstTestStart = barCount - testLength * MIN_WALK_FORWARD_WINDOWS;
  }
  if (testLength < 5 || firstTestStart - validationLength < minimumTrainLength) return [];

  const windows: WindowDefinition[] = [];
  for (let index = 0; index < MIN_WALK_FORWARD_WINDOWS; index += 1) {
    const testStart = firstTestStart + index * testLength;
    const testEnd = Math.min(barCount, testStart + testLength);
    const validationEnd = testStart;
    const validationStart = validationEnd - validationLength;
    const trainStart = 0; // expanding window: never discards past observations
    const trainEnd = validationStart;
    if (trainEnd - trainStart < minimumTrainLength || validationStart < 0 || testEnd <= testStart) return [];
    windows.push({
      windowId: index + 1,
      trainStart,
      trainEnd,
      validationStart,
      validationEnd,
      testStart,
      testEnd,
    });
  }
  return windows;
}

function segmentMetrics(
  bars: HistoricalBar[],
  candidate: StrategyCandidate,
  timeframe: string,
  initialCapital: number,
  costs: BacktestCosts,
  start: number,
  end: number
): InternalRun {
  const contextStart = Math.max(0, start - maxLookback(candidate) - 2);
  const localBars = bars.slice(contextStart, end);
  return runSegment(localBars, candidate, timeframe, initialCapital, costs, start - contextStart, end - contextStart);
}

function metricsForCandidate(
  bars: HistoricalBar[],
  candidate: StrategyCandidate,
  timeframe: string,
  initialCapital: number,
  costs: BacktestCosts
): { report: WfaBacktestReport; internal: { inSample: InternalRun; validation: InternalRun; outOfSample: InternalRun } } {
  const windows = buildWindows(bars.length);
  const invalidReasons: string[] = [];
  if (bars.length < MIN_BARS) invalidReasons.push(`Dados insuficientes: ${bars.length} candles; mínimo ${MIN_BARS}.`);
  if (windows.length < MIN_WALK_FORWARD_WINDOWS) invalidReasons.push('Não foi possível construir 8 janelas WFA não sobrepostas.');

  const trainRuns: InternalRun[] = [];
  const validationRuns: InternalRun[] = [];
  const testRuns: InternalRun[] = [];
  const windowReports: WfaWindowReport[] = [];

  for (const window of windows) {
    const train = segmentMetrics(bars, candidate, timeframe, initialCapital, costs, window.trainStart, window.trainEnd);
    const validation = segmentMetrics(bars, candidate, timeframe, initialCapital, costs, window.validationStart, window.validationEnd);
    const test = segmentMetrics(bars, candidate, timeframe, initialCapital, costs, window.testStart, window.testEnd);
    trainRuns.push(train);
    validationRuns.push(validation);
    testRuns.push(test);
    windowReports.push({
      window_id: window.windowId,
      train: [bars[window.trainStart].timestamp, bars[window.trainEnd - 1].timestamp],
      validation: [bars[window.validationStart].timestamp, bars[window.validationEnd - 1].timestamp],
      test: [bars[window.testStart].timestamp, bars[window.testEnd - 1].timestamp],
      selected_strategy_id: candidate.strategy_id,
      selected_params: candidate.params,
      train_metrics: train.metrics,
      validation_metrics: validation.metrics,
      test_metrics: test.metrics,
    });
  }

  const inSample = combineRuns(trainRuns, timeframe, initialCapital);
  const validation = combineRuns(validationRuns, timeframe, initialCapital);
  const outOfSample = combineRuns(testRuns, timeframe, initialCapital);
  const oosEfficiency =
    Math.abs(inSample.metrics.total_return) > EPSILON
      ? outOfSample.metrics.total_return / inSample.metrics.total_return
      : 0;
  const lookaheadCheck: 'PASSED' | 'FAILED' = verifyNoLookahead(bars, candidate) ? 'PASSED' : 'FAILED';
  if (lookaheadCheck === 'FAILED') invalidReasons.push('A verificação de histórico fechado detectou dependência futura.');
  const status: WfaBacktestReport['status'] = invalidReasons.length ? 'INVALID_BACKTEST' : 'VALID';
  const firstWindow = windows[0];
  const lastWindow = windows[windows.length - 1];
  const report: WfaBacktestReport = {
    strategy_id: candidate.strategy_id,
    strategy_family: candidate.strategy_family,
    params: candidate.params,
    asset: '',
    timeframe,
    period_train:
      firstWindow && lastWindow
        ? [bars[firstWindow.trainStart].timestamp, bars[lastWindow.trainEnd - 1].timestamp]
        : ['', ''],
    period_test:
      firstWindow && lastWindow
        ? [bars[firstWindow.testStart].timestamp, bars[lastWindow.testEnd - 1].timestamp]
        : ['', ''],
    walk_forward_windows: windows.length,
    n_trades: outOfSample.metrics.n_trades,
    win_rate: outOfSample.metrics.win_rate,
    profit_factor: outOfSample.metrics.profit_factor,
    expectancy: outOfSample.metrics.expectancy,
    sharpe: outOfSample.metrics.sharpe,
    sortino: outOfSample.metrics.sortino,
    calmar: outOfSample.metrics.calmar,
    max_drawdown: outOfSample.metrics.max_drawdown,
    cagr: outOfSample.metrics.cagr,
    metrics_in_sample: inSample.metrics,
    metrics_validation: validation.metrics,
    metrics_out_of_sample: outOfSample.metrics,
    oos_efficiency_ratio: round(oosEfficiency, 6),
    fees_total: outOfSample.metrics.fees_total,
    slippage_total: outOfSample.metrics.slippage_total,
    data_source: 'UNKNOWN',
    data_start: bars[0]?.timestamp || '',
    data_end: bars[bars.length - 1]?.timestamp || '',
    lookahead_check: lookaheadCheck,
    survivorship_check: 'NOT_APPLICABLE',
    reproducibility_hash: hash({ candidate, bars, costs, timeframe, windows }),
    status,
    invalid_reasons: invalidReasons,
    windows: windowReports,
  };
  return { report, internal: { inSample, validation, outOfSample } };
}

export function runWfaBacktest(
  bars: HistoricalBar[],
  candidate: StrategyCandidate,
  timeframe: string,
  initialCapital: number,
  costs: BacktestCosts
): { report: WfaBacktestReport; internal: { inSample: InternalRun; validation: InternalRun; outOfSample: InternalRun } } {
  if (!Array.isArray(bars) || bars.length === 0) {
    const report: WfaBacktestReport = {
      strategy_id: candidate.strategy_id,
      strategy_family: candidate.strategy_family,
      params: candidate.params,
      asset: '',
      timeframe,
      period_train: ['', ''],
      period_test: ['', ''],
      walk_forward_windows: 0,
      n_trades: 0,
      win_rate: 0,
      profit_factor: 0,
      expectancy: 0,
      sharpe: 0,
      sortino: 0,
      calmar: 0,
      max_drawdown: 0,
      cagr: 0,
      metrics_in_sample: emptyMetrics(),
      metrics_validation: emptyMetrics(),
      metrics_out_of_sample: emptyMetrics(),
      oos_efficiency_ratio: 0,
      fees_total: 0,
      slippage_total: 0,
      data_source: 'UNKNOWN',
      data_start: '',
      data_end: '',
      lookahead_check: 'FAILED',
      survivorship_check: 'NOT_APPLICABLE',
      reproducibility_hash: hash({ candidate, timeframe, costs }),
      status: 'NO_DATA',
      invalid_reasons: ['Nenhum candle real foi carregado.'],
      windows: [],
    };
    return { report, internal: { inSample: emptyRun(initialCapital), validation: emptyRun(initialCapital), outOfSample: emptyRun(initialCapital) } };
  }
  const result = metricsForCandidate(bars, candidate, timeframe, initialCapital, costs);
  const monteCarlo = monteCarloConfidence(result.internal.outOfSample);
  result.report.monte_carlo_ci_95_return = monteCarlo.return_ci_95;
  result.report.monte_carlo_ci_95_drawdown = monteCarlo.drawdown_ci_95;
  return result;
}

function emptyRun(initialCapital: number): InternalRun {
  return {
    initialBalance: initialCapital,
    finalBalance: initialCapital,
    equityCurve: [],
    trades: [],
    metrics: emptyMetrics(),
  };
}

class SeededRng {
  private state: number;
  constructor(seed: number) {
    this.state = (seed >>> 0) || 1;
  }
  next(): number {
    // Deterministic LCG; no runtime randomness and the seed is part of the report.
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
}

export function monteCarloConfidence(
  run: InternalRun,
  seeds = [17, 31, 53, 79, 97],
  iterationsPerSeed = 200
): { return_ci_95: [number, number]; drawdown_ci_95: [number, number]; seeds: number[] } {
  if (run.trades.length === 0) {
    return { return_ci_95: [0, 0], drawdown_ci_95: [0, 0], seeds };
  }
  const returns: number[] = [];
  const drawdowns: number[] = [];
  for (const seed of seeds) {
    const rng = new SeededRng(seed);
    for (let iteration = 0; iteration < iterationsPerSeed; iteration += 1) {
      let capital = run.initialBalance;
      let peak = capital;
      let maxDrawdown = 0;
      for (let tradeIndex = 0; tradeIndex < run.trades.length; tradeIndex += 1) {
        const sampled = run.trades[Math.floor(rng.next() * run.trades.length)];
        capital += sampled.netPnl;
        peak = Math.max(peak, capital);
        if (peak > EPSILON) maxDrawdown = Math.max(maxDrawdown, ((peak - capital) / peak) * 100);
      }
      returns.push(((capital / run.initialBalance) - 1) * 100);
      drawdowns.push(maxDrawdown);
    }
  }
  return {
    return_ci_95: [round(quantile(returns, 0.025), 4), round(quantile(returns, 0.975), 4)],
    drawdown_ci_95: [round(quantile(drawdowns, 0.025), 4), round(quantile(drawdowns, 0.975), 4)],
    seeds,
  };
}

function quantile(values: number[], probability: number): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = (ordered.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return ordered[lower];
  return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower);
}

export function candidateGrid(families: WfaStrategyFamily[] = ['trend_following', 'mean_reversion', 'breakout']): StrategyCandidate[] {
  const candidates: StrategyCandidate[] = [];
  if (families.includes('trend_following')) {
    for (const fast of [8, 12, 20]) {
      for (const slow of [30, 50, 80]) {
        if (fast >= slow) continue;
        candidates.push({
          strategy_id: `trend_following_sma_${fast}_${slow}`,
          strategy_family: 'trend_following',
          params: { fast_period: fast, slow_period: slow },
        });
      }
    }
  }
  if (families.includes('mean_reversion')) {
    for (const period of [10, 14, 20]) {
      for (const lower of [25, 30, 35]) {
        const upper = 100 - lower;
        candidates.push({
          strategy_id: `mean_reversion_rsi_${period}_${lower}_${upper}`,
          strategy_family: 'mean_reversion',
          params: { rsi_period: period, lower_rsi: lower, upper_rsi: upper },
        });
      }
    }
  }
  if (families.includes('breakout')) {
    for (const period of [20, 30, 50, 80]) {
      candidates.push({
        strategy_id: `breakout_donchian_${period}`,
        strategy_family: 'breakout',
        params: { breakout_period: period },
      });
    }
  }
  return candidates;
}

function parameterNeighbors(candidate: StrategyCandidate): StrategyCandidate[] {
  const neighbors: StrategyCandidate[] = [];
  for (const [key, value] of Object.entries(candidate.params)) {
    for (const direction of [0.9, 1.1]) {
      const nextValue = Math.max(2, Math.round(value * direction));
      const params = { ...candidate.params, [key]: nextValue };
      if (candidate.strategy_family === 'trend_following' && params.fast_period >= params.slow_period) continue;
      if (candidate.strategy_family === 'mean_reversion' && params.lower_rsi >= params.upper_rsi) continue;
      neighbors.push({
        strategy_id: `${candidate.strategy_id}_sensitivity_${key}_${nextValue}`,
        strategy_family: candidate.strategy_family,
        params,
      });
    }
  }
  return neighbors;
}

function passesStatisticalFilter(report: WfaBacktestReport): string[] {
  const reasons: string[] = [];
  const metrics = report.metrics_out_of_sample;
  if (metrics.n_trades < 30) reasons.push(`Amostra insuficiente: ${metrics.n_trades} trades OOS; mínimo 30.`);
  if (metrics.gross_profit > EPSILON && Math.abs(metrics.best_trade) > metrics.gross_profit * 0.3) {
    reasons.push('Um único trade representa mais de 30% do lucro bruto.');
  }
  return reasons;
}

function candidateScore(report: WfaBacktestReport): number {
  const metrics = report.metrics_out_of_sample;
  const normalizedProfitFactor = Math.min(metrics.profit_factor / 3, 1);
  const drawdownPenalty = Math.min(metrics.max_drawdown / 100, 1);
  return round(
    0.35 * metrics.sharpe +
      0.25 * report.oos_efficiency_ratio +
      0.2 * (1 - drawdownPenalty) +
      0.2 * normalizedProfitFactor,
    6
  );
}

function validationSelectionScore(report: WfaBacktestReport): number {
  // Candidate selection is based on TRAIN/VALIDATION only. OOS is reserved
  // for the final generalization report and promotion gates.
  const metrics = report.metrics_validation;
  const normalizedProfitFactor = Math.min(metrics.profit_factor / 3, 1);
  const drawdownPenalty = Math.min(metrics.max_drawdown / 100, 1);
  return round(
    0.45 * metrics.sharpe +
      0.25 * (1 - drawdownPenalty) +
      0.3 * normalizedProfitFactor,
    6
  );
}

function parameterStability(
  bars: HistoricalBar[],
  candidate: StrategyCandidate,
  timeframe: string,
  initialCapital: number,
  costs: BacktestCosts,
  baseReport: WfaBacktestReport
): 'STABLE' | 'UNSTABLE' {
  const baseReturn = baseReport.metrics_out_of_sample.total_return;
  if (Math.abs(baseReturn) < EPSILON) return 'UNSTABLE';
  for (const neighbor of parameterNeighbors(candidate)) {
    const neighborReport = runWfaBacktest(bars, neighbor, timeframe, initialCapital, costs).report;
    if (neighborReport.status !== 'VALID') return 'UNSTABLE';
    if (neighborReport.metrics_out_of_sample.total_return < baseReturn * 0.5) return 'UNSTABLE';
  }
  return 'STABLE';
}

function attachRobustness(
  report: WfaBacktestReport,
  internal: { outOfSample: InternalRun },
  barsByAsset: Record<string, HistoricalBar[]>,
  candidate: StrategyCandidate,
  timeframe: string,
  initialCapital: number,
  costs: BacktestCosts,
  primaryAsset: string
): WfaBacktestReport {
  const monteCarlo = monteCarloConfidence(internal.outOfSample);
  report.monte_carlo_ci_95_return = monteCarlo.return_ci_95;
  report.monte_carlo_ci_95_drawdown = monteCarlo.drawdown_ci_95;
  report.parameter_stability = parameterStability(
    barsByAsset[primaryAsset],
    candidate,
    timeframe,
    initialCapital,
    costs,
    report
  );

  const otherAssets = Object.entries(barsByAsset).filter(([asset, data]) => asset !== primaryAsset && data.length >= MIN_BARS);
  if (!otherAssets.length) {
    report.cross_asset_validation = 'NOT_TESTED';
  } else {
    const [otherAsset, otherBars] = otherAssets[0];
    const otherReport = runWfaBacktest(otherBars, candidate, timeframe, initialCapital, costs).report;
    report.cross_asset_validation =
      otherReport.status === 'VALID' &&
      otherReport.metrics_out_of_sample.n_trades >= 30 &&
      otherReport.metrics_out_of_sample.profit_factor >= 1
        ? 'PASSED'
        : 'FAILED';
    if (report.cross_asset_validation === 'FAILED') {
      report.invalid_reasons.push(`Validação cross-asset falhou em ${otherAsset}.`);
    }
  }
  return report;
}

export function runTournament(
  barsByAsset: Record<string, HistoricalBar[]>,
  primaryAsset: string,
  timeframe: string,
  initialCapital: number,
  costs: BacktestCosts,
  families: WfaStrategyFamily[] = ['trend_following', 'mean_reversion', 'breakout']
): TournamentResult {
  const bars = barsByAsset[primaryAsset] || [];
  const candidates = candidateGrid(families);
  const summaries: TournamentCandidateSummary[] = [];
  const rejectionReasons: string[] = [];
  let survivedStatFilter = 0;
  let passedWalkForward = 0;
  let passedRobustness = 0;
  let champion: { candidate: StrategyCandidate; report: WfaBacktestReport; score: number } | null = null;

  for (const candidate of candidates) {
    const result = runWfaBacktest(bars, candidate, timeframe, initialCapital, costs);
    const report = result.report;
    const filterReasons = report.status !== 'VALID' ? [...report.invalid_reasons] : passesStatisticalFilter(report);
    if (filterReasons.length) {
      summaries.push({
        strategy_id: candidate.strategy_id,
        strategy_family: candidate.strategy_family,
        params: candidate.params,
        status: 'FILTERED',
        filter_reasons: filterReasons,
        metrics_in_sample: report.metrics_in_sample,
        metrics_out_of_sample: report.metrics_out_of_sample,
        oos_efficiency_ratio: report.oos_efficiency_ratio,
        backtest_hash: report.reproducibility_hash,
      });
      rejectionReasons.push(`${candidate.strategy_id}: ${filterReasons.join(' ')}`);
      continue;
    }
    survivedStatFilter += 1;
    if (report.oos_efficiency_ratio < 0.5) {
      const reason = `${candidate.strategy_id}: OOS efficiency ${report.oos_efficiency_ratio} < 0.5.`;
      rejectionReasons.push(reason);
      summaries.push({
        strategy_id: candidate.strategy_id,
        strategy_family: candidate.strategy_family,
        params: candidate.params,
        status: 'SURVIVED',
        filter_reasons: [reason],
        metrics_in_sample: report.metrics_in_sample,
        metrics_out_of_sample: report.metrics_out_of_sample,
        oos_efficiency_ratio: report.oos_efficiency_ratio,
        backtest_hash: report.reproducibility_hash,
      });
      continue;
    }
    passedWalkForward += 1;
    const robustReport = attachRobustness(report, result.internal, barsByAsset, candidate, timeframe, initialCapital, costs, primaryAsset);
    if (
      robustReport.parameter_stability !== 'STABLE' ||
      robustReport.cross_asset_validation === 'FAILED' ||
      (robustReport.monte_carlo_ci_95_drawdown?.[1] ?? Infinity) > 35
    ) {
      const reason = `${candidate.strategy_id}: teste de robustez falhou (estabilidade=${robustReport.parameter_stability}, cross_asset=${robustReport.cross_asset_validation}).`;
      rejectionReasons.push(reason);
      summaries.push({
        strategy_id: candidate.strategy_id,
        strategy_family: candidate.strategy_family,
        params: candidate.params,
        status: 'PASSED_WALK_FORWARD',
        filter_reasons: [reason],
        metrics_in_sample: robustReport.metrics_in_sample,
        metrics_out_of_sample: robustReport.metrics_out_of_sample,
        oos_efficiency_ratio: robustReport.oos_efficiency_ratio,
        score: candidateScore(robustReport),
        backtest_hash: robustReport.reproducibility_hash,
      });
      continue;
    }
    passedRobustness += 1;
    const score = candidateScore(robustReport);
    const summary: TournamentCandidateSummary = {
      strategy_id: candidate.strategy_id,
      strategy_family: candidate.strategy_family,
      params: candidate.params,
      status: 'PASSED_ROBUSTNESS',
      filter_reasons: [],
      metrics_in_sample: robustReport.metrics_in_sample,
      metrics_out_of_sample: robustReport.metrics_out_of_sample,
      oos_efficiency_ratio: robustReport.oos_efficiency_ratio,
      score,
      backtest_hash: robustReport.reproducibility_hash,
    };
    summaries.push(summary);
    const selectionScore = validationSelectionScore(robustReport);
    if (!champion || selectionScore > champion.score) {
      champion = { candidate, report: robustReport, score: selectionScore };
    }
  }

  const tournamentCore = {
    primaryAsset,
    timeframe,
    initialCapital,
    costs,
    candidates: summaries,
    bars: bars.map((bar) => [bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume]),
  };
  const tournamentId = `tournament-${hash(tournamentCore).slice(0, 16)}`;
  const status = champion ? 'CHAMPION_FOUND' : 'NO_VIABLE_STRATEGY';
  if (!champion) rejectionReasons.push('Nenhuma estratégia passou pelas fases estatísticas, WFA e robustez.');

  return {
    tournament_id: tournamentId,
    candidates_tested: candidates.length,
    candidates_survived_stat_filter: survivedStatFilter,
    candidates_passed_walk_forward: passedWalkForward,
    candidates_passed_robustness: passedRobustness,
    champion_strategy_id: champion?.candidate.strategy_id || '',
    champion_params: champion?.candidate.params || {},
    champion_metrics_in_sample: champion?.report.metrics_in_sample || null,
    champion_metrics_out_of_sample: champion?.report.metrics_out_of_sample || null,
    monte_carlo_ci_95_return: champion?.report.monte_carlo_ci_95_return || null,
    monte_carlo_ci_95_drawdown: champion?.report.monte_carlo_ci_95_drawdown || null,
    parameter_stability: champion?.report.parameter_stability || 'NOT_TESTED',
    cross_asset_validation: champion?.report.cross_asset_validation || 'NOT_TESTED',
    status,
    data_source: 'UNKNOWN',
    data_start: bars[0]?.timestamp || '',
    data_end: bars[bars.length - 1]?.timestamp || '',
    candidates: summaries.sort((a, b) => (b.score || -Infinity) - (a.score || -Infinity)),
    rejection_reasons: rejectionReasons.slice(0, 100),
    reproducibility_hash: hash(tournamentCore),
  };
}

export function getMinimumBars(): number {
  return MIN_BARS;
}
