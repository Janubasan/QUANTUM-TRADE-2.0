/**
 * auditChain.ts
 * ---------------------------------------------------------------------------
 * Trilha de auditoria criptográfica do Comitê JARVIS — Hash Chain Append-Only.
 *
 * Cada evento gerado pelos agentes é registrado sequencialmente numa estrutura
 * imutável: hash(i) = SHA256(prev_hash(i-1) + payload(i)). A integridade pode
 * ser revalidada bloco a bloco pelo validador integrado (verifyIntegrity).
 *
 * Eventos auditados (especificação JARVIS):
 *   ORDER_FILLED   — ordem aberta após consenso + risco aprovado
 *   POSITION_CLOSED— posição encerrada (TP/SL)
 *   RISK_VETO      — gerenciador de risco bloqueou um sinal dos agentes
 *   HALT           — trava global (3 perdas, drawdown diário, etc.)
 *   CONFIG         — mudança de configuração (modo scalper, reset de trava)
 */

import crypto from 'crypto';

export type CommitteeAuditEventType =
  | 'ORDER_FILLED'
  | 'POSITION_CLOSED'
  | 'RISK_VETO'
  | 'RAG_VETO'
  | 'HALT'
  | 'CONFIG'
  | 'STAGED'
  | 'APPROVED'
  | 'REJECTED';

export interface CommitteeAuditEvent {
  id: string;
  blockNumber: number;
  type: CommitteeAuditEventType;
  timestamp: string;
  symbol?: string;
  direction?: string;
  score?: number;
  confidence?: number;
  detail: string;
  prevHash: string;
  hash: string;
}

const GENESIS_PREV = '0'.repeat(64);

export class CommitteeAuditChain {
  private chain: CommitteeAuditEvent[] = [];

  public reset(): void {
    this.chain = [];
  }

  private computeHash(
    prevHash: string,
    evt: Omit<CommitteeAuditEvent, 'hash' | 'prevHash' | 'blockNumber'>
  ): string {
    const payload = JSON.stringify({
      id: evt.id,
      type: evt.type,
      timestamp: evt.timestamp,
      symbol: evt.symbol ?? null,
      direction: evt.direction ?? null,
      score: evt.score ?? null,
      confidence: evt.confidence ?? null,
      detail: evt.detail,
    });
    return crypto.createHash('sha256').update(prevHash + payload).digest('hex');
  }

  public append(evt: {
    type: CommitteeAuditEventType;
    symbol?: string;
    direction?: string;
    score?: number;
    confidence?: number;
    detail: string;
  }): CommitteeAuditEvent {
    const prevHash = this.chain.length
      ? this.chain[this.chain.length - 1].hash
      : GENESIS_PREV;
    const blockNumber = this.chain.length;
    const id = `blk-${blockNumber}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const timestamp = new Date().toISOString();
    const hash = this.computeHash(prevHash, { ...evt, id, timestamp });

    const block: CommitteeAuditEvent = {
      id,
      blockNumber,
      timestamp,
      ...evt,
      prevHash,
      hash,
    };

    this.chain.push(block);
    // Mantém a memória enxuta (máx. 500 blocos)
    if (this.chain.length > 500) this.chain.shift();
    return block;
  }

  public getChain(): CommitteeAuditEvent[] {
    return [...this.chain];
  }

  public tail(n: number): CommitteeAuditEvent[] {
    return this.chain.slice(-n).reverse();
  }

  public verifyIntegrity(): boolean {
    let prev = GENESIS_PREV;
    for (const block of this.chain) {
      if (block.prevHash !== prev) return false;
      const recomputed = this.computeHash(block.prevHash, {
        id: block.id,
        type: block.type,
        timestamp: block.timestamp,
        symbol: block.symbol,
        direction: block.direction,
        score: block.score,
        confidence: block.confidence,
        detail: block.detail,
      });
      if (recomputed !== block.hash) return false;
      prev = block.hash;
    }
    return true;
  }
}
