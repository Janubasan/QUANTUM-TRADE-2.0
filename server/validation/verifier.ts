import crypto from 'crypto';
import { SignedEnvelope } from './signer.js';
import { RAGValidator, defaultRagValidator } from './rag_validator.js';
import { AuditLogger, defaultAuditLogger } from './logger.js';

export class DataVerifier {
  private secretKey: string;
  private rag: RAGValidator;
  private log: AuditLogger;
  private timeToleranceSeconds = 300; // 5 minutes tolerance

  constructor(
    secretKey = 'QUANTUM_ED25519_SECRET_KEY_PROD_2026',
    ragValidator: RAGValidator = defaultRagValidator,
    auditLog: AuditLogger = defaultAuditLogger
  ) {
    this.secretKey = secretKey;
    this.rag = ragValidator;
    this.log = auditLog;
  }

  public verify(signedEnvelope: SignedEnvelope): boolean {
    try {
      const payload = signedEnvelope.payload;
      const source = signedEnvelope.source;
      const ts = signedEnvelope.timestamp;
      const sigHex = signedEnvelope.signature;
      const expectedHash = signedEnvelope.hash;

      // 1. Recompute payload hash
      const raw = JSON.stringify(payload, Object.keys(payload).sort());
      const computedHash = crypto.createHash('sha256').update(raw).digest('hex');
      if (computedHash !== expectedHash) {
        this.logFailure('hash_mismatch', signedEnvelope);
        return false;
      }

      // 2. Verify signature
      const message = `${expectedHash}${ts}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.secretKey)
        .update(message)
        .digest('hex');

      if (expectedSignature !== sigHex) {
        this.logFailure('invalid_signature', signedEnvelope);
        return false;
      }

      // 3. Verify timestamp (not in future >10s and not older than 5 minutes)
      const now = Date.now() / 1000;
      if (ts > now + 10 || now - ts > this.timeToleranceSeconds) {
        this.logFailure('timestamp_out_of_range', signedEnvelope);
        return false;
      }

      // 4. RAG contextual plausibility check
      if (!this.rag.isPlausible(payload, source)) {
        this.logFailure('rag_plausibility_failed', signedEnvelope);
        return false;
      }

      // Success: Log approved payload in immutable audit chain
      const approvedEnvelope: SignedEnvelope = {
        ...signedEnvelope,
        status: 'APPROVED',
      };
      this.log.append(approvedEnvelope);
      return true;
    } catch (err: any) {
      this.logFailure(`verification_error: ${err.message || err}`, signedEnvelope);
      return false;
    }
  }

  private logFailure(reason: string, envelope: SignedEnvelope) {
    const rejectedEnvelope: SignedEnvelope = {
      ...envelope,
      status: 'REJECTED',
      reason,
    };
    this.log.append(rejectedEnvelope);
  }
}

export const defaultVerifier = new DataVerifier();
