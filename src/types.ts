export type BrokerId =
  | 'binance'
  | 'mt5'
  | 'ctrader'
  | 'blockchain_evm'
  | 'coinbase'
  | 'metamask'
  | 'mercado_bitcoin'
  | 'ibkr'
  | 'bybit'
  | 'national_broker'
  | 'paper';

export type AccountType = 'demo' | 'real';

export interface Account {
  id: string;
  name: string;
  broker: BrokerId;
  type: AccountType;
  initialBalance: number;
  currentBalance: number;
  baseCurrency: 'BRL' | 'USD' | 'USDT';
  walletAddress?: string;
  apiKeyEncrypted?: string;
  apiSecretEncrypted?: string;
  isActive: boolean;
  createdAt: string;
  totalTrades: number;
  winningTrades: number;
  pnlTotal: number;
}

export type TradeDirection = 'LONG' | 'SHORT';
export type TradeStatus = 'open' | 'closed' | 'cancelled';

export interface Trade {
  id: string;
  accountId: string;
  accountName: string;
  broker: BrokerId;
  symbol: string;
  direction: TradeDirection;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  tpPrice: number;
  slPrice: number;
  status: TradeStatus;
  pnl: number;
  pnlPercent: number;
  entryTime: string;
  closeTime?: string;
  exitTime?: string;
  durationSeconds?: number;
  clockHour?: string;
  botId?: string;
  botName?: string;
  timeframe?: string;
  auditCode?: string;
  auditHash?: string;
  auditStatus?: 'PENDING_CLOSE' | 'AUDITED_SEALED';
  txHash?: string;
  onchainNetwork?: string;
  explorerUrl?: string;
  notes?: string;
}

export interface HourlyBucket {
  hourKey: string; // e.g. '2026-08-26 14:00'
  displayHour: string; // e.g. '14:00 - 15:00'
  tradeCount: number;
  winCount: number;
  lossCount: number;
  pnlTotal: number;
  pnlPercent: number;
  winRate: number;
  volumeTotal: number;
  avgDurationSeconds: number;
}

export interface SessionStats {
  sessionStartTime: number;
  sessionStartedAt: string;
  sessionSeconds: number;
  isTimerRunning: boolean;
  totalTrades: number;
  closedTradesCount: number;
  openTradesCount: number;
  totalPnl: number;
  tradesPerHour: number;
  pnlPerHour: number;
  winRate: number;
  last1HourPnl: number;
  last1HourTrades: number;
  last1HourWinRate: number;
  last4HoursPnl: number;
  last4HoursTrades: number;
  last24HoursPnl: number;
  last24HoursTrades: number;
  projected24hPnl: number;
  projectedMonthlyPnl: number;
  hourlyBuckets: HourlyBucket[];
  dbPersistence: {
    synced: boolean;
    lastSaved: string;
    totalRecords: number;
    filePath: string;
  };
}

export type StrategyId =
  | 'multi_timeframe_trend_ea'
  | 'm1_pro'
  | 'quant_orb_15m'
  | 'orb_agentic_enhanced'
  | 'multi_agent_regime_desk'
  | 'lumibot_signal_strategy'
  | 'lumibot_killer_momentum_rsi'
  | 'kronos_grid'
  | 'quantum_entanglement'
  | 'macd_cross'
  | 'kronos_scalp'
  | 'momentum'
  | 'grid'
  | 'dca'
  | 'mean_reversion';

export interface BotConfig {
  symbol: string;
  timeframe: string; // '1m' | '5m' | '15m' | '1h'
  riskPercent: number; // e.g. 0.5
  tpRatio: number; // e.g. 2.0 (RR 1:2)
  slRatio: number; // e.g. 1.0
  customParams?: Record<string, number | string>;
}

export interface Bot {
  id: string;
  accountId: string;
  accountName: string;
  accountType: AccountType;
  name: string;
  strategy: StrategyId;
  config: BotConfig;
  status: 'running' | 'paused' | 'stopped';
  createdAt: string;
  totalTrades: number;
  pnlTotal: number;
  winRate: number;
  lastExecutionTime?: string;
  lastLog?: string;
}

export interface SignalExperience {
  id: string;
  symbol: string;
  timeframe: string;
  strategyHash: string;
  features: {
    rsi: number;
    emaDiff: number;
    volatility: number;
    regime: string;
  };
  outcome: 'win' | 'loss';
  pnlPercent: number;
  regime: 'Kronos Bull' | 'Kronos Bear' | 'High Volatility' | 'Mean Reverting';
  createdAt: string;
}

export interface Ticker {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  updatedAt: string;
}

export interface EntanglementAnomaly {
  pair: [string, string];
  currentCorrelation: number;
  historicalCorrelation: number;
  divergence: number;
  recommendedTrade: {
    longAsset: string;
    shortAsset: string;
    confidence: number;
  };
}

export interface EntanglementData {
  symbols: string[];
  matrix: number[][];
  anomalies: EntanglementAnomaly[];
  collectiveWinRate: number;
  totalSignalsCollected: number;
  dominantRegime: string;
}

export interface BacktestRequest {
  strategy: StrategyId;
  symbol: string;
  timeframe: string;
  initialCapital: number;
  riskPercent: number;
  enforceProfitRule: boolean;
  daysHistory: number;
}

export interface BacktestResult {
  strategy: StrategyId;
  symbol: string;
  totalTrades: number;
  winningTrades: number;
  winRate: number;
  initialBalance: number;
  finalBalance: number;
  totalPnl: number;
  totalPnlPercent: number;
  maxDrawdownPercent: number;
  profitRuleBlockedCount: number;
  equityCurve: { timestamp: string; balance: number; buyAndHold: number }[];
  tradeLog: Trade[];
}

// ============================================================================
// Walk-forward validation pipeline (real data only)
// ============================================================================

export type ValidationDataSource = 'YAHOO_FINANCE' | 'ALPACA_MARKET_DATA' | 'CCXT' | 'UNKNOWN';
export type WfaStrategyFamily = 'trend_following' | 'mean_reversion' | 'breakout';
export type ValidationRunStatus = 'VALID' | 'INVALID_BACKTEST' | 'NO_DATA' | 'NO_VIABLE_STRATEGY';

export interface HistoricalBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ValidationMetrics {
  n_trades: number;
  win_rate: number;
  profit_factor: number;
  expectancy: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  max_drawdown: number;
  cagr: number;
  total_return: number;
  gross_profit: number;
  gross_loss: number;
  fees_total: number;
  slippage_total: number;
  avg_trade: number;
  best_trade: number;
  worst_trade: number;
}

export interface WfaWindowReport {
  window_id: number;
  train: [string, string];
  validation: [string, string];
  test: [string, string];
  selected_strategy_id?: string;
  selected_params?: Record<string, number>;
  train_metrics: ValidationMetrics;
  validation_metrics: ValidationMetrics;
  test_metrics: ValidationMetrics;
}

export interface WfaBacktestReport {
  strategy_id: string;
  strategy_family: WfaStrategyFamily;
  params: Record<string, number>;
  asset: string;
  timeframe: string;
  period_train: [string, string];
  period_test: [string, string];
  walk_forward_windows: number;
  // Flat aliases make the JSON consumable by execution agents without
  // discarding the full train/validation/OOS metric objects below.
  n_trades: number;
  win_rate: number;
  profit_factor: number;
  expectancy: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  max_drawdown: number;
  cagr: number;
  metrics_in_sample: ValidationMetrics;
  metrics_validation: ValidationMetrics;
  metrics_out_of_sample: ValidationMetrics;
  oos_efficiency_ratio: number;
  fees_total: number;
  slippage_total: number;
  data_source: ValidationDataSource;
  data_start: string;
  data_end: string;
  lookahead_check: 'PASSED' | 'FAILED';
  survivorship_check: 'PASSED' | 'FAILED' | 'NOT_APPLICABLE';
  reproducibility_hash: string;
  status: ValidationRunStatus;
  invalid_reasons: string[];
  windows: WfaWindowReport[];
  monte_carlo_ci_95_return?: [number, number];
  monte_carlo_ci_95_drawdown?: [number, number];
  parameter_stability?: 'STABLE' | 'UNSTABLE';
  cross_asset_validation?: 'PASSED' | 'FAILED' | 'NOT_TESTED';
}

export interface TournamentCandidateSummary {
  strategy_id: string;
  strategy_family: WfaStrategyFamily;
  params: Record<string, number>;
  status: 'SURVIVED' | 'FILTERED' | 'PASSED_WALK_FORWARD' | 'PASSED_ROBUSTNESS';
  filter_reasons: string[];
  metrics_in_sample: ValidationMetrics;
  metrics_out_of_sample: ValidationMetrics;
  oos_efficiency_ratio: number;
  score?: number;
  backtest_hash: string;
}

export interface TournamentResult {
  tournament_id: string;
  candidates_tested: number;
  candidates_survived_stat_filter: number;
  candidates_passed_walk_forward: number;
  candidates_passed_robustness: number;
  champion_strategy_id: string;
  champion_params: Record<string, number>;
  champion_metrics_in_sample: ValidationMetrics | null;
  champion_metrics_out_of_sample: ValidationMetrics | null;
  monte_carlo_ci_95_return: [number, number] | null;
  monte_carlo_ci_95_drawdown: [number, number] | null;
  parameter_stability: 'STABLE' | 'UNSTABLE' | 'NOT_TESTED';
  cross_asset_validation: 'PASSED' | 'FAILED' | 'NOT_TESTED';
  status: 'CHAMPION_FOUND' | 'NO_VIABLE_STRATEGY';
  data_source: ValidationDataSource;
  data_start: string;
  data_end: string;
  candidates: TournamentCandidateSummary[];
  rejection_reasons: string[];
  reproducibility_hash: string;
}

export interface PromotionChecklistResults {
  status_champion_found: { passed: boolean; value: string; threshold: string };
  oos_efficiency_ratio: { passed: boolean; value: number; threshold: number };
  sharpe_out_of_sample: { passed: boolean; value: number; threshold: number };
  max_drawdown_out_of_sample: { passed: boolean; value: number; threshold: number };
  monte_carlo_worst_drawdown: { passed: boolean; value: number; threshold: number };
  parameter_stability: { passed: boolean; value: string; threshold: string };
  n_trades_out_of_sample: { passed: boolean; value: number; threshold: number };
  cross_asset_validation: { passed: boolean; value: string; justification: string };
  cost_ratio: { passed: boolean; value: number; threshold: number };
  capital_compatibility: { passed: boolean; value: string; reason: string };
}

export interface PromotionDeployment {
  deployment_id: string;
  strategy_id: string;
  params: Record<string, number>;
  approved_at: string;
  initial_equity_usd: 100;
  mode: 'PAPER';
  broker: 'ALPACA_PAPER';
  max_position_pct: 2;
  daily_loss_limit_pct: 5;
  kill_switch_drawdown_pct: 15;
  reevaluation_period_days: 14;
}

export interface PromotionGateResult {
  decision: 'APPROVED' | 'REJECTED';
  checklist_results: PromotionChecklistResults;
  deployment: PromotionDeployment | null;
  next_action: 'START_PAPER_BOT' | 'RETURN_TO_TOURNAMENT' | 'HUMAN_REVIEW';
  reasons: string[];
}

export interface ValidationPipelineRequest {
  asset: string;
  validation_assets?: string[];
  timeframe: string;
  lookback_days: number;
  initial_capital: number;
  position_pct?: number;
  fee_rate_bps?: number;
  slippage_bps?: number;
  strategy_families?: WfaStrategyFamily[];
}

export interface ValidationPipelineResult {
  pipeline_id: string;
  requested_at: string;
  data: {
    source: ValidationDataSource;
    assets: string[];
    bars_by_asset: Record<string, number>;
    start: string | null;
    end: string | null;
    errors: string[];
  };
  backtest: WfaBacktestReport | null;
  tournament: TournamentResult;
  promotion: PromotionGateResult;
  status: ValidationRunStatus;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  type: 'INFO' | 'TRADE' | 'BOT' | 'RULE' | 'ERROR';
  message: string;
  details?: Record<string, unknown>;
}

export type WebhookStatus =
  | 'EXECUTED'
  | 'REJECTED_STALE'
  | 'REJECTED_SLIPPAGE'
  | 'REJECTED_DUPLICATE'
  | 'AUTH_FAILED'
  | 'ERROR';

export interface WebhookAuditLog {
  id: string;
  orderId: string;
  symbol: string;
  action: 'buy' | 'sell';
  amount: number;
  signalPrice: number;
  marketPrice?: number;
  latencyMs: number;
  slippagePercent?: number;
  status: WebhookStatus;
  brokerAccount: string;
  accountType: AccountType;
  reason: string;
  timestamp: string;
}

export interface WebhookConfig {
  webhookUrl: string;
  secret: string;
  tradingViewTemplate: string;
  maxLatencySeconds: number;
  maxSlippagePercent: number;
}
