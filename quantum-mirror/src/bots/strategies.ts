// As 4 estratégias auditadas — implementação fiel às specs (docs/STRATEGIES.md).
import { Candle, Signal, Direction } from './types.js';
import { closes, ema, sma, atr, rsi, vwapSession, adx, bandWidth, percentile, monteCarlo, stdev } from './indicators.js';

const last = <T>(a: T[]): T => a[a.length - 1];

function base(botId: string, symbol: string, timeframe: string, price: number): Signal {
  return {
    botId, symbol, timeframe, direction: 'FLAT', confidence: 0,
    entryHint: price, stopHint: price, takeProfitHint: price,
    reasons: [], vetoed: false, meta: {},
  };
}

/**
 * #1 SOL Momentum Breakout (30m) — squeeze + expansão acima EMA50 + vol 1.5x + trailing ATR.
 */
export function solMomentumBreakout(cs: Candle[], symbol = 'SOL/USDT', timeframe = '30m'): Signal {
  const price = last(cs).close;
  const sig = base('sol-breakout-30m', symbol, timeframe, price);
  if (cs.length < 70) { sig.reasons.push('warmup: aguardando 70 barras'); return sig; }

  const c = closes(cs);
  const e50 = ema(c, 50);
  const a14 = atr(cs, 14);
  const vols = cs.map((x) => x.volume);
  const vma = sma(vols, 20);
  const i = cs.length - 1;
  const bw = bandWidth(cs, 20, 2);
  const squeezeLine = percentile(bw.slice(-50, -1), 20);
  const wasSqueezed = bw[i - 1] <= squeezeLine;
  const expanded = bw[i] > bw[i - 1];
  const aboveEma = price > e50[i];
  const belowEma = price < e50[i];
  const volRatio = vma[i] ? vols[i] / vma[i] : 0;
  const triggerLow = last(cs).low;
  const triggerHigh = last(cs).high;

  sig.meta = { ema50: +e50[i].toFixed(4), volRatio: +volRatio.toFixed(2), atr: +a14[i].toFixed(4), squeezed: wasSqueezed, expanded };

  if (wasSqueezed && expanded && volRatio >= 1.5 && aboveEma) {
    const sl = triggerLow;
    const risk = Math.max(price - sl, a14[i]);
    sig.direction = 'LONG';
    sig.confidence = Math.min(0.95, 0.55 + Math.min(volRatio - 1.5, 1.5) * 0.15 + (expanded ? 0.1 : 0));
    sig.stopHint = sl;
    sig.takeProfitHint = price + risk * 2.5;
    sig.reasons.push(`squeeze→expansão acima EMA50`, `volume ${volRatio.toFixed(2)}x`, `SL mínima gatilho`, `alvo 2.5R + trailing ATR`);
  } else if (wasSqueezed && expanded && volRatio >= 1.5 && belowEma) {
    const sl = triggerHigh;
    const risk = Math.max(sl - price, a14[i]);
    sig.direction = 'SHORT';
    sig.confidence = Math.min(0.95, 0.55 + Math.min(volRatio - 1.5, 1.5) * 0.15 + (expanded ? 0.1 : 0));
    sig.stopHint = sl;
    sig.takeProfitHint = price - risk * 2.5;
    sig.reasons.push(`squeeze→expansão abaixo EMA50`, `volume ${volRatio.toFixed(2)}x`, `SL máxima gatilho`, `alvo 2.5R + trailing ATR`);
  } else {
    sig.reasons.push(wasSqueezed ? 'em squeeze: aguardando expansão' : 'sem squeeze válido', `vol ${volRatio.toFixed(2)}x (min 1.5x)`);
  }
  return sig;
}

/**
 * #2 ETH Quantum Trend Wave (10m) — EMA20/EMA50/VWAP + gate ADX + scale-out + divergência RSI.
 */
export function ethTrendWave(cs: Candle[], symbol = 'ETH/USDT', timeframe = '10m'): Signal {
  const price = last(cs).close;
  const sig = base('eth-trendwave-10m', symbol, timeframe, price);
  if (cs.length < 70) { sig.reasons.push('warmup: aguardando 70 barras'); return sig; }

  const c = closes(cs);
  const e20 = ema(c, 20);
  const e50 = ema(c, 50);
  const vwap = vwapSession(cs);
  const ax = adx(cs, 14);
  const r = rsi(c, 14);
  const sd = stdev(c, 20);
  const a14 = atr(cs, 14);
  const i = cs.length - 1;

  const bullStack = e20[i] > e50[i] && e50[i] > vwap[i] && price > vwap[i];
  const bearStack = e20[i] < e50[i] && e50[i] < vwap[i] && price < vwap[i];
  const trendOk = ax[i] >= 18;
  // Divergência de baixa: preço faz topo maior e RSI topo menor (últimas 10 barras)
  const look = c.slice(-10);
  const rlook = r.slice(-10);
  const priceHH = look[look.length - 1] > Math.max(...look.slice(0, -1));
  const rsiLH = rlook[rlook.length - 1] < Math.max(...rlook.slice(0, -1));
  const bearDiv = priceHH && rsiLH;
  const priceLL = look[look.length - 1] < Math.min(...look.slice(0, -1));
  const rsiHL = rlook[rlook.length - 1] > Math.min(...rlook.slice(0, -1));
  const bullDiv = priceLL && rsiHL;

  sig.meta = { ema20: +e20[i].toFixed(2), ema50: +e50[i].toFixed(2), vwap: +vwap[i].toFixed(2), adx: +ax[i].toFixed(1), rsi: +r[i].toFixed(1), bearDiv, bullDiv };

  if (!trendOk) { sig.reasons.push(`ADX ${ax[i].toFixed(1)} < 18: consolidação lateral ignorada`); return sig; }

  if (bullStack && !bearDiv) {
    const risk = Math.max(a14[i], sd[i] || a14[i]);
    sig.direction = 'LONG';
    sig.confidence = Math.min(0.92, 0.5 + Math.min((ax[i] - 18) / 40, 0.25) + 0.1);
    sig.stopHint = price - risk;
    sig.takeProfitHint = price + risk * 2.2;
    sig.reasons.push('EMA20>EMA50>VWAP', `ADX ${ax[i].toFixed(1)}`, 'scale-out 50% no 1º desvio', 'alvo 2.2R');
  } else if (bearStack && !bullDiv) {
    const risk = Math.max(a14[i], sd[i] || a14[i]);
    sig.direction = 'SHORT';
    sig.confidence = Math.min(0.92, 0.5 + Math.min((ax[i] - 18) / 40, 0.25) + 0.1);
    sig.stopHint = price + risk;
    sig.takeProfitHint = price - risk * 2.2;
    sig.reasons.push('EMA20<EMA50<VWAP', `ADX ${ax[i].toFixed(1)}`, 'scale-out 50% no 1º desvio', 'alvo 2.2R');
  } else {
    sig.reasons.push(bearDiv || bullDiv ? 'divergência de momentum: sem entrada' : 'sem alinhamento triplo');
  }
  return sig;
}

export type Regime = 'trend' | 'mean-reversion' | 'chop';

/**
 * #3 Multi-Agent Regime Desk (5m) — supervisor + bull + bear + Red Team veto.
 */
export function regimeDesk(
  cs: Candle[], symbol = 'BTC/USDT', timeframe = '5m',
  costEstimate = { slippagePct: 0.05, feePct: 0.1 }
): Signal {
  const price = last(cs).close;
  const sig = base('regime-desk-5m', symbol, timeframe, price);
  if (cs.length < 70) { sig.reasons.push('warmup: aguardando 70 barras'); return sig; }

  const c = closes(cs);
  const e50 = ema(c, 50);
  const ax = adx(cs, 14);
  const r = rsi(c, 14);
  const a14 = atr(cs, 14);
  const vols = cs.map((x) => x.volume);
  const vma = sma(vols, 20);
  const i = cs.length - 1;

  // 1. Supervisor de regime
  const slope = (e50[i] - e50[i - 5]) / (e50[i - 5] || 1);
  let regime: Regime = 'chop';
  if (ax[i] >= 22 && Math.abs(slope) > 0.0005) regime = 'trend';
  else if (ax[i] < 18) regime = 'mean-reversion';

  // 2/3. Debate bull vs bear (0..100)
  const recentLow = Math.min(...c.slice(-20));
  const recentHigh = Math.max(...c.slice(-20));
  const posInRange = (price - recentLow) / (recentHigh - recentLow || 1);
  const volRatio = vma[i] ? vols[i] / vma[i] : 1;
  const bullScore = Math.round(
    (price > e50[i] ? 25 : 5) + (r[i] > 50 && r[i] < 70 ? 20 : r[i] <= 50 ? 8 : 0) +
    (posInRange < 0.4 ? 20 : 8) + (volRatio > 1.2 ? 15 : 5) + (slope > 0 ? 20 : 0)
  );
  const bearScore = Math.round(
    (price < e50[i] ? 25 : 5) + (r[i] < 50 && r[i] > 30 ? 20 : r[i] >= 50 ? 8 : 0) +
    (posInRange > 0.6 ? 20 : 8) + (volRatio > 1.2 ? 15 : 5) + (slope < 0 ? 20 : 0)
  );

  sig.meta = { regime, bullScore, bearScore, adx: +ax[i].toFixed(1), rsi: +r[i].toFixed(1), volRatio: +volRatio.toFixed(2) };

  if (regime === 'chop') { sig.reasons.push(`supervisor: regime CHOP (ADX ${ax[i].toFixed(1)}) — sem operação`); return sig; }

  let dir: Direction = 'FLAT';
  if (regime === 'trend') dir = bullScore >= bearScore ? 'LONG' : 'SHORT';
  else dir = posInRange < 0.35 ? 'LONG' : posInRange > 0.65 ? 'SHORT' : 'FLAT';
  if (dir === 'FLAT') { sig.reasons.push(`mean-reversion sem extremo (posição ${Math.round(posInRange * 100)}%)`); return sig; }

  // 4. Red Team — veto mandatório
  const totalCostPct = costEstimate.slippagePct + costEstimate.feePct;
  const netR = 2.0 - totalCostPct / 0.5; // assimetria líquida aproximada
  const implVol = (a14[i] / price) * 100;
  if (totalCostPct > 0.8) {
    sig.vetoed = true; sig.vetoReason = `Red Team VETO: custo ${totalCostPct.toFixed(2)}% > teto 0.8%`;
    sig.reasons.push(sig.vetoReason); return sig;
  }
  if (implVol > 3.0) {
    sig.vetoed = true; sig.vetoReason = `Red Team VETO: volatilidade ${implVol.toFixed(2)}% > teto 3.0%`;
    sig.reasons.push(sig.vetoReason); return sig;
  }
  if (netR < 1.5) {
    sig.vetoed = true; sig.vetoReason = `Red Team VETO: assimetria líquida ${netR.toFixed(2)}R < 1.5R`;
    sig.reasons.push(sig.vetoReason); return sig;
  }

  const risk = a14[i];
  sig.direction = dir;
  sig.confidence = Math.min(0.9, 0.45 + Math.abs(bullScore - bearScore) / 200);
  sig.stopHint = dir === 'LONG' ? price - risk : price + risk;
  sig.takeProfitHint = dir === 'LONG' ? price + risk * 2.0 : price - risk * 2.0;
  sig.reasons.push(`supervisor: ${regime}`, `debate bull ${bullScore} x bear ${bearScore}`, 'Red Team: APROVADO', 'alvo 2.0R');
  return sig;
}

/**
 * #4 Quant-Bot ORB & Monte Carlo (15m) — opening range + gate de 500 simulações.
 */
export function orbMonteCarlo(
  cs: Candle[], symbol = 'BTC/USDT', timeframe = '15m',
  opts: { rangeBars?: number; sims?: number; maxRuinProb?: number } = {}
): Signal {
  const { rangeBars = 1, sims = 500, maxRuinProb = 0.45 } = opts;
  const price = last(cs).close;
  const sig = base('orb-mc-15m', symbol, timeframe, price);
  if (cs.length < 40) { sig.reasons.push('warmup: aguardando 40 barras'); return sig; }

  // Opening range = primeira barra do dia UTC (primeiros 15 min do ciclo)
  const dayStart = new Date(last(cs).openTime);
  dayStart.setUTCHours(0, 0, 0, 0);
  const sessionBars = cs.filter((c) => c.openTime >= dayStart.getTime());
  const range = sessionBars.slice(0, Math.max(1, rangeBars));
  if (!range.length) { sig.reasons.push('sem barra de abertura na sessão'); return sig; }
  const orbHigh = Math.max(...range.map((c) => c.high));
  const orbLow = Math.min(...range.map((c) => c.low));

  const c = closes(cs);
  const vols = cs.map((x) => x.volume);
  const vma = sma(vols, 20);
  const i = cs.length - 1;
  const volRatio = vma[i] ? vols[i] / vma[i] : 0;

  const brokeUp = price > orbHigh && volRatio >= 1.2;
  const brokeDown = price < orbLow && volRatio >= 1.2;
  sig.meta = { orbHigh: +orbHigh.toFixed(2), orbLow: +orbLow.toFixed(2), volRatio: +volRatio.toFixed(2) };

  if (!brokeUp && !brokeDown) {
    sig.reasons.push(`dentro do range ${orbLow.toFixed(0)}–${orbHigh.toFixed(0)}: aguardando rompimento`);
    return sig;
  }

  // Gate Monte Carlo: 500 simulações com custos
  const rets: number[] = [];
  for (let k = 1; k < c.length; k++) rets.push((c[k] - c[k - 1]) / c[k - 1]);
  const mc = monteCarlo(rets.slice(-60), sims, 0.001, 0.0005);
  const ruinProb = 1 - mc.probProfit;
  sig.meta = { ...sig.meta, mcProbProfit: +mc.probProfit.toFixed(3), mcMaxDD: +(mc.maxDrawdown * 100).toFixed(2), mcSims: sims };

  if (ruinProb > maxRuinProb || mc.maxDrawdown > 0.06) {
    sig.vetoed = true;
    sig.vetoReason = `Monte Carlo VETO: P(falha) ${(ruinProb * 100).toFixed(1)}% / DD ${(mc.maxDrawdown * 100).toFixed(1)}%`;
    sig.reasons.push(sig.vetoReason);
    return sig;
  }

  const dir: Direction = brokeUp ? 'LONG' : 'SHORT';
  const risk = Math.max(price * 0.004, orbHigh - orbLow);
  sig.direction = dir;
  sig.confidence = Math.min(0.9, 0.4 + mc.probProfit * 0.5);
  sig.stopHint = dir === 'LONG' ? price - risk : price + risk;
  sig.takeProfitHint = dir === 'LONG' ? price + risk * 2.5 : price - risk * 2.5;
  sig.reasons.push(
    `rompimento ${dir === 'LONG' ? 'acima' : 'abaixo'} do range`,
    `MC ${sims} sims: P(lucro) ${(mc.probProfit * 100).toFixed(1)}%`,
    'alvo 2.5R'
  );
  return sig;
}

export const STRATEGIES = { solMomentumBreakout, ethTrendWave, regimeDesk, orbMonteCarlo };
