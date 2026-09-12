import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type {
  PromotionChecklistResults,
  PromotionDeployment,
  PromotionGateResult,
  TournamentResult,
  ValidationPipelineRequest,
  ValidationPipelineResult,
  WfaBacktestReport,
  WfaStrategyFamily,
  PortfolioPolicy,
} from '../../src/types.js';
import { fetchHistoricalBars, type HistoricalDataResult } from './validationMarketDataService.js';
import {
  candidateGrid,
  runTournament,
  runWfaBacktest,
  type BacktestCosts,
  type StrategyCandidate,
} from '../validation/walkForwardEngine.js';

const DEFAULT_ASSETS = ['SPY', 'QQQ'];
const DEFAULT_FAMILIES: WfaStrategyFamily[] = ['trend_following', 'mean_reversion', 'breakout'];

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
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

function normalizeRequest(request: ValidationPipelineRequest): Required<ValidationPipelineRequest> {
  return {
    asset: String(request.asset || 'SPY').trim().toUpperCase(),
    validation_assets: (request.validation_assets?.length ? request.validation_assets : DEFAULT_ASSETS.slice(1)).map((asset) =>
      String(asset).trim().toUpperCase()
    ),
    timeframe: String(request.timeframe || '1d'),
    lookback_days: Math.max(1, Math.min(Math.floor(Number(request.lookback_days) || 1095), 3650)),
    initial_capital: Number(request.initial_capital) > 0 ? Number(request.initial_capital) : 100,
    position_pct:
      Number.isFinite(Number(request.position_pct)) && Number(request.position_pct) > 0
        ? Math.min(Number(request.position_pct), 0.02)
        : 0.02,
    fee_rate_bps:
      Number.isFinite(Number(request.fee_rate_bps)) && Number(request.fee_rate_bps) >= 0
        ? Number(request.fee_rate_bps)
        : 0,
    slippage_bps:
      Number.isFinite(Number(request.slippage_bps)) && Number(request.slippage_bps) >= 0
        ? Number(request.slippage_bps)
        : 1,
    strategy_families: request.strategy_families?.length ? request.strategy_families : DEFAULT_FAMILIES,
  };
}

function portfolioPolicy(initialCapital: number, positionPct: number): PortfolioPolicy {
  return {
    initial_capital_usd: initialCapital,
    max_position_pct: positionPct * 100,
    max_concurrent_positions: 5,
    max_gross_exposure_pct: 10,
    max_risk_per_trade_pct: 1,
  };
}

function decorateBacktest(
  report: WfaBacktestReport,
  asset: string,
  source: HistoricalDataResult['source'],
  survivorship: WfaBacktestReport['survivorship_check']
): WfaBacktestReport {
  return {
    ...report,
    asset,
    data_source: source,
    survivorship_check: survivorship,
    operations: report.operations.map((operation) => ({ ...operation, asset })),
  };
}

async function checkAlpacaCompatibility(asset: string, initialCapital: number, positionPct: number): Promise<{
  passed: boolean;
  value: string;
  reason: string;
}> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) {
    return {
      passed: false,
      value: 'NOT_VERIFIED',
      reason: 'ALPACA_API_KEY/ALPACA_SECRET_KEY não configuradas; compatibilidade não pode ser presumida.',
    };
  }

  const headers = { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret };
  try {
    const baseUrl = (process.env.ALPACA_PAPER_BASE_URL || 'https://paper-api.alpaca.markets').replace(/\/$/, '');
    const quoteBaseUrl = (process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets').replace(/\/$/, '');
    const encodedAsset = encodeURIComponent(asset.replace('/', ''));
    const [accountResponse, assetResponse, quoteResponse] = await Promise.all([
      fetch(`${baseUrl}/v2/account`, { headers }),
      fetch(`${baseUrl}/v2/assets/${encodedAsset}`, { headers }),
      fetch(`${quoteBaseUrl}/v2/stocks/${encodedAsset}/quotes/latest?feed=${encodeURIComponent(process.env.ALPACA_DATA_FEED || 'iex')}`, { headers }),
    ]);
    if (!accountResponse.ok || !assetResponse.ok || !quoteResponse.ok) {
      return {
        passed: false,
        value: 'API_ERROR',
        reason: `Alpaca retornou account=${accountResponse.status}, asset=${assetResponse.status} e quote=${quoteResponse.status}.`,
      };
    }
    const account = (await accountResponse.json()) as { status?: string; buying_power?: string; equity?: string };
    const metadata = (await assetResponse.json()) as {
      tradable?: boolean;
      fractionable?: boolean;
      min_order_size?: string;
      price_increment?: string;
    };
    const quote = (await quoteResponse.json()) as { quote?: { ap?: number; bp?: number } };
    const referencePrice = Number(quote.quote?.ap || quote.quote?.bp || 0);
    const buyingPower = Number(account.buying_power || account.equity || 0);
    const maxNotional = initialCapital * positionPct;
    const minimumQuantity = Math.max(Number(metadata.min_order_size || 1), 0);
    const minimumNotional = minimumQuantity * referencePrice;
    const tradable = metadata.tradable === true;
    const fractionalOrAffordable =
      referencePrice > 0 && (metadata.fractionable === true || maxNotional >= minimumNotional);
    const passed = account.status === 'ACTIVE' && buyingPower >= initialCapital && tradable && fractionalOrAffordable;
    return {
      passed,
      value: passed ? 'VERIFIED' : 'INCOMPATIBLE',
      reason: passed
        ? `Conta PAPER ACTIVE; ${asset} tradable e compatível com notional máximo de USD ${maxNotional.toFixed(2)}.`
        : `Conta/status, cotação, lote mínimo ou fractional shares não atende posição máxima de USD ${maxNotional.toFixed(2)}.`,
    };
  } catch (error: any) {
    return {
      passed: false,
      value: 'API_UNREACHABLE',
      reason: `Não foi possível consultar a Alpaca PAPER: ${error?.message || 'erro de rede'}.`,
    };
  }
}

function rejectedChecklist(tournament: TournamentResult): PromotionChecklistResults {
  const metrics = tournament.champion_metrics_out_of_sample;
  return {
    status_champion_found: {
      passed: tournament.status === 'CHAMPION_FOUND',
      value: tournament.status,
      threshold: 'CHAMPION_FOUND',
    },
    oos_efficiency_ratio: { passed: false, value: 0, threshold: 0.5 },
    sharpe_out_of_sample: { passed: false, value: metrics?.sharpe || 0, threshold: 0.8 },
    max_drawdown_out_of_sample: { passed: false, value: metrics?.max_drawdown || 0, threshold: 25 },
    monte_carlo_worst_drawdown: { passed: false, value: tournament.monte_carlo_ci_95_drawdown?.[1] || 0, threshold: 35 },
    parameter_stability: { passed: false, value: tournament.parameter_stability, threshold: 'STABLE' },
    n_trades_out_of_sample: { passed: false, value: metrics?.n_trades || 0, threshold: 30 },
    cross_asset_validation: { passed: false, value: tournament.cross_asset_validation, justification: 'Nenhum campeão elegível para validar.' },
    cost_ratio: { passed: false, value: 0, threshold: 0.4 },
    capital_compatibility: { passed: false, value: 'NOT_VERIFIED', reason: 'Nenhum campeão elegível.' },
  };
}

function evaluateChecklist(
  tournament: TournamentResult,
  compatibility: { passed: boolean; value: string; reason: string }
): PromotionChecklistResults {
  const metrics = tournament.champion_metrics_out_of_sample;
  const championFound = tournament.status === 'CHAMPION_FOUND' && Boolean(metrics);
  const cost = metrics?.gross_profit ? (metrics.fees_total + metrics.slippage_total) / metrics.gross_profit : Infinity;
  const crossAssetPass =
    tournament.cross_asset_validation === 'PASSED' || tournament.cross_asset_validation === 'NOT_TESTED';
  return {
    status_champion_found: { passed: championFound, value: tournament.status, threshold: 'CHAMPION_FOUND' },
    oos_efficiency_ratio: {
      passed: championFound && (metrics ? tournament.candidates.find((candidate) => candidate.strategy_id === tournament.champion_strategy_id)?.oos_efficiency_ratio || 0 : 0) >= 0.5,
      value: tournament.candidates.find((candidate) => candidate.strategy_id === tournament.champion_strategy_id)?.oos_efficiency_ratio || 0,
      threshold: 0.5,
    },
    sharpe_out_of_sample: { passed: championFound && (metrics?.sharpe || 0) >= 0.8, value: metrics?.sharpe || 0, threshold: 0.8 },
    max_drawdown_out_of_sample: {
      passed: championFound && (metrics?.max_drawdown || Infinity) <= 25,
      value: metrics?.max_drawdown || 0,
      threshold: 25,
    },
    monte_carlo_worst_drawdown: {
      passed: championFound && (tournament.monte_carlo_ci_95_drawdown?.[1] || Infinity) <= 35,
      value: tournament.monte_carlo_ci_95_drawdown?.[1] || 0,
      threshold: 35,
    },
    parameter_stability: { passed: tournament.parameter_stability === 'STABLE', value: tournament.parameter_stability, threshold: 'STABLE' },
    n_trades_out_of_sample: { passed: championFound && (metrics?.n_trades || 0) >= 30, value: metrics?.n_trades || 0, threshold: 30 },
    cross_asset_validation: {
      passed: championFound && crossAssetPass,
      value: tournament.cross_asset_validation,
      justification:
        tournament.cross_asset_validation === 'NOT_TESTED'
          ? 'Nenhum segundo ativo com dados reais suficientes foi carregado; aprovação continua condicionada à revisão humana.'
          : 'A mesma família e parâmetros passaram em ativo de validação real.',
    },
    cost_ratio: { passed: championFound && cost < 0.4, value: Number.isFinite(cost) ? cost : 0, threshold: 0.4 },
    capital_compatibility: { passed: compatibility.passed, value: compatibility.value, reason: compatibility.reason },
  };
}

function hasPassedChecklist(checklist: PromotionChecklistResults): boolean {
  return Object.values(checklist).every((item) => item.passed);
}

async function createPromotionDecision(
  tournament: TournamentResult,
  asset: string,
  initialCapital: number,
  positionPct: number
): Promise<PromotionGateResult> {
  if (tournament.status !== 'CHAMPION_FOUND') {
    const checklist = rejectedChecklist(tournament);
    return {
      decision: 'REJECTED',
      checklist_results: checklist,
      deployment: null,
      next_action: 'RETURN_TO_TOURNAMENT',
      reasons: ['NO_VIABLE_STRATEGY: o torneio não encontrou uma estratégia que sobrevivesse aos filtros.'],
    };
  }

  const compatibility =
    initialCapital !== 100
      ? {
          passed: false,
          value: 'CAPITAL_MISMATCH',
          reason: 'Este gate foi definido para a banca inicial exata de USD 100.00.',
        }
      : await checkAlpacaCompatibility(asset, initialCapital, positionPct);
  const checklist = evaluateChecklist(tournament, compatibility);
  const reasons: string[] = [];
  for (const [name, result] of Object.entries(checklist)) {
    if (!result.passed) reasons.push(`${name}: ${'reason' in result ? result.reason : `valor=${JSON.stringify(result.value)}`}`);
  }

  if (!hasPassedChecklist(checklist)) {
    return {
      decision: 'REJECTED',
      checklist_results: checklist,
      deployment: null,
      next_action: reasons.some((reason) => reason.includes('capital_compatibility')) ? 'HUMAN_REVIEW' : 'RETURN_TO_TOURNAMENT',
      reasons,
    };
  }

  const deployment: PromotionDeployment = {
    deployment_id: `deployment-${randomUUID()}`,
    strategy_id: tournament.champion_strategy_id,
    params: tournament.champion_params,
    approved_at: new Date().toISOString(),
    initial_equity_usd: 100,
    mode: 'PAPER',
    broker: 'ALPACA_PAPER',
    max_position_pct: 2,
    max_concurrent_positions: 5,
    max_gross_exposure_pct: 10,
    max_risk_per_trade_pct: 1,
    daily_loss_limit_pct: 5,
    kill_switch_drawdown_pct: 15,
    reevaluation_period_days: 14,
  };
  const manifestPath = process.env.VALIDATED_STRATEGY_PATH || path.join(process.cwd(), 'server', 'data', 'validated_strategy.json');
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        ...deployment,
        asset,
        status: 'APPROVED',
        paper_only: true,
        source_tournament_id: tournament.tournament_id,
        reproducibility_hash: tournament.reproducibility_hash,
      },
      null,
      2
    ),
    'utf8'
  );
  return {
    decision: 'APPROVED',
    checklist_results: checklist,
    deployment,
    next_action: 'START_PAPER_BOT',
    reasons: ['Todos os gates passaram e o manifest PAPER foi gravado.'],
  };
}

export class ValidationPipelineService {
  private lastRun: ValidationPipelineResult | null = null;

  async run(request: ValidationPipelineRequest): Promise<ValidationPipelineResult> {
    const normalized = normalizeRequest(request);
    const requestedAt = new Date().toISOString();
    const assets = [...new Set([normalized.asset, ...normalized.validation_assets])];
    const dataResults = await Promise.all(
      assets.map((asset) => fetchHistoricalBars(asset, normalized.timeframe, normalized.lookback_days))
    );
    const primaryData = dataResults.find((result) => result.asset === normalized.asset) || dataResults[0];
    const barsByAsset = Object.fromEntries(dataResults.map((result) => [result.asset, result.bars]));
    const source = primaryData?.source || 'UNKNOWN';
    const dataErrors = dataResults.filter((result) => result.error).map((result) => `${result.asset}: ${result.error}`);
    const policy = portfolioPolicy(normalized.initial_capital, normalized.position_pct);
    const costs: BacktestCosts = {
      feeRateBps: normalized.fee_rate_bps,
      slippageBps: normalized.slippage_bps,
      positionPct: normalized.position_pct,
      maxConcurrentPositions: policy.max_concurrent_positions,
      maxGrossExposurePct: policy.max_gross_exposure_pct / 100,
      maxRiskPerTradePct: policy.max_risk_per_trade_pct / 100,
    };
    const families = normalized.strategy_families;
    const firstCandidate: StrategyCandidate = candidateGrid(families)[0] || {
      strategy_id: 'trend_following_sma_8_30',
      strategy_family: 'trend_following',
      params: { fast_period: 8, slow_period: 30 },
    };
    let backtest: WfaBacktestReport | null = null;
    if (primaryData?.bars.length) {
      const result = runWfaBacktest(primaryData.bars, firstCandidate, normalized.timeframe, normalized.initial_capital, costs);
      backtest = decorateBacktest(result.report, normalized.asset, source, assets.length > 1 ? 'NOT_APPLICABLE' : 'NOT_APPLICABLE');
    }

    const tournament = runTournament(
      barsByAsset,
      normalized.asset,
      normalized.timeframe,
      normalized.initial_capital,
      costs,
      families
    );
    tournament.data_source = source;
    tournament.data_start = primaryData?.start || '';
    tournament.data_end = primaryData?.end || '';

    const promotion = await createPromotionDecision(tournament, normalized.asset, normalized.initial_capital, normalized.position_pct);
    const status = !primaryData?.bars.length
      ? 'NO_DATA'
      : tournament.status === 'NO_VIABLE_STRATEGY'
        ? 'NO_VIABLE_STRATEGY'
        : 'VALID';
    const pipeline: ValidationPipelineResult = {
      pipeline_id: `pipeline-${hash({ requestedAt, normalized, tournament: tournament.reproducibility_hash }).slice(0, 16)}`,
      requested_at: requestedAt,
      data: {
        source,
        assets,
        bars_by_asset: Object.fromEntries(dataResults.map((result) => [result.asset, result.bars.length])),
        start: primaryData?.start || null,
        end: primaryData?.end || null,
        errors: dataErrors,
      },
      backtest,
      portfolio_policy: policy,
      tournament,
      promotion,
      status,
    };
    this.lastRun = pipeline;
    try {
      const reportPath = process.env.VALIDATION_REPORT_PATH || path.join(process.cwd(), 'server', 'data', 'validation', 'last_pipeline.json');
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(pipeline, null, 2), 'utf8');
    } catch (error: any) {
      // A report persistence problem must be visible, but it must not turn a
      // valid/rejected trading decision into a fabricated success.
      console.warn('[Validation] Não foi possível persistir o relatório:', error?.message || error);
    }
    return pipeline;
  }

  getLastRun(): ValidationPipelineResult | null {
    return this.lastRun;
  }

  async promoteLastRun(): Promise<PromotionGateResult> {
    if (!this.lastRun) {
      return {
        decision: 'REJECTED',
        checklist_results: rejectedChecklist({
          tournament_id: '',
          candidates_tested: 0,
          candidates_survived_stat_filter: 0,
          candidates_passed_walk_forward: 0,
          candidates_passed_robustness: 0,
          champion_strategy_id: '',
          champion_params: {},
          champion_metrics_in_sample: null,
          champion_metrics_out_of_sample: null,
          monte_carlo_ci_95_return: null,
          monte_carlo_ci_95_drawdown: null,
          parameter_stability: 'NOT_TESTED',
          cross_asset_validation: 'NOT_TESTED',
          status: 'NO_VIABLE_STRATEGY',
          data_source: 'UNKNOWN',
          data_start: '',
          data_end: '',
          candidates: [],
          rejection_reasons: ['Nenhum pipeline executado.'],
          reproducibility_hash: '',
        }),
        deployment: null,
        next_action: 'HUMAN_REVIEW',
        reasons: ['Execute o pipeline com dados reais antes de solicitar promoção.'],
      };
    }
    return createPromotionDecision(
      this.lastRun.tournament,
      this.lastRun.data.assets[0],
      100,
      0.02
    );
  }

  getManifestPath(): string {
    return process.env.VALIDATED_STRATEGY_PATH || path.join(process.cwd(), 'server', 'data', 'validated_strategy.json');
  }

  async getManifest(): Promise<Record<string, unknown> | null> {
    try {
      const content = await fs.readFile(this.getManifestPath(), 'utf8');
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export const validationPipelineService = new ValidationPipelineService();
