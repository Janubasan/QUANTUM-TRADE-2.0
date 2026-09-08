// Webhook IN — recebe alertas do TradingView (Pine) com as mesmas travas auditadas:
// secret/HMAC, dedupe order_id, stale ≤10s, slippage ≤0.8%.
import crypto from 'crypto';
import { BOTS } from '../bots/types.js';
import { getPrice } from '../engine/marketData.js';
import { account } from '../engine/runner.js';
import { seal } from '../engine/audit.js';
import { getVenue } from '../integrations/brokers.js';
import { positionSize } from '../bots/risk.js';
import { publish } from './mirror.js';

const SECRET = process.env.WEBHOOK_SECRET ?? 'quantum_mirror_tv_secret_2026';
const seen = new Set<string>();

export interface TvAlert {
  secret?: string;
  bot_id: string;
  symbol: string;
  action: 'buy' | 'sell';
  price?: number;
  timeframe?: string;
  order_id?: string;
  timestamp?: number;
}

export function verifyHmac(rawBody: string, header?: string): boolean {
  if (!header) return false;
  const sig = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(header.replace('sha256=', '')));
  } catch { return false; }
}

export async function handleTvAlert(alert: TvAlert, hmacHeader?: string, rawBody = '') {
  const now = Math.floor(Date.now() / 1000);
  const ts = alert.timestamp ?? now;
  const latencyMs = Math.abs(now - ts) * 1000;
  const bot = BOTS.find((b) => b.id === alert.bot_id);

  const reject = (status: string, reason: string) => {
    const block = seal('tv_reject', { status, reason, order_id: alert.order_id });
    return { processed: false, status, reason, auditCode: block.auditCode };
  };

  if (alert.secret !== SECRET && !verifyHmac(rawBody, hmacHeader))
    return reject('AUTH_FAILED', 'secret/HMAC inválido');
  if (!bot) return reject('UNKNOWN_BOT', `bot_id ${alert.bot_id} desconhecido`);
  if (alert.order_id && seen.has(alert.order_id))
    return reject('DUPLICATE', `order_id ${alert.order_id} já processado`);
  if (alert.order_id) { seen.add(alert.order_id); if (seen.size > 2000) seen.clear(); }
  if (Math.abs(now - ts) > 10)
    return reject('STALE', `atraso ${latencyMs}ms > 10000ms`);

  const symbol = (alert.symbol ?? bot.symbol).toUpperCase().replace('_', '/');
  const { price: market } = await getPrice(symbol);
  const ref = alert.price ?? market;
  const slip = Math.abs(market - ref) / (ref || 1);
  if (slip > 0.008) return reject('SLIPPAGE', `slippage ${(slip * 100).toFixed(2)}% > 0.80%`);

  const dir = alert.action === 'buy' ? 'LONG' : 'SHORT';
  const riskDist = market * 0.004;
  const qty = positionSize(account.balance, bot.riskPercent, market, dir === 'LONG' ? market - riskDist : market + riskDist);
  const venue = getVenue(process.env.EXECUTION_VENUE ?? 'paper');
  const fill = await venue.placeOrder({
    symbol, side: dir === 'LONG' ? 'BUY' : 'SELL', quantity: +qty.toFixed(6),
    price: market, type: 'MARKET',
    tpPrice: dir === 'LONG' ? market + riskDist * bot.tpRatio : market - riskDist * bot.tpRatio,
    slPrice: dir === 'LONG' ? market - riskDist : market + riskDist,
    clientOrderId: alert.order_id ?? `tv-${Date.now()}`,
    meta: { source: 'tradingview', botId: bot.id },
  });
  const pos = {
    id: fill.clientOrderId, botId: bot.id, symbol, direction: dir,
    entryPrice: fill.price, quantity: fill.quantity,
    tpPrice: dir === 'LONG' ? market + riskDist * bot.tpRatio : market - riskDist * bot.tpRatio,
    slPrice: dir === 'LONG' ? market - riskDist : market + riskDist,
    openedAt: new Date().toISOString(), venue: venue.id, auditCode: '',
  } as const;
  const block = seal('tv_fill', { ...pos, latencyMs, slippagePct: +(slip * 100).toFixed(3) });
  account.open({ ...pos, auditCode: block.auditCode });
  publish({ type: 'trade_open', ts: new Date().toISOString(), trade: pos, signal: { source: 'tradingview', alert }, auditCode: block.auditCode });
  return { processed: true, status: 'EXECUTED', trade: pos, fill, latencyMs, auditCode: block.auditCode };
}
