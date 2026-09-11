/**
 * agents.ts
 * ---------------------------------------------------------------------------
 * Agentes especialistas do Comitê JARVIS.
 *
 * Os 4 agentes canônicos da especificação:
 *   1. SENTINEL-1  — técnico (RSI-14, MACD 12/26/9, SMA-10/30)   — peso 35%
 *   2. VELOCITY-X  — momentum & fluxo (Δ24h, range diário, volume) — peso 30%
 *   3. NEXUS-DEPTH — liquidez/microestrutura (spread bps, desbalanceio) — 20%
 *   4. ORACLE-FNG  — sentimento (Fear & Greed 0..100) — base 15%, teto 20%
 *
 * Agentes DESCOBERTOS na meta-pesquisa (Reddit / X / GitHub / YouTube):
 *   5. KRONOS-FORECAST — proxy do foundation model Kronos (shiyu-coder/Kronos)
 *      prevê OHLCV por janela — peso 15%.
 *   6. MIROFISH-SWARM   — proxy do MiroFish (666ghj/MiroFish): enxame de
 *      micro-agentes simula sentimento/manada — peso 10%.
 *   7. REGIME-GUARD — classificador de regime (r/algotrading) — modula pesos.
 *   8. BULL-BEAR DEBATE — debate dialético (TradingAgents — arXiv:2412.20138).
 *
 * Todos os votos são determinísticos (mesma entrada => mesma saída).
 */

import { Candle, round, clamp, linearSlope } from './indicators.js';

export type CommitteeAgentRole =
  | 'technical'
  | 'momentum'
  | 'liquidity'
  | 'sentiment'
  | 'regime'
  | 'debate';

export type AgentSide = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface AgentVote {
  agentId: string;
  name: string;
  role: CommitteeAgentRole;
  baseWeight: number;
  score: number; // -1 .. +1
  confidence: number; // 0 .. 1
  side: AgentSide;
  reason: string;
  evidence: Record<string, number | string>;
}

export type RegimeLabel =
  | 'Bull Trend'
  | 'Bear Trend'
  | 'High Volatility'
  | 'Mean Reverting'
  | 'Low Volatility';

export interface RegimeResult {
  label: RegimeLabel;
  confidence: number;
  slopePerBar: number;
  realizedVol: number;
  atrPct: number;
  /** Escala aplicada ao peso de cada papel (0..1.2). */
  scaleByRole: Record<CommitteeAgentRole, number>;
  reason: string;
}

export interface DebateResult {
  bullPressure: number; // 0..1
  bearPressure: number; // 0..1
  dispute: boolean;
  reason: string;
}

export interface CommitteeMarketContext {
  symbol: string;
  price: number;
  change24h: number; // %
  high24h: number;
  low24h: number;
  volume24h: number;
  avgVolume: number;
  dataSource: 'live' | 'synthetic' | 'mixed';
  candles: Candle[];
  indicators: {
    rsi14: number;
    macdLine: number;
    macdSignal: number;
    macdHist: number;
    macdPrevHist: number;
    sma10: number;
    sma30: number;
    atr14: number;
    slope: number;
    realizedVol: number;
    rangePosition: number; // 0..1 no range diário
    volumeRatio: number;
  };
  book: {
    bidPrice: number;
    askPrice: number;
    bidSize: number;
    askSize: number;
    spreadBps: number;
    imbalance: number; // -1..1
    source: 'live' | 'synthetic';
  };
  fearGreed: {
    value: number; // 0..100
    classification: string;
    source: 'live' | 'synthetic';
  };
}

const clampScore = (v: number) => clamp(v, -1, 1);
const clampConf = (v: number) => clamp(v, 0, 1);

function sideOf(score: number, threshold = 0.12): AgentSide {
  if (score >= threshold) return 'LONG';
  if (score <= -threshold) return 'SHORT';
  return 'NEUTRAL';
}

// ============================================================================
// 1. SENTINEL-1 — Agente Técnico (peso 35%)
// ============================================================================
export class SentinelOneAgent {
  public readonly agentId = 'sentinel-1';
  public readonly name = 'SENTINEL-1';
  public readonly role: CommitteeAgentRole = 'technical';
  public readonly baseWeight = 0.35;

  evaluate(ctx: CommitteeMarketContext): AgentVote {
    const { rsi14, macdHist, macdPrevHist, sma10, sma30 } = ctx.indicators;
    let score = 0;
    let confidence = 0.3;
    let reason = 'SENTINEL-1: neutro — zona intermediária de RSI sem cruzamento definido.';

    const macdTurningUp = macdHist > macdPrevHist;
    const macdTurningDown = macdHist < macdPrevHist;
    const goldenCross = sma10 > sma30;
    const deathCross = sma10 < sma30;

    if (rsi14 < 30 && macdTurningUp) {
      // Sobrevenda com exaustão (cruzamento altista do MACD)
      score = 0.9;
      confidence = 0.72;
      reason = `SENTINEL-1: COMPRA — sobrevenda com exaustão (RSI ${rsi14.toFixed(1)} < 30) e cruzamento altista do MACD.`;
    } else if (rsi14 > 70 && macdTurningDown) {
      // Sobrecompra com exaustão (divergência baixista)
      score = -0.9;
      confidence = 0.72;
      reason = `SENTINEL-1: VENDA — sobrecompra com exaustão (RSI ${rsi14.toFixed(1)} > 70) e divergência baixista do MACD.`;
    } else if (rsi14 >= 30 && rsi14 <= 70) {
      // Seguidor de tendência (Golden/Death Cross)
      if (goldenCross) {
        score = 0.5;
        confidence = 0.6;
        reason = `SENTINEL-1: compra moderada — Golden Cross (SMA10 ${sma10.toFixed(2)} > SMA30 ${sma30.toFixed(2)}).`;
      } else if (deathCross) {
        score = -0.5;
        confidence = 0.6;
        reason = `SENTINEL-1: venda moderada — Death Cross (SMA10 ${sma10.toFixed(2)} < SMA30 ${sma30.toFixed(2)}).`;
      }
    } else if (rsi14 < 30) {
      score = 0.25;
      confidence = 0.4;
      reason = `SENTINEL-1: viés de compra fraco — RSI sobrevendido (${rsi14.toFixed(1)}) sem confirmação do MACD.`;
    } else if (rsi14 > 70) {
      score = -0.25;
      confidence = 0.4;
      reason = `SENTINEL-1: viés de venda fraco — RSI sobrecomprado (${rsi14.toFixed(1)}) sem confirmação do MACD.`;
    }

    return {
      agentId: this.agentId,
      name: this.name,
      role: this.role,
      baseWeight: this.baseWeight,
      score: clampScore(score),
      confidence: clampConf(confidence),
      side: sideOf(score),
      reason,
      evidence: {
        rsi14: round(rsi14, 2),
        macdHist: round(macdHist, 6),
        sma10: round(sma10, 2),
        sma30: round(sma30, 2),
      },
    };
  }
}

// ============================================================================
// 2. VELOCITY-X — Agente de Momentum & Fluxo (peso 30%)
// ============================================================================
export class VelocityXAgent {
  public readonly agentId = 'velocity-x';
  public readonly name = 'VELOCITY-X';
  public readonly role: CommitteeAgentRole = 'momentum';
  public readonly baseWeight = 0.3;

  evaluate(ctx: CommitteeMarketContext): AgentVote {
    const { change24h } = ctx;
    const { rangePosition, volumeRatio } = ctx.indicators;

    let score = 0;
    let confidence = 0.35;
    let reason = 'VELOCITY-X: consolidação lateral — miolo do range, score amortecido.';

    // Rompimento de alta: momentum positivo + preço no topo do range diário
    if (change24h > 1.5 && rangePosition > 0.7) {
      score = 0.8;
      confidence = 0.7;
      reason = `VELOCITY-X: rompimento de alta (Δ24h +${change24h.toFixed(2)}%, preço a ${(rangePosition * 100).toFixed(0)}% do topo do range).`;
    } else if (change24h < -1.5 && rangePosition < 0.3) {
      score = -0.8;
      confidence = 0.7;
      reason = `VELOCITY-X: rompimento de baixa (Δ24h ${change24h.toFixed(2)}%, preço a ${(rangePosition * 100).toFixed(0)}% do fundo do range).`;
    } else if (rangePosition > 0.85) {
      score = 0.35;
      confidence = 0.45;
      reason = `VELOCITY-X: preço esticado no topo do range (${(rangePosition * 100).toFixed(0)}%) sem confirmação de volume.`;
    } else if (rangePosition < 0.15) {
      score = -0.35;
      confidence = 0.45;
      reason = `VELOCITY-X: preço esticado no fundo do range (${(rangePosition * 100).toFixed(0)}%) sem confirmação de volume.`;
    } else if (rangePosition >= 0.4 && rangePosition <= 0.6) {
      // Consolidação: score proporcionalmente amortecido (evita falsos rompimentos)
      score = (rangePosition - 0.5) * 0.2;
      confidence = 0.3;
      reason = 'VELOCITY-X: consolidação lateral — score amortecido para evitar falsos rompimentos.';
    } else {
      score = (rangePosition - 0.5) * 0.5;
      confidence = 0.4;
      reason = `VELOCITY-X: posição no range em ${(rangePosition * 100).toFixed(0)}% — sinal parcial.`;
    }

    // Surto de volume reforça a convicção
    if (volumeRatio > 1.5) {
      confidence = clampConf(confidence + 0.08);
      reason += ` Volume ${volumeRatio.toFixed(1)}x acima da média reforça o sinal.`;
    }

    return {
      agentId: this.agentId,
      name: this.name,
      role: this.role,
      baseWeight: this.baseWeight,
      score: clampScore(score),
      confidence: clampConf(confidence),
      side: sideOf(score),
      reason,
      evidence: {
        change24h: round(change24h, 2),
        rangePosition: round(rangePosition, 3),
        volumeRatio: round(volumeRatio, 2),
      },
    };
  }
}

// ============================================================================
// 3. NEXUS-DEPTH — Agente de Microestrutura & Liquidez (peso 20%)
// ============================================================================
export class NexusDepthAgent {
  public readonly agentId = 'nexus-depth';
  public readonly name = 'NEXUS-DEPTH';
  public readonly role: CommitteeAgentRole = 'liquidity';
  public readonly baseWeight = 0.2;

  evaluate(ctx: CommitteeMarketContext): AgentVote {
    const { spreadBps, imbalance } = ctx.book;

    let score = 0;
    let confidence = 0.6;
    let reason: string;

    if (spreadBps <= 2) {
      // Alta liquidez: apoia a direção apontada pelo desbalanceio do livro
      confidence = 0.8;
      if (imbalance > 0.05) {
        score = 0.5;
        reason = `NEXUS-DEPTH: livro denso (spread ${spreadBps.toFixed(2)} bps) com pressão compradora (+${(imbalance * 100).toFixed(1)}%).`;
      } else if (imbalance < -0.05) {
        score = -0.5;
        reason = `NEXUS-DEPTH: livro denso (spread ${spreadBps.toFixed(2)} bps) com pressão vendedora (${(imbalance * 100).toFixed(1)}%).`;
      } else {
        score = 0;
        confidence = 0.7;
        reason = `NEXUS-DEPTH: livro denso (spread ${spreadBps.toFixed(2)} bps) e equilibrado — risco de derrapagem mínimo.`;
      }
    } else if (spreadBps <= 10) {
      // Liquidez intermediária: score escalado pelo desbalanceio
      score = clampScore(imbalance * 0.8);
      confidence = 0.55;
      reason = `NEXUS-DEPTH: liquidez intermediária (spread ${spreadBps.toFixed(2)} bps) — sinal parcialmente amortecido.`;
    } else {
      // Baixa liquidez / spread aberto: amortecedor de segurança
      score = 0;
      confidence = 0.25;
      reason = `NEXUS-DEPTH: iliquidez momentânea (spread ${spreadBps.toFixed(2)} bps > 10) — score zerado, freio de slippage acionado.`;
    }

    return {
      agentId: this.agentId,
      name: this.name,
      role: this.role,
      baseWeight: this.baseWeight,
      score: clampScore(score),
      confidence: clampConf(confidence),
      side: sideOf(score),
      reason,
      evidence: {
        spreadBps: round(spreadBps, 2),
        imbalance: round(imbalance, 3),
        bidSize: round(ctx.book.bidSize, 4),
        askSize: round(ctx.book.askSize, 4),
        bookSource: ctx.book.source,
      },
    };
  }
}

// ============================================================================
// 4. ORACLE-FNG — Agente de Sentimento (base 15%, teto hard-coded 20%)
// ============================================================================
export class OracleFngAgent {
  public readonly agentId = 'oracle-fng';
  public readonly name = 'ORACLE-FNG';
  public readonly role: CommitteeAgentRole = 'sentiment';
  public readonly baseWeight = 0.15;
  public readonly maxEffectiveWeight = 0.2; // trava inviolável programada no código

  evaluate(ctx: CommitteeMarketContext): AgentVote {
    const fng = ctx.fearGreed.value; // 0..100
    // Normalização matemática: fng (0..100) -> score (-1..+1)
    const normalized = (fng - 50) / 50;
    const extremity = Math.abs(fng - 50) / 50; // 0..1
    const score = clampScore(normalized);
    const confidence = clampConf(0.3 + 0.5 * extremity);

    const sentimentVeto =
      fng <= 20
        ? 'medo extremo — entradas LONG contra o sentimento são vetadas'
        : fng >= 80
          ? 'ganância extrema — entradas SHORT contra o sentimento são vetadas'
          : null;

    const reason = sentimentVeto
      ? `ORACLE-FNG: ${sentimentVeto} (F&G ${fng.toFixed(0)}/100, ${ctx.fearGreed.classification}).`
      : `ORACLE-FNG: sentimento ${ctx.fearGreed.classification} (F&G ${fng.toFixed(0)}/100) — peso controlado.`;

    return {
      agentId: this.agentId,
      name: this.name,
      role: this.role,
      baseWeight: this.baseWeight,
      score,
      confidence,
      side: sideOf(score, 0.35),
      reason,
      evidence: {
        fearGreed: round(fng, 1),
        classification: ctx.fearGreed.classification,
        sentimentVeto: sentimentVeto ?? 'none',
        source: ctx.fearGreed.source,
      },
    };
  }
}

// ============================================================================
// 5. KRONOS-FORECAST — Agente de previsão de velas (proxy determinístico do
//    foundation model Kronos — shiyu-coder/Kronos, AAAI 2026).
// ============================================================================
export class KronosForecastAgent {
  public readonly agentId = 'kronos-forecast';
  public readonly name = 'KRONOS-FORECAST';
  public readonly role: CommitteeAgentRole = 'technical';
  public readonly baseWeight = 0.15;

  evaluate(ctx: CommitteeMarketContext): AgentVote {
    const { candles } = ctx;
    const closes = candles.map((c) => c.close);
    const n = Math.min(closes.length, 96);

    // Projeção OHLCV determinística: tendência (OLS) + volatilidade → retorno esperado.
    let drift = 0;
    if (n >= 8) {
      const win = closes.slice(-n);
      drift = linearSlope(win) / (win[win.length - 1] || 1);
    }

    const atr14 = ctx.indicators.atr14;
    const price = ctx.price;
    const atrPct = price > 0 ? atr14 / price : 0.003;

    // Banda de previsão: retorno esperado ± ATR
    const expectedRetPct = drift * 100 * n;
    const normalized = atrPct > 0 ? expectedRetPct / (atrPct * 100 * 3) : 0;
    const score = clampScore(normalized);
    const bandTightness = clampConf(0.5 + Math.min(0.3, 1 / (1 + atrPct * 60)));
    const confidence = clampConf(bandTightness);

    const direction =
      expectedRetPct > atrPct * 40 ? 'alta' : expectedRetPct < -atrPct * 40 ? 'baixa' : 'lateral';
    const reason = `KRONOS-FORECAST: previsão de vela ${direction} (ret. esperado ${expectedRetPct >= 0 ? '+' : ''}${expectedRetPct.toFixed(3)}% na janela de ${n} velas, ATR ${(atrPct * 100).toFixed(2)}%).`;

    return {
      agentId: this.agentId,
      name: this.name,
      role: this.role,
      baseWeight: this.baseWeight,
      score,
      confidence,
      side: sideOf(score, 0.15),
      reason,
      evidence: {
        windowBars: n,
        expectedRetPct: round(expectedRetPct, 4),
        atrPct: round(atrPct * 100, 3),
        forecastSource: 'deterministic_ohlcv_proxy_kronos',
      },
    };
  }
}

// ============================================================================
// 6. MIROFISH-SWARM — Agente de inteligência de enxame (proxy determinístico do
//    MiroFish — 666ghj/MiroFish, simulação de milhares de micro-agentes).
// ============================================================================
export class MirofishSwarmAgent {
  public readonly agentId = 'mirofish-swarm';
  public readonly name = 'MIROFISH-SWARM';
  public readonly role: CommitteeAgentRole = 'sentiment';
  public readonly baseWeight = 0.1;

  evaluate(ctx: CommitteeMarketContext): AgentVote {
    // Simulação de enxame: N micro-agentes atualizam crença por sentimento,
    // momentum e efeito de manada, por T iterações — tudo determinístico.
    const N = 200;
    const T = 8;
    const rng = this.mulberry(this.hashSymbol(ctx.symbol));

    const fngNorm = (ctx.fearGreed.value - 50) / 50;
    const momentumNorm = clampScore(ctx.change24h / 6);
    const momentumStrength = Math.abs(ctx.change24h) / 6;

    let beliefs: number[] = [];
    for (let i = 0; i < N; i++) {
      beliefs.push(clampScore(fngNorm * 0.5 + momentumNorm * 0.3 + (rng() - 0.5) * 0.6));
    }

    for (let t = 0; t < T; t++) {
      const meanBelief = beliefs.reduce((a, b) => a + b, 0) / N;
      const next: number[] = [];
      for (let i = 0; i < N; i++) {
        const herd = meanBelief * 0.4;
        const env = fngNorm * 0.3 + momentumNorm * (0.5 + momentumStrength * 0.5);
        const noise = (rng() - 0.5) * 0.2;
        next.push(clampScore(0.45 * beliefs[i] + 0.35 * herd + 0.35 * env + noise));
      }
      beliefs = next;
    }

    const score = clampScore(beliefs.reduce((a, b) => a + b, 0) / N);
    const dispersion = beliefs.reduce((a, b) => a + Math.abs(b - score), 0) / N;
    const confidence = clampConf(1 - dispersion / 1.2);

    const majority = score >= 0 ? 'comprador' : 'vendedor';
    const reason = `MIROFISH-SWARM: enxame de ${N} agentes converge para o lado ${majority} (crença média ${score >= 0 ? '+' : ''}${score.toFixed(2)}, dispersão ${(dispersion * 100).toFixed(0)}%).`;

    return {
      agentId: this.agentId,
      name: this.name,
      role: this.role,
      baseWeight: this.baseWeight,
      score,
      confidence,
      side: sideOf(score, 0.18),
      reason,
      evidence: {
        swarmSize: N,
        iterations: T,
        meanBelief: round(score, 3),
        dispersion: round(dispersion, 3),
        sentimentInput: round(fngNorm, 3),
        momentumInput: round(momentumNorm, 3),
      },
    };
  }

  private hashSymbol(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  private mulberry(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}

// ============================================================================
// 7. REGIME-GUARD — Classificador de Regime (agente novo, pesquisa r/algotrading)
// ============================================================================
export class RegimeGuardAgent {
  public readonly agentId = 'regime-guard';
  public readonly name = 'REGIME-GUARD';
  public readonly role: CommitteeAgentRole = 'regime';

  evaluate(ctx: CommitteeMarketContext): RegimeResult {
    const { slope, realizedVol, atr14 } = ctx.indicators;
    const price = ctx.price;
    const atrPct = price > 0 ? (atr14 / price) * 100 : 0;
    const slopeNorm = price > 0 ? (slope / price) * 10000 : 0; // bps por vela

    let label: RegimeLabel;
    let confidence = 0.5;
    let scaleByRole: Record<CommitteeAgentRole, number> = {
      technical: 1,
      momentum: 1,
      liquidity: 1,
      sentiment: 1,
      regime: 1,
      debate: 1,
    };

    if (realizedVol > 80 && atrPct > 0.6) {
      label = 'High Volatility';
      confidence = clampConf(0.6 + atrPct / 10);
      // Em volatilidade alta, sinais de tendência/momentum são ruidosos; liquidez manda.
      scaleByRole = { ...scaleByRole, technical: 0.6, momentum: 0.5, sentiment: 0.8 };
    } else if (Math.abs(slopeNorm) > 0.8 && realizedVol < 60) {
      label = slopeNorm > 0 ? 'Bull Trend' : 'Bear Trend';
      confidence = clampConf(0.65 + Math.min(0.25, Math.abs(slopeNorm) / 100));
      scaleByRole = { ...scaleByRole, technical: 1.1, momentum: 1.05, sentiment: 0.9 };
    } else if (realizedVol < 22 && atrPct < 0.25) {
      label = 'Low Volatility';
      confidence = 0.55;
      scaleByRole = { ...scaleByRole, technical: 0.85, momentum: 0.7 };
    } else {
      label = 'Mean Reverting';
      confidence = 0.5;
      scaleByRole = { ...scaleByRole, momentum: 0.5, technical: 0.7 };
    }

    const reason = `REGIME-GUARD: regime ${label} (vol real ${realizedVol.toFixed(1)}% a.a., ATR ${atrPct.toFixed(2)}%, inclinação ${slopeNorm.toFixed(2)} bps/vela).`;

    return {
      label,
      confidence,
      slopePerBar: slope,
      realizedVol,
      atrPct,
      scaleByRole,
      reason,
    };
  }
}

// ============================================================================
// 6. BULL-BEAR DEBATE — Debate dialético (agente novo, TradingAgents)
// ============================================================================
export class BullBearDebateAgent {
  public readonly agentId = 'bull-bear-debate';
  public readonly name = 'BULL-BEAR DEBATE';
  public readonly role: CommitteeAgentRole = 'debate';

  evaluate(votes: AgentVote[], regime: RegimeResult): DebateResult {
    // Pressão ponderada: quanto do "capital de convicção" está em cada lado
    let bullPressure = 0;
    let bearPressure = 0;
    let totalConf = 0;

    for (const vote of votes) {
      if (vote.role === 'regime' || vote.role === 'debate') continue;
      const w = vote.baseWeight;
      const c = vote.confidence;
      totalConf += w * c;
      if (vote.score > 0) bullPressure += w * c * vote.score;
      else if (vote.score < 0) bearPressure += w * c * Math.abs(vote.score);
    }

    if (totalConf > 0) {
      bullPressure = clamp(bullPressure / totalConf, 0, 1);
      bearPressure = clamp(bearPressure / totalConf, 0, 1);
    }

    const spread = Math.abs(bullPressure - bearPressure);
    const dispute =
      spread < 0.18 && (bullPressure + bearPressure) > 0.2 && regime.label === 'High Volatility';

    const reason = dispute
      ? 'BULL-BEAR DEBATE: impasse — teses divergem e o mercado está em alta volatilidade (disputa ativa).'
      : bullPressure >= bearPressure
        ? `BULL-BEAR DEBATE: tese compradora prevalece (${(bullPressure * 100).toFixed(0)}% vs ${(bearPressure * 100).toFixed(0)}%).`
        : `BULL-BEAR DEBATE: tese vendedora prevalece (${(bearPressure * 100).toFixed(0)}% vs ${(bullPressure * 100).toFixed(0)}%).`;

    return { bullPressure, bearPressure, dispute, reason };
  }
}

// ============================================================================
// Composição: avalia os 4 agentes votantes e os 2 agentes auxiliares.
// ============================================================================
export interface CommitteeEvaluation {
  votes: AgentVote[];
  regime: RegimeResult;
  debate: DebateResult;
}

export function evaluateCommittee(ctx: CommitteeMarketContext): CommitteeEvaluation {
  const sentinel = new SentinelOneAgent().evaluate(ctx);
  const velocity = new VelocityXAgent().evaluate(ctx);
  const nexus = new NexusDepthAgent().evaluate(ctx);
  const oracle = new OracleFngAgent().evaluate(ctx);
  const kronos = new KronosForecastAgent().evaluate(ctx);
  const mirofish = new MirofishSwarmAgent().evaluate(ctx);

  const votes = [sentinel, velocity, nexus, oracle, kronos, mirofish];
  const regime = new RegimeGuardAgent().evaluate(ctx);
  const debate = new BullBearDebateAgent().evaluate(votes, regime);

  return { votes, regime, debate };
}

export const WEIGHTS = {
  sentinel: 0.35,
  velocity: 0.3,
  nexus: 0.2,
  oracle: 0.15,
  kronos: 0.15,
  mirofish: 0.1,
} as const;

export const ORACLE_MAX_EFFECTIVE_WEIGHT = 0.2;
