import { Account, Bot, Trade, SignalExperience, SystemLog, Ticker, WebhookAuditLog } from '../../src/types.js';
import { realisticExecutionService } from '../services/realisticExecutionService.js';

export interface AppState {
  accounts: Account[];
  bots: Bot[];
  trades: Trade[];
  signals: SignalExperience[];
  logs: SystemLog[];
  tickers: Record<string, Ticker>;
  webhookAudits: WebhookAuditLog[];
}


// Initial mock market tickers (updated in real-time)
const initialTickers: Record<string, Ticker> = {
  'BTC/BRL': {
    symbol: 'BTC/BRL',
    price: 345200.0,
    change24h: 2.85,
    high24h: 348900.0,
    low24h: 338100.0,
    volume24h: 182000000,
    updatedAt: new Date().toISOString(),
  },
  'ETH/BRL': {
    symbol: 'ETH/BRL',
    price: 18450.0,
    change24h: -0.92,
    high24h: 18900.0,
    low24h: 18200.0,
    volume24h: 64000000,
    updatedAt: new Date().toISOString(),
  },
  'SOL/BRL': {
    symbol: 'SOL/BRL',
    price: 890.5,
    change24h: 5.4,
    high24h: 915.0,
    low24h: 840.0,
    volume24h: 32000000,
    updatedAt: new Date().toISOString(),
  },
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
};

// Initial accounts
const initialAccounts: Account[] = [
  {
    id: 'acc-demo-1',
    name: 'Desafio R$100 Demo (Simulado)',
    broker: 'binance',
    type: 'demo',
    initialBalance: 100.0,
    currentBalance: 100.0,
    baseCurrency: 'BRL',
    isActive: true,
    createdAt: new Date().toISOString(),
    totalTrades: 0,
    winningTrades: 0,
    pnlTotal: 0.0,
  },
];

// Initial Bots
const initialBots: Bot[] = [
  {
    id: 'bot-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio R$100 Demo (Simulado)',
    accountType: 'demo',
    name: 'Quantum M1 Pro Scalper',
    strategy: 'm1_pro',
    config: {
      symbol: 'BTC/BRL',
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
    lastLog: 'Bot inicializado na banca de R$ 100,00. Aguardando 1ª trade liberada.',
  },
  {
    id: 'bot-quant-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio R$100 Demo (Simulado)',
    accountType: 'demo',
    name: 'Quant-Bot (ORB 15m & Monte Carlo)',
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
    lastLog: 'Quant-Bot ativado. ORB 15m CME Micro Futures com Simulação Monte Carlo (500 runs, 53% pass rate).',
  },
  {
    id: 'bot-orb-enhanced-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio R$100 Demo (Simulado)',
    accountType: 'demo',
    name: 'ORB Agentic Enhanced',
    strategy: 'orb_agentic_enhanced',
    config: {
      symbol: 'BTC/USDT',
      timeframe: '15m',
      riskPercent: 0.4,
      tpRatio: 2.2,
      slRatio: 1.0,
      customParams: {
        atrRatioMax: 1.5,
        minVolumeMult: 1.5,
        retestConfirmation: 1,
        internalCandleBias: 1,
      },
    },
    status: 'running',
    createdAt: new Date().toISOString(),
    totalTrades: 0,
    pnlTotal: 0.0,
    winRate: 0.0,
    lastExecutionTime: new Date().toISOString(),
    lastLog: 'ORB Agentic Enhanced ativo. Filtros: ATR < 1.5x, Volume > 1.5x, Direction Midpoint e Retest no VWAP.',
  },
  {
    id: 'bot-regime-desk-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio R$100 Demo (Simulado)',
    accountType: 'demo',
    name: 'Multi-Agent Regime Desk',
    strategy: 'multi_agent_regime_desk',
    config: {
      symbol: 'BTC/BRL',
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
    lastLog: 'Multi-Agent Regime Desk ativo. Agentes: Supervisor, Technical Analyst, Sentiment Analyst, Red-Team Veto & Risk Gate.',
  },
  {
    id: 'bot-eth-scalp-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio R$100 Demo (Simulado)',
    accountType: 'demo',
    name: 'ETH Quantum Fast Scalper',
    strategy: 'kronos_scalp',
    config: {
      symbol: 'ETH/BRL',
      timeframe: '15s',
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
    lastLog: 'ETH Quantum Fast Scalper ativo. Operando micro-tendências no par ETH/BRL.',
  },
  {
    id: 'bot-sol-breakout-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio R$100 Demo (Simulado)',
    accountType: 'demo',
    name: 'SOL Momentum Breakout Wave',
    strategy: 'momentum',
    config: {
      symbol: 'SOL/BRL',
      timeframe: '30s',
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
    lastLog: 'SOL Momentum Breakout Wave ativo. Rastreando surtos de volatilidade em Solana.',
  },
  {
    id: 'bot-eth-usdt-1',
    accountId: 'acc-demo-1',
    accountName: 'Desafio R$100 Demo (Simulado)',
    accountType: 'demo',
    name: 'ETH/USDT Grid Arbitrage',
    strategy: 'grid',
    config: {
      symbol: 'ETH/USDT',
      timeframe: '1m',
      riskPercent: 0.4,
      tpRatio: 2.0,
      slRatio: 1.0,
    },
    status: 'running',
    createdAt: new Date().toISOString(),
    totalTrades: 0,
    pnlTotal: 0.0,
    winRate: 0.0,
    lastExecutionTime: new Date().toISOString(),
    lastLog: 'ETH/USDT Grid Arbitrage ativo. Executando grades adaptativas de suporte e resistência.',
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
    message: 'Sistema Quantum Trade ativado. Banca inicial calibrada em R$ 100,00 com histórico zerado.',
  },
  {
    id: 'log-2',
    timestamp: new Date().toISOString(),
    type: 'RULE',
    message: 'Regra de Lucro Stockraft ativada: Riscos calibrados estritamente com base no capital inicial.',
  },
];

export class DataStore {
  private state: AppState = {
    accounts: [...initialAccounts],
    bots: [...initialBots],
    trades: [...initialTrades],
    signals: [...initialSignals],
    logs: [...initialLogs],
    tickers: { ...initialTickers },
    webhookAudits: [],
  };

  getState(): AppState {
    return this.state;
  }

  addWebhookAudit(audit: WebhookAuditLog) {
    this.state.webhookAudits.unshift(audit);
    if (this.state.webhookAudits.length > 200) {
      this.state.webhookAudits.pop();
    }
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
  }

  addAccount(account: Account) {
    this.state.accounts.unshift(account);
  }

  deleteAccount(id: string) {
    this.state.accounts = this.state.accounts.filter((a) => a.id !== id);
  }

  getBot(id: string): Bot | undefined {
    return this.state.bots.find((b) => b.id === id);
  }

  addBot(bot: Bot) {
    this.state.bots.unshift(bot);
  }

  updateBot(updated: Bot) {
    const idx = this.state.bots.findIndex((b) => b.id === updated.id);
    if (idx !== -1) {
      this.state.bots[idx] = updated;
    }
  }

  deleteBot(id: string) {
    this.state.bots = this.state.bots.filter((b) => b.id !== id);
  }

  toggleAllBots(running: boolean) {
    const status = running ? 'running' : 'paused';
    this.state.bots.forEach((b) => {
      b.status = status;
      b.lastLog = running
        ? `[SISTEMA GLOBAL] Bot ativado via Chave Geral Ligar/Desligar.`
        : `[SISTEMA GLOBAL] Bot pausado via Chave Geral Ligar/Desligar.`;
    });
  }

  resetDataStore() {
    this.state.accounts = [
      {
        id: 'acc-demo-1',
        name: 'Desafio R$100 Demo (Simulado)',
        broker: 'binance',
        type: 'demo',
        initialBalance: 100.0,
        currentBalance: 100.0,
        baseCurrency: 'BRL',
        isActive: true,
        createdAt: new Date().toISOString(),
        totalTrades: 0,
        winningTrades: 0,
        pnlTotal: 0.0,
      },
    ];
    this.state.trades = [];
    this.state.signals = [];
    realisticExecutionService.resetCounts();
    this.state.bots.forEach((b) => {
      b.totalTrades = 0;
      b.pnlTotal = 0.0;
      b.winRate = 0.0;
      b.status = 'running';
      b.lastLog = 'Robô resetado com sucesso. Pronto para operações 100% calibradas em lucro.';
    });
    this.addLog('INFO', 'Sistema resetado: Contas e robôs reinicializados com sucesso.');
  }

  addTrade(trade: Trade) {
    this.state.trades.unshift(trade);
  }

  updateTrade(updated: Trade) {
    const idx = this.state.trades.findIndex((t) => t.id === updated.id);
    if (idx !== -1) {
      this.state.trades[idx] = updated;
    }
  }

  addSignal(signal: SignalExperience) {
    this.state.signals.unshift(signal);
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
    if (this.state.logs.length > 200) {
      this.state.logs.pop();
    }
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
}

export const store = new DataStore();
