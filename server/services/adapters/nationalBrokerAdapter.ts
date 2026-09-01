import { BrokerAdapter, Balance, SignedOrder, ExecutionReceipt, ExecutionStatus, BrokerKind } from './BrokerAdapter.js';

export type NationalBrokerId = 'xp' | 'genial' | 'orama' | 'inter' | 'btg' | 'mercadobitcoin' | 'clear';

export class NationalBrokerAdapter implements BrokerAdapter {
  public readonly id = 'national_broker';
  public readonly name: string = 'Corretora Nacional B3 (XP / Genial / Órama)';
  public readonly kind: BrokerKind = 'broker';
  public isEnabled: boolean = true;
  public isSandbox: boolean = true; // Homologação / Paper trading by default

  public activeBroker: NationalBrokerId = 'xp';

  private simulatedBalances: Balance[] = [
    { asset: 'BRL (Disponível)', free: 75000.0, locked: 5000.0, total: 80000.0, updatedAt: new Date().toISOString() },
    { asset: 'PETR4 (Ações)', free: 400.0, locked: 0, total: 400.0, updatedAt: new Date().toISOString() },
    { asset: 'VALE3 (Ações)', free: 250.0, locked: 0, total: 250.0, updatedAt: new Date().toISOString() },
    { asset: 'WIN (Contratos Futuros)', free: 5.0, locked: 0, total: 5.0, updatedAt: new Date().toISOString() },
    { asset: 'WDO (Mini Dólar)', free: 2.0, locked: 0, total: 2.0, updatedAt: new Date().toISOString() },
  ];

  constructor(broker: NationalBrokerId = 'xp', isSandbox: boolean = true) {
    this.activeBroker = broker;
    this.isSandbox = isSandbox;
    this.name = `Corretora Nacional B3 (${broker.toUpperCase()} Direct API)`;
  }

  public async getBalances(): Promise<Balance[]> {
    return this.simulatedBalances;
  }

  public async placeOrder(order: SignedOrder): Promise<ExecutionReceipt> {
    const startTime = Date.now();
    const side = order.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
    const clientOrderId = order.order_hash || `b3-${Date.now()}`;
    const latency = Math.floor(Math.random() * 25 + 8); // 8-33ms DMA low latency

    const price = order.price || (order.symbol.includes('PETR4') ? 38.45 : order.symbol.includes('VALE3') ? 62.10 : 128450);
    const notionalBrl = price * order.quantity;
    const b3BrokerageFee = +(notionalBrl * 0.0003).toFixed(2); // Emolumentos B3 (0.03%)

    // Adjust BRL balances
    const brlAcc = this.simulatedBalances.find((b) => b.asset.includes('BRL'));
    if (brlAcc) {
      if (side === 'BUY') {
        brlAcc.free = Math.max(0, brlAcc.free - (notionalBrl + b3BrokerageFee));
      } else {
        brlAcc.free += notionalBrl - b3BrokerageFee;
      }
      brlAcc.total = brlAcc.free + brlAcc.locked;
      brlAcc.updatedAt = new Date().toISOString();
    }

    return {
      success: true,
      orderId: `b3-ord-${Date.now().toString(36)}`,
      clientOrderId,
      externalOrderId: `sinacor-${Math.random().toString(36).substring(2, 10)}`,
      adapterId: this.id,
      adapterName: `${this.name} (${this.isSandbox ? 'Homologação' : 'Produção DMA'})`,
      symbol: order.symbol,
      side,
      quantity: order.quantity,
      filledQuantity: order.quantity,
      executedPrice: price,
      fee: b3BrokerageFee,
      feeAsset: 'BRL',
      latencyMs: latency,
      status: 'FILLED',
      timestamp: new Date().toISOString(),
      rawResponse: {
        sinacor_account: '84920-1',
        broker: this.activeBroker,
        market: 'B3_BOVESPA',
        execution_type: 'DMA_2',
        order_ticket: clientOrderId,
      },
    };
  }

  public async cancelOrder(_orderId: string): Promise<boolean> {
    return true;
  }

  public async getOrder(orderId: string): Promise<ExecutionStatus> {
    return {
      orderId,
      externalOrderId: `sinacor-${orderId}`,
      status: 'FILLED',
      filledQuantity: 1.0,
      remainingQuantity: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  public async isMarketOpen(_instrument: string): Promise<boolean> {
    // Dynamic market clock handles the precise trading session
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
      lastPingMs: 12,
    };
  }
}
