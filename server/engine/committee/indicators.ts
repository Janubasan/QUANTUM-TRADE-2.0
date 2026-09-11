/**
 * indicators.ts
 * ---------------------------------------------------------------------------
 * Implementações puras (sem dependências) de indicadores técnicos usados pelo
 * Comitê JARVIS. Foram reescritas a partir das referências coletadas na
 * meta-pesquisa (freqtrade, lumibot, vectorbt, FinRL e discussões em
 * r/algotrading) para substituir os valores aleatórios do motor anterior por
 * séries calculadas de verdade sobre velas reais/sintéticas.
 *
 * Convenções:
 *  - RSI em suavização de Wilder (a mesma do freqtrade/vectorbt);
 *  - EMA recursiva (seed = primeiro preço);
 *  - ATR em True Range + suavização de Wilder;
 *  - volatilidade realizada em log-retornos anualizada (525.600 min/ano).
 */

export interface Candle {
  time: number; // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function round(value: number, decimals = 4): number {
  const m = 10 ** decimals;
  return Math.round(value * m) / m;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdev(values: number[], sample = true): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - (sample ? 1 : 0));
  return Math.sqrt(variance);
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return mean(values.slice(-period));
}

export function smaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export function emaLast(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const series = emaSeries(values, period);
  return series[series.length - 1];
}

export function rsiWilder(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gainSum += delta;
    else lossSum -= delta;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MacdResult {
  macd: number;
  signal: number;
  hist: number;
  prevHist: number;
  macdSeries: number[];
  signalSeries: number[];
  histSeries: number[];
}

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MacdResult {
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const macdSeries = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalSeries = emaSeries(macdSeries, signalPeriod);
  const histSeries = macdSeries.map((m, i) => m - signalSeries[i]);

  const last = (arr: number[]) => (arr.length ? arr[arr.length - 1] : 0);
  return {
    macd: last(macdSeries),
    signal: last(signalSeries),
    hist: last(histSeries),
    prevHist: histSeries.length > 1 ? histSeries[histSeries.length - 2] : 0,
    macdSeries,
    signalSeries,
    histSeries,
  };
}

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (!trs.length) return 0;
  let value = mean(trs.slice(0, Math.min(period, trs.length)));
  for (let i = Math.min(period, trs.length); i < trs.length; i++) {
    value = (value * (period - 1) + trs[i]) / period;
  }
  return value;
}

/** Inclinação OLS por passo (tendência de fundo de uma janela de preços). */
export function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i];
    sx += x;
    sy += y;
    sxy += x * y;
    sxx += x * x;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

/** Volatilidade realizada anualizada (%) a partir de log-retornos de velas de 1 minuto. */
export function realizedVolatility(closes: number[], periodsPerYear = 525600): number {
  if (closes.length < 3) return 0;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const sd = stdev(returns, false);
  return sd * Math.sqrt(periodsPerYear) * 100;
}
