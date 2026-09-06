import { BrokerAdapter, Balance, SignedOrder, ExecutionReceipt, ExecutionStatus, BrokerKind } from './BrokerAdapter.js';
import { computeHmacSignature } from '../cryptoService.js';

export interface MT5Config {
  bridgeUrl: string;
  hmacSecret: string;
  login?: number;
  server?: string;
  isSandbox: boolean;
  timeoutMs: number;
}

export class MT5Adapter implements BrokerAdapter {
  public readonly id = 'mt5';
  public readonly name = 'MetaTrader 5 (Plus Edge Python Bridge)';
  public readonly kind: BrokerKind = 'broker';
  public isEnabled: boolean = true;
  public isSandbox: boolean = true; // Padrão seguro: Sandbox

  private bridgeUrl: string;
  private hmacSecret: string;
  private lastPingTimeMs: number = 0;
  private isBridgeConnected: boolean = false;
  private lastErrorMessage: string = '';

  private simulatedBalances: Balance[] = [
    { asset: 'USD', free: 10000.0, locked: 0, total: 10000.0, updatedAt: new Date().toISOString() },
    { asset: 'BRL', free: 50000.0, locked: 0, total: 50000.0, updatedAt: new Date().toISOString() },
    { asset: 'EUR', free: 8500.0, locked: 0, total: 8500.0, updatedAt: new Date().toISOString() },
  ];

  constructor(isSandbox: boolean = true) {
    this.isSandbox = isSandbox;
    this.bridgeUrl = (process.env.MT5_BRIDGE_URL || 'http://localhost:8000').replace(/\/$/, '');
    this.hmacSecret = process.env.MT5_HMAC_SECRET || process.env.WEBHOOK_SECRET || 'quantum_mt5_bridge_secret_2026';
  }

  /**
   * Realiza verificação de saúde contra a bridge Python (JOAT mt5_executor.py)
   */
  public async pingBridge(): Promise<{ connected: boolean; latencyMs: number; terminalInfo?: any; error?: string }> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const signature = computeHmacSignature({ action: 'ping', timestamp: startTime }, this.hmacSecret);
      const res = await fetch(`${this.bridgeUrl}/health`, {
        method: 'GET',
        headers: {
          'X-Signature-256': signature,
          'X-Timestamp': startTime.toString(),
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;
      this.lastPingTimeMs = latencyMs;

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        this.isBridgeConnected = true;
        this.lastErrorMessage = '';
        return { connected: true, latencyMs, terminalInfo: data };
      } else {
        this.isBridgeConnected = false;
        this.lastErrorMessage = `Bridge HTTP ${res.status}: ${res.statusText}`;
        return { connected: false, latencyMs, error: this.lastErrorMessage };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      this.lastPingTimeMs = latencyMs;
      this.isBridgeConnected = false;
      this.lastErrorMessage = err.name === 'AbortError' ? 'Bridge MT5 Timeout (2.5s)' : `Bridge Offline: ${err.message}`;
      return { connected: false, latencyMs, error: this.lastErrorMessage };
    }
  }

  public async getBalances(): Promise<Balance[]> {
    if (!this.isSandbox && this.bridgeUrl) {
      try {
        const startTime = Date.now();
        const signature = computeHmacSignature({ action: 'balance', timestamp: startTime }, this.hmacSecret);
        const res = await fetch(`${this.bridgeUrl}/account/info`, {
          method: 'GET',
          headers: {
            'X-Signature-256': signature,
            'X-Timestamp': startTime.toString(),
          },
        });

        if (res.ok) {
          const info = await res.json();
          this.isBridgeConnected = true;
          return [
            {
              asset: info.currency || 'USD',
              free: parseFloat(info.margin_free || info.balance || '0'),
              locked: parseFloat(info.margin || '0'),
              total: parseFloat(info.equity || info.balance || '0'),
              updatedAt: new Date().toISOString(),
            },
          ];
        }
      } catch (err: any) {
        this.isBridgeConnected = false;
        this.lastErrorMessage = err.message;
      }
    }

    return this.simulatedBalances;
  }

  public async placeOrder(order: SignedOrder): Promise<ExecutionReceipt> {
    const startTime = Date.now();
    const side = order.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
    const clientOrderId = order.order_hash || `mt5-${order.id || Date.now()}`;
    const cleanSymbol = order.symbol.replace('/', '').toUpperCase();

    // Se estiver em modo LIVE com Bridge conectada, envia para a FastAPI JOAT MT5
    if (!this.isSandbox) {
      try {
        const payload = {
          symbol: cleanSymbol,
          action: side,
          volume: order.quantity,
          price: order.price,
          sl: order.slPrice,
          tp: order.tpPrice,
          magic: 202608,
          comment: `QuantumTrade:${order.id}`,
          timestamp: Date.now(),
        };

        const signature = computeHmacSignature(payload, this.hmacSecret);

        const res = await fetch(`${this.bridgeUrl}/order/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Signature-256': signature,
            'X-Timestamp': payload.timestamp.toString(),
          },
          body: JSON.stringify(payload),
        });

        const latencyMs = Date.now() - startTime;

        if (res.ok) {
          const result = await res.json();
          this.isBridgeConnected = true;

          return {
            success: true,
            orderId: `mt5-${result.order_ticket || Date.now()}`,
            clientOrderId,
            externalOrderId: `${result.order_ticket || result.deal_id || 'N/A'}`,
            adapterId: this.id,
            adapterName: `${this.name} (Live MT5 Terminal)`,
            symbol: order.symbol,
            side,
            quantity: order.quantity,
            filledQuantity: Number(result.volume || order.quantity),
            executedPrice: Number(result.price || order.price || 0),
            fee: Number(result.commission || 0),
            feeAsset: 'USD',
            latencyMs,
            status: 'FILLED',
            timestamp: new Date().toISOString(),
            rawResponse: result,
          };
        } else {
          const errData = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(`MT5 Bridge Rejeitou Ordem: ${errData.error || errData.detail || res.statusText}`);
        }
      } catch (err: any) {
        console.warn(`[MT5Adapter] Falha na execução Live MT5: ${err.message}. Retornando erro explícito.`);
        return {
          success: false,
          orderId: `mt5-err-${Date.now()}`,
          clientOrderId,
          adapterId: this.id,
          adapterName: `${this.name} (Live)`,
          symbol: order.symbol,
          side,
          quantity: order.quantity,
          filledQuantity: 0,
          executedPrice: 0,
          fee: 0,
          feeAsset: 'USD',
          latencyMs: Date.now() - startTime,
          status: 'REJECTED',
          timestamp: new Date().toISOString(),
          error: err.message,
        };
      }
    }

    // Execução em modo Sandbox / Simulado de Alta Fidelidade
    const simulatedLatency = Math.floor(Math.random() * 25 + 12); // 12-37ms MT5 IPC latency
    const executedPrice = order.price || (side === 'BUY' ? 1.0845 : 1.0842);
    const simulatedTicket = Math.floor(10000000 + Math.random() * 90000000);

    return {
      success: true,
      orderId: `mt5-sim-${Date.now().toString(36)}`,
      clientOrderId,
      externalOrderId: `ticket-${simulatedTicket}`,
      adapterId: this.id,
      adapterName: `${this.name} (Sandbox / Bridge Ready)`,
      symbol: order.symbol,
      side,
      quantity: order.quantity,
      filledQuantity: order.quantity,
      executedPrice,
      fee: +(order.quantity * 0.05).toFixed(2), // Comissão típica Forex $5/lote
      feeAsset: 'USD',
      latencyMs: simulatedLatency,
      status: 'FILLED',
      timestamp: new Date().toISOString(),
      rawResponse: {
        retcode: 10009, // TRADE_RETCODE_DONE
        deal: simulatedTicket + 1,
        order: simulatedTicket,
        volume: order.quantity,
        price: executedPrice,
        bid: executedPrice - 0.0001,
        ask: executedPrice + 0.0001,
        comment: 'QuantumTrade Sim Engine',
      },
    };
  }

  public async cancelOrder(orderId: string): Promise<boolean> {
    if (!this.isSandbox && this.isBridgeConnected) {
      try {
        const payload = { orderId, timestamp: Date.now() };
        const signature = computeHmacSignature(payload, this.hmacSecret);
        const res = await fetch(`${this.bridgeUrl}/order/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Signature-256': signature },
          body: JSON.stringify(payload),
        });
        return res.ok;
      } catch {
        return false;
      }
    }
    return true;
  }

  public async getOrder(orderId: string): Promise<ExecutionStatus> {
    return {
      orderId,
      externalOrderId: `ticket-${orderId}`,
      status: 'FILLED',
      filledQuantity: 1,
      remainingQuantity: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  public async isMarketOpen(instrument: string): Promise<boolean> {
    const symbol = instrument.toUpperCase();
    const now = new Date();
    const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const hour = now.getUTCHours();

    // Mercado Forex / Índices fecha de Sexta 21:00 UTC até Domingo 21:00 UTC
    if (day === 6) return false;
    if (day === 5 && hour >= 21) return false;
    if (day === 0 && hour < 21) return false;

    return true;
  }

  public getStatus() {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      isEnabled: this.isEnabled,
      isSandbox: this.isSandbox,
      isConnected: this.isBridgeConnected || this.isSandbox,
      lastPingMs: this.lastPingTimeMs || 15,
      error: this.lastErrorMessage || undefined,
      bridgeUrl: this.bridgeUrl,
    };
  }
}
