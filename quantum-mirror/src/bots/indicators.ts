// Indicadores técnicos puros (sem dependências) — base das 4 estratégias auditadas.
import { Candle } from './types.js';

export const closes = (cs: Candle[]): number[] => cs.map((c) => c.close);

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  return values.map((_, i) => {
    const s = Math.max(0, i - period + 1);
    const slice = values.slice(s, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

export function atr(cs: Candle[], period = 14): number[] {
  const trs = cs.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = cs[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
  return ema(trs, period);
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = new Array(values.length).fill(50);
  let gain = 0, loss = 0;
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/** VWAP da sessão (reinicia quando openTime cruza âncora diária). */
export function vwapSession(cs: Candle[]): number[] {
  const out: number[] = [];
  let pv = 0, v = 0, day = -1;
  for (const c of cs) {
    const d = new Date(c.openTime).getUTCDate();
    if (d !== day) { day = d; pv = 0; v = 0; }
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * c.volume; v += c.volume;
    out.push(v > 0 ? pv / v : c.close);
  }
  return out;
}

/** ADX simplificado (Wilder) para gate de tendência. */
export function adx(cs: Candle[], period = 14): number[] {
  const out: number[] = new Array(cs.length).fill(0);
  let sPlus = 0, sMinus = 0, sTr = 0, dxPrev = 0;
  for (let i = 1; i < cs.length; i++) {
    const up = cs[i].high - cs[i - 1].high;
    const dn = cs[i - 1].low - cs[i].low;
    const p = up > dn && up > 0 ? up : 0;
    const m = dn > up && dn > 0 ? dn : 0;
    const pc = cs[i - 1].close;
    const tr = Math.max(cs[i].high - cs[i].low, Math.abs(cs[i].high - pc), Math.abs(cs[i].low - pc));
    if (i <= period) { sPlus += p; sMinus += m; sTr += tr; continue; }
    sPlus = sPlus - sPlus / period + p;
    sMinus = sMinus - sMinus / period + m;
    sTr = sTr - sTr / period + tr;
    const pdi = sTr ? (100 * sPlus) / sTr : 0;
    const mdi = sTr ? (100 * sMinus) / sTr : 0;
    const dx = pdi + mdi ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
    dxPrev = (dxPrev * (period - 1) + dx) / period;
    out[i] = dxPrev;
  }
  return out;
}

export function stdev(values: number[], period: number): number[] {
  return values.map((_, i) => {
    const s = values.slice(Math.max(0, i - period + 1), i + 1);
    const m = s.reduce((a, b) => a + b, 0) / s.length;
    return Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length);
  });
}

/** Largura de banda normalizada (para detectar afunilamento/squeeze). */
export function bandWidth(cs: Candle[], period = 20, mult = 2): number[] {
  const c = closes(cs);
  const mid = sma(c, period);
  const sd = stdev(c, period);
  return c.map((_, i) => (mid[i] ? ((mid[i] + mult * sd[i]) - (mid[i] - mult * sd[i])) / mid[i] : 0));
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

/** Monte Carlo: embaralha retornos com custos e estima P(lucro) e max drawdown. */
export function monteCarlo(
  returns: number[],
  sims: number,
  feePerTrade: number,
  slippagePerTrade: number,
  seed = 42
): { probProfit: number; avgReturn: number; maxDrawdown: number } {
  let rand = seed >>> 0;
  const rnd = () => {
    rand = (rand * 1664525 + 1013904223) >>> 0;
    return rand / 4294967296;
  };
  let wins = 0;
  let sumRet = 0;
  let worstDd = 0;
  const n = returns.length;
  for (let s = 0; s < sims; s++) {
    let eq = 1, peak = 1, dd = 0;
    for (let i = 0; i < n; i++) {
      const r = returns[Math.floor(rnd() * n)] - feePerTrade - slippagePerTrade;
      eq *= 1 + r;
      peak = Math.max(peak, eq);
      dd = Math.max(dd, (peak - eq) / peak);
    }
    if (eq > 1) wins++;
    sumRet += eq - 1;
    worstDd = Math.max(worstDd, dd);
  }
  return { probProfit: wins / sims, avgReturn: sumRet / sims, maxDrawdown: worstDd };
}
