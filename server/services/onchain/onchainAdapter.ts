/**
 * onchainAdapter.ts — BrokerAdapter REAL para execução on-chain.
 *
 * Diferença em relação ao `blockchainAdapter.ts` anterior
 * -------------------------------------------------------
 * O adapter antigo (commit 5ad0464) tinha estas fabricações, todas removidas aqui:
 *
 *   - getNativeBalance() devolvia '1.50' sem carteira;
 *   - getTokenBalance() devolvia { balance: '1000.0', symbol: 'USDC' } fixo;
 *   - getBalances() devolvia USDC 5400.0 e WETH 1.25 hardcoded;
 *   - address devolvia a string '0x71C...SandboxWallet';
 *   - swapTokens() em sandbox devolvia hash gerado por Math.random();
 *   - placeOrder() ignorava `order.side` e usava sempre o USDC da Polygon;
 *   - placeOrder() marcava status 'FILLED' e executedPrice 3450.0 mesmo quando
 *     nada tinha sido executado;
 *   - getOrder() devolvia 'FILLED' e filledQuantity 1 para qualquer orderId.
 *
 * Aqui: se não deu para fazer de verdade, o adapter diz que não deu.
 */

import { ethers } from 'ethers';
import {
  type Balance,
  type BrokerAdapter,
  type BrokerKind,
  type ExecutionReceipt,
  type ExecutionStatus,
  type SignedOrder,
} from '../adapters/BrokerAdapter.js';
import { OnchainService, NATIVE_ALIASES } from './onchainService.js';
import { parsePair, resolveToken, hasToken, TOKEN_REGISTRY } from './tokenRegistry.js';
import { explorerTxUrl } from './chainRegistry.js';
import type { ChainDefinition } from './types.js';

export class OnchainAdapter implements BrokerAdapter {
  /**
   * Mantém o id histórico 'blockchain_evm' para que a UI existente
   * (RealExecutionGatewayView.tsx) e o roteamento do gateway continuem funcionando.
   */
  public readonly id = 'blockchain_evm';
  public readonly name = 'On-Chain EVM (execução real)';
  public readonly kind: BrokerKind = 'dex';
  public isEnabled: boolean = true;

  /** Espelha o estado real da rede: testnet => sandbox true; mainnet => false. */
  public get isSandbox(): boolean {
    return this.service.chainDefinition.env === 'testnet';
  }
  public set isSandbox(_value: boolean) {
    // Ignorado de propósito: o modo é derivado da rede, não de um botão.
    // Aceitar um setter silencioso aqui seria exatamente a fabricação que
    // este módulo existe para eliminar.
  }

  /** Atualizado apenas por chamada RPC real (ping). Começa como não conectado. */
  private lastKnownConnected = false;
  private lastPingMs = 0;
  private lastError: string | undefined;
  private lastBlockNumber: number | null = null;

  /**
   * Lista de tokens opcional. Quando ausente, o adapter usa o TOKEN_REGISTRY
   * global (server/services/onchain/tokenRegistry.ts). Serve tanto para testes
   * quanto para listas privadas de tokens que não fazem sentido no registro público.
   */
  private readonly tokenMap: Record<string, string> | null;
  private readonly service: OnchainService;

  constructor(service: OnchainService, opts: { tokenMap?: Record<string, string> } = {}) {
    this.service = service;
    this.tokenMap = opts.tokenMap
      ? Object.fromEntries(
          Object.entries(opts.tokenMap).map(([k, v]) => [k.toUpperCase(), ethers.getAddress(v)])
        )
      : null;
  }

  private resolve(symbol: string): string {
    const sym = symbol.trim().toUpperCase();
    if (this.tokenMap) {
      const found = this.tokenMap[sym];
      if (!found) {
        throw new Error(
          `Símbolo "${sym}" não registrado para a rede ${this.chain.key}. Disponíveis: ${Object.keys(this.tokenMap).join(', ')}.`
        );
      }
      return found;
    }
    return resolveToken(this.chain.key, sym);
  }

  private has(symbol: string): boolean {
    const sym = symbol.trim().toUpperCase();
    if (this.tokenMap) return Boolean(this.tokenMap[sym]);
    return hasToken(this.chain.key, sym);
  }

  public get chain(): ChainDefinition {
    return this.service.chainDefinition;
  }

  // -------------------------------------------------------------- diagnóstico

  /** Ping real: eth_blockNumber de verdade. */
  public async ping(): Promise<{ connected: boolean; latencyMs: number; blockNumber?: number; error?: string }> {
    const started = Date.now();
    const diag = await this.service.diagnose();
    this.lastKnownConnected = diag.connected;
    this.lastPingMs = diag.latencyMs;
    this.lastBlockNumber = diag.blockNumber;
    this.lastError = diag.error;
    return {
      connected: diag.connected,
      latencyMs: diag.latencyMs,
      blockNumber: diag.blockNumber ?? undefined,
      error: diag.error,
    };
  }

  // ------------------------------------------------------------------ saldos

  /**
   * Saldos REAIS. Sem carteira => erro (não saldo inventado).
   * Lê o nativo mais os tokens registrados na rede ativa.
   */
  public async getBalances(): Promise<Balance[]> {
    const chainKey = this.chain.key;
    const wallet = this.service.walletState();
    if (!wallet.hasSigningKey) {
      throw new Error(
        'OnchainAdapter: sem carteira configurada (EVM_PRIVATE_KEY). Nenhum saldo será fabricado.'
      );
    }

    const native = await this.service.getNativeBalance();
    const updatedAt = new Date().toISOString();
    const out: Balance[] = [
      {
        asset: this.chain.nativeSymbol,
        free: Number(native.amount),
        locked: 0,
        total: Number(native.amount),
        updatedAt,
      },
    ];

    // Tokens registrados: lê um a um. Falha individual não derruba a carteira.
    const table = this.tokenMap || TOKEN_REGISTRY[chainKey] || {};
    for (const [symbol, address] of Object.entries(table)) {
      try {
        const bal = await this.service.getTokenBalance(address, native.address);
        out.push({
          asset: symbol,
          free: Number(bal.amount),
          locked: 0,
          total: Number(bal.amount),
          updatedAt,
        });
      } catch {
        // Token sem leitura possível: omitido. Melhor ausência que número falso.
      }
    }

    return out;
  }

  // ------------------------------------------------------------------- ordens

  /**
   * Converte uma ordem do motor num swap on-chain.
   *
   * BUY  BASE/QUOTE => vende QUOTE, compra BASE  (tokenIn = QUOTE)
   * SELL BASE/QUOTE => vende BASE,  recebe QUOTE (tokenIn = BASE)
   */
  public async placeOrder(order: SignedOrder): Promise<ExecutionReceipt> {
    const started = Date.now();
    const chainKey = this.chain.key;
    const side = order.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
    const clientOrderId = order.order_hash || order.id;

    const reject = (message: string): ExecutionReceipt => ({
      success: false,
      orderId: order.id,
      clientOrderId,
      adapterId: this.id,
      adapterName: `${this.name} [${this.chain.name}]`,
      symbol: order.symbol,
      side,
      quantity: order.quantity,
      filledQuantity: 0,
      executedPrice: order.price || 0,
      fee: 0,
      feeAsset: this.chain.nativeSymbol,
      latencyMs: Date.now() - started,
      status: 'REJECTED',
      timestamp: new Date().toISOString(),
      error: message,
    });

    if (!this.service.walletState().hasSigningKey) {
      return reject('Sem carteira configurada (EVM_PRIVATE_KEY). Ordem não enviada.');
    }
    if (!this.chain.dexRouter) {
      return reject(`Rede ${this.chain.name} sem router configurado. Ordem não enviada.`);
    }

    let base: string;
    let quote: string;
    try {
      ({ base, quote } = parsePair(order.symbol));
    } catch (err: any) {
      return reject(err?.message || `Par inválido: ${order.symbol}`);
    }

    if (!this.has(base) || !this.has(quote)) {
      return reject(
        `Token não registrado na rede ${chainKey}: ${!this.has(base) ? base : quote}. Ordem não enviada.`
      );
    }

    const tokenInSymbol = side === 'BUY' ? quote : base;
    const tokenOutSymbol = side === 'BUY' ? base : quote;
    const tokenIn = this.resolve(tokenInSymbol);
    const tokenOut = this.resolve(tokenOutSymbol);

    // Quantidade de entrada: em BUY usamos o notional em quote (price*qty);
    // em SELL usamos a quantidade do ativo base.
    let amountIn: string;
    if (side === 'BUY') {
      const price = order.price;
      if (!price || price <= 0) {
        return reject('Ordem BUY on-chain exige `price` (notional em quote). Nada foi enviado.');
      }
      amountIn = (price * order.quantity).toFixed(8).replace(/\.?0+$/, '');
    } else {
      amountIn = order.quantity.toString();
    }

    // Por padrão NÃO executamos de verdade: exige confirm explícito no meta.
    const confirm = order.meta?.onchainConfirm === true;
    const slippageBps = Number(order.meta?.slippageBps ?? 50);

    try {
      const result = await this.service.swap({
        tokenIn,
        tokenOut,
        amountIn,
        slippageBps,
        confirm,
        dryRun: order.meta?.onchainDryRun === true,
      });

      const latencyMs = Date.now() - started;
      const realized =
        result.realizedOutAmount && result.quote
          ? Number(ethers.formatUnits(result.realizedOutAmount, await this.decimalsOf(result.quote.tokenOut)))
          : 0;

      const executedPrice =
        result.quote && result.quote.priceOutPerIn > 0 ? result.quote.priceOutPerIn : order.price || 0;

      if (result.dryRun || result.status === 'NOT_SENT') {
        return {
          success: false,
          orderId: order.id,
          clientOrderId,
          adapterId: this.id,
          adapterName: `${this.name} [${this.chain.name}]`,
          symbol: order.symbol,
          side,
          quantity: order.quantity,
          filledQuantity: 0,
          executedPrice,
          fee: 0,
          feeAsset: this.chain.nativeSymbol,
          latencyMs,
          status: 'QUEUED',
          timestamp: new Date().toISOString(),
          error: result.dryRunReason || 'Transação não enviada.',
          rawResponse: result,
        };
      }

      const confirmed = result.status === 'CONFIRMED';
      return {
        success: confirmed,
        orderId: order.id,
        clientOrderId,
        externalOrderId: result.hash || undefined,
        adapterId: this.id,
        adapterName: `${this.name} [${this.chain.name} / ${this.chain.dexName}]`,
        symbol: order.symbol,
        side,
        quantity: order.quantity,
        filledQuantity: confirmed ? order.quantity : 0,
        executedPrice,
        fee: result.txFeeNative ? Number(result.txFeeNative) : 0,
        feeAsset: this.chain.nativeSymbol,
        latencyMs,
        status: confirmed ? 'FILLED' : 'REJECTED',
        timestamp: new Date().toISOString(),
        error: result.error,
        rawResponse: {
          ...result,
          realizedOutAmount: realized,
          explorerUrl: result.explorerUrl,
        },
      };
    } catch (err: any) {
      return reject(err?.message || String(err));
    }
  }

  private async decimalsOf(address: string): Promise<number> {
    if (address.toLowerCase() === this.chain.wrappedNative.toLowerCase()) return 18;
    const info = await this.service.getTokenInfo(address);
    return info.decimals;
  }

  /** Transação incluída em bloco é imutável: não existe cancelamento on-chain. */
  public async cancelOrder(_orderId: string): Promise<boolean> {
    return false;
  }

  /**
   * Status REAL da transação, lido por eth_getTransactionReceipt.
   * `orderId` aqui é o hash da transação (0x + 64 hex).
   */
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

    const receipt = await this.service.getReceipt(orderId);
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

  /** DEX é 24/7; mas só dizemos "aberto" se o RPC responder de verdade. */
  public async isMarketOpen(_instrument: string): Promise<boolean> {
    try {
      await this.service.getBlockNumber();
      return true;
    } catch {
      return false;
    }
  }

  public getStatus() {
    const chain = this.chain;
    return {
      id: this.id,
      name: `${this.name} [${chain.name}]`,
      kind: this.kind,
      isEnabled: this.isEnabled,
      isSandbox: this.isSandbox,
      isConnected: this.lastKnownConnected,
      lastPingMs: this.lastPingMs,
      error: this.lastError,
      currentChain: chain.key,
      chainId: chain.chainId,
      routerVerified: chain.verification === 'verified',
      walletAddress: this.service.walletState().address || undefined,
      lastBlockNumber: this.lastBlockNumber ?? undefined,
      explorer: chain.explorer,
    };
  }

  /** Link de auditoria de uma transação. */
  public txUrl(hash: string): string {
    return explorerTxUrl(this.chain, hash);
  }
}

export { NATIVE_ALIASES };
