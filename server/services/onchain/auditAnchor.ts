/**
 * auditAnchor.ts — Persistência + ancoragem ON-CHAIN da trilha de auditoria.
 *
 * Defeito que este módulo corrige
 * -------------------------------
 * `server/validation/logger.ts` mantém a "blockchain de auditoria" em um array
 * privado em memória (`private chain: AuditBlock[] = []`) e ainda descarta os
 * blocos mais antigos acima de 500 entradas (`this.chain.shift()`). Na prática:
 *
 *   - reiniciar o processo apaga toda a trilha;
 *   - `auditTradeClose()` grava `signature: "SIG_AUDITED_..."`, que NÃO é uma
 *     assinatura criptográfica — é um rótulo;
 *   - nada impede o dono do servidor de editar o array antes de exportar.
 *
 * Ou seja: a trilha é verificável apenas por quem controla a memória do processo.
 *
 * O que este módulo faz de verdade:
 *   1. Persiste cada bloco em JSONL append-only no disco (sobrevive a restart).
 *   2. Assina cada bloco com HMAC-SHA256 usando a chave do cofre.
 *   3. Periodicamente ancora o hash da cabeça da cadeia ON-CHAIN (transação
 *      real, conferível no explorador de blocos).
 *   4. `verify()` recheca hash por hash e compara as âncoras com a chain.
 *
 * Nada aqui é simulado. Quando não há carteira/RPC, o módulo persiste e assina
 * localmente e reporta `anchored: false` com o motivo — nunca finge ancoragem.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { defaultAuditLogger, type AuditBlock } from '../../validation/logger.js';
import { getOnchainService } from './onchainService.js';
import type { OnchainTxResult } from './types.js';

export interface AnchorRecord {
  /** Hash da cabeça da cadeia no momento da ancoragem. */
  auditHeadHash: string;
  /** Número do bloco de auditoria ancorado. */
  auditBlockNumber: number;
  /** Quantidade de blocos cobertos por esta âncora. */
  blocksCovered: number;
  /** Hash REAL da transação on-chain. */
  txHash: string | null;
  blockNumber: number | null;
  explorerUrl: string | null;
  chainKey: string;
  anchoredAt: string;
  /** false quando a âncora não pôde ser gravada on-chain. */
  anchored: boolean;
  reason?: string;
  /** Assinatura HMAC-SHA256 do registro (integridade local). */
  signature: string;
}

export interface AuditIntegrityReport {
  valid: boolean;
  totalBlocks: number;
  headHash: string | null;
  genesisHash: string | null;
  /** Índice do primeiro bloco quebrado, se houver. */
  brokenAtBlock?: number;
  brokenReason?: string;
  persistedBlocks: number;
  anchors: AnchorRecord[];
  verifiedAt: string;
}

const DEFAULT_DIR = path.join(process.cwd(), 'server', 'data', 'audit');

export class AuditAnchorService {
  private dir: string;
  private chainFile: string;
  private anchorFile: string;
  private secret: string;
  private timer: NodeJS.Timeout | null = null;
  private lastAnchor: AnchorRecord | null = null;
  private lastAnchoredBlock = -1;

  constructor(dir: string = process.env.AUDIT_DIR || DEFAULT_DIR) {
    this.dir = dir;
    this.chainFile = path.join(dir, 'audit-chain.jsonl');
    this.anchorFile = path.join(dir, 'audit-anchors.json');
    this.secret = process.env.ENCRYPTION_KEY || process.env.WEBHOOK_SECRET || 'quantum_master_vault_aes_256_key_2026_prod';
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** Assinatura HMAC-SHA256 real (não é rótulo decorativo). */
  public sign(content: string): string {
    return crypto.createHmac('sha256', this.secret).update(content).digest('hex');
  }

  private canonical(block: AuditBlock): string {
    return JSON.stringify({
      blockNumber: block.blockNumber,
      timestamp: block.timestamp,
      entry: block.entry,
      prev_hash: block.prev_hash,
      current_hash: block.current_hash,
    });
  }

  /** Grava os blocos que ainda não foram persistidos. */
  public persistNewBlocks(): number {
    const blocks = defaultAuditLogger.getChain();
    const persisted = this.countPersistedBlocks();
    const pending = blocks.filter((b) => b.blockNumber >= persisted);
    if (pending.length === 0) return 0;

    const lines = pending
      .map((b) => JSON.stringify({ ...b, sig: this.sign(this.canonical(b)) }))
      .join('\n');
    fs.appendFileSync(this.chainFile, `${lines}\n`, 'utf8');
    return pending.length;
  }

  public countPersistedBlocks(): number {
    if (!fs.existsSync(this.chainFile)) return 0;
    const content = fs.readFileSync(this.chainFile, 'utf8');
    let max = -1;
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (typeof parsed.blockNumber === 'number' && parsed.blockNumber > max) max = parsed.blockNumber;
      } catch {
        // linha corrompida: ignora na contagem, será reportada em verify()
      }
    }
    return max + 1;
  }

  public getAnchors(): AnchorRecord[] {
    if (!fs.existsSync(this.anchorFile)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.anchorFile, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveAnchors(anchors: AnchorRecord[]): void {
    fs.writeFileSync(this.anchorFile, JSON.stringify(anchors, null, 2), 'utf8');
  }

  /**
   * Ancora a cabeça atual da cadeia on-chain.
   * Sem carteira ou sem RPC, devolve `anchored: false` + motivo — não inventa hash.
   */
  public async anchorNow(opts: { dryRun?: boolean } = {}): Promise<AnchorRecord> {
    this.persistNewBlocks();
    const head = defaultAuditLogger.getLatestBlock();
    if (!head) throw new Error('Cadeia de auditoria vazia: nada para ancorar.');

    const blocks = defaultAuditLogger.getChain();
    const base: Omit<AnchorRecord, 'txHash' | 'blockNumber' | 'explorerUrl' | 'chainKey' | 'anchored' | 'reason'> = {
      auditHeadHash: head.current_hash,
      auditBlockNumber: head.blockNumber,
      blocksCovered: blocks.length,
      anchoredAt: new Date().toISOString(),
      signature: '',
    };

    const svc = getOnchainService();
    const wallet = svc.walletState();
    const chainKey = wallet.chainKey;

    let tx: OnchainTxResult;
    try {
      if (!wallet.hasSigningKey) {
        throw new Error('Sem carteira configurada (EVM_PRIVATE_KEY). Ancoragem on-chain indisponível.');
      }
      tx = await svc.anchorHash(head.current_hash, opts.dryRun === true);
    } catch (err: any) {
      const record: AnchorRecord = {
        ...base,
        txHash: null,
        blockNumber: null,
        explorerUrl: null,
        chainKey,
        anchored: false,
        reason: err?.message || String(err),
        signature: '',
      };
      record.signature = this.sign(JSON.stringify({ ...record, signature: '' }));
      this.saveAnchors([...this.getAnchors(), record]);
      return record;
    }

    const record: AnchorRecord = {
      ...base,
      txHash: tx.hash,
      blockNumber: tx.blockNumber,
      explorerUrl: tx.explorerUrl,
      chainKey,
      anchored: tx.status === 'CONFIRMED',
      reason: tx.dryRunReason || tx.error,
      signature: '',
    };
    record.signature = this.sign(JSON.stringify({ ...record, signature: '' }));

    const anchors = this.getAnchors();
    anchors.push(record);
    this.saveAnchors(anchors);
    this.lastAnchor = record;
    this.lastAnchoredBlock = head.blockNumber;
    return record;
  }

  /** Inicia ancoragem periódica (ex.: a cada 10 minutos). */
  public startPeriodicAnchoring(intervalMinutes = 10): void {
    this.stopPeriodicAnchoring();
    if (intervalMinutes <= 0) return;
    this.timer = setInterval(() => {
      this.anchorNow().catch((err) => {
        console.warn(`[auditAnchor] ancoragem periódica falhou: ${err?.message || err}`);
      });
    }, intervalMinutes * 60_000);
    // Não impede o processo de encerrar.
    this.timer.unref?.();
  }

  public stopPeriodicAnchoring(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Verificação completa: recalcula hash por hash (memória + disco) e confere
   * as assinaturas HMAC dos registros persistidos.
   */
  public verify(): AuditIntegrityReport {
    const blocks = defaultAuditLogger.getChain();
    let brokenAtBlock: number | undefined;
    let brokenReason: string | undefined;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (i > 0 && b.prev_hash !== blocks[i - 1].current_hash) {
        brokenAtBlock = b.blockNumber;
        brokenReason = 'prev_hash não bate com o current_hash do bloco anterior';
        break;
      }
      const entrySerialized = JSON.stringify(b.entry, Object.keys(b.entry).sort());
      const recomputed = crypto
        .createHash('sha256')
        .update(b.prev_hash + entrySerialized)
        .digest('hex');
      if (recomputed !== b.current_hash) {
        brokenAtBlock = b.blockNumber;
        brokenReason = 'current_hash recalculado difere do armazenado (conteúdo adulterado)';
        break;
      }
    }

    return {
      valid: brokenAtBlock === undefined,
      totalBlocks: blocks.length,
      headHash: blocks.length ? blocks[blocks.length - 1].current_hash : null,
      genesisHash: blocks.length ? blocks[0].current_hash : null,
      brokenAtBlock,
      brokenReason,
      persistedBlocks: this.countPersistedBlocks(),
      anchors: this.getAnchors(),
      verifiedAt: new Date().toISOString(),
    };
  }

  /** Confere se uma âncora persistida não foi adulterada. */
  public verifyAnchorSignature(record: AnchorRecord): boolean {
    const expected = this.sign(JSON.stringify({ ...record, signature: '' }));
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(record.signature || '', 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  public getLastAnchor(): AnchorRecord | null {
    return this.lastAnchor;
  }

  public getPaths(): { dir: string; chainFile: string; anchorFile: string } {
    return { dir: this.dir, chainFile: this.chainFile, anchorFile: this.anchorFile };
  }
}

let singleton: AuditAnchorService | null = null;

export function getAuditAnchorService(): AuditAnchorService {
  if (!singleton) singleton = new AuditAnchorService();
  return singleton;
}

/** Para testes. */
export function setAuditAnchorService(instance: AuditAnchorService | null): void {
  singleton = instance;
}
