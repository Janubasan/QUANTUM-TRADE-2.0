# 📡 Guia do Espelho TradingView (visualizar + replicar)

## Visão geral
Toda operação dos 4 bots é publicada em tempo real no **feed do espelho** e pode ser
replicada em qualquer venue integrada. Direção dupla:
- **OUT (bots → mundo):** `GET /mirror/feed` (SSE), `GET /mirror/trades`, dashboard `/mirror`.
- **IN (TradingView → bots):** `POST /tv/webhook` recebe alertas do Pine Script (HMAC/secret).

## Passo 1 — Colar o Pine Script (5 min por bot)
1. Abra `pinescript/sol_breakout_30m.pine` (ou eth/regime/orb).
2. TradingView → Pine Editor → colar → *Add to chart*.
3. *Create Alert* → Condition = estratégia → Webhook URL:
   `https://SEU-HOST/tv/webhook`
4. Message = o JSON do topo do arquivo `.pine` (já inclui `secret`, `bot_id`, `action` etc.).

## Passo 2 — Ver ao vivo
- Dashboard: `https://SEU-HOST/mirror` (gráfico TV embutido + mesa live + auditoria).
- REST: `GET /mirror/trades?limit=50` • SSE: `GET /mirror/feed` • Saúde: `GET /mirror/status`.

## Passo 3 — Replicar (copy)
`POST /mirror/replicate/:tradeId` com header `x-mirror-key: $MIRROR_API_KEY`:
```json
{ "venue": "paper", "sizeMultiplier": 1.0 }
```
- Default `paper` (simulado, seguro). Para real: `venue: binance|bybit|...` **exige**
  `LIVE_TRADING=true` + credenciais + testnet desligada conscientemente.
- Resposta inclui `replicatedTradeId`, `auditHash` e `explorerUrl` (quando on-chain).

## Formato do alerta TradingView (IN)
```json
{
  "secret": "quantum_mirror_tv_secret_2026",
  "bot_id": "sol-breakout-30m",
  "symbol": "SOL/USDT",
  "action": "buy",
  "price": 154.80,
  "timeframe": "30m",
  "order_id": "TV-sol-{{time}}",
  "timestamp": 1757347200
}
```
Regras: `order_id` único (dedupe), atraso ≤ 10s, slippage ≤ 0.8% vs mercado, risco por
operação herdado do bot. Tudo auditado em hash-chain.
