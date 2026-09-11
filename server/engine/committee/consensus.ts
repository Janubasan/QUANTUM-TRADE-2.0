/**
 * consensus.ts
 * ---------------------------------------------------------------------------
 * Motor de Consenso Ponderado do Comitê JARVIS.
 *
 * A cada rodada (tick) executa a ponderação vetorial:
 *   1. peso efetivo = base(i) * escala de regime(i); ORACLE-FNG é truncado no
 *      teto inviolável de 20% ANTES da soma;
 *   2. normalização dos pesos;
 *   3. score agregado = Σ(w_i · score_i);
 *   4. confiança = Σ(w_i · conf_i) modulada pelo acordo entre agentes
 *      (boa prática da pesquisa: exigir convergência de múltiplos sinais) e
 *      pela disputa do debate Bull-Bear;
 *   5. matriz de resolução: BUY / SELL / HOLD.
 */

import {
  AgentVote,
  DebateResult,
  ORACLE_MAX_EFFECTIVE_WEIGHT,
  RegimeResult,
} from './agents.js';
import { clamp, round } from './indicators.js';

export interface ConsensusResult {
  score: number; // -1 .. +1
  confidence: number; // 0 .. 1
  side: 'LONG' | 'SHORT' | 'NEUTRAL';
  verdict: 'BUY' | 'SELL' | 'HOLD';
  bullPressure: number;
  bearPressure: number;
  agreement: number; // 0..1
  dispute: boolean;
  effectiveWeights: Record<string, number>;
  reasons: string[];
}

export const BUY_THRESHOLD = 0.25;
export const SELL_THRESHOLD = -0.25;
export const CONFIDENCE_THRESHOLD = 0.55;

export function resolveConsensus(
  votes: AgentVote[],
  regime: RegimeResult,
  debate: DebateResult
): ConsensusResult {
  // 1. Peso efetivo com teto do ORACLE-FNG e modulação de regime
  const rawWeights: Record<string, number> = {};
  for (const vote of votes) {
    let w = vote.baseWeight;
    if (vote.role === 'sentiment') {
      w = Math.min(w, ORACLE_MAX_EFFECTIVE_WEIGHT); // trava hard-coded (20%)
    }
    const regimeScale = regime.scaleByRole[vote.role] ?? 1;
    rawWeights[vote.agentId] = w * regimeScale;
  }

  const totalWeight = Object.values(rawWeights).reduce((a, b) => a + b, 0) || 1;
  const effectiveWeights: Record<string, number> = {};
  for (const [id, w] of Object.entries(rawWeights)) {
    effectiveWeights[id] = round(w / totalWeight, 4);
  }

  // 2. Score agregado ponderado
  let score = 0;
  let weightedConf = 0;
  let directionalAgreementWeight = 0;
  let matchingWeight = 0;

  for (const vote of votes) {
    const w = effectiveWeights[vote.agentId] ?? 0;
    score += w * vote.score;
    weightedConf += w * vote.confidence;
    directionalAgreementWeight += w;
    if (score * vote.score >= 0) matchingWeight += w; // mesmo lado que o agregado
  }

  score = clamp(score, -1, 1);
  weightedConf = clamp(weightedConf, 0, 1);

  // 3. Acordo entre agentes (fração de peso no lado majoritário)
  const agreement = directionalAgreementWeight > 0 ? matchingWeight / directionalAgreementWeight : 0.5;

  // 4. Confiança final: média ponderada suavizada por acordo e disputa
  let confidence = weightedConf * (0.6 + 0.4 * agreement);
  if (debate.dispute) confidence *= 0.7; // impasse Bull-Bear reduz convicção
  confidence = clamp(confidence, 0, 1);

  // 5. Pressões direcionais (exibição)
  let bullPressure = 0;
  let bearPressure = 0;
  for (const vote of votes) {
    const w = effectiveWeights[vote.agentId] ?? 0;
    if (vote.score > 0) bullPressure += w * vote.score;
    else bearPressure += w * Math.abs(vote.score);
  }
  const pressureSum = bullPressure + bearPressure || 1;
  bullPressure = round(bullPressure / pressureSum, 3);
  bearPressure = round(bearPressure / pressureSum, 3);

  // 6. Matriz de resolução
  let verdict: ConsensusResult['verdict'] = 'HOLD';
  let side: ConsensusResult['side'] = 'NEUTRAL';
  if (score >= BUY_THRESHOLD && confidence >= CONFIDENCE_THRESHOLD) {
    verdict = 'BUY';
    side = 'LONG';
  } else if (score <= SELL_THRESHOLD && confidence >= CONFIDENCE_THRESHOLD) {
    verdict = 'SELL';
    side = 'SHORT';
  }

  const reasons = votes
    .filter((v) => Math.abs(v.score) >= 0.25)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .map((v) => v.reason);

  return {
    score: round(score, 4),
    confidence: round(confidence, 4),
    side,
    verdict,
    bullPressure,
    bearPressure,
    agreement: round(agreement, 4),
    dispute: debate.dispute,
    effectiveWeights,
    reasons,
  };
}
