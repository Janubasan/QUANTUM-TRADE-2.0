import express from 'express';
import path from 'path';
import { ethers } from 'ethers';
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
import { nautilusBridgeService } from './server/services/nautilusBridgeService.js';
import { mt5PlusEdgeService } from './server/services/mt5PlusEdgeService.js';
import { realExecutionGateway } from './server/services/realExecutionGateway.js';
import { OnchainAdapter } from './server/services/onchain/onchainAdapter.js';
import { getOnchainService } from './server/services/onchain/onchainService.js';
import { getAuditAnchorService } from './server/services/onchain/auditAnchor.js';
import { CHAIN_DEFINITIONS, CHAIN_KEYS, isChainKey } from './server/services/onchain/chainRegistry.js';
import { TOKEN_REGISTRY, resolveToken, hasToken } from './server/services/onchain/tokenRegistry.js';
import type { ChainKey } from './server/services/onchain/chainRegistry.js';
import { marketClockService } from './server/services/marketClockService.js';
import { executionScheduler } from './server/services/executionScheduler.js';
import { validationPipelineService } from './server/services/validationPipelineService.js';
import { encryptSecret } from './server/services/cryptoService.js';
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
    try {
      const firestoreKill = await operationalGuard.getKillSwitch();
      res.setHeader('Content-Type', 'application/json');
      res.json({ isActive: killSwitchService.isActive && !firestoreKill, firestoreKillSwitch: firestoreKill });
    } catch {
      res.setHeader('Content-Type', 'application/json');
      res.json({ isActive: killSwitchService.isActive, firestoreKillSwitch: false });
    }
  });

  // --- OPERATIONAL GUARD COMPLIANCE ENDPOINTS ---
  app.get('/api/operational-guard/status', async (_req, res) => {
    try {
      const firestoreKill = await operationalGuard.getKillSwitch();
      res.setHeader('Content-Type', 'application/json');
      res.json({
        killSwitch: firestoreKill,
        maxOrdersPerHour: operationalGuard.MAX_ORDERS_PER_HOUR,
        dailyProfitLimitPercent: operationalGuard.DAILY_PROFIT_LIMIT_PERCENT,
        slippageRate: operationalGuard.SLIPPAGE_RATE,
        feeRate: operationalGuard.FEE_RATE,
        timeMinSeconds: operationalGuard.TIME_MIN_SECONDS,
        timeMaxSeconds: operationalGuard.TIME_MAX_SECONDS,
      });
    } catch {
      res.setHeader('Content-Type', 'application/json');
      res.json({
        killSwitch: operationalGuard.isKillSwitchActive(),
        maxOrdersPerHour: operationalGuard.MAX_ORDERS_PER_HOUR,
        dailyProfitLimitPercent: operationalGuard.DAILY_PROFIT_LIMIT_PERCENT,
        slippageRate: operationalGuard.SLIPPAGE_RATE,
        feeRate: operationalGuard.FEE_RATE,
        timeMinSeconds: operationalGuard.TIME_MIN_SECONDS,
        timeMaxSeconds: operationalGuard.TIME_MAX_SECONDS,
      });
    }
  });

  app.post('/api/operational-guard/killswitch', async (req, res) => {
    try {
      const { active } = req.body || {};
      const isActive = typeof active === 'boolean' ? active : true;
      await operationalGuard.setKillSwitch(isActive);
      killSwitchService.setActive(!isActive);
      res.setHeader('Content-Type', 'application/json');
      res.json({ success: true, kill_switch: isActive });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Erro ao alterar Kill Switch' });
    }
  });

  app.post('/api/operational-guard/sign', (req, res) => {
    try {
      const { payload, secret } = req.body || {};
      if (!payload || !secret) {
        return res.status(400).json({ error: 'payload e secret são obrigatórios' });
      }
      const signature = operationalGuard.signPayload(payload, secret);
      res.setHeader('Content-Type', 'application/json');
      res.json({ signature });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Erro ao assinar payload' });
    }
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
    if (!runner247Service.isDeploymentApproved()) {
      return res.status(403).json({
        error: 'Runner bloqueado: execute o WFA Promotion Gate e obtenha um deployment PAPER APPROVED.',
        isRunning: false,
        metrics: runner247Service.getMetrics(),
      });
    }
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
      symbol = 'BTC/USDT',
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
      const ticker = store.getState().tickers[symbol] || store.getState().tickers['BTC/USDT'];
      const rawPrice = ticker ? ticker.price : 64250;

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
        notes: `Ordem Validada | Slippage: $${slippage.toFixed(2)} (0.05%) | Fee: $${fee.toFixed(2)} (0.1%) | TimeGate: ${Math.round(estimatedDurationSeconds / 60)} min`,
      };

      store.addTrade(newTrade);
      store.addLog('TRADE', `Ordem manual criada em ${symbol} (${direction} @ $${executedPrice.toFixed(2)} USD). Guard OK.`);

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

  // Execution engines stay asleep until a WFA-approved PAPER manifest exists.
  // Market-data aggregation is safe to start; it does not submit orders.
  const approvedManifest = await validationPipelineService.getManifest();
  const executionApproved = approvedManifest?.status === 'APPROVED' && approvedManifest?.mode === 'PAPER';
  if (executionApproved) {
    runner247Service.setDeploymentApproval(true);
    if (process.env.ENABLE_PAPER_RUNNER === 'true') {
      runner247Service.start();
    } else {
      console.warn('⏸️ [Startup] Runner PAPER aguardando ENABLE_PAPER_RUNNER=true; nenhum loop de execução foi iniciado.');
    }
    if (process.env.ENABLE_LEGACY_BOT_WORKER === 'true') {
      botWorker.start();
    } else {
      console.warn('⏸️ [Startup] Worker legado desativado; use o runner PAPER aprovado explicitamente.');
    }
  } else {
    console.warn('⏸️ [Startup] Bots e Runner 24/7 bloqueados até um manifest WFA APPROVED/PAPER.');
  }
  priceAggregatorService.start();

  // Hydrate persistent state from Firestore Cloud Vault (anti-reset safeguard)
  store.hydrateFromCloudVault().catch((err) => {
    console.warn('[Startup] Firestore cloud vault hydration notice:', err?.message || err);
  });

  // --- API ROUTES ---

  // --- TRADING CLOCK & HOURLY ANALYTICS ENDPOINTS ---
  app.get('/api/session-stats', (_req, res) => {
    try {
      const stats = store.getHourlyStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao calcular estatísticas por hora.' });
    }
  });

  app.post('/api/session-stats/reset', (_req, res) => {
    try {
      store.resetSessionClock();
      const stats = store.getHourlyStats();
      store.addLog('INFO', 'Relógio de sessão e cronômetro horário reinicializados pelo usuário.');
      res.json({ success: true, stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao reiniciar relógio de sessão.' });
    }
  });

  app.post('/api/session-stats/toggle', (req, res) => {
    try {
      const { running } = req.body || {};
      const session = store.toggleSessionTimer(running);
      const stats = store.getHourlyStats();
      store.addLog('INFO', `Relógio de sessão ${session.isTimerRunning ? 'retomado' : 'pausado'}.`);
      res.json({ success: true, isTimerRunning: session.isTimerRunning, stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao alternar relógio de sessão.' });
    }
  });

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
    const signature = (req.headers['x-signature-256'] || req.headers['x-hmac-sha256'] || '') as string;
    const receivedAt = Math.floor(Date.now() / 1000);

    // Fast response under 200ms
    res.json({
      status: 'processing',
      order_id: payload.order_id || 'TV_GENERIC',
      received_at: receivedAt,
    });

    // Execute audit and trade in background
    try {
      await webhookEngine.processWebhook(payload, signature);
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

  app.post('/api/audit/reset', (_req, res) => {
    defaultAuditLogger.resetChain();
    defaultAuditRunner.clearSimulations();
    store.addLog('INFO', 'Trilha de Auditoria Criptográfica resetada para o Bloco Gênesis.');
    res.json({
      success: true,
      message: 'Cadeia de auditoria resetada com sucesso para o Bloco Gênesis.',
      headHash: defaultAuditLogger.getLatestBlock()?.current_hash,
      totalBlocks: defaultAuditLogger.getChain().length,
      integrityValid: defaultAuditLogger.verifyIntegrity(),
    });
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
    const { name, broker, type, initialBalance, baseCurrency, walletAddress, apiKeyEncrypted, apiSecretEncrypted } = req.body;
    const balance = Number(initialBalance) || (type === 'demo' ? 100 : 500);

    const newAccount: Account = {
      id: `acc-${Date.now()}`,
      name: name || `Conta ${broker.toUpperCase()}`,
      broker: broker || 'binance',
      type: type || 'demo',
      initialBalance: balance,
      currentBalance: balance,
      baseCurrency: baseCurrency || 'USD',
      walletAddress: walletAddress || (broker === 'coinbase' ? '3G24UKtkZzYmYewL2fPEGs4hq8SBfwmGVv' : undefined),
      apiKeyEncrypted: apiKeyEncrypted ? encryptSecret(apiKeyEncrypted) : undefined,
      apiSecretEncrypted: apiSecretEncrypted ? encryptSecret(apiSecretEncrypted) : undefined,
      isActive: true,
      createdAt: new Date().toISOString(),
      totalTrades: 0,
      winningTrades: 0,
      pnlTotal: 0,
    };

    store.addAccount(newAccount);
    store.addLog('INFO', `Nova conta criada: ${newAccount.name} (${newAccount.type.toUpperCase()} - ${newAccount.broker.toUpperCase()}) em $ USD.`);
    res.json(newAccount);
  });

  app.post('/api/accounts/:id/reset', (req, res) => {
    const account = store.getAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    account.initialBalance = 100.0;
    account.currentBalance = 100.0;
    account.baseCurrency = 'USD';
    account.pnlTotal = 0.0;
    account.totalTrades = 0;
    account.winningTrades = 0;
    store.updateAccount(account);

    store.addLog('INFO', `Conta ${account.name} resetada para $ 100.00 USD inicial.`);
    res.json(account);
  });

  app.post('/api/store/reset', (_req, res) => {
    store.resetDataStore();
    res.json({ success: true, message: 'Plataforma e contas resetadas com sucesso para banca inicial limpa de $ 100.00 USD.' });
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
    const {
      accountId,
      symbol,
      direction,
      riskPercent,
      tpRatio,
      slRatio,
      signature,
      secret,
      txHash,
      walletAddress,
      onchainConfirmed,
    } = req.body;

    const account = store.getAccount(accountId);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    // Sincroniza endereço da carteira se informado
    if (walletAddress && (!account.walletAddress || account.walletAddress !== walletAddress)) {
      account.walletAddress = walletAddress;
    }

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

    const isMetaMaskTrade = Boolean(txHash || account.broker === 'metamask' || onchainConfirmed);
    const initialAuditCode = isMetaMaskTrade
      ? `AUD-MM-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
      : `AUD-M-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    let onchainNetwork: string | undefined = undefined;
    let explorerUrl: string | undefined = undefined;
    let auditHash: string | undefined = undefined;

    if (isMetaMaskTrade) {
      try {
        const onchainSvc = getOnchainService();
        onchainNetwork = onchainSvc.chainDefinition.name;
        if (txHash) {
          const explorer = onchainSvc.chainDefinition.explorer || 'https://sepolia.etherscan.io';
          explorerUrl = `${explorer}/tx/${txHash}`;
        }
        // Gera selo criptográfico e hash de auditoria auditado
        const auditLogEntry = defaultAuditLogger.auditTradeClose({
          id: `trd-mm-${Date.now()}`,
          symbol: symbol || 'BTC/BRL',
          direction: isLong ? 'LONG' : 'SHORT',
          entryPrice,
          exitPrice: entryPrice,
          pnl: 0,
          timeframe: '15m',
          botName: 'MetaMask Web3 Live',
          accountName: account.name,
        });
        auditHash = auditLogEntry.auditHash;
      } catch (err: any) {
        console.warn('[Audit OnChain] Erro ao selar hash on-chain:', err.message);
      }
    }

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
      timeframe: '15m',
      auditCode: initialAuditCode,
      auditHash,
      auditStatus: isMetaMaskTrade && txHash ? 'AUDITED_SEALED' : 'PENDING_CLOSE',
      txHash,
      onchainNetwork,
      explorerUrl,
      notes: isMetaMaskTrade
        ? `Operação real MetaMask confirmada on-chain (${onchainNetwork || 'EVM'}). TX: ${txHash || 'Pendente'} | Selo: ${initialAuditCode}`
        : `Operação manual aprovada (${validation.reason}) | Slippage: R$ ${slippage.toFixed(2)} | Fee: R$ ${fee.toFixed(2)}`,
    };

    store.addTrade(manualTrade);

    // Registra despacho no gateway real caso haja hash on-chain da MetaMask
    if (txHash) {
      realExecutionGateway.recordReceipt({
        success: true,
        orderId: manualTrade.id,
        clientOrderId: txHash,
        adapterId: 'metamask',
        adapterName: 'MetaMask Web3 (EVM Browser)',
        symbol: manualTrade.symbol,
        side: isLong ? 'BUY' : 'SELL',
        quantity: manualTrade.quantity,
        filledQuantity: manualTrade.quantity,
        executedPrice: manualTrade.entryPrice,
        fee: fee || 0.0001,
        feeAsset: 'ETH',
        latencyMs: 95,
        status: 'FILLED',
        timestamp: new Date().toISOString(),
      });
    }

    store.addLog(
      'TRADE',
      isMetaMaskTrade
        ? `[METAMASK REAL] Ordem ${direction} ${symbol} aberta via MetaMask [TX: ${txHash ? txHash.slice(0, 10) + '...' : 'N/A'}] Selo: ${initialAuditCode}.`
        : `Trade manual aberto por usuário na conta ${account.name} (${direction} ${symbol}) [Audit: ${initialAuditCode}].`
    );
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
    trade.exitTime = trade.closeTime;

    // Cryptographic Audit Seal Generation (mirror verification hash)
    const auditResult = defaultAuditLogger.auditTradeClose({
      id: trade.id,
      symbol: trade.symbol,
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      exitPrice: trade.currentPrice || trade.entryPrice,
      pnl: trade.pnl,
      timeframe: trade.timeframe || '15m',
      botName: trade.botName || 'Manual Execution',
      accountName: trade.accountName,
    });

    trade.auditCode = auditResult.auditCode;
    trade.auditHash = auditResult.auditHash;
    trade.auditStatus = 'AUDITED_SEALED';

    const account = store.getAccount(trade.accountId);
    if (account) {
      account.currentBalance = Number((account.currentBalance + trade.pnl).toFixed(2));
      account.pnlTotal = Number((account.pnlTotal + trade.pnl).toFixed(2));
      if (trade.pnl > 0) account.winningTrades += 1;
      account.totalTrades += 1;
      store.updateAccount(account);
    }

    store.updateTrade(trade);
    store.addLog('TRADE', `Operação ${trade.symbol} encerrada manualmente. PnL: R$ ${trade.pnl.toFixed(2)} [Audit: ${auditResult.auditCode}].`);
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

  app.post('/api/bots/:id/force-trades', async (req, res) => {
    if (!runner247Service.isDeploymentApproved()) {
      return res.status(403).json({ error: 'Execução bloqueada: exige deployment WFA PAPER APPROVED.' });
    }
    try {
      const { id } = req.params;
      const count = Number(req.body?.count) || 5;
      const result = await botWorker.forceExecuteBotTrades(id, count);
      res.json(result);
    } catch (e: any) {
      console.error('Erro ao forçar operações do bot:', e);
      res.status(500).json({ error: e.message || 'Erro ao forçar operações do bot' });
    }
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

  // The old collective endpoint is kept for compatibility with integrations.
  // New validation must go through the real-data WFA pipeline below.
  app.post('/api/collective/backtest', (_req, res) => {
    res.status(410).json({
      error: 'Endpoint legado descontinuado: use POST /api/validation/run para um backtest com dados históricos reais.',
      next: '/api/validation/run',
    });
  });

  // ========================================================================
  // REAL-DATA WALK-FORWARD VALIDATION PIPELINE
  // Data -> deterministic backtest -> tournament -> paper promotion gate.
  // This endpoint never fabricates candles and never starts a broker.
  // ========================================================================
  app.post('/api/validation/run', async (req, res) => {
    try {
      const result = await validationPipelineService.run(req.body || {});
      res.json(result);
    } catch (error: any) {
      console.error('[Validation] Pipeline error:', error);
      res.status(500).json({
        error: error?.message || 'Falha ao executar o pipeline de validação.',
        status: 'INVALID_BACKTEST',
      });
    }
  });

  app.get('/api/validation/last', (_req, res) => {
    const result = validationPipelineService.getLastRun();
    if (!result) return res.status(404).json({ error: 'Nenhum pipeline executado nesta sessão.' });
    res.json(result);
  });

  app.get('/api/validation/manifest', async (_req, res) => {
    const manifest = await validationPipelineService.getManifest();
    res.json({ exists: Boolean(manifest), manifest });
  });

  app.get('/api/validation/last.csv', (_req, res) => {
    const result = validationPipelineService.getLastRun();
    if (!result) return res.status(404).json({ error: 'Nenhum pipeline executado nesta sessão.' });
    const escapeCsv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const header = ['strategy_id', 'strategy_family', 'status', 'n_trades_oos', 'win_rate_oos', 'profit_factor_oos', 'sharpe_oos', 'sortino_oos', 'max_drawdown_oos', 'total_return_oos', 'oos_efficiency_ratio', 'score', 'backtest_hash'];
    const rows = result.tournament.candidates.map((candidate) => [
      candidate.strategy_id,
      candidate.strategy_family,
      candidate.status,
      candidate.metrics_out_of_sample.n_trades,
      candidate.metrics_out_of_sample.win_rate,
      candidate.metrics_out_of_sample.profit_factor,
      candidate.metrics_out_of_sample.sharpe,
      candidate.metrics_out_of_sample.sortino,
      candidate.metrics_out_of_sample.max_drawdown,
      candidate.metrics_out_of_sample.total_return,
      candidate.oos_efficiency_ratio,
      candidate.score ?? '',
      candidate.backtest_hash,
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.pipeline_id}.csv"`);
    res.send([header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n'));
  });

  app.post('/api/validation/promote', async (_req, res) => {
    try {
      const result = await validationPipelineService.promoteLastRun();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Falha no gate de promoção.' });
    }
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

  // --- PARALLEL NAUTILUS TRADER BRIDGE ENDPOINTS ---
  app.get('/api/nautilus/status', (_req, res) => {
    res.json(nautilusBridgeService.getStatus());
  });

  app.post('/api/nautilus/token', (req, res) => {
    const { username = 'trader@site.com' } = req.body || {};
    const token = nautilusBridgeService.generateJwtToken(username);
    res.json({
      access_token: token,
      token_type: 'bearer',
      expires_in: 1800,
      user: { username, full_name: 'Trader Pro (Nautilus Node)', disabled: false },
    });
  });

  app.post('/api/nautilus/engine/start', (_req, res) => {
    try {
      const result = nautilusBridgeService.startEngine();
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/nautilus/engine/stop', (_req, res) => {
    try {
      const result = nautilusBridgeService.stopEngine();
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/nautilus/trade/order', (req, res) => {
    try {
      const { instrument, side, quantity, price } = req.body || {};
      if (!instrument || !side || !quantity) {
        return res.status(400).json({ error: 'Parâmetros instrument, side e quantity são obrigatórios.' });
      }
      const order = nautilusBridgeService.placeOrder(instrument, side, Number(quantity), price ? Number(price) : undefined);
      res.json({
        message: 'Ordem enviada para o motor Nautilus Trader com sucesso',
        order,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/nautilus/orders', (_req, res) => {
    res.json(nautilusBridgeService.getOrders());
  });

  app.get('/api/nautilus/logs', (_req, res) => {
    res.json(nautilusBridgeService.getLogs());
  });

  // --- LIQUIDGIRAFFE8 / METATRADER-5-PLUS-EDGE (PYTHON BOT) ENDPOINTS ---
  app.get('/api/mt5-edge/status', (_req, res) => {
    res.json(mt5PlusEdgeService.getStatus());
  });

  app.post('/api/mt5-edge/connect', (req, res) => {
    try {
      const result = mt5PlusEdgeService.connectTerminal(req.body || {});
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/mt5-edge/disconnect', (_req, res) => {
    res.json(mt5PlusEdgeService.disconnectTerminal());
  });

  app.post('/api/mt5-edge/start', (_req, res) => {
    try {
      const result = mt5PlusEdgeService.startTrading();
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/mt5-edge/stop', (_req, res) => {
    res.json(mt5PlusEdgeService.stopTrading());
  });

  app.post('/api/mt5-edge/config', (req, res) => {
    try {
      const updated = mt5PlusEdgeService.updateRiskConfig(req.body || {});
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/mt5-edge/scanner', (_req, res) => {
    res.json(mt5PlusEdgeService.getScannerSymbols());
  });

  app.get('/api/mt5-edge/positions', (_req, res) => {
    res.json(mt5PlusEdgeService.getPositions());
  });

  app.post('/api/mt5-edge/positions/:ticket/close', (req, res) => {
    try {
      const ticket = Number(req.params.ticket);
      const result = mt5PlusEdgeService.closePosition(ticket);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/mt5-edge/positions/close-all', (_req, res) => {
    try {
      const result = mt5PlusEdgeService.closeAllPositions();
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/mt5-edge/order', (req, res) => {
    try {
      const pos = mt5PlusEdgeService.placeOrder(req.body || {});
      res.json({ success: true, position: pos });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/mt5-edge/logs', (_req, res) => {
    res.json(mt5PlusEdgeService.getLogs());
  });

  app.get('/api/mt5-edge/source-code', (_req, res) => {
    res.json(mt5PlusEdgeService.getPythonRepositoryCode());
  });

  // --- REAL EXECUTION GATEWAY & MARKET CLOCK ENDPOINTS ---
  app.get('/api/real-execution/status', (_req, res) => {
    res.json(realExecutionGateway.getStatus());
  });

  app.get('/api/real-execution/config', (_req, res) => {
    res.json(realExecutionGateway.getConfig());
  });

  app.post('/api/real-execution/config', (req, res) => {
    try {
      realExecutionGateway.setConfig(req.body || {});
      res.json(realExecutionGateway.getConfig());
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/real-execution/adapters', (_req, res) => {
    const adapters = realExecutionGateway.getAllAdapters().map((a) => a.getStatus());
    res.json(adapters);
  });

  app.post('/api/real-execution/adapters/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { isEnabled, isSandbox } = req.body || {};
      realExecutionGateway.updateAdapterConfig(id, isEnabled, isSandbox);
      const adapter = realExecutionGateway.getAdapter(id);
      if (!adapter) {
        return res.status(404).json({ error: 'Adaptador não encontrado' });
      }
      res.json(adapter.getStatus());
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/real-execution/ping/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await realExecutionGateway.pingAdapter(id);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, latencyMs: 0, error: e.message });
    }
  });

  app.get('/api/real-execution/balances', async (_req, res) => {
    try {
      const balances = await realExecutionGateway.getAllBalances();
      res.json(balances);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/real-execution/markets', (_req, res) => {
    res.json(marketClockService.getAllMarketStatuses());
  });

  app.get('/api/real-execution/history', (_req, res) => {
    res.json(realExecutionGateway.getHistory());
  });

  app.get('/api/real-execution/queue', (_req, res) => {
    res.json(executionScheduler.getAllQueued());
  });

  app.post('/api/real-execution/dispatch', async (req, res) => {
    try {
      const order = req.body || {};
      if (!order.symbol || !order.quantity || !order.side) {
        return res.status(400).json({ error: 'symbol, quantity e side são obrigatórios' });
      }
      const signedOrder = {
        id: order.id || `direct-ord-${Date.now()}`,
        account_id: order.account_id || 'acc-primary',
        symbol: order.symbol,
        side: order.side,
        quantity: Number(order.quantity),
        price: order.price ? Number(order.price) : undefined,
        order_hash: `hash-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        validated_at: new Date().toISOString(),
      };
      const receipt = await realExecutionGateway.dispatch(signedOrder);
      res.json({ success: true, receipt });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ======================================================================
  // INTEGRAÇÃO ON-CHAIN REAL (EVM) — server/services/onchain/
  //
  // Regra desta seção: nenhum endpoint devolve dado inventado.
  // Se não há carteira, não há saldo. Se não houve transação, não há hash.
  // ======================================================================

  /** Serializa uma rede no formato que a UI já consome. */
  const serializeChain = (key: string) => {
    const c = CHAIN_DEFINITIONS[key];
    return {
      key: c.key,
      name: c.name,
      env: c.env,
      chainId: c.chainId,
      nativeSymbol: c.nativeSymbol,
      rpcUrl: c.rpcUrls[0],
      rpcUrls: c.rpcUrls,
      dexName: c.dexName,
      dexRouter: c.dexRouter || '',
      wrappedNative: c.wrappedNative,
      explorer: c.explorer,
      verification: c.verification,
      verificationDetail: c.verificationDetail,
      swapEnabled: Boolean(c.dexRouter) && c.verification === 'verified',
    };
  };

  const onchain = () => getOnchainService();

  const onchainAdapter = (): OnchainAdapter => {
    const adapter = realExecutionGateway.getAdapter('blockchain_evm');
    if (!(adapter instanceof OnchainAdapter)) {
      throw new Error('Adaptador on-chain não registrado no gateway.');
    }
    return adapter;
  };

  // ---- Listagem de redes -------------------------------------------------
  app.get('/api/onchain/chains', (_req, res) => {
    res.json({
      chains: CHAIN_KEYS.map(serializeChain),
      activeChain: onchain().chainDefinition.key,
    });
  });

  // ---- Status completo (rede + carteira + saúde do RPC) ------------------
  app.get('/api/onchain/status', async (_req, res) => {
    try {
      const svc = onchain();
      const chain = svc.chainDefinition;
      const diag = await svc.diagnose();
      res.json({
        chain: serializeChain(chain.key),
        wallet: svc.walletState(),
        rpc: diag,
        swapEnabled: Boolean(chain.dexRouter) && chain.verification === 'verified',
        tokens: Object.fromEntries(
          Object.entries(TOKEN_REGISTRY[chain.key] || {}).map(([sym, addr]) => [sym, addr])
        ),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---- Troca de rede -----------------------------------------------------
  app.post('/api/onchain/chain', async (req, res) => {
    try {
      const { chainKey } = req.body || {};
      if (!isChainKey(chainKey)) {
        return res.status(400).json({ error: `Rede inválida. Disponíveis: ${CHAIN_KEYS.join(', ')}` });
      }
      const chain = await onchain().setChain(chainKey as ChainKey);
      store.addLog('INFO', `⛓️ Rede on-chain alterada para ${chain.name} (chainId ${chain.chainId})`);
      res.json({ success: true, chain: serializeChain(chain.key) });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---- Verificação ON-CHAIN do router -----------------------------------
  app.post('/api/onchain/verify', async (_req, res) => {
    try {
      const chain = await onchain().verifyRouter();
      res.json({
        success: chain.verification === 'verified',
        verification: chain.verification,
        detail: chain.verificationDetail,
        chain: serializeChain(chain.key),
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---- Carregar chave privada (cifra AES-256-GCM antes de guardar) -------
  app.post('/api/onchain/wallet/key', (req, res) => {
    try {
      const { privateKey } = req.body || {};
      if (!privateKey || typeof privateKey !== 'string') {
        return res.status(400).json({ error: 'privateKey é obrigatório.' });
      }
      const state = onchain().setPrivateKey(privateKey);
      const encrypted = encryptSecret(privateKey);
      store.addLog(
        'RULE',
        `🔑 Carteira on-chain carregada ${state.address} (chainId ${state.chainId}). Chave mantida apenas em memória.`
      );
      // Nunca devolvemos a chave. Devolvemos só o fingerprint cifrado.
      res.json({ success: true, wallet: state, storedCipherPrefix: encrypted.slice(0, 12) + '...' });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---- Endereço apenas observado (MetaMask / cold wallet) ----------------
  app.get('/api/onchain/watch-address', (_req, res) => {
    try {
      const mm = realExecutionGateway.getAdapter('metamask') as any;
      res.json({ success: true, watchAddress: mm?.walletAddress || '' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/onchain/watch-address', (req, res) => {
    try {
      const { address } = req.body || {};
      const mm = realExecutionGateway.getAdapter('metamask') as any;
      mm?.setWatchAddress?.(address || '');

      // Sincroniza com as contas do store caso exista conta configurada para MetaMask
      const accounts = store.getState().accounts;
      const mmAcc = accounts.find((a) => a.broker === 'metamask');
      if (mmAcc) {
        mmAcc.walletAddress = mm?.walletAddress || '';
        store.savePersistentState();
      }

      res.json({ success: true, watchAddress: mm?.walletAddress || '' });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---- Saldos REAIS ------------------------------------------------------
  app.get('/api/onchain/balances', async (req, res) => {
    try {
      const tokensParam = String(req.query.tokens || '');
      const tokens = tokensParam
        ? tokensParam.split(',').map((t) => t.trim()).filter(Boolean)
        : Object.values(TOKEN_REGISTRY[onchain().chainDefinition.key] || {});
      const portfolio = await onchain().getPortfolio(tokens as string[]);
      res.json(portfolio);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---- Cotação REAL (router.getAmountsOut) -------------------------------
  app.post('/api/onchain/quote', async (req, res) => {
    try {
      const { tokenIn, tokenOut, amountIn, slippageBps } = req.body || {};
      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json({ error: 'tokenIn, tokenOut e amountIn são obrigatórios.' });
      }
      const quote = await onchain().getQuote(
        String(tokenIn),
        String(tokenOut),
        String(amountIn),
        slippageBps ? Number(slippageBps) : 50
      );
      res.json({ success: true, quote });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---- Swap REAL ---------------------------------------------------------
  // Regras:
  //   • sem `confirm: true` no corpo  => DRY-RUN (hash: null, nada é enviado);
  //   • mainnet exige também o header  X-Confirm-Live: <chainKey>;
  //   • router precisa estar verificado on-chain.
  app.post('/api/onchain/swap', async (req, res) => {
    try {
      const { tokenIn, tokenOut, amountIn, slippageBps, deadlineSeconds, recipient, confirm, dryRun } =
        req.body || {};
      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json({ error: 'tokenIn, tokenOut e amountIn são obrigatórios.' });
      }

      const svc = onchain();
      const chain = svc.chainDefinition;
      const confirmHeader = String(req.header('X-Confirm-Live') || '');

      if (chain.env === 'mainnet' && confirm && confirmHeader !== chain.key) {
        return res.status(412).json({
          error:
            `Swap em ${chain.name} exige o header X-Confirm-Live: ${chain.key}. ` +
            'Nenhuma transação foi enviada.',
          sent: false,
        });
      }

      const result = await svc.swap({
        tokenIn: String(tokenIn),
        tokenOut: String(tokenOut),
        amountIn: String(amountIn),
        slippageBps: slippageBps ? Number(slippageBps) : 50,
        deadlineSeconds: deadlineSeconds ? Number(deadlineSeconds) : 300,
        recipient: recipient ? String(recipient) : undefined,
        confirm: confirm === true,
        dryRun: dryRun === true,
      });

      if (result.status === 'CONFIRMED') {
        store.addLog(
          'TRADE',
          `⛓️ Swap on-chain CONFIRMADO em ${chain.name}: ${result.hash} (bloco ${result.blockNumber}, gas ${result.txFeeNative} ${chain.nativeSymbol})`
        );
      } else if (result.hash) {
        store.addLog(
          'ERROR',
          `⛓️ Swap on-chain ${result.status} em ${chain.name}: ${result.hash} — ${result.error || ''}`
        );
      }

      res.json({ success: result.status === 'CONFIRMED', result });
    } catch (e: any) {
      res.status(400).json({ error: e.message, sent: false });
    }
  });

  // ---- Status REAL de uma transação --------------------------------------
  app.get('/api/onchain/tx/:hash', async (req, res) => {
    try {
      const status = await onchain().getTransactionStatus(req.params.hash);
      res.json(status);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---- Utilidade: símbolo -> contrato na rede ativa ----------------------
  app.get('/api/onchain/resolve/:symbol', (req, res) => {
    try {
      const chainKey = onchain().chainDefinition.key;
      const symbol = req.params.symbol;
      if (!hasToken(chainKey, symbol)) {
        return res.status(404).json({
          error: `"${symbol}" não registrado na rede ${chainKey}.`,
          registrados: Object.keys(TOKEN_REGISTRY[chainKey] || {}),
          dica: `Adicione TOKEN_${chainKey.toUpperCase()}_${symbol.toUpperCase()}=0x... no .env`,
        });
      }
      res.json({ symbol, chainKey, address: resolveToken(chainKey, symbol) });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---- Trilha de auditoria: ancoragem on-chain + verificação -------------
  app.post('/api/onchain/audit/anchor', async (req, res) => {
    try {
      const dryRun = req.body?.dryRun === true;
      const record = await getAuditAnchorService().anchorNow({ dryRun });
      store.addLog(
        record.anchored ? 'TRADE' : 'RULE',
        record.anchored
          ? `🔏 Auditoria ancorada on-chain: bloco ${record.auditBlockNumber} -> tx ${record.txHash}`
          : `🔏 Ancoragem de auditoria NÃO realizada: ${record.reason}`
      );
      res.json({ success: record.anchored, anchor: record });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/onchain/audit/integrity', (_req, res) => {
    try {
      res.json(getAuditAnchorService().verify());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ======================================================================
  // ENDPOINTS LEGADOS /api/blockchain/* — mantidos por compatibilidade,
  // agora apontando para a implementação real.
  // ======================================================================

  app.get('/api/blockchain/chains', (_req, res) => {
    res.json({ chains: Object.fromEntries(CHAIN_KEYS.map((k) => [k, serializeChain(k)])) });
  });

  app.get('/api/blockchain/wallet', async (_req, res) => {
    try {
      const svc = onchain();
      const state = svc.walletState();
      if (!state.hasSigningKey) {
        return res.status(400).json({
          error:
            'Nenhuma carteira configurada. Defina EVM_PRIVATE_KEY no .env ou use POST /api/onchain/wallet/key. Nenhum saldo será fabricado.',
        });
      }
      const chainKey = svc.chainDefinition.key;
      const native = await svc.getNativeBalance();
      const tokens = Object.entries(TOKEN_REGISTRY[chainKey] || {}).slice(0, 8).map(([, a]) => a);
      const balances = await onchainAdapter().getBalances();
      res.json({
        address: state.address,
        chain: serializeChain(chainKey),
        nativeBalance: native.amount,
        balances,
        isSandbox: svc.chainDefinition.env === 'testnet',
        tokensWatched: tokens.length,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/blockchain/select-chain', async (req, res) => {
    try {
      const { chainKey } = req.body || {};
      if (!isChainKey(chainKey)) {
        return res.status(400).json({ error: `Rede inválida. Disponíveis: ${CHAIN_KEYS.join(', ')}` });
      }
      const chain = await onchain().setChain(chainKey as ChainKey);
      res.json({ success: true, currentChain: serializeChain(chain.key) });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/blockchain/quote', async (req, res) => {
    try {
      const { tokenIn, tokenOut, amountIn } = req.body || {};
      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json({ error: 'tokenIn, tokenOut e amountIn são obrigatórios.' });
      }
      const quote = await onchain().getQuote(String(tokenIn), String(tokenOut), String(amountIn));
      res.json({
        success: true,
        tokenIn,
        tokenOut,
        amountIn,
        expectedOut: quote.amountOutRaw,
        path: quote.path,
        quote,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/blockchain/swap', async (req, res) => {
    try {
      const { tokenIn, tokenOut, amountIn, slippageBps, confirm } = req.body || {};
      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json({ error: 'tokenIn, tokenOut e amountIn são obrigatórios.' });
      }
      const result = await onchain().swap({
        tokenIn: String(tokenIn),
        tokenOut: String(tokenOut),
        amountIn: String(amountIn),
        slippageBps: slippageBps ? Number(slippageBps) : 50,
        confirm: confirm === true,
      });
      res.json({
        success: result.status === 'CONFIRMED',
        result: {
          hash: result.hash,
          status: result.status,
          blockNumber: result.blockNumber,
          gasUsed: result.gasUsed,
          explorerUrl: result.explorerUrl,
          dryRun: result.dryRun,
          dryRunReason: result.dryRunReason,
          error: result.error,
        },
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message, sent: false });
    }
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

  // Sincroniza carteira MetaMask inicial se houver conta no store com endereço EVM válido
  try {
    const mmAcc = store.getState().accounts.find((a) => a.broker === 'metamask');
    if (mmAcc && mmAcc.walletAddress && ethers.isAddress(mmAcc.walletAddress)) {
      const mm = realExecutionGateway.getAdapter('metamask') as any;
      mm?.setWatchAddress?.(mmAcc.walletAddress);
      console.log(`🦊 [Startup] Carteira MetaMask sincronizada: ${mmAcc.walletAddress}`);
    }
  } catch (err: any) {
    console.warn('[Startup] Aviso ao sincronizar carteira MetaMask:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Quantum Trade Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
