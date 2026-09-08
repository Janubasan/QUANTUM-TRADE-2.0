// Assinatura HMAC-SHA256 / SHA512 / base64 — padrão das exchanges (Binance, Bybit, OKX, Coinbase, Kraken).
import crypto from 'crypto';

export function hmacSha256(secret: string, msg: string): string {
  return crypto.createHmac('sha256', secret).update(msg).digest('hex');
}

export function hmacSha256Base64(secret: string, msg: string): string {
  return crypto.createHmac('sha256', secret).update(msg).digest('base64');
}

/** Kraken: HMAC-SHA512(nonce+POST) com secret base64. */
export function krakenSign(secretB64: string, path: string, nonce: string, postData: string): string {
  const sha = crypto.createHash('sha256').update(nonce + postData).digest();
  return crypto.createHmac('sha512', Buffer.from(secretB64, 'base64')).update(path + sha).digest('base64');
}

/** Coinbase Advanced (CDP): JWT ES256 — aqui retornamos o header de API key (modo simple). */
export function coinbaseHeaders(key: string, secret: string, method: string, path: string, body = '', ts?: number) {
  const timestamp = String(ts ?? Math.floor(Date.now() / 1000));
  const msg = timestamp + method.toUpperCase() + path + body;
  const sign = hmacSha256Base64(secret, msg);
  return { 'CB-ACCESS-KEY': key, 'CB-ACCESS-SIGN': sign, 'CB-ACCESS-TIMESTAMP': timestamp };
}

export async function http<T>(url: string, init: RequestInit = {}, timeoutMs = 12000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}
