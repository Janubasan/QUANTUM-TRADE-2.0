/**
 * marketData.ts
 * ---------------------------------------------------------------------------
 * Fontes de dados de mercado do Comitê JARVIS.
 *
 * LIVE (best-effort):
 *   - Velas 1m:  Coinbase Exchange Public Feed  GET /products/{id}/candles
 *   - Livro L1:  Coinbase Exchange Public Feed  GET /products/{id}/book?level=1
 *   - Fear&Greed: Alternative.me Public API    GET /fng/?limit=1
 *
 * FALLBACK determinístico (quando não há rede, como no sandbox): o mercado é
 * sintetizado a partir de um PRNG semeado pelo símbolo — a proveniência de
 * cada dado é rotulada ('live' | 'synthetic') e exposta na UI (zero dados
 * falsos, mesma política de transparência do resto da plataforma).
 */

import { Candle } from './indicators.js';

export interface BookSnapshot {
  bidPrice: number;
  askPrice: number;
  bidSize: number;
  askSize: number;
  spreadBps: number;
  imbalance: number; // -1..1
  source: 'live' | 'synthetic';
}

export interface FearGreedSnapshot {
  value: number; // 0..100
  classification: string;
  source: 'live' | 'synthetic';
}

export const PRODUCT_MAP: Record<string, string> = {
  'BTC/USDT': 'BTC-USD',
  'BTC/USD': 'BTC-USD',
  'BTC/BRL': 'BTC-BRL',
  'ETH/USDT': 'ETH-USD',
  'ETH/USD': 'ETH-USD',
  'ETH/BRL': 'ETH-BRL',
  'SOL/USDT': 'SOL-USD',
  'SOL/USD': 'SOL-USD',
};

export function coinbaseProductId(symbol: string): string {
  return PRODUCT_MAP[symbol] ?? symbol.replace('/', '-');
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Coinbase Exchange candles (1m)
// ---------------------------------------------------------------------------
export async function fetchCandlesLive(symbol: string, granularity = 60): Promise<Candle[] | null> {
  try {
    const productId = coinbaseProductId(symbol);
    const url = `https://api.exchange.coinbase.com/products/${productId}/candles?granularity=${granularity}`;
    const res = await fetchWithTimeout(url, 5000);
    if (!res.ok) return null;
    const raw: any[] = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) return null;

    // Coinbase retorna [time, low, high, open, close, volume] (mais recente primeiro)
    const candles: Candle[] = raw
      .map((c) => ({
        time: Number(c[0]) * 1000,
        low: Number(c[1]),
        high: Number(c[2]),
        open: Number(c[3]),
        close: Number(c[4]),
        volume: Number(c[5]),
      }))
      .filter((c) => c.open > 0 && c.close > 0)
      .sort((a, b) => a.time - b.time);
    return candles.length >= 2 ? candles : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Coinbase Exchange order book L1
// ---------------------------------------------------------------------------
export async function fetchBookLive(symbol: string): Promise<BookSnapshot | null> {
  try {
    const productId = coinbaseProductId(symbol);
    const url = `https://api.exchange.coinbase.com/products/${productId}/book?level=1`;
    const res = await fetchWithTimeout(url, 5000);
    if (!res.ok) return null;
    const data: any = await res.json();
    const bid = Array.isArray(data?.bids) && data.bids[0];
    const ask = Array.isArray(data?.asks) && data.asks[0];
    if (!bid || !ask) return null;

    const bidPrice = Number(bid[0]);
    const askPrice = Number(ask[0]);
    const bidSize = Number(bid[1]);
    const askSize = Number(ask[1]);
    const mid = (bidPrice + askPrice) / 2;
    const spread = askPrice - bidPrice;
    const spreadBps = mid > 0 ? (spread / mid) * 10000 : 0;
    const imbalance = bidSize + askSize > 0 ? (bidSize - askSize) / (bidSize + askSize) : 0;

    return {
      bidPrice,
      askPrice,
      bidSize,
      askSize,
      spreadBps,
      imbalance,
      source: 'live',
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Alternative.me Crypto Fear & Greed Index
// ---------------------------------------------------------------------------
export async function fetchFearGreedLive(): Promise<FearGreedSnapshot | null> {
  try {
    const url = 'https://api.alternative.me/fng/?limit=1';
    const res = await fetchWithTimeout(url, 5000);
    if (!res.ok) return null;
    const data: any = await res.json();
    const item = data?.data?.[0];
    const value = Number(item?.value);
    if (Number.isNaN(value)) return null;
    return {
      value,
      classification: item?.value_classification || classifyFearGreed(value),
      source: 'live',
    };
  } catch {
    return null;
  }
}

export function classifyFearGreed(value: number): string {
  if (value <= 20) return 'Extreme Fear';
  if (value <= 40) return 'Fear';
  if (value <= 60) return 'Neutral';
  if (value <= 80) return 'Greed';
  return 'Extreme Greed';
}

// ---------------------------------------------------------------------------
// Fallback sintético determinístico
// ---------------------------------------------------------------------------
export function buildSyntheticBook(price: number, realizedVolPct: number, trendBias: number): BookSnapshot {
  // Spread em bps cresce com a volatilidade realizada (proxy honesto de iliquidez)
  const spreadBps = 0.5 + (realizedVolPct / 100) * 2.5 + (trendBias === 0 ? 0.3 : 0);
  const spread = price * (spreadBps / 10000);
  const bidPrice = price - spread / 2;
  const askPrice = price + spread / 2;

  // Desbalanceio do livro segue a pressão recente (assimetria de fluxo)
  const imbalance = Math.max(-1, Math.min(1, trendBias));

  return {
    bidPrice,
    askPrice,
    bidSize: 1 + Math.abs(trendBias) * 2,
    askSize: 1 + Math.abs(1 - trendBias) * 2,
    spreadBps,
    imbalance,
    source: 'synthetic',
  };
}

export function buildSyntheticFearGreed(change24h: number, rsi: number): FearGreedSnapshot {
  // Estimativa determinística de sentimento a partir de momentum + RSI
  const momentumComponent = Math.max(-50, Math.min(50, change24h * 12));
  const rsiComponent = Math.max(-25, Math.min(25, (rsi - 50) * 0.8));
  const value = Math.round(Math.max(0, Math.min(100, 50 + momentumComponent + rsiComponent)));
  return { value, classification: classifyFearGreed(value), source: 'synthetic' };
}
