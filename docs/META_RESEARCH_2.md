# 🔬 Meta-Pesquisa v2 — Kronos, OpenAlice (Agentic Alice), MiroFish & Stack Validado

> Pesquisa em **Reddit, X (Twitter), YouTube e GitHub** (2026-09-11) para a reestruturação do JANUTRADE.
> Cada fonte abaixo fundamenta uma decisão de arquitetura implementada no repositório.

---

## 1. Os 3 repositórios solicitados

### 1.1 Kronos — `shiyu-coder/Kronos` (Tsinghua University)
- **O que é:** primeiro *foundation model* open-source para sequências K-line (OHLCV), treinado em 12 bilhões de candles de 45+ exchanges globais. Modelo "GPT para gráficos de preço" com tokenizer especializado. Aceito no **AAAI 2026**. ~23.3k⭐, licença MIT.
- **Família de modelos:** Mini (4.1M) → Small (24.7M) → Base (102.3M) → Large (499.2M, ainda proprietário). Contexto 512–2048 tokens. Integração com Qlib e Hugging Face.
- **Aplicação prática no JANUTRADE:** rodar PyTorch não é viável no sandbox (sem rede/Git LFS). Implementamos um **proxy determinístico** `KRONOS-FORECAST` — previsão OHLCV por janela (tendência OLS + banda ATR) que ocupa o MESMO papel no comitê (sinal de previsão de vela, peso 15%). A porta para o modelo real fica documentada (ver §5).
- **Riscos conhecidos:** o repo tem **2 bugs abertos** (tokenizer e `top_k` usado como função) que precisam de patch manual antes de qualquer inferência — relatado no `derrickhabibii/kronos-trading`. Por isso o proxy determinístico é o padrão seguro.

### 1.2 OpenAlice / "Agentic Alice" — `TraderAlice/OpenAlice`
- **O que é:** "one-person Wall Street" — mesa de trading self-hosted (research desk + quant team + trading floor + risk officer) para Claude Code/Codex/OpenCode. Node/TS, licença **AGPL-3.0**. 5.4k⭐.
- **Conceitos-chave absorvidos:**
  1. **UTA (Unified Trading Account)** — cada conta é uma entidade com conexão de broker, histórico git e *guard pipeline*; o agente NUNCA fala com o broker diretamente.
  2. **Trading-as-Git (TaG)** — operações são *staged* (com commit hash de 8 chars), revisadas e **aprovadas por humano** antes de tocar o broker. *"The broker waits for you."*
  3. **Segurança por padrão:** começar sempre em simulator/paper/demo/testnet; credenciais seladas em repouso.
- **Aplicação prática:** a **Mesa ALICE** foi adicionada ao RiskManager do Comitê JARVIS — quando ativada, o sinal do comitê vira uma *operação staged* com commit hash (evento `STAGED`) e só executa após `approveOperation` (eventos `APPROVED`/`REJECTED`). Padrão exibido na UI (aba Comitê JARVIS).

### 1.3 MiroFish — `666ghj/MiroFish`
- **O que é:** engine de **swarm intelligence** que "spawna milhares de agentes com personalidade e memória" para simular como sentimento e opinião pública evoluem antes de virar preço. #1 no GitHub Trending (mar/2026). Stack Python 3.11 + Vue, usa GraphRAG e Zep Cloud (memória).
- **Papel correto (limitação documentada pelo próprio maintainer):** é uma **camada de sinal/pesquisa, NÃO um motor de execução** e **não** é preditor calibrado de preço. *"Use MiroFish as a directional signal, not a standalone trigger."*
- **Aplicação prática:** o agente **`MIROFISH-SWARM`** (peso 10%) simula um enxame de 200 micro-agentes que atualizam crença por sentimento (F&G), momentum e **efeito de manada**, produzindo um voto de sentimento agregado + dispersão. Determinístico e rotulado como proxy.

---

## 2. O que é realmente validado (Reddit/X/YouTube)

Fonte consolidada: **"Top 20 Open Source AI Trading Tools"** (X, jul/2026) e threads de r/algotrading.

| Camada | Ferramenta validada | Uso no JANUTRADE |
|---|---|---|
| **Brains** (análise) | TradingAgents (96k⭐), ai-hedge-fund (62k⭐), Qlib (47k⭐) | debate Bull-Bear + RAG gate |
| **Hands** (execução) | freqtrade (52k⭐), NautilusTrader (25k⭐, Rust), OctoBot | conformidade de corretora + timeframes |
| **Eyes** (dados) | OpenBB (70k⭐), tradingview-mcp | price aggregator + fontes |
| **Memory** (memória/auditoria) | moss-trade-bot-skills, cbt-framework, tradememory-protocol | trilha SHA-256 + ledger de operações |

**Alertas críticos da comunidade (aplicados):**
- *"Only two of these [AI/ML bots] execute live crypto trades. Star count measures interest, not capability."* → o JANUTRADE mantém execução em **paper/demo** e deixa claro quando um agente é proxy.
- *"Paper trading is good but still miles away from live trading."* → honestidade de rótulos em toda a UI.
- *"The same code backtests and trades live, deterministically"* (NautilusTrader) → o backtest do comitê usa o **mesmo** pipeline agente→consenso→risco do tick ao vivo.
- freqtrade com **lookahead-analysis**, custos+slippage e walk-forward → implementados (custos reais no RiskManager; backtest determinístico).

---

## 3. O que foi implementado nesta reestruturação

### 3.1 RAG Gate anti-alucinação (totalmente contra alucinações)
`server/validation/rag_validator.ts` reescrito: cada payload passa por 7 checks com **score de alucinação** (0 = fundamentado, 1 = alucinação):
1. `grounding_provider` — fonte obrigatória;
2. `grounding_symbol` — símbolo no cofre confiável;
3. `sanity_price` — preço finito/positivo;
4. `plausibility_band` — bandas históricas ±15%;
5. `volatility_band` — movimento de 1 tick acima do tolerado = spike suspeito;
6. `volume_sanity` — volume 0.1x..20x da média;
7. `freshness` — timestamp válido.

No comitê, dados **não fundamentados** → veredito forçado a `HOLD` + evento de auditoria **`RAG_VETO`**. Cada decisão carrega citações (`citations`).

### 3.2 Índices sintéticos + random match
- `server/engine/committee/syntheticIndices.ts`: `VOL-75`, `BOOM-1000`, `CRASH-1000`, `STEP-100` — perfis Deriv-style (vol, drift, spikes, ciclos), **sempre rotulados `synthetic_index`** e validados pelo RAG com bandas largas + rótulo sintético.
- **Random match determinístico:** o mercado sintético (cripto ou índice) é gerado por PRNG semeado por símbolo — mesma entrada ⇒ mesma série (reprodutível), permitindo *matching* de séries entre execuções e entre agentes.

### 3.3 Auto-runnable com tempos aceitos nas corretoras
- `server/regulator/marketRules.ts` já definia `AUDITED_TIMEFRAMES` (1m..1h) e `EXCHANGE_RULES` (B3 1/30/1000; US 2/50/1200; Crypto 5/60/1200).
- O comitê agora respeita **rate limit + intervalo mínimo por exchange** e só entra na janela de fechamento do candle 1m (`complianceCanTrade`), expondo `compliance` no snapshot (exchange, timeframe, veto).

### 3.4 Banca demo multi-carteira (todas as carteiras + blockchain + MetaMask)
- O cabeçalho (Navbar) agora lista **saldos por carteira** (demo USD, demo BRL, MetaMask 🦊, blockchain ⛓️) + **Win Rate, trades, posições abertas** em tempo real.
- Saldos on-chain/ETH não são fabricados — quando a carteira e o RPC existirem, os endpoints `/api/onchain/*` retornam o saldo real (política Zero Dados Falsos).

### 3.5 Frontend 3D neon + motion
- `src/components/NeonBackground.tsx`: canvas 3D com partículas pseudo-3D, constelação e brilho ciano/violeta (desliga em aba oculta).
- `motion/react`: transição de abas (fade + slide).
- `index.css`: utilities `.neon-text`, `.neon-border`, `.neon-card`, `.neon-glow-*`.

### 3.6 Comitê com 6 agentes votantes
Pesos base (normalizados no consenso): SENTINEL-1 35% · VELOCITY-X 30% · NEXUS-DEPTH 20% · ORACLE-FNG 15% (teto 20%) · **KRONOS-FORECAST 15%** · **MIROFISH-SWARM 10%** — mais moduladores REGIME-GUARD e BULL-BEAR DEBATE.

---

## 4. Rotas novas

| Método | Rota | Função |
|---|---|---|
| POST | `/api/jarvis/committee/desk` | liga/desliga Mesa ALICE (aprovação humana) |
| POST | `/api/jarvis/committee/ops/approve` | aprova operação staged |
| POST | `/api/jarvis/committee/ops/reject` | rejeita operação staged |

O snapshot `/api/jarvis/committee` agora inclui `validation` (RAG), `compliance` (corretora) e `risk.stagedOperations` (mesa ALICE).

---

## 5. Próximos passos (portas abertas para os modelos reais)

1. **Kronos real:** clonar `shiyu-coder/Kronos` + aplicar os 2 patches conhecidos; substituir o proxy `KRONOS-FORECAST` pela inferência `Kronos-small` (NeoQuasar/Kronos no HF) quando houver GPU/network.
2. **MiroFish real:** rodar o swarm (Python 3.11 + Vue) como *layer de sinal overnight* e injetar a saída no `MIROFISH-SWARM` via endpoint/arquivo.
3. **OpenAlice real:** usar a UTA/Trading-as-Git completa como camada de execução multi-broker (CCXT/Alpaca/IBKR) — já temos o padrão de staged/approve.
4. **Walk-forward com dados reais** (freqtrade download-data) para validar o comitê out-of-sample.
5. **Feeds on-chain ao vivo** para saldos MetaMask/ETH no cabeçalho (hoje exibidos apenas quando disponíveis).

---

## Referências

1. [Kronos — explainx.ai (AAAI 2026)](https://explainx.ai/blog/kronos-foundation-model-financial-candlesticks-aaai-2026) · repo [shiyu-coder/Kronos](https://github.com/shiyu-coder/Kronos)
2. [wincy.eth no X — repos de finanças que mais crescem](https://x.com/gusik4ever/status/2045469263255724233)
3. [derrickhabibii/kronos-trading — bugs conhecidos do Kronos](https://github.com/derrickhabibii/kronos-trading)
4. [TraderAlice/OpenAlice (GitHub)](https://github.com/TraderAlice/OpenAlice) · [openalice.ai](https://www.openalice.ai/)
5. [666ghj/MiroFish (GitHub)](https://github.com/666ghj/MiroFish) · [discussion #280 — limite: sinal, não execução](https://github.com/666ghj/MiroFish/discussions/280)
6. [r/OpenClawInstall — MiroFish #1 no Trending](https://www.reddit.com/r/OpenClawInstall/comments/1rwv2kq/mirofish_just_hit_1_on_github_trending_it_spawns/)
7. [Top 20 Open Source AI Trading Tools (X)](https://x.com/Axel_bitblaze69/article/2074224655179899170)
8. [r/SmartChainGems — best crypto trading bot 2026](https://www.reddit.com/r/SmartChainGems/comments/1tixaaf/best_crypto_trading_bot_in_2026_for_automated/)
9. [coincodecap — 5 Best Open-Source Crypto Trading Bots](https://coincodecap.com/open-source-trading-bots-on-GitHub)
10. [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) · [freqtrade/freqtrade](https://github.com/freqtrade/freqtrade) · [nautechsystems/NautilusTrader](https://github.com/nautechsystems/nautilus_trader)
