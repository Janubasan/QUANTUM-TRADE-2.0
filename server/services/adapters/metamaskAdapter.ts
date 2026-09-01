import { BrokerAdapter, Balance, SignedOrder, ExecutionReceipt, ExecutionStatus, BrokerKind } from './BrokerAdapter.js';

export interface MetaMaskConfig {
  network: 'mainnet' | 'sepolia' | 'arbitrum' | 'polygon';
  rpcUrl?: string;
  walletAddress?: string;
  isSandbox: boolean;
}

export class MetaMaskAdapter implements BrokerAdapter {
  public readonly id = 'metamask';
  public readonly name = 'MetaMask Web3 EVM Gateway';
  public readonly kind: BrokerKind = 'wallet';
  public isEnabled: boolean = true;
  public isSandbox: boolean = true; // Sepolia testnet / simulated by default

  public network: string = 'sepolia';
  public walletAddress: string = '0x71C...89e2 (Sepolia Testnet)';

  private simulatedBalances: Balance[] = [
    { asset: 'ETH (Sepolia)', free: 4.85, locked: 0.1, total: 4.95, updatedAt: new Date().toISOString() },
    { asset: 'USDT (ERC-20)', free: 12450.0, locked: 0, total: 12450.0, updatedAt: new Date().toISOString() },
    { asset: 'WETH', free: 2.1, locked: 0, total: 2.1, updatedAt: new Date().toISOString() },
    { asset: 'UNI', free: 180.0, locked: 0, total: 180.0, updatedAt: new Date().toISOString() },
  ];

  constructor(isSandbox: boolean = true, network: string = 'sepolia') {
    this.isSandbox = isSandbox;
    this.network = network;
    if (!isSandbox) {
      this.walletAddress = '0x71C...89e2 (Ethereum Mainnet)';
    }
  }

  public async getBalances(): Promise<Balance[]> {
    return this.simulatedBalances;
  }

  public async placeOrder(order: SignedOrder): Promise<ExecutionReceipt> {
    const startTime = Date.now();
    const side = order.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
    const clientOrderId = order.order_hash || `mm-${Date.now()}`;
    const latency = Math.floor(Math.random() * 80 + 35); // 35-115ms (gas estimation + signature roundtrip)

    // Gas & Fee calculation simulation
    const estimatedGasGwei = this.network === 'sepolia' ? 12 : 28;
    const gasCostEth = +(estimatedGasGwei * 21000 * 1e-9).toFixed(6);
    const mockTxHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;

    // Execute swap / transfer in simulated state
    const price = order.price || 3450.0;
    const ethAcc = this.simulatedBalances.find((b) => b.asset.includes('ETH'));
    const usdtAcc = this.simulatedBalances.find((b) => b.asset.includes('USDT'));

    if (ethAcc && usdtAcc) {
      if (side === 'BUY') {
        const costUsdt = price * order.quantity;
        usdtAcc.free = Math.max(0, usdtAcc.free - costUsdt);
        ethAcc.free += order.quantity - gasCostEth;
      } else {
        ethAcc.free = Math.max(0, ethAcc.free - order.quantity - gasCostEth);
        usdtAcc.free += price * order.quantity;
      }
      ethAcc.total = ethAcc.free + ethAcc.locked;
      usdtAcc.total = usdtAcc.free + usdtAcc.locked;
    }

    return {
      success: true,
      orderId: `mm-tx-${Date.now().toString(36)}`,
      clientOrderId,
      externalOrderId: mockTxHash,
      adapterId: this.id,
      adapterName: `${this.name} (${this.network.toUpperCase()})`,
      symbol: order.symbol,
      side,
      quantity: order.quantity,
      filledQuantity: order.quantity,
      executedPrice: price,
      fee: gasCostEth,
      feeAsset: 'ETH',
      latencyMs: latency,
      status: 'FILLED',
      timestamp: new Date().toISOString(),
      rawResponse: {
        transactionHash: mockTxHash,
        blockNumber: 5412890,
        gasUsed: 21000,
        effectiveGasPriceGwei: estimatedGasGwei,
        network: this.network,
        sender: this.walletAddress,
      },
    };
  }

  public async cancelOrder(_orderId: string): Promise<boolean> {
    // On-chain transactions cannot be cancelled once included in a block
    return false;
  }

  public async getOrder(orderId: string): Promise<ExecutionStatus> {
    return {
      orderId,
      externalOrderId: `0x${orderId}`,
      status: 'FILLED',
      filledQuantity: 1.0,
      remainingQuantity: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  public async isMarketOpen(_instrument: string): Promise<boolean> {
    return true; // EVM Blockchains run 24/7/365
  }

  public getStatus() {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      isEnabled: this.isEnabled,
      isSandbox: this.isSandbox,
      isConnected: true,
      lastPingMs: 18,
    };
  }
}
