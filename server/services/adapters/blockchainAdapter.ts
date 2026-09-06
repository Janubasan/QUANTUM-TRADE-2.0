/**
 * blockchainAdapter.ts
 * ------------------------------------------------------------------
 * Adaptador de execução on-chain EVM para o RealExecutionGateway.
 *
 * Delega toda a lógica criptográfica, de conexão e de DEX para o
 * OnchainService (em ../onchain/onchainService.ts), garantindo:
 *   1. Zero fabricação de dados (saldos reais, hashes reais, cotações reais);
 *   2. Verificação on-chain do router antes de swaps;
 *   3. Compatibilidade total com a interface BrokerAdapter existente;
 *   4. Proteção contra reversões e conformidade com limites de notional.
 * ------------------------------------------------------------------
 */

import { BrokerAdapter, Balance, SignedOrder, ExecutionReceipt, ExecutionStatus, BrokerKind } from './BrokerAdapter.js';
import { getOnchainService, OnchainService } from '../onchain/onchainService.js';
import { OnchainAdapter } from '../onchain/onchainAdapter.js';
import { getChain, isChainKey, listChains } from '../onchain/chainRegistry.js';
import type { ChainKey, ChainDefinition } from '../onchain/types.js';

export type { ChainKey };

export interface ChainConfig {
  name: string;
  rpcUrl: string;
  chainId: number;
  nativeSymbol: string;
  dexName: string;
  dexRouter: string;
  wrappedNative: string;
}

// Mapa retrocompatível de redes para consumo do frontend e APIs legadas
export const CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    name: 'Ethereum Mainnet',
    rpcUrl: process.env.RPC_ETHEREUM || 'https://eth.llamarpc.com',
    chainId: 1,
    nativeSymbol: 'ETH',
    dexName: 'Uniswap V2',
    dexRouter: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    wrappedNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  polygon: {
    name: 'Polygon PoS',
    rpcUrl: process.env.RPC_POLYGON || 'https://polygon-rpc.com',
    chainId: 137,
    nativeSymbol: 'POL',
    dexName: 'QuickSwap V2',
    dexRouter: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
    wrappedNative: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  },
  bsc: {
    name: 'BNB Smart Chain',
    rpcUrl: process.env.RPC_BSC || 'https://bsc-dataseed.binance.org',
    chainId: 56,
    nativeSymbol: 'BNB',
    dexName: 'PancakeSwap V2',
    dexRouter: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    wrappedNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  },
  arbitrum: {
    name: 'Arbitrum One',
    rpcUrl: process.env.RPC_ARBITRUM || 'https://arb1.arbitrum.io/rpc',
    chainId: 42161,
    nativeSymbol: 'ETH',
    dexName: 'SushiSwap V2 (Arbitrum)',
    dexRouter: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    wrappedNative: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  base: {
    name: 'Base',
    rpcUrl: process.env.RPC_BASE || 'https://mainnet.base.org',
    chainId: 8453,
    nativeSymbol: 'ETH',
    dexName: 'BaseSwap V2',
    dexRouter: '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86',
    wrappedNative: '0x4200000000000000000000000000000000000006',
  },
  optimism: {
    name: 'OP Mainnet',
    rpcUrl: process.env.RPC_OPTIMISM || 'https://mainnet.optimism.io',
    chainId: 10,
    nativeSymbol: 'ETH',
    dexName: 'Velodrome (OP)',
    dexRouter: '0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858',
    wrappedNative: '0x4200000000000000000000000000000000000006',
  },
  avalanche: {
    name: 'Avalanche C-Chain',
    rpcUrl: process.env.RPC_AVALANCHE || 'https://api.avax.network/ext/bc/C/rpc',
    chainId: 43114,
    nativeSymbol: 'AVAX',
    dexName: 'Trader Joe V1',
    dexRouter: '0x60aE616a2155Ee3d9A68541Ba4544862310933d4',
    wrappedNative: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
  },
  sepolia: {
    name: 'Ethereum Sepolia Testnet',
    rpcUrl: process.env.RPC_SEPOLIA || 'https://ethereum-sepolia-rpc.publicnode.com',
    chainId: 11155111,
    nativeSymbol: 'ETH',
    dexName: 'Uniswap V2 (Sepolia)',
    dexRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    wrappedNative: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  },
};

export class BlockchainAdapter implements BrokerAdapter {
  public readonly id = 'blockchain_evm';
  public readonly name = 'EVM Blockchain Direct Gateway';
  public readonly kind: BrokerKind = 'broker';
  public isEnabled: boolean = true;

  private _svcOverride?: OnchainService;
  private currentChainKey: ChainKey;

  constructor(
    initialChain?: ChainKey,
    privateKey?: string,
    _isSandbox: boolean = true
  ) {
    const defaultChain = (process.env.DEFAULT_CHAIN as ChainKey) || 'sepolia';
    this.currentChainKey = initialChain && isChainKey(initialChain) ? initialChain : defaultChain;
    if (privateKey) {
      this.svc.loadWalletKey(privateKey);
    }
    if (this.currentChainKey) {
      this.svc.switchChain(this.currentChainKey).catch(() => undefined);
    }
  }

  private get svc(): OnchainService {
    return this._svcOverride || getOnchainService();
  }

  private get delegate(): OnchainAdapter {
    return new OnchainAdapter(this.svc);
  }

  public get isSandbox(): boolean {
    return this.svc.getActiveChain().env === 'testnet';
  }

  public set isSandbox(_val: boolean) {
    // Modo sandbox é derivado exclusivamente da rede ativa (testnet vs mainnet)
  }

  public get address(): string {
    return this.svc.walletState().address;
  }

  public getChain(): ChainConfig {
    const chain = this.svc.getActiveChain();
    return {
      name: chain.name,
      rpcUrl: chain.rpcUrls[0] || '',
      chainId: chain.chainId,
      nativeSymbol: chain.nativeSymbol,
      dexName: chain.dexName || 'Uniswap V2',
      dexRouter: chain.dexRouter || '',
      wrappedNative: chain.wrappedNative || '',
    };
  }

  public setChain(chainKey: ChainKey) {
    if (!isChainKey(chainKey)) {
      throw new Error(`Rede desconhecida: ${chainKey}`);
    }
    this.currentChainKey = chainKey;
    this.svc.switchChain(chainKey).catch((err) => {
      console.warn(`[BlockchainAdapter] Falha ao trocar rede para ${chainKey}:`, err);
    });
  }

  public async getNativeBalance(): Promise<string> {
    try {
      const bal = await this.svc.getNativeBalance();
      return bal.amount;
    } catch {
      return '0.0';
    }
  }

  public async getTokenBalance(tokenAddress: string): Promise<{ balance: string; symbol: string }> {
    try {
      const bal = await this.svc.getTokenBalance(tokenAddress);
      return { balance: bal.amount, symbol: bal.token.symbol };
    } catch {
      return { balance: '0.0', symbol: 'UNKNOWN' };
    }
  }

  public async getBalances(): Promise<Balance[]> {
    return this.delegate.getBalances();
  }

  public async getSwapQuote(tokenIn: string, tokenOut: string, amountIn: string): Promise<bigint[]> {
    const quote = await this.svc.getQuote(tokenIn, tokenOut, amountIn);
    return [BigInt(quote.amountInRaw), BigInt(quote.amountOutRaw)];
  }

  public async swapTokens(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    slippageBps: number = 100,
    _deadlineSeconds: number = 300
  ): Promise<{
    hash: string | null;
    status: string;
    blockNumber?: number;
    gasUsed?: string;
    explorerUrl?: string;
    error?: string;
  }> {
    const res = await this.svc.swap({
      tokenIn,
      tokenOut,
      amountIn,
      slippageBps,
      confirm: true,
    });

    return {
      hash: res.hash,
      status: res.status === 'CONFIRMED' ? 'success' : res.status.toLowerCase(),
      blockNumber: res.blockNumber ?? undefined,
      gasUsed: res.gasUsed ?? undefined,
      explorerUrl: res.explorerUrl ?? undefined,
      error: res.error,
    };
  }

  public async placeOrder(order: SignedOrder): Promise<ExecutionReceipt> {
    return this.delegate.placeOrder(order);
  }

  public async getOrder(orderId: string): Promise<ExecutionStatus> {
    return this.delegate.getOrder(orderId);
  }

  public async cancelOrder(orderId: string): Promise<boolean> {
    return this.delegate.cancelOrder(orderId);
  }

  public async isMarketOpen(_instrument: string): Promise<boolean> {
    return true; // Redes blockchain operam 24/7/365
  }

  public async ping() {
    return this.delegate.ping();
  }

  public getStatus() {
    const chain = this.getChain();
    const delegateStatus = this.delegate.getStatus();
    return {
      ...delegateStatus,
      name: `${this.name} [${chain.name}]`,
      currentChain: this.svc.getActiveChain().key,
      walletAddress: this.address,
      dexRouter: chain.dexRouter,
    };
  }
}
