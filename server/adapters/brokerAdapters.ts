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
  readonly name = 'Binance Spot & Futures';

  async getBalance(_apiKey?: string, _apiSecret?: string): Promise<number> {
    // Standard Binance API call mockup / connector
    return 1000.0;
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

export class BrokerAdapterFactory {
  private static adapters: Record<BrokerId, BaseBrokerAdapter> = {
    binance: new BinanceAdapter(),
    mercado_bitcoin: new MercadoBitcoinAdapter(),
    ibkr: new InteractiveBrokersAdapter(),
    bybit: new BybitAdapter(),
  };

  static getAdapter(brokerId: BrokerId): BaseBrokerAdapter {
    return this.adapters[brokerId] || this.adapters.binance;
  }
}
