import { BrokerId, TradeDirection } from '../../../src/types.js';
import { BaseBrokerAdapter, OrderParams, OrderResult } from '../base.js';
import { proftBridge } from './proftBridge.js';
import { ProftRestClient } from './proftClient.js';
import { defaultVolume, toVenueSymbol } from '../symbolMap.js';
import { credentialVault } from '../../services/credentialVault.js';
import { store } from '../../data/store.js';

export class ProftAdapter extends BaseBrokerAdapter {
  readonly brokerId: BrokerId = 'proft';
  readonly name = 'Proft / Profit Chart (REST + Agent)';

  async getBalance(_apiKey?: string, _apiSecret?: string, accountId?: string): Promise<number> {
    if (accountId) {
      const session = proftBridge.getSession(accountId);
      if (session?.balance != null) return session.balance;
    }
    throw new Error('Agente Profit/Proft offline. Sem saldo de venue.');
  }

  async createOrder(params: OrderParams, apiKey?: string, apiSecret?: string): Promise<OrderResult> {
    if (!params.accountId) {
      return reject(params.price, 'accountId obrigatório para Proft');
    }

    const account = store.getAccount(params.accountId);
    const secrets = credentialVault.get(params.accountId);
    const baseUrl = account?.proftBaseUrl || process.env.PROFT_API_BASE_URL;
    const key = apiKey || secrets?.apiKey || process.env.PROFT_API_KEY;
    const secret = apiSecret || secrets?.proftSecret || secrets?.apiSecret || process.env.PROFT_API_SECRET;

    if (baseUrl && key && secret) {
      const client = new ProftRestClient({
        baseUrl,
        apiKey: key,
        apiSecret: secret,
        accountId: params.accountId,
        environment: account?.venueEnvironment === 'live' && account.type === 'real' ? 'live' : 'demo',
      });
      const result = await client.placeOrder({
        clientOrderId: params.tradeId || `qt-${Date.now()}`,
        symbol: toVenueSymbol(params.symbol, 'proft'),
        side: params.direction === 'LONG' ? 'buy' : 'sell',
        quantity: defaultVolume(params.symbol, params.quantity),
        type: 'market',
        price: params.price,
        stopLoss: params.slPrice,
        takeProfit: params.tpPrice,
        comment: params.comment || 'QT2',
      });
      return {
        orderId: result.orderId || result.ticket || '',
        status: result.status === 'filled' ? 'filled' : result.status === 'rejected' ? 'rejected' : 'pending',
        executedPrice: result.fillPrice || params.price,
        timestamp: new Date().toISOString(),
        rawResponse: result.raw,
      };
    }

    if (!proftBridge.isOnline(params.accountId)) {
      return reject(
        params.price,
        'Agente Profit/Proft desconectado e REST não configurado. Rode profit/quantum_trade_profit_agent.py ou defina PROFT_API_BASE_URL.'
      );
    }

    const cmd = proftBridge.enqueue({
      accountId: params.accountId,
      action: 'open',
      symbol: toVenueSymbol(params.symbol, 'proft'),
      direction: params.direction,
      volume: defaultVolume(params.symbol, params.quantity),
      price: params.price,
      sl: params.slPrice,
      tp: params.tpPrice,
      comment: params.comment || 'QT2',
      tradeId: params.tradeId,
    });

    return {
      orderId: cmd.id,
      status: 'pending',
      executedPrice: params.price,
      timestamp: cmd.createdAt,
      rawResponse: { venue: 'proft', command: cmd },
    };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const cmd = proftBridge.getCommand(orderId);
    if (!cmd) return false;
    proftBridge.enqueue({
      accountId: cmd.accountId,
      action: 'cancel',
      symbol: cmd.symbol,
      volume: cmd.volume,
      ticket: cmd.ticket,
      tradeId: cmd.tradeId,
    });
    return true;
  }

  async closePosition(params: {
    accountId: string;
    symbol: string;
    ticket?: string;
    volume: number;
    tradeId?: string;
    direction?: TradeDirection;
  }): Promise<OrderResult> {
    if (!proftBridge.isOnline(params.accountId)) {
      return reject(0, 'Agente Proft desconectado para close');
    }
    const cmd = proftBridge.enqueue({
      accountId: params.accountId,
      action: 'close',
      symbol: toVenueSymbol(params.symbol, 'proft'),
      volume: params.volume,
      ticket: params.ticket,
      tradeId: params.tradeId,
      direction: params.direction,
      comment: 'QT2-CLOSE',
    });
    return {
      orderId: cmd.id,
      status: 'pending',
      executedPrice: 0,
      timestamp: cmd.createdAt,
      rawResponse: { venue: 'proft', command: cmd },
    };
  }
}

function reject(price: number, error: string): OrderResult {
  return {
    orderId: '',
    status: 'rejected',
    executedPrice: price,
    timestamp: new Date().toISOString(),
    rawResponse: { error },
  };
}
