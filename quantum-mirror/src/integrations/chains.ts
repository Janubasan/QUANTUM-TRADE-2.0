// Blockchains/redes — RPCs, explorers, DEXs (ref: research/META_RESEARCH.md §3).
import { ChainIntegration } from './types.js';

export const CHAINS: ChainIntegration[] = [
  { id: 'solana', name: 'Solana', kind: 'solana', status: 'ready', rpcEnv: 'RPC_SOLANA_DEVNET', testnetRpc: 'https://api.devnet.solana.com', explorer: 'https://explorer.solana.com', dex: 'Jupiter Aggregator' },
  { id: 'base', name: 'Base', kind: 'evm', status: 'ready', chainId: 8453, rpcEnv: 'RPC_BASE_SEPOLIA', testnetRpc: 'https://sepolia.base.org', explorer: 'https://basescan.org', dex: 'Uniswap V3', routerEnv: 'DEX_ROUTER_BASE' },
  { id: 'arbitrum', name: 'Arbitrum One', kind: 'evm', status: 'ready', chainId: 42161, rpcEnv: 'RPC_ARBITRUM', testnetRpc: 'https://sepolia-rollup.arbitrum.io/rpc', explorer: 'https://arbiscan.io', dex: 'Uniswap V3', routerEnv: 'DEX_ROUTER_ARBITRUM' },
  { id: 'bsc', name: 'BNB Chain', kind: 'evm', status: 'ready', chainId: 56, rpcEnv: 'RPC_BSC', testnetRpc: 'https://data-seed-prebsc-1-s1.binance.org:8545', explorer: 'https://bscscan.com', dex: 'PancakeSwap V3', routerEnv: 'DEX_ROUTER_BSC' },
  { id: 'ethereum', name: 'Ethereum', kind: 'evm', status: 'ready', chainId: 1, rpcEnv: 'RPC_SEPOLIA', testnetRpc: 'https://rpc.sepolia.org', explorer: 'https://etherscan.io', dex: 'Uniswap V3 (anchor auditoria)' },
  { id: 'polygon', name: 'Polygon PoS', kind: 'evm', status: 'ready', chainId: 137, rpcEnv: 'RPC_POLYGON', testnetRpc: 'https://rpc-amoy.polygon.technology', explorer: 'https://polygonscan.com', dex: 'Uniswap V3' },
];

export function rpcFor(chainId: string): string {
  const c = CHAINS.find((x) => x.id === chainId);
  if (!c) throw new Error(`Chain desconhecida: ${chainId}`);
  return process.env[c.rpcEnv] || c.testnetRpc;
}
