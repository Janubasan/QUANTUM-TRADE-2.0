export type BrokerId = 'binance' | 'mercado_bitcoin' | 'ibkr' | 'bybit' | 'mt5' | 'proft';

export type AccountType = 'demo' | 'real';

export type VenueEnvironment = 'demo' | 'live';
export type VenueConnectionStatus = 'offline' | 'online' | 'degraded';
export type ExecutionMode = 'simulated' | 'venue';
export type VenueOrderStatus =
  | 'queued'
  | 'sent'
  | 'filled'
  | 'partial'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'offline';

export interface Account {
  id: string;
  name: string;
  broker: BrokerId;
  type: AccountType;
  initialBalance: number;
  currentBalance: number;
  baseCurrency: 'BRL' | 'USD' | 'USDT';
  apiKeyEncrypted?: string;
  apiSecretEncrypted?: string;
  isActive: boolean;
  createdAt: string;
  totalTrades: number;
  winningTrades: number;
  pnlTotal: number;
  venueEnvironment?: VenueEnvironment;
  routeToVenue?: boolean;
  allowLiveExecution?: boolean;
  connectionStatus?: VenueConnectionStatus;
  lastHeartbeat?: string;
  mt5Login?: string;
  mt5Server?: string;
  mt5Company?: string;
  bridgeTokenHint?: string;
  proftBaseUrl?: string;
  proftAccountId?: string;
  liveEquity?: number;
  liveBalance?: number;
  liveCurrency?: string;
  liveMargin?: number;
  liveLeverage?: number;
}

export type TradeDirection = 'LONG' | 'SHORT';
export type TradeStatus = 'pending' | 'open' | 'closed' | 'cancelled' | 'rejected';

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
  botId?: string;
  botName?: string;
  notes?: string;
  executionMode?: ExecutionMode;
  venueStatus?: VenueOrderStatus;
  venueCommandId?: string;
  brokerTicket?: string;
  brokerDeal?: string;
  brokerRetcode?: string;
  venueFillPrice?: number;
  venueRaw?: Record<string, unknown>;
}

export type StrategyId =
  | 'm1_pro'
  | 'kronos_grid'
  | 'quantum_entanglement'
  | 'macd_cross'
  | 'quant_orb_15m'
  | 'orb_agentic_enhanced'
  | 'multi_agent_regime_desk'
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
  source?: string;
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
  | 'ERROR'
  | 'QUEUED_VENUE';

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

export interface VenueCommand {
  id: string;
  accountId: string;
  venue: 'mt5' | 'proft';
  action: 'open' | 'close' | 'modify' | 'cancel' | 'ping';
  symbol: string;
  direction?: TradeDirection;
  volume: number;
  price?: number;
  sl?: number;
  tp?: number;
  comment?: string;
  magic?: number;
  ticket?: string;
  tradeId?: string;
  createdAt: string;
  expiresAt: string;
  status: VenueOrderStatus;
}

export interface VenueSession {
  accountId: string;
  venue: 'mt5' | 'proft';
  connected: boolean;
  lastHeartbeat: string;
  login?: string;
  server?: string;
  company?: string;
  tradeMode?: string;
  balance?: number;
  equity?: number;
  margin?: number;
  freeMargin?: number;
  currency?: string;
  leverage?: number;
  terminalBuild?: string;
  agentVersion?: string;
  positions: VenuePosition[];
  quotes: Record<string, number>;
}

export interface VenuePosition {
  ticket: string;
  symbol: string;
  direction: TradeDirection;
  volume: number;
  priceOpen: number;
  priceCurrent: number;
  sl: number;
  tp: number;
  profit: number;
  comment?: string;
}

export interface BrokerExecutionEvent {
  id: string;
  timestamp: string;
  accountId: string;
  venue: string;
  environment: VenueEnvironment;
  stage: string;
  symbol: string;
  payload: Record<string, unknown>;
  hash: string;
}
