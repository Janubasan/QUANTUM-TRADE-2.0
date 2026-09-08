// Quantum Mirror — API + Runner 24/7 + Dashboard público.
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { BOTS } from './bots/types.js';
import { startRunner, runnerStatus, account } from './engine/runner.js';
import { verifyChain, recentBlocks } from './engine/audit.js';
import { integrationMatrix } from './integrations/registry.js';
import { feed, subscribe, unsubscribe, replicate, publish } from './tradingview/mirror.js';
import { handleTvAlert } from './tradingview/tvWebhook.js';
import { getCandles, getPrice } from './engine/marketData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 3100);
app.use(express.json({ limit: '256kb', verify: (req: any, _res, buf) => { req.rawBody = buf.toString(); } }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- Mirror público ----
app.get('/mirror', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'mirror.html')));
app.get('/mirror/status', (_req, res) => res.json({ ok: true, ...runnerStatus(), audit: verifyChain() }));
app.get('/mirror/trades', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json({
    open: [...account.positions.values()],
    closed: account.history.slice(0, limit),
    stats: account.stats(),
  });
});
app.get('/mirror/feed', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  subscribe(res);
  req.on('close', () => unsubscribe(res));
});
app.get('/mirror/events', (req, res) => res.json(feed(Math.min(Number(req.query.limit ?? 50), 200))));
app.post('/mirror/replicate/:tradeId', async (req, res) => {
  try {
    if (req.headers['x-mirror-key'] !== (process.env.MIRROR_API_KEY ?? 'mirror_public_readonly_2026'))
      return res.status(401).json({ ok: false, error: 'x-mirror-key inválida' });
    const out = await replicate(req.params.tradeId, req.body ?? {});
    res.json({ ok: true, ...out });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ---- TradingView IN ----
app.post('/tv/webhook', async (req: any, res) => {
  try {
    const out = await handleTvAlert(req.body, req.headers['x-signature'], req.rawBody ?? '');
    res.status(out.processed ? 200 : 422).json({ ok: out.processed, ...out });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- APIs ----
app.get('/api/bots', (_req, res) => res.json({ bots: BOTS }));
app.get('/api/integrations', (_req, res) => res.json(integrationMatrix()));
app.get('/api/account', (_req, res) => res.json({ stats: account.stats(), fills: account.fills.slice(0, 50) }));
app.get('/api/audit/verify', (_req, res) => res.json(verifyChain()));
app.get('/api/audit/recent', (req, res) => res.json(recentBlocks(Math.min(Number(req.query.limit ?? 50), 200))));
app.get('/api/market/candles', async (req, res) => {
  try {
    const { symbol = 'BTC/USDT', interval = '15m' } = req.query as Record<string, string>;
    res.json(await getCandles(symbol, interval, 200));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.get('/api/market/price', async (req, res) => {
  try {
    res.json(await getPrice(String(req.query.symbol ?? 'BTC/USDT')));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚛️ Quantum Mirror em http://0.0.0.0:${PORT}/mirror`);
  startRunner(30000);
  setInterval(() => publish({ type: 'heartbeat', ts: new Date().toISOString(), stats: account.stats() }), 15000);
});
