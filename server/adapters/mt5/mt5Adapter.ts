import { BrokerId, TradeDirection } from '../../../src/types.js';
import { BaseBrokerAdapter, OrderParams, OrderResult } from '../base.js';
import { mt5Bridge } from './mt5Bridge.js';
import { defaultVolume, toVenueSymbol } from '../symbolMap.js';
import { store } from '../../data/store.js';

export class Mt5Adapter extends BaseBrokerAdapter {
  readonly brokerId: BrokerId = 'mt5';
  readonly name = 'MetaTrader 5 (EA Bridge)';

  async getBalance(_apiKey?: string, _apiSecret?: string, accountId?: string): Promise<number> {
    if (accountId) {
      const session = mt5Bridge.getSession(accountId);
      if (session?.balance != null) return session.balance;
      const acc = store.getAccount(accountId);
      if (acc?.liveBalance != null) return acc.liveBalance;
    }
    throw new Error('Terminal MT5 offline. Sem saldo de venue.');
  }

  async createOrder(params: OrderParams, _apiKey?: string, _apiSecret?: string): Promise<OrderResult> {
    if (!params.accountId) {
      return {
        orderId: '',
        status: 'rejected',
        executedPrice: params.price,
        timestamp: new Date().toISOString(),
        rawResponse: { error: 'accountId obrigatório para MT5' },
      };
    }
    if (!mt5Bridge.isOnline(params.accountId)) {
      return {
        orderId: '',
        status: 'rejected',
        executedPrice: params.price,
        timestamp: new Date().toISOString(),
        rawResponse: { error: 'EA MT5 desconectado. Instale QuantumTradeBridge.mq5 e aguarde heartbeat.' },
      };
    }

    const cmd = mt5Bridge.enqueue({
      accountId: params.accountId,
      action: 'open',
      symbol: toVenueSymbol(params.symbol, 'mt5'),
      direction: params.direction,
      volume: defaultVolume(params.symbol, params.quantity),
      price: params.price,
      sl: params.slPrice,
      tp: params.tpPrice,
      comment: params.comment || 'QT2',
      magic: 20260818,
      tradeId: params.tradeId,
    });

    return {
      orderId: cmd.id,
      status: 'pending',
      executedPrice: params.price,
      timestamp: cmd.createdAt,
      rawResponse: { venue: 'mt5', command: cmd },
    };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const cmd = mt5Bridge.getCommand(orderId);
    if (!cmd) return false;
    mt5Bridge.enqueue({
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
    if (!mt5Bridge.isOnline(params.accountId)) {
      return {
        orderId: '',
        status: 'rejected',
        executedPrice: 0,
        timestamp: new Date().toISOString(),
        rawResponse: { error: 'EA MT5 desconectado para close' },
      };
    }
    const cmd = mt5Bridge.enqueue({
      accountId: params.accountId,
      action: 'close',
      symbol: toVenueSymbol(params.symbol, 'mt5'),
      volume: params.volume,
      ticket: params.ticket,
      tradeId: params.tradeId,
      direction: params.direction,
      comment: 'QT2-CLOSE',
      magic: 20260818,
    });
    return {
      orderId: cmd.id,
      status: 'pending',
      executedPrice: 0,
      timestamp: cmd.createdAt,
      rawResponse: { venue: 'mt5', command: cmd },
    };
  }
}
