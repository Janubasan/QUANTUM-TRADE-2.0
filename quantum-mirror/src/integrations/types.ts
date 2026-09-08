// Tipos unificados de integração (corretoras, carteiras, chains).
export type VenueId = 'paper' | 'binance' | 'bybit' | 'okx' | 'coinbase' | 'kraken' | 'alpaca' | 'mt5' | 'ctrader' | 'onchain';
export type IntegrationStatus = 'ready' | 'stub' | 'disabled';

export interface OrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  type?: 'MARKET' | 'LIMIT';
  tpPrice?: number;
  slPrice?: number;
  clientOrderId?: string;
  meta?: Record<string, unknown>;
}

export interface Fill {
  venue: VenueId;
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  fee: number;
  feeAsset: string;
  testnet: boolean;
  live: boolean;
  ts: string;
  raw?: unknown;
}

export interface VenueAdapter {
  id: VenueId;
  name: string;
  status: IntegrationStatus;
  testnet: boolean;
  placeOrder(o: OrderRequest): Promise<Fill>;
  cancelOrder(orderId: string, symbol?: string): Promise<boolean>;
  getPrice(symbol: string): Promise<number>;
  describe(): { id: VenueId; name: string; status: IntegrationStatus; testnet: boolean; live: boolean };
}

export interface WalletIntegration {
  id: string;
  name: string;
  status: IntegrationStatus;
  chains: string[];
  connect: 'sdk' | 'eip1193' | 'walletconnect' | 'deep-link';
  docs: string;
}

export interface ChainIntegration {
  id: string;
  name: string;
  kind: 'evm' | 'solana';
  status: IntegrationStatus;
  chainId?: number;
  rpcEnv: string;
  testnetRpc: string;
  explorer: string;
  dex: string;
  routerEnv?: string;
}
