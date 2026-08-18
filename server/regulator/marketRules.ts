export interface MarketRules {
  maxOrdersPerSecond: number;
  maxOrdersPerMinute: number;
  maxOrdersPerHour: number;
  minIntervalBetweenOrdersSec: number;
}

export const B3_RULES: MarketRules = {
  maxOrdersPerSecond: 1,
  maxOrdersPerMinute: 30,
  maxOrdersPerHour: 1000,
  minIntervalBetweenOrdersSec: 1.0,
};

export const US_MARKET_RULES: MarketRules = {
  maxOrdersPerSecond: 2,
  maxOrdersPerMinute: 50,
  maxOrdersPerHour: 1200,
  minIntervalBetweenOrdersSec: 0.5,
};

export const CRYPTO_RULES: MarketRules = {
  maxOrdersPerSecond: 5,
  maxOrdersPerMinute: 60,
  maxOrdersPerHour: 1200,
  minIntervalBetweenOrdersSec: 0.2,
};

export const MT5_RULES: MarketRules = {
  maxOrdersPerSecond: 2,
  maxOrdersPerMinute: 40,
  maxOrdersPerHour: 400,
  minIntervalBetweenOrdersSec: 0.5,
};

export const EXCHANGE_RULES: Record<string, MarketRules> = {
  B3: B3_RULES,
  PROFT: B3_RULES,
  PROFIT: B3_RULES,
  MT5: MT5_RULES,
  NYSE: US_MARKET_RULES,
  NASDAQ: US_MARKET_RULES,
  BINANCE: CRYPTO_RULES,
  CRYPTO: CRYPTO_RULES,
};

// Allowed timeframes per trading mode
export const ALLOWED_TIMEFRAMES: Record<'scalp' | 'normal', string[]> = {
  scalp: ['5s', '10s', '15s', '30s', '1m', '3m', '5m', '15m'], // scalping & fast intraday
  normal: ['1m', '3m', '5m', '10m', '15m', '30m', '1h', '4h', '1d'], // standard intraday / swing
};
