import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const MASTER_KEY = process.env.ENCRYPTION_KEY || 'quantum_master_vault_aes_256_key_2026_prod';

// Deriva chave de 32 bytes constante
function getDerivedKey(): Buffer {
  return crypto.createHash('sha256').update(MASTER_KEY).digest();
}

/**
 * Criptografa dados sensíveis (API Keys, Secrets, Private Keys) usando AES-256-GCM
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext || plaintext.trim() === '') return '';
  if (plaintext.startsWith('vault:v1:')) return plaintext; // Já criptografado

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getDerivedKey(), iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Formato: vault:v1:iv:authTag:encrypted
  return `vault:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decriptografa credenciais para uso seguro em memória apenas durante chamadas a brokers
 */
export function decryptSecret(ciphertext: string): string {
  if (!ciphertext) return '';
  if (!ciphertext.startsWith('vault:v1:')) {
    // Compatibilidade com chaves legadas ou em texto puro
    return ciphertext;
  }

  try {
    const parts = ciphertext.split(':');
    if (parts.length !== 5) return ciphertext;

    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const encrypted = parts[4];

    const decipher = crypto.createDecipheriv(ALGORITHM, getDerivedKey(), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    console.error('⚠️ [CryptoService] Falha ao decriptografar credencial:', err.message);
    return '';
  }
}

/**
 * Gera assinatura HMAC-SHA256 para webhooks e bridges (MT5 / TradingView)
 */
export function computeHmacSignature(payload: string | object, secret: string): string {
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(content).digest('hex');
}

/**
 * Valida assinatura HMAC com proteção contra timing attacks
 */
export function verifyHmacSignature(payload: string | object, receivedSignature: string, secret: string): boolean {
  if (!receivedSignature || !secret) return false;
  try {
    const expected = computeHmacSignature(payload, secret);
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(receivedSignature.replace(/^sha256=/, ''), 'hex');
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}
