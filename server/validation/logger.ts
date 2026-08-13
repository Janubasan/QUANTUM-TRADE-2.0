import crypto from 'crypto';
import { SignedEnvelope } from './signer.js';

export interface AuditBlock {
  blockNumber: number;
  timestamp: string;
  entry: SignedEnvelope;
  prev_hash: string;
  current_hash: string;
}

export class AuditLogger {
  private chain: AuditBlock[] = [];

  constructor() {
    this.initGenesisBlock();
  }

  private initGenesisBlock() {
    const genesisEnvelope: SignedEnvelope = {
      source: 'GENESIS_SYSTEM',
      timestamp: Date.now() / 1000,
      payload: { symbol: 'GENESIS', close: 0, volume: 0, provider: 'QUANTUM_GENESIS' },
      hash: crypto.createHash('sha256').update('QUANTUM_GENESIS_SEED').digest('hex'),
      signature: 'GENESIS_SIG_00000',
      status: 'APPROVED',
      reason: 'Genesis Initialization',
    };

    const prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
    const entrySerialized = JSON.stringify(genesisEnvelope, Object.keys(genesisEnvelope).sort());
    const currentHash = crypto
      .createHash('sha256')
      .update(prevHash + entrySerialized)
      .digest('hex');

    this.chain.push({
      blockNumber: 0,
      timestamp: new Date().toISOString(),
      entry: genesisEnvelope,
      prev_hash: prevHash,
      current_hash: currentHash,
    });
  }

  public append(entry: SignedEnvelope): AuditBlock {
    const prevHash = this.chain[this.chain.length - 1].current_hash;
    const entrySerialized = JSON.stringify(entry, Object.keys(entry).sort());
    const currentHash = crypto
      .createHash('sha256')
      .update(prevHash + entrySerialized)
      .digest('hex');

    const block: AuditBlock = {
      blockNumber: this.chain.length,
      timestamp: new Date().toISOString(),
      entry,
      prev_hash: prevHash,
      current_hash: currentHash,
    };

    this.chain.push(block);

    // Keep memory clean (max 500 blocks)
    if (this.chain.length > 500) {
      this.chain.shift();
    }

    return block;
  }

  public getChain(): AuditBlock[] {
    return [...this.chain];
  }

  public getLatestBlock(): AuditBlock | undefined {
    return this.chain[this.chain.length - 1];
  }

  public verifyIntegrity(): boolean {
    for (let i = 1; i < this.chain.length; i++) {
      const prev = this.chain[i - 1];
      const curr = this.chain[i];

      if (curr.prev_hash !== prev.current_hash) {
        return false;
      }

      const entrySerialized = JSON.stringify(curr.entry, Object.keys(curr.entry).sort());
      const recomputedHash = crypto
        .createHash('sha256')
        .update(curr.prev_hash + entrySerialized)
        .digest('hex');

      if (recomputedHash !== curr.current_hash) {
        return false;
      }
    }
    return true;
  }
}

export const defaultAuditLogger = new AuditLogger();
