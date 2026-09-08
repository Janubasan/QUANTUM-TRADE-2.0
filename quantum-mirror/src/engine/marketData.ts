// Market data — klines REAIS da Binance pública (sem chave) + fallback sintético marcado.
import { Candle } from '../bots/types.js';
import { http } from '../integrations/signing.js';

const BINANCE = 'https://api.binance.com';
const BINANCE_FALLBACK = 'https://data-api.binance.vision';

export type DataQuality = 'live' | 'synthetic';

const cache = new Map<string, { candles: Candle[]; quality: DataQuality; ts: number }>();

function toBinanceSymbol(s: string): string { return s.replace('/', ''); }

function synthCandles(symbol: string, interval: string, limit: number): Candle[] {
  const base = symbol.startsWith('BTC') ? 64000 : symbol.startsWith('ETH') ? 3450 : 155;
  const stepMs = interval.endsWith('m') ? parseInt(interval) * 60000 : 3600000;
  const now = Math.floor(Date.now() / stepMs) * stepMs;
  let p = base * (1 + (Math.sin(now / 86400000) * 0.02));
  const out: Candle[] = [];
  for (let i = limit; i > 0; i--) {
    const t = now - i * stepMs;
    const drift = Math.sin(t / (stepMs * 9)) * 0.004 + (Math.random() - 0.5) * 0.006;
    const o = p;
    const c = p * (1 + drift);
    const h = Math.max(o, c) * (1 + Math.random() * 0.002);
    const l = Math.min(o, c) * (1 - Math.random() * 0.002);
    out.push({ openTime: t, open: o, high: h, low: l, close: c, volume: 1000 + Math.random() * 9000 });
    p = c;
  }
  return out;
}

export async function getCandles(symbol: string, interval: string, limit = 200): Promise<{ candles: Candle[]; quality: DataQuality }> {
  const key = `${symbol}|${interval}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < 15000) return { candles: hit.candles, quality: hit.quality };
  for (const base of [BINANCE, BINANCE_FALLBACK]) {
    try {
      const raw = await http<any[][]>(
        `${base}/api/v3/klines?symbol=${toBinanceSymbol(symbol)}&interval=${interval}&limit=${limit}`,
        {}, 10000
      );
      const candles: Candle[] = raw.map((k) => ({
        openTime: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
      }));
      cache.set(key, { candles, quality: 'live', ts: Date.now() });
      return { candles, quality: 'live' };
    } catch { /* tenta próximo / fallback */ }
  }
  const candles = synthCandles(symbol, interval, limit);
  cache.set(key, { candles, quality: 'synthetic', ts: Date.now() });
  return { candles, quality: 'synthetic' };
}

export async function getPrice(symbol: string): Promise<{ price: number; quality: DataQuality }> {
  for (const base of [BINANCE, BINANCE_FALLBACK]) {
    try {
      const r = await http<{ price: string }>(`${base}/api/v3/ticker/price?symbol=${toBinanceSymbol(symbol)}`, {}, 8000);
      return { price: parseFloat(r.price), quality: 'live' };
    } catch { /* fallback */ }
  }
  const { candles } = await getCandles(symbol, '1m', 5);
  return { price: candles[candles.length - 1].close, quality: 'synthetic' };
}
