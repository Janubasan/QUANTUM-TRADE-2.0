/**
 * onchainService.ts — Execução on-chain REAL (leitura, cotação e swap).
 *
 * Contrato de honestidade deste arquivo
 * -------------------------------------
 * 1. Nenhum saldo, preço, hash ou taxa é fabricado. Se não houver carteira,
 *    carteira sem saldo, RPC fora do ar ou router não verificado, o método
 *    LANÇA erro ou devolve `provenance: 'unavailable'`. Nunca um número chutado.
 * 2. Swap em rede LIVE exige chave de carteira + router verificado + confirmação
 *    explícita (`confirm: true`). Sem isso, devolve um DRY-RUN declarado
 *    (`dryRun: true, status: 'NOT_SENT'`) — nunca um hash falso.
 * 3. Todo resultado de transação traz o hash real e o link do explorador.
 *    Quem quiser auditar, abre o link e confere.
 */

import { ethers } from 'ethers';
import { decryptSecret } from '../cryptoService.js';
import { EvmConnection } from './evmProvider.js';
import {
  CHAIN_DEFINITIONS,
  DEFAULT_CHAIN_KEY,
  explorerAddressUrl,
  explorerTxUrl,
  getChain,
  isChainKey,
  isSwapCapable,
  requireAddress,
  safeAddress,
  verifyChain,
  type ChainKey,
} from './chainRegistry.js';
import type {
  ChainDefinition,
  Erc20Balance,
  GasEstimate,
  NativeBalance,
  OnchainTxResult,
  OnchainTxStatus,
  SwapQuote,
  SwapResult,
  TokenInfo,
  WalletState,
} from './types.js';

/** Sentinelas aceitas para "token nativo" (ETH/POL/BNB...) numa ordem de swap. */
export const NATIVE_ALIASES = new Set(['NATIVE', 'ETH_NATIVE', 'NATIVE_TOKEN']);

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
] as const;

const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external',
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external',
  'function WETH() external pure returns (address)',
] as const;

/** Mutex simples: serializa envios da mesma carteira para não colidir nonce. */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  public runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

export interface OnchainServiceOptions {
  chainKey?: ChainKey;
  /**
   * Sobrescreve a definição de rede inteira.
   * Usado em testes de integração para apontar o serviço a um nó JSON-RPC local
   * sem precisar mexer em variável de ambiente antes do import.
   */
  chainOverride?: ChainDefinition;
  /** Chave privada crua ou cifrada no formato vault:v1:... */
  privateKey?: string;
  /** true = testnet/simulação permitida; false = pode operar mainnet. */
  allowLive?: boolean;
  /** Valor máximo por swap, em USD aproximado. Guarda de risco. */
  maxNotionalUsd?: number;
  /** Confirmações mínimas aguardadas antes de reportar CONFIRMED. */
  confirmations?: number;
  /** Aprovação infinita ao router? Padrão false (aprova só o necessário). */
  infiniteApproval?: boolean;
}

export class OnchainService {
  private chain: ChainDefinition;
  private connection: EvmConnection;
  private wallet: ethers.Wallet | null = null;
  private mutex = new Mutex();

  private allowLive: boolean;
  private maxNotionalUsd: number;
  private confirmations: number;
  private infiniteApproval: boolean;

  /** true quando a definição de rede foi injetada (testes), não vinda do registro. */
  private usingOverride: boolean;

  constructor(opts: OnchainServiceOptions = {}) {
    if (opts.chainOverride) {
      this.chain = { ...opts.chainOverride };
      this.usingOverride = true;
    } else {
      const key = opts.chainKey || DEFAULT_CHAIN_KEY;
      if (!isChainKey(key)) {
        throw new Error(`Rede inválida: ${key}`);
      }
      this.chain = getChain(key);
      this.usingOverride = false;
    }
    this.connection = new EvmConnection(this.chain);
    this.allowLive = opts.allowLive ?? false;
    this.maxNotionalUsd = opts.maxNotionalUsd ?? Number(process.env.ONCHAIN_MAX_NOTIONAL_USD || 1000);
    this.confirmations = opts.confirmations ?? Number(process.env.ONCHAIN_CONFIRMATIONS || 1);
    this.infiniteApproval = opts.infiniteApproval ?? process.env.ONCHAIN_INFINITE_APPROVAL === 'true';

    const rawKey = opts.privateKey ?? process.env.EVM_PRIVATE_KEY ?? process.env.WALLET_PRIVATE_KEY ?? '';
    if (rawKey && rawKey.trim().length > 0) {
      this.loadWallet(rawKey);
    }
  }

  // ------------------------------------------------------------------ carteira

  private loadWallet(rawKey: string): void {
    const plain = decryptSecret(rawKey.trim());
    if (!plain) {
      throw new Error('Chave privada vazia após decriptação (verifique ENCRYPTION_KEY).');
    }
    const hex = plain.startsWith('0x') ? plain : `0x${plain}`;
    // ethers.Wallet lança se a chave não for 32 bytes hex válidos — não aceitamos chave inválida.
    this.wallet = new ethers.Wallet(hex);
  }

  public setPrivateKey(rawKey: string): WalletState {
    this.loadWallet(rawKey);
    return this.walletState();
  }

  public loadWalletKey(rawKey: string): WalletState {
    return this.setPrivateKey(rawKey);
  }

  public walletState(): WalletState {
    return {
      address: this.wallet ? this.wallet.address : '',
      chainKey: this.chain.key,
      chainId: this.chain.chainId,
      hasSigningKey: Boolean(this.wallet),
      isTestnet: this.chain.env === 'testnet',
    };
  }

  public get chainDefinition(): ChainDefinition {
    return this.chain;
  }

  public getActiveChain(): ChainDefinition {
    return this.chain;
  }

  /** Exige carteira; lança erro claro em vez de retornar endereço de mentira. */
  private requireWallet(): ethers.Wallet {
    if (!this.wallet) {
      throw new Error(
        'Nenhuma carteira configurada. Defina EVM_PRIVATE_KEY no .env (ou chame POST /api/onchain/wallet/key). Nenhuma operação foi simulada.'
      );
    }
    return this.wallet;
  }

  // --------------------------------------------------------------------- rede

  public async setChain(key: string): Promise<ChainDefinition> {
    if (!isChainKey(key)) throw new Error(`Rede inválida: ${key}`);
    const next = getChain(key);
    this.connection.destroy();
    this.chain = next;
    this.usingOverride = false;
    this.connection = new EvmConnection(this.chain);
    if (this.wallet) this.wallet = this.wallet.connect(await this.connection.bestProvider());
    return this.chain;
  }

  public async switchChain(key: string): Promise<ChainDefinition> {
    return this.setChain(key);
  }

  /** Diagnóstico RPC real (altura de bloco + latência por endpoint). */
  public async diagnose() {
    return this.connection.diagnose();
  }

  /** Confere o router na chain e atualiza o registro em memória. */
  public async verifyRouter(): Promise<ChainDefinition> {
    const provider = await this.connection.bestProvider();
    const verified = await verifyChain(this.chain, provider);
    // Só atualiza o registro global quando a rede veio do próprio registro;
    // com override (testes) não poluímos a tabela compartilhada.
    if (!this.usingOverride && Object.prototype.hasOwnProperty.call(CHAIN_DEFINITIONS, this.chain.key)) {
      CHAIN_DEFINITIONS[this.chain.key] = verified;
    }
    this.chain = verified;
    return verified;
  }

  public chainInfo(): ChainDefinition {
    return this.chain;
  }

  // ------------------------------------------------------------------ leituras

  /**
   * Altura atual do bloco, SEM o cache de 250 ms do ethers.
   * Usado por `isMarketOpen()` e pelos endpoints de saúde: um valor defasado
   * aqui faria o sistema declarar "conectado" com base em dado velho.
   */
  public async getBlockNumber(): Promise<number> {
    return this.connection.freshBlockNumber();
  }

  /**
   * Receipt REAL de uma transação (eth_getTransactionReceipt).
   * Devolve null quando a transação ainda não foi incluída em bloco.
   */
  public async getReceipt(txHash: string): Promise<ethers.TransactionReceipt | null> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new Error(`Hash de transação inválido: "${txHash}"`);
    }
    return this.connection.run((p) => p.getTransactionReceipt(txHash), 'eth_getTransactionReceipt');
  }

  /** Transação bruta + confirmações atuais, para auditoria detalhada. */
  public async getTransactionStatus(txHash: string): Promise<{
    hash: string;
    found: boolean;
    status: OnchainTxStatus;
    blockNumber: number | null;
    confirmations: number;
    gasUsed: string | null;
    txFeeNative: string | null;
    explorerUrl: string;
    provenance: 'onchain';
  }> {
    const receipt = await this.getReceipt(txHash);
    const base = {
      hash: txHash,
      explorerUrl: explorerTxUrl(this.chain, txHash),
      provenance: 'onchain' as const,
    };
    if (!receipt) {
      return { ...base, found: false, status: 'SUBMITTED', blockNumber: null, confirmations: 0, gasUsed: null, txFeeNative: null };
    }
    return {
      ...base,
      found: true,
      status: receipt.status === 1 ? 'CONFIRMED' : 'REVERTED',
      blockNumber: receipt.blockNumber,
      confirmations: await receipt.confirmations(),
      gasUsed: receipt.gasUsed.toString(),
      txFeeNative: receipt.gasPrice ? ethers.formatEther(receipt.gasUsed * receipt.gasPrice) : null,
    };
  }

  /** Saldo do token nativo, lido da chain. */
  public async getNativeBalance(address?: string): Promise<NativeBalance> {
    const owner = address ?? this.requireWallet().address;
    const [wei, blockNumber] = await this.connection.run(async (p) => {
      const b = await p.getBalance(owner);
      const n = await p.getBlockNumber();
      return [b, n] as const;
    }, 'eth_getBalance');

    return {
      address: owner,
      wei: wei.toString(),
      amount: ethers.formatEther(wei),
      symbol: this.chain.nativeSymbol,
      blockNumber,
      provenance: 'onchain',
    };
  }

  /** Metadados ERC-20 lidos on-chain (symbol/decimals), com cache por endereço. */
  private tokenCache = new Map<string, TokenInfo>();

  public async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const addr = requireAddress(tokenAddress, 'token');
    const cached = this.tokenCache.get(`${this.chain.key}:${addr.toLowerCase()}`);
    if (cached) return cached;

    const token = new ethers.Contract(addr, ERC20_ABI, await this.connection.bestProvider());
    const [symbol, decimals] = await this.connection.run(async () => {
      const s: string = await token.symbol();
      const d: bigint = await token.decimals();
      return [s, Number(d)] as const;
    }, `ERC20 symbol/decimals de ${addr}`);

    const info: TokenInfo = { address: addr, symbol, decimals, provenance: 'onchain' };
    this.tokenCache.set(`${this.chain.key}:${addr.toLowerCase()}`, info);
    return info;
  }

  /** Saldo ERC-20 + allowance já concedida ao router. */
  public async getTokenBalance(tokenAddress: string, owner?: string): Promise<Erc20Balance> {
    const who = owner ?? this.requireWallet().address;
    const info = await this.getTokenInfo(tokenAddress);
    const provider = await this.connection.bestProvider();
    const token = new ethers.Contract(info.address, ERC20_ABI, provider);

    const [raw, allowance, blockNumber] = await this.connection.run(async () => {
      const bal: bigint = await token.balanceOf(who);
      const allow: bigint = this.chain.dexRouter
        ? await token.allowance(who, this.chain.dexRouter)
        : 0n;
      const n = await p_blockNumber(provider);
      return [bal, allow, n] as const;
    }, `ERC20 balanceOf/allowance de ${info.address}`);

    return {
      address: who,
      token: info,
      raw: raw.toString(),
      amount: ethers.formatUnits(raw, info.decimals),
      allowanceToRouter: allowance.toString(),
      blockNumber,
      provenance: 'onchain',
    };
  }

  /** Carteira completa: nativo + lista de tokens. */
  public async getAllBalances(tokenAddresses: string[] = []): Promise<{
    wallet: WalletState;
    native: NativeBalance;
    tokens: Erc20Balance[];
    explorerUrl: string;
  }> {
    return this.getPortfolio(tokenAddresses);
  }

  public async getPortfolio(tokenAddresses: string[] = []): Promise<{
    wallet: WalletState;
    native: NativeBalance;
    tokens: Erc20Balance[];
    explorerUrl: string;
  }> {
    const wallet = this.requireWallet();
    const native = await this.getNativeBalance(wallet.address);
    const tokens: Erc20Balance[] = [];
    for (const addr of tokenAddresses) {
      try {
        tokens.push(await this.getTokenBalance(addr, wallet.address));
      } catch (err: any) {
        tokens.push({
          address: wallet.address,
          token: { address: safeAddress(addr) || addr, symbol: 'UNKNOWN', decimals: 18, provenance: 'unavailable' },
          raw: '0',
          amount: '0',
          allowanceToRouter: '0',
          blockNumber: 0,
          provenance: 'unavailable',
        });
        console.warn(`[onchain] falha ao ler token ${addr}: ${err?.message || err}`);
      }
    }
    return {
      wallet: this.walletState(),
      native,
      tokens,
      explorerUrl: explorerAddressUrl(this.chain, wallet.address),
    };
  }

  // ------------------------------------------------------------------ cotação

  /**
   * Converte os símbolos/endereços de entrada e saída para o caminho que o
   * router entende. O token nativo entra no path como wrappedNative.
   */
  public resolvePath(tokenIn: string, tokenOut: string): { path: string[]; inIsNative: boolean; outIsNative: boolean } {
    const inNative = this.isNative(tokenIn);
    const outNative = this.isNative(tokenOut);

    const inAddr = inNative ? this.chain.wrappedNative : requireAddress(tokenIn, 'tokenIn');
    const outAddr = outNative ? this.chain.wrappedNative : requireAddress(tokenOut, 'tokenOut');

    if (inAddr.toLowerCase() === outAddr.toLowerCase()) {
      throw new Error('tokenIn e tokenOut resolvem para o mesmo endereço. Nada a trocar.');
    }

    const path = [inAddr];
    // Roteia via wrapped native quando não houver par direto: A -> W -> B.
    if (!inNative && !outNative && process.env.ONCHAIN_FORCE_MULTIHOP === 'true') {
      path.push(this.chain.wrappedNative);
    }
    path.push(outAddr);
    return { path, inIsNative: inNative, outIsNative: outNative };
  }

  private isNative(token: string): boolean {
    const t = token.trim().toUpperCase();
    if (NATIVE_ALIASES.has(t)) return true;
    return t === this.chain.nativeSymbol.toUpperCase();
  }

  /** Cotação REAL via router.getAmountsOut(). */
  public async getQuote(tokenIn: string, tokenOut: string, amountIn: string, slippageBps = 50): Promise<SwapQuote> {
    if (!this.chain.dexRouter) {
      throw new Error(`A rede ${this.chain.name} não tem router configurado. Defina DEX_ROUTER_* no .env.`);
    }
    if (slippageBps < 0 || slippageBps > 5000) {
      throw new Error(`slippageBps inválido: ${slippageBps} (use 0 a 5000, ou seja, 0% a 50%).`);
    }

    const { path, inIsNative } = this.resolvePath(tokenIn, tokenOut);
    const inInfo = inIsNative
      ? { address: this.chain.wrappedNative, symbol: this.chain.nativeSymbol, decimals: 18, provenance: 'rpc_config' as const }
      : await this.getTokenInfo(path[0]);
    const outInfo = this.isNative(tokenOut)
      ? { address: this.chain.wrappedNative, symbol: this.chain.nativeSymbol, decimals: 18, provenance: 'rpc_config' as const }
      : await this.getTokenInfo(path[path.length - 1]);

    const amountInRaw = ethers.parseUnits(amountIn, inInfo.decimals);
    if (amountInRaw <= 0n) throw new Error('amountIn deve ser maior que zero.');

    const [amounts, blockNumber] = await this.connection.run(async (provider) => {
      const router = new ethers.Contract(this.chain.dexRouter!, ROUTER_ABI, provider);
      const a: bigint[] = await router.getAmountsOut(amountInRaw, path);
      const n: number = await provider.getBlockNumber();
      return [a, n] as const;
    }, 'router.getAmountsOut');

    if (!Array.isArray(amounts) || amounts.length === 0) {
      throw new Error(`Router ${this.chain.dexRouter} não devolveu cotação para o caminho ${path.join(' → ')}. Provavelmente não há liquidez.`);
    }

    const amountOutRaw = amounts[amounts.length - 1];
    const amountOutMinRaw = (amountOutRaw * BigInt(10000 - slippageBps)) / 10000n;

    const amountInHuman = ethers.formatUnits(amountInRaw, inInfo.decimals);
    const amountOutHuman = ethers.formatUnits(amountOutRaw, outInfo.decimals);
    const amountOutMinHuman = ethers.formatUnits(amountOutMinRaw, outInfo.decimals);

    const priceOutPerIn = Number(amountOutHuman) / Number(amountInHuman);

    return {
      tokenIn: path[0],
      tokenOut: path[path.length - 1],
      path,
      amountInRaw: amountInRaw.toString(),
      amountInHuman,
      amountOutRaw: amountOutRaw.toString(),
      amountOutHuman,
      priceOutPerIn,
      slippageBps,
      amountOutMinRaw: amountOutMinRaw.toString(),
      amountOutMinHuman,
      minPriceOutPerIn: Number(amountOutMinHuman) / Number(amountInHuman),
      router: this.chain.dexRouter,
      blockNumber,
      provenance: 'onchain',
      // Cotação de AMM envelhece rápido: 2 blocos de validade.
      expiresAt: Date.now() + this.chain.blockTimeSeconds * 2 * 1000,
    };
  }

  // ---------------------------------------------------------------------- gas

  /** Estima gas de verdade (eth_estimateGas + eth_feeData). Serve de dry-run. */
  public async estimateSwapGas(tx: ethers.TransactionRequest): Promise<GasEstimate> {
    const provider = await this.connection.bestProvider();
    const [gasLimit, feeData] = await this.connection.run(async () => {
      const g = await provider.estimateGas(tx);
      const f = await provider.getFeeData();
      return [g, f] as const;
    }, 'eth_estimateGas + eth_feeData');

    const eip1559 = feeData.maxFeePerGas != null;
    const gasPriceWei = eip1559 ? (feeData.maxFeePerGas as bigint) : (feeData.gasPrice as bigint);

    return {
      gasLimit,
      gasPriceWei,
      maxPriorityFeeWei: feeData.maxPriorityFeePerGas ?? undefined,
      maxFeeWei: feeData.maxFeePerGas ?? undefined,
      maxCostNative: ethers.formatEther(gasLimit * gasPriceWei),
      eip1559,
      provenance: 'onchain',
    };
  }

  // --------------------------------------------------------------- transações

  private async sendAndWait(
    build: (wallet: ethers.Wallet) => Promise<ethers.ContractTransactionResponse | ethers.TransactionResponse>,
    label: string,
    dryRunReason?: string
  ): Promise<OnchainTxResult> {
    const chain = this.chain;
    const base = {
      chainKey: chain.key,
      chainId: chain.chainId,
      provenance: 'onchain' as const,
      submittedAt: new Date().toISOString(),
    };

    // DRY-RUN: nada é enviado e o hash é explicitamente null.
    // provenance = 'local' porque NENHUMA escrita aconteceu na chain.
    if (dryRunReason) {
      return {
        ...base,
        provenance: 'local',
        hash: null,
        status: 'NOT_SENT',
        blockNumber: null,
        confirmations: 0,
        from: this.wallet?.address ?? null,
        to: chain.dexRouter,
        gasUsed: null,
        effectiveGasPriceWei: null,
        txFeeNative: null,
        explorerUrl: null,
        nonce: null,
        dryRun: true,
        dryRunReason,
      };
    }

    const wallet = this.requireWallet();
    return this.mutex.runExclusive(async () => {
      const connected = wallet.connect(await this.connection.bestProvider());
      let tx: ethers.ContractTransactionResponse | ethers.TransactionResponse;
      try {
        tx = await build(connected);
      } catch (err: any) {
        return {
          ...base,
          hash: null,
          status: 'FAILED',
          blockNumber: null,
          confirmations: 0,
          from: wallet.address,
          to: chain.dexRouter,
          gasUsed: null,
          effectiveGasPriceWei: null,
          txFeeNative: null,
          explorerUrl: null,
          nonce: null,
          dryRun: false,
          error: `Envio falhou em "${label}": ${err?.message || err}`,
          provenance: 'onchain',
        };
      }

      const submitted: OnchainTxResult = {
        ...base,
        hash: tx.hash,
        status: 'SUBMITTED',
        blockNumber: null,
        confirmations: 0,
        from: tx.from ?? wallet.address,
        to: tx.to ?? null,
        gasUsed: null,
        effectiveGasPriceWei: null,
        txFeeNative: null,
        explorerUrl: explorerTxUrl(chain, tx.hash),
        nonce: tx.nonce ?? null,
        dryRun: false,
        provenance: 'onchain',
      };

      let receipt: ethers.TransactionReceipt | null = null;
      try {
        receipt = await tx.wait(this.confirmations);
      } catch (err: any) {
        // O ethers lança CALL_EXCEPTION quando a transação FOI minerada mas
        // revertida; o receipt vem anexado ao erro. Usá-lo é a diferença entre
        // reportar "revertida on-chain" (verdade) e "não confirmou" (enganoso).
        const mined: ethers.TransactionReceipt | undefined = err?.receipt;
        if (mined && typeof mined.status === 'number' && mined.status === 0) {
          submitted.status = 'REVERTED';
          submitted.blockNumber = mined.blockNumber;
          submitted.confirmations = await mined.confirmations().catch(() => 0);
          submitted.gasUsed = mined.gasUsed.toString();
          submitted.effectiveGasPriceWei = mined.gasPrice ? mined.gasPrice.toString() : null;
          submitted.txFeeNative = mined.gasPrice
            ? ethers.formatEther(mined.gasUsed * mined.gasPrice)
            : null;
          submitted.confirmedAt = new Date().toISOString();
          submitted.error =
            'Transação MINERADA mas REVERTIDA on-chain. O gas foi consumido. Verifique slippage, saldo e liquidez no explorador.';
          return submitted;
        }
        submitted.status = 'FAILED';
        submitted.error = `Transação enviada mas não confirmou: ${err?.message || err}`;
        return submitted;
      }

      if (!receipt) {
        submitted.status = 'FAILED';
        submitted.error = 'Receipt nulo (transação provavelmente dropada).';
        return submitted;
      }

      submitted.status = receipt.status === 1 ? 'CONFIRMED' : 'REVERTED';
      submitted.blockNumber = receipt.blockNumber;
      submitted.confirmations = await receipt.confirmations();
      submitted.gasUsed = receipt.gasUsed.toString();
      submitted.effectiveGasPriceWei = receipt.gasPrice ? receipt.gasPrice.toString() : null;
      submitted.txFeeNative = receipt.gasPrice
        ? ethers.formatEther(receipt.gasUsed * receipt.gasPrice)
        : null;
      submitted.confirmedAt = new Date().toISOString();
      if (receipt.status !== 1) {
        submitted.error = 'Transação revertida on-chain (verifique slippage, saldo e liquidez no explorador).';
      }
      return submitted;
    });
  }

  // --------------------------------------------------------------------- swap

  /** Aprova o router a gastar exatamente o necessário (ou infinito, se configurado). */
  public async approveToken(tokenAddress: string, amountRaw: bigint, dryRun = false): Promise<OnchainTxResult> {
    const wallet = this.requireWallet();
    const router = this.chain.dexRouter;
    if (!router) throw new Error('Sem router configurado: aprovação não faz sentido.');

    const tokenAddr = requireAddress(tokenAddress, 'token');
    const amount = this.infiniteApproval ? ethers.MaxUint256 : amountRaw;

    return this.sendAndWait(
      async (w) => {
        const token = new ethers.Contract(tokenAddr, ERC20_ABI, w);
        return token.approve(router, amount) as Promise<ethers.ContractTransactionResponse>;
      },
      `approve(${tokenAddr})`,
      dryRun ? 'Aprovação não enviada (dryRun=true).' : undefined
    );
  }

  /**
   * Swap on-chain REAL.
   *
   * Fluxo:
   *   1. valida carteira, router verificado e guarda de risco;
   *   2. cota on-chain (getAmountsOut) e aplica slippage;
   *   3. se tokenIn for ERC-20, garante allowance suficiente (approve real);
   *   4. estima gas (isso já detecta revert antes de gastar);
   *   5. envia a transação correta conforme nativo/ERC-20;
   *   6. espera confirmações e relê o saldo de saída para provar o delta real.
   */
  public async swap(params: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    slippageBps?: number;
    deadlineSeconds?: number;
    recipient?: string;
    confirm?: boolean;
    /** true = só simula e reporta o que faria, sem enviar nada. */
    dryRun?: boolean;
  }): Promise<SwapResult> {
    const {
      tokenIn,
      tokenOut,
      amountIn,
      slippageBps = 50,
      deadlineSeconds = 300,
      recipient,
      confirm = false,
      dryRun = false,
    } = params;

    const wallet = this.requireWallet();
    const chain = this.chain;

    if (!chain.dexRouter) {
      throw new Error(`Rede ${chain.name} sem router. Swaps bloqueados. Configure DEX_ROUTER_* e rode verifyRouter().`);
    }
    if (chain.verification !== 'verified') {
      throw new Error(
        `Router de ${chain.name} não verificado (estado: ${chain.verification}). Rode POST /api/onchain/verify primeiro. ${chain.verificationDetail || ''}`
      );
    }
    if (!isSwapCapable(chain)) {
      throw new Error(`Rede ${chain.name} não está apta para swap.`);
    }

    // Guarda: mainnet só com allowLive + confirm explícito.
    const wantLive = chain.env === 'mainnet';
    if (wantLive && (!this.allowLive || !confirm)) {
      throw new Error(
        `Swap em ${chain.name} exige allowLive=true (ONCHAIN_ALLOW_LIVE=true) E confirm=true na requisição. Nenhuma transação foi enviada.`
      );
    }

    const quote = await this.getQuote(tokenIn, tokenOut, amountIn, slippageBps);
    const { inIsNative, outIsNative } = this.resolvePath(tokenIn, tokenOut);
    const to = recipient ? requireAddress(recipient, 'recipient') : wallet.address;
    const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;

    // Guarda de risco: notional aproximado usando a cotação em tokens de saída.
    // Sem oráculo de preço aqui: usamos o próprio valor de saída como limite bruto.
    const notionalProxy = Number(quote.amountOutHuman);
    if (this.maxNotionalUsd > 0 && Number.isFinite(notionalProxy) && notionalProxy > this.maxNotionalUsd) {
      throw new Error(
        `Guarda de risco: saída estimada ${quote.amountOutHuman} excede ONCHAIN_MAX_NOTIONAL_USD=${this.maxNotionalUsd}. Nenhuma transação foi enviada.`
      );
    }

    // Saldo de saída ANTES, para depois provar o delta real.
    let balanceOutBefore: string | undefined;
    try {
      balanceOutBefore = outIsNative
        ? (await this.getNativeBalance(to)).wei
        : (await this.getTokenBalance(quote.tokenOut, to)).raw;
    } catch {
      balanceOutBefore = undefined;
    }

    // Aprovação, se necessário.
    let approval: OnchainTxResult | undefined;
    if (!inIsNative) {
      const bal = await this.getTokenBalance(quote.tokenIn, wallet.address);
      if (BigInt(bal.raw) < BigInt(quote.amountInRaw)) {
        throw new Error(
          `Saldo insuficiente de ${bal.token.symbol}: tem ${bal.amount}, precisa de ${quote.amountInHuman}.`
        );
      }
      if (BigInt(bal.allowanceToRouter) < BigInt(quote.amountInRaw)) {
        approval = await this.approveToken(quote.tokenIn, BigInt(quote.amountInRaw), dryRun || !confirm);
        if (!dryRun && confirm && approval.status !== 'CONFIRMED') {
          throw new Error(`Aprovação não confirmada (${approval.status}): ${approval.error || 'motivo desconhecido'}`);
        }
      }
    } else {
      const native = await this.getNativeBalance(wallet.address);
      if (BigInt(native.wei) < BigInt(quote.amountInRaw)) {
        throw new Error(
          `Saldo nativo insuficiente: tem ${native.amount} ${chain.nativeSymbol}, precisa de ${quote.amountInHuman}.`
        );
      }
    }

    // Monta a transação certa conforme o par.
    const buildTx = async (w: ethers.Wallet) => {
      const router = new ethers.Contract(chain.dexRouter!, ROUTER_ABI, w);
      if (inIsNative) {
        return (await router.swapExactETHForTokens(
          quote.amountOutMinRaw,
          quote.path,
          to,
          deadline,
          { value: quote.amountInRaw }
        )) as ethers.ContractTransactionResponse;
      }
      if (outIsNative) {
        return (await router.swapExactTokensForETH(
          quote.amountInRaw,
          quote.amountOutMinRaw,
          quote.path,
          to,
          deadline
        )) as ethers.ContractTransactionResponse;
      }
      return (await router.swapExactTokensForTokens(
        quote.amountInRaw,
        quote.amountOutMinRaw,
        quote.path,
        to,
        deadline
      )) as ethers.ContractTransactionResponse;
    };

    // Estima gas ANTES de enviar com o calldata REAL da chamada.
    // eth_estimateGas executa a transação localmente: se ela reverteria,
    // descobrimos aqui, sem gastar um centavo de gas.
    let gasEstimate: GasEstimate | null = null;
    let gasEstimateError: string | undefined;
    try {
      const iface = new ethers.Interface(ROUTER_ABI as unknown as string[]);
      let data: string;
      let value = 0n;
      if (inIsNative) {
        data = iface.encodeFunctionData('swapExactETHForTokens', [
          quote.amountOutMinRaw,
          quote.path,
          to,
          deadline,
        ]);
        value = BigInt(quote.amountInRaw);
      } else if (outIsNative) {
        data = iface.encodeFunctionData('swapExactTokensForETH', [
          quote.amountInRaw,
          quote.amountOutMinRaw,
          quote.path,
          to,
          deadline,
        ]);
      } else {
        data = iface.encodeFunctionData('swapExactTokensForTokens', [
          quote.amountInRaw,
          quote.amountOutMinRaw,
          quote.path,
          to,
          deadline,
        ]);
      }
      gasEstimate = await this.estimateSwapGas({
        from: wallet.address,
        to: chain.dexRouter,
        data,
        value,
      });
    } catch (err: any) {
      // Se a estimativa falha, a transação quase certamente reverteria.
      gasEstimateError = err?.message ? String(err.message) : String(err);
      if (!dryRun && confirm) {
        throw new Error(
          `eth_estimateGas rejeitou o swap — a transação reverteria on-chain. Nada foi enviado. Detalhe: ${gasEstimateError}`
        );
      }
    }

    let txResult: OnchainTxResult;
    if (dryRun || !confirm) {
      const reason = dryRun
        ? 'dryRun=true: transação NÃO foi enviada. Cotação e gas são reais.'
        : 'confirm ausente ou false: nenhuma transação enviada. Envie confirm=true para executar de verdade.';
      txResult = await this.sendAndWait(buildTx, 'swap', reason);
    } else {
      txResult = await this.sendAndWait(buildTx, 'swap');
    }

    if (gasEstimate) {
      txResult = {
        ...txResult,
        estimatedGasLimit: gasEstimate.gasLimit.toString(),
        estimatedMaxCostNative: gasEstimate.maxCostNative,
        eip1559: gasEstimate.eip1559,
      };
    }

    // Prova real: relê o saldo de saída e calcula o delta.
    let balanceOutAfter: string | undefined;
    let realizedOutAmount: string | undefined;
    if (txResult.status === 'CONFIRMED') {
      try {
        balanceOutAfter = outIsNative
          ? (await this.getNativeBalance(to)).wei
          : (await this.getTokenBalance(quote.tokenOut, to)).raw;
        if (balanceOutBefore !== undefined) {
          const delta = BigInt(balanceOutAfter) - BigInt(balanceOutBefore);
          realizedOutAmount = delta.toString();
        }
      } catch {
        balanceOutAfter = undefined;
      }
    }

    return {
      ...txResult,
      quote,
      approval,
      balanceOutBefore,
      balanceOutAfter,
      realizedOutAmount,
    };
  }

  // ---------------------------------------------------------- âncora de audit

  /**
   * Ancora um hash de auditoria ON-CHAIN.
   *
   * Implementação sem contrato: envia uma transação de valor zero para a própria
   * carteira com o hash no campo `data`. É a forma mais barata e universal de
   * carimbar um hash num bloco — qualquer pessoa pode conferir no explorador.
   *
   * Se AUDIT_ANCHOR_CONTRACT estiver definido, chama `anchor(bytes32)` nesse
   * contrato em vez disso.
   */
  public async anchorHash(hashHex: string, dryRun = false): Promise<OnchainTxResult> {
    const clean = hashHex.replace(/^0x/, '');
    if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
      throw new Error(`Hash de auditoria inválido (esperado 64 hex): "${hashHex}"`);
    }
    const data = `0x${clean}`;
    const contract = safeAddress(process.env.AUDIT_ANCHOR_CONTRACT || '');

    return this.sendAndWait(
      async (w) => {
        if (contract) {
          const c = new ethers.Contract(contract, ['function anchor(bytes32 h)'], w);
          return (await c.anchor(data)) as ethers.ContractTransactionResponse;
        }
        return (await w.sendTransaction({ to: w.address, data, value: 0n })) as ethers.TransactionResponse;
      },
      'anchor(auditHash)',
      dryRun ? 'Âncora não enviada (dryRun=true).' : undefined
    );
  }

  /** Libera sockets (usado no shutdown do servidor e nos testes). */
  public destroy(): void {
    this.connection.destroy();
  }
}

/** Pequeno helper para ler altura do bloco dentro de uma chamada composta. */
async function p_blockNumber(provider: ethers.Provider): Promise<number> {
  return provider.getBlockNumber();
}

// ------------------------------------------------------------------ singleton

let singleton: OnchainService | null = null;

export function getOnchainService(): OnchainService {
  if (!singleton) {
    singleton = new OnchainService({
      chainKey: (process.env.DEFAULT_CHAIN as ChainKey) || DEFAULT_CHAIN_KEY,
      allowLive: process.env.ONCHAIN_ALLOW_LIVE === 'true',
      maxNotionalUsd: Number(process.env.ONCHAIN_MAX_NOTIONAL_USD || 1000),
      confirmations: Number(process.env.ONCHAIN_CONFIRMATIONS || 1),
      infiniteApproval: process.env.ONCHAIN_INFINITE_APPROVAL === 'true',
    });
  }
  return singleton;
}

/** Para testes: substitui a instância global. */
export function setOnchainService(instance: OnchainService | null): void {
  singleton = instance;
}

export { CHAIN_DEFINITIONS, getChain, isChainKey, type ChainKey };
