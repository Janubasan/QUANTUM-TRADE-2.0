// Espelho TradingView — barramento de eventos (SSE), feed REST e replicação 1-clique.
import { Response } from 'express';
import { getVenue } from '../integrations/brokers.js';
import { account } from '../engine/runner.js';
import { seal } from '../engine/audit.js';

export type MirrorEvent =
  | { type: 'trade_open'; ts: string; trade: unknown; signal: unknown; auditCode: string }
  | { type: 'trade_closed'; ts: string; trade: unknown; auditCode: string }
  | { type: 'heartbeat'; ts: string; stats: unknown };

const subs = new Set<Response>();
const history: MirrorEvent[] = [];

export function publish(ev: MirrorEvent): void {
  history.unshift(ev);
  if (history.length > 200) history.pop();
  for (const res of subs) {
    try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch { subs.delete(res); }
  }
}

export function subscribe(res: Response): void {
  subs.add(res);
  // replay rápido: últimos 5 eventos
  for (const ev of history.slice(0, 5).reverse()) {
    try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch { break; }
  }
}

export function unsubscribe(res: Response): void {
  subs.delete(res);
}

export function feed(n = 50): MirrorEvent[] {
  return history.slice(0, n);
}

setInterval(() => {
  publish({ type: 'heartbeat', ts: new Date().toISOString(), stats: account.stats() });
}, 30000);

/** Replica um trade do espelho na venue configurada (paper por padrão). */
export async function replicate(tradeId: string, opts: { venue?: string; sizeMultiplier?: number }) {
  const src: any =
    [...account.positions.values()].find((p) => p.id === tradeId) ??
    account.history.find((t) => t.id === tradeId);
  if (!src) throw new Error(`trade ${tradeId} não encontrado no espelho`);
  const venueId = opts.venue ?? process.env.EXECUTION_VENUE ?? 'paper';
  const venue = getVenue(venueId);
  const mult = opts.sizeMultiplier ?? 1;
  const fill = await venue.placeOrder({
    symbol: src.symbol,
    side: src.direction === 'LONG' ? 'BUY' : 'SELL',
    quantity: +(src.quantity * mult).toFixed(6),
    type: 'MARKET',
    clientOrderId: `replica-${tradeId}-${Date.now()}`,
    meta: { mirroredFrom: tradeId, botId: src.botId },
  });
  const block = seal('replicate', { from: tradeId, venue: venue.id, fill });
  return { replicatedTradeId: fill.clientOrderId, fill, auditCode: block.auditCode };
}
