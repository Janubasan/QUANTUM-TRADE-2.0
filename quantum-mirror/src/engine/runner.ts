// Runner 24/7 — avalia os 4 bots em klines reais, executa na venue, publica no espelho.
import { BOTS, Signal } from '../bots/types.js';
import { solMomentumBreakout, ethTrendWave, regimeDesk, orbMonteCarlo } from '../bots/strategies.js';
import { atr } from '../bots/indicators.js';
import { positionSize, newRiskState, rollDayIfNeeded, canOpen, RiskState } from '../bots/risk.js';
import { getCandles, getPrice, DataQuality } from './marketData.js';
import { DemoAccount, Position } from './demoAccount.js';
import { seal } from './audit.js';
import { getVenue, paperAdapter, VENUES } from '../integrations/brokers.js';
import { publish, MirrorEvent } from '../tradingview/mirror.js';

export const account = new DemoAccount();
let risk: RiskState = newRiskState(account.balance);
let running = false;
let timer: NodeJS.Timeout | null = null;
const lastSignals = new Map<string, Signal>();
let dataQuality: DataQuality = 'live';
let cycles = 0;

const venueId = (process.env.EXECUTION_VENUE ?? 'paper') as keyof typeof VENUES;

async function evaluateBot(botId: string): Promise<Signal | null> {
  const spec = BOTS.find((b) => b.id === botId)!;
  const { candles, quality } = await getCandles(spec.symbol, spec.timeframe, 200);
  dataQuality = quality;
  switch (botId) {
    case 'sol-breakout-30m': return solMomentumBreakout(candles, spec.symbol, spec.timeframe);
    case 'eth-trendwave-10m': return ethTrendWave(candles, spec.symbol, spec.timeframe);
    case 'regime-desk-5m': return regimeDesk(candles, spec.symbol, spec.timeframe);
    case 'orb-mc-15m': return orbMonteCarlo(candles, spec.symbol, spec.timeframe);
    default: return null;
  }
}

async function cycle(): Promise<void> {
  cycles++;
  const prices = new Map<string, number>();
  const atrs = new Map<string, number>();
  for (const b of BOTS) {
    try {
      const { price, quality } = await getPrice(b.symbol);
      prices.set(b.symbol, price);
      if (quality === 'synthetic') dataQuality = 'synthetic';
      const { candles } = await getCandles(b.symbol, b.timeframe, 60);
      const a = atr(candles, 14);
      atrs.set(b.symbol, a[a.length - 1]);
    } catch { /* mantém último preço */ }
  }
  // Seed paper com preços reais
  for (const [s, p] of prices) paperAdapter.seedPrice(s, p);

  // 1. Settle posições (TP/SL/trailing)
  const closed = account.settle(prices, atrs);
  for (const t of closed) {
    const block = seal('trade_close', { tradeId: t.id, botId: t.botId, symbol: t.symbol, pnl: t.pnl, reason: t.exitReason });
    t.exitAuditCode = block.auditCode;
    risk.openPositions = Math.max(0, risk.openPositions - 1);
    publish({ type: 'trade_closed', ts: new Date().toISOString(), trade: t, auditCode: block.auditCode } as MirrorEvent);
    console.log(`[runner] CLOSE ${t.botId} ${t.symbol} ${t.exitReason} pnl=${t.pnl} [${block.auditCode}]`);
  }

  // 2. Avalia bots e abre posições
  risk = rollDayIfNeeded(risk, account.balance);
  for (const b of BOTS) {
    try {
      const sig = await evaluateBot(b.id);
      if (!sig) continue;
      lastSignals.set(b.id, sig);
      if (sig.direction === 'FLAT' || sig.vetoed) continue;
      // 1 posição por bot
      const hasOpen = [...account.positions.values()].some((p) => p.botId === b.id);
      if (hasOpen) continue;
      const gate = canOpen({ ...risk, openPositions: account.positions.size });
      if (!gate.allowed) { console.log(`[runner] ${b.id} bloqueado: ${gate.reason}`); continue; }

      const px = prices.get(b.symbol) ?? sig.entryHint;
      const qty = positionSize(account.balance, b.riskPercent, px, sig.stopHint);
      if (qty <= 0) continue;

      const venue = getVenue(venueId);
      const fill = await venue.placeOrder({
        symbol: b.symbol, side: sig.direction === 'LONG' ? 'BUY' : 'SELL',
        quantity: +qty.toFixed(6), price: px, type: 'MARKET',
        tpPrice: sig.takeProfitHint, slPrice: sig.stopHint,
        clientOrderId: `qm-${b.id}-${Date.now()}`,
        meta: { botId: b.id, confidence: sig.confidence },
      });
      account.fills.unshift(fill);

      const pos: Position = {
        id: fill.clientOrderId, botId: b.id, symbol: b.symbol, direction: sig.direction as 'LONG' | 'SHORT',
        entryPrice: fill.price, quantity: fill.quantity,
        tpPrice: sig.takeProfitHint, slPrice: sig.stopHint,
        openedAt: new Date().toISOString(), venue: venue.id, auditCode: '',
      };
      const block = seal('trade_open', {
        tradeId: pos.id, botId: b.id, symbol: b.symbol, side: fill.side,
        price: fill.price, qty: fill.quantity, venue: venue.id,
        live: fill.live, testnet: fill.testnet, confidence: sig.confidence, reasons: sig.reasons,
      });
      pos.auditCode = block.auditCode;
      account.open(pos);
      publish({ type: 'trade_open', ts: new Date().toISOString(), trade: pos, signal: sig, auditCode: block.auditCode } as MirrorEvent);
      console.log(`[runner] OPEN ${b.id} ${sig.direction} ${b.symbol} @ ${fill.price} via ${venue.id} [${block.auditCode}]`);
    } catch (e: any) {
      console.warn(`[runner] ${b.id}: ${e.message}`);
    }
  }
}

export function startRunner(intervalMs = 30000): void {
  if (running) return;
  running = true;
  seal('runner_start', { venue: venueId, balance: account.balance, dataQuality });
  console.log(`[runner] 24/7 iniciado — venue=${venueId} demo=$${account.balance} (intervalo ${intervalMs / 1000}s)`);
  void cycle();
  timer = setInterval(() => void cycle(), intervalMs);
}

export function stopRunner(): void {
  if (timer) clearInterval(timer);
  running = false;
}

export function runnerStatus() {
  return {
    running, cycles, venue: venueId, dataQuality,
    stats: account.stats(),
    open: [...account.positions.values()],
    lastSignals: Object.fromEntries(lastSignals),
    risk: { openPositions: account.positions.size, killed: risk.killed },
  };
}
