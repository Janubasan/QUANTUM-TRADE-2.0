import { Account, Trade } from '../../src/types.js';
import { store } from '../data/store.js';
import { BrokerAdapterFactory } from '../adapters/brokerAdapters.js';
import { Mt5Adapter } from '../adapters/mt5/mt5Adapter.js';
import { ProftAdapter } from '../adapters/proft/proftAdapter.js';
import { mt5Bridge } from '../adapters/mt5/mt5Bridge.js';
import { proftBridge } from '../adapters/proft/proftBridge.js';
import { brokerAudit } from './brokerAudit.js';
import { assertEnvironmentAllowed } from '../config/venuePolicy.js';
import { credentialVault } from './credentialVault.js';

export function shouldRouteToVenue(account: Account): boolean {
  return Boolean(account.routeToVenue && BrokerAdapterFactory.isVenueBroker(account.broker));
}

export function venueOnline(account: Account): boolean {
  if (account.broker === 'mt5') return mt5Bridge.isOnline(account.id);
  if (account.broker === 'proft') return proftBridge.isOnline(account.id);
  return false;
}

export async function executeTradeOnVenue(account: Account, trade: Trade): Promise<Trade> {
  const envCheck = assertEnvironmentAllowed({
    requested: account.venueEnvironment === 'live' ? 'live' : 'demo',
    accountType: account.type,
    allowLiveExecution: account.allowLiveExecution,
  });

  if (!envCheck.ok) {
    trade.status = 'rejected';
    trade.venueStatus = 'rejected';
    trade.notes = `${trade.notes || ''} | ${envCheck.reason}`;
    store.updateTrade(trade);
    brokerAudit.append({
      accountId: account.id,
      venue: account.broker,
      environment: 'demo',
      stage: 'live_blocked',
      symbol: trade.symbol,
      payload: { reason: envCheck.reason, tradeId: trade.id },
    });
    return trade;
  }

  trade.executionMode = 'venue';
  trade.status = 'pending';
  trade.venueStatus = 'queued';
  store.updateTrade(trade);

  const secrets = credentialVault.get(account.id);
  const adapter = BrokerAdapterFactory.getAdapter(account.broker);
  const result = await adapter.createOrder(
    {
      symbol: trade.symbol,
      direction: trade.direction,
      quantity: trade.quantity,
      price: trade.entryPrice,
      tpPrice: trade.tpPrice,
      slPrice: trade.slPrice,
      accountId: account.id,
      tradeId: trade.id,
      comment: `QT2 ${trade.id}`,
    },
    secrets?.apiKey,
    secrets?.apiSecret
  );

  trade.venueCommandId = result.orderId;
  trade.venueRaw = result.rawResponse;
  if (result.status === 'rejected') {
    trade.status = 'rejected';
    trade.venueStatus = 'rejected';
    trade.notes = `${trade.notes || ''} | Venue reject: ${JSON.stringify(result.rawResponse)}`;
  } else if (result.status === 'filled') {
    trade.status = 'open';
    trade.venueStatus = 'filled';
    trade.entryPrice = result.executedPrice || trade.entryPrice;
    trade.currentPrice = trade.entryPrice;
    trade.venueFillPrice = trade.entryPrice;
  } else {
    trade.status = 'pending';
    trade.venueStatus = 'queued';
  }
  store.updateTrade(trade);

  brokerAudit.append({
    accountId: account.id,
    venue: account.broker,
    environment: envCheck.environment,
    stage: `venue_${result.status}`,
    symbol: trade.symbol,
    payload: {
      tradeId: trade.id,
      orderId: result.orderId,
      raw: result.rawResponse || {},
    },
  });

  store.addLog(
    result.status === 'rejected' ? 'ERROR' : 'TRADE',
    `${account.broker.toUpperCase()} ${envCheck.environment}: ordem ${trade.symbol} ${result.status} (${trade.id})`
  );
  return trade;
}

export async function closeTradeOnVenue(account: Account, trade: Trade): Promise<Trade> {
  if (!shouldRouteToVenue(account) || trade.executionMode !== 'venue') {
    return trade;
  }
  const adapter = BrokerAdapterFactory.getAdapter(account.broker);
  if (account.broker === 'mt5' && adapter instanceof Mt5Adapter) {
    await adapter.closePosition({
      accountId: account.id,
      symbol: trade.symbol,
      ticket: trade.brokerTicket,
      volume: trade.quantity,
      tradeId: trade.id,
      direction: trade.direction,
    });
  } else if (account.broker === 'proft' && adapter instanceof ProftAdapter) {
    await adapter.closePosition({
      accountId: account.id,
      symbol: trade.symbol,
      ticket: trade.brokerTicket,
      volume: trade.quantity,
      tradeId: trade.id,
      direction: trade.direction,
    });
  }
  trade.venueStatus = 'queued';
  trade.notes = `${trade.notes || ''} | Close enviado à venue`;
  store.updateTrade(trade);
  return trade;
}

export function integrationSnapshot() {
  return {
    liveTradingEnabled: process.env.ALLOW_LIVE_TRADING === 'true',
    defaultEnvironment: process.env.DEFAULT_VENUE_ENV === 'live' ? 'live' : 'demo',
    proftRestConfigured: Boolean(process.env.PROFT_API_BASE_URL && process.env.PROFT_API_KEY),
    mt5: {
      sessions: mt5Bridge.listSessions(),
      commands: mt5Bridge.listCommands().slice(0, 50),
    },
    proft: {
      sessions: proftBridge.listSessions(),
      commands: proftBridge.listCommands().slice(0, 50),
    },
    auditHead: brokerAudit.list(1)[0] || null,
    events: brokerAudit.list(80),
    bootstrapTokens: process.env.NODE_ENV === 'production' ? undefined : store.issuedDemoTokens,
  };
}
