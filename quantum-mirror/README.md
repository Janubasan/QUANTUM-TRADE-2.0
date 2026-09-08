# ⚛️ QUANTUM MIRROR — Audited Multi-Bot Trading System with TradingView Mirror

> **Espelho auditado, pronto para o mercado.** 4 bots quantitativos rodando em conta demo de **$100 USD**,
> com trilha de auditoria hash-chain, matriz de integrações **corretoras • carteiras • blockchains**
> (resultado de meta-pesquisa GitHub/Quora/Reddit/docs oficiais) e **espelhamento total no TradingView**
> (Pine Script + webhooks + feed público replicável).

Este diretório é um **projeto standalone** — pode ser publicado como um **novo repositório** independente
(ver `scripts/export-new-repo.sh`). Ele foi construído *em cima* do `QUANTUM-TRADE-2.0`
(reaproveita os conceitos de `BrokerAdapter`, `OperationalGuard`, `AuditLogger` e `WebhookEngine`).

---

## 🤖 Os 4 Bots (parâmetros auditados — NÃO alterar sem re-auditoria)

| Rank | Bot | Ativo/TF | Estratégia | Win Rate | Sharpe | TP/SL | Risco |
|------|-----|----------|------------|----------|--------|-------|-------|
| 🥇 #1 | **SOL Momentum Breakout** | SOL/USDT 30m | Quantum Momentum Breakout + Trailing ATR | 76.5% | 0.75 | 2.5x/1.0x | 0.5% |
| 🥈 #2 | **ETH Quantum Trend Wave** | ETH/USDT 10m | Ondas de Tendência Multi-Médias + VWAP | 73.4% | 0.22 | 2.2x/1.0x | 0.5% |
| 🥉 #3 | **Multi-Agent Regime Desk** | BTC/USDT 5m | Desk Multi-Agente + Red Team Veto | 63.1% | 0.18 | 2.0x/1.0x | 0.5% |
| #4 | **Quant-Bot ORB & Monte Carlo** | BTC/USDT 15m | Opening Range Breakout + 500 simulações MC | 58.9% | 0.28 | 2.5x/1.0x | 0.4% |

Definições técnicas completas: [`docs/STRATEGIES.md`](docs/STRATEGIES.md).

---

## 🧩 Integrações prontas (plug-and-play)

Resultado da meta-pesquisa em [`research/META_RESEARCH.md`](research/META_RESEARCH.md).
Tudo vem com `status: ready` (REST assinado + testnet) ou `status: stub` (interface pronta, só plugar credencial).

**Corretoras (exchanges/CEX):** Binance, Bybit, OKX, Coinbase Advanced, Kraken, Alpaca, MT5 Bridge, cTrader
**Carteiras (wallets):** MetaMask/EVM, Phantom/Solana, WalletConnect, Coinbase Wallet (Base App), Trust Wallet, Ledger
**Blockchains/redes:** Ethereum, Solana, Base, Arbitrum, BSC, Polygon (+ testnets Sepolia, Base Sepolia, Devnet)
**DEXs:** Uniswap V3, Jupiter (Solana), PancakeSwap — via routers configurados em `src/integrations/chains.ts`

Chaveamento por `.env`: `EXECUTION_VENUE=paper|binance|bybit|okx|coinbase|kraken|mt5|ctrader|onchain`
Segurança: testnet por padrão (`LIVE_TRADING=false` trava real), HMAC-SHA256, kill-switch global.

---

## 📡 Espelho TradingView (ver + replicar no mundo real)

1. **Pine Script pronto** em `pinescript/` (1 arquivo por bot) — cole no TradingView → Add Alert → Webhook.
2. **Feed público ao vivo**: `GET /mirror/feed` (SSE) + `GET /mirror/trades` (REST) — cada operação dos bots
   é publicada com preço, direção, TP/SL, auditoria hash e payload de replicação.
3. **Dashboard público**: abra `/mirror` — gráfico TradingView embutido + mesa de operações em tempo real.
4. **Replicação 1-clique**: `POST /mirror/replicate/:tradeId` gera ordem espelhada na sua venue configurada
   (paper por padrão; exige `LIVE_TRADING=true` + credenciais para real).

Guia completo: [`docs/TRADINGVIEW_MIRROR.md`](docs/TRADINGVIEW_MIRROR.md).

---

## 🚀 Rodar (conta demo $100, dados reais de mercado)

```bash
cd quantum-mirror
npm install
cp .env.example .env   # já vem paper + testnet + LIVE_TRADING=false
npm run dev            # API + runner 24/7 + mirror em http://localhost:3100/mirror
```

Dados de mercado: **klines reais** da Binance pública (sem chave) para SOL/USDT, ETH/USDT, BTC/USDT.
Sem rede? O runner usa fallback sintético calibrado e marca `dataQuality: "synthetic"`.

| Script | O quê |
|--------|-------|
| `npm run dev` | servidor + runner 24/7 (demo $100) |
| `npm run backtest` | backtest dos 4 bots em klines reais |
| `npm run smoke` | teste de fumaça: integrações + bots + mirror |
| `npm run build` / `npm start` | produção |

---

## 🔐 Auditoria

Cada trade gera bloco hash-chain (`prevHash → hash` SHA-256) em `data/audit-*.jsonl`,
verificável em `GET /api/audit/verify`. Nenhum número é inventado: PnL, win rate e Sharpe
são derivados dos fills registrados.

---

## 📁 Estrutura

```
quantum-mirror/
├── research/META_RESEARCH.md      # meta-pesquisa: rankings + fontes
├── docs/STRATEGIES.md             # specs auditadas dos 4 bots
├── docs/TRADINGVIEW_MIRROR.md     # guia do espelho TradingView
├── pinescript/                    # 4 estratégias Pine (TradingView)
├── src/
│   ├── integrations/              # corretoras, carteiras, chains, registry
│   ├── bots/                      # indicadores + 4 estratégias + risco
│   ├── engine/                    # market-data, conta demo $100, auditoria, runner
│   ├── tradingview/               # webhook receiver + mirror feed + replicate
│   ├── server.ts                  # Express API + dashboard
│   └── backtest.ts                # backtest CLI
├── public/mirror.html             # dashboard público replicável
└── scripts/export-new-repo.sh     # publica isto como repositório novo
```
