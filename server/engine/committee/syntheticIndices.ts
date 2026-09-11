/**
 * syntheticIndices.ts
 * ---------------------------------------------------------------------------
 * Índices sintéticos (estilo Deriv) para o Comitê JARVIS.
 *
 * Instrumentos sem ativo subjacente real, gerados por processo estocástico
 * determinístico com perfil de volatilidade próprio. São SEMPRE rotulados como
 * 'synthetic_index' e passam pelo RAG Gate com bandas largas + rótulo sintético
 * (nunca são apresentados como preço de mercado real — política Zero Dados Falsos).
 */

import { Candle } from './indicators.js';

export interface SyntheticIndexProfile {
  symbol: string;
  name: string;
  description: string;
  basePrice: number;
  /** Volatilidade por vela (fração do preço). */
  vol: number;
  /** Drift por vela. */
  drift: number;
  /** Probabilidade de salto (spike) por vela. */
  jumpProb: number;
  /** Amplitude do salto em desvios da vol. */
  jumpMagnitude: number;
  /** Direção dominante do salto: +1 up, -1 down, 0 simétrico. */
  jumpBias: 1 | -1 | 0;
  /** Período de oscilação para índices de volatilidade (0 = sem ciclo). */
  cyclePeriod: number;
}

export const SYNTHETIC_INDICES: SyntheticIndexProfile[] = [
  {
    symbol: 'VOL-75',
    name: 'Volatility 75 Index',
    description: 'Índice de volatilidade constante (75%) com ciclos de expansão/contração.',
    basePrice: 155000,
    vol: 0.0004,
    drift: 0,
    jumpProb: 0.02,
    jumpMagnitude: 6,
    jumpBias: 0,
    cyclePeriod: 240,
  },
  {
    symbol: 'BOOM-1000',
    name: 'Boom 1000 Index',
    description: 'Tendência de alta com spikes periódicos de explosão.',
    basePrice: 9500,
    vol: 0.0006,
    drift: 0.0002,
    jumpProb: 0.01,
    jumpMagnitude: 8,
    jumpBias: 1,
    cyclePeriod: 0,
  },
  {
    symbol: 'CRASH-1000',
    name: 'Crash 1000 Index',
    description: 'Tendência de baixa com spikes periódicos de colapso.',
    basePrice: 125000,
    vol: 0.0006,
    drift: -0.0002,
    jumpProb: 0.01,
    jumpMagnitude: 8,
    jumpBias: -1,
    cyclePeriod: 0,
  },
  {
    symbol: 'STEP-100',
    name: 'Step 100 Index',
    description: 'Degraus de preço estáveis com saltos controlados.',
    basePrice: 8200,
    vol: 0.0003,
    drift: 0.00005,
    jumpProb: 0.005,
    jumpMagnitude: 3,
    jumpBias: 1,
    cyclePeriod: 0,
  },
];

export function getSyntheticIndexProfile(symbol: string): SyntheticIndexProfile | undefined {
  return SYNTHETIC_INDICES.find((i) => i.symbol === symbol);
}

export function isSyntheticIndex(symbol: string): boolean {
  return Boolean(getSyntheticIndexProfile(symbol));
}

/**
 * Gera uma série de velas 1m para um índice sintético a partir de um PRNG semeado.
 * O gerador incorpora o perfil (vol, drift, spikes, ciclos) de forma determinística.
 */
export function generateSyntheticIndexCandles(
  profile: SyntheticIndexProfile,
  count: number,
  startTime: number,
  rng: () => number,
  stepMs = 60_000
): Candle[] {
  let price = profile.basePrice;
  const out: Candle[] = [];

  for (let i = 0; i < count; i++) {
    // Componente de ciclo (índices de volatilidade)
    let cycleMod = 1;
    if (profile.cyclePeriod > 0) {
      const phase = Math.sin((i / profile.cyclePeriod) * Math.PI * 2);
      cycleMod = 1 + phase * 0.8;
    }

    // Spike ocasional (boom/crash)
    let jump = 0;
    if (rng() < profile.jumpProb) {
      const dir = profile.jumpBias === 0 ? (rng() > 0.5 ? 1 : -1) : profile.jumpBias;
      jump = dir * profile.jumpMagnitude * profile.vol;
    }

    const ret = profile.drift + (rng() - 0.5) * 2 * profile.vol * cycleMod + jump;
    const open = price;
    const close = open * (1 + ret);
    const wick = Math.abs(ret) * (0.3 + rng() * 0.6);
    const high = Math.max(open, close) * (1 + wick);
    const low = Math.min(open, close) * (1 - wick);
    const volume = Math.round((1 + rng()) * 1000 * (1 + Math.abs(ret) / (profile.vol * 10 || 0.001)));

    out.push({ time: startTime + i * stepMs, open, high, low, close, volume });
    price = close;
  }

  return out;
}
