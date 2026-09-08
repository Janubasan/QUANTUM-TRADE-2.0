// Conta demo $100 — posições, fills, PnL real derivado, equity, Sharpe, win rate.
import { Fill } from '../integrations/types.js';

export interface Position {
  id: string;
  botId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  tpPrice: number;
  slPrice: number;
  trailingStop?: number;
  openedAt: string;
  venue: string;
  auditCode: string;
}

export interface ClosedTrade extends Position {
  exitPrice: number;
  exitReason: 'TP' | 'SL' | 'TRAILING' | 'SIGNAL' | 'MANUAL' | 'REPLICATE';
  pnl: number;
  pnlPct: number;
  closedAt: string;
  exitAuditCode: string;
}

export class DemoAccount {
  startBalance: number;
  balance: number;
  positions = new Map<string, Position>();
  history: ClosedTrade[] = [];
  fills: Fill[] = [];

  constructor(start = Number(process.env.DEMO_START_BALANCE ?? 100)) {
    this.startBalance = start;
    this.balance = start;
  }

  open(p: Position): void {
    this.positions.set(p.id, p);
  }

  markToMarket(prices: Map<string, number>): number {
    let floating = 0;
    for (const p of this.positions.values()) {
      const px = prices.get(p.symbol);
      if (px == null) continue;
      const diff = p.direction === 'LONG' ? px - p.entryPrice : p.entryPrice - px;
      floating += diff * p.quantity;
    }
    return this.balance + floating;
  }

  /** Atualiza trailing + checa TP/SL. Retorna trades fechados. */
  settle(prices: Map<string, number>, atrMap: Map<string, number>): ClosedTrade[] {
    const closed: ClosedTrade[] = [];
    for (const p of this.positions.values()) {
      const px = prices.get(p.symbol);
      if (px == null) continue;
      const atr = atrMap.get(p.symbol) ?? px * 0.004;
      // Trailing ATR (bot #1 style, aplicado a todos como proteção de lucro)
      if (p.direction === 'LONG') {
        const trail = px - atr * 2;
        p.trailingStop = Math.max(p.trailingStop ?? p.slPrice, trail, p.slPrice);
      } else {
        const trail = px + atr * 2;
        p.trailingStop = Math.min(p.trailingStop ?? p.slPrice, trail, p.slPrice);
      }
      let exit: number | null = null;
      let reason: ClosedTrade['exitReason'] | null = null;
      if (p.direction === 'LONG') {
        if (px >= p.tpPrice) { exit = p.tpPrice; reason = 'TP'; }
        else if (px <= (p.trailingStop ?? p.slPrice)) { exit = p.trailingStop && p.trailingStop > p.slPrice ? px : p.slPrice; reason = p.trailingStop && p.trailingStop > p.slPrice ? 'TRAILING' : 'SL'; }
      } else {
        if (px <= p.tpPrice) { exit = p.tpPrice; reason = 'TP'; }
        else if (px >= (p.trailingStop ?? p.slPrice)) { exit = p.trailingStop && p.trailingStop < p.slPrice ? px : p.slPrice; reason = p.trailingStop && p.trailingStop < p.slPrice ? 'TRAILING' : 'SL'; }
      }
      if (exit != null && reason) {
        const diff = p.direction === 'LONG' ? exit - p.entryPrice : p.entryPrice - exit;
        const gross = diff * p.quantity;
        const fee = exit * p.quantity * 0.001;
        const pnl = +(gross - fee).toFixed(4);
        this.balance = +(this.balance + pnl).toFixed(4);
        const t: ClosedTrade = {
          ...p, exitPrice: exit, exitReason: reason, pnl,
          pnlPct: +((pnl / this.startBalance) * 100).toFixed(3),
          closedAt: new Date().toISOString(), exitAuditCode: '',
        };
        this.positions.delete(p.id);
        this.history.unshift(t);
        closed.push(t);
      }
    }
    return closed;
  }

  stats() {
    const wins = this.history.filter((t) => t.pnl > 0);
    const rets = this.history.map((t) => t.pnl / this.startBalance);
    const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
    const sd = rets.length > 1
      ? Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length)
      : 0;
    const totalPnl = +(this.balance - this.startBalance).toFixed(4);
    return {
      startBalance: this.startBalance,
      balance: +this.balance.toFixed(4),
      equity: +this.balance.toFixed(4),
      totalPnl,
      returnPct: +((totalPnl / this.startBalance) * 100).toFixed(2),
      trades: this.history.length,
      openPositions: this.positions.size,
      wins: wins.length,
      winRate: this.history.length ? +((wins.length / this.history.length) * 100).toFixed(1) : 0,
      sharpe: sd > 0 ? +((mean / sd) * Math.sqrt(Math.max(rets.length, 1))).toFixed(2) : 0,
      profitFactor: (() => {
        const gp = this.history.filter((t) => t.pnl > 0).reduce((a, t) => a + t.pnl, 0);
        const gl = Math.abs(this.history.filter((t) => t.pnl < 0).reduce((a, t) => a + t.pnl, 0));
        return gl > 0 ? +(gp / gl).toFixed(2) : gp > 0 ? 99.99 : 0;
      })(),
    };
  }
}
