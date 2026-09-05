/**
 * blockchainAdapter.ts — ⚠️ MÓDULO SUBSTITUÍDO.
 *
 * Este arquivo continha a implementação on-chain original (commit 5ad0464).
 * Ela foi removida porque fabricava dados que pareciam reais. Especificamente:
 *
 *   • getNativeBalance()   → devolvia '1.50' quando não havia carteira;
 *   • getTokenBalance()    → devolvia { balance: '1000.0', symbol: 'USDC' } fixo;
 *   • getBalances()        → devolvia USDC 5400.00 e WETH 1.25 hardcoded;
 *   • get address()        → devolvia a string '0x71C...SandboxWallet';
 *   • swapTokens()         → em sandbox devolvia hash feito com Math.random();
 *   • placeOrder()         → ignorava order.side e usava sempre o USDC da
 *                            Polygon (0x2791Bca1...) em QUALQUER rede;
 *   • placeOrder()         → marcava status 'FILLED' e executedPrice 3450.0
 *                            mesmo quando nenhuma transação existia;
 *   • getOrder()           → devolvia 'FILLED' / filledQuantity 1 para
 *                            qualquer orderId, inclusive inexistente;
 *   • getStatus()          → lastPingMs com fallback `|| 35` inventado;
 *   • CHAINS.optimism.dexRouter → '0x4A7b5Da61326A6379179b40d00F57E5bbDC962c'
 *                            tem 41 caracteres hex, não é um endereço EVM.
 *
 * A implementação real está em `server/services/onchain/`:
 *   onchainService.ts   leitura, cotação e swap on-chain de verdade
 *   onchainAdapter.ts   BrokerAdapter real (id 'blockchain_evm' preservado)
 *   chainRegistry.ts    redes com verificação on-chain do router
 *   evmProvider.ts      JSON-RPC com failover e leitura sem cache
 *   auditAnchor.ts      trilha de auditoria persistida e ancorada on-chain
 *
 * Este wrapper existe apenas para não quebrar imports antigos.
 * Não adicione código novo aqui.
 *
 * @deprecated Use `server/services/onchain/onchainAdapter.ts`.
 */

import { OnchainAdapter } from '../onchain/onchainAdapter.js';
import { getOnchainService } from '../onchain/onchainService.js';
import { CHAIN_DEFINITIONS, type ChainKey } from '../onchain/chainRegistry.js';

export { OnchainAdapter as BlockchainAdapter };
export { CHAIN_DEFINITIONS as CHAINS, type ChainKey };

/**
 * Fábrica compatível com a assinatura antiga
 * `new BlockchainAdapter(chainKey, privateKey, isSandbox)`.
 *
 * O parâmetro `isSandbox` é IGNORADO de propósito: o modo agora deriva da rede
 * (testnet => sandbox, mainnet => live) e não de um argumento que podia ser
 * passado como `true` e ainda assim produzir saída com cara de execução real.
 */
export function createBlockchainAdapter(chainKey?: ChainKey, privateKey?: string): OnchainAdapter {
  const service = getOnchainService();
  if (chainKey) void service.setChain(chainKey);
  if (privateKey) service.setPrivateKey(privateKey);
  return new OnchainAdapter(service);
}
