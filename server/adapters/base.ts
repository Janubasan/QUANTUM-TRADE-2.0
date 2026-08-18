import { BrokerId, TradeDirection } from '../../src/types.js';

export interface OrderParams {
  symbol: string;
  direction: TradeDirection;
  quantity: number;
  price: number;
  tpPrice: number;
  slPrice: number;
  accountId?: string;
  tradeId?: string;
  comment?: string;
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

  abstract getBalance(apiKey?: string, apiSecret?: string, accountId?: string): Promise<number>;
  abstract createOrder(params: OrderParams, apiKey?: string, apiSecret?: string): Promise<OrderResult>;
  abstract cancelOrder(orderId: string): Promise<boolean>;
}
