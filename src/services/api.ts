import {
  Account,
  Bot,
  Trade,
  Ticker,
  EntanglementData,
  BacktestRequest,
  BacktestResult,
  SystemLog,
  WebhookAuditLog,
  WebhookConfig,
  SessionStats,
  JarvisSnapshot,
  JarvisBacktestResult,
} from '../types.js';

async function requestJson<T>(url: string, options?: RequestInit, retries = 3): Promise<T> {
  const isGet = !options?.method || options.method.toUpperCase() === 'GET';
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';

    if (!res.ok || !contentType.includes('application/json')) {
      const text = await res.text();
      let errorMessage = `Erro na requisição ${url} (status ${res.status})`;
      let isHtml = false;
      try {
        const parsed = JSON.parse(text);
        if (parsed.error) errorMessage = parsed.error;
      } catch {
        if (text.trim().startsWith('<') || contentType.includes('text/html')) {
          isHtml = true;
          errorMessage = `A API ${url} retornou resposta HTML (status ${res.status}).`;
        } else if (text) {
          errorMessage = text;
        }
      }

      // If we got an HTML response on a GET request (e.g. server bootstrapping / Vite reload), retry
      if (retries > 0 && isGet && isHtml) {
        await new Promise((r) => setTimeout(r, 600));
        return requestJson<T>(url, options, retries - 1);
      }

      throw new Error(errorMessage);
    }

    return await res.json();
  } catch (err: any) {
    // If it's a transient network glitch or dev server cold restart, retry for GET requests
    if (retries > 0 && isGet && (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError' || err?.message?.includes('retornou resposta HTML'))) {
      await new Promise((r) => setTimeout(r, 600));
      return requestJson<T>(url, options, retries - 1);
    }

    if (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError') {
      throw new Error(`Servidor temporariamente indisponível (${url}).`);
    }
    throw err;
  }
}

export async function fetchTickers(): Promise<Record<string, Ticker>> {
  return requestJson<Record<string, Ticker>>('/api/tickers');
}

export async function fetchAccounts(): Promise<Account[]> {
  return requestJson<Account[]>('/api/accounts');
}

export async function createAccount(data: Partial<Account>): Promise<Account> {
  return requestJson<Account>('/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function resetDemoAccount(id: string): Promise<Account> {
  return requestJson<Account>(`/api/accounts/${id}/reset`, { method: 'POST' });
}

export async function deleteAccount(id: string): Promise<void> {
  await requestJson<{ success: boolean }>(`/api/accounts/${id}`, { method: 'DELETE' });
}

export async function fetchTrades(): Promise<Trade[]> {
  return requestJson<Trade[]>('/api/trades');
}

export async function createManualTrade(data: {
  accountId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  riskPercent: number;
  tpRatio?: number;
  slRatio?: number;
  txHash?: string;
  walletAddress?: string;
  onchainConfirmed?: boolean;
}): Promise<Trade> {
  return requestJson<Trade>('/api/trades/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function closeTrade(id: string): Promise<Trade> {
  return requestJson<Trade>(`/api/trades/${id}/close`, { method: 'POST' });
}

export async function fetchBots(): Promise<Bot[]> {
  return requestJson<Bot[]>('/api/bots');
}

export async function createBot(data: {
  accountId: string;
  name: string;
  strategy: string;
  symbol: string;
  timeframe: string;
  riskPercent: number;
  tpRatio: number;
  slRatio: number;
}): Promise<Bot> {
  return requestJson<Bot>('/api/bots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function toggleBot(id: string): Promise<Bot> {
  return requestJson<Bot>(`/api/bots/${id}/toggle`, { method: 'POST' });
}

export async function forceBotTrades(id: string, count: number = 5): Promise<{
  success: boolean;
  botName: string;
  tradesGenerated: number;
  trades: Trade[];
  bot: Bot;
  account: Account;
}> {
  return requestJson<{
    success: boolean;
    botName: string;
    tradesGenerated: number;
    trades: Trade[];
    bot: Bot;
    account: Account;
  }>(`/api/bots/${id}/force-trades`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });
}

export async function toggleAllBots(running: boolean): Promise<{ success: boolean; running: boolean; bots: Bot[] }> {
  return requestJson<{ success: boolean; running: boolean; bots: Bot[] }>('/api/bots/toggle-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ running }),
  });
}

export async function deleteBot(id: string): Promise<void> {
  await requestJson<{ success: boolean }>(`/api/bots/${id}`, { method: 'DELETE' });
}

export async function fetchEntanglementData(): Promise<EntanglementData> {
  return requestJson<EntanglementData>('/api/collective/entanglement');
}

// ============================================================================
// JARVIS Committee API
// ============================================================================
export async function fetchJarvisCommittee(): Promise<JarvisSnapshot> {
  return requestJson<JarvisSnapshot>('/api/jarvis/committee');
}

export async function evaluateJarvisCommittee(): Promise<JarvisSnapshot> {
  return requestJson<JarvisSnapshot>('/api/jarvis/committee/evaluate', { method: 'POST' });
}

export async function toggleJarvisCommittee(): Promise<{ isRunning: boolean; snapshot: JarvisSnapshot }> {
  return requestJson<{ isRunning: boolean; snapshot: JarvisSnapshot }>('/api/jarvis/committee/toggle', {
    method: 'POST',
  });
}

export async function configureJarvisCommittee(data: {
  symbol?: string;
  autoTrade?: boolean;
  scalperMode?: boolean;
}): Promise<JarvisSnapshot> {
  return requestJson<JarvisSnapshot>('/api/jarvis/committee/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function releaseJarvisRiskLock(): Promise<JarvisSnapshot> {
  return requestJson<JarvisSnapshot>('/api/jarvis/committee/risk/release', { method: 'POST' });
}

export async function setJarvisDeskMode(enabled: boolean): Promise<JarvisSnapshot> {
  return requestJson<JarvisSnapshot>('/api/jarvis/committee/desk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export async function approveJarvisOperation(id: string): Promise<JarvisSnapshot> {
  return requestJson<JarvisSnapshot>('/api/jarvis/committee/ops/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
}

export async function rejectJarvisOperation(id: string): Promise<JarvisSnapshot> {
  return requestJson<JarvisSnapshot>('/api/jarvis/committee/ops/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
}

export async function runJarvisBacktest(days: number): Promise<JarvisBacktestResult> {
  return requestJson<JarvisBacktestResult>('/api/jarvis/committee/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days }),
  });
}

export async function runBacktest(req: BacktestRequest): Promise<BacktestResult> {
  return requestJson<BacktestResult>('/api/collective/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function fetchLogs(): Promise<SystemLog[]> {
  return requestJson<SystemLog[]>('/api/logs');
}

export async function fetchWebhookConfig(): Promise<WebhookConfig> {
  return requestJson<WebhookConfig>('/api/webhook/config');
}

export async function updateWebhookSecret(secret: string): Promise<{ success: boolean; secret: string }> {
  return requestJson<{ success: boolean; secret: string }>('/api/webhook/secret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret }),
  });
}

export async function fetchWebhookAudits(): Promise<WebhookAuditLog[]> {
  return requestJson<WebhookAuditLog[]>('/api/webhook/audits');
}

export async function sendTestWebhookSignal(payload: Record<string, unknown>): Promise<any> {
  return requestJson<any>('/api/webhook/trade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchAuditChain(): Promise<{
  integrityValid: boolean;
  totalBlocks: number;
  headHash: string;
  chain: any[];
}> {
  return requestJson('/api/audit/chain');
}

export async function fetchAuditReport(): Promise<{
  markdown: string;
  totalBlocks: number;
  integrityValid: boolean;
}> {
  return requestJson('/api/audit/report');
}

export async function runAuditDemo(): Promise<{
  trades: any[];
  markdownReport: string;
  chainHead: string;
  integrityValid: boolean;
}> {
  return requestJson('/api/audit/run-demo', { method: 'POST' });
}

export async function resetAuditChain(): Promise<{
  success: boolean;
  message: string;
  headHash: string;
  totalBlocks: number;
  integrityValid: boolean;
}> {
  return requestJson('/api/audit/reset', { method: 'POST' });
}

export async function resetPlatformStore(): Promise<{
  success: boolean;
  message: string;
}> {
  return requestJson('/api/store/reset', { method: 'POST' });
}

export async function fetchSessionStats(): Promise<SessionStats> {
  return requestJson<SessionStats>('/api/session-stats');
}

export async function resetSessionStats(): Promise<{ success: boolean; stats: SessionStats }> {
  return requestJson<{ success: boolean; stats: SessionStats }>('/api/session-stats/reset', {
    method: 'POST',
  });
}

export async function toggleSessionStats(running?: boolean): Promise<{
  success: boolean;
  isTimerRunning: boolean;
  stats: SessionStats;
}> {
  return requestJson<{
    success: boolean;
    isTimerRunning: boolean;
    stats: SessionStats;
  }>('/api/session-stats/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ running }),
  });
}

export async function fetchSchedulerState(): Promise<{
  mode: 'scalp' | 'normal';
  allowedTimeframes: string[];
  allAllowedTimeframes: Record<'scalp' | 'normal', string[]>;
  exchangeRules: Record<string, any>;
}> {
  return requestJson('/api/regulator/scheduler');
}

export async function updateSchedulerMode(mode: 'scalp' | 'normal'): Promise<{
  success: boolean;
  mode: 'scalp' | 'normal';
  allowedTimeframes: string[];
}> {
  return requestJson('/api/regulator/scheduler/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
}

export async function fetchAllAggregatedPrices(): Promise<
  Record<
    string,
    {
      binance?: number;
      yahoo?: number;
      coingecko?: number;
      aggregated: number;
      sourcesCount: number;
      outlierFiltered: boolean;
      updatedAt: string;
    }
  >
> {
  return requestJson('/api/price/aggregated/all');
}

export async function fetchAggregatedPrice(symbol: string): Promise<{
  binance?: number;
  yahoo?: number;
  coingecko?: number;
  aggregated: number;
  sourcesCount: number;
  outlierFiltered: boolean;
  updatedAt: string;
}> {
  return requestJson(`/api/price/aggregated/${encodeURIComponent(symbol)}`);
}

export async function fetchBotStrategies(): Promise<
  {
    id: string;
    name: string;
    description: string;
    recommendedTimeframe: string;
    defaultRiskPercent: number;
  }[]
> {
  return requestJson('/api/bot/strategies');
}

export async function fetchBotRankings(): Promise<
  {
    botId: string;
    botName: string;
    strategy: string;
    accountName: string;
    status: string;
    symbol: string;
    timeframe: string;
    totalTrades: number;
    wins: number;
    winRate: number;
    pnlTotal: number;
    sharpeRatio: number;
    lastExecutionTime: string;
  }[]
> {
  return requestJson('/api/bot/ranking');
}

export async function triggerBotEvaluation(botId: string): Promise<{
  success: boolean;
  message: string;
  trade?: any;
}> {
  return requestJson(`/api/bot/evaluate/${botId}`, { method: 'POST' });
}

export async function resetPlatformData(): Promise<{ success: boolean; message: string }> {
  return requestJson<{ success: boolean; message: string }>('/api/store/reset', { method: 'POST' });
}

export async function fetchKillSwitchStatus(): Promise<{ isActive: boolean; firestoreKillSwitch?: boolean }> {
  try {
    return await requestJson<{ isActive: boolean; firestoreKillSwitch?: boolean }>('/api/killswitch/status');
  } catch {
    return { isActive: true, firestoreKillSwitch: false };
  }
}

export async function toggleKillSwitch(): Promise<{ isActive: boolean }> {
  return requestJson<{ isActive: boolean }>('/api/killswitch/toggle', { method: 'POST' });
}

export async function fetchTimeGateLimits(): Promise<{
  minSeconds: number;
  maxSeconds: number;
  minMinutes: number;
  maxHours: number;
}> {
  return requestJson('/api/timegate/limits');
}

export async function fetchRealisticSettings(): Promise<{
  dailyProfitLimitPct: number;
  maxOrdersPerHour: number;
  slippagePct: number;
  feeRatePct: number;
}> {
  return requestJson('/api/realistic/settings');
}

export interface RunnerMetrics {
  id: string;
  status: 'running' | 'paused' | 'maintenance';
  uptimeSeconds: number;
  totalTicks: number;
  startedAt: string;
  lastHeartbeat: string;
  ticksPerMinute: number;
  activeBotsCount: number;
  openTradesCount: number;
  closedTradesCount: number;
  totalProfitGenerated: number;
  firebaseConnected: boolean;
  lastFirebaseSync: string | null;
  syncCount: number;
  memoryUsageMb: number;
  autoRecoveryCount: number;
}

export async function fetchRunnerStatus(): Promise<RunnerMetrics> {
  return requestJson<RunnerMetrics>('/api/runner/status');
}

export async function toggleRunner(): Promise<{ isRunning: boolean; metrics: RunnerMetrics }> {
  return requestJson<{ isRunning: boolean; metrics: RunnerMetrics }>('/api/runner/toggle', { method: 'POST' });
}

export async function syncFirebaseNow(): Promise<{ success: boolean; error?: string; metrics: RunnerMetrics }> {
  return requestJson<{ success: boolean; error?: string; metrics: RunnerMetrics }>('/api/runner/sync-firebase', { method: 'POST' });
}

export async function fetchFirebaseStatus(): Promise<{
  initialized: boolean;
  projectId: string;
  databaseId: string;
  lastSync: string | null;
  syncCount: number;
  lastError: string | null;
  quotaExhausted?: boolean;
  quotaUpgradeUrl?: string;
}> {
  try {
    return await requestJson('/api/firebase/status');
  } catch {
    return {
      initialized: true,
      projectId: 'ai-studio-remixquantumtrad',
      databaseId: 'ai-studio-remixquantumtrad-dca14348-3352-4b8b-b858-eae9016a368d',
      lastSync: null,
      syncCount: 0,
      lastError: null,
      quotaExhausted: false,
    };
  }
}

export interface OperationalGuardStatus {
  killSwitch: boolean;
  maxOrdersPerHour: number;
  dailyProfitLimitPercent: number;
  slippageRate: number;
  feeRate: number;
  timeMinSeconds: number;
  timeMaxSeconds: number;
}

export async function fetchOperationalGuardStatus(): Promise<OperationalGuardStatus> {
  try {
    return await requestJson<OperationalGuardStatus>('/api/operational-guard/status');
  } catch {
    return {
      killSwitch: false,
      maxOrdersPerHour: 10,
      dailyProfitLimitPercent: 10,
      slippageRate: 0.001,
      feeRate: 0.001,
      timeMinSeconds: 60,
      timeMaxSeconds: 3600,
    };
  }
}

export async function toggleOperationalGuardKillSwitch(active: boolean): Promise<{ success: boolean; kill_switch: boolean }> {
  return requestJson<{ success: boolean; kill_switch: boolean }>('/api/operational-guard/killswitch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
}

export async function signOperationalGuardPayload(payload: Record<string, unknown>, secret: string): Promise<{ signature: string }> {
  return requestJson<{ signature: string }>('/api/operational-guard/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, secret }),
  });
}

// --- NAUTILUS TRADER BRIDGE METHODS ---
export interface NautilusNodeStatus {
  isRunning: boolean;
  engine: string;
  runtime: string;
  version: string;
  uptimeSeconds: number;
  activeStrategies: string[];
  subscribedInstruments: string[];
  totalOrdersProcessed: number;
  averageLatencyMs: number;
  connectedVenues: string[];
  lastHeartbeat: string;
}

export interface NautilusOrder {
  id: string;
  instrument: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  status: 'PENDING' | 'ACCEPTED' | 'FILLED' | 'REJECTED';
  timestamp: string;
  venueOrderId?: string;
  fillPrice?: number;
  latencyMs?: number;
}

export interface NautilusLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';
  source: 'FastAPI' | 'NautilusCore' | 'Strategy' | 'ExecutionEngine';
  message: string;
}

export async function fetchNautilusStatus(): Promise<NautilusNodeStatus> {
  return requestJson<NautilusNodeStatus>('/api/nautilus/status');
}

export async function loginNautilusToken(username: string): Promise<{ access_token: string; token_type: string; user: any }> {
  return requestJson('/api/nautilus/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
}

export async function startNautilusEngine(): Promise<{ status: string; isRunning: boolean }> {
  return requestJson('/api/nautilus/engine/start', { method: 'POST' });
}

export async function stopNautilusEngine(): Promise<{ status: string; isRunning: boolean }> {
  return requestJson('/api/nautilus/engine/stop', { method: 'POST' });
}

export async function sendNautilusOrder(data: {
  instrument: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
}): Promise<{ message: string; order: NautilusOrder }> {
  return requestJson('/api/nautilus/trade/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function fetchNautilusOrders(): Promise<NautilusOrder[]> {
  return requestJson<NautilusOrder[]>('/api/nautilus/orders');
}

export async function fetchNautilusLogs(): Promise<NautilusLog[]> {
  return requestJson<NautilusLog[]>('/api/nautilus/logs');
}

// --- REAL EXECUTION GATEWAY TYPES & METHODS ---
export interface RealAdapterStatus {
  id: string;
  name: string;
  kind: 'exchange' | 'wallet' | 'broker' | 'paper';
  isEnabled: boolean;
  isSandbox: boolean;
  isConnected: boolean;
  lastPingMs: number;
}

export interface MarketSessionInfo {
  isOpen: boolean;
  marketId: string;
  marketName: string;
  currentLocalTime: string;
  timezone: string;
  activeSession?: string;
  nextOpenTime?: string;
  nextCloseTime?: string;
  reason?: string;
  isHoliday?: boolean;
}

export interface RealGatewayStatus {
  enabled: boolean;
  mode: 'paper' | 'sandbox' | 'live';
  totalOrdersDispatched: number;
  totalVolumeExecutedUsd: number;
  activeAdapters: RealAdapterStatus[];
  openMarkets: MarketSessionInfo[];
  queueCount: number;
}

export interface RealExecutionReceipt {
  success: boolean;
  orderId: string;
  clientOrderId: string;
  externalOrderId?: string;
  adapterId: string;
  adapterName: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  filledQuantity: number;
  executedPrice: number;
  fee: number;
  feeAsset: string;
  latencyMs: number;
  status: 'FILLED' | 'PARTIALLY_FILLED' | 'PENDING' | 'REJECTED' | 'QUEUED';
  timestamp: string;
  rawResponse?: any;
  error?: string;
}

export interface RealBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  updatedAt: string;
}

export interface QueuedOrder {
  id: string;
  order: any;
  marketId: string;
  enqueuedAt: string;
  targetOpenTime?: string;
  status: 'PENDING_OPEN' | 'CANCELLED' | 'EXPIRED' | 'DISPATCHED';
  attempts: number;
}

export async function fetchRealGatewayStatus(): Promise<RealGatewayStatus> {
  return requestJson<RealGatewayStatus>('/api/real-execution/status');
}

export async function fetchRealGatewayConfig(): Promise<any> {
  return requestJson('/api/real-execution/config');
}

export async function updateRealGatewayConfig(config: any): Promise<any> {
  return requestJson('/api/real-execution/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export async function fetchRealAdapters(): Promise<RealAdapterStatus[]> {
  return requestJson<RealAdapterStatus[]>('/api/real-execution/adapters');
}

export async function updateRealAdapter(id: string, isEnabled?: boolean, isSandbox?: boolean): Promise<RealAdapterStatus> {
  return requestJson<RealAdapterStatus>(`/api/real-execution/adapters/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isEnabled, isSandbox }),
  });
}

export async function fetchRealBalances(): Promise<Record<string, RealBalance[]>> {
  return requestJson<Record<string, RealBalance[]>>('/api/real-execution/balances');
}

export async function fetchMarketStatuses(): Promise<MarketSessionInfo[]> {
  return requestJson<MarketSessionInfo[]>('/api/real-execution/markets');
}

export async function fetchRealExecutionHistory(): Promise<RealExecutionReceipt[]> {
  return requestJson<RealExecutionReceipt[]>('/api/real-execution/history');
}

export async function fetchRealExecutionQueue(): Promise<QueuedOrder[]> {
  return requestJson<QueuedOrder[]>('/api/real-execution/queue');
}

export async function pingRealAdapter(id: string): Promise<{ success: boolean; latencyMs: number; error?: string; details?: any }> {
  return requestJson<{ success: boolean; latencyMs: number; error?: string; details?: any }>(`/api/real-execution/ping/${id}`, {
    method: 'POST',
  });
}

export async function dispatchManualRealOrder(data: {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
}): Promise<{ success: boolean; receipt: RealExecutionReceipt }> {
  return requestJson('/api/real-execution/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// MetaMask Web3 Watch Address APIs
export async function setMetaMaskWatchAddress(address: string): Promise<{ success: boolean; watchAddress: string }> {
  return requestJson<{ success: boolean; watchAddress: string }>('/api/onchain/watch-address', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
}

export async function getMetaMaskWatchAddress(): Promise<{ success: boolean; watchAddress: string }> {
  return requestJson<{ success: boolean; watchAddress: string }>('/api/onchain/watch-address');
}

// EVM On-Chain Integration APIs
export interface BlockchainChainInfo {
  name: string;
  rpcUrl: string;
  chainId: number;
  nativeSymbol: string;
  dexName: string;
  dexRouter: string;
  wrappedNative: string;
}

export interface BlockchainWalletInfo {
  address: string;
  chain: BlockchainChainInfo;
  nativeBalance: string;
  balances: RealBalance[];
  isSandbox: boolean;
}

export async function fetchBlockchainChains(): Promise<{ chains: Record<string, BlockchainChainInfo> }> {
  return requestJson('/api/blockchain/chains');
}

export async function fetchBlockchainWallet(): Promise<BlockchainWalletInfo> {
  return requestJson('/api/blockchain/wallet');
}

export async function selectBlockchainChain(chainKey: string): Promise<{ success: boolean; currentChain: BlockchainChainInfo }> {
  return requestJson('/api/blockchain/select-chain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainKey }),
  });
}

export async function getBlockchainQuote(tokenIn: string, tokenOut: string, amountIn: string): Promise<{
  success: boolean;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  expectedOut: string;
  path: string[];
}> {
  return requestJson('/api/blockchain/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenIn, tokenOut, amountIn }),
  });
}

export async function executeBlockchainSwap(tokenIn: string, tokenOut: string, amountIn: string, slippageBps?: number): Promise<{
  success: boolean;
  result: {
    hash: string;
    status: string;
    blockNumber: number;
    gasUsed: string;
    explorerHint: string;
  };
}> {
  return requestJson('/api/blockchain/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenIn, tokenOut, amountIn, slippageBps }),
  });
}

// --- LIQUIDGIRAFFE8 / METATRADER-5-PLUS-EDGE (PYTHON) API ---
export interface MT5TerminalInfo {
  login: number;
  server: string;
  company: string;
  terminalPath: string;
  connected: boolean;
  pingMs: number;
  leverage: number;
  balance: number;
  equity: number;
  marginFree: number;
  currency: string;
  tradeAllowed: boolean;
}

export interface MT5RiskConfig {
  riskPercentPerTrade: number;
  maxDailyDrawdownPct: number;
  maxOpenPositions: number;
  maxSpreadPoints: number;
  trailingStopEnabled: boolean;
  trailingActivationPoints: number;
  trailingStepPoints: number;
  magicNumber: number;
  selectedStrategy: 'Quantum M1 Pro Scalper' | 'Quantum Trend Wave' | 'SuperTrend Multi-EMA' | 'Bollinger Breakout';
}

export interface MT5ScannerSymbol {
  symbol: string;
  category: 'Forex' | 'Crypto' | 'Metals' | 'Indices';
  bid: number;
  ask: number;
  spreadPoints: number;
  rsi14: number;
  atr14: number;
  emaTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  signalConfidence: number;
  signalReason: string;
  lastUpdate: string;
}

export interface MT5Position {
  ticket: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  pnl: number;
  pnlPercent: number;
  magic: number;
  openTime: string;
  comment: string;
}

export interface MT5EdgeLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
  source: 'MT5Terminal' | 'PythonBot' | 'RiskManager' | 'Scanner' | 'Execution';
  message: string;
}

export interface MT5EdgeStatus {
  isRunning: boolean;
  isConnected: boolean;
  repo: string;
  version: string;
  pythonRuntime: string;
  terminal: MT5TerminalInfo;
  riskConfig: MT5RiskConfig;
  activePositionsCount: number;
  dailyPnl: number;
  dailyDrawdownPct: number;
  totalTradesToday: number;
  winRateToday: number;
  uptimeSeconds: number;
  lastAuditTime: string;
}

export interface MT5SourceCode {
  mainScript: string;
  riskManagerScript: string;
  strategyScript: string;
  requirementsTxt: string;
  envExample: string;
  readmeMd: string;
  bot09Mql5EA?: string;
}

export async function fetchMT5EdgeStatus(): Promise<MT5EdgeStatus> {
  return requestJson<MT5EdgeStatus>('/api/mt5-edge/status');
}

export async function connectMT5Edge(params: { login?: number; server?: string; terminalPath?: string }): Promise<{ success: boolean; message: string }> {
  return requestJson('/api/mt5-edge/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function disconnectMT5Edge(): Promise<{ success: boolean; message: string }> {
  return requestJson('/api/mt5-edge/disconnect', { method: 'POST' });
}

export async function startMT5EdgeTrading(): Promise<{ success: boolean; message: string }> {
  return requestJson('/api/mt5-edge/start', { method: 'POST' });
}

export async function stopMT5EdgeTrading(): Promise<{ success: boolean; message: string }> {
  return requestJson('/api/mt5-edge/stop', { method: 'POST' });
}

export async function updateMT5EdgeConfig(config: Partial<MT5RiskConfig>): Promise<MT5RiskConfig> {
  return requestJson<MT5RiskConfig>('/api/mt5-edge/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export async function fetchMT5EdgeScanner(): Promise<MT5ScannerSymbol[]> {
  return requestJson<MT5ScannerSymbol[]>('/api/mt5-edge/scanner');
}

export async function fetchMT5EdgePositions(): Promise<MT5Position[]> {
  return requestJson<MT5Position[]>('/api/mt5-edge/positions');
}

export async function closeMT5EdgePosition(ticket: number): Promise<{ success: boolean; message: string; closedPosition?: MT5Position }> {
  return requestJson(`/api/mt5-edge/positions/${ticket}/close`, { method: 'POST' });
}

export async function closeAllMT5EdgePositions(): Promise<{ success: boolean; closedCount: number; totalPnl: number }> {
  return requestJson('/api/mt5-edge/positions/close-all', { method: 'POST' });
}

export async function sendMT5EdgeOrder(order: { symbol: string; side: 'BUY' | 'SELL'; volume: number; slPoints?: number; tpPoints?: number; comment?: string }): Promise<{ success: boolean; position: MT5Position }> {
  return requestJson('/api/mt5-edge/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });
}

export async function fetchMT5EdgeLogs(): Promise<MT5EdgeLog[]> {
  return requestJson<MT5EdgeLog[]>('/api/mt5-edge/logs');
}

export async function fetchMT5EdgeSourceCode(): Promise<MT5SourceCode> {
  return requestJson<MT5SourceCode>('/api/mt5-edge/source-code');
}

// ============================================================================
// On-Chain EVM Real Integration API
// ============================================================================

export interface OnchainChainItem {
  key: string;
  name: string;
  env: 'mainnet' | 'testnet';
  chainId: number;
  nativeSymbol: string;
  rpcUrls: string[];
  wrappedNative: string;
  dexRouter: string | null;
  dexName: string;
  explorer: string;
  verification?: 'verified' | 'unverified' | 'invalid';
  verificationDetail?: string;
}

export interface OnchainStatusResponse {
  wallet: {
    hasKey: boolean;
    address: string | null;
    chainKey: string;
    chainName: string;
    chainId: number;
    env: 'mainnet' | 'testnet';
    liveAllowed: boolean;
    maxNotionalUsd: number;
    infiniteApproval: boolean;
    forceMultihop: boolean;
    confirmations: number;
    configuredTokens: number;
  };
  rpc: {
    connected: boolean;
    rpcUrl?: string;
    chainId?: number;
    blockNumber?: number;
    latencyMs: number;
    error?: string;
  };
  tokens: Array<{
    symbol: string;
    address: string;
    decimals: number;
  }>;
}

export interface OnchainBalancesResponse {
  chain: string;
  walletAddress: string;
  native: {
    symbol: string;
    formatted: string;
    wei: string;
    provenance: string;
  };
  tokens: Array<{
    symbol: string;
    balance: string;
    formatted: string;
    decimals: number;
    allowance: string;
    allowanceFormatted: string;
    address: string;
  }>;
}

export interface OnchainQuoteRequest {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippagePercent?: number;
}

export interface OnchainQuoteResponse {
  tokenIn: { symbol: string; address: string; decimals: number };
  tokenOut: { symbol: string; address: string; decimals: number };
  amountIn: string;
  amountInRaw: string;
  amountOut: string;
  amountOutRaw: string;
  amountOutMin: string;
  amountOutMinRaw: string;
  slippagePercent: number;
  path: string[];
  dexName: string;
  dexRouter: string;
  provenance: string;
}

export interface OnchainSwapRequest {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippagePercent?: number;
  recipient?: string;
  confirm?: boolean;
  dryRun?: boolean;
}

export interface OnchainSwapResponse {
  success: boolean;
  dryRun: boolean;
  chain: string;
  txHash: string | null;
  explorerUrl: string | null;
  amountIn: string;
  amountOutEstimated: string;
  amountOutActual?: string;
  gasUsed?: string;
  effectiveGasPriceGwei?: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVERTED' | 'DRY_RUN';
  error?: string;
}

export async function fetchOnchainChains(): Promise<{ activeChain: string; chains: OnchainChainItem[] }> {
  return requestJson('/api/onchain/chains');
}

export async function fetchOnchainStatus(): Promise<OnchainStatusResponse> {
  return requestJson('/api/onchain/status');
}

export async function switchOnchainChain(chainKey: string): Promise<{ success: boolean; chain: any }> {
  return requestJson('/api/onchain/chain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainKey }),
  });
}

export async function verifyOnchainRouter(chainKey?: string): Promise<{
  chain: string;
  status: 'verified' | 'invalid' | 'unverified';
  detail: string;
  router: string | null;
  dexName: string;
}> {
  return requestJson('/api/onchain/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainKey }),
  });
}

export async function fetchOnchainBalances(tokens?: string[]): Promise<OnchainBalancesResponse> {
  const query = tokens && tokens.length > 0 ? `?tokens=${tokens.join(',')}` : '';
  return requestJson(`/api/onchain/balances${query}`);
}

export async function fetchOnchainQuote(params: OnchainQuoteRequest): Promise<OnchainQuoteResponse> {
  return requestJson('/api/onchain/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function executeOnchainSwap(params: OnchainSwapRequest): Promise<OnchainSwapResponse> {
  return requestJson('/api/onchain/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function fetchOnchainTx(hash: string): Promise<{
  hash: string;
  found: boolean;
  status: string;
  blockNumber?: number;
  confirmations?: number;
  explorerUrl?: string;
}> {
  return requestJson(`/api/onchain/tx/${hash}`);
}

export async function anchorOnchainAudit(reason?: string): Promise<{
  success: boolean;
  txHash: string;
  auditHeadHash: string;
  explorerUrl: string;
}> {
  return requestJson('/api/onchain/audit/anchor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

export async function fetchOnchainAuditIntegrity(): Promise<{
  valid: boolean;
  totalRecords: number;
  headHash: string | null;
  error?: string;
}> {
  return requestJson('/api/onchain/audit/integrity');
}








