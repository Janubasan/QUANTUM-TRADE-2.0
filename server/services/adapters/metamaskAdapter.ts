/**
 * metamaskAdapter.ts
 * ------------------------------------------------------------------
 * Adaptador MetaMask (Web3 Browser Wallet).
 *
 * ⚠️ CARTEIRA DE NAVEGADOR (Client-Side)
 * A MetaMask opera exclusivamente no navegador do usuário (via window.ethereum).
 * O backend não possui a chave privada do usuário e não pode forjar assinaturas
 * ou executar ordens em nome da MetaMask sem aprovação interativa do operador.
 *
 * Este adaptador funciona como visualizador e integrador de status:
 *   - Não inventa saldos nem hashes aleatórios;
 *   - Recusa ordens automáticas do backend, orientando a assinatura na UI;
 *   - Fornece diagnóstico transparente sobre a conexão Web3.
 * ------------------------------------------------------------------
 */

import { ethers } from 'ethers';
import { BrokerAdapter, Balance, SignedOrder, ExecutionReceipt, ExecutionStatus, BrokerKind } from './BrokerAdapter.js';
import { getOnchainService } from '../onchain/onchainService.js';
import { TOKEN_REGISTRY } from '../onchain/tokenRegistry.js';

export interface MetaMaskConfig {
  network: string;
  rpcUrl?: string;
  walletAddress?: string;
  isSandbox: boolean;
}

export class MetaMaskAdapter implements BrokerAdapter {
  public readonly id = 'metamask';
  public readonly name = 'MetaMask Web3 Browser Gateway';
  public readonly kind: BrokerKind = 'wallet';
  public isEnabled: boolean = true;
  public isSandbox: boolean = true;

  public network: string = 'sepolia';
  public walletAddress: string = '';

  constructor(isSandbox: boolean = true, network: string = 'sepolia', walletAddress: string = '') {
    this.isSandbox = isSandbox;
    this.network = network;
    if (walletAddress && ethers.isAddress(walletAddress)) {
      this.walletAddress = ethers.getAddress(walletAddress);
    }
  }

  /**
   * Define ou remove o endereço de observação da MetaMask (Watch-Only)
   */
  public setWatchAddress(address: string) {
    if (!address || address.trim() === '') {
      this.walletAddress = '';
      return;
    }
    const clean = address.trim();
    if (!ethers.isAddress(clean)) {
      throw new Error(`Endereço EVM inválido: "${address}". Um endereço de carteira Ethereum/MetaMask deve iniciar com '0x' e ter 42 caracteres hexadecimais.`);
    }
    this.walletAddress = ethers.getAddress(clean);
  }

  public async getBalances(): Promise<Balance[]> {
    if (!this.walletAddress) {
      return [];
    }

    try {
      const svc = getOnchainService();
      const balances: Balance[] = [];

      // 1. Saldo nativo (ETH, POL, BNB, etc.) direto da rede via RPC sem requerer chave privada
      try {
        const native = await svc.getNativeBalance(this.walletAddress);
        balances.push({
          asset: native.symbol,
          free: parseFloat(native.amount),
          locked: 0,
          total: parseFloat(native.amount),
          updatedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        console.warn(`[MetaMaskAdapter] Erro ao consultar saldo nativo on-chain para ${this.walletAddress}:`, err.message);
      }

      // 2. Saldos de tokens registrados na rede ativa
      const tokenMap = TOKEN_REGISTRY[svc.chainDefinition.key] || {};
      const tokenEntries = Object.entries(tokenMap).slice(0, 4);
      for (const [, tokenAddr] of tokenEntries) {
        try {
          const tBal = await svc.getTokenBalance(tokenAddr, this.walletAddress);
          balances.push({
            asset: tBal.token.symbol,
            free: parseFloat(tBal.amount),
            locked: 0,
            total: parseFloat(tBal.amount),
            updatedAt: new Date().toISOString(),
          });
        } catch {
          // Token sem saldo ou sem contrato na rede
        }
      }

      return balances;
    } catch (e: any) {
      console.warn('[MetaMaskAdapter] Erro geral ao buscar saldos:', e.message);
      return [];
    }
  }

  public async placeOrder(order: SignedOrder): Promise<ExecutionReceipt> {
    // MetaMask requer aprovação interativa do usuário na extensão do navegador
    const side: 'BUY' | 'SELL' = order.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
    return {
      success: false,
      orderId: `mm-req-${Date.now()}`,
      clientOrderId: order.order_hash || `mm-${order.id || Date.now()}`,
      adapterId: this.id,
      adapterName: this.name,
      symbol: order.symbol,
      side,
      quantity: order.quantity,
      filledQuantity: 0,
      executedPrice: 0,
      fee: 0,
      feeAsset: 'ETH',
      latencyMs: 1,
      status: 'REJECTED',
      error: 'MetaMask requer assinatura interativa no navegador (window.ethereum). Ordens diretas do backend não são permitidas por segurança.',
      timestamp: new Date().toISOString(),
    };
  }

  public async cancelOrder(_orderId: string): Promise<boolean> {
    return false;
  }

  public async getOrder(orderId: string): Promise<ExecutionStatus> {
    return {
      orderId,
      externalOrderId: orderId,
      status: 'REJECTED',
      filledQuantity: 0,
      remainingQuantity: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  public async isMarketOpen(_instrument: string): Promise<boolean> {
    return true;
  }

  public async ping(): Promise<{ success: boolean; latencyMs: number; connected: boolean; error?: string; details?: any }> {
    const t0 = Date.now();
    try {
      const svc = getOnchainService();
      const networkBlock = await svc.getBlockNumber();
      const latencyMs = Date.now() - t0;
      const isConnected = Boolean(this.walletAddress);

      return {
        success: true,
        latencyMs,
        connected: isConnected,
        error: isConnected
          ? undefined
          : 'MetaMask opera no navegador (window.ethereum). Pronto para conexão Web3 no cliente ou modo observador.',
        details: {
          chain: svc.chainDefinition.name,
          chainId: svc.chainDefinition.chainId,
          blockNumber: networkBlock,
          walletAddress: this.walletAddress || 'Pendente de conexão no cliente',
          mode: isConnected ? 'Observador On-Chain Ativo' : 'Aguardando Carteira',
        },
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - t0,
        connected: false,
        error: `Falha na conexão com RPC da rede: ${err.message}`,
      };
    }
  }

  public getStatus() {
    let chainName = this.network;
    try {
      chainName = getOnchainService().chainDefinition.key || this.network;
    } catch {}

    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      isEnabled: this.isEnabled,
      isSandbox: this.isSandbox,
      isConnected: Boolean(this.walletAddress),
      lastPingMs: 0,
      network: chainName,
      walletAddress: this.walletAddress || 'Não conectada (conecte via extensão ou insira endereço)',
      requiresClientSignature: true,
    };
  }
}
