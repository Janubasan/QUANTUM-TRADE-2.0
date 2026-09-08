# 📊 Specs auditadas dos 4 bots (fonte da verdade)

> Parâmetros **auditados** — qualquer mudança exige re-auditoria e novo `AUDIT-*`.
> Implementação: `src/bots/strategies.ts`. Espelho Pine: `pinescript/*.pine`.

## 1. SOL Momentum Breakout (30m) — Rank #1
- **Ativo/TF:** SOL/USDT • 30m • **Win 76.5% • Sharpe 0.75 • TP 2.5x / SL 1.0x • risco 0.5%**
- **Lógica:** afunilamento de volatilidade (largura de banda < percentil 20 em 50 barras) →
  expansão acima da **EMA50** + **volume > 1.5x** da média de 20 → entrada a favor do fluxo.
  SL abaixo da mínima do candle gatilho; **Trailing ATR(14)** dinâmico; alvos assimétricos escalonados.
- **Código:** `solMomentumBreakout(candles)` — `volSqueeze`, `ema50`, `volRatio`, `atrTrailing`.

## 2. ETH Quantum Trend Wave (10m) — Rank #2
- **Ativo/TF:** ETH/USDT • 10m • **Win 73.4% • Sharpe 0.22 • TP 2.2x / SL 1.0x • risco 0.5%**
- **Lógica:** alinhamento triplo **EMA20 > EMA50 > VWAP diária** (long) ou inverso (short)
  após **contração de volatilidade**; ignora consolidação lateral (ADX < 18 veta).
  **Scale-out**: 50% no 1º desvio-padrão, resto no trailing; **divergência de momentum** (RSI) encerra.
- **Código:** `ethTrendWave(candles)` — `emaStack`, `vwapDaily`, `adxGate`, `rsiDivergence`.

## 3. Multi-Agent Regime Desk (5m) — Rank #3
- **Ativo/TF:** BTC/USDT • 5m • **Win 63.1% • Sharpe 0.18 • TP 2.0x / SL 1.0x • risco 0.5%**
- **Lógica (comitê de 4 papéis):**
  1. **Supervisor de Regime:** EMA50 slope + ADX → `trend | mean-reversion | chop`
  2. **Agente Bullish:** score de fluxo (suporte, CVD proxy, RSI recuperação)
  3. **Agente Bearish:** score de exaustão (resistência, volume climax, RSI sobrecompra)
  4. **Red Team (veto mandatório):** veta se vol implícita > teto, spread/slippage estimado > 0.8%,
     ou assimetria líquida < 1.5R após custos.
- **Código:** `regimeDesk(candles)` — retorna `{ regime, bullScore, bearScore, veto, decision }`.

## 4. Quant-Bot ORB & Monte Carlo (15m) — Rank #4
- **Ativo/TF:** BTC/USDT • 15m (adaptável CME Micro) • **Win 58.9% • Sharpe 0.28 • TP 2.5x / SL 1.0x • risco 0.4%**
- **Lógica:** fixa máxima/mínima dos **primeiros 15 min do ciclo** (opening range NY/Londres);
  rompimento com confirmação de fluxo → antes de enviar, roda **500 simulações de Monte Carlo**
  (retornos embaralhados + slippage/taxas) e só executa se P(ruína no trailing drawdown) < teto.
- **Código:** `orbMonteCarlo(candles, sessionOpen)` — `openingRange`, `monteCarloGate(500)`.
