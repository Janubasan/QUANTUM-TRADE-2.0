import { BrokerId } from '../../src/types.js';
import { BaseBrokerAdapter, OrderParams, OrderResult } from './base.js';
import { Mt5Adapter } from './mt5/mt5Adapter.js';
import { ProftAdapter } from './proft/proftAdapter.js';

export type { OrderParams, OrderResult };
export { BaseBrokerAdapter };

export class SimulatedBrokerAdapter extends BaseBrokerAdapter {
  constructor(
    readonly brokerId: BrokerId,
    readonly name: string
  ) {
    super();
  }

  async getBalance(_apiKey?: string, _apiSecret?: string): Promise<number> {
    return 0;
  }

  async createOrder(params: OrderParams): Promise<OrderResult> {
    return {
      orderId: `SIM-${this.brokerId}-${Date.now()}`,
      status: 'filled',
      executedPrice: params.price,
      timestamp: new Date().toISOString(),
      rawResponse: {
        venue: this.brokerId,
        simulated: true,
        warning: 'Adaptador simulado. Não envia ordem a corretora real.',
      },
    };
  }

  async cancelOrder(_orderId: string): Promise<boolean> {
    return true;
  }
}

export class BinanceAdapter extends SimulatedBrokerAdapter {
  constructor() {
    super('binance', 'Binance Spot & Futures (simulado até chaves reais)');
  }
}

export class MercadoBitcoinAdapter extends SimulatedBrokerAdapter {
  constructor() {
    super('mercado_bitcoin', 'Mercado Bitcoin v4 (simulado até chaves reais)');
  }
}

export class InteractiveBrokersAdapter extends SimulatedBrokerAdapter {
  constructor() {
    super('ibkr', 'Interactive Brokers (simulado até TWS Gateway)');
  }
}

export class BybitAdapter extends SimulatedBrokerAdapter {
  constructor() {
    super('bybit', 'Bybit V5 (simulado até chaves reais)');
  }
}

export class BrokerAdapterFactory {
  private static adapters: Partial<Record<BrokerId, BaseBrokerAdapter>> = {};

  static getAdapter(brokerId: BrokerId): BaseBrokerAdapter {
    if (!this.adapters[brokerId]) {
      this.adapters[brokerId] = this.create(brokerId);
    }
    return this.adapters[brokerId]!;
  }

  private static create(brokerId: BrokerId): BaseBrokerAdapter {
    switch (brokerId) {
      case 'mt5':
        return new Mt5Adapter();
      case 'proft':
        return new ProftAdapter();
      case 'mercado_bitcoin':
        return new MercadoBitcoinAdapter();
      case 'ibkr':
        return new InteractiveBrokersAdapter();
      case 'bybit':
        return new BybitAdapter();
      case 'binance':
      default:
        return new BinanceAdapter();
    }
  }

  static isVenueBroker(brokerId: BrokerId): boolean {
    return brokerId === 'mt5' || brokerId === 'proft';
  }
}
