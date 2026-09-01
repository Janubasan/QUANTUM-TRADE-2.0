import { BrokerId, TradeDirection } from '../../src/types.js';

export interface OrderParams {
  symbol: string;
  direction: TradeDirection;
  quantity: number;
  price: number;
  tpPrice: number;
  slPrice: number;
}

export interface OrderResult {
  orderId: string;
  status: 'filled' | 'pending' | 'rejected';
  executedPrice: number;
  timestamp: string;
  rawResponse?: Record<string, unknown>;
}

export abstract class BaseBrokerAdapter {
  abstract readonly brokerId: BrokerId;
  abstract readonly name: string;

  abstract getBalance(apiKey?: string, apiSecret?: string): Promise<number>;
  abstract createOrder(params: OrderParams, apiKey?: string, apiSecret?: string): Promise<OrderResult>;
  abstract cancelOrder(orderId: string): Promise<boolean>;
}

export class BinanceAdapter extends BaseBrokerAdapter {
  readonly brokerId: BrokerId = 'binance';
  readonly name = 'Binance Spot & Futures (CCXT)';

  async getBalance(_apiKey?: string, _apiSecret?: string): Promise<number> {
    return 1500.0;
  }

  async createOrder(params: OrderParams, _apiKey?: string, _apiSecret?: string): Promise<OrderResult> {
    return {
      orderId: `BN-${Date.now()}`,
      status: 'filled',
      executedPrice: params.price,
      timestamp: new Date().toISOString(),
      rawResponse: { exchange: 'Binance', type: 'MARKET', symbol: params.symbol },
    };
  }

  async cancelOrder(_orderId: string): Promise<boolean> {
    return true;
  }
}

export class MT5Adapter extends BaseBrokerAdapter {
  readonly brokerId: BrokerId = 'mt5';
  readonly name = 'MetaTrader 5 (JOAT Python Bridge)';

  async getBalance(_apiKey?: string, _apiSecret?: string): Promise<number> {
    return 10000.0;
  }

  async createOrder(params: OrderParams, _apiKey?: string, _apiSecret?: string): Promise<OrderResult> {
    return {
      orderId: `MT5-${Date.now()}`,
      status: 'filled',
      executedPrice: params.price,
      timestamp: new Date().toISOString(),
      rawResponse: { exchange: 'MetaTrader 5 JOAT', symbol: params.symbol },
    };
  }

  async cancelOrder(_orderId: string): Promise<boolean> {
    return true;
  }
}

export class CTraderAdapter extends BaseBrokerAdapter {
  readonly brokerId: BrokerId = 'ctrader';
  readonly name = 'cTrader Open API (IC Markets / Forex)';

  async getBalance(_apiKey?: string, _apiSecret?: string): Promise<number> {
    return 20000.0;
  }

  async createOrder(params: OrderParams, _apiKey?: string, _apiSecret?: string): Promise<OrderResult> {
    return {
      orderId: `CT-${Date.now()}`,
      status: 'filled',
      executedPrice: params.price,
      timestamp: new Date().toISOString(),
      rawResponse: { exchange: 'cTrader Open API', symbol: params.symbol },
    };
  }

  async cancelOrder(_orderId: string): Promise<boolean> {
    return true;
  }
}

export class MercadoBitcoinAdapter extends BaseBrokerAdapter {
  readonly brokerId: BrokerId = 'mercado_bitcoin';
  readonly name = 'Mercado Bitcoin (v4 API BRL)';

  async getBalance(_apiKey?: string, _apiSecret?: string): Promise<number> {
    return 500.0;
  }

  async createOrder(params: OrderParams, _apiKey?: string, _apiSecret?: string): Promise<OrderResult> {
    return {
      orderId: `MB-${Date.now()}`,
      status: 'filled',
      executedPrice: params.price,
      timestamp: new Date().toISOString(),
      rawResponse: { exchange: 'Mercado Bitcoin v4', symbol: params.symbol },
    };
  }

  async cancelOrder(_orderId: string): Promise<boolean> {
    return true;
  }
}

export class InteractiveBrokersAdapter extends BaseBrokerAdapter {
  readonly brokerId: BrokerId = 'ibkr';
  readonly name = 'Interactive Brokers (TWS REST Gateway)';

  async getBalance(_apiKey?: string, _apiSecret?: string): Promise<number> {
    return 2500.0;
  }

  async createOrder(params: OrderParams, _apiKey?: string, _apiSecret?: string): Promise<OrderResult> {
    return {
      orderId: `IBKR-${Date.now()}`,
      status: 'filled',
      executedPrice: params.price,
      timestamp: new Date().toISOString(),
      rawResponse: { exchange: 'IBKR Gateway', symbol: params.symbol },
    };
  }

  async cancelOrder(_orderId: string): Promise<boolean> {
    return true;
  }
}

export class BybitAdapter extends BaseBrokerAdapter {
  readonly brokerId: BrokerId = 'bybit';
  readonly name = 'Bybit V5 Derivatives';

  async getBalance(_apiKey?: string, _apiSecret?: string): Promise<number> {
    return 800.0;
  }

  async createOrder(params: OrderParams, _apiKey?: string, _apiSecret?: string): Promise<OrderResult> {
    return {
      orderId: `BYBIT-${Date.now()}`,
      status: 'filled',
      executedPrice: params.price,
      timestamp: new Date().toISOString(),
      rawResponse: { exchange: 'Bybit V5', symbol: params.symbol },
    };
  }

  async cancelOrder(_orderId: string): Promise<boolean> {
    return true;
  }
}

export class CoinbaseAdapter extends BaseBrokerAdapter {
  readonly brokerId: BrokerId = 'coinbase';
  readonly name = 'Coinbase Advanced Trade (BTC Vault)';

  async getBalance(_apiKey?: string, _apiSecret?: string): Promise<number> {
    return 100.0;
  }

  async createOrder(params: OrderParams, _apiKey?: string, _apiSecret?: string): Promise<OrderResult> {
    return {
      orderId: `COINBASE-${Date.now()}`,
      status: 'filled',
      executedPrice: params.price,
      timestamp: new Date().toISOString(),
      rawResponse: { exchange: 'Coinbase Pro/Advanced', symbol: params.symbol, wallet: '3G24UKtkZzYmYewL2fPEGs4hq8SBfwmGVv' },
    };
  }

  async cancelOrder(_orderId: string): Promise<boolean> {
    return true;
  }
}

export class BrokerAdapterFactory {
  private static adapters: Partial<Record<BrokerId, BaseBrokerAdapter>> = {
    binance: new BinanceAdapter(),
    mt5: new MT5Adapter(),
    ctrader: new CTraderAdapter(),
    mercado_bitcoin: new MercadoBitcoinAdapter(),
    ibkr: new InteractiveBrokersAdapter(),
    bybit: new BybitAdapter(),
    coinbase: new CoinbaseAdapter(),
  };

  static getAdapter(brokerId: BrokerId): BaseBrokerAdapter {
    return this.adapters[brokerId] || this.adapters.binance || new BinanceAdapter();
  }
}
