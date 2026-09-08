// Backtest CLI — roda os 4 bots sobre klines reais e reporta métricas.
// Uso: npm run backtest
import 'dotenv/config';
import { BOTS } from './bots/types.js';
import { solMomentumBreakout, ethTrendWave, regimeDesk, orbMonteCarlo } from './bots/strategies.js';
import { getCandles } from './engine/marketData.js';

async function backtestBot(botId: string) {
  const spec = BOTS.find((b) => b.id === botId)!;
  const { candles, quality } = await getCandles(spec.symbol, spec.timeframe, 500);
  const minBars = 80;
  let wins = 0, losses = 0, pnlR = 0;
  const rets: number[] = [];
  for (let i = minBars; i < candles.length - 1; i++) {
    const slice = candles.slice(0, i + 1);
    const sig =
      botId === 'sol-breakout-30m' ? solMomentumBreakout(slice, spec.symbol, spec.timeframe)
      : botId === 'eth-trendwave-10m' ? ethTrendWave(slice, spec.symbol, spec.timeframe)
      : botId === 'regime-desk-5m' ? regimeDesk(slice, spec.symbol, spec.timeframe)
      : orbMonteCarlo(slice, spec.symbol, spec.timeframe);
    if (sig.direction === 'FLAT' || sig.vetoed) continue;
    // Resolve nas próximas 20 barras: toca TP ou SL primeiro?
    const entry = candles[i + 1].open;
    const risk = Math.abs(entry - sig.stopHint) || entry * 0.004;
    const tp = sig.direction === 'LONG' ? entry + risk * spec.tpRatio : entry - risk * spec.tpRatio;
    const sl = sig.direction === 'LONG' ? entry - risk : entry + risk;
    for (let j = i + 1; j < Math.min(i + 21, candles.length); j++) {
      const c = candles[j];
      const hitTp = sig.direction === 'LONG' ? c.high >= tp : c.low <= tp;
      const hitSl = sig.direction === 'LONG' ? c.low <= sl : c.high >= sl;
      if (hitTp || hitSl) {
        const r = hitTp && !hitSl ? spec.tpRatio : hitSl && !hitTp ? -1 : 0;
        if (r > 0) wins++; else if (r < 0) losses++;
        pnlR += r;
        rets.push(r * (spec.riskPercent / 100));
        break;
      }
    }
  }
  const n = wins + losses;
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length) : 0;
  return {
    bot: spec.name, symbol: spec.symbol, tf: spec.timeframe, data: quality,
    signals: n, wins, losses,
    winRate: n ? +((wins / n) * 100).toFixed(1) : 0,
    totalR: +pnlR.toFixed(2),
    sharpe: sd > 0 ? +((mean / sd) * Math.sqrt(Math.max(n, 1))).toFixed(2) : 0,
    audited: { winRate: spec.winRateAudited, sharpe: spec.sharpeAudited },
  };
}

const rows = [];
for (const b of BOTS) rows.push(await backtestBot(b.id));
console.table(rows);
console.log('\nNota: backtest usa klines reais recentes; métricas auditadas de referência vêm do relatório oficial.');
