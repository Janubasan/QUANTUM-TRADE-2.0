// Trilha de auditoria imutável — hash-chain SHA-256 append-only (JSONL).
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface AuditBlock {
  seq: number;
  ts: string;
  kind: string;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
  auditCode: string;
}

const DIR = process.env.AUDIT_DIR ?? './data';
const FILE = path.join(DIR, `audit-${new Date().toISOString().slice(0, 10)}.jsonl`);

function ensureFile(): AuditBlock[] {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(FILE)) return [];
  return fs.readFileSync(FILE, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function seal(kind: string, payload: Record<string, unknown>): AuditBlock {
  const chain = ensureFile();
  const prev = chain.length ? chain[chain.length - 1].hash : 'GENESIS';
  const seq = chain.length + 1;
  const ts = new Date().toISOString();
  const auditCode = `AUD-${kind.toUpperCase().slice(0, 3)}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase()}`;
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify({ seq, ts, kind, payload, prevHash: prev }))
    .digest('hex');
  const block: AuditBlock = { seq, ts, kind, payload, prevHash: prev, hash, auditCode };
  fs.appendFileSync(FILE, JSON.stringify(block) + '\n');
  return block;
}

export function verifyChain(): { ok: boolean; blocks: number; brokenAt?: number } {
  const chain = ensureFile();
  let prev = 'GENESIS';
  for (let i = 0; i < chain.length; i++) {
    const b = chain[i];
    const recomputed = crypto.createHash('sha256')
      .update(JSON.stringify({ seq: b.seq, ts: b.ts, kind: b.kind, payload: b.payload, prevHash: b.prevHash }))
      .digest('hex');
    if (b.prevHash !== prev || recomputed !== b.hash) return { ok: false, blocks: chain.length, brokenAt: b.seq };
    prev = b.hash;
  }
  return { ok: true, blocks: chain.length };
}

export function recentBlocks(n = 50): AuditBlock[] {
  return ensureFile().slice(-n).reverse();
}
