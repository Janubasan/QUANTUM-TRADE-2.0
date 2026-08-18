import crypto from 'crypto';
import { store } from '../../data/store.js';
import { brokerAudit } from '../../services/brokerAudit.js';
import { commandTtlMs, heartbeatStaleMs } from '../../config/venuePolicy.js';
import {
  Account,
  Trade,
  VenueCommand,
  VenuePosition,
  VenueSession,
} from '../../../src/types.js';
import { fromVenueSymbol } from '../symbolMap.js';

export interface Mt5Heartbeat {
  accountId: string;
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
  positions?: VenuePosition[];
  quotes?: Record<string, number>;
}

export interface Mt5ExecutionReport {
  commandId: string;
  accountId: string;
  status: 'filled' | 'partial' | 'rejected' | 'cancelled';
  ticket?: string;
  deal?: string;
  retcode?: string | number;
  price?: number;
  volume?: number;
  comment?: string;
  profit?: number;
  symbol?: string;
  raw?: Record<string, unknown>;
}

class Mt5Bridge {
  private sessions = new Map<string, VenueSession>();
  private commands = new Map<string, VenueCommand>();

  getSession(accountId: string): VenueSession | undefined {
    const session = this.sessions.get(accountId);
    if (!session) return undefined;
    const stale = Date.now() - new Date(session.lastHeartbeat).getTime() > heartbeatStaleMs();
    return { ...session, connected: session.connected && !stale };
  }

  listSessions(): VenueSession[] {
    return [...this.sessions.values()].map((s) => this.getSession(s.accountId)!).filter(Boolean);
  }

  enqueue(command: Omit<VenueCommand, 'id' | 'createdAt' | 'expiresAt' | 'status' | 'venue'>): VenueCommand {
    const cmd: VenueCommand = {
      ...command,
      id: `mt5-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      venue: 'mt5',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + commandTtlMs()).toISOString(),
      status: 'queued',
    };
    this.commands.set(cmd.id, cmd);
    brokerAudit.append({
      accountId: cmd.accountId,
      venue: 'mt5',
      environment: this.accountEnv(cmd.accountId),
      stage: 'command_queued',
      symbol: cmd.symbol,
      payload: { commandId: cmd.id, action: cmd.action, volume: cmd.volume, sl: cmd.sl, tp: cmd.tp },
    });
    return cmd;
  }

  pullCommands(accountId: string): VenueCommand[] {
    const now = Date.now();
    const ready: VenueCommand[] = [];
    for (const cmd of this.commands.values()) {
      if (cmd.accountId !== accountId) continue;
      if (cmd.status !== 'queued') continue;
      if (new Date(cmd.expiresAt).getTime() < now) {
        cmd.status = 'expired';
        this.failTrade(cmd, 'Comando expirado sem heartbeat do terminal MT5');
        continue;
      }
      cmd.status = 'sent';
      ready.push(cmd);
    }
    return ready;
  }

  heartbeat(payload: Mt5Heartbeat): VenueSession {
    const session: VenueSession = {
      accountId: payload.accountId,
      venue: 'mt5',
      connected: true,
      lastHeartbeat: new Date().toISOString(),
      login: payload.login,
      server: payload.server,
      company: payload.company,
      tradeMode: payload.tradeMode,
      balance: payload.balance,
      equity: payload.equity,
      margin: payload.margin,
      freeMargin: payload.freeMargin,
      currency: payload.currency,
      leverage: payload.leverage,
      terminalBuild: payload.terminalBuild,
      agentVersion: payload.agentVersion,
      positions: payload.positions || [],
      quotes: payload.quotes || {},
    };
    this.sessions.set(payload.accountId, session);
    this.syncAccount(session);
    this.applyQuotes(session);
    this.reconcilePositions(session);
    return session;
  }

  report(report: Mt5ExecutionReport): VenueCommand | undefined {
    const cmd = this.commands.get(report.commandId);
    if (!cmd) return undefined;

    cmd.status = report.status === 'filled' || report.status === 'partial' ? report.status : report.status;
    brokerAudit.append({
      accountId: report.accountId || cmd.accountId,
      venue: 'mt5',
      environment: this.accountEnv(cmd.accountId),
      stage: `report_${report.status}`,
      symbol: report.symbol || cmd.symbol,
      payload: {
        commandId: cmd.id,
        ticket: report.ticket,
        deal: report.deal,
        retcode: report.retcode,
        fillPrice: report.price,
        volume: report.volume,
        comment: report.comment,
        raw: report.raw || {},
      },
    });

    const trade = this.findTrade(cmd);
    if (!trade) return cmd;

    if (report.status === 'filled' || report.status === 'partial') {
      if (cmd.action === 'open') {
        trade.status = 'open';
        trade.venueStatus = report.status;
        trade.entryPrice = Number(report.price || trade.entryPrice);
        trade.currentPrice = trade.entryPrice;
        trade.venueFillPrice = trade.entryPrice;
        trade.brokerTicket = report.ticket;
        trade.brokerDeal = report.deal;
        trade.brokerRetcode = String(report.retcode || '');
        trade.notes = `${trade.notes || ''} | MT5 FILL ticket=${report.ticket} deal=${report.deal} @ ${trade.entryPrice}`;
      } else if (cmd.action === 'close') {
        this.closeFromVenue(trade, Number(report.price || trade.currentPrice), Number(report.profit));
      }
      store.updateTrade(trade);
    } else {
      trade.status = report.status === 'cancelled' ? 'cancelled' : 'rejected';
      trade.venueStatus = report.status;
      trade.brokerRetcode = String(report.retcode || '');
      trade.notes = `${trade.notes || ''} | MT5 ${report.status.toUpperCase()} retcode=${report.retcode} ${report.comment || ''}`;
      store.updateTrade(trade);
    }
    return cmd;
  }

  getCommand(id: string): VenueCommand | undefined {
    return this.commands.get(id);
  }

  listCommands(accountId?: string): VenueCommand[] {
    const all = [...this.commands.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return accountId ? all.filter((c) => c.accountId === accountId) : all;
  }

  isOnline(accountId: string): boolean {
    return Boolean(this.getSession(accountId)?.connected);
  }

  private accountEnv(accountId: string): 'demo' | 'live' {
    const acc = store.getAccount(accountId);
    return acc?.venueEnvironment === 'live' && acc.type === 'real' ? 'live' : 'demo';
  }

  private findTrade(cmd: VenueCommand): Trade | undefined {
    const state = store.getState();
    if (cmd.tradeId) return state.trades.find((t) => t.id === cmd.tradeId);
    return state.trades.find((t) => t.venueCommandId === cmd.id);
  }

  private failTrade(cmd: VenueCommand, reason: string) {
    const trade = this.findTrade(cmd);
    if (!trade) return;
    trade.status = 'rejected';
    trade.venueStatus = 'expired';
    trade.notes = `${trade.notes || ''} | ${reason}`;
    store.updateTrade(trade);
    brokerAudit.append({
      accountId: cmd.accountId,
      venue: 'mt5',
      environment: this.accountEnv(cmd.accountId),
      stage: 'command_expired',
      symbol: cmd.symbol,
      payload: { commandId: cmd.id, reason },
    });
  }

  private syncAccount(session: VenueSession) {
    const account = store.getAccount(session.accountId);
    if (!account) return;
    account.connectionStatus = 'online';
    account.lastHeartbeat = session.lastHeartbeat;
    account.mt5Login = session.login || account.mt5Login;
    account.mt5Server = session.server || account.mt5Server;
    account.mt5Company = session.company || account.mt5Company;
    if (typeof session.balance === 'number') {
      account.liveBalance = session.balance;
      account.currentBalance = session.balance;
    }
    if (typeof session.equity === 'number') account.liveEquity = session.equity;
    if (typeof session.margin === 'number') account.liveMargin = session.margin;
    if (typeof session.leverage === 'number') account.liveLeverage = session.leverage;
    if (session.currency) account.liveCurrency = session.currency;
    store.updateAccount(account);
  }

  private applyQuotes(session: VenueSession) {
    for (const [symbol, price] of Object.entries(session.quotes || {})) {
      if (!price || !Number.isFinite(price)) continue;
      const mapped = fromVenueSymbol(symbol);
      store.updateTicker(mapped, price, 0);
      store.updateTicker(symbol, price, 0);
    }
  }

  private reconcilePositions(session: VenueSession) {
    const tickets = new Set((session.positions || []).map((p) => String(p.ticket)));
    const state = store.getState();
    for (const trade of state.trades) {
      if (trade.accountId !== session.accountId) continue;
      if (trade.executionMode !== 'venue') continue;
      if (trade.status !== 'open') continue;
      if (trade.brokerTicket && tickets.has(String(trade.brokerTicket))) {
        const pos = session.positions.find((p) => String(p.ticket) === String(trade.brokerTicket));
        if (pos) {
          trade.currentPrice = pos.priceCurrent || trade.currentPrice;
          trade.pnl = Number(pos.profit || trade.pnl);
          if (trade.entryPrice) {
            trade.pnlPercent = Number((((pos.priceCurrent - trade.entryPrice) / trade.entryPrice) * (trade.direction === 'LONG' ? 100 : -100)).toFixed(2));
          }
          store.updateTrade(trade);
        }
        continue;
      }
      if (trade.brokerTicket && !tickets.has(String(trade.brokerTicket))) {
        this.closeFromVenue(trade, trade.currentPrice, trade.pnl);
        store.updateTrade(trade);
      }
    }
  }

  private closeFromVenue(trade: Trade, exitPrice: number, profit?: number) {
    trade.status = 'closed';
    trade.venueStatus = 'filled';
    trade.currentPrice = exitPrice;
    trade.closeTime = new Date().toISOString();
    trade.exitTime = trade.closeTime;
    if (typeof profit === 'number' && Number.isFinite(profit)) {
      trade.pnl = Number(profit.toFixed(2));
    } else {
      const diff = trade.direction === 'LONG' ? exitPrice - trade.entryPrice : trade.entryPrice - exitPrice;
      trade.pnl = Number((diff * trade.quantity).toFixed(2));
    }
    trade.pnlPercent = trade.entryPrice
      ? Number(((trade.pnl / (trade.entryPrice * (trade.quantity || 1))) * 100).toFixed(2))
      : 0;
    const account = store.getAccount(trade.accountId);
    if (account) {
      account.pnlTotal = Number((account.pnlTotal + trade.pnl).toFixed(2));
      account.totalTrades += 1;
      if (trade.pnl > 0) account.winningTrades += 1;
      store.updateAccount(account);
    }
    store.addLog('TRADE', `MT5 encerrou ${trade.symbol} ticket=${trade.brokerTicket} PnL=${trade.pnl}`);
  }
}

export const mt5Bridge = new Mt5Bridge();

export function touchAccountOffline(account: Account) {
  if (account.broker !== 'mt5') return;
  if (!mt5Bridge.isOnline(account.id) && account.connectionStatus === 'online') {
    account.connectionStatus = 'offline';
    store.updateAccount(account);
  }
}
