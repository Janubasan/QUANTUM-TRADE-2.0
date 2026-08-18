import crypto from 'crypto';

export interface AccountSecrets {
  apiKey?: string;
  apiSecret?: string;
  bridgeToken?: string;
  bridgeTokenHash?: string;
  mt5Password?: string;
  proftSecret?: string;
}

interface EncryptedBlob {
  iv: string;
  tag: string;
  data: string;
}

const ALGO = 'aes-256-gcm';

function resolveMasterKey(): Buffer {
  const raw = process.env.CREDENTIAL_MASTER_KEY;
  if (raw && raw.length >= 32) {
    return crypto.createHash('sha256').update(raw).digest();
  }
  if (!(globalThis as any).__qtEphemeralKey) {
    (globalThis as any).__qtEphemeralKey = crypto.randomBytes(32);
    console.warn(
      '[CredentialVault] CREDENTIAL_MASTER_KEY ausente. Usando chave efêmera de processo (tokens não sobrevivem a restart).'
    );
  }
  return (globalThis as any).__qtEphemeralKey as Buffer;
}

export class CredentialVault {
  private secrets = new Map<string, EncryptedBlob>();

  encrypt(plain: string): EncryptedBlob {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, resolveMasterKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted.toString('hex'),
    };
  }

  decrypt(blob: EncryptedBlob): string {
    const decipher = crypto.createDecipheriv(ALGO, resolveMasterKey(), Buffer.from(blob.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(blob.data, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  put(accountId: string, secrets: AccountSecrets) {
    this.secrets.set(accountId, this.encrypt(JSON.stringify(secrets)));
  }

  get(accountId: string): AccountSecrets | null {
    const blob = this.secrets.get(accountId);
    if (!blob) return null;
    try {
      return JSON.parse(this.decrypt(blob)) as AccountSecrets;
    } catch {
      return null;
    }
  }

  merge(accountId: string, patch: Partial<AccountSecrets>) {
    const current = this.get(accountId) || {};
    this.put(accountId, { ...current, ...patch });
  }

  delete(accountId: string) {
    this.secrets.delete(accountId);
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  generateBridgeToken(): { token: string; hash: string; hint: string } {
    const token = `qt_${crypto.randomBytes(24).toString('base64url')}`;
    return {
      token,
      hash: this.hashToken(token),
      hint: token.slice(-8),
    };
  }

  verifyBridgeToken(accountId: string, presented: string): boolean {
    const secrets = this.get(accountId);
    if (!secrets?.bridgeTokenHash || !presented) return false;
    const presentedHash = this.hashToken(presented);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(secrets.bridgeTokenHash, 'hex'),
        Buffer.from(presentedHash, 'hex')
      );
    } catch {
      return false;
    }
  }
}

export const credentialVault = new CredentialVault();
