# 🏛️ Meta-Pesquisa de Agentes de Trading — Comitê JARVIS

> Síntese de boas práticas coletadas em **Reddit (r/algotrading, r/algorithmictrading)**, **Hugging Face** e **repositórios GitHub**, aplicadas para **sistematizar código mais preciso e com análises melhores** para a arquitetura multi-agente do JARVIS Trading Hub.
>
> Data da pesquisa: 2026-09-11 · Fontes verificadas e linkadas na seção [Referências](#referências).

---

## 1. O problema encontrado no código anterior

O motor multi-bot anterior tomava decisões com base em **aleatoriedade** e não em análise:

- Direção da ordem escolhida por `Math.random() > 0.35` (viés fixo de 65% long);
- Indicadores (`rsi`, `emaDiff`, `volatility`) inventados com `Math.random()` a cada trade;
- Backtest com taxa de acerto fixa `Math.random() < 0.72` — resultado fabricado;
- Matriz de correlação "quântica" hard-coded (valores estáticos, sem cálculo real);
- Sem livro de ordens, sem Fear & Greed, sem gerenciador de risco por banca.

A comunidade é explícita sobre esses anti-padrões:

> *"LLMs are terrible at doing raw math on price data and will heavily hallucinate backtest results if you just feed them raw numbers. My setup is basically just using AI to help write the Python or MQL5 code, and then I run that actual code through MetaTrader 5 or Backtrader using real historical tick data."* — r/algotrading

> *"Agents need 3+ indicators to agree before entering are beating single-signal agents regardless of what LLM they run on. Strategy architecture > model choice."* — r/algotrading

**Decisão de engenharia:** substituir a aleatoriedade por cálculo determinístico e real de indicadores, manter execução e gerenciamento de risco **hard-coded** (não-LLM) e usar o consenso de múltiplos sinais como porta de entrada.

---

## 2. Arquitetura-alvo (estrutura JARVIS + agentes novos)

```
┌──────────────────────────────────────────────────────────────┐
│  MERCADO: velas 1m + livro L1 (Coinbase) + F&G (Alternative) │
│  (fallback sintético determinístico quando sem rede)          │
└──────────────────────────────┬───────────────────────────────┘
                               │
     ┌───────────────┬─────────┴─────────┬────────────────┐
     ▼               ▼                   ▼                ▼
 SENTINEL-1      VELOCITY-X         NEXUS-DEPTH       ORACLE-FNG
 (Técnico)       (Momentum)         (Liquidez)        (Sentimento)
 35%             30%                20%               15% (teto 20%)
     │               │                   │                │
     │   ┌───────────┴─────────┐         │                │
     │   ▼                     ▼         ▼                │
     │  REGIME-GUARD      BULL-BEAR DEBATE                │
     │  (novo — modula      (novo — dialético)            │
     │   pesos por regime)                               │
     └───────────────► MOTOR DE CONSENSO ◄────────────────┘
                     score [-1..+1] · confiança %
                              │
                              ▼
               RISK MANAGER ($100 · 2%/0.5% · $30/ativo
               · piso $5 · 3 perdas · drawdown diário)
                              │
                              ▼
               TRILHA DE AUDITORIA SHA-256 (append-only)
```

Os **4 agentes canônicos** foram mantidos fielmente (pesos 35/30/20/15 e teto de 20% no ORACLE-FNG). Dois **agentes novos** foram adicionados como moduladores, sem quebrar a especificação original.

---

## 3. Os 4 agentes canônicos — refinados com a pesquisa

### SENTINEL-1 — Técnico (35%)
- **Cálculo real** de RSI-14 (suavização de Wilder — convenção freqtrade/vectorbt), MACD (12, 26, 9) e SMA-10/30.
- Regras da especificação preservadas: sobrevenda com exaustão (RSI < 30 + cruzamento altista → **+0.90/72%**), sobrecompra com exaustão (RSI > 70 + divergência → **−0.90/72%**), Golden/Death Cross moderado na zona neutra.
- *Fonte:* convenções de indicadores do [freqtrade](https://github.com/freqtrade/freqtrade) e do módulo `indicators.py` do Lumibot já presente no repo.

### VELOCITY-X — Momentum & Fluxo (30%)
- Posição do preço dentro do range diário (`rangePosition`), Δ24h e **volume relativo** (surto de volume reforça convicção).
- Rompimento de alta/baixa com amortecimento na consolidação (evita falsos rompimentos — padrão citado em r/algotrading sobre sinais "que só funcionam num regime").

### NEXUS-DEPTH — Liquidez & Microestrutura (20%)
- Além do **spread em bps**, incorpora o **order book imbalance (−1..+1)** — métrica central de microestrutura documentada em repositórios de LOB:
  - [nkaz001/hftbacktest](https://github.com/nkaz001/hftbacktest) (market making com alpha de imbalance, dados L2/L3);
  - [joaquinbejar/OrderBook-rs](https://github.com/joaquinbejar/OrderBook-rs) (spread bps, microprice, imbalance).
- Spread apertado → apoia a direção do fluxo; spread aberto → **score zerado e confiança 25%** (amortecedor de slippage).

### ORACLE-FNG — Sentimento (15%, teto 20%)
- Feed da [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/) (0–100) normalizado para `score = (F&G − 50)/50`.
- **Cuidado documentado** pela própria indústria: o índice é **lagging** e não preditivo — *"use it as a sentiment map, not a trading command"* ([CFGI](https://cfgi.io/)). Por isso o peso é baixo e o teto é travado no código.

---

## 4. Agentes DESCOBERTOS na pesquisa

### 4.1 REGIME-GUARD (classificador de regime)
- **Fonte principal:** r/algotrading — *"Regime filtering. Market regimes exist and shift all the time. Build your algos to thrive in specific regimes, rather than it trying to profit in all of them."*
- Classifica o mercado em `Bull Trend`, `Bear Trend`, `High Volatility`, `Mean Reverting`, `Low Volatility` usando inclinação OLS, volatilidade realizada anualizada e ATR%.
- **Ação:** multiplica o peso efetivo de cada agente conforme o regime (ex.: em alta volatilidade, sinais de tendência/momentum perdem peso e a liquidez passa a dominar).
- Alinhado com o padrão **hierárquico/supervisor** descrito em [awesome-agent-orchestration](https://github.com/vivy-yi/awesome-agent-orchestration) (AutoGen/CrewAI/LangGraph): um supervisor re-pondera especialistas.

### 4.2 BULL-BEAR DEBATE (debate dialético)
- **Fonte principal:** [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) (arXiv:2412.20138) — pesquisadores Bull e Bear debatem em múltiplas rodadas antes da decisão.
- Calcula **pressão compradora/vendedora ponderada** e marca **IMPASSE** quando as teses divergem em alta volatilidade — nesse caso a confiança do consenso é reduzida (o desacordo é informativo: *"if they split it usually means the news is genuinely ambiguous and you should stay out"*, r/algotrading).

### 4.3 Candidatos avaliados e NÃO adotados (com justificativa)
| Agente/Framework | Motivo da não-adoção no núcleo |
|---|---|
| LLM "Price Action Reader" | Comunidade reporta **alucinação** e péssimo desempenho em matemática de preço; recomendado apenas como overlay discricionário. |
| FinGPT / CryptoBERT (sentimento por notícias) | Exigem modelo HF + infra de inferência; mantidos como **próxima extensão** (o ORACLE-FNG já cobre o papel de sentimento com latência baixa). |
| FinRL (deep RL) | RL em produção é pesado e propenso a overfitting de backtest; a meta-pesquisa recomenda começar por regras determinísticas + walk-forward. |
| CrewAI / LangGraph completos | Overhead de orquestração desproporcional para o escopo atual; o padrão foi **absorvido conceitualmente** (supervisor + debate) sem a dependência. |

---

## 5. Consenso, Risco e Auditoria — o que mudou

### 5.1 Consenso ponderado
- Peso efetivo = `base × escala de regime`; ORACLE-FNG **truncado em 20% antes da soma** (trava inviolável).
- `score = Σ(wᵢ·scoreᵢ)`, confiança = média ponderada **modulada pelo acordo** entre agentes — *"3+ indicators must agree"* (r/algotrading) — e pela disputa do debate.
- Matriz de resolução: **BUY** `score ≥ +0.25 ∧ confiança ≥ 0.55` · **SELL** `score ≤ −0.25 ∧ confiança ≥ 0.55` · **HOLD** caso contrário.

### 5.2 Risk Manager ($100)
| Salvaguarda | Valor |
|---|---|
| Trava de perdas consecutivas | 3 SL seguidos → HALT |
| Risco padrão | 2% ($2.00) |
| Modo Scalper (2FA) | 0.5% ($0.50) |
| Teto por ativo | $30 (até 3 posições) |
| Piso de caixa | $5.00 |
| Disjuntor de drawdown diário | congela ordens no limite |
| Custos modelados | slippage 0.05% + taxa 0.1% (boa prática de backtest realista) |

### 5.3 Auditoria SHA-256
- Cadeia append-only: `hash(i) = SHA256(prev_hash(i−1) + payload(i))` com validador de integridade.
- Eventos: `ORDER_FILLED`, `POSITION_CLOSED`, `RISK_VETO`, `HALT`, `CONFIG`.

### 5.4 Backtest honesto (substitui o `Math.random()`)
- Replay **barra-a-barra** (agentes → consenso → risco) sobre série sintética determinística, com métricas reais: win rate, PnL, retorno, **max drawdown** e **Sharpe**.
- **Rotulado como `synthetic`** — sem fabricar resultado de dados históricos que não existem (política "Zero Dados Falsos" do repo).
- A meta-pesquisa deixa claro que só há prova real com **walk-forward + out-of-sample + custos**; esse backtest é o *baseline determinístico*, não um claim de lucro.

---

## 6. Riscos e limitações (transparência obrigatória)

1. **Sem rede no ambiente** → o comitê roda em mercado **sintético determinístico** (proveniência `synthetic`); com rede, usa Coinbase Exchange + Alternative.me (`live`).
2. **Série sintética ≠ evidência de edge** — serve para validar a *engenharia* (indicadores, consenso, risco, auditoria), não para prometer rentabilidade.
3. **Fear & Greed é lagging** — peso baixo e teto travado por design.
4. **Execução em papel** — o comitê não injeta ordens nas contas multi-broker; é um motor de sinal + ledger de papel auditável.

---

## 7. Arquivos implementados

```
server/engine/committee/
├── indicators.ts       # RSI(Wilder), MACD, SMA, EMA, ATR, volatilidade, OLS
├── agents.ts           # SENTINEL-1, VELOCITY-X, NEXUS-DEPTH, ORACLE-FNG
│                       #   + REGIME-GUARD e BULL-BEAR DEBATE (novos)
├── consensus.ts        # ponderação, teto 20%, acordo, matriz de resolução
├── riskManager.ts      # banca $100, 2%/0.5%, $30/ativo, piso $5, 3 perdas, drawdown
├── auditChain.ts       # hash chain SHA-256 append-only + validador
├── marketData.ts       # Coinbase (candles/L1) + Alternative.me + fallback sintético
└── jarvisCommittee.ts  # orquestrador, snapshot e backtest determinístico

src/components/JarvisCommitteeView.tsx   # painel do comitê (nova aba)
src/services/api.ts · src/types.ts       # contrato da API
server.ts                                # rotas /api/jarvis/*
```

**Rotas:**
| Método | Rota | Função |
|---|---|---|
| GET | `/api/jarvis/committee` | snapshot completo |
| POST | `/api/jarvis/committee/evaluate` | avaliação forçada |
| POST | `/api/jarvis/committee/toggle` | iniciar/pausar tick |
| POST | `/api/jarvis/committee/config` | símbolo, auto-trade, modo scalper |
| POST | `/api/jarvis/committee/risk/release` | liberar trava de risco |
| POST | `/api/jarvis/committee/backtest` | backtest determinístico |
| GET | `/api/jarvis/audit/chain` | trilha de auditoria |

---

## 8. Próximos passos sugeridos (em ordem de valor)

1. **Walk-forward real**: plugar dados históricos OHLCV (freqtrade download-data / CCXT) e validar out-of-sample.
2. **FinGPT/CryptoBERT** como agente de sentimento de notícias (com cache e fallback).
3. **Livro L2 + microprice** para o NEXUS-DEPTH (dados de [hftbacktest](https://github.com/nkaz001/hftbacktest)).
4. **Parâmetro sensitivity test** (±10–20% de perturbação nos thresholds) — recomendação recorrente da comunidade.
5. **Gancho de execução**: rotear o veredito aprovado para as contas multi-broker existentes.

---

## Referências

### Reddit
1. [Results from pivoting an LLM from "Price Action Reader" to "Macro-Regime Detector"](https://www.reddit.com/r/algotrading/comments/1r8izk8/results_from_pivoting_an_llm_from_price_action/) — LLM como overlay/filtro, não executor; ensemble consensus.
2. [Built a multi-asset algo trading bot from scratch](https://www.reddit.com/r/algotrading/comments/1tdeu7b/built_a_multiasset_algo_trading_bot_from_scratch/) — consenso de 3 modelos reduz ruído; desacordo é informativo.
3. [Any tips on building trading system with multi agents using LLM?](https://www.reddit.com/r/algorithmictrading/comments/1mjip4e/any_tips_on_building_trading_system_with_multi/) — "feed it good quality data" / analytics em primeiro lugar.
4. [Has anyone tried Algo trading with Claude?](https://www.reddit.com/r/algotrading/comments/1srt3nl/has_anyone_tried_algo_trading_with_claude_if_yes/) — LLM escreve código; backtest roda em engine real; regime classifier.
5. [I built a platform where AI agents trade stocks autonomously](https://www.reddit.com/r/algotrading/comments/1sf8o4s/i_built_a_platform_where_ai_agents_trade_stocks/) — 3+ indicadores concordando batem agente único.
6. [Golden standard of backtesting?](https://www.reddit.com/r/algotrading/comments/1n54emf/golden_standard_of_backtesting/) — lookahead/survivorship/overfitting, custos+slippage, walk-forward.
7. [Problem with overfitting](https://www.reddit.com/r/algotrading/comments/1t70xws/problem_with_overfitting/) — walk-forward, sensitivity test, regime filtering.
8. [Backtesting without proper WFA is mostly just curve fitting](https://www.reddit.com/r/algotrading/comments/1rjwlit/backtesting_without_proper_wfa_is_mostly_just/) — WFA + noise testing + Monte Carlo.

### Hugging Face
9. [TradingAgents — paper (arXiv:2412.20138)](https://huggingface.co/papers/2412.20138) — analistas, debate Bull/Bear, risk team, trader.
10. [kk08/CryptoBERT](https://huggingface.co/kk08/CryptoBERT) — sentimento cripto fine-tuned sobre ProsusAI/finbert.
11. [rezacsedu/financial_sentiment_analysis_gpt2_model](https://huggingface.co/rezacsedu/financial_sentiment_analysis_gpt2_model) — GPT2 sobre FinGPT/fingpt-sentiment-train.
12. [FinGPT (AI4Finance)](https://github.com/AI4Finance-Foundation/FinGPT) — LLMs financeiros open-source e FinGPT-Forecaster.
13. [CFGI — Fear & Greed (metodologia)](https://cfgi.io/) — índice de sentimento, "sentiment map, not a trading command".

### GitHub
14. [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) — framework multi-agente LLM (LangGraph).
15. [freqtrade/freqtrade](https://github.com/freqtrade/freqtrade) — bot open-source com backtesting, hyperopt, FreqAI, lookahead-analysis.
16. [AI4Finance-Foundation/FinRL](https://github.com/AI4Finance-Foundation/FinRL) — deep RL para trading; FinRL_Crypto trata overfitting de DRL.
17. [nkaz001/hftbacktest](https://github.com/nkaz001/hftbacktest) — backtest HFT com order book imbalance (L2/L3).
18. [joaquinbejar/OrderBook-rs](https://github.com/joaquinbejar/OrderBook-rs) — spread bps, microprice, imbalance, depth analysis.
19. [LLMQuant/awesome-trading-agents](https://github.com/LLMQuant/awesome-trading-agents) — curadoria de agentes de trading (TradingAgents, MAHORAGA, FenixAI).
20. [vivy-yi/awesome-agent-orchestration](https://github.com/vivy-yi/awesome-agent-orchestration) — padrões de orquestração multi-agente.
