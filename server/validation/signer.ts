import crypto from 'crypto';

export interface DataPayload {
  symbol: string;
  close: number;
  volume: number;
  provider?: string;
  [key: string]: any;
}

export interface SignedEnvelope {
  source: string;
  timestamp: number;
  payload: DataPayload;
  hash: string;
  signature: string;
  status?: 'APPROVED' | 'REJECTED';
  reason?: string;
}

export class DataSigner {
  private secretKey: string;

  constructor(secretKey = 'QUANTUM_ED25519_SECRET_KEY_PROD_2026') {
    this.secretKey = secretKey;
  }

  public signPayload(data: DataPayload, source: string): SignedEnvelope {
    // 1. Deterministic JSON serialization for canonical hashing
    const raw = JSON.stringify(data, Object.keys(data).sort());
    const payloadHash = crypto.createHash('sha256').update(raw).digest('hex');
    const timestamp = Date.now() / 1000; // seconds float

    // 2. Sign payload hash + timestamp to prevent replay attacks
    const message = `${payloadHash}${timestamp}`;
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(message)
      .digest('hex');

    return {
      source,
      timestamp,
      payload: data,
      hash: payloadHash,
      signature,
    };
  }
}

export const defaultSigner = new DataSigner();
