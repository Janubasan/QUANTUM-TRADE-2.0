import fs from 'fs';
import path from 'path';
import {
  Account,
  Bot,
  Trade,
  SignalExperience,
  SystemLog,
  Ticker,
  WebhookAuditLog,
  SessionStats,
  HourlyBucket,
} from '../../src/types.js';
import { realisticExecutionService } from '../services/realisticExecutionService.js';
import { firebaseService } from '../services/firebaseService.js';

export interface SessionInfo {
  sessionStartTime: number;
  sessionStartedAt: string;
  isTimerRunning: boolean;
  lastClockTick: string;
}

export interface AppState {
  accounts: Account[];
  bots: Bot[];
  trades: Trade[];
  signals: SignalExperience[];
  logs: SystemLog[];
  tickers: Record<string, Ticker>;
  webhookAudits: WebhookAuditLog[];
  sessionInfo: SessionInfo;
}


// Initial mock market tickers in USD/USDT (updated in real-time)
const initialTickers: Record<string, Ticker> = {
  'BTC/USDT': {
    symbol: 'BTC/USDT',
    price: 64250.0,
    change24h: 2.1,
    high24h: 65100.0,
    low24h: 63100.0,
    volume24h: 4200000000,
    updatedAt: new Date().toISOString(),
  },
  'ETH/USDT': {
    symbol: 'ETH/USDT',
    price: 3450.0,
    change24h: -0.4,
    high24h: 3520.0,
    low24h: 3410.0,
    volume24h: 1900000000,
    updatedAt: new Date().toISOString(),
  },
  'SOL/USDT': {
    symbol: 'SOL/USDT',
    price: 154.8,
    change24h: 5.4,
    high24h: 159.0,
    low24h: 148.0,
    volume24h: 820000000,
    updatedAt: new Date().toISOString(),
  },
  'SPY': {
    symbol: 'SPY',
    price: 588.5,
    change24h: 0.85,
    high24h: 591.2,
    low24h: 584.0,
    volume24h: 3500000000,
    updatedAt: new Date().toISOString(),
  },
  'QQQ': {
    symbol: 'QQQ',
    price: 512.3,
    change24h: 1.15,
    high24h: 516.0,
    low24h: 508.5,
    volume24h: 2800000000,
    updatedAt: new Date().toISOString(),
  },
  'BTC/USD': {
    symbol: 'BTC/USD',
    price: 64240.0,
    change24h: 2.05,
    high24h: 65090.0,
    low24h: 63080.0,
    volume24h: 2100000000,
    updatedAt: new Date().toISOString(),
  },
};

// Initial Single $100 USD Demo Account (Exact $100.00 base, USD currency)
const initialAccounts: Account[] = [
  {
    id: 'acc-demo-1',
    name: 'Desafio $100 USD Demo (Simulado)',
    broker: 'binance',
    type: 'demo',
    initialBalance: 100.0,
    currentBalance: 100.0,
    baseCurrency: 'USD',
    isActive: true,
    createdAt: new Date().toISOString(),
    totalTrades: 0,
    winningTrades: 0,
    pnlTotal: 0.0,
  },
];

// Initial Bots - Calibrated strictly for Audited Timeframes (1m, 5m, 10m, 15m, 30m, 1h) in USD
const initialBots: Bot[] = [
  {
    id: 'bot-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio $100 USD Demo (Simulado)',
    accountType: 'demo',
    name: 'Quantum M1 Pro Scalper (Audit 1m)',
    strategy: 'm1_pro',
    config: {
      symbol: 'BTC/USDT',
      timeframe: '1m',
      riskPercent: 0.5,
      tpRatio: 2.0,
      slRatio: 1.0,
    },
    status: 'running',
    createdAt: new Date().toISOString(),
    totalTrades: 0,
    pnlTotal: 0.0,
    winRate: 0.0,
    lastExecutionTime: new Date().toISOString(),
    lastLog: 'Bot inicializado na banca de $ 100.00 USD. Timeframe Auditado 1m ativo.',
  },
  {
    id: 'bot-regime-desk-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio $100 USD Demo (Simulado)',
    accountType: 'demo',
    name: 'Multi-Agent Regime Desk (Audit 5m)',
    strategy: 'multi_agent_regime_desk',
    config: {
      symbol: 'BTC/USDT',
      timeframe: '5m',
      riskPercent: 0.5,
      tpRatio: 2.0,
      slRatio: 1.0,
      customParams: {
        regimeSwitch: 1,
        bullBearDebate: 1,
        redTeamVeto: 1,
        meanReversionEnabled: 1,
      },
    },
    status: 'running',
    createdAt: new Date().toISOString(),
    totalTrades: 0,
    pnlTotal: 0.0,
    winRate: 0.0,
    lastExecutionTime: new Date().toISOString(),
    lastLog: 'Multi-Agent Regime Desk ativo no Timeframe Auditado 5m (USD).',
  },
  {
    id: 'bot-eth-wave-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio $100 USD Demo (Simulado)',
    accountType: 'demo',
    name: 'ETH Quantum Trend Wave (Audit 10m)',
    strategy: 'momentum',
    config: {
      symbol: 'ETH/USDT',
      timeframe: '10m',
      riskPercent: 0.5,
      tpRatio: 2.2,
      slRatio: 1.0,
    },
    status: 'running',
    createdAt: new Date().toISOString(),
    totalTrades: 0,
    pnlTotal: 0.0,
    winRate: 0.0,
    lastExecutionTime: new Date().toISOString(),
    lastLog: 'ETH Quantum Trend Wave ativo no Timeframe Auditado 10m (USD).',
  },
  {
    id: 'bot-quant-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio $100 USD Demo (Simulado)',
    accountType: 'demo',
    name: 'Quant-Bot ORB & Monte Carlo (Audit 15m)',
    strategy: 'quant_orb_15m',
    config: {
      symbol: 'BTC/USDT',
      timeframe: '15m',
      riskPercent: 0.4,
      tpRatio: 2.5,
      slRatio: 1.0,
      customParams: {
        dailyStopFixed: 800,
        passTarget: 6000,
        maxTrailingDrawdown: 3000,
        mcSimulations: 500,
      },
    },
    status: 'running',
    createdAt: new Date().toISOString(),
    totalTrades: 0,
    pnlTotal: 0.0,
    winRate: 0.0,
    lastExecutionTime: new Date().toISOString(),
    lastLog: 'Quant-Bot (ORB 15m) ativo no Timeframe Auditado 15m ($ USD).',
  },
  {
    id: 'bot-sol-breakout-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio $100 USD Demo (Simulado)',
    accountType: 'demo',
    name: 'SOL Momentum Breakout (Audit 30m)',
    strategy: 'momentum',
    config: {
      symbol: 'SOL/USDT',
      timeframe: '30m',
      riskPercent: 0.5,
      tpRatio: 2.5,
      slRatio: 1.0,
    },
    status: 'running',
    createdAt: new Date().toISOString(),
    totalTrades: 0,
    pnlTotal: 0.0,
    winRate: 0.0,
    lastExecutionTime: new Date().toISOString(),
    lastLog: 'SOL Momentum Breakout ativo no Timeframe Auditado 30m ($ USD).',
  },
  {
    id: 'bot-btc-macro-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio $100 USD Demo (Simulado)',
    accountType: 'demo',
    name: 'BTC Macro Trend Sentinel (Audit 1h)',
    strategy: 'grid',
    config: {
      symbol: 'BTC/USDT',
      timeframe: '1h',
      riskPercent: 0.4,
      tpRatio: 2.5,
      slRatio: 1.0,
    },
    status: 'running',
    createdAt: new Date().toISOString(),
    totalTrades: 0,
    pnlTotal: 0.0,
    winRate: 0.0,
    lastExecutionTime: new Date().toISOString(),
    lastLog: 'BTC Macro Trend Sentinel ativo no Timeframe Auditado 1h ($ USD).',
  },
  {
    id: 'bot-lumibot-killer-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio $100 USD Demo (Simulado)',
    accountType: 'demo',
    name: 'Lumibot Killer Momentum + RSI (Multi-Asset 1h)',
    strategy: 'lumibot_killer_momentum_rsi',
    config: {
      symbol: 'BTC/USDT',
      timeframe: '1h',
      riskPercent: 0.3,
      tpRatio: 2.8,
      slRatio: 1.0,
      customParams: {
        momentumPeriod: 10,
        rsiPeriod: 14,
        rsiOverbought: 70,
        rsiOversold: 30,
        maxPositions: 2,
        riskPerTrade: 0.25,
        symbols: 'BTC/USDT, ETH/USDT, SOL/USDT, SPY, QQQ',
        engine: 'Lumibot v3 (YahooDataBacktesting / Alpaca)',
        githubRepo: 'https://github.com/Lumiwealth/lumibot',
      },
    },
    status: 'running',
    createdAt: new Date().toISOString(),
    totalTrades: 0,
    pnlTotal: 0.0,
    winRate: 0.0,
    lastExecutionTime: new Date().toISOString(),
    lastLog: '🤖 Lumibot Killer Strategy ativo: Momentum 10p + RSI 14 filter (<70) + Risk Sizing 25% ($ USD).',
  },
  {
    id: 'bot-lumibot-signal-strategy-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio $100 USD Demo (Simulado)',
    accountType: 'demo',
    name: 'Lumibot SignalStrategy (Composite RSI/MACD/BB)',
    strategy: 'lumibot_signal_strategy',
    config: {
      symbol: 'BTC/USDT',
      timeframe: '1h',
      riskPercent: 0.5,
      tpRatio: 2.6,
      slRatio: 1.0,
      customParams: {
        symbols: 'SPY, QQQ, BTC/USDT, ETH/USDT, SOL/USDT',
        cashAtRiskPerTrade: 0.10,
        lookbackBars: 60,
        sleeptime: '1D',
        engine: 'Lumibot Strategy Engine (Alpaca / CCXT / IB / Binance)',
        githubRepo: 'https://github.com/Lumiwealth/lumibot',
        indicatorsSource: 'indicators.composite_signal()',
      },
    },
    status: 'running',
    createdAt: new Date().toISOString(),
    totalTrades: 0,
    pnlTotal: 0.0,
    winRate: 0.0,
    lastExecutionTime: new Date().toISOString(),
    lastLog: '🤖 Lumibot SignalStrategy ativo: composite_signal(RSI/MACD/BB) + 10% cash_at_risk + Multi-Broker ($ USD).',
  },
  {
    id: 'bot-09-mtf-trend-ea',
    accountId: 'acc-demo-1',
    accountName: 'Desafio $100 USD Demo (Simulado)',
    accountType: 'demo',
    name: 'MultiTimeframeTrendEA (Bot 09 - Prop Firm MTF Trend + Fib + AI)',
    strategy: 'multi_timeframe_trend_ea',
    config: {
      symbol: 'BTC/USDT',
      timeframe: '1h',
      riskPercent: 0.5,
      tpRatio: 3.0,
      slRatio: 1.0,
      customParams: {
        magicNumber: 20260903,
        emaFast: 10,
        emaSlow: 23,
        fibBuyLevel: 12.7,
        fibSellLevel1: 88.6,
        fibSellLevel2: 88.7,
        fibSwingBars: 20,
        usePinBar: 1,
        useEngulfing: 1,
        useInsideBar: 1,
        breakevenTriggerPips: 30,
        breakevenOffsetPips: 5,
        trailingStartPips: 40,
        trailingStepPips: 10,
        atrPeriod: 14,
        maxDailyLossPct: 5.0,
        maxDrawdownPct: 10.0,
        maxTradesPerDay: 5,
        newsCurrencies: 'USD,EUR,GBP',
        newsMinutesWindow: 30,
        aiOnnxModel: 'model.onnx',
        aiThreshold: 0.6,
      },
    },
    status: 'running',
    createdAt: new Date().toISOString(),
    totalTrades: 0,
    pnlTotal: 0.0,
    winRate: 0.0,
    lastExecutionTime: new Date().toISOString(),
    lastLog: '🟢 Bot 09 MultiTimeframeTrendEA ativo e rodando: Alinhamento MN1/W1/D1 + Confirmação H4/H1 + Fib 12.7%/88.6% + Trailing ATR + Proteção Prop Firm (Magic #20260903).',
  },
];

// Initial trades
const initialTrades: Trade[] = [];

// Initial Signal Experiences
const initialSignals: SignalExperience[] = [];

const initialLogs: SystemLog[] = [
  {
    id: 'log-1',
    timestamp: new Date().toISOString(),
    type: 'INFO',
    message: 'Sistema Quantum Trade ativado em Dólar (USD). Banca inicial calibrada em $ 100.00 USD.',
  },
  {
    id: 'log-2',
    timestamp: new Date().toISOString(),
    type: 'RULE',
    message: 'Regra de Lucro Stockraft ativada: Riscos calibrados estritamente em Dólar ($ USD) com base no capital inicial.',
  },
];

const PERSISTENT_FILE_PATH = path.join(process.cwd(), 'server', 'data', 'persistent_state.json');

export class DataStore {
  private state: AppState;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.state = this.loadPersistentState();
  }

  private loadPersistentState(): AppState {
    const defaultSession: SessionInfo = {
      sessionStartTime: Date.now(),
      sessionStartedAt: new Date().toISOString(),
      isTimerRunning: true,
      lastClockTick: new Date().toISOString(),
    };

    const defaultState: AppState = {
      accounts: [...initialAccounts],
      bots: [...initialBots],
      trades: [...initialTrades],
      signals: [...initialSignals],
      logs: [...initialLogs],
      tickers: { ...initialTickers },
      webhookAudits: [],
      sessionInfo: defaultSession,
    };

    try {
      if (fs.existsSync(PERSISTENT_FILE_PATH)) {
        const raw = fs.readFileSync(PERSISTENT_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.accounts) && parsed.accounts.length > 0) {
          const parsedTrades: Trade[] = parsed.trades || defaultState.trades;
          console.log(`📦 [DataStore] Estado carregado com sucesso do disco: ${parsedTrades.length} trades persistidas.`);

          // Migrate legacy BRL or duplicate initial accounts to USD $100 standard
          let migratedAccounts: Account[] = parsed.accounts.map((acc: Account) => {
            const accClosedTrades = parsedTrades.filter(
              (t) => t.status === 'closed' && (t.accountId === acc.id || acc.id === 'acc-demo-1')
            );
            const calculatedPnl = Number(
              accClosedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0).toFixed(2)
            );
            const initialBal = typeof acc.initialBalance === 'number' && acc.initialBalance > 0 ? acc.initialBalance : 100.0;
            const finalPnl = typeof acc.pnlTotal === 'number' && !isNaN(acc.pnlTotal) ? acc.pnlTotal : calculatedPnl;
            const currentBal =
              typeof acc.currentBalance === 'number' && !isNaN(acc.currentBalance) && acc.currentBalance > 0
                ? acc.currentBalance
                : Number((initialBal + finalPnl).toFixed(2));

            return {
              ...acc,
              initialBalance: initialBal,
              currentBalance: currentBal,
              pnlTotal: finalPnl,
              totalTrades: acc.totalTrades || accClosedTrades.length,
              winningTrades: acc.winningTrades || accClosedTrades.filter((t) => t.pnl > 0).length,
              baseCurrency: 'USD' as const,
              name: (acc.name || 'Desafio $100 USD Demo (Simulado)').replace('R$100', '$100 USD').replace('R$ 100', '$100 USD'),
            };
          });

          // If legacy state had 2 default starter accounts summing to 200, unify into single $100 USD demo account with preserved PnL
          if (
            migratedAccounts.length === 2 &&
            migratedAccounts.some((a) => a.id === 'acc-coinbase-btc') &&
            migratedAccounts.some((a) => a.id === 'acc-demo-1')
          ) {
            const accClosedTrades = parsedTrades.filter((t) => t.status === 'closed');
            const totalPnl = Number(accClosedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0).toFixed(2));
            const totalTradesCount = accClosedTrades.length;
            const winningTradesCount = accClosedTrades.filter((t) => t.pnl > 0).length;

            migratedAccounts = [
              {
                id: 'acc-demo-1',
                name: 'Desafio $100 USD Demo (Simulado)',
                broker: 'binance',
                type: 'demo',
                initialBalance: 100.0,
                currentBalance: Number((100.0 + totalPnl).toFixed(2)),
                baseCurrency: 'USD',
                isActive: true,
                createdAt: new Date().toISOString(),
                totalTrades: totalTradesCount,
                winningTrades: winningTradesCount,
                pnlTotal: totalPnl,
              },
            ];
          }
          
          // Merge any newly introduced initial bots if they don't exist in persistent state yet
          const existingBotIds = new Set((parsed.bots || []).map((b: Bot) => b.id));
          const mergedBots = [...(parsed.bots || [])];
          for (const initBot of initialBots) {
            if (!existingBotIds.has(initBot.id)) {
              mergedBots.push(initBot);
            }
          }

          // Ensure bot symbol & descriptions are in USD / USDT
          mergedBots.forEach((b: Bot) => {
            if (b.config.symbol && b.config.symbol.includes('/BRL')) {
              b.config.symbol = b.config.symbol.replace('/BRL', '/USDT');
            }
          });

          return {
            accounts: migratedAccounts,
            bots: mergedBots,
            trades: parsedTrades,
            signals: parsed.signals || defaultState.signals,
            logs: parsed.logs || defaultState.logs,
            tickers: { ...initialTickers, ...(parsed.tickers || {}) },
            webhookAudits: parsed.webhookAudits || [],
            sessionInfo: parsed.sessionInfo || defaultSession,
          };
        }
      }
    } catch (e: any) {
      console.warn('⚠️ [DataStore] Erro ao carregar persistent_state.json, inicializando padrão:', e.message);
    }

    return defaultState;
  }

  /**
   * Hidrata o estado a partir do cofre Firestore (Cloud Persistence)
   */
  public async hydrateFromCloudVault() {
    try {
      const cloudData = await firebaseService.loadPlatformVault();
      if (cloudData && Array.isArray(cloudData.accounts) && cloudData.accounts.length > 0) {
        console.log('🔥 [DataStore] Sincronizando estado persistente com cofre Firestore...');
        const cloudTrades: Trade[] = cloudData.trades || [];
        const localTradesCount = this.state.trades.length;

        if (cloudTrades.length >= localTradesCount || cloudData.updatedAt) {
          if (cloudData.sessionInfo && cloudData.sessionInfo.sessionStartTime) {
            this.state.sessionInfo = cloudData.sessionInfo;
          }
          if (cloudTrades.length > 0) {
            const existingTradeIds = new Set(this.state.trades.map((t) => t.id));
            for (const ct of cloudTrades) {
              if (!existingTradeIds.has(ct.id)) {
                this.state.trades.push(ct);
              }
            }
          }
          if (Array.isArray(cloudData.accounts) && cloudData.accounts.length > 0) {
            this.state.accounts = cloudData.accounts.map((acc: Account) => ({
              ...acc,
              initialBalance: typeof acc.initialBalance === 'number' && acc.initialBalance > 0 ? acc.initialBalance : 100.0,
              baseCurrency: 'USD' as const,
            }));
          }
          this.reconcileAccountsWithTrades();
          this.savePersistentState();
          console.log(
            `✅ [DataStore] Cofre Firestore hidratado com sucesso: Saldo atualizado para $ ${this.state.accounts[0]?.currentBalance.toFixed(2)} USD.`
          );
        }
      }
    } catch (err: any) {
      console.warn('⚠️ [DataStore] Aviso ao hidratar cofre cloud:', err.message);
    }
  }

  /**
   * Reconcilia os saldos das contas com base nas trades fechadas reais
   */
  public reconcileAccountsWithTrades() {
    const closedTrades = this.state.trades.filter((t) => t.status === 'closed');
    for (const acc of this.state.accounts) {
      acc.initialBalance = typeof acc.initialBalance === 'number' && acc.initialBalance > 0 ? acc.initialBalance : 100.0;
      const accTrades = closedTrades.filter((t) => t.accountId === acc.id || this.state.accounts.length === 1);
      const calculatedPnl = Number(accTrades.reduce((sum, t) => sum + (t.pnl || 0), 0).toFixed(2));
      const winningCount = accTrades.filter((t) => t.pnl > 0).length;
      acc.totalTrades = Math.max(acc.totalTrades, accTrades.length);
      acc.winningTrades = Math.max(acc.winningTrades, winningCount);
      acc.pnlTotal = typeof acc.pnlTotal === 'number' && !isNaN(acc.pnlTotal) ? acc.pnlTotal : calculatedPnl;
      acc.currentBalance = Number((acc.initialBalance + acc.pnlTotal).toFixed(2));
    }
  }

  public savePersistentState() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      try {
        const dir = path.dirname(PERSISTENT_FILE_PATH);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const dataToSave = {
          accounts: this.state.accounts,
          bots: this.state.bots,
          trades: this.state.trades.slice(0, 1000), // Manter até 1000 trades persistidas
          signals: this.state.signals.slice(0, 300),
          logs: this.state.logs.slice(0, 300),
          sessionInfo: this.state.sessionInfo,
          webhookAudits: this.state.webhookAudits.slice(0, 100),
          savedAt: new Date().toISOString(),
        };
        fs.writeFileSync(PERSISTENT_FILE_PATH, JSON.stringify(dataToSave, null, 2), 'utf-8');
        
        // Sync to cloud Firestore vault asynchronously for non-volatile storage
        firebaseService.savePlatformVault(dataToSave).catch((e) => {
          console.debug('Cloud sync background tick:', e?.message || e);
        });
      } catch (err: any) {
        console.error('❌ [DataStore] Falha ao persistir dados em disco:', err.message);
      }
    }, 150); // Gravação quase imediata com debounce de 150ms
  }

  getState(): AppState {
    return this.state;
  }

  getSessionInfo(): SessionInfo {
    return this.state.sessionInfo;
  }

  resetSessionClock() {
    this.state.sessionInfo = {
      sessionStartTime: Date.now(),
      sessionStartedAt: new Date().toISOString(),
      isTimerRunning: true,
      lastClockTick: new Date().toISOString(),
    };
    this.savePersistentState();
    return this.state.sessionInfo;
  }

  toggleSessionTimer(running?: boolean): SessionInfo {
    this.state.sessionInfo.isTimerRunning =
      running !== undefined ? running : !this.state.sessionInfo.isTimerRunning;
    this.state.sessionInfo.lastClockTick = new Date().toISOString();
    this.savePersistentState();
    return this.state.sessionInfo;
  }

  addWebhookAudit(audit: WebhookAuditLog) {
    this.state.webhookAudits.unshift(audit);
    if (this.state.webhookAudits.length > 200) {
      this.state.webhookAudits.pop();
    }
    this.savePersistentState();
  }

  getAccount(id: string): Account | undefined {
    return this.state.accounts.find((a) => a.id === id);
  }

  updateAccount(updated: Account) {
    const idx = this.state.accounts.findIndex((a) => a.id === updated.id);
    if (idx !== -1) {
      this.state.accounts[idx] = updated;
    } else {
      this.state.accounts.push(updated);
    }
    this.savePersistentState();
  }

  addAccount(account: Account) {
    this.state.accounts.unshift(account);
    this.savePersistentState();
  }

  deleteAccount(id: string) {
    this.state.accounts = this.state.accounts.filter((a) => a.id !== id);
    this.savePersistentState();
  }

  getBot(id: string): Bot | undefined {
    return this.state.bots.find((b) => b.id === id);
  }

  addBot(bot: Bot) {
    this.state.bots.unshift(bot);
    this.savePersistentState();
  }

  updateBot(updated: Bot) {
    const idx = this.state.bots.findIndex((b) => b.id === updated.id);
    if (idx !== -1) {
      this.state.bots[idx] = updated;
    }
    this.savePersistentState();
  }

  deleteBot(id: string) {
    this.state.bots = this.state.bots.filter((b) => b.id !== id);
    this.savePersistentState();
  }

  toggleAllBots(running: boolean) {
    const status = running ? 'running' : 'paused';
    this.state.bots.forEach((b) => {
      b.status = status;
      b.lastLog = running
        ? `[SISTEMA GLOBAL] Bot ativado via Chave Geral Ligar/Desligar.`
        : `[SISTEMA GLOBAL] Bot pausado via Chave Geral Ligar/Desligar.`;
    });
    this.savePersistentState();
  }

  resetDataStore() {
    this.state.accounts = [
      {
        id: 'acc-demo-1',
        name: 'Desafio $100 USD Demo (Simulado)',
        broker: 'binance',
        type: 'demo',
        initialBalance: 100.0,
        currentBalance: 100.0,
        baseCurrency: 'USD',
        isActive: true,
        createdAt: new Date().toISOString(),
        totalTrades: 0,
        winningTrades: 0,
        pnlTotal: 0.0,
      },
    ];
    this.state.trades = [];
    this.state.signals = [];
    this.resetSessionClock();
    realisticExecutionService.resetCounts();
    this.state.bots = JSON.parse(JSON.stringify(initialBots));
    this.addLog('INFO', 'Sistema resetado: Conta única calibrada com sucesso em $ 100.00 USD.');
    this.savePersistentState();
  }

  addTrade(trade: Trade) {
    const existingIndex = this.state.trades.findIndex((t) => t.id === trade.id);
    if (existingIndex !== -1) {
      this.state.trades[existingIndex] = trade;
      this.savePersistentState();
      return;
    }
    this.state.trades.unshift(trade);
    if (this.state.trades.length > 1000) {
      this.state.trades.pop();
    }
    this.savePersistentState();
  }

  updateTrade(updated: Trade) {
    const idx = this.state.trades.findIndex((t) => t.id === updated.id);
    if (idx !== -1) {
      // Calculate duration in seconds if entryTime and closeTime are present
      if (updated.entryTime && (updated.closeTime || updated.exitTime)) {
        const start = new Date(updated.entryTime).getTime();
        const end = new Date(updated.closeTime || updated.exitTime || '').getTime();
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          updated.durationSeconds = Math.max(1, Math.round((end - start) / 1000));
        }
      }
      if (updated.closeTime || updated.exitTime) {
        const d = new Date(updated.closeTime || updated.exitTime || '');
        if (!isNaN(d.getTime())) {
          updated.clockHour = `${d.getHours().toString().padStart(2, '0')}:00`;
        }
      }
      this.state.trades[idx] = updated;
    }
    this.savePersistentState();
  }

  addSignal(signal: SignalExperience) {
    this.state.signals.unshift(signal);
    this.savePersistentState();
  }

  addLog(type: SystemLog['type'], message: string, details?: Record<string, unknown>) {
    const logItem: SystemLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      type,
      message,
      details,
    };
    this.state.logs.unshift(logItem);
    if (this.state.logs.length > 300) {
      this.state.logs.pop();
    }
    this.savePersistentState();
    return logItem;
  }

  updateTicker(symbol: string, price: number, change24h: number) {
    const existing = this.state.tickers[symbol];
    if (existing) {
      existing.price = price;
      existing.change24h = change24h;
      existing.updatedAt = new Date().toISOString();
      if (price > existing.high24h) existing.high24h = price;
      if (price < existing.low24h) existing.low24h = price;
    } else {
      this.state.tickers[symbol] = {
        symbol,
        price,
        change24h,
        high24h: price * 1.02,
        low24h: price * 0.98,
        volume24h: 1000000,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Calcula estatísticas precisas de operações por hora (Trading Clock Analytics)
   */
  getHourlyStats(): SessionStats {
    const now = Date.now();
    const sessionStart = this.state.sessionInfo?.sessionStartTime || now;
    const sessionSeconds = Math.max(0, Math.floor((now - sessionStart) / 1000));
    const sessionHours = Math.max(0.05, sessionSeconds / 3600);

    const allTrades = this.state.trades;
    const closedTrades = allTrades.filter((t) => t.status === 'closed');
    const openTrades = allTrades.filter((t) => t.status === 'open');

    const totalPnl = Number(closedTrades.reduce((acc, t) => acc + (t.pnl || 0), 0).toFixed(2));
    const totalWins = closedTrades.filter((t) => t.pnl > 0).length;
    const overallWinRate = closedTrades.length > 0 ? Number(((totalWins / closedTrades.length) * 100).toFixed(1)) : 0;

    // Ritmo por hora
    const tradesPerHour = Number((closedTrades.length / sessionHours).toFixed(2));
    const pnlPerHour = Number((totalPnl / sessionHours).toFixed(2));

    // Janelas de tempo: última 1h, 4h, 24h
    const oneHourAgo = now - 3600 * 1000;
    const fourHoursAgo = now - 4 * 3600 * 1000;
    const twentyFourHoursAgo = now - 24 * 3600 * 1000;

    const last1hTradesList = closedTrades.filter((t) => {
      const time = new Date(t.closeTime || t.exitTime || t.entryTime).getTime();
      return time >= oneHourAgo;
    });
    const last1HourPnl = Number(last1hTradesList.reduce((acc, t) => acc + (t.pnl || 0), 0).toFixed(2));
    const last1HourTrades = last1hTradesList.length;
    const last1HourWins = last1hTradesList.filter((t) => t.pnl > 0).length;
    const last1HourWinRate = last1HourTrades > 0 ? Number(((last1HourWins / last1HourTrades) * 100).toFixed(1)) : 0;

    const last4hTradesList = closedTrades.filter((t) => {
      const time = new Date(t.closeTime || t.exitTime || t.entryTime).getTime();
      return time >= fourHoursAgo;
    });
    const last4HoursPnl = Number(last4hTradesList.reduce((acc, t) => acc + (t.pnl || 0), 0).toFixed(2));
    const last4HoursTrades = last4hTradesList.length;

    const last24hTradesList = closedTrades.filter((t) => {
      const time = new Date(t.closeTime || t.exitTime || t.entryTime).getTime();
      return time >= twentyFourHoursAgo;
    });
    const last24HoursPnl = Number(last24hTradesList.reduce((acc, t) => acc + (t.pnl || 0), 0).toFixed(2));
    const last24HoursTrades = last24hTradesList.length;

    // Projeções com base no ritmo por hora
    const projected24hPnl = Number((pnlPerHour * 24).toFixed(2));
    const projectedMonthlyPnl = Number((pnlPerHour * 24 * 30).toFixed(2));

    // Agrupamento por baldes de hora (Hourly Buckets)
    const bucketsMap = new Map<string, {
      displayHour: string;
      trades: Trade[];
    }>();

    // Cria as últimas 12 horas como baldes
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now - i * 3600 * 1000);
      const hourNum = d.getHours();
      const hourKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${hourNum.toString().padStart(2, '0')}:00`;
      const nextHourNum = (hourNum + 1) % 24;
      const displayHour = `${hourNum.toString().padStart(2, '0')}:00 - ${nextHourNum.toString().padStart(2, '0')}:00`;
      bucketsMap.set(hourKey, { displayHour, trades: [] });
    }

    // Distribui trades nos baldes correspondentes
    closedTrades.forEach((t) => {
      const date = new Date(t.closeTime || t.exitTime || t.entryTime);
      if (!isNaN(date.getTime())) {
        const hourNum = date.getHours();
        const hourKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${hourNum.toString().padStart(2, '0')}:00`;
        if (bucketsMap.has(hourKey)) {
          bucketsMap.get(hourKey)!.trades.push(t);
        } else {
          // Se for fora das 12h mas recente
          const nextHourNum = (hourNum + 1) % 24;
          bucketsMap.set(hourKey, {
            displayHour: `${hourNum.toString().padStart(2, '0')}:00 - ${nextHourNum.toString().padStart(2, '0')}:00`,
            trades: [t],
          });
        }
      }
    });

    const hourlyBuckets: HourlyBucket[] = Array.from(bucketsMap.entries()).map(([hourKey, b]) => {
      const tradeCount = b.trades.length;
      const wins = b.trades.filter((t) => t.pnl > 0).length;
      const losses = b.trades.filter((t) => t.pnl <= 0).length;
      const pnlTotal = Number(b.trades.reduce((acc, t) => acc + (t.pnl || 0), 0).toFixed(2));
      const pnlPercent = Number(b.trades.reduce((acc, t) => acc + (t.pnlPercent || 0), 0).toFixed(2));
      const winRate = tradeCount > 0 ? Number(((wins / tradeCount) * 100).toFixed(1)) : 0;
      const volumeTotal = Number(b.trades.reduce((acc, t) => acc + (t.entryPrice * t.quantity), 0).toFixed(2));
      const totalDur = b.trades.reduce((acc, t) => acc + (t.durationSeconds || 60), 0);
      const avgDurationSeconds = tradeCount > 0 ? Math.round(totalDur / tradeCount) : 60;

      return {
        hourKey,
        displayHour: b.displayHour,
        tradeCount,
        winCount: wins,
        lossCount: losses,
        pnlTotal,
        pnlPercent,
        winRate,
        volumeTotal,
        avgDurationSeconds,
      };
    });

    return {
      sessionStartTime: sessionStart,
      sessionStartedAt: this.state.sessionInfo?.sessionStartedAt || new Date(sessionStart).toISOString(),
      sessionSeconds,
      isTimerRunning: this.state.sessionInfo?.isTimerRunning ?? true,
      totalTrades: allTrades.length,
      closedTradesCount: closedTrades.length,
      openTradesCount: openTrades.length,
      totalPnl,
      tradesPerHour,
      pnlPerHour,
      winRate: overallWinRate,
      last1HourPnl,
      last1HourTrades,
      last1HourWinRate,
      last4HoursPnl,
      last4HoursTrades,
      last24HoursPnl,
      last24HoursTrades,
      projected24hPnl,
      projectedMonthlyPnl,
      hourlyBuckets,
      dbPersistence: {
        synced: true,
        lastSaved: new Date().toISOString(),
        totalRecords: allTrades.length + this.state.accounts.length + this.state.bots.length,
        filePath: PERSISTENT_FILE_PATH,
      },
    };
  }
}

export const store = new DataStore();
