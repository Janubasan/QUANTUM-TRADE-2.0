import { store } from '../data/store.js';
import { validateProfitRule } from '../engine/profitRule.js';
import { Trade, WebhookAuditLog, Account } from '../../src/types.js';
import { defaultSigner } from '../validation/signer.js';
import { defaultVerifier } from '../validation/verifier.js';
import { executeTradeOnVenue, shouldRouteToVenue } from './brokerExecutionService.js';

export interface SignalPayload {
  secret: string;
  symbol: string;
  action: 'buy' | 'sell';
  amount: number;
  price: number;
  timestamp: number; // Unix timestamp in seconds
  order_id: string;
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

  async processWebhook(payload: SignalPayload): Promise<{
    processed: boolean;
    status: string;
    audit: WebhookAuditLog;
  }> {
    const currentTimeSec = Math.floor(Date.now() / 1000);
    const latencyMs = Math.max(0, Math.abs(currentTimeSec - (payload.timestamp || currentTimeSec)) * 1000);

    const auditId = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const normalizedSymbol = payload.symbol ? payload.symbol.toUpperCase().replace('_', '/') : 'BTC/BRL';
    const action = (payload.action || 'buy').toLowerCase() as 'buy' | 'sell';

    // 1. Authenticate Secret Key
    if (payload.secret !== this.secretKey) {
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
        reason: '[SECURITY REJECTED] Secret de autenticação do webhook inválido.',
        timestamp: new Date().toISOString(),
      };
      store.addWebhookAudit(audit);
      store.addLog('ERROR', `[SECURITY] Tentativa de acesso não autorizada ao Webhook. Secret inválido. ID: ${payload.order_id}`);
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
      // Clean old order IDs if set grows too large
      if (this.seenOrderIds.size > 1000) {
        this.seenOrderIds.clear();
      }
    }

    // 3. Stale Signal Check (Threshold: max 5 seconds delay)
    if (Math.abs(currentTimeSec - payload.timestamp) > 5) {
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
        reason: `[AUDIT REJECTED] Sinal expirado/ruído de mercado (Latência: ${latencyMs}ms > 5000ms).`,
        timestamp: new Date().toISOString(),
      };
      store.addWebhookAudit(audit);
      store.addLog('RULE', `[AUDIT REJECTED] Sinal expirado detectado (${latencyMs}ms atraso). ID: ${payload.order_id}`);
      return { processed: false, status: 'REJECTED_STALE', audit };
    }

    // 4. Market Price Lookup & Slippage Control (Max 0.5%)
    const state = store.getState();
    const ticker = state.tickers[normalizedSymbol] || state.tickers['BTC/BRL'] || state.tickers['BTC/USDT'];
    const currentMarketPrice = ticker ? ticker.price : (payload.price || 100);
    const signalPrice = payload.price || currentMarketPrice;

    const slippageRatio = Math.abs(currentMarketPrice - signalPrice) / (signalPrice || 1);
    const slippagePercent = Number((slippageRatio * 100).toFixed(3));

    if (slippageRatio > 0.005) { // 0.5% max slippage
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
        reason: `[AUDIT REJECTED] Slippage excessivo (${slippagePercent}% > 0.50%). Preço Sinal: ${signalPrice}, Mercado: ${currentMarketPrice}.`,
        timestamp: new Date().toISOString(),
      };
      store.addWebhookAudit(audit);
      store.addLog('RULE', `[AUDIT REJECTED] Slippage excessivo (${slippagePercent}%). Sinal cancelado.`);
      return { processed: false, status: 'REJECTED_SLIPPAGE', audit };
    }

    // 5. Select target account (Prefer active Real/Demo account)
    const activeAccount =
      state.accounts.find((a) => a.isActive && shouldRouteToVenue(a) && a.connectionStatus === 'online') ||
      state.accounts.find((a) => a.isActive && shouldRouteToVenue(a)) ||
      state.accounts.find((a) => a.isActive) ||
      state.accounts[0];
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

    // Validate Profit Rule / Available Risk
    const validation = validateProfitRule(activeAccount, 0.5);

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
      notes: `Ordem executada via Webhook TV (${payload.order_id}). Latência: ${latencyMs}ms, Slippage: ${slippagePercent}%`,
      executionMode: shouldRouteToVenue(activeAccount) ? 'venue' : 'simulated',
      venueStatus: shouldRouteToVenue(activeAccount) ? 'queued' : undefined,
    };

    store.addTrade(executedTrade);
    if (shouldRouteToVenue(activeAccount)) {
      await executeTradeOnVenue(activeAccount, executedTrade);
    }

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
      status: shouldRouteToVenue(activeAccount) ? 'QUEUED_VENUE' : 'EXECUTED',
      brokerAccount: `${activeAccount.name} (${activeAccount.broker.toUpperCase()})`,
      accountType: activeAccount.type,
      reason: shouldRouteToVenue(activeAccount)
        ? `[AUDIT QUEUED] Ordem enviada à venue ${activeAccount.broker.toUpperCase()} (pendente de fill real).`
        : `[AUDIT SUCCESS] Ordem simulada. Preço médio: ${currentMarketPrice}, Latência: ${latencyMs}ms.`,
      timestamp: new Date().toISOString(),
    };

    store.addWebhookAudit(audit);
    store.addLog(
      'TRADE',
      `[WEBHOOK] Ordem ${direction} ${normalizedSymbol} na conta ${activeAccount.name}. Latência: ${latencyMs}ms.`,
      { orderId: payload.order_id, price: currentMarketPrice }
    );

    return { processed: true, status: audit.status, audit };
  }
}

export const webhookEngine = new WebhookEngine();
