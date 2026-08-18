import crypto from 'crypto';
import { brokerAudit } from '../../services/brokerAudit.js';

export interface ProftRestConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  accountId: string;
  environment: 'demo' | 'live';
}

export interface ProftRestOrder {
  clientOrderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  type?: 'market' | 'limit';
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
}

export interface ProftRestResult {
  ok: boolean;
  status: 'filled' | 'pending' | 'rejected';
  orderId?: string;
  ticket?: string;
  fillPrice?: number;
  raw: Record<string, unknown>;
  error?: string;
}

function sign(secret: string, timestamp: string, method: string, path: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}${method.toUpperCase()}${path}${body}`).digest('hex');
}

export class ProftRestClient {
  constructor(private readonly cfg: ProftRestConfig) {}

  async placeOrder(order: ProftRestOrder): Promise<ProftRestResult> {
    return this.request('POST', '/v1/orders', order as unknown as Record<string, unknown>);
  }

  async cancelOrder(orderId: string): Promise<ProftRestResult> {
    return this.request('DELETE', `/v1/orders/${encodeURIComponent(orderId)}`, {});
  }

  async getBalance(): Promise<ProftRestResult> {
    return this.request('GET', '/v1/account', {});
  }

  async getPositions(): Promise<ProftRestResult> {
    return this.request('GET', '/v1/positions', {});
  }

  private async request(method: string, path: string, payload: Record<string, unknown>): Promise<ProftRestResult> {
    const base = this.cfg.baseUrl.replace(/\/$/, '');
    const url = `${base}${path}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = method === 'GET' ? '' : JSON.stringify(payload);
    const signature = sign(this.cfg.apiSecret, timestamp, method, path, body);

    brokerAudit.append({
      accountId: this.cfg.accountId,
      venue: 'proft',
      environment: this.cfg.environment,
      stage: 'rest_request',
      symbol: String(payload.symbol || 'ACCOUNT'),
      payload: { method, path, environment: this.cfg.environment, clientOrderId: payload.clientOrderId },
    });

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.cfg.apiKey,
          'X-Timestamp': timestamp,
          'X-Signature': signature,
          'X-Account-Id': this.cfg.accountId,
          'X-Environment': this.cfg.environment,
        },
        body: method === 'GET' ? undefined : body,
      });
      const text = await res.text();
      let raw: Record<string, unknown> = {};
      try {
        raw = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        raw = { text };
      }

      if (!res.ok) {
        return {
          ok: false,
          status: 'rejected',
          raw,
          error: String(raw.error || raw.message || `HTTP ${res.status}`),
        };
      }

      const statusRaw = String(raw.status || raw.state || 'pending').toLowerCase();
      const status: ProftRestResult['status'] =
        statusRaw.includes('fill') || statusRaw === 'executed' ? 'filled' : statusRaw.includes('reject') ? 'rejected' : 'pending';

      brokerAudit.append({
        accountId: this.cfg.accountId,
        venue: 'proft',
        environment: this.cfg.environment,
        stage: `rest_${status}`,
        symbol: String(payload.symbol || 'ACCOUNT'),
        payload: { orderId: raw.id || raw.orderId, fillPrice: raw.avgPrice || raw.price, raw },
      });

      return {
        ok: true,
        status,
        orderId: String(raw.id || raw.orderId || ''),
        ticket: String(raw.ticket || raw.clOrdId || ''),
        fillPrice: Number(raw.avgPrice || raw.price || 0) || undefined,
        raw,
      };
    } catch (err: any) {
      return {
        ok: false,
        status: 'rejected',
        raw: {},
        error: err?.message || 'Falha de rede no REST Proft',
      };
    }
  }
}
