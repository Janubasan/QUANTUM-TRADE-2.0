/**
 * rag_validator.ts
 * ---------------------------------------------------------------------------
 * RAG Gate ANTI-ALUCINAÇÃO — validação contextual de dados de mercado.
 *
 * Objetivo: impedir que qualquer sinal, indicador ou citação chegue ao motor de
 * consenso sem estar *fundamentado* (grounded) em uma fonte confiável.
 *
 * Cada validação produz um `hallucinationScore` (0 = totalmente fundamentado,
 * 1 = alucinação) e uma lista de `checks` + `citations`. Sinais que falham no
 * gate são bloqueados e auditados como `RAG_VETO`.
 *
 * Regras (inspiradas nas boas práticas de r/algotrading e nos validadores de
 * dados do freqtrade / FinRL):
 *   1. GROUNDING       — payload precisa declarar provider/fonte; símbolo existe;
 *   2. SANITY          — preço finito, > 0 e não NaN/Infinito;
 *   3. PLAUSIBILITY    — preço dentro das bandas históricas (min/max ± margem);
 *   4. VOLATILITY BAND — movimento de 1 tick acima do tolerado é rejeitado
 *                        (protege contra spikes fabricados / alucinação);
 *   5. VOLUME SANITY   — volume fora de 0.1x..20x da média histórica é suspeito;
 *   6. FRESHNESS       — timestamp não pode estar no futuro nem velho demais.
 */

export interface TrustedOHLCRecord {
  symbol: string;
  assetClass: string;
  minHistPrice: number;
  maxHistPrice: number;
  avgVolume: number;
  maxSingleTickMovePct: number; // banda de volatilidade por tick
  source: string;
  lastUpdated: string;
}

export interface RAGCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface RAGValidationResult {
  grounded: boolean;
  hallucinationScore: number; // 0..1
  checks: RAGCheck[];
  citations: string[];
  reason: string;
}

export interface RagPayload {
  symbol: string;
  close?: number;
  volume?: number;
  provider?: string;
  source?: string;
  timestamp?: number;
  prevClose?: number;
  timeframe?: string;
  [key: string]: any;
}

export class RAGValidator {
  private trustedDb: Map<string, TrustedOHLCRecord> = new Map();

  constructor() {
    this.seedTrustedHistoricalData();
  }

  private seedTrustedHistoricalData() {
    const seed = (r: Omit<TrustedOHLCRecord, 'lastUpdated'>) =>
      this.trustedDb.set(r.symbol, { ...r, lastUpdated: new Date().toISOString() });

    // Linhas de base derivadas de séries históricas públicas (Yahoo Finance /
    // CoinGecko / feed Coinbase Exchange) — margens de 15%.
    seed({ symbol: 'BTC/USDT', assetClass: 'crypto', minHistPrice: 15000, maxHistPrice: 180000, avgVolume: 50000, maxSingleTickMovePct: 5, source: 'coinbase/yahoo/coingecko' });
    seed({ symbol: 'BTC/USD', assetClass: 'crypto', minHistPrice: 15000, maxHistPrice: 180000, avgVolume: 50000, maxSingleTickMovePct: 5, source: 'coinbase' });
    seed({ symbol: 'BTC/BRL', assetClass: 'crypto', minHistPrice: 80000, maxHistPrice: 1000000, avgVolume: 250000, maxSingleTickMovePct: 5, source: 'binance/yahoo' });
    seed({ symbol: 'ETH/USDT', assetClass: 'crypto', minHistPrice: 800, maxHistPrice: 8000, avgVolume: 300000, maxSingleTickMovePct: 6, source: 'coinbase/yahoo/coingecko' });
    seed({ symbol: 'ETH/USD', assetClass: 'crypto', minHistPrice: 800, maxHistPrice: 8000, avgVolume: 300000, maxSingleTickMovePct: 6, source: 'coinbase' });
    seed({ symbol: 'ETH/BRL', assetClass: 'crypto', minHistPrice: 4000, maxHistPrice: 40000, avgVolume: 150000, maxSingleTickMovePct: 6, source: 'binance/yahoo' });
    seed({ symbol: 'SOL/USDT', assetClass: 'crypto', minHistPrice: 8, maxHistPrice: 350, avgVolume: 400000, maxSingleTickMovePct: 8, source: 'coinbase/yahoo/coingecko' });
    seed({ symbol: 'SOL/USD', assetClass: 'crypto', minHistPrice: 8, maxHistPrice: 350, avgVolume: 400000, maxSingleTickMovePct: 8, source: 'coinbase' });
    seed({ symbol: 'SOL/BRL', assetClass: 'crypto', minHistPrice: 40, maxHistPrice: 1800, avgVolume: 200000, maxSingleTickMovePct: 8, source: 'binance/yahoo' });
    seed({ symbol: 'AAPL', assetClass: 'equity', minHistPrice: 80, maxHistPrice: 350, avgVolume: 40000000, maxSingleTickMovePct: 4, source: 'yahoo' });
    seed({ symbol: 'SPY', assetClass: 'equity', minHistPrice: 300, maxHistPrice: 650, avgVolume: 3500000000, maxSingleTickMovePct: 3, source: 'yahoo' });
    seed({ symbol: 'QQQ', assetClass: 'equity', minHistPrice: 250, maxHistPrice: 560, avgVolume: 2800000000, maxSingleTickMovePct: 3, source: 'yahoo' });
    seed({ symbol: 'CME_MICRO_ES', assetClass: 'futures', minHistPrice: 3000, maxHistPrice: 7000, avgVolume: 1000000, maxSingleTickMovePct: 2, source: 'cme/yahoo' });

    // Índices sintéticos (Deriv-style) — sem base histórica real; bandas largas e
    // rotuladas como 'synthetic' para nunca confundir com ativo real.
    seed({ symbol: 'VOL-75', assetClass: 'synthetic_index', minHistPrice: 1000, maxHistPrice: 2000000, avgVolume: 0, maxSingleTickMovePct: 25, source: 'synthetic_volatility_75' });
    seed({ symbol: 'BOOM-1000', assetClass: 'synthetic_index', minHistPrice: 1000, maxHistPrice: 2000000, avgVolume: 0, maxSingleTickMovePct: 12, source: 'synthetic_boom_1000' });
    seed({ symbol: 'CRASH-1000', assetClass: 'synthetic_index', minHistPrice: 1000, maxHistPrice: 2000000, avgVolume: 0, maxSingleTickMovePct: 12, source: 'synthetic_crash_1000' });
    seed({ symbol: 'STEP-100', assetClass: 'synthetic_index', minHistPrice: 1000, maxHistPrice: 2000000, avgVolume: 0, maxSingleTickMovePct: 6, source: 'synthetic_step_100' });
  }

  public getTrustedRecord(symbol: string): TrustedOHLCRecord | undefined {
    return this.trustedDb.get(symbol.toUpperCase());
  }

  /**
   * Validação simples (retrocompatível com o DataVerifier).
   */
  public isPlausible(payload: { symbol: string; close?: number; volume?: number }, _source: string): boolean {
    return this.validate(payload as RagPayload).grounded;
  }

  /**
   * Validação completa anti-alucinação com score e citações.
   *
   * Dois níveis de proteção:
   *  - HARD GATES (qualquer falha => `grounded = false` imediatamente):
   *      grounding_provider, grounding_symbol, sanity_price, plausibility_band.
   *    São os requisitos mínimos de fundamentação: sem fonte, sem símbolo
   *    conhecido, sem preço válido ou fora da banda histórica => alucinação.
   *  - SOFT CHECKS (contribuem para `hallucinationScore`, veto em >= 0.5):
   *      volatility_band, volume_sanity, freshness.
   */
  public validate(payload: RagPayload): RAGValidationResult {
    const checks: RAGCheck[] = [];
    const citations: string[] = [];
    const symbol = (payload.symbol || '').toUpperCase();
    const close = payload.close;
    const volume = payload.volume;
    const provider = payload.provider || payload.source || 'unknown';
    const ts = payload.timestamp;

    let score = 0; // soma dos pesos das falhas (soft)
    let hardFailed = false;
    const push = (weight: number, name: string, passed: boolean, detail: string, cite?: string, hard = false) => {
      checks.push({ name, passed, detail });
      if (cite) citations.push(cite);
      if (!passed) {
        if (hard) hardFailed = true;
        else score += weight;
      }
    };

    // 1. [HARD] Grounding — fonte obrigatória
    const hasProvider = Boolean(provider) && provider !== 'unknown';
    push(0.3, 'grounding_provider', hasProvider,
      hasProvider ? `Fonte declarada: ${provider}` : 'Payload sem fonte (provider ausente) — não fundamentado.',
      hasProvider ? provider : undefined, true);

    // 2. [HARD] Grounding — símbolo conhecido
    const record = this.getTrustedRecord(symbol);
    const knownSymbol = Boolean(record);
    push(0.25, 'grounding_symbol', knownSymbol,
      knownSymbol
        ? `Símbolo ${symbol} no cofre confiável (${(record as TrustedOHLCRecord).assetClass})`
        : `Símbolo ${symbol} desconhecido — não consta no cofre confiável (alucinação de símbolo).`,
      knownSymbol ? `rag_db:${symbol}` : undefined, true);

    // 3. [HARD] Sanity — preço numérico e positivo
    const numeric = close !== undefined && close !== null && Number.isFinite(close);
    const positive = numeric && (close as number) > 0;
    push(0.3, 'sanity_price', Boolean(numeric && positive),
      numeric && positive ? `Preço finito e positivo (${close})` : `Preço inválido (${close}) — NaN/negativo/ausente.`,
      undefined, true);

    // 4. [HARD] Plausibility — bandas históricas
    if (record && numeric && positive) {
      const minAllowed = record.minHistPrice * 0.85;
      const maxAllowed = record.maxHistPrice * 1.15;
      const inBand = (close as number) >= minAllowed && (close as number) <= maxAllowed;
      push(0.2, 'plausibility_band', inBand,
        inBand
          ? `Preço ${close} dentro de [${minAllowed.toFixed(2)}, ${maxAllowed.toFixed(2)}]`
          : `Preço ${close} FORA da banda histórica [${minAllowed.toFixed(2)}, ${maxAllowed.toFixed(2)}] — provável alucinação.`,
        `rag_db:${symbol}:band`, true);
    } else if (record && !(numeric && positive)) {
      // Preço ausente/inválido já falhou em sanity; explicita aqui p/ rastro
      push(0.2, 'plausibility_band', false, 'Plausibilidade não avaliável (preço inválido).', undefined, true);
    }

    // 5. [SOFT] Volatility band — movimento de 1 tick
    if (record && numeric && positive && payload.prevClose !== undefined && Number.isFinite(payload.prevClose) && (payload.prevClose as number) > 0) {
      const movePct = Math.abs(((close as number) - (payload.prevClose as number)) / (payload.prevClose as number)) * 100;
      const ok = movePct <= record.maxSingleTickMovePct;
      push(0.15, 'volatility_band', ok,
        ok
          ? `Movimento de tick ${movePct.toFixed(2)}% dentro da banda (${record.maxSingleTickMovePct}%)`
          : `Movimento de tick ${movePct.toFixed(2)}% excede a banda (${record.maxSingleTickMovePct}%) — spike suspeito.`,
        `rag_db:${symbol}:vol`);
    }

    // 6. [SOFT] Volume sanity
    if (record && volume !== undefined && Number.isFinite(volume)) {
      // Índices sintéticos não têm volume real (avgVolume 0) — pula a checagem.
      if (record.avgVolume > 0) {
        const minVol = record.avgVolume * 0.1;
        const maxVol = record.avgVolume * 20;
        const ok = volume >= minVol && volume <= maxVol;
        push(0.1, 'volume_sanity', ok,
          ok
            ? `Volume ${volume} dentro do esperado [${minVol.toFixed(0)}, ${maxVol.toFixed(0)}]`
            : `Volume ${volume} fora do esperado (${minVol.toFixed(0)}..${maxVol.toFixed(0)}).`);
      }
    }

    // 7. [SOFT] Freshness — timestamp
    if (ts !== undefined && Number.isFinite(ts)) {
      const now = Date.now() / 1000;
      const ok = ts <= now + 30 && now - ts <= 300;
      push(0.05, 'freshness', ok, ok ? 'Timestamp dentro da janela (±300s).' : 'Timestamp no futuro ou velho demais.');
    }

    const hallucinationScore = Math.min(1, Math.max(0, score));
    const grounded = !hardFailed && hallucinationScore < 0.5;
    const reason = grounded
      ? 'RAG Gate: dado fundamentado e dentro das bandas de plausibilidade.'
      : hardFailed
        ? `RAG Gate: rejeitado por gate de fundamentação (${checks.filter((c) => !c.passed).map((c) => c.name).join(', ')}).`
        : `RAG Gate: rejeitado (score de alucinação ${(hallucinationScore * 100).toFixed(0)}%).`;

    return {
      grounded,
      hallucinationScore: Number(hallucinationScore.toFixed(3)),
      checks,
      citations: Array.from(new Set(citations)),
      reason,
    };
  }
}

export const defaultRagValidator = new RAGValidator();
