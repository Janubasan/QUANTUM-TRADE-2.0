export type BrokerKind = 'exchange' | 'wallet' | 'broker' | 'dex' | 'paper';

export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  updatedAt: string;
}

export interface SignedOrder {
  id: string;
  order_id?: string;
  account_id: string;
  symbol: string;
  side: 'buy' | 'sell' | 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  type?: 'LIMIT' | 'MARKET';
  tpPrice?: number;
  slPrice?: number;
  order_hash?: string;
  signature?: string;
  validated_at?: string;
  created_at?: string;
  meta?: Record<string, any>;
}

export interface ExecutionReceipt {
  success: boolean;
  orderId: string;
  clientOrderId: string;
  externalOrderId?: string;
  adapterId: string;
  adapterName: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  filledQuantity: number;
  executedPrice: number;
  fee: number;
  feeAsset: string;
  latencyMs: number;
  status: 'FILLED' | 'PARTIALLY_FILLED' | 'PENDING' | 'REJECTED' | 'QUEUED';
  timestamp: string;
  rawResponse?: any;
  error?: string;
}

export interface ExecutionStatus {
  orderId: string;
  externalOrderId: string;
  status: 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  filledQuantity: number;
  remainingQuantity: number;
  avgPrice?: number;
  updatedAt: string;
}

export interface BrokerAdapter {
  id: string;
  name: string;
  kind: BrokerKind;
  isEnabled: boolean;
  isSandbox: boolean;

  getBalances(): Promise<Balance[]>;
  placeOrder(order: SignedOrder): Promise<ExecutionReceipt>;
  cancelOrder(orderId: string): Promise<boolean>;
  getOrder(orderId: string): Promise<ExecutionStatus>;
  isMarketOpen(instrument: string): Promise<boolean>;
  getStatus(): {
    id: string;
    name: string;
    kind: BrokerKind;
    isEnabled: boolean;
    isSandbox: boolean;
    isConnected: boolean;
    lastPingMs: number;
    error?: string;
  };
}
