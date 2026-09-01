import { BrokerAdapter, Balance, SignedOrder, ExecutionReceipt, ExecutionStatus, BrokerKind } from './BrokerAdapter.js';

export class PaperAdapter implements BrokerAdapter {
  public readonly id = 'paper';
  public readonly name = 'Paper Trading Engine (Simulação Ultrarrápida)';
  public readonly kind: BrokerKind = 'paper';
  public isEnabled: boolean = true;
  public isSandbox: boolean = true;

  private simulatedBalances: Balance[] = [
    { asset: 'USD (Virtual)', free: 100000.0, locked: 0, total: 100000.0, updatedAt: new Date().toISOString() },
    { asset: 'BRL (Virtual)', free: 500000.0, locked: 0, total: 500000.0, updatedAt: new Date().toISOString() },
    { asset: 'BTC (Virtual)', free: 2.5, locked: 0, total: 2.5, updatedAt: new Date().toISOString() },
    { asset: 'ETH (Virtual)', free: 25.0, locked: 0, total: 25.0, updatedAt: new Date().toISOString() },
  ];

  public async getBalances(): Promise<Balance[]> {
    return this.simulatedBalances;
  }

  public async placeOrder(order: SignedOrder): Promise<ExecutionReceipt> {
    const side = order.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
    const clientOrderId = order.order_hash || `paper-${Date.now()}`;
    const latency = +(Math.random() * 0.8 + 0.12).toFixed(2); // Sub-millisecond simulation
    const price = order.price || 65000.0;
    const fee = +(price * order.quantity * 0.0002).toFixed(4);

    return {
      success: true,
      orderId: `paper-${Date.now().toString(36)}`,
      clientOrderId,
      externalOrderId: `sim-${Math.random().toString(36).substring(2, 8)}`,
      adapterId: this.id,
      adapterName: this.name,
      symbol: order.symbol,
      side,
      quantity: order.quantity,
      filledQuantity: order.quantity,
      executedPrice: price,
      fee,
      feeAsset: 'USD',
      latencyMs: latency,
      status: 'FILLED',
      timestamp: new Date().toISOString(),
      rawResponse: {
        engine: 'In-Memory Matcher',
        slippage: 0.0001,
        fill_type: 'IMMEDIATE_OR_CANCEL',
      },
    };
  }

  public async cancelOrder(_orderId: string): Promise<boolean> {
    return true;
  }

  public async getOrder(orderId: string): Promise<ExecutionStatus> {
    return {
      orderId,
      externalOrderId: `sim-${orderId}`,
      status: 'FILLED',
      filledQuantity: 1.0,
      remainingQuantity: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  public async isMarketOpen(_instrument: string): Promise<boolean> {
    return true;
  }

  public getStatus() {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      isEnabled: this.isEnabled,
      isSandbox: this.isSandbox,
      isConnected: true,
      lastPingMs: 0.4,
    };
  }
}
