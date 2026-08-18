import { Express, Request, Response } from 'express';
import { store } from '../data/store.js';
import { credentialVault } from '../services/credentialVault.js';
import { brokerAudit } from '../services/brokerAudit.js';
import { mt5Bridge } from '../adapters/mt5/mt5Bridge.js';
import { proftBridge } from '../adapters/proft/proftBridge.js';
import { executeTradeOnVenue, integrationSnapshot, shouldRouteToVenue } from '../services/brokerExecutionService.js';
import { assertEnvironmentAllowed } from '../config/venuePolicy.js';
import { Account, Trade } from '../../src/types.js';

function extractBearer(req: Request): string {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return String(req.headers['x-bridge-token'] || req.body?.token || req.query.token || '');
}

function authorizeBridge(req: Request, res: Response): Account | null {
  const accountId = String(req.body?.accountId || req.query.accountId || req.headers['x-account-id'] || '');
  if (!accountId) {
    res.status(400).json({ error: 'accountId obrigatório' });
    return null;
  }
  const account = store.getAccount(accountId);
  if (!account) {
    res.status(404).json({ error: 'Conta não encontrada' });
    return null;
  }
  const token = extractBearer(req);
  if (!credentialVault.verifyBridgeToken(accountId, token)) {
    res.status(401).json({ error: 'Bridge token inválido' });
    return null;
  }
  return account;
}

export function registerBrokerBridgeRoutes(app: Express) {
  app.get('/api/integrations/status', (_req, res) => {
    res.json(integrationSnapshot());
  });

  app.get('/api/integrations/audit', (req, res) => {
    const accountId = String(req.query.accountId || '');
    res.json(accountId ? brokerAudit.byAccount(accountId) : brokerAudit.list());
  });

  app.post('/api/accounts/:id/bridge-token', (req, res) => {
    const account = store.getAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
    const issued = credentialVault.generateBridgeToken();
    credentialVault.merge(account.id, { bridgeTokenHash: issued.hash });
    account.bridgeTokenHint = issued.hint;
    store.updateAccount(account);
    store.addLog('INFO', `Novo bridge token emitido para ${account.name} (...${issued.hint})`);
    res.json({
      accountId: account.id,
      token: issued.token,
      hint: issued.hint,
      warning: 'Guarde este token. Ele não será exibido novamente.',
    });
  });

  app.post('/api/accounts/:id/routing', (req, res) => {
    const account = store.getAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
    const { routeToVenue, allowLiveExecution, venueEnvironment } = req.body || {};
    if (typeof routeToVenue === 'boolean') account.routeToVenue = routeToVenue;
    if (venueEnvironment === 'demo' || venueEnvironment === 'live') {
      const check = assertEnvironmentAllowed({
        requested: venueEnvironment,
        accountType: account.type,
        allowLiveExecution: Boolean(allowLiveExecution || account.allowLiveExecution),
      });
      if (!check.ok && venueEnvironment === 'live') {
        return res.status(400).json({ error: check.reason });
      }
      account.venueEnvironment = check.environment;
    }
    if (typeof allowLiveExecution === 'boolean') {
      if (allowLiveExecution && process.env.ALLOW_LIVE_TRADING !== 'true') {
        return res.status(400).json({
          error: 'ALLOW_LIVE_TRADING=true é obrigatório no servidor para promover live.',
        });
      }
      account.allowLiveExecution = allowLiveExecution;
    }
    store.updateAccount(account);
    res.json(account);
  });

  app.post('/api/integrations/test-order', async (req, res) => {
    const { accountId, symbol = 'EURUSD', direction = 'LONG', quantity = 0.01 } = req.body || {};
    const account = store.getAccount(accountId);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
    if (!shouldRouteToVenue(account)) {
      return res.status(400).json({ error: 'Ative routeToVenue nesta conta MT5/Proft.' });
    }
    const ticker = store.getState().tickers[symbol] || store.getState().tickers['EUR/USD'];
    const price = ticker?.price || 1.08;
    const trade: Trade = {
      id: `trd-test-${Date.now()}`,
      accountId: account.id,
      accountName: account.name,
      broker: account.broker,
      symbol,
      direction: direction === 'SHORT' ? 'SHORT' : 'LONG',
      entryPrice: price,
      currentPrice: price,
      quantity: Number(quantity) || 0.01,
      tpPrice: direction === 'SHORT' ? price * 0.995 : price * 1.005,
      slPrice: direction === 'SHORT' ? price * 1.003 : price * 0.997,
      status: 'pending',
      pnl: 0,
      pnlPercent: 0,
      entryTime: new Date().toISOString(),
      botName: 'Teste Auditado Demo',
      notes: 'Ordem de teste demo → venue real',
      executionMode: 'venue',
      venueStatus: 'queued',
    };
    store.addTrade(trade);
    const executed = await executeTradeOnVenue(account, trade);
    res.json({ trade: executed, snapshot: integrationSnapshot() });
  });

  const heartbeatHandler = (venue: 'mt5' | 'proft') => (req: Request, res: Response) => {
    const account = authorizeBridge(req, res);
    if (!account) return;
    const body = req.body || {};
    const payload = { ...body, accountId: account.id };
    const session = venue === 'mt5' ? mt5Bridge.heartbeat(payload) : proftBridge.heartbeat(payload);
    res.json({ ok: true, session, serverTime: new Date().toISOString() });
  };

  const commandsHandler = (venue: 'mt5' | 'proft') => (req: Request, res: Response) => {
    const account = authorizeBridge(req, res);
    if (!account) return;
    const commands = venue === 'mt5' ? mt5Bridge.pullCommands(account.id) : proftBridge.pullCommands(account.id);
    res.json({ commands, serverTime: new Date().toISOString() });
  };

  const reportHandler = (venue: 'mt5' | 'proft') => (req: Request, res: Response) => {
    const account = authorizeBridge(req, res);
    if (!account) return;
    const body = { ...(req.body || {}), accountId: account.id };
    const cmd = venue === 'mt5' ? mt5Bridge.report(body) : proftBridge.report(body);
    if (!cmd) return res.status(404).json({ error: 'commandId desconhecido' });
    res.json({ ok: true, command: cmd });
  };

  app.post('/api/mt5/bridge/heartbeat', heartbeatHandler('mt5'));
  app.get('/api/mt5/bridge/commands', commandsHandler('mt5'));
  app.post('/api/mt5/bridge/commands', commandsHandler('mt5'));
  app.post('/api/mt5/bridge/report', reportHandler('mt5'));

  app.post('/api/proft/bridge/heartbeat', heartbeatHandler('proft'));
  app.get('/api/proft/bridge/commands', commandsHandler('proft'));
  app.post('/api/proft/bridge/commands', commandsHandler('proft'));
  app.post('/api/proft/bridge/report', reportHandler('proft'));
}
