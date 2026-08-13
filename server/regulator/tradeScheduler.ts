import {
  MarketRules,
  EXCHANGE_RULES,
  B3_RULES,
  ALLOWED_TIMEFRAMES,
} from './marketRules.js';

export interface TradeRequest {
  symbol: string;
  timeframe: string; // e.g. '5s', '15s', '1m', '5m'
  exchange: string; // 'B3', 'NYSE', 'NASDAQ'
  timestamp?: number;
}

export class TradeScheduler {
  private mode: 'scalp' | 'normal';
  private defaultExchange: string;
  private rules: MarketRules;
  private lastExecution: Map<string, number> = new Map();

  private ordersSecond: number[] = [];
  private ordersMinute: number[] = [];
  private ordersHour: number[] = [];

  constructor(mode: 'scalp' | 'normal' = 'scalp', defaultExchange = 'B3') {
    this.mode = mode;
    this.defaultExchange = defaultExchange;
    this.rules = EXCHANGE_RULES[defaultExchange] || B3_RULES;
  }

  public getMode(): 'scalp' | 'normal' {
    return this.mode;
  }

  public setMode(newMode: 'scalp' | 'normal') {
    this.mode = newMode;
  }

  public getAllowedTimeframes(): string[] {
    return ALLOWED_TIMEFRAMES[this.mode];
  }

  private purgeOld(lst: number[], windowSec: number, now: number) {
    while (lst.length > 0 && lst[0] < now - windowSec) {
      lst.shift();
    }
  }

  public timeframeToSeconds(tf: string): number {
    if (tf.endsWith('s')) {
      return parseFloat(tf.slice(0, -1));
    } else if (tf.endsWith('m')) {
      return parseFloat(tf.slice(0, -1)) * 60;
    } else if (tf.endsWith('h')) {
      return parseFloat(tf.slice(0, -1)) * 3600;
    } else {
      throw new Error(`Timeframe desconhecido: ${tf}`);
    }
  }

  public canTrade(request: TradeRequest): { allowed: boolean; reason?: string } {
    const allowedTfs = ALLOWED_TIMEFRAMES[this.mode];

    // 0. Reject timeframe if not allowed in current mode
    if (!allowedTfs.includes(request.timeframe)) {
      return {
        allowed: false,
        reason: `timeframe_not_allowed_in_${this.mode}_mode`,
      };
    }

    const now = Date.now() / 1000;
    this.purgeOld(this.ordersSecond, 1.0, now);
    this.purgeOld(this.ordersMinute, 60.0, now);
    this.purgeOld(this.ordersHour, 3600.0, now);

    // Minimum interval based on timeframe
    const requiredInterval = this.timeframeToSeconds(request.timeframe);
    const key = `${request.symbol}:${request.timeframe}`;
    const lastTs = this.lastExecution.get(key) || 0;

    if (now - lastTs < requiredInterval) {
      return {
        allowed: false,
        reason: `timeframe_interval_cooldown (${(requiredInterval - (now - lastTs)).toFixed(1)}s restantes)`,
      };
    }

    const exchangeRules = EXCHANGE_RULES[request.exchange] || this.rules;

    // Exchange rate limits
    if (this.ordersSecond.length >= exchangeRules.maxOrdersPerSecond) {
      return { allowed: false, reason: 'exchange_second_limit_exceeded' };
    }
    if (this.ordersMinute.length >= exchangeRules.maxOrdersPerMinute) {
      return { allowed: false, reason: 'exchange_minute_limit_exceeded' };
    }
    if (this.ordersHour.length >= exchangeRules.maxOrdersPerHour) {
      return { allowed: false, reason: 'exchange_hour_limit_exceeded' };
    }

    // Universal safety interval
    if (
      this.ordersSecond.length > 0 &&
      now - this.ordersSecond[this.ordersSecond.length - 1] <
        exchangeRules.minIntervalBetweenOrdersSec
    ) {
      return { allowed: false, reason: 'min_inter_order_delay_active' };
    }

    return { allowed: true };
  }

  public recordTrade(request: TradeRequest) {
    const now = Date.now() / 1000;
    this.ordersSecond.push(now);
    this.ordersMinute.push(now);
    this.ordersHour.push(now);
    const key = `${request.symbol}:${request.timeframe}`;
    this.lastExecution.set(key, now);
  }
}

export const defaultTradeScheduler = new TradeScheduler('scalp', 'B3');
