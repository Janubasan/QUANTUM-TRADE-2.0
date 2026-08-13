import yahooFinance from 'yahoo-finance2';
import { store } from '../data/store.js';

export interface PriceSourceData {
  binance?: number;
  yahoo?: number;
  coingecko?: number;
  aggregated: number;
  sourcesCount: number;
  outlierFiltered: boolean;
  updatedAt: string;
}

const SYMBOL_MAP: Record<string, { yahoo: string; binance: string; coingeckoId: string }> = {
  'BTC/BRL': { yahoo: 'BTC-BRL', binance: 'BTCBRL', coingeckoId: 'bitcoin' },
  'ETH/BRL': { yahoo: 'ETH-BRL', binance: 'ETHBRL', coingeckoId: 'ethereum' },
  'SOL/BRL': { yahoo: 'SOL-BRL', binance: 'SOLBRL', coingeckoId: 'solana' },
  'BTC/USDT': { yahoo: 'BTC-USD', binance: 'BTCUSDT', coingeckoId: 'bitcoin' },
  'ETH/USDT': { yahoo: 'ETH-USD', binance: 'ETHUSDT', coingeckoId: 'ethereum' },
};

export class PriceAggregatorService {
  private prices: Record<string, PriceSourceData> = {};
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private symbols: string[] = ['BTC/BRL', 'ETH/BRL', 'SOL/BRL', 'BTC/USDT', 'ETH/USDT']) {}

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🌐 Multi-Source Price Aggregator Service (Binance + Yahoo Finance + CoinGecko) Inovado.');

    // Poll every 8 seconds for real multi-source updates
    this.pollAllSources();
    this.timer = setInterval(() => {
      this.pollAllSources();
    }, 8000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  private async pollAllSources() {
    for (const symbol of this.symbols) {
      const mappings = SYMBOL_MAP[symbol];
      if (!mappings) continue;

      const [binancePrice, yahooPrice, coingeckoPrice] = await Promise.all([
        this.fetchBinancePrice(mappings.binance),
        this.fetchYahooPrice(mappings.yahoo),
        this.fetchCoinGeckoPrice(mappings.coingeckoId, symbol.includes('BRL') ? 'brl' : 'usd'),
      ]);

      const sourcesList: { name: string; price: number }[] = [];
      if (binancePrice && binancePrice > 0) sourcesList.push({ name: 'binance', price: binancePrice });
      if (yahooPrice && yahooPrice > 0) sourcesList.push({ name: 'yahoo', price: yahooPrice });
      if (coingeckoPrice && coingeckoPrice > 0) sourcesList.push({ name: 'coingecko', price: coingeckoPrice });

      if (sourcesList.length === 0) continue;

      // Cross-validation and outlier removal (> 2% deviation threshold)
      const rawValues = sourcesList.map((s) => s.price);
      const mean = rawValues.reduce((a, b) => a + b, 0) / rawValues.length;

      let validValues = rawValues;
      let outlierFiltered = false;

      if (rawValues.length >= 2) {
        validValues = rawValues.filter((v) => Math.abs(v - mean) / mean <= 0.02);
        if (validValues.length === 0) validValues = [mean];
        if (validValues.length < rawValues.length) outlierFiltered = true;
      }

      const aggregatedPrice = Number(
        (validValues.reduce((a, b) => a + b, 0) / validValues.length).toFixed(2)
      );

      const data: PriceSourceData = {
        binance: binancePrice || undefined,
        yahoo: yahooPrice || undefined,
        coingecko: coingeckoPrice || undefined,
        aggregated: aggregatedPrice,
        sourcesCount: sourcesList.length,
        outlierFiltered,
        updatedAt: new Date().toISOString(),
      };

      this.prices[symbol] = data;

      // Update global ticker store with verified aggregated price
      const existingTicker = store.getState().tickers[symbol];
      const prevPrice = existingTicker ? existingTicker.price : aggregatedPrice;
      const change24h = existingTicker
        ? Number((((aggregatedPrice - prevPrice) / prevPrice) * 100).toFixed(2))
        : 0;

      store.updateTicker(symbol, aggregatedPrice, change24h);
    }
  }

  private async fetchBinancePrice(binanceSymbol: string): Promise<number | undefined> {
    try {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`);
      if (!res.ok) return undefined;
      const json: any = await res.json();
      return json?.price ? parseFloat(json.price) : undefined;
    } catch {
      return undefined;
    }
  }

  private async fetchYahooPrice(yahooSymbol: string): Promise<number | undefined> {
    try {
      const quote: any = await yahooFinance.quote(yahooSymbol);
      return quote?.regularMarketPrice || undefined;
    } catch {
      return undefined;
    }
  }

  private async fetchCoinGeckoPrice(coingeckoId: string, currency: string): Promise<number | undefined> {
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=${currency}`
      );
      if (!res.ok) return undefined;
      const json: any = await res.json();
      return json[coingeckoId]?.[currency] ? parseFloat(json[coingeckoId][currency]) : undefined;
    } catch {
      return undefined;
    }
  }

  public getPriceData(symbol: string): PriceSourceData | undefined {
    return this.prices[symbol];
  }

  public getAllPriceData(): Record<string, PriceSourceData> {
    return this.prices;
  }
}

export const priceAggregatorService = new PriceAggregatorService();
