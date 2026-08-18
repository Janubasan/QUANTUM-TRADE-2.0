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
} from '../types.js';

async function requestJson<T>(url: string, options?: RequestInit, retries = 1): Promise<T> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';

    if (!res.ok || !contentType.includes('application/json')) {
      const text = await res.text();
      let errorMessage = `Erro na requisição ${url} (status ${res.status})`;
      try {
        const parsed = JSON.parse(text);
        if (parsed.error) errorMessage = parsed.error;
      } catch {
        if (text.trim().startsWith('<')) {
          errorMessage = `A API ${url} retornou resposta HTML (status ${res.status}).`;
        } else if (text) {
          errorMessage = text;
        }
      }
      throw new Error(errorMessage);
    }

    return await res.json();
  } catch (err: any) {
    // If it's a transient network glitch or dev server cold restart, retry once for GET requests
    const isGet = !options?.method || options.method.toUpperCase() === 'GET';
    if (retries > 0 && isGet && (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError')) {
      await new Promise((r) => setTimeout(r, 400));
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

export async function fetchKillSwitchStatus(): Promise<{ isActive: boolean }> {
  return requestJson<{ isActive: boolean }>('/api/killswitch/status');
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
}> {
  return requestJson('/api/firebase/status');
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
  return requestJson<OperationalGuardStatus>('/api/operational-guard/status');
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





