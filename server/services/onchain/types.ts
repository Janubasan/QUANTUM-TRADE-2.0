/**
 * types.ts — Tipos compartilhados da camada de integração on-chain REAL.
 *
 * Regra de ouro deste módulo: nenhum campo aqui pode ser "chutado".
 * Todo valor que representa estado da blockchain vem de uma chamada JSON-RPC
 * real e carrega `source: 'onchain'`. Valores que vierem de outra origem
 * precisam declarar a origem explicitamente.
 */

/** Origem de um dado. Usado para provar de onde cada número veio. */
export type DataProvenance = 'onchain' | 'rpc_config' | 'local' | 'unavailable';

/** Ambiente de execução da rede. */
export type ChainEnv = 'mainnet' | 'testnet';

/** Chave de rede EVM suportada. */
export type ChainKey =
  | 'ethereum'
  | 'polygon'
  | 'bsc'
  | 'arbitrum'
  | 'base'
  | 'optimism'
  | 'avalanche'
  | 'sepolia'
  | 'hardhat'
  | (string & {});

export interface ChainDefinition {
  /** Chave canônica: 'ethereum', 'polygon', 'sepolia'... */
  key: string;
  name: string;
  env: ChainEnv;
  chainId: number;
  nativeSymbol: string;
  /** Lista de RPCs em ordem de preferência (failover real). */
  rpcUrls: string[];
  /** Token nativo envelopado (WETH/WMATIC/WBNB...). Necessário para swaps. */
  wrappedNative: string;
  /** Router estilo Uniswap V2. Pode ser null quando a rede ainda não foi validada. */
  dexRouter: string | null;
  dexName: string;
  /** Base do block explorer, para montar links de auditoria. */
  explorer: string;
  /** Segundos médios entre blocos — usado no cálculo de deadline. */
  blockTimeSeconds: number;
  /** Rede aceita para operação LIVE (mainnet) sem flag extra. */
  liveAllowedByDefault: boolean;
  /**
   * Preenchido em runtime pelo `verifyChain()`.
   * 'verified'  = router + wrappedNative confirmados ON-CHAIN.
   * 'unverified'= não conferido (só leitura permitida).
   * 'invalid'   = checagem on-chain FALHOU. Swaps bloqueados.
   */
  verification?: 'verified' | 'unverified' | 'invalid';
  verificationDetail?: string;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  /** Proveniência dos metadados (sempre 'onchain' quando lidos da chain). */
  provenance: DataProvenance;
}

export interface NativeBalance {
  address: string;
  wei: string;
  /** Valor formatado em unidades humanas. */
  amount: string;
  symbol: string;
  blockNumber: number;
  provenance: DataProvenance;
}

export interface Erc20Balance {
  address: string;
  token: TokenInfo;
  raw: string;
  amount: string;
  /** Allowance já concedida ao router da rede ativa. */
  allowanceToRouter: string;
  blockNumber: number;
  provenance: DataProvenance;
}

export interface SwapQuote {
  tokenIn: string;
  tokenOut: string;
  /** Caminho real usado pelo router (pode incluir o wrapped native no meio). */
  path: string[];
  amountInRaw: string;
  amountInHuman: string;
  amountOutRaw: string;
  amountOutHuman: string;
  /** Preço unitário out/in em unidades humanas. */
  priceOutPerIn: number;
  slippageBps: number;
  amountOutMinRaw: string;
  amountOutMinHuman: string;
  /** Preço mínimo aceito (proteção contra sandwich attack). */
  minPriceOutPerIn: number;
  router: string;
  blockNumber: number;
  /** Cotação obtida ON-CHAIN via router.getAmountsOut(). */
  provenance: DataProvenance;
  expiresAt: number;
}

export interface GasEstimate {
  gasLimit: bigint;
  gasPriceWei: bigint;
  maxPriorityFeeWei?: bigint;
  maxFeeWei?: bigint;
  /** Custo máximo em unidades do token nativo. */
  maxCostNative: string;
  /** true quando a rede é EIP-1559. */
  eip1559: boolean;
  provenance: DataProvenance;
}

export type OnchainTxStatus =
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'REVERTED'
  | 'FAILED'
  | 'NOT_SENT';

export interface OnchainTxResult {
  /** Hash REAL retornado por eth_sendRawTransaction. */
  hash: string | null;
  status: OnchainTxStatus;
  blockNumber: number | null;
  confirmations: number;
  from: string | null;
  to: string | null;
  gasUsed: string | null;
  effectiveGasPriceWei: string | null;
  /** Custo real pago, no token nativo. */
  txFeeNative: string | null;
  /** Link direto para o explorador de blocos. */
  explorerUrl: string | null;
  chainKey: string;
  chainId: number;
  nonce: number | null;
  error?: string;
  /** true quando NENHUMA transação foi enviada (dry-run / guard bloqueou). */
  dryRun: boolean;
  /** Motivo legível quando dryRun = true. */
  dryRunReason?: string;
  /** Proveniência: sempre 'onchain' quando há hash real. */
  provenance: DataProvenance;
  submittedAt: string;
  confirmedAt?: string;
  /** Limite de gas devolvido por eth_estimateGas antes do envio. */
  estimatedGasLimit?: string;
  /** Custo máximo estimado, no token nativo. */
  estimatedMaxCostNative?: string;
  /** true quando a rede cobra gas no modelo EIP-1559. */
  eip1559?: boolean;
}

export interface SwapResult extends OnchainTxResult {
  quote: SwapQuote;
  approval?: OnchainTxResult;
  /** Saldo real do token de saída ANTES do swap (leitura on-chain). */
  balanceOutBefore?: string;
  /** Saldo real do token de saída DEPOIS do swap (leitura on-chain). */
  balanceOutAfter?: string;
  /** Delta real observado na carteira — a prova de que o swap aconteceu. */
  realizedOutAmount?: string;
}

export interface WalletState {
  address: string;
  chainKey: string;
  chainId: number;
  /** true quando a carteira real está carregada (chave privada presente e válida). */
  hasSigningKey: boolean;
  isTestnet: boolean;
}
