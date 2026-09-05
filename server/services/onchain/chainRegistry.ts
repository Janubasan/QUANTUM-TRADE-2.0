/**
 * chainRegistry.ts — Registro de redes EVM com VALIDAÇÃO ON-CHAIN.
 *
 * Por que este arquivo existe
 * ---------------------------
 * A versão anterior deste projeto (commit 5ad0464) mantinha os endereços de
 * router escritos à mão dentro do adapter, sem nenhuma conferência. Isso
 * produziu um defeito real e reproduzível:
 *
 *     optimism.dexRouter = '0x4A7b5Da61326A6379179b40d00F57E5bbDC962c'
 *
 * Esse endereço tem 41 caracteres hex (o correto são 40). Qualquer swap na
 * Optimism falharia dentro do ethers com um erro obscuro de checksum.
 *
 * A correção aqui é estrutural, não cosmética:
 *   1. Todo endereço passa por `ethers.getAddress()` na carga do módulo.
 *      Endereço malformado derruba o carregamento da rede, não o swap.
 *   2. Redes cujo router não pôde ser confirmado ficam com
 *      `dexRouter: null` e são bloqueadas para swap até alguém configurá-las.
 *   3. `verifyChain()` confere o router NA PRÓPRIA CHAIN: lê o bytecode do
 *      contrato e chama `WETH()` no router, comparando com o wrappedNative
 *      declarado. Se não bater, a rede vira 'invalid' e swap é recusado.
 *
 * Ou seja: o código não confia na tabela. Ele prova a tabela contra a chain.
 */

import { ethers } from 'ethers';
import type { ChainDefinition, ChainEnv } from './types.js';

/**
 * Normaliza um endereço EVM e DEVOLVE null em vez de lançar exceção.
 * Usado na carga da tabela para rejeitar endereço inválido sem derrubar o processo.
 */
export function safeAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return ethers.getAddress(value.trim());
  } catch {
    return null;
  }
}

/** Lança se o endereço não for um endereço EVM válido (com checksum correto). */
export function requireAddress(value: string, label: string): string {
  try {
    return ethers.getAddress(value.trim());
  } catch {
    throw new Error(`[${label}] endereço EVM inválido: "${value}" (esperados 40 hex após 0x)`);
  }
}

/** Lê variável de ambiente como endereço validado; null quando ausente/vazia. */
function envAddress(name: string): string | null {
  return safeAddress(process.env[name]);
}

/** Monta a lista de RPCs: env primeiro (se houver), depois os públicos. */
function rpcList(envName: string, fallbacks: string[]): string[] {
  const fromEnv = process.env[envName];
  const urls = fromEnv ? [fromEnv] : [];
  for (const f of fallbacks) if (!urls.includes(f)) urls.push(f);
  return urls;
}

const RAW: Omit<ChainDefinition, 'verification' | 'verificationDetail'>[] = [
  // ---------------------------------------------------------------- MAINNETS
  {
    key: 'ethereum',
    name: 'Ethereum Mainnet',
    env: 'mainnet',
    chainId: 1,
    nativeSymbol: 'ETH',
    rpcUrls: rpcList('RPC_ETHEREUM', [
      'https://ethereum-rpc.publicnode.com',
      'https://eth.llamarpc.com',
      'https://rpc.ankr.com/eth',
    ]),
    wrappedNative: requireAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'ethereum.wrappedNative'),
    dexRouter: envAddress('DEX_ROUTER_ETHEREUM') ?? requireAddress('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', 'ethereum.dexRouter'),
    dexName: 'Uniswap V2',
    explorer: 'https://etherscan.io',
    blockTimeSeconds: 12,
    liveAllowedByDefault: false, // gas alto + risco: exige flag explícita
  },
  {
    key: 'polygon',
    name: 'Polygon PoS',
    env: 'mainnet',
    chainId: 137,
    nativeSymbol: 'POL',
    rpcUrls: rpcList('RPC_POLYGON', [
      'https://polygon-rpc.com',
      'https://polygon.drpc.org',
      'https://rpc.ankr.com/polygon',
    ]),
    wrappedNative: requireAddress('0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', 'polygon.wrappedNative'),
    dexRouter: envAddress('DEX_ROUTER_POLYGON') ?? requireAddress('0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', 'polygon.dexRouter'),
    dexName: 'QuickSwap (UniV2-style)',
    explorer: 'https://polygonscan.com',
    blockTimeSeconds: 2,
    liveAllowedByDefault: true,
  },
  {
    key: 'bsc',
    name: 'BNB Smart Chain',
    env: 'mainnet',
    chainId: 56,
    nativeSymbol: 'BNB',
    rpcUrls: rpcList('RPC_BSC', [
      'https://bsc-dataseed.binance.org',
      'https://bsc-rpc.publicnode.com',
      'https://rpc.ankr.com/bsc',
    ]),
    wrappedNative: requireAddress('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 'bsc.wrappedNative'),
    dexRouter: envAddress('DEX_ROUTER_BSC') ?? requireAddress('0x10ED43C718714eb63d5aA57B78B54704E256024E', 'bsc.dexRouter'),
    dexName: 'PancakeSwap V2',
    explorer: 'https://bscscan.com',
    blockTimeSeconds: 3,
    liveAllowedByDefault: true,
  },
  {
    key: 'arbitrum',
    name: 'Arbitrum One',
    env: 'mainnet',
    chainId: 42161,
    nativeSymbol: 'ETH',
    rpcUrls: rpcList('RPC_ARBITRUM', [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum-one-rpc.publicnode.com',
    ]),
    wrappedNative: requireAddress('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', 'arbitrum.wrappedNative'),
    dexRouter: envAddress('DEX_ROUTER_ARBITRUM') ?? requireAddress('0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', 'arbitrum.dexRouter'),
    dexName: 'SushiSwap V2',
    explorer: 'https://arbiscan.io',
    blockTimeSeconds: 1,
    liveAllowedByDefault: true,
  },
  {
    key: 'base',
    name: 'Base',
    env: 'mainnet',
    chainId: 8453,
    nativeSymbol: 'ETH',
    rpcUrls: rpcList('RPC_BASE', [
      'https://mainnet.base.org',
      'https://base-rpc.publicnode.com',
    ]),
    wrappedNative: requireAddress('0x4200000000000000000000000000000000000006', 'base.wrappedNative'),
    dexRouter: envAddress('DEX_ROUTER_BASE') ?? requireAddress('0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', 'base.dexRouter'),
    dexName: 'BaseSwap (UniV2-style)',
    explorer: 'https://basescan.org',
    blockTimeSeconds: 2,
    liveAllowedByDefault: true,
  },
  {
    key: 'avalanche',
    name: 'Avalanche C-Chain',
    env: 'mainnet',
    chainId: 43114,
    nativeSymbol: 'AVAX',
    rpcUrls: rpcList('RPC_AVALANCHE', [
      'https://api.avax.network/ext/bc/C/rpc',
      'https://avalanche-c-chain-rpc.publicnode.com',
    ]),
    wrappedNative: requireAddress('0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', 'avalanche.wrappedNative'),
    dexRouter: envAddress('DEX_ROUTER_AVALANCHE') ?? requireAddress('0x60aE616a2155Ee3d9A68541Ba4544862310933d4', 'avalanche.dexRouter'),
    dexName: 'Trader Joe V2',
    explorer: 'https://snowtrace.io',
    blockTimeSeconds: 2,
    liveAllowedByDefault: true,
  },
  {
    key: 'optimism',
    name: 'OP Mainnet',
    env: 'mainnet',
    chainId: 10,
    nativeSymbol: 'ETH',
    rpcUrls: rpcList('RPC_OPTIMISM', [
      'https://mainnet.optimism.io',
      'https://optimism-rpc.publicnode.com',
    ]),
    wrappedNative: requireAddress('0x4200000000000000000000000000000000000006', 'optimism.wrappedNative'),
    /**
     * INTENCIONALMENTE null.
     * O valor que existia aqui ('0x4A7b5Da61326A6379179b40d00F57E5bbDC962c')
     * tinha 41 hex e não era um endereço EVM. A OP Mainnet usa Velodrome, cujo
     * router NÃO é 100% compatível com a ABI Uniswap V2 usada aqui.
     * Deixe null e configure via DEX_ROUTER_OPTIMISM depois de validar a ABI;
     * enquanto isso a rede fica somente-leitura e recusa swaps.
     */
    dexRouter: envAddress('DEX_ROUTER_OPTIMISM'),
    dexName: 'Velodrome (requer configuração manual)',
    explorer: 'https://optimistic.etherscan.io',
    blockTimeSeconds: 2,
    liveAllowedByDefault: true,
  },

  // ---------------------------------------------------------------- TESTNETS
  {
    key: 'sepolia',
    name: 'Ethereum Sepolia (Testnet)',
    env: 'testnet',
    chainId: 11155111,
    nativeSymbol: 'ETH',
    rpcUrls: rpcList('RPC_SEPOLIA', [
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://rpc.sepolia.org',
      'https://sepolia.drpc.org',
    ]),
    wrappedNative: requireAddress('0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', 'sepolia.wrappedNative'),
    dexRouter: envAddress('DEX_ROUTER_SEPOLIA') ?? requireAddress('0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', 'sepolia.dexRouter'),
    dexName: 'Uniswap V2 (Sepolia)',
    explorer: 'https://sepolia.etherscan.io',
    blockTimeSeconds: 12,
    liveAllowedByDefault: true, // testnet: seguro para operar sem flag extra
  },
  {
    key: 'base_sepolia',
    name: 'Base Sepolia (Testnet)',
    env: 'testnet',
    chainId: 84532,
    nativeSymbol: 'ETH',
    rpcUrls: rpcList('RPC_BASE_SEPOLIA', [
      'https://sepolia.base.org',
      'https://base-sepolia-rpc.publicnode.com',
    ]),
    wrappedNative: requireAddress('0x4200000000000000000000000000000000000006', 'base_sepolia.wrappedNative'),
    /** Router de DEX na Base Sepolia: configurar via env após validar. */
    dexRouter: envAddress('DEX_ROUTER_BASE_SEPOLIA'),
    dexName: 'Configurar via DEX_ROUTER_BASE_SEPOLIA',
    explorer: 'https://sepolia.basescan.org',
    blockTimeSeconds: 2,
    liveAllowedByDefault: true,
  },
  {
    key: 'arbitrum_sepolia',
    name: 'Arbitrum Sepolia (Testnet)',
    env: 'testnet',
    chainId: 421614,
    nativeSymbol: 'ETH',
    rpcUrls: rpcList('RPC_ARBITRUM_SEPOLIA', [
      'https://sepolia-rollup.arbitrum.io/rpc',
      'https://arbitrum-sepolia-rpc.publicnode.com',
    ]),
    wrappedNative: requireAddress('0x980B62Da83eFf3D4576C647993b0c1D7faf17c73', 'arbitrum_sepolia.wrappedNative'),
    dexRouter: envAddress('DEX_ROUTER_ARBITRUM_SEPOLIA'),
    dexName: 'Configurar via DEX_ROUTER_ARBITRUM_SEPOLIA',
    explorer: 'https://sepolia.arbiscan.io',
    blockTimeSeconds: 1,
    liveAllowedByDefault: true,
  },
  {
    key: 'bsc_testnet',
    name: 'BSC Testnet (Testnet)',
    env: 'testnet',
    chainId: 97,
    nativeSymbol: 'tBNB',
    rpcUrls: rpcList('RPC_BSC_TESTNET', [
      'https://data-seed-prebsc-1-s1.binance.org:8545',
      'https://bsc-testnet-rpc.publicnode.com',
    ]),
    wrappedNative: requireAddress('0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd', 'bsc_testnet.wrappedNative'),
    dexRouter: envAddress('DEX_ROUTER_BSC_TESTNET'),
    dexName: 'PancakeSwap V2 (Testnet)',
    explorer: 'https://testnet.bscscan.com',
    blockTimeSeconds: 3,
    liveAllowedByDefault: true,
  },
];

export const CHAIN_DEFINITIONS: Record<string, ChainDefinition> = Object.fromEntries(
  RAW.map((c) => [
    c.key,
    { ...c, verification: c.dexRouter ? ('unverified' as const) : ('invalid' as const), verificationDetail: c.dexRouter ? 'Ainda não conferido on-chain' : 'Sem router configurado (defina DEX_ROUTER_*)' },
  ])
);

export type ChainKey = keyof typeof CHAIN_DEFINITIONS & string;

export const CHAIN_KEYS = Object.keys(CHAIN_DEFINITIONS) as ChainKey[];

/** Rede padrão: testnet, para que o primeiro contato nunca seja com dinheiro real. */
export const DEFAULT_CHAIN_KEY: ChainKey = (process.env.DEFAULT_CHAIN as ChainKey) || 'sepolia';

export function getChain(key: string): ChainDefinition {
  const chain = CHAIN_DEFINITIONS[key];
  if (!chain) {
    throw new Error(`Rede desconhecida: "${key}". Disponíveis: ${CHAIN_KEYS.join(', ')}`);
  }
  return chain;
}

export function isChainKey(value: unknown): value is ChainKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CHAIN_DEFINITIONS, value);
}

export function listChains(env?: ChainEnv): ChainDefinition[] {
  const all = Object.values(CHAIN_DEFINITIONS);
  return env ? all.filter((c) => c.env === env) : all;
}

/** URL de transação no explorador de blocos. */
export function explorerTxUrl(chain: ChainDefinition, hash: string): string {
  return `${chain.explorer}/tx/${hash}`;
}

/** URL de endereço no explorador de blocos. */
export function explorerAddressUrl(chain: ChainDefinition, address: string): string {
  return `${chain.explorer}/address/${address}`;
}

/**
 * Verificação ON-CHAIN do router.
 *
 * Faz duas leituras reais:
 *   1. eth_getCode no router — precisa existir contrato (code !== '0x').
 *   2. eth_call em WETH() — o router Uniswap-V2 devolve o token envelopado
 *      que ele usa. Comparamos com o wrappedNative declarado na tabela.
 *
 * Se o passo 2 não bater, a tabela está errada E o swap é bloqueado antes de
 * custar gas a alguém.
 */
export async function verifyChain(
  chain: ChainDefinition,
  provider: ethers.Provider
): Promise<ChainDefinition> {
  const updated: ChainDefinition = { ...chain };

  if (!chain.dexRouter) {
    updated.verification = 'invalid';
    updated.verificationDetail = 'Sem router configurado. Defina DEX_ROUTER_<REDE> no .env.';
    return updated;
  }

  try {
    const code = await provider.getCode(chain.dexRouter);
    if (!code || code === '0x' || code === '0x0') {
      updated.verification = 'invalid';
      updated.verificationDetail = `Nenhum contrato no endereço ${chain.dexRouter} na chainId ${chain.chainId}.`;
      return updated;
    }

    const router = new ethers.Contract(
      chain.dexRouter,
      ['function WETH() view returns (address)'],
      provider
    );
    const routerWeth: string = await router.WETH();
    const normalized = ethers.getAddress(routerWeth);

    if (normalized.toLowerCase() !== chain.wrappedNative.toLowerCase()) {
      updated.verification = 'invalid';
      updated.verificationDetail =
        `Router responde WETH()=${normalized}, mas a tabela declara ${chain.wrappedNative}. Tabela e chain discordam.`;
      return updated;
    }

    updated.verification = 'verified';
    updated.verificationDetail = `Router ${chain.dexRouter} confirmado on-chain (WETH()=${normalized}).`;
  } catch (err: any) {
    updated.verification = 'invalid';
    updated.verificationDetail = `Falha ao verificar router: ${err?.message || err}`;
  }

  return updated;
}

/** A rede aceita swap? (router presente + verificado) */
export function isSwapCapable(chain: ChainDefinition): boolean {
  return Boolean(chain.dexRouter) && chain.verification === 'verified';
}
