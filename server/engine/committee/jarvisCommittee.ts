/**
 * jarvisCommittee.ts
 * ---------------------------------------------------------------------------
 * Orquestrador do Comitê JARVIS — JARVIS Trading Hub.
 *
 * Fluxo de cada tick:
 *   1. coleta de mercado (velas 1m, livro L1, Fear & Greed) com fallback sintético;
 *   2. cálculo de indicadores REAIS (RSI/MACD/SMA/ATR/vol) sobre as velas;
 *   3. avaliação dos agentes (SENTINEL-1, VELOCITY-X, NEXUS-DEPTH, ORACLE-FNG
 *      + novos REGIME-GUARD e BULL-BEAR DEBATE);
 *   4. motor de consenso ponderado (score [-1,+1], confiança %);
 *   5. RiskManager ($100, 2%/0.5%, teto $30/ativo, piso $5, 3 perdas, drawdown);
 *   6. auditoria criptográfica SHA-256 append-only.
 *
 * Toda a saída é determinística e a proveniência dos dados é rotulada.
 */

import {
  Candle,
  atr,
  clamp,
  emaLast,
  linearSlope,
  macd,
  mean,
  rsiWilder,
  realizedVolatility,
  round,
  sma,
  stdev,
} from './indicators.js';
import {
  CommitteeEvaluation,
  CommitteeMarketContext,
  RegimeLabel,
  evaluateCommittee,
} from './agents.js';
import { ConsensusResult, resolveConsensus } from './consensus.js';
import {
  PaperPosition,
  RiskManager,
  RiskManagerSnapshot,
} from './riskManager.js';
import {
  CommitteeAuditEvent,
  CommitteeAuditChain,
} from './auditChain.js';
import {
  BookSnapshot,
  FearGreedSnapshot,
  buildSyntheticBook,
  buildSyntheticFearGreed,
  fetchBookLive,
  fetchCandlesLive,
  fetchFearGreedLive,
} from './marketData.js';
import { store } from '../../data/store.js';
import { defaultRagValidator } from '../../validation/rag_validator.js';
import {
  generateSyntheticIndexCandles,
  getSyntheticIndexProfile,
  isSyntheticIndex,
  SyntheticIndexProfile,
} from './syntheticIndices.js';
import { AUDITED_TIMEFRAMES, EXCHANGE_RULES } from '../../regulator/marketRules.js';

// ============================================================================
// Gerador de mercado sintético determinístico (PRNG semeado)
// ============================================================================
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface RegimeSpec {
  label: RegimeLabel;
  drift: number;
  vol: number;
}

const REGIMES: RegimeSpec[] = [
  { label: 'Bull Trend', drift: 0.00045, vol: 0.0006 },
  { label: 'Bear Trend', drift: -0.00045, vol: 0.0006 },
  { label: 'High Volatility', drift: 0, vol: 0.0019 },
  { label: 'Mean Reverting', drift: 0, vol: 0.0008 },
  { label: 'Low Volatility', drift: 0, vol: 0.00025 },
];

class SyntheticMarket {
  private rng: () => number;
  private price: number;
  private regime: RegimeSpec;
  private barsInRegime = 0;
  private regimeDuration: number;
  private volVolatility: number;

  constructor(seed: number, startPrice: number) {
    this.rng = mulberry32(seed);
    this.price = startPrice;
    this.regime = REGIMES[Math.floor(this.rng() * REGIMES.length)];
    this.regimeDuration = 60 + Math.floor(this.rng() * 120);
    this.volVolatility = 0.3 + this.rng() * 0.6;
  }

  private maybeSwitchRegime(): void {
    this.barsInRegime++;
    if (this.barsInRegime >= this.regimeDuration) {
      this.barsInRegime = 0;
      this.regime = REGIMES[Math.floor(this.rng() * REGIMES.length)];
      this.regimeDuration = 60 + Math.floor(this.rng() * 120);
    }
  }

  nextCandle(time: number): Candle {
    this.maybeSwitchRegime();
    const open = this.price;
    // Componente de reversão à média (para o regime Mean Reverting)
    let meanRev = 0;
    if (this.regime.label === 'Mean Reverting') {
      meanRev = (this.rng() - 0.5) * this.regime.vol * 3;
    }
    const shock = this.rng() < 0.01 ? (this.rng() - 0.5) * this.regime.vol * 8 : 0;
    const ret = this.regime.drift + (this.rng() - 0.5) * 2 * this.regime.vol * this.volVolatility + meanRev + shock;

    const close = open * (1 + ret);
    const wick = Math.abs(ret) * (0.4 + this.rng() * 0.6);
    const high = Math.max(open, close) * (1 + wick);
    const low = Math.min(open, close) * (1 - wick);
    const volume = Math.round((1 + this.rng()) * 1000 * (1 + Math.abs(ret) / (this.regime.vol || 0.001) * 0.6));

    this.price = close;
    return { time, open, high, low, close, volume };
  }

  generate(count: number, startTime: number, stepMs: number): Candle[] {
    const out: Candle[] = [];
    let t = startTime;
    for (let i = 0; i < count; i++) {
      out.push(this.nextCandle(t));
      t += stepMs;
    }
    return out;
  }
}

// ============================================================================
// Snapshot público (contrato da API)
// ============================================================================
export interface JarvisIndicatorSnapshot {
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
  sma10: number;
  sma30: number;
  ema12: number;
  ema26: number;
  atr14: number;
  realizedVolatility: number;
  slopeBpsPerBar: number;
  changePct: number;
  rangePosition: number;
  volumeRatio: number;
}

export interface JarvisAgentSnapshot {
  agentId: string;
  name: string;
  role: string;
  baseWeight: number;
  effectiveWeight: number;
  score: number;
  confidence: number;
  side: 'LONG' | 'SHORT' | 'NEUTRAL';
  reason: string;
  evidence: Record<string, number | string>;
}

export interface JarvisAuditSnapshot {
  integrity: boolean;
  totalBlocks: number;
  tail: CommitteeAuditEvent[];
}

export interface JarvisRagSnapshot {
  grounded: boolean;
  hallucinationScore: number;
  verdictGrounded: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
  citations: string[];
  reason: string;
}

export interface JarvisComplianceSnapshot {
  timeframe: string;
  exchange: string;
  auditedTimeframe: boolean;
  acceptedTimeframes: string[];
  lastVetoReason?: string;
}

export interface JarvisSnapshot {
  timestamp: string;
  symbol: string;
  price: number;
  dataSource: 'live' | 'synthetic' | 'mixed';
  isRunning: boolean;
  regime: RegimeLabel;
  regimeConfidence: number;
  candlesCount: number;
  indicators: JarvisIndicatorSnapshot;
  agents: JarvisAgentSnapshot[];
  consensus: ConsensusResult;
  debate: { bullPressure: number; bearPressure: number; dispute: boolean; reason: string };
  risk: RiskManagerSnapshot;
  validation: JarvisRagSnapshot;
  compliance: JarvisComplianceSnapshot;
  audit: JarvisAuditSnapshot;
  autoTradeEnabled: boolean;
  deskMode: boolean;
}

export interface JarvisBacktestResult {
  symbol: string;
  bars: number;
  days: number;
  dataSource: 'synthetic';
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  initialBalance: number;
  finalBalance: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  buySignals: number;
  sellSignals: number;
  holdSignals: number;
  equityCurve: { index: number; time: string; balance: number }[];
}

// ============================================================================
// Serviço
// ============================================================================
export class JarvisCommitteeService {
  private symbol = 'BTC/USDT';
  private candles: Candle[] = [];
  private synthetic: SyntheticMarket | null = null;
  private indexProfile: SyntheticIndexProfile | null = null;
  private indexRng: (() => number) | null = null;
  private indexPrice = 0;
  private dataSource: 'live' | 'synthetic' | 'mixed' = 'synthetic';
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private autoTradeEnabled = true;
  private readonly audit = new CommitteeAuditChain();
  private readonly risk = new RiskManager(this.audit);
  private readonly maxCandles = 500;
  private lastLiveRefresh = 0;
  private readonly liveRefreshIntervalMs = 5 * 60 * 1000;

  // ------------------------------------------------------------------
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.audit.append({ type: 'CONFIG', detail: `Comitê JARVIS iniciado em ${this.symbol} (modo ${this.dataSource}).` });

    this.seed();
    this.evaluate();

    this.timer = setInterval(() => this.tick(), 5000);
    console.log('🏛️ [JARVIS] Comitê multi-agente iniciado (tick 5s, fallback sintético determinístico).');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.audit.append({ type: 'CONFIG', detail: 'Comitê JARVIS pausado.' });
  }

  toggle(): boolean {
    if (this.isRunning) this.stop();
    else this.start();
    return this.isRunning;
  }

  get running(): boolean {
    return this.isRunning;
  }

  setSymbol(symbol: string): void {
    if (symbol === this.symbol) return;
    this.symbol = symbol;
    this.dataSource = 'synthetic';
    this.seed();
    this.audit.append({ type: 'CONFIG', detail: `Ativo do comitê alterado para ${symbol}.` });
    this.evaluate();
  }

  setAutoTrade(enabled: boolean): void {
    this.autoTradeEnabled = enabled;
    this.audit.append({ type: 'CONFIG', detail: `Auto-trade do comitê ${enabled ? 'ativado' : 'desativado'}.` });
  }

  setScalperMode(enabled: boolean): void {
    this.risk.scalperMode = enabled;
    this.audit.append({
      type: 'CONFIG',
      detail: `Modo Scalpers ${enabled ? 'ativado (risco 0.5% = $0.50)' : 'desativado (risco 2% = $2.00)'}.`,
    });
  }

  releaseRiskLock(): void {
    this.risk.releaseLock();
  }

  setDeskMode(enabled: boolean): void {
    this.risk.deskMode = enabled;
    this.audit.append({
      type: 'CONFIG',
      detail: `Mesa ALICE (Trading-as-Git) ${enabled ? 'ativada — operações exigem aprovação humana' : 'desativada — execução direta'}.`,
    });
  }

  approveOperation(id: string): JarvisSnapshot {
    const res = this.risk.approveOperation(id);
    if (res.success) this.recordOrder();
    return this.getSnapshot();
  }

  rejectOperation(id: string): JarvisSnapshot {
    this.risk.rejectOperation(id);
    return this.getSnapshot();
  }

  // ------------------------------------------------------------------
  private anchorPrice(): number {
    const ticker = store.getState().tickers[this.symbol];
    if (ticker && ticker.price > 0) return ticker.price;
    const idx = getSyntheticIndexProfile(this.symbol);
    if (idx) return idx.basePrice;
    const fallback: Record<string, number> = {
      'BTC/USDT': 64250,
      'ETH/USDT': 3450,
      'SOL/USDT': 154.8,
      'BTC/BRL': 345000,
      'ETH/BRL': 18500,
      'SOL/BRL': 830,
    };
    return fallback[this.symbol] ?? 100;
  }

  private seed(): void {
    const seed = hashString(this.symbol) ^ 0x9e3779b9;
    const now = Date.now();
    const count = 360;
    const startTime = now - count * 60_000;

    const idx = getSyntheticIndexProfile(this.symbol);
    if (idx) {
      // Índice sintético: gerador próprio (perfil Deriv-style, rotulado)
      this.indexProfile = idx;
      this.indexRng = mulberry32(seed + 777);
      this.candles = generateSyntheticIndexCandles(idx, count, startTime, this.indexRng);
      this.indexPrice = this.candles.length ? this.candles[this.candles.length - 1].close : idx.basePrice;
      this.synthetic = null;
    } else {
      const startPrice = this.anchorPrice();
      const rng = mulberry32(seed);
      this.synthetic = new SyntheticMarket(seed + 1, startPrice * (1 - 0.02 * (rng() - 0.5)));
      this.candles = this.synthetic.generate(count, startTime, 60_000);
      this.indexProfile = null;
      this.indexRng = null;
    }

    this.dataSource = 'synthetic';
    this.lastLiveRefresh = 0;

    // Tenta seed live (best-effort, não bloqueante) apenas para ativos reais
    if (!idx) this.tryLiveRefresh().then(() => this.evaluate());
  }

  private nextIndexCandle(time: number): Candle | null {
    const p = this.indexProfile;
    const rng = this.indexRng;
    if (!p || !rng) return null;

    let cycleMod = 1;
    if (p.cyclePeriod > 0) {
      const phase = Math.sin((this.candles.length / p.cyclePeriod) * Math.PI * 2);
      cycleMod = 1 + phase * 0.8;
    }
    let jump = 0;
    if (rng() < p.jumpProb) {
      const dir = p.jumpBias === 0 ? (rng() > 0.5 ? 1 : -1) : p.jumpBias;
      jump = dir * p.jumpMagnitude * p.vol;
    }
    const ret = p.drift + (rng() - 0.5) * 2 * p.vol * cycleMod + jump;
    const open = this.indexPrice;
    const close = open * (1 + ret);
    const wick = Math.abs(ret) * (0.3 + rng() * 0.6);
    const candle: Candle = {
      time,
      open,
      high: Math.max(open, close) * (1 + wick),
      low: Math.min(open, close) * (1 - wick),
      close,
      volume: Math.round((1 + rng()) * 1000),
    };
    this.indexPrice = close;
    return candle;
  }

  private async tryLiveRefresh(): Promise<void> {
    if (Date.now() - this.lastLiveRefresh < this.liveRefreshIntervalMs) return;
    this.lastLiveRefresh = Date.now();

    const [candles, book, fng] = await Promise.all([
      fetchCandlesLive(this.symbol, 60),
      fetchBookLive(this.symbol),
      fetchFearGreedLive(),
    ]);

    if (candles && candles.length >= 40) {
      // Mantém a continuidade: usa as velas reais como base
      this.candles = candles.slice(-this.maxCandles);
      this.dataSource = 'live';
    }
    if (book) this.liveBook = book;
    if (fng) this.liveFng = fng;

    if (this.candles.length > 0) this.evaluate();
  }

  private liveBook: BookSnapshot | null = null;
  private liveFng: FearGreedSnapshot | null = null;

  // ------------------------------------------------------------------
  private advanceMarket(): void {
    const last = this.candles[this.candles.length - 1];
    const nextTime = (last ? last.time : Date.now()) + 60_000;
    if (this.synthetic) {
      const candle = this.synthetic.nextCandle(nextTime);
      this.candles.push(candle);
    } else if (this.indexProfile) {
      const candle = this.nextIndexCandle(nextTime);
      if (candle) this.candles.push(candle);
    } else {
      // Fallback: deriva do último fecho
      const price = last?.close ?? this.anchorPrice();
      const open = price;
      const close = price * (1 + (Math.random() - 0.5) * 0.001);
      this.candles.push({
        time: nextTime,
        open,
        high: Math.max(open, close) * 1.0005,
        low: Math.min(open, close) * 0.9995,
        close,
        volume: 1000,
      });
    }
    if (this.dataSource === 'live') this.dataSource = 'mixed';
    if (this.candles.length > this.maxCandles) this.candles.splice(0, this.candles.length - this.maxCandles);
  }

  // ------------------------------------------------------------------
  private buildContext(): CommitteeMarketContext {
    const closes = this.candles.map((c) => c.close);
    const price = closes[closes.length - 1] ?? this.anchorPrice();

    const rsi14 = rsiWilder(closes, 14);
    const macdResult = macd(closes, 12, 26, 9);
    const sma10 = sma(closes, 10) ?? price;
    const sma30 = sma(closes, 30) ?? price;
    const atr14 = atr(this.candles, 14);
    const slope = linearSlope(closes.slice(-60));
    const realizedVol = realizedVolatility(closes.slice(-240));

    // Janela de 240 velas como proxy do "dia" (range intradiário)
    const window = this.candles.slice(-240);
    const highWin = Math.max(...window.map((c) => c.high));
    const lowWin = Math.min(...window.map((c) => c.low));
    const rangePosition = highWin - lowWin > 0 ? (price - lowWin) / (highWin - lowWin) : 0.5;

    const firstClose = window[0]?.close ?? price;
    const changePct = firstClose > 0 ? ((price - firstClose) / firstClose) * 100 : 0;

    const volume24h = window.reduce((a, c) => a + c.volume, 0);
    const avgVolume = mean(this.candles.slice(-60).map((c) => c.volume)) || 1;
    const volumeRatio = avgVolume > 0 ? volume24h / (avgVolume * 240) : 1;

    // Livro L1 e Fear & Greed (live com fallback sintético)
    const trendBias = clamp(slope / (price * 0.001 || 1), -1, 1);
    const book: BookSnapshot =
      this.liveBook && Date.now() - this.lastLiveRefresh < 2 * this.liveRefreshIntervalMs
        ? this.liveBook
        : buildSyntheticBook(price, realizedVol, trendBias);

    const fng: FearGreedSnapshot =
      this.liveFng && Date.now() - this.lastLiveRefresh < 2 * this.liveRefreshIntervalMs
        ? this.liveFng
        : buildSyntheticFearGreed(changePct, rsi14);

    return {
      symbol: this.symbol,
      price,
      change24h: changePct,
      high24h: highWin,
      low24h: lowWin,
      volume24h,
      avgVolume,
      dataSource: this.dataSource,
      candles: this.candles,
      indicators: {
        rsi14,
        macdLine: macdResult.macd,
        macdSignal: macdResult.signal,
        macdHist: macdResult.hist,
        macdPrevHist: macdResult.prevHist,
        sma10,
        sma30,
        atr14,
        slope,
        realizedVol,
        rangePosition: clamp(rangePosition, 0, 1),
        volumeRatio,
      },
      book,
      fearGreed: fng,
    };
  }

  // ------------------------------------------------------------------
  private evaluate(): JarvisSnapshot {
    if (this.candles.length < 40) {
      this.seed();
    }

    const ctx = this.buildContext();

    // --- RAG GATE ANTI-ALUCINAÇÃO (dados de mercado) ---
    const prevClose = ctx.candles.length > 1 ? ctx.candles[ctx.candles.length - 2].close : undefined;
    const rag = defaultRagValidator.validate({
      symbol: ctx.symbol,
      close: ctx.price,
      volume: ctx.volume24h,
      provider: ctx.dataSource === 'synthetic' ? 'synthetic_engine' : `market_feed:${ctx.dataSource}`,
      source: ctx.dataSource === 'synthetic' ? 'synthetic_engine' : `market_feed:${ctx.dataSource}`,
      timestamp: Date.now() / 1000,
      prevClose,
      timeframe: '1m',
    });

    const evaluation: CommitteeEvaluation = evaluateCommittee(ctx);
    let consensus = resolveConsensus(evaluation.votes, evaluation.regime, evaluation.debate);

    // Se o dado de mercado não estiver fundamentado, o veredito é forçado a HOLD
    // (o sinal não pode ser executado sem evidência) e auditado como RAG_VETO.
    if (!rag.grounded) {
      consensus = { ...consensus, verdict: 'HOLD', side: 'NEUTRAL', confidence: round(consensus.confidence * 0.3, 4) };
      this.audit.append({
        type: 'RAG_VETO',
        symbol: ctx.symbol,
        score: round(consensus.score, 4),
        confidence: round(consensus.confidence, 4),
        detail: `RAG_VETO: dados não fundamentados (score ${(rag.hallucinationScore * 100).toFixed(0)}%) — ${rag.reason}`,
      });
    }

    // --- CONFORMIDADE DE CORRETORA (timeframes aceitos + limites) ---
    const exchange = this.detectExchange(ctx.symbol);
    const timeframe = '1m';
    const complianceOk = this.complianceCanTrade(ctx.symbol, exchange);
    const compliance: JarvisComplianceSnapshot = {
      timeframe,
      exchange,
      auditedTimeframe: AUDITED_TIMEFRAMES.includes(timeframe),
      acceptedTimeframes: AUDITED_TIMEFRAMES,
      lastVetoReason: complianceOk ? undefined : this.lastComplianceVeto,
    };

    // Fecha posições em TP/SL contra o preço corrente
    this.risk.updatePositions(ctx.price);

    // Auto-trade: abre (ou stage na mesa ALICE) se comitê decidir e tudo permitir
    const alreadyOpen = this.risk.getOpenPositions().some((p) => p.symbol === this.symbol);
    const alreadyStaged = this.risk
      .getStagedOperations()
      .some((o) => o.symbol === this.symbol && o.status === 'STAGED');

    if (
      this.autoTradeEnabled &&
      rag.grounded &&
      complianceOk &&
      consensus.verdict !== 'HOLD' &&
      !alreadyOpen &&
      !alreadyStaged
    ) {
      const side = consensus.side === 'LONG' ? 'LONG' : 'SHORT';
      if (this.risk.deskMode) {
        this.risk.stageOperation(this.symbol, side, ctx.price, ctx.indicators.atr14, consensus.score, consensus.confidence, 2.0);
      } else {
        const opened = this.risk.openPosition(this.symbol, side, ctx.price, ctx.indicators.atr14, consensus.score, consensus.confidence, 2.0);
        if (opened.success) this.recordOrder();
      }
    } else if (complianceOk) {
      this.lastComplianceVeto = '';
    }

    const agents: JarvisAgentSnapshot[] = evaluation.votes.map((v) => ({
      agentId: v.agentId,
      name: v.name,
      role: v.role,
      baseWeight: v.baseWeight,
      effectiveWeight: consensus.effectiveWeights[v.agentId] ?? 0,
      score: v.score,
      confidence: v.confidence,
      side: v.side,
      reason: v.reason,
      evidence: v.evidence,
    }));

    const snapshot: JarvisSnapshot = {
      timestamp: new Date().toISOString(),
      symbol: this.symbol,
      price: round(ctx.price, 2),
      dataSource: this.dataSource,
      isRunning: this.isRunning,
      regime: evaluation.regime.label,
      regimeConfidence: evaluation.regime.confidence,
      candlesCount: this.candles.length,
      indicators: {
        rsi14: round(ctx.indicators.rsi14, 2),
        macdLine: round(ctx.indicators.macdLine, 6),
        macdSignal: round(ctx.indicators.macdSignal, 6),
        macdHist: round(ctx.indicators.macdHist, 6),
        sma10: round(ctx.indicators.sma10, 2),
        sma30: round(ctx.indicators.sma30, 2),
        ema12: round(emaLast(closes(ctx), 12), 2),
        ema26: round(emaLast(closes(ctx), 26), 2),
        atr14: round(ctx.indicators.atr14, 4),
        realizedVolatility: round(ctx.indicators.realizedVol, 2),
        slopeBpsPerBar: round((ctx.indicators.slope / (ctx.price || 1)) * 10000, 4),
        changePct: round(ctx.change24h, 2),
        rangePosition: round(ctx.indicators.rangePosition, 3),
        volumeRatio: round(ctx.indicators.volumeRatio, 2),
      },
      agents,
      consensus,
      debate: {
        bullPressure: evaluation.debate.bullPressure,
        bearPressure: evaluation.debate.bearPressure,
        dispute: evaluation.debate.dispute,
        reason: evaluation.debate.reason,
      },
      risk: this.risk.snapshot(),
      validation: {
        grounded: rag.grounded,
        hallucinationScore: rag.hallucinationScore,
        verdictGrounded: rag.grounded && consensus.verdict !== 'HOLD',
        checks: rag.checks,
        citations: rag.citations,
        reason: rag.reason,
      },
      compliance,
      audit: {
        integrity: this.audit.verifyIntegrity(),
        totalBlocks: this.audit.getChain().length,
        tail: this.audit.tail(12),
      },
      autoTradeEnabled: this.autoTradeEnabled,
      deskMode: this.risk.deskMode,
    };

    return snapshot;
  }

  // ------------------------------------------------------------------
  // Conformidade de corretora (timeframes aceitos + rate limit por exchange)
  // ------------------------------------------------------------------
  private lastOrderAt = 0;
  private lastComplianceVeto = '';

  private detectExchange(symbol: string): string {
    if (isSyntheticIndex(symbol)) return 'CRYPTO';
    if (symbol.includes('BRL')) return 'B3';
    if (symbol.includes('USDT') || symbol.includes('USD') || symbol.includes('SOL') || symbol.includes('ETH') || symbol.includes('BTC')) return 'BINANCE';
    return 'NASDAQ';
  }

  private complianceCanTrade(symbol: string, exchange: string): boolean {
    const rules = EXCHANGE_RULES[exchange];
    if (!rules) {
      this.lastComplianceVeto = `Exchange ${exchange} sem regras cadastradas.`;
      return false;
    }
    const now = Date.now() / 1000;
    if (this.lastOrderAt && now - this.lastOrderAt < rules.minIntervalBetweenOrdersSec) {
      this.lastComplianceVeto = `Intervalo mínimo entre ordens (${rules.minIntervalBetweenOrdersSec}s) não atingido.`;
      return false;
    }
    // Só permite nova entrada no fechamento do timeframe auditado de 1m
    const sec = now % 60;
    if (sec > 5) {
      this.lastComplianceVeto = `Aguardando fechamento do candle 1m (${(60 - sec).toFixed(0)}s).`;
      return false;
    }
    return true;
  }

  private recordOrder(): void {
    this.lastOrderAt = Date.now() / 1000;
  }

  private tick(): void {
    this.advanceMarket();
    if (Date.now() - this.lastLiveRefresh > this.liveRefreshIntervalMs) {
      this.tryLiveRefresh();
    }
    this.evaluate();
  }

  public evaluateNow(): JarvisSnapshot {
    if (!this.isRunning && this.candles.length === 0) this.seed();
    this.advanceMarket();
    return this.evaluate();
  }

  public getSnapshot(): JarvisSnapshot {
    // Sempre reavalia para refletir o estado mais recente (config, risco, auditoria)
    return this.evaluate();
  }

  // ------------------------------------------------------------------
  // Backtest determinístico do comitê (dados sintéticos, rotulados)
  // ------------------------------------------------------------------
  public runBacktest(days = 14): JarvisBacktestResult {
    const requested = Math.max(1, Math.min(days, 60));
    const bars = requested * 1440;
    const seed = hashString(this.symbol) ^ 0x51ab3c;
    const market = new SyntheticMarket(seed, this.anchorPrice());
    const audit = new CommitteeAuditChain();
    const risk = new RiskManager(audit);

    const window: Candle[] = [];
    let buySignals = 0;
    let sellSignals = 0;
    let holdSignals = 0;
    const trades: PaperPosition[] = [];
    const equityCurve: { index: number; time: string; balance: number }[] = [];

    const startTime = Date.now() - bars * 60_000;
    let prevBalance = risk.balance;

    const evaluateBar = (candles: Candle[], price: number): ConsensusResult => {
      const closes = candles.map((c) => c.close);
      const rsi = rsiWilder(closes, 14);
      const m = macd(closes, 12, 26, 9);
      const s10 = sma(closes, 10) ?? price;
      const s30 = sma(closes, 30) ?? price;
      const a = atr(candles, 14);
      const slope = linearSlope(closes.slice(-60));
      const vol = realizedVolatility(closes.slice(-240));
      const win = candles.slice(-240);
      const hi = Math.max(...win.map((c) => c.high));
      const lo = Math.min(...win.map((c) => c.low));
      const rangePos = hi - lo > 0 ? (price - lo) / (hi - lo) : 0.5;
      const first = win[0]?.close ?? price;
      const change = first > 0 ? ((price - first) / first) * 100 : 0;
      const avgVol = mean(candles.slice(-60).map((c) => c.volume)) || 1;
      const volRatio = win.reduce((x, c) => x + c.volume, 0) / (avgVol * 240);

      const ctx: CommitteeMarketContext = {
        symbol: this.symbol,
        price,
        change24h: change,
        high24h: hi,
        low24h: lo,
        volume24h: win.reduce((x, c) => x + c.volume, 0),
        avgVolume: avgVol,
        dataSource: 'synthetic',
        candles,
        indicators: {
          rsi14: rsi,
          macdLine: m.macd,
          macdSignal: m.signal,
          macdHist: m.hist,
          macdPrevHist: m.prevHist,
          sma10: s10,
          sma30: s30,
          atr14: a,
          slope,
          realizedVol: vol,
          rangePosition: clamp(rangePos, 0, 1),
          volumeRatio: volRatio,
        },
        book: buildSyntheticBook(price, vol, clamp(slope / (price * 0.001 || 1), -1, 1)),
        fearGreed: buildSyntheticFearGreed(change, rsi),
      };
      const evalRes = evaluateCommittee(ctx);
      return resolveConsensus(evalRes.votes, evalRes.regime, evalRes.debate);
    };

    for (let i = 0; i < bars; i++) {
      const candle = market.nextCandle(startTime + i * 60_000);
      window.push(candle);
      if (window.length > 400) window.shift();
      if (window.length < 40) continue;

      const price = candle.close;
      const consensus = evaluateBar(window, price);

      if (consensus.verdict === 'BUY') buySignals++;
      else if (consensus.verdict === 'SELL') sellSignals++;
      else holdSignals++;

      const closedNow = risk.updatePositions(price);
      for (const closed of closedNow) trades.push(closed);

      if (
        consensus.verdict !== 'HOLD' &&
        risk.getOpenPositions().length === 0
      ) {
        risk.openPosition(
          this.symbol,
          consensus.side === 'LONG' ? 'LONG' : 'SHORT',
          price,
          atr(window, 14),
          consensus.score,
          consensus.confidence,
          2.0
        );
      }

      if (i % 240 === 0 || risk.balance !== prevBalance) {
        equityCurve.push({
          index: i,
          time: new Date(candle.time).toISOString(),
          balance: round(risk.balance, 2),
        });
        prevBalance = risk.balance;
      }
    }

    const wins = trades.filter((t) => t.pnl > 0).length;
    const losses = trades.filter((t) => t.pnl <= 0).length;
    const totalPnl = round(risk.balance - risk.initialBalance, 2);

    // Sharpe a partir dos retornos de equity amostrados
    const equityReturns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const prev = equityCurve[i - 1].balance;
      if (prev > 0) equityReturns.push((equityCurve[i].balance - prev) / prev);
    }
    const sharpe =
      equityReturns.length > 2
        ? (mean(equityReturns) / (stdev(equityReturns) || 1e-9)) * Math.sqrt(equityCurve.length)
        : 0;

    // Max drawdown
    let peak = risk.initialBalance;
    let maxDD = 0;
    for (const point of equityCurve) {
      if (point.balance > peak) peak = point.balance;
      if (peak > 0) maxDD = Math.max(maxDD, ((peak - point.balance) / peak) * 100);
    }

    return {
      symbol: this.symbol,
      bars,
      days: requested,
      dataSource: 'synthetic',
      totalTrades: trades.length,
      wins,
      losses,
      winRate: trades.length ? round((wins / trades.length) * 100, 2) : 0,
      initialBalance: risk.initialBalance,
      finalBalance: round(risk.balance, 2),
      totalPnl,
      totalPnlPct: round((totalPnl / risk.initialBalance) * 100, 2),
      maxDrawdownPct: round(maxDD, 2),
      sharpeRatio: round(sharpe, 3),
      buySignals,
      sellSignals,
      holdSignals,
      equityCurve,
    };
  }
}

function closes(ctx: CommitteeMarketContext): number[] {
  return ctx.candles.map((c) => c.close);
}

export const jarvisCommitteeService = new JarvisCommitteeService();
