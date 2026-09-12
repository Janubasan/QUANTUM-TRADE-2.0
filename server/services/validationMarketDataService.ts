import YahooFinance from 'yahoo-finance2';
import type { HistoricalBar, ValidationDataSource } from '../../src/types.js';

const yahooFinance = new YahooFinance();

export interface HistoricalDataResult {
  asset: string;
  source: ValidationDataSource;
  bars: HistoricalBar[];
  start: string | null;
  end: string | null;
  error?: string;
}

interface CacheEntry {
  expiresAt: number;
  result: HistoricalDataResult;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeAsset(asset: string): string {
  return asset.trim().toUpperCase();
}

function yahooSymbolFor(asset: string): string {
  const normalized = normalizeAsset(asset);
  if (normalized.includes('/')) {
    const [base, quote] = normalized.split('/');
    if (quote === 'USDT' || quote === 'USD') return `${base}-USD`;
    if (quote === 'BRL') return `${base}-BRL`;
    return `${base}-${quote}`;
  }
  return normalized;
}

function alpacaTimeframeFor(timeframe: string): string | null {
  switch (timeframe) {
    case '1d':
      return '1Day';
    case '1h':
      return '1Hour';
    case '15m':
      return '15Min';
    case '5m':
      return '5Min';
    case '1m':
      return '1Min';
    default:
      return null;
  }
}

function yahooIntervalFor(timeframe: string): string | null {
  switch (timeframe) {
    case '1d':
      return '1d';
    case '1h':
      return '1h';
    case '15m':
      return '15m';
    case '5m':
      return '5m';
    case '1m':
      return '1m';
    default:
      return null;
  }
}

function asIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function cleanBars(rows: Array<Record<string, unknown>>): HistoricalBar[] {
  const bars = rows
    .map((row) => {
      const timestamp = asIso(row.timestamp ?? row.date ?? row.t);
      const open = Number(row.open ?? row.o);
      const high = Number(row.high ?? row.h);
      const low = Number(row.low ?? row.l);
      const close = Number(row.close ?? row.c);
      const volume = Number(row.volume ?? row.v ?? 0);
      if (!timestamp || ![open, high, low, close, volume].every(Number.isFinite)) return null;
      if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || high < low) return null;
      return { timestamp, open, high, low, close, volume } satisfies HistoricalBar;
    })
    .filter((bar): bar is HistoricalBar => Boolean(bar));

  const deduplicated = new Map<string, HistoricalBar>();
  for (const bar of bars) deduplicated.set(bar.timestamp, bar);
  return [...deduplicated.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function fetchFromAlpaca(
  asset: string,
  timeframe: string,
  start: Date,
  end: Date
): Promise<HistoricalDataResult | null> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const alpacaTimeframe = alpacaTimeframeFor(timeframe);
  // Alpaca's stock feed requires credentials. Absence is not an error: Yahoo is
  // the documented fallback and is still a real, timestamped provider.
  if (!key || !secret || !alpacaTimeframe || asset.includes('/')) return null;

  try {
    const params = new URLSearchParams({
      timeframe: alpacaTimeframe,
      start: start.toISOString(),
      end: end.toISOString(),
      feed: process.env.ALPACA_DATA_FEED || 'iex',
      limit: '10000',
      adjustment: 'raw',
    });
    const response = await fetch(
      `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(asset)}/bars?${params.toString()}`,
      { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret } }
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { bars?: Array<Record<string, unknown>> };
    const bars = cleanBars(payload.bars ?? []);
    if (bars.length === 0) return null;
    return {
      asset,
      source: 'ALPACA_MARKET_DATA',
      bars,
      start: bars[0].timestamp,
      end: bars[bars.length - 1].timestamp,
    };
  } catch {
    return null;
  }
}

async function fetchFromYahoo(
  asset: string,
  timeframe: string,
  start: Date,
  end: Date
): Promise<HistoricalDataResult> {
  const interval = yahooIntervalFor(timeframe);
  if (!interval) {
    return {
      asset,
      source: 'YAHOO_FINANCE',
      bars: [],
      start: null,
      end: null,
      error: `Timeframe não suportado pelo provedor: ${timeframe}`,
    };
  }

  try {
    // `chart` returns provider candles; it does not fill missing observations.
    const chart: any = await (yahooFinance as any).chart(yahooSymbolFor(asset), {
      period1: start,
      period2: end,
      interval,
      includePrePost: false,
      events: 'div,split',
    });
    const quotes = Array.isArray(chart?.quotes) ? chart.quotes : [];
    const bars = cleanBars(quotes);
    if (bars.length === 0) {
      return {
        asset,
        source: 'YAHOO_FINANCE',
        bars: [],
        start: null,
        end: null,
        error: 'O provedor não retornou candles OHLCV para o período solicitado.',
      };
    }
    return {
      asset,
      source: 'YAHOO_FINANCE',
      bars,
      start: bars[0].timestamp,
      end: bars[bars.length - 1].timestamp,
    };
  } catch (error: any) {
    return {
      asset,
      source: 'YAHOO_FINANCE',
      bars: [],
      start: null,
      end: null,
      error: error?.message || 'Falha ao consultar Yahoo Finance.',
    };
  }
}

export async function fetchHistoricalBars(
  rawAsset: string,
  timeframe: string,
  lookbackDays: number
): Promise<HistoricalDataResult> {
  const asset = normalizeAsset(rawAsset);
  const safeDays = Math.max(1, Math.min(Math.floor(Number(lookbackDays) || 0), 3650));
  const cacheKey = `${asset}:${timeframe}:${safeDays}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  if (!asset) {
    return { asset, source: 'UNKNOWN', bars: [], start: null, end: null, error: 'Ativo obrigatório.' };
  }
  if (!safeDays) {
    return { asset, source: 'UNKNOWN', bars: [], start: null, end: null, error: 'lookback_days deve ser maior que zero.' };
  }

  const end = new Date();
  const start = new Date(end.getTime() - safeDays * 24 * 60 * 60 * 1000);
  const alpaca = await fetchFromAlpaca(asset, timeframe, start, end);
  const result = alpaca ?? (await fetchFromYahoo(asset, timeframe, start, end));
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, result });
  return result;
}

export function clearHistoricalDataCache() {
  cache.clear();
}

export function getYahooSymbol(asset: string): string {
  return yahooSymbolFor(asset);
}
