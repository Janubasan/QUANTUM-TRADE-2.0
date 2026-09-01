import { store } from '../data/store.js';
import { validateProfitRule } from '../engine/profitRule.js';
import { Trade, WebhookAuditLog } from '../../src/types.js';
import { verifyHmacSignature } from './cryptoService.js';
import { realExecutionGateway } from './realExecutionGateway.js';

export interface SignalPayload {
  secret?: string;
  symbol: string;
  action: 'buy' | 'sell' | 'BUY' | 'SELL';
  amount?: number;
  price?: number;
  timestamp?: number; // Unix timestamp in seconds
  order_id?: string;
  timeframe?: string;
  riskPercent?: number;
  notes?: string;
}

class WebhookEngine {
  private secretKey = process.env.WEBHOOK_SECRET || 'STOCKRAFT_QUANTUM_SECRET_2026';
  private seenOrderIds = new Set<string>();

  getSecretKey(): string {
    return this.secretKey;
  }

  setSecretKey(newSecret: string) {
    if (newSecret && newSecret.trim()) {
      this.secretKey = newSecret.trim();
    }
  }

  getTradingViewTemplate(): string {
    return JSON.stringify(
      {
        secret: this.secretKey,
        symbol: '{{ticker}}',
        action: '{{strategy.order.action}}',
        amount: 0.01,
        price: '{{strategy.order.price}}',
        timestamp: '{{time}} / 1000',
        order_id: '{{strategy.order.id}}_{{time}}',
      },
      null,
      2
    );
  }

  async processWebhook(
    payload: SignalPayload,
    signatureHeader?: string
  ): Promise<{
    processed: boolean;
    status: string;
    audit: WebhookAuditLog;
    trade?: Trade;
  }> {
    const currentTimeSec = Math.floor(Date.now() / 1000);
    const signalTimestamp = payload.timestamp || currentTimeSec;
    const latencyMs = Math.max(0, Math.abs(currentTimeSec - signalTimestamp) * 1000);

    const auditId = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const normalizedSymbol = payload.symbol ? payload.symbol.toUpperCase().replace('_', '/') : 'BTC/USDT';
    const action = (payload.action || 'buy').toLowerCase() as 'buy' | 'sell';

    // 1. Authenticate Secret Key or HMAC Signature
    const isSecretValid = payload.secret === this.secretKey;
    const isHmacValid = signatureHeader ? verifyHmacSignature(payload, signatureHeader, this.secretKey) : false;

    if (!isSecretValid && !isHmacValid) {
      const audit: WebhookAuditLog = {
        id: auditId,
        orderId: payload.order_id || 'UNKNOWN',
        symbol: normalizedSymbol,
        action,
        amount: payload.amount || 0.01,
        signalPrice: payload.price || 0,
        latencyMs,
        status: 'AUTH_FAILED',
        brokerAccount: 'N/A',
        accountType: 'demo',
        reason: '[SECURITY REJECTED] Secret ou assinatura HMAC de autenticação do webhook inválido.',
        timestamp: new Date().toISOString(),
      };
      store.addWebhookAudit(audit);
      store.addLog('ERROR', `[SECURITY] Tentativa de acesso não autorizada ao Webhook. Secret/HMAC inválido. ID: ${payload.order_id}`);
      return { processed: false, status: 'AUTH_FAILED', audit };
    }

    // 2. Deduplication check
    if (payload.order_id && this.seenOrderIds.has(payload.order_id)) {
      const audit: WebhookAuditLog = {
        id: auditId,
        orderId: payload.order_id,
        symbol: normalizedSymbol,
        action,
        amount: payload.amount || 0.01,
        signalPrice: payload.price || 0,
        latencyMs,
        status: 'REJECTED_DUPLICATE',
        brokerAccount: 'N/A',
        accountType: 'demo',
        reason: `[AUDIT REJECTED] Sinal duplicado descartado. ID já processado: ${payload.order_id}`,
        timestamp: new Date().toISOString(),
      };
      store.addWebhookAudit(audit);
      store.addLog('RULE', `[AUDIT REJECTED] Sinal duplicado descartado. ID: ${payload.order_id}`);
      return { processed: false, status: 'REJECTED_DUPLICATE', audit };
    }

    if (payload.order_id) {
      this.seenOrderIds.add(payload.order_id);
      if (this.seenOrderIds.size > 1000) {
        this.seenOrderIds.clear();
      }
    }

    // 3. Stale Signal Check (Threshold: max 10 seconds delay)
    if (Math.abs(currentTimeSec - signalTimestamp) > 10) {
      const audit: WebhookAuditLog = {
        id: auditId,
        orderId: payload.order_id || `TV-${Date.now()}`,
        symbol: normalizedSymbol,
        action,
        amount: payload.amount || 0.01,
        signalPrice: payload.price || 0,
        latencyMs,
        status: 'REJECTED_STALE',
        brokerAccount: 'N/A',
        accountType: 'demo',
        reason: `[AUDIT REJECTED] Sinal expirado (Latência: ${latencyMs}ms > 10000ms).`,
        timestamp: new Date().toISOString(),
      };
      store.addWebhookAudit(audit);
      store.addLog('RULE', `[AUDIT REJECTED] Sinal expirado detectado (${latencyMs}ms atraso). ID: ${payload.order_id}`);
      return { processed: false, status: 'REJECTED_STALE', audit };
    }

    // 4. Market Price Lookup & Slippage Control (Max 0.8%)
    const state = store.getState();
    const ticker = state.tickers[normalizedSymbol] || state.tickers['BTC/USDT'] || state.tickers['BTC/BRL'];
    const currentMarketPrice = ticker ? ticker.price : (payload.price || 100);
    const signalPrice = payload.price || currentMarketPrice;

    const slippageRatio = Math.abs(currentMarketPrice - signalPrice) / (signalPrice || 1);
    const slippagePercent = Number((slippageRatio * 100).toFixed(3));

    if (slippageRatio > 0.008) { // 0.8% max slippage
      const audit: WebhookAuditLog = {
        id: auditId,
        orderId: payload.order_id || `TV-${Date.now()}`,
        symbol: normalizedSymbol,
        action,
        amount: payload.amount || 0.01,
        signalPrice,
        marketPrice: currentMarketPrice,
        latencyMs,
        slippagePercent,
        status: 'REJECTED_SLIPPAGE',
        brokerAccount: 'N/A',
        accountType: 'demo',
        reason: `[AUDIT REJECTED] Slippage excessivo (${slippagePercent}% > 0.80%). Preço Sinal: ${signalPrice}, Mercado: ${currentMarketPrice}.`,
        timestamp: new Date().toISOString(),
      };
      store.addWebhookAudit(audit);
      store.addLog('RULE', `[AUDIT REJECTED] Slippage excessivo (${slippagePercent}%). Sinal cancelado.`);
      return { processed: false, status: 'REJECTED_SLIPPAGE', audit };
    }

    // 5. Select target account (Prefer active Real/Demo account)
    const activeAccount = state.accounts.find((a) => a.isActive) || state.accounts[0];
    if (!activeAccount) {
      const audit: WebhookAuditLog = {
        id: auditId,
        orderId: payload.order_id,
        symbol: normalizedSymbol,
        action,
        amount: payload.amount,
        signalPrice,
        marketPrice: currentMarketPrice,
        latencyMs,
        status: 'ERROR',
        brokerAccount: 'Nenhuma',
        accountType: 'demo',
        reason: '[AUDIT ERROR] Nenhuma conta ativa configurada no sistema.',
        timestamp: new Date().toISOString(),
      };
      store.addWebhookAudit(audit);
      return { processed: false, status: 'ERROR', audit };
    }

    // 6. Validate Profit Rule / Available Risk
    const riskPct = payload.riskPercent || 0.5;
    const validation = validateProfitRule(activeAccount, riskPct);

    // Compute TP / SL
    const isLong = action === 'buy';
    const direction = isLong ? 'LONG' : 'SHORT';
    const tpPrice = isLong ? Number((currentMarketPrice * 1.01).toFixed(2)) : Number((currentMarketPrice * 0.99).toFixed(2));
    const slPrice = isLong ? Number((currentMarketPrice * 0.995).toFixed(2)) : Number((currentMarketPrice * 1.005).toFixed(2));
    const quantity = payload.amount || Number((validation.riskAmount / Math.abs(currentMarketPrice - slPrice)).toFixed(6)) || 0.001;

    // Create execution trade record
    const executedTrade: Trade = {
      id: `trd-wh-${Date.now()}`,
      accountId: activeAccount.id,
      accountName: activeAccount.name,
      broker: activeAccount.broker,
      symbol: normalizedSymbol,
      direction,
      entryPrice: currentMarketPrice,
      currentPrice: currentMarketPrice,
      quantity,
      tpPrice,
      slPrice,
      status: 'open',
      pnl: 0,
      pnlPercent: 0,
      entryTime: new Date().toISOString(),
      timeframe: payload.timeframe || '15m',
      notes: payload.notes || `Ordem via Webhook/Bridge (${payload.order_id || 'EXT'}). Latência: ${latencyMs}ms, Slippage: ${slippagePercent}%`,
    };

    store.addTrade(executedTrade);

    // 7. Dispatch directly to RealExecutionGateway (MT5, Binance, cTrader, etc.)
    realExecutionGateway
      .dispatch({
        id: executedTrade.id,
        account_id: activeAccount.id,
        symbol: normalizedSymbol,
        side: isLong ? 'BUY' : 'SELL',
        quantity,
        price: currentMarketPrice,
        tpPrice,
        slPrice,
        order_hash: payload.order_id || executedTrade.id,
        created_at: new Date().toISOString(),
      })
      .catch((e) => {
        console.warn('[WebhookEngine] RealExecutionGateway dispatch notice:', e.message);
      });

    const audit: WebhookAuditLog = {
      id: auditId,
      orderId: payload.order_id || `TV-${Date.now()}`,
      symbol: normalizedSymbol,
      action,
      amount: quantity,
      signalPrice,
      marketPrice: currentMarketPrice,
      latencyMs,
      slippagePercent,
      status: 'EXECUTED',
      brokerAccount: `${activeAccount.name} (${activeAccount.broker.toUpperCase()})`,
      accountType: activeAccount.type,
      reason: `[AUDIT SUCCESS] Ordem preenchida com sucesso! Preço médio: ${currentMarketPrice}, Latência: ${latencyMs}ms, Slippage: ${slippagePercent}%.`,
      timestamp: new Date().toISOString(),
    };

    store.addWebhookAudit(audit);
    store.addLog(
      'TRADE',
      `[WEBHOOK/BRIDGE EXECUTION] Ordem ${direction} ${normalizedSymbol} executada na conta ${activeAccount.name}. Latência: ${latencyMs}ms.`,
      { orderId: payload.order_id, price: currentMarketPrice }
    );

    return { processed: true, status: 'EXECUTED', audit, trade: executedTrade };
  }
}

export const webhookEngine = new WebhookEngine();
