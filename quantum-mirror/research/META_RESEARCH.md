# 🔎 Meta-pesquisa: corretoras, carteiras e blockchains mais aceitas (2025–2026)

**Metodologia:** cruzamento de rankings e guias de integração de múltiplas fontes públicas
(docs oficiais, comparadores de API, rankings de carteiras e ecossistema de bots),
priorizando: (1) qualidade da API para bots, (2) liquidez/taxas, (3) ambiente testnet/paper,
(4) adoção por desenvolvedores, (5) compatibilidade com TradingView/webhooks.

> Data da pesquisa: 2026-09-08. Revalide trimestralmente — taxas e APIs mudam.

---

## 1. Corretoras / Exchanges (ranking para bots)

| Rank | Venue | Por quê | API | Testnet | Taxas base* | Status aqui |
|------|-------|---------|-----|---------|-------------|-------------|
| 🥇 1 | **Binance** | Melhor API geral, maior liquidez, 1400+ pares, testnet spot | REST+WS, HMAC-SHA256, peso 6000/min | ✅ Spot Testnet | 0.10%/0.10% spot, 0.02%/0.05% fut | `ready` |
| 🥈 2 | **Bybit V5** | Melhor para bots/derivativos: spot+perp+options numa API unificada, testnet | REST+WS unificados | ✅ Testnet | 0.10%/0.10% spot, 0.02%/0.055% fut | `ready` |
| 🥉 3 | **OKX** | Conta unificada USD, demo trading, ótimo WebSocket | REST+WS, HMAC | ✅ Demo | 0.08%/0.10% spot, 0.02%/0.05% fut | `ready` |
| 4 | **Coinbase Advanced** | SDK mais guiado, regulada EUA, FIX institucional | REST+WS+FIX, CDP keys | ⚠️ sandbox limitado | 0.40%/0.60% | `ready` |
| 5 | **Kraken** | Segurança/nonce, multi-protocolo (REST/WS/FIX), regulada | REST+WS+FIX | ⚠️ Futures demo | 0.25%/0.40% spot | `ready` |
| 6 | **Alpaca** | Paper trading nativo grátis, ações+cripto, queridinha open-source (Lumibot) | REST+WS, paper URL dedicada | ✅ Paper | $0 ações, ~0.25% cripto | `ready` |
| 7 | **MetaTrader 5** | Padrão Forex/CFD, EAs, prop firms | Bridge Python (FastAPI+HMAC) | ✅ Demo brokers | por broker | `ready` (bridge) |
| 8 | **cTrader / IC Markets** | Open API, FIX, ECN FX | Open API + FIX | ✅ Demo | por broker | `stub` (interface pronta) |

\* Taxas base sem VIP/BNB; futuros = maker/taker. Fontes abaixo.

**Consenso das fontes:**
- Melhor API geral p/ bots: **Binance**; melhor p/ bots de derivativos: **Bybit V5**; integração mais fácil: **Coinbase**; infra avançada/multi-protocolo: **Kraken** [1](https://coinmarketcap.com/academy/article/best-crypto-api-for-trading-bots-and-algorithmic-trading-2026) [3](https://bitcoinfoundation.org/news/crypto-exchanges/crypto-exchange-api/).
- Top 3 API trading: **Bybit, Binance, OKX** pelas arquiteturas unificadas e confiáveis [2](https://www.datawallet.com/crypto/best-crypto-exchanges-for-api-trading).
- Para Freqtrade/bots 24/7 em 2026: **Bybit** (fees 0.02%/0.055% fut, WS rápido, sem geo-restrições de API) [4](https://trendrider.net/blog/best-crypto-exchange-for-bot-trading-2026).
- TradingView → exchange via webhook: Binance/Bybit/OKX com fill típico de 1–4s [5](https://www.tv-hub.org/compare/best-crypto-exchanges).

**Decisão de engenharia:** `paper` (default) → `binance`/`bybit`/`okx` como rotas primárias de live;
`coinbase`/`kraken` para operação regulada; `alpaca` para ações/paper; `mt5` para FX/CFD via bridge.
Todas com **testnet-first** e trava `LIVE_TRADING=false`.

---

## 2. Carteiras / Wallets (ranking para integração)

| Rank | Wallet | Por quê | Integração dev | Cadeias | Status aqui |
|------|--------|---------|----------------|---------|-------------|
| 🥇 1 | **MetaMask** | Padrão EVM, SDK oficial, Snaps, ERC-4337/delegation toolkit | MetaMask SDK + `window.ethereum` (EIP-1193) | EVM + Solana + BTC | `ready` (EVM) |
| 🥈 2 | **WalletConnect** | Camada universal: 54M+ wallets, 80k+ dApps, sessões multi-chain (v2) | AppKit/Reown SDK, QR/deep-link | todas via protocolo | `ready` |
| 🥉 3 | **Phantom** | Melhor Solana + multi-chain (ETH/Polygon/BTC), React/Browser/Server SDKs | Phantom SDKs | SOL, ETH, MATIC, BTC, Monad | `ready` |
| 4 | **Coinbase Wallet (Base App)** | Onboarding mais fácil, OnchainKit/MiniKit, 10M+ users | OnchainKit, MiniKit | EVM + BTC + SOL | `ready` |
| 5 | **Trust Wallet** | 110+ chains, Wallet Core open-source (130+ chains), mobile-first | Wallet Core + WalletConnect | 110+ | `stub` (via WC) |
| 6 | **Binance Web3 Wallet** | MPC, CEX↔on-chain direto, 40+ redes | Wallet SDK + `window.BinanceChain` | 40+ | `stub` |
| 7 | **Ledger/Trezor** | Custódia fria p/ capital real, Ledger Connect Kit | LCK (USB/BT), Trezor Connect | 100+ | `stub` |

Fontes: rankings Web3 2026 [1](https://cryptonews.com/cryptocurrency/best-web3-wallets/) [3](https://www.coingecko.com/learn/top-hot-software-wallets-crypto) [4](https://nftplazas.com/exchange/best-web3-wallets/); MetaMask vs WalletConnect [2](https://bingx.com/en/learn/article/metamask-vs-walletconnect-wct-which-wallet-to-choose).

**Decisão de engenharia:** EVM via `ethers` (MetaMask/Rabby/Binance Wallet compatíveis por EIP-1193);
Solana via `@solana/web3.js` (Phantom/Backpack); WalletConnect como fallback universal;
Ledger como assinatura de saques/tesouraria. Chaves **nunca** no frontend do mirror público.

---

## 3. Blockchains / Redes (ranking para bots e liquidação)

| Rank | Rede | Por quê | Finalidade aqui | Status |
|------|------|---------|-----------------|--------|
| 🥇 1 | **Solana** | 2000+ TPS, fees ~$0.00025, ecossistema #1 de bots (Trojan/Axiom/Photon/BonkBot), Jupiter | Bot #1 (SOL 30m) + swaps Jupiter | `ready` (devnet→mainnet) |
| 🥈 2 | **Base** | L2 Coinbase, fees <$0.01, OnchainKit, crescimento #1 em usuários | Liquidação EVM barata default | `ready` (sepolia→mainnet) |
| 🥉 3 | **Arbitrum** | L1-L2 DeFi mais líquida, Uniswap V3 profundo, Stylus | Swaps institucionais EVM | `ready` |
| 4 | **BSC** | Fees baixas, PancakeSwap, CEX↔DEX fácil via Binance | Alternativa EVM barata | `ready` |
| 5 | **Ethereum** | Liquidez máxima, segurança, ERC-4337 | Tesouraria/anchor de auditoria | `ready` (anchor) |
| 6 | **Polygon** | PoS barato, Phantom/Coinbase suportam | Fallback EVM | `ready` |

Testnets: Sepolia, Base Sepolia, Arbitrum Sepolia, BSC Testnet, Solana Devnet.
DEXs: Uniswap V3 (EVM), Jupiter (Solana), PancakeSwap (BSC). Bots de referência cobrem
multi-chain (Trojan, Maestro, BullX, GMGN, Axiom) — nosso mirror segue o mesmo padrão [6](https://solanatools.io/) [7](https://coincodecap.com/best-solana-telegram-trading-bots-for-crypto-traders).

---

## 4. Regra de ouro (aplicada no código)

1. **Testnet/paper por padrão** — real exige `LIVE_TRADING=true` **E** `ONCHAIN_ALLOW_LIVE=true` **E** credenciais.
2. **Carteira dedicada** para bots — nunca a principal (consenso de segurança dos rankings).
3. **Slippage ≤ 0.8%**, stale ≤ 10s, dedupe por `order_id` — herdado do `WebhookEngine` auditado.
4. **Tudo auditado em hash-chain** — `GET /api/audit/verify` prova integridade sem confiar em ninguém.
