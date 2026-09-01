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
