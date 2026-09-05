/**
 * metamaskAdapter.ts — Visualizador de carteira EVM (somente leitura).
 *
 * O que mudou
 * -----------
 * A versão anterior (commit 5ad0464) era 100% fabricada:
 *   • endereço fixo '0x71C...89e2 (Sepolia Testnet)' — nem é um endereço EVM;
 *   • `simulatedBalances` com 4.85 ETH, 12450 USDT, 2.1 WETH, 180 UNI;
 *   • `placeOrder()` gerava hash com Math.random(), latency com Math.random()
 *     e devolvia status 'FILLED' + blockNumber 5412890 fixo;
 *   • `getStatus()` devolvia isConnected: true e lastPingMs: 18 sempre.
 *
 * MetaMask é uma carteira de navegador: um servidor Node não tem como assinar
 * por ela. Fingir que executa ordens era o pior tipo de mentira possível num
 * sistema de trading. Então este adapter passou a fazer apenas o que dá para
 * fazer de verdade no servidor:
 *
 *   1. Ler saldos on-chain reais de um endereço (via OnchainService).
 *   2. Recusar ordens com uma explicação clara, apontando o caminho real
 *      (assinatura via MetaMask no navegador, ou chave no cofre + adapter
 *      blockchain_evm).
 *
 * Para executar on-chain de verdade, use `OnchainAdapter`
 * (server/services/onchain/onchainAdapter.ts).
 */

import {
  type Balance,
  type BrokerAdapter,
  type BrokerKind,
  type ExecutionReceipt,
  type ExecutionStatus,
  type SignedOrder,
} from './BrokerAdapter.js';
import { getOnchainService } from '../onchain/onchainService.js';
import { TOKEN_REGISTRY } from '../onchain/tokenRegistry.js';
import { safeAddress } from '../onchain/chainRegistry.js';

export interface MetaMaskConfig {
  network: string;
  walletAddress?: string;
  isSandbox: boolean;
}

export class MetaMaskAdapter implements BrokerAdapter {
  public readonly id = 'metamask';
  public readonly name = 'MetaMask (carteira, somente leitura)';
  public readonly kind: BrokerKind = 'wallet';
  public isEnabled: boolean = true;

  /** Sempre sandbox: este adapter não executa nada, por definição. */
  public isSandbox: boolean = true;

  public network: string;
  /** Endereço observado. Vazio até alguém informar um endereço válido. */
  public walletAddress: string = '';

  private lastKnownConnected = false;
  private lastPingMs = 0;
  private lastError: string | undefined;

  constructor(_isSandbox: boolean = true, network: string = 'sepolia') {
    this.network = network;
  }

  /** Define o endereço observado. Endereço inválido é rejeitado, não truncado. */
  public setWatchAddress(address: string): void {
    const checked = safeAddress(address);
    if (!checked) {
      throw new Error(`Endereço EVM inválido: "${address}". Esperado 0x + 40 hex.`);
    }
    this.walletAddress = checked;
  }

  /** Diagnóstico real contra o RPC da rede ativa. */
  public async ping(): Promise<{ connected: boolean; latencyMs: number; blockNumber?: number; error?: string }> {
    const started = Date.now();
    const diag = await getOnchainService().diagnose();
    this.lastKnownConnected = diag.connected;
    this.lastPingMs = diag.latencyMs;
    this.lastError = diag.error;
    return {
      connected: diag.connected,
      latencyMs: diag.latencyMs,
      blockNumber: diag.blockNumber ?? undefined,
      error: diag.error,
    };
  }

  /**
   * Saldos REAIS do endereço observado.
   * Sem endereço informado => erro explícito (nunca saldo inventado).
   */
  public async getBalances(): Promise<Balance[]> {
    if (!this.walletAddress) {
      throw new Error(
        'MetaMaskAdapter: nenhum endereço em observação. Informe via POST /api/onchain/watch-address. Nenhum saldo será fabricado.'
      );
    }
    const svc = getOnchainService();
    const chainKey = svc.chainDefinition.key;
    const updatedAt = new Date().toISOString();

    const native = await svc.getNativeBalance(this.walletAddress);
    const out: Balance[] = [
      {
        asset: svc.chainDefinition.nativeSymbol,
        free: Number(native.amount),
        locked: 0,
        total: Number(native.amount),
        updatedAt,
      },
    ];

    for (const [symbol, address] of Object.entries(TOKEN_REGISTRY[chainKey] || {})) {
      try {
        const bal = await svc.getTokenBalance(address, this.walletAddress);
        out.push({
          asset: symbol,
          free: Number(bal.amount),
          locked: 0,
          total: Number(bal.amount),
          updatedAt,
        });
      } catch {
        // Token ilegível: omitido. Ausência é honesta; número inventado não é.
      }
    }
    return out;
  }

  /**
   * Sempre recusa. Um servidor não assina por uma carteira de navegador, e
   * inventar um hash seria fraude.
   */
  public async placeOrder(order: SignedOrder): Promise<ExecutionReceipt> {
    return {
      success: false,
      orderId: order.id,
      clientOrderId: order.order_hash || order.id,
      adapterId: this.id,
      adapterName: this.name,
      symbol: order.symbol,
      side: order.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
      quantity: order.quantity,
      filledQuantity: 0,
      executedPrice: 0,
      fee: 0,
      feeAsset: 'ETH',
      latencyMs: 0,
      status: 'REJECTED',
      timestamp: new Date().toISOString(),
      error:
        'MetaMaskAdapter é somente leitura: um servidor não assina transações por uma carteira de navegador. ' +
        'Para executar on-chain use o adapter blockchain_evm (OnchainAdapter) com EVM_PRIVATE_KEY no cofre, ' +
        'ou assine no navegador e envie a transação assinada.',
    };
  }

  public async cancelOrder(_orderId: string): Promise<boolean> {
    return false;
  }

  /** Status real por receipt; hash inválido nunca vira FILLED. */
  public async getOrder(orderId: string): Promise<ExecutionStatus> {
    const updatedAt = new Date().toISOString();
    if (!/^0x[0-9a-fA-F]{64}$/.test(orderId)) {
      return {
        orderId,
        externalOrderId: '',
        status: 'REJECTED',
        filledQuantity: 0,
        remainingQuantity: 0,
        updatedAt,
      };
    }
    const receipt = await getOnchainService().getReceipt(orderId);
    if (!receipt) {
      return {
        orderId,
        externalOrderId: orderId,
        status: 'PENDING',
        filledQuantity: 0,
        remainingQuantity: 0,
        updatedAt,
      };
    }
    return {
      orderId,
      externalOrderId: receipt.hash,
      status: receipt.status === 1 ? 'FILLED' : 'REJECTED',
      filledQuantity: receipt.status === 1 ? 1 : 0,
      remainingQuantity: 0,
      updatedAt,
    };
  }

  public async isMarketOpen(_instrument: string): Promise<boolean> {
    try {
      await getOnchainService().getBlockNumber();
      return true;
    } catch {
      return false;
    }
  }

  public getStatus() {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      isEnabled: this.isEnabled,
      isSandbox: this.isSandbox,
      isConnected: this.lastKnownConnected,
      lastPingMs: this.lastPingMs,
      error: this.lastError || (this.walletAddress ? undefined : 'Nenhum endereço em observação'),
      watchAddress: this.walletAddress || undefined,
      readOnly: true,
    };
  }
}
