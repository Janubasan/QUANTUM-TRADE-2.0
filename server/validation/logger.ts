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

  public auditTradeClose(trade: {
    id: string;
    symbol: string;
    direction: string;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    timeframe: string;
    botName?: string;
    accountName?: string;
  }): { auditCode: string; auditHash: string; blockNumber: number } {
    const payload = {
      tradeId: trade.id,
      symbol: trade.symbol,
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      pnl: trade.pnl,
      timeframe: trade.timeframe,
      botName: trade.botName || 'Audited-Bot',
      accountName: trade.accountName || 'Primary-Account',
      closeTimestamp: new Date().toISOString(),
    };

    const envelope: SignedEnvelope = {
      source: `AUDIT_ENGINE_${trade.timeframe.toUpperCase()}`,
      timestamp: Date.now() / 1000,
      payload,
      hash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      signature: `SIG_AUDITED_${trade.id.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}`,
      status: 'APPROVED',
      reason: `Trade Fechado e Auditado no Timeframe ${trade.timeframe} (PnL R$ ${trade.pnl.toFixed(2)})`,
    };

    const block = this.append(envelope);
    const auditCode = `AUD-${trade.timeframe.toUpperCase()}-${envelope.hash.substring(0, 8).toUpperCase()}`;
    
    return {
      auditCode,
      auditHash: block.current_hash,
      blockNumber: block.blockNumber,
    };
  }

  public resetChain() {
    this.chain = [];
    this.initGenesisBlock();
  }
}

export const defaultAuditLogger = new AuditLogger();
