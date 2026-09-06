/**
 * localChainStub.ts — Nó EVM JSON-RPC local SOMENTE PARA TESTES.
 *
 * ⚠️  NÃO é blockchain. É um servidor HTTP que fala o protocolo JSON-RPC do
 *     Ethereum com estado em memória, usado para executar o código REAL de
 *     `onchainService.ts` sem depender de internet.
 *
 * Por que isso é uma verificação legítima e não um teste de mentira:
 *   - Quem assina e serializa a transação é o `ethers` real, dentro do
 *     `OnchainService` real. O stub só devolve respostas no formato do protocolo.
 *   - O calldata de approve/swap é produzido pelo nosso código e inspecionado
 *     aqui. Se o código montar a chamada errada, o teste falha.
 *   - O stub NUNCA é usado em produção: `server.ts` não importa este arquivo.
 */

import http from 'http';
import { AddressInfo } from 'net';
import { ethers } from 'ethers';

const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

const ROUTER_ABI = [
  'function WETH() view returns (address)',
  'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] amounts)',
];

const coder = ethers.AbiCoder.defaultAbiCoder();

export interface StubTokenState {
  symbol: string;
  decimals: number;
  balances: Record<string, bigint>;
  allowances: Record<string, bigint>; // chave: `${owner}|${spender}`
}

export interface StubTx {
  hash: string;
  from: string;
  to: string | null;
  data: string;
  value: bigint;
  nonce: number;
  /** Decodificado pelo stub para inspeção nos testes. */
  decoded?: { method: string; args: Record<string, unknown> };
  blockNumber: number;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  status: 0 | 1;
  raw: string;
}

export interface StubOptions {
  chainId: number;
  wrappedNative: string;
  router: string;
  tokens: Record<string, StubTokenState>;
  /** Saldo nativo inicial por endereço. */
  nativeBalances?: Record<string, bigint>;
  /** Se true, eth_estimateGas lança (simula revert). */
  revertEstimate?: boolean;
  /** Se true, transações entram com status 0 (revertidas). */
  revertTx?: boolean;
  /** Preço fixo usado pelo router: quantos out por 1e18 in. */
  rateOutPerIn?: bigint;
  gasPriceWei?: bigint;
}

export class LocalChainStub {
  private server: http.Server;
  private opts: StubOptions;
  private blockNumber = 18_000_000;
  private nonces: Record<string, number> = {};
  private txs = new Map<string, StubTx>();
  public readonly calls: Array<{ method: string; params: unknown[] }> = [];

  constructor(opts: StubOptions) {
    this.opts = opts;
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  public async start(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  public async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close((err) => (err ? reject(err) : resolve()))
    );
  }

  public getTransactions(): StubTx[] {
    return Array.from(this.txs.values());
  }

  public getBlockNumber(): number {
    return this.blockNumber;
  }

  /** Altera saldo de token em runtime (para testar delta real de saída). */
  public setTokenBalance(token: string, owner: string, amount: bigint): void {
    const t = this.opts.tokens[token.toLowerCase()];
    if (t) t.balances[owner.toLowerCase()] = amount;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    for await (const chunk of req) body += chunk;

    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
      return;
    }

    const batch = Array.isArray(parsed);
    const list = batch ? parsed : [parsed];
    const results = await Promise.all(list.map((r: any) => this.dispatch(r)));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(batch ? results : results[0]));
  }

  private async dispatch(req: any): Promise<any> {
    const { id, method, params = [] } = req;
    this.calls.push({ method, params });
    try {
      const result = await this.exec(method, params);
      return { jsonrpc: '2.0', id, result };
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: err?.message || String(err), data: err?.data },
      };
    }
  }

  private async exec(method: string, params: any[]): Promise<any> {
    const { chainId, wrappedNative, router } = this.opts;

    switch (method) {
      case 'eth_chainId':
        return hex(chainId);
      case 'net_version':
        return String(chainId);
      case 'eth_blockNumber':
        return hex(this.blockNumber);
      case 'eth_getBalance': {
        const addr = String(params[0]).toLowerCase();
        return hex(this.opts.nativeBalances?.[addr] ?? 0n);
      }
      case 'eth_getTransactionCount': {
        const addr = String(params[0]).toLowerCase();
        return hex(BigInt(this.nonces[addr] || 0));
      }
      case 'eth_gasPrice':
        return hex(this.opts.gasPriceWei ?? 20_000_000_000n);
      case 'eth_maxPriorityFeePerGas':
        return hex(1_500_000_000n);
      case 'eth_feeHistory':
        return {
          oldestBlock: hex(this.blockNumber),
          baseFeePerGas: [hex(10_000_000_000n), hex(10_000_000_000n)],
          gasUsedRatio: [0.5],
          reward: [['0x59682f00']],
        };
      case 'eth_getCode': {
        const addr = ethers.getAddress(String(params[0])).toLowerCase();
        const known =
          addr === router.toLowerCase() ||
          addr === wrappedNative.toLowerCase() ||
          Object.keys(this.opts.tokens).includes(addr);
        return known ? '0x6080604052' : '0x';
      }
      case 'eth_estimateGas': {
        if (this.opts.revertEstimate) {
          const err: any = new Error('execution reverted: INSUFFICIENT_OUTPUT_AMOUNT');
          throw err;
        }
        return hex(160_000n);
      }
      case 'eth_call':
        return this.ethCall(String(params[0]?.to || ''), String(params[0]?.data || '0x'));
      case 'eth_sendRawTransaction': {
        const raw = String(params[0]);
        const tx = ethers.Transaction.from(raw);
        const from = (tx.from || '').toLowerCase();
        this.nonces[from] = (this.nonces[from] || 0) + 1;
        this.blockNumber += 1;

        const stubTx: StubTx = {
          hash: tx.hash,
          from: tx.from || '',
          to: tx.to,
          data: tx.data,
          value: tx.value,
          nonce: tx.nonce,
          blockNumber: this.blockNumber,
          gasUsed: 140_000n,
          effectiveGasPrice: this.opts.gasPriceWei ?? 20_000_000_000n,
          status: this.opts.revertTx ? 0 : 1,
          raw,
          decoded: this.tryDecode(tx.to, tx.data),
        };
        this.txs.set(tx.hash, stubTx);
        if (stubTx.status === 1) this.applyEffects(stubTx);
        return tx.hash;
      }
      case 'eth_getTransactionByHash': {
        const t = this.txs.get(String(params[0]));
        if (!t) return null;
        return {
          hash: t.hash,
          blockHash: '0x' + '11'.repeat(32),
          blockNumber: hex(t.blockNumber),
          from: t.from,
          to: t.to,
          gas: hex(200_000n),
          gasPrice: hex(t.effectiveGasPrice),
          value: hex(t.value),
          input: t.data,
          nonce: hex(t.nonce),
          transactionIndex: '0x0',
          type: '0x0',
          chainId: hex(chainId),
        };
      }
      case 'eth_getTransactionReceipt': {
        const t = this.txs.get(String(params[0]));
        if (!t) return null;
        return {
          transactionHash: t.hash,
          transactionIndex: '0x0',
          blockHash: '0x' + '11'.repeat(32),
          blockNumber: hex(t.blockNumber),
          from: t.from,
          to: t.to,
          cumulativeGasUsed: hex(t.gasUsed),
          gasUsed: hex(t.gasUsed),
          effectiveGasPrice: hex(t.effectiveGasPrice),
          contractAddress: null,
          logs: [],
          logsBloom: '0x' + '00'.repeat(256),
          status: t.status === 1 ? '0x1' : '0x0',
          type: '0x0',
        };
      }
      case 'eth_getBlockByNumber':
      case 'eth_getBlockByHash': {
        return {
          number: hex(this.blockNumber),
          hash: '0x' + '22'.repeat(32),
          parentHash: '0x' + '33'.repeat(32),
          timestamp: hex(Math.floor(Date.now() / 1000)),
          baseFeePerGas: hex(10_000_000_000n),
          gasLimit: hex(30_000_000n),
          gasUsed: hex(15_000_000n),
          miner: ethers.ZeroAddress,
          difficulty: '0x0',
          extraData: '0x',
          nonce: '0x0000000000000000',
          sha3Uncles: '0x' + '00'.repeat(32),
          size: '0x1000',
          stateRoot: '0x' + '44'.repeat(32),
          receiptsRoot: '0x' + '55'.repeat(32),
          transactionsRoot: '0x' + '66'.repeat(32),
          logsBloom: '0x' + '00'.repeat(256),
          transactions: [],
          uncles: [],
        };
      }
      case 'eth_getLogs':
        return [];
      default:
        throw new Error(`Stub: método JSON-RPC não implementado: ${method}`);
    }
  }

  /**
   * Aplica o efeito da transação no estado do stub (allowance / saldos).
   * Sem isso o teste de "delta real de saída" mediria sempre zero e não
   * provaria nada sobre a releitura de saldo feita pelo OnchainService.
   */
  private applyEffects(tx: StubTx): void {
    const d = tx.decoded;
    if (!d) return;
    const from = tx.from.toLowerCase();

    if (d.method === 'erc20.approve') {
      const tokenAddr = (tx.to || '').toLowerCase();
      const token = this.opts.tokens[tokenAddr];
      if (!token) return;
      const spender = String(d.args.spender || '').toLowerCase();
      // A ABI declara approve(address spender, uint256 amount) — o campo é `amount`.
      const value = BigInt(String(d.args.amount ?? '0'));
      token.allowances[`${from}|${spender}`] = value;
      return;
    }

    const rate = this.opts.rateOutPerIn ?? 2n;

    if (d.method === 'router.swapExactTokensForTokens' || d.method === 'router.swapExactTokensForETH') {
      const amountIn = BigInt(String(d.args.amountIn ?? '0'));
      const path = (d.args.path as unknown as string[]) || [];
      const to = String(d.args.to || tx.from).toLowerCase();
      if (path.length < 2) return;
      const inToken = this.opts.tokens[path[0].toLowerCase()];
      const outToken = this.opts.tokens[path[path.length - 1].toLowerCase()];
      if (inToken) {
        const cur = inToken.balances[from] ?? 0n;
        inToken.balances[from] = cur > amountIn ? cur - amountIn : 0n;
      }
      if (outToken) {
        const out = amountIn * rate ** BigInt(path.length - 1);
        outToken.balances[to] = (outToken.balances[to] ?? 0n) + out;
      } else if (d.method === 'router.swapExactTokensForETH') {
        const out = amountIn * rate ** BigInt(path.length - 1);
        const cur = this.opts.nativeBalances?.[to] ?? 0n;
        if (this.opts.nativeBalances) this.opts.nativeBalances[to] = cur + out;
      }
      return;
    }

    if (d.method === 'router.swapExactETHForTokens') {
      const amountIn = tx.value;
      const path = (d.args.path as unknown as string[]) || [];
      const to = String(d.args.to || tx.from).toLowerCase();
      if (path.length < 2) return;
      const outToken = this.opts.tokens[path[path.length - 1].toLowerCase()];
      if (outToken) {
        const out = amountIn * rate ** BigInt(path.length - 1);
        outToken.balances[to] = (outToken.balances[to] ?? 0n) + out;
      }
      const cur = this.opts.nativeBalances?.[from] ?? 0n;
      if (this.opts.nativeBalances) {
        this.opts.nativeBalances[from] = cur > amountIn ? cur - amountIn : 0n;
      }
    }
  }

  private tryDecode(to: string | null, data: string): StubTx['decoded'] {
    if (!data || data === '0x') return undefined;
    const selector = data.slice(0, 10);
    for (const [iface, label] of [
      [new ethers.Interface(ROUTER_ABI), 'router'],
      [new ethers.Interface(ERC20_ABI), 'erc20'],
    ] as const) {
      for (const fn of iface.fragments) {
        if (fn.type !== 'function') continue;
        const frag = fn as ethers.FunctionFragment;
        if (frag.selector !== selector) continue;
        try {
          const parsed = iface.parseTransaction({ data, value: 0n });
          if (!parsed) continue;
          const args: Record<string, unknown> = {};
          frag.inputs.forEach((input, i) => {
            args[input.name || `arg${i}`] = serializeArg(parsed.args[i]);
          });
          return { method: `${label}.${frag.name}`, args };
        } catch {
          /* segue */
        }
      }
    }
    return undefined;
  }

  private ethCall(to: string, data: string): string {
    if (!data || data === '0x') throw new Error('eth_call sem calldata');
    const selector = data.slice(0, 10);
    const addr = ethers.getAddress(to).toLowerCase();
    const { router, wrappedNative } = this.opts;

    const erc20 = new ethers.Interface(ERC20_ABI);
    const r = new ethers.Interface(ROUTER_ABI);

    // ------------------------------ router
    if (addr === router.toLowerCase()) {
      if (selector === r.getFunction('WETH')!.selector) {
        return coder.encode(['address'], [wrappedNative]);
      }
      if (selector === r.getFunction('getAmountsOut')!.selector) {
        const decoded = erc20Parse(r, 'getAmountsOut', data);
        const amountIn = BigInt(decoded[0]);
        const path: string[] = Array.from(decoded[1]).map(String);
        const rate = this.opts.rateOutPerIn ?? 2n;
        // Saída acumulada: cada salto multiplica por `rate`.
        // amounts = [in, in*rate, in*rate^2, ...]
        const amounts: bigint[] = [amountIn];
        for (let i = 1; i < path.length; i++) {
          amounts.push(amounts[i - 1] * rate);
        }
        return coder.encode(['uint256[]'], [amounts]);
      }
      throw new Error(`Stub: chamada de router não suportada (selector ${selector})`);
    }

    // ------------------------------ ERC-20
    const token = this.opts.tokens[addr];
    if (!token) throw new Error(`Stub: contrato desconhecido ${to}`);

    if (selector === erc20.getFunction('symbol')!.selector) {
      return coder.encode(['string'], [token.symbol]);
    }
    if (selector === erc20.getFunction('decimals')!.selector) {
      return coder.encode(['uint8'], [token.decimals]);
    }
    if (selector === erc20.getFunction('balanceOf')!.selector) {
      const [owner] = erc20Parse(erc20, 'balanceOf', data);
      return coder.encode(['uint256'], [token.balances[String(owner).toLowerCase()] ?? 0n]);
    }
    if (selector === erc20.getFunction('allowance')!.selector) {
      const [owner, spender] = erc20Parse(erc20, 'allowance', data);
      const key = `${String(owner).toLowerCase()}|${String(spender).toLowerCase()}`;
      return coder.encode(['uint256'], [token.allowances[key] ?? 0n]);
    }
    throw new Error(`Stub: chamada ERC-20 não suportada (selector ${selector})`);
  }
}

/**
 * Serializa um argumento ABI para inspeção.
 * Arrays NÃO podem passar por String(): viraria "0xa,0xb" e destruiria o path.
 */
function serializeArg(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => serializeArg(v));
  if (typeof value === 'bigint') return value.toString();
  if (value && typeof value === 'object' && 'toString' in (value as object)) {
    return String(value);
  }
  return value;
}

function erc20Parse(iface: ethers.Interface, name: string, data: string): any[] {
  const parsed = iface.parseTransaction({ data, value: 0n });
  if (!parsed || parsed.name !== name) throw new Error(`Stub: calldata inesperado para ${name}`);
  return Array.from(parsed.args);
}

function hex(value: bigint | number): string {
  return '0x' + BigInt(value).toString(16);
}

/** Chave privada determinística EXCLUSIVA de teste. Não tem valor em rede alguma. */
export const TEST_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
export const TEST_ADDRESS = new ethers.Wallet(TEST_PRIVATE_KEY).address;
