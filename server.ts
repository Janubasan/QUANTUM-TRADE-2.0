import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { store } from './server/data/store.js';
import { validateProfitRule } from './server/engine/profitRule.js';
import { botWorker } from './server/engine/botWorker.js';
import { collectiveService } from './server/services/collective.js';
import { webhookEngine } from './server/services/webhookEngine.js';
import { defaultAuditLogger } from './server/validation/logger.js';
import { defaultAuditRunner } from './server/tester/demoRunner.js';
import { generateMarkdownAuditReport } from './server/tester/reportGenerator.js';
import { defaultTradeScheduler } from './server/regulator/tradeScheduler.js';
import { ALLOWED_TIMEFRAMES, EXCHANGE_RULES } from './server/regulator/marketRules.js';
import { priceAggregatorService } from './server/services/priceAggregator.js';
import { botRegistryService } from './server/services/botRegistry.js';
import { killSwitchService } from './server/services/killSwitchService.js';
import { timeGateService } from './server/services/timeGateService.js';
import { realisticExecutionService } from './server/services/realisticExecutionService.js';
import { runner247Service } from './server/engine/runner247Service.js';
import { firebaseService } from './server/services/firebaseService.js';
import { operationalGuard } from './server/services/operationalGuard.js';
import { Account, Bot, Trade } from './src/types.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Global Kill Switch middleware for execution endpoints (Checks in-memory & Firestore state)
  app.use(async (req, res, next) => {
    if (
      req.path.startsWith('/api/open') ||
      req.path.startsWith('/api/trades/manual') ||
      req.path.startsWith('/api/close') ||
      req.path.startsWith('/api/bot/evaluate') ||
      req.path.startsWith('/webhook/trade') ||
      req.path.startsWith('/api/webhook/trade')
    ) {
      const isFirestoreKilled = await operationalGuard.getKillSwitch();
      if (!killSwitchService.isActive || isFirestoreKilled) {
        return res.status(403).json({
          error: '🛑 Kill Switch Global ATIVO. Todas as operações e ordens estão bloqueadas por compliance.',
          isActive: false,
          killSwitch: true,
        });
      }
    }
    next();
  });

  // --- KILL SWITCH CONTROL ENDPOINTS (Synced with Firestore & Memory) ---
  app.post('/api/killswitch/toggle', async (_req, res) => {
    const status = killSwitchService.toggle();
    // Invert for operationalGuard: status true means system is RUNNING (kill_switch = false)
    await operationalGuard.setKillSwitch(!status);
    store.addLog('INFO', `🔌 Kill Switch Global alterado para: ${status ? 'ATIVO (OPERANDO)' : 'DESATIVADO (BLOQUEADO)'}`);
    res.json({ isActive: status, kill_switch: !status });
  });

  app.get('/api/killswitch/status', async (_req, res) => {
    const firestoreKill = await operationalGuard.getKillSwitch();
    res.json({ isActive: killSwitchService.isActive && !firestoreKill, firestoreKillSwitch: firestoreKill });
  });

  // --- OPERATIONAL GUARD COMPLIANCE ENDPOINTS ---
  app.get('/api/operational-guard/status', async (_req, res) => {
    const firestoreKill = await operationalGuard.getKillSwitch();
    res.json({
      killSwitch: firestoreKill,
      maxOrdersPerHour: operationalGuard.MAX_ORDERS_PER_HOUR,
      dailyProfitLimitPercent: operationalGuard.DAILY_PROFIT_LIMIT_PERCENT,
      slippageRate: operationalGuard.SLIPPAGE_RATE,
      feeRate: operationalGuard.FEE_RATE,
      timeMinSeconds: operationalGuard.TIME_MIN_SECONDS,
      timeMaxSeconds: operationalGuard.TIME_MAX_SECONDS,
    });
  });

  app.post('/api/operational-guard/killswitch', async (req, res) => {
    const { active } = req.body || {};
    const isActive = typeof active === 'boolean' ? active : true;
    await operationalGuard.setKillSwitch(isActive);
    killSwitchService.setActive(!isActive);
    res.json({ success: true, kill_switch: isActive });
  });

  app.post('/api/operational-guard/sign', (req, res) => {
    const { payload, secret } = req.body || {};
    if (!payload || !secret) {
      return res.status(400).json({ error: 'payload e secret são obrigatórios' });
    }
    const signature = operationalGuard.signPayload(payload, secret);
    res.json({ signature });
  });

  // --- TIME GATE LIMITS ENDPOINT ---
  app.get('/api/timegate/limits', (_req, res) => {
    res.json(timeGateService.getLimits());
  });

  // --- REALISTIC EXECUTION SETTINGS ENDPOINT ---
  app.get('/api/realistic/settings', (_req, res) => {
    res.json(realisticExecutionService.getSettings());
  });

  // --- 24/7 RUNNER & FIREBASE CLOUD PERSISTENCE ENDPOINTS ---
  app.get('/api/runner/status', (_req, res) => {
    res.json(runner247Service.getMetrics());
  });

  app.post('/api/runner/toggle', (_req, res) => {
    const isRunning = runner247Service.toggle();
    res.json({ isRunning, metrics: runner247Service.getMetrics() });
  });

  app.post('/api/runner/sync-firebase', async (_req, res) => {
    const syncRes = await runner247Service.syncWithFirebase();
    res.json({ ...syncRes, metrics: runner247Service.getMetrics() });
  });

  app.get('/api/firebase/status', (_req, res) => {
    res.json(firebaseService.getStatus());
  });

  // --- MANUAL OPEN ORDER ENDPOINT WITH TIMEGATE & OPERATIONAL GUARD EXECUTION ---
  app.post('/api/open', async (req, res) => {
    const {
      symbol = 'BTC/BRL',
      side = 'BUY',
      quantity = 0.001,
      tp,
      sl,
      exchange = 'binance',
      accountId = 'acc-demo-1',
      signature,
      secret,
    } = req.body || {};

    try {
      const account = store.getAccount(accountId) || store.getState().accounts[0];
      const ticker = store.getState().tickers[symbol] || store.getState().tickers['BTC/BRL'];
      const rawPrice = ticker ? ticker.price : 345000;

      const tpTarget = tp || (side === 'BUY' ? rawPrice * 1.01 : rawPrice * 0.99);
      const slTarget = sl || (side === 'BUY' ? rawPrice * 0.995 : rawPrice * 1.005);
      const estimatedMs = timeGateService.estimateDuration(rawPrice, tpTarget, slTarget, 0.15);
      const estimatedDurationSeconds = Math.max(60, Math.round(estimatedMs / 1000));

      const isLong = side === 'BUY' || side === 'LONG';
      const direction = isLong ? 'LONG' : 'SHORT';

      // CENTRAL OPERATIONAL GUARD: 7 Compliance Safeguards + Firestore Audit
      const guardResult = await operationalGuard.validateAndPrepare({
        order: {
          account_id: account.id,
          symbol,
          side: isLong ? 'buy' : 'sell',
          quantity: Number(quantity) || 0.001,
          price: rawPrice,
          tpPrice: tpTarget,
          slPrice: slTarget,
          direction,
          estimated_duration_seconds: estimatedDurationSeconds,
        },
        account: {
          id: account.id,
          equity: account.currentBalance || account.initialBalance,
        },
        marketPrice: rawPrice,
        estimatedDurationSeconds,
        integritySignature: signature,
        integritySecret: secret,
      });

      if (!guardResult.approved) {
        return res.status(400).json({
          error: guardResult.reason,
          approved: false,
        });
      }

      const executedPrice = guardResult.order.fill_price || rawPrice;
      const fee = guardResult.order.fee || 0;
      const slippage = guardResult.order.slippage || 0;

      const newTrade: Trade = {
        id: `trd-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        accountId: account.id,
        accountName: account.name,
        broker: account.broker,
        symbol,
        direction,
        entryPrice: executedPrice,
        currentPrice: executedPrice,
        quantity: Number(quantity) || 0.001,
        tpPrice: tpTarget,
        slPrice: slTarget,
        status: 'open',
        pnl: -fee,
        pnlPercent: 0,
        entryTime: new Date().toISOString(),
        botId: 'manual',
        botName: 'Operação Manual (Compliance Guard)',
        notes: `Ordem Validada | Slippage: R$ ${slippage.toFixed(2)} (0.05%) | Fee: R$ ${fee.toFixed(2)} (0.1%) | TimeGate: ${Math.round(estimatedDurationSeconds / 60)} min`,
      };

      store.addTrade(newTrade);
      store.addLog('TRADE', `Ordem manual criada em ${symbol} (${direction} @ R$ ${executedPrice.toFixed(2)}). Guard OK.`);

      res.json({
        success: true,
        trade: newTrade,
        guardOrder: guardResult.order,
        estimatedDurationSeconds,
        executedPrice,
        fee,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao abrir operação.' });
    }
  });

  // Start background bot worker engine & multi-source price aggregator
  botWorker.start();
  priceAggregatorService.start();

  // --- API ROUTES ---

  // Health check (root & api)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'quantum-trade-api', timestamp: new Date().toISOString() });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'quantum-trade-api', timestamp: new Date().toISOString() });
  });

  // --- TRADINGVIEW & EXTERNAL WEBHOOK ENGINE ENDPOINTS ---
  const handleWebhookTrade = async (req: express.Request, res: express.Response) => {
    const payload = req.body || {};
    const receivedAt = Math.floor(Date.now() / 1000);

    // Fast response under 200ms
    res.json({
      status: 'processing',
      order_id: payload.order_id || 'TV_GENERIC',
      received_at: receivedAt,
    });

    // Execute audit and trade in background
    try {
      await webhookEngine.processWebhook(payload);
    } catch (err: any) {
      console.error('Webhook execution error:', err);
    }
  };

  // Support both /webhook/trade and /api/webhook/trade
  app.post('/webhook/trade', handleWebhookTrade);
  app.post('/api/webhook/trade', handleWebhookTrade);

  // Webhook Configuration details
  app.get('/api/webhook/config', (req, res) => {
    const protocol = req.protocol;
    const host = req.get('host') || 'localhost:3000';
    const webhookUrl = `${protocol}://${host}/api/webhook/trade`;

    res.json({
      webhookUrl,
      secret: webhookEngine.getSecretKey(),
      tradingViewTemplate: webhookEngine.getTradingViewTemplate(),
      maxLatencySeconds: 5,
      maxSlippagePercent: 0.5,
    });
  });

  // Webhook Secret Key Update
  app.post('/api/webhook/secret', (req, res) => {
    const { secret } = req.body || {};
    if (!secret || typeof secret !== 'string') {
      return res.status(400).json({ error: 'Forneça um secret válido.' });
    }
    webhookEngine.setSecretKey(secret);
    store.addLog('INFO', `Chave secreta do Webhook atualizada.`);
    res.json({ success: true, secret: webhookEngine.getSecretKey() });
  });

  // Webhook Audit Trail Logs
  app.get('/api/webhook/audits', (_req, res) => {
    res.json(store.getState().webhookAudits);
  });

  // --- DATA VALIDATION & IMMUTABLE AUDIT CHAIN ENDPOINTS ---
  app.get('/api/audit/chain', (_req, res) => {
    const chain = defaultAuditLogger.getChain();
    const isValid = defaultAuditLogger.verifyIntegrity();
    res.json({
      integrityValid: isValid,
      totalBlocks: chain.length,
      headHash: chain.length > 0 ? chain[chain.length - 1].current_hash : null,
      chain,
    });
  });

  app.get('/api/audit/report', (_req, res) => {
    const chain = defaultAuditLogger.getChain();
    const trades = defaultAuditRunner.getSimulatedTrades();
    const markdown = generateMarkdownAuditReport(trades, chain);
    res.json({
      markdown,
      totalBlocks: chain.length,
      integrityValid: defaultAuditLogger.verifyIntegrity(),
    });
  });

  app.post('/api/audit/run-demo', (_req, res) => {
    const result = defaultAuditRunner.runDemoCycle();
    store.addLog('INFO', `Demo Auditado de Ingestão executado. Hash Head: ${result.chainHead.substring(0, 10)}...`);
    res.json(result);
  });

  // --- MARKET REGULATOR & SCHEDULER ENDPOINTS ---
  app.get('/api/regulator/scheduler', (_req, res) => {
    const currentMode = defaultTradeScheduler.getMode();
    res.json({
      mode: currentMode,
      allowedTimeframes: defaultTradeScheduler.getAllowedTimeframes(),
      allAllowedTimeframes: ALLOWED_TIMEFRAMES,
      exchangeRules: EXCHANGE_RULES,
    });
  });

  app.post('/api/regulator/scheduler/mode', (req, res) => {
    const { mode } = req.body || {};
    if (mode !== 'scalp' && mode !== 'normal') {
      res.status(400).json({ error: "Modo inválido. Use 'scalp' ou 'normal'." });
      return;
    }
    defaultTradeScheduler.setMode(mode);
    store.addLog('INFO', `Modo do TradeScheduler alterado para: ${mode.toUpperCase()} (${ALLOWED_TIMEFRAMES[mode as 'scalp' | 'normal'].join(', ')})`);
    res.json({
      success: true,
      mode: defaultTradeScheduler.getMode(),
      allowedTimeframes: defaultTradeScheduler.getAllowedTimeframes(),
    });
  });

  // --- MULTI-SOURCE PRICE AGGREGATOR ENDPOINTS ---
  app.get('/api/price/aggregated/all', (_req, res) => {
    res.json(priceAggregatorService.getAllPriceData());
  });

  app.get('/api/price/aggregated/:symbol', (req, res) => {
    const rawSymbol = decodeURIComponent(req.params.symbol).toUpperCase();
    const formattedSymbol = rawSymbol.includes('/') ? rawSymbol : `${rawSymbol.replace('USDT', '/USDT').replace('BRL', '/BRL')}`;
    const data = priceAggregatorService.getPriceData(formattedSymbol) || priceAggregatorService.getPriceData('BTC/BRL');
    if (data) {
      res.json(data);
    } else {
      res.status(404).json({ error: `Preço agregado não disponível para ${formattedSymbol}` });
    }
  });

  // --- BOT REGISTRY & RANKING ENDPOINTS ---
  app.get('/api/bot/strategies', (_req, res) => {
    res.json(botRegistryService.listStrategies());
  });

  app.get('/api/bot/ranking', (_req, res) => {
    res.json(botRegistryService.getBotRankings());
  });

  app.post('/api/bot/evaluate/:botId', (req, res) => {
    const { botId } = req.params;
    const bot = store.getBot(botId);
    if (!bot) {
      res.status(404).json({ error: 'Bot não encontrado.' });
      return;
    }
    const ticker = store.getState().tickers[bot.config.symbol] || store.getState().tickers['BTC/BRL'];
    const currentPrice = ticker ? ticker.price : 345000;
    const result = botRegistryService.executeBotDecision(bot, currentPrice);
    res.json(result);
  });


  // International Prediction Markets
  app.get('/api/intl/markets', (req, res) => {
    const limit = Number(req.query.limit) || 10;
    const markets = [
      {
        slug: 'btc-price-dec-2026',
        title: 'Will Bitcoin exceed $100k in 2026?',
        category: 'Crypto',
        volume24h: 4250000.5,
        outcomes: ['YES', 'NO'],
        outcomePrices: ['0.68', '0.32'],
      },
      {
        slug: 'eth-pos-upgrade-v2',
        title: 'Ethereum Staking Ratio > 35%',
        category: 'Crypto',
        volume24h: 1820000.0,
        outcomes: ['YES', 'NO'],
        outcomePrices: ['0.54', '0.46'],
      },
      {
        slug: 'fed-interest-rate-decision',
        title: 'Fed Rate Cut in Next Meeting',
        category: 'Macroeconomics',
        volume24h: 8900000.25,
        outcomes: ['YES', 'NO'],
        outcomePrices: ['0.82', '0.18'],
      },
      {
        slug: 'solana-sol-200-q3',
        title: 'Solana (SOL) > $200 by Q3',
        category: 'Crypto',
        volume24h: 2150000.0,
        outcomes: ['YES', 'NO'],
        outcomePrices: ['0.41', '0.59'],
      },
      {
        slug: 'ai-model-benchmark-breakthrough',
        title: 'New Frontier AI Model Pass Benchmark',
        category: 'Tech',
        volume24h: 1200000.75,
        outcomes: ['YES', 'NO'],
        outcomePrices: ['0.75', '0.25'],
      },
    ].slice(0, limit);

    res.json({ success: true, count: markets.length, markets });
  });

  // Complete Signals Set
  app.get('/api/signals/complete-set', (req, res) => {
    const limit = Number(req.query.limit) || 25;
    const signals = Array.from({ length: Math.min(limit, 50) }, (_, i) => ({
      id: `sig-comp-${i + 1}`,
      marketSlug: i % 2 === 0 ? 'btc-price-dec-2026' : 'fed-interest-rate-decision',
      symbol: i % 2 === 0 ? 'BTC/BRL' : 'ETH/BRL',
      timeframe: i % 3 === 0 ? '1m' : '5m',
      strategy: i % 2 === 0 ? 'Quantum M1 Pro Scalper' : 'Kronos Volatility Grid',
      direction: i % 3 === 0 ? 'LONG' : 'SHORT',
      confidenceScore: Number((0.75 + (i % 20) * 0.01).toFixed(2)),
      features: {
        rsi: 30 + (i * 3) % 40,
        emaSpread: Number((0.001 * (i + 1)).toFixed(4)),
        volatilityIdx: 0.018,
      },
      recommendedRiskPercent: 0.5,
      timestamp: new Date(Date.now() - i * 180000).toISOString(),
    }));

    res.json({ success: true, total: signals.length, signals });
  });

  // PMUS Order Preview Endpoint (Simulation / Order Cost Breakdown)
  app.post('/api/pmus/order/preview', (req, res) => {
    const { marketSlug, price, quantity } = req.body || {};

    if (!marketSlug) {
      return res.status(400).json({ error: 'Campo marketSlug é obrigatório.' });
    }

    const unitPrice = parseFloat(price?.value || '0.50');
    const qty = parseInt(quantity || 1, 10);
    const totalCost = Number((unitPrice * qty).toFixed(2));
    const estimatedFee = Number((totalCost * 0.001).toFixed(4));
    const maxPayout = Number((1.0 * qty).toFixed(2));
    const potentialProfit = Number((maxPayout - totalCost - estimatedFee).toFixed(2));

    res.json({
      status: 'PREVIEW_SUCCESS',
      preview: {
        marketSlug,
        side: 'BUY',
        quantity: qty,
        unitPrice: { value: unitPrice.toFixed(2), currency: price?.currency || 'USD' },
        totalCost: { value: totalCost.toFixed(2), currency: price?.currency || 'USD' },
        estimatedFee: { value: estimatedFee.toFixed(4), currency: price?.currency || 'USD' },
        maxPayout: { value: maxPayout.toFixed(2), currency: price?.currency || 'USD' },
        potentialProfit: { value: potentialProfit.toFixed(2), currency: price?.currency || 'USD' },
        executedRealOrder: false,
        message: 'Preview gerado com sucesso. Nenhuma ordem real foi enviada à blockchain.',
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Tickers
  app.get('/api/tickers', (_req, res) => {
    res.json(store.getState().tickers);
  });

  // Accounts
  app.get('/api/accounts', (_req, res) => {
    res.json(store.getState().accounts);
  });

  app.post('/api/accounts', (req, res) => {
    const { name, broker, type, initialBalance, baseCurrency, apiKeyEncrypted, apiSecretEncrypted } = req.body;
    const balance = Number(initialBalance) || (type === 'demo' ? 100 : 500);

    const newAccount: Account = {
      id: `acc-${Date.now()}`,
      name: name || `Conta ${broker.toUpperCase()}`,
      broker: broker || 'binance',
      type: type || 'demo',
      initialBalance: balance,
      currentBalance: balance,
      baseCurrency: baseCurrency || 'BRL',
      apiKeyEncrypted: apiKeyEncrypted ? `AES256:${apiKeyEncrypted.slice(0, 6)}...` : undefined,
      apiSecretEncrypted: apiSecretEncrypted ? `AES256:${apiSecretEncrypted.slice(0, 6)}...` : undefined,
      isActive: true,
      createdAt: new Date().toISOString(),
      totalTrades: 0,
      winningTrades: 0,
      pnlTotal: 0,
    };

    store.addAccount(newAccount);
    store.addLog('INFO', `Nova conta criada: ${newAccount.name} (${newAccount.type.toUpperCase()} - ${newAccount.broker.toUpperCase()}).`);
    res.json(newAccount);
  });

  app.post('/api/accounts/:id/reset', (req, res) => {
    const account = store.getAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    account.initialBalance = 100.0;
    account.currentBalance = 100.0;
    account.pnlTotal = 0.0;
    account.totalTrades = 0;
    account.winningTrades = 0;
    store.updateAccount(account);

    store.addLog('INFO', `Conta ${account.name} resetada para R$ 100,00 inicial.`);
    res.json(account);
  });

  app.post('/api/store/reset', (_req, res) => {
    store.resetDataStore();
    res.json({ success: true, message: 'Plataforma e contas resetadas com sucesso para banca inicial limpa.' });
  });

  app.delete('/api/accounts/:id', (req, res) => {
    store.deleteAccount(req.params.id);
    res.json({ success: true });
  });

  // Trades
  app.get('/api/trades', (_req, res) => {
    res.json(store.getState().trades);
  });

  app.post('/api/trades/manual', async (req, res) => {
    const { accountId, symbol, direction, riskPercent, tpRatio, slRatio, signature, secret } = req.body;

    const account = store.getAccount(accountId);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    const risk = Number(riskPercent) || 0.5;
    const validation = validateProfitRule(account, risk);

    if (!validation.allowed) {
      return res.status(400).json({
        error: validation.reason,
        validation,
      });
    }

    const ticker = store.getState().tickers[symbol] || store.getState().tickers['BTC/BRL'];
    const currentPrice = ticker.price;
    const isLong = direction === 'LONG';

    const tp = isLong
      ? Number((currentPrice * (1 + 0.01 * (tpRatio || 2))).toFixed(2))
      : Number((currentPrice * (1 - 0.01 * (tpRatio || 2))).toFixed(2));

    const sl = isLong
      ? Number((currentPrice * (1 - 0.01 * (slRatio || 1))).toFixed(2))
      : Number((currentPrice * (1 + 0.01 * (slRatio || 1))).toFixed(2));

    const quantity = Number((validation.riskAmount / Math.abs(currentPrice - sl)).toFixed(6)) || 0.0001;
    const estimatedDurationSeconds = Math.max(60, Math.round(timeGateService.estimateDuration(currentPrice, tp, sl, 0.15) / 1000));

    // OperationalGuard 7 compliance gates & Firestore persistence
    const guardRes = await operationalGuard.validateAndPrepare({
      order: {
        account_id: account.id,
        symbol: symbol || 'BTC/BRL',
        side: isLong ? 'buy' : 'sell',
        quantity,
        price: currentPrice,
        tpPrice: tp,
        slPrice: sl,
        direction: isLong ? 'LONG' : 'SHORT',
        estimated_duration_seconds: estimatedDurationSeconds,
      },
      account: {
        id: account.id,
        equity: account.currentBalance || account.initialBalance,
      },
      marketPrice: currentPrice,
      estimatedDurationSeconds,
      integritySignature: signature,
      integritySecret: secret,
    });

    if (!guardRes.approved) {
      return res.status(400).json({
        error: guardRes.reason,
        approved: false,
      });
    }

    const entryPrice = guardRes.order.fill_price || currentPrice;
    const fee = guardRes.order.fee || 0;
    const slippage = guardRes.order.slippage || 0;

    const manualTrade: Trade = {
      id: `trd-m-${Date.now()}`,
      accountId: account.id,
      accountName: account.name,
      broker: account.broker,
      symbol: symbol || 'BTC/BRL',
      direction: isLong ? 'LONG' : 'SHORT',
      entryPrice,
      currentPrice: entryPrice,
      quantity,
      tpPrice: tp,
      slPrice: sl,
      status: 'open',
      pnl: -fee,
      pnlPercent: 0,
      entryTime: new Date().toISOString(),
      notes: `Operação manual aprovada (${validation.reason}) | Slippage: R$ ${slippage.toFixed(2)} | Fee: R$ ${fee.toFixed(2)}`,
    };

    store.addTrade(manualTrade);
    store.addLog('TRADE', `Trade manual aberto por usuário na conta ${account.name} (${direction} ${symbol}).`);
    res.json(manualTrade);
  });

  app.post('/api/trades/:id/close', (req, res) => {
    const state = store.getState();
    const trade = state.trades.find((t) => t.id === req.params.id);
    if (!trade || trade.status !== 'open') {
      return res.status(400).json({ error: 'Operação não encontrada ou já encerrada.' });
    }

    trade.status = 'closed';
    trade.closeTime = new Date().toISOString();

    const account = store.getAccount(trade.accountId);
    if (account) {
      account.currentBalance = Number((account.currentBalance + trade.pnl).toFixed(2));
      account.pnlTotal = Number((account.pnlTotal + trade.pnl).toFixed(2));
      if (trade.pnl > 0) account.winningTrades += 1;
      account.totalTrades += 1;
      store.updateAccount(account);
    }

    store.updateTrade(trade);
    store.addLog('TRADE', `Operação ${trade.symbol} encerrada manualmente. PnL: R$ ${trade.pnl.toFixed(2)}.`);
    res.json(trade);
  });

  // Bots
  app.get('/api/bots', (_req, res) => {
    res.json(store.getState().bots);
  });

  app.post('/api/bots', (req, res) => {
    const { accountId, name, strategy, symbol, timeframe, riskPercent, tpRatio, slRatio } = req.body;

    const account = store.getAccount(accountId);
    if (!account) return res.status(404).json({ error: 'Conta selecionada não existe.' });

    const newBot: Bot = {
      id: `bot-${Date.now()}`,
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      name: name || `Bot Quântico ${strategy.toUpperCase()}`,
      strategy: strategy || 'm1_pro',
      config: {
        symbol: symbol || 'BTC/BRL',
        timeframe: timeframe || '5m',
        riskPercent: Number(riskPercent) || 0.5,
        tpRatio: Number(tpRatio) || 2.0,
        slRatio: Number(slRatio) || 1.0,
      },
      status: 'running',
      createdAt: new Date().toISOString(),
      totalTrades: 0,
      pnlTotal: 0,
      winRate: 0,
      lastLog: 'Bot inicializado e monitorando o mercado.',
    };

    store.addBot(newBot);
    store.addLog('BOT', `Novo Bot Quântico criado: ${newBot.name} na conta ${account.name}.`);
    res.json(newBot);
  });

  app.post('/api/bots/:id/toggle', (req, res) => {
    const bot = store.getBot(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot não encontrado.' });

    bot.status = bot.status === 'running' ? 'paused' : 'running';
    bot.lastLog = `Status alterado para: ${bot.status.toUpperCase()}`;
    store.updateBot(bot);

    store.addLog('BOT', `Bot ${bot.name} ${bot.status === 'running' ? 'ativado' : 'pausado'}.`);
    res.json(bot);
  });

  app.post('/api/bots/toggle-all', (req, res) => {
    const { running } = req.body || {};
    const isRunning = typeof running === 'boolean' ? running : true;
    store.toggleAllBots(isRunning);
    store.addLog('BOT', `Controle Global: Todos os bots foram ${isRunning ? 'LIGADOS' : 'DESLIGADOS'}.`);
    res.json({ success: true, running: isRunning, bots: store.getState().bots });
  });

  app.delete('/api/bots/:id', (req, res) => {
    store.deleteBot(req.params.id);
    res.json({ success: true });
  });

  // Collective Intelligence & Backtesting
  app.get('/api/collective/entanglement', (_req, res) => {
    res.json(collectiveService.getEntanglementData());
  });

  app.post('/api/collective/backtest', (req, res) => {
    const result = collectiveService.runBacktest(req.body);
    res.json(result);
  });

  // System Logs
  app.get('/api/logs', (_req, res) => {
    res.json(store.getState().logs);
  });

  // Server-Sent Events (SSE) Stream for real-time dashboard updates
  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendUpdate = () => {
      const state = store.getState();
      res.write(`data: ${JSON.stringify(state)}\n\n`);
    };

    sendUpdate();
    const interval = setInterval(sendUpdate, 2000);

    req.on('close', () => {
      clearInterval(interval);
    });
  });

  // --- API 404 & ERROR HANDLING ---
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Endpoint de API não encontrado.' });
  });

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API Server Error:', err);
    res.status(500).json({ error: err?.message || 'Erro interno no servidor.' });
  });

  // --- VITE / PRODUCTION STATIC MIDDLEWARE ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Quantum Trade Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
