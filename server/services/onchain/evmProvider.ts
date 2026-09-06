/**
 * evmProvider.ts — Provider JSON-RPC REAL com failover entre múltiplos RPCs.
 *
 * Problema que resolve
 * --------------------
 * RPC público cai, aplica rate limit (HTTP 429) ou responde atrasado. Um
 * provider único significa downtime silencioso. Aqui mantemos a lista da
 * tabela de redes e promovemos/rebaixamos endpoints com base em resultado real
 * de chamada, não em heurística.
 *
 * Nada aqui é simulado: cada método faz um `fetch` de verdade contra o nó.
 */

import { ethers } from 'ethers';
import type { ChainDefinition } from './types.js';

export interface RpcHealth {
  url: string;
  /** Número de chamadas bem-sucedidas. */
  successes: number;
  /** Número de falhas. */
  failures: number;
  /** Latência média móvel (ms) das chamadas de sucesso. */
  avgLatencyMs: number;
  lastError?: string;
  lastSuccessAt?: string;
  /** Até quando o endpoint está em quarentena. */
  quarantinedUntil?: number;
}

const QUARANTINE_MS = 60_000;

export class EvmConnection {
  public readonly chain: ChainDefinition;
  private providers: Map<string, ethers.JsonRpcProvider> = new Map();
  private health: Map<string, RpcHealth> = new Map();
  private order: string[] = [];
  private lastBlockNumber: number | null = null;
  private lastRpcUsed: string | null = null;

  constructor(chain: ChainDefinition) {
    this.chain = chain;
    if (!chain.rpcUrls.length) {
      throw new Error(`Rede ${chain.key} não tem nenhum RPC configurado.`);
    }
    for (const url of chain.rpcUrls) {
      this.health.set(url, { url, successes: 0, failures: 0, avgLatencyMs: 0 });
    }
    this.order = [...chain.rpcUrls];
  }

  private getProvider(url: string): ethers.JsonRpcProvider {
    let p = this.providers.get(url);
    if (!p) {
      p = new ethers.JsonRpcProvider(url, this.chain.chainId, {
        staticNetwork: ethers.Network.from(this.chain.chainId),
      });
      this.providers.set(url, p);
    }
    return p;
  }

  /** Ordena candidatos: fora de quarentena primeiro, depois por latência média. */
  private candidates(): string[] {
    const now = Date.now();
    return [...this.order].sort((a, b) => {
      const ha = this.health.get(a)!;
      const hb = this.health.get(b)!;
      const qa = (ha.quarantinedUntil || 0) > now ? 1 : 0;
      const qb = (hb.quarantinedUntil || 0) > now ? 1 : 0;
      if (qa !== qb) return qa - qb;
      return ha.avgLatencyMs - hb.avgLatencyMs;
    });
  }

  private markSuccess(url: string, latencyMs: number) {
    const h = this.health.get(url)!;
    const n = h.successes;
    h.avgLatencyMs = n === 0 ? latencyMs : (h.avgLatencyMs * n + latencyMs) / (n + 1);
    h.successes += 1;
    h.lastError = undefined;
    h.quarantinedUntil = undefined;
    h.lastSuccessAt = new Date().toISOString();
  }

  private markFailure(url: string, message: string) {
    const h = this.health.get(url)!;
    h.failures += 1;
    h.lastError = message;
    h.quarantinedUntil = Date.now() + QUARANTINE_MS;
  }

  /**
   * Executa `fn` percorrendo os RPCs disponíveis até um deles responder.
   * Se todos falharem, lança erro agregado com a causa de cada endpoint —
   * nunca inventa um resultado.
   */
  public async run<T>(fn: (provider: ethers.JsonRpcProvider) => Promise<T>, label = 'chamada RPC'): Promise<T> {
    const errors: string[] = [];
    for (const url of this.candidates()) {
      const started = Date.now();
      try {
        const result = await fn(this.getProvider(url));
        this.markSuccess(url, Date.now() - started);
        this.lastRpcUsed = url;
        return result;
      } catch (err: any) {
        const msg = err?.message ? String(err.message) : String(err);
        this.markFailure(url, msg);
        errors.push(`${url} → ${msg}`);
      }
    }
    throw new Error(
      `Falha em "${label}" em todos os ${this.order.length} RPCs da rede ${this.chain.key}:\n  - ${errors.join('\n  - ')}`
    );
  }

  /** Provider já posicionado no melhor endpoint atual (para envio de transação). */
  public async bestProvider(): Promise<ethers.JsonRpcProvider> {
    await this.freshBlockNumber();
    return this.getProvider(this.lastRpcUsed!);
  }

  /**
   * Altura de bloco SEM cache.
   *
   * Por que não usar `provider.getBlockNumber()`: o `AbstractProvider` do ethers
   * v6 mantém um `#performCache` com `cacheTimeout: 250` ms (ver
   * node_modules/ethers/lib.commonjs/providers/abstract-provider.js:159). Numa
   * verificação de saúde isso devolve altura de até 250 ms atrás e uma latência
   * de ~0 ms quando há cache — ou seja, telemetria mentirosa.
   *
   * `provider.send()` vai direto ao transporte HTTP, sem esse cache.
   */
  public async freshBlockNumber(): Promise<number> {
    const hex = await this.run(
      async (p) => (await p.send('eth_blockNumber', [])) as string,
      'eth_blockNumber (sem cache)'
    );
    return Number(BigInt(hex));
  }

  /** Diagnóstico real: altura do bloco + latência por endpoint. */
  public async diagnose(): Promise<{
    chainId: number;
    blockNumber: number | null;
    connected: boolean;
    latencyMs: number;
    rpcUsed: string | null;
    endpoints: RpcHealth[];
    error?: string;
  }> {
    const started = Date.now();
    try {
      const blockNumber = await this.freshBlockNumber();
      this.lastBlockNumber = blockNumber;
      return {
        chainId: this.chain.chainId,
        blockNumber,
        connected: true,
        latencyMs: Date.now() - started,
        rpcUsed: this.lastRpcUsed,
        endpoints: Array.from(this.health.values()).map((h) => ({
          ...h,
          avgLatencyMs: Number(h.avgLatencyMs.toFixed(1)),
        })),
      };
    } catch (err: any) {
      return {
        chainId: this.chain.chainId,
        blockNumber: this.lastBlockNumber,
        connected: false,
        latencyMs: Date.now() - started,
        rpcUsed: this.lastRpcUsed,
        endpoints: Array.from(this.health.values()).map((h) => ({
          ...h,
          avgLatencyMs: Number(h.avgLatencyMs.toFixed(1)),
        })),
        error: err?.message || String(err),
      };
    }
  }

  /** Encerra sockets pendentes (importante para testes e para o shutdown do servidor). */
  public destroy(): void {
    for (const p of this.providers.values()) p.destroy();
    this.providers.clear();
  }
}
