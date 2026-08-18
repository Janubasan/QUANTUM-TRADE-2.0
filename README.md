# ⚡ JANUTRADE - Multi-Broker & Quantum Autonomous Trading Platform

> **Desenvolvido por Januario Leal**
> 
> Plataforma de alta performance para **Trading Autônomo, Validação Criptográfica RAG, Inteligência Coletiva e Execução 24/7 Multi-Broker** com sincronização em nuvem via Firebase Firestore e gestão de risco calibrada.

---

## 🌟 Visão Geral do JANUTRADE

O **JANUTRADE** é um ecossistema completo de negociação automatizada que integra brokers centralizados, descentralizados e tradicionais (B3, Binance, BYDFi, Alpaca, MetaTrader 5) com um motor de validação criptográfica à prova de fraudes (**Zero Dados Falsos**).

Projetado para operar de forma contínua com modos de execução **Scalp (Sub-minuto)** e **Normal**, o JANUTRADE possui um **Runner 24/7** com persistência em tempo real, proteção contra slippage, verificação de limites operacionais e inteligência coletiva quântica.

---

## 🚀 Principais Módulos e Recursos

### 1. 🤖 Multi-Bot Execution Engine & Runner 24/7
- **Operação Ininterrupta (Runner 24/7)**: Loop de avaliação de mercado contínuo em background sincronizado com Firebase Firestore.
- **Diversidade de Estratégias**:
  - *M1 Scalp SuperTrend*: Operações rápidas sub-minuto baseadas em momentum.
  - *Quantum Breakout BRL*: Identificação de rompimentos de volatilidade em pares BRL e USDT.
  - *BTC Momentum Wave*: Rastreador de tendência adaptativo para ativos de alta liquidez.
  - *Grid Dinâmico e Reversão à Média*.
- **Gestão de Risco Calibrada**:
  - Regra de alocação máxima por operação (0.5% a 2%).
  - Cálculo automático de *Take Profit (TP)* e *Stop Loss (SL)* com relação risco/retorno ajustada.
  - **Kill Switch Global e Operacional**: Pausa imediata de todas as ordens e bots sob condições anormais de mercado.

### 2. ⚡ Regulador de Mercado (`TradeScheduler`) & Modo Scalp
- **Modos de Operação Dinâmicos**:
  - **Modo `scalp`**: Exclusivo para operações ultra-rápidas em timeframes sub-minuto (`5s`, `10s`, `15s`, `30s`).
  - **Modo `normal`**: Destinado a estratégias de intraday e swing trading (`1m`, `5m`, `15m`, `1h`, `1d`).
- **Bloqueio Automático de Timeframes**: Rejeição e auditoria instantânea de sinais fora do modo configurado.
- **Proteção de Rate Limit por Bolsa (Market Rules)**:
  - **B3 (Brasil)**: Limite de 1 ord/seg, 30 ord/min e intervalo mínimo de 1.0s.
  - **NYSE / NASDAQ / CME (US Equities & Futures)**: Limite de 2 ord/seg, 50 ord/min e intervalo de 0.5s.
  - **Crypto (Binance, BYDFi)**: Limite calibrado de 5 ord/seg com tratamento de rate limit via WebSocket/REST.

### 3. 🛡️ Autenticação Criptográfica & Trilha de Auditoria Imutável (RAG Gate)
- **Assinatura Digital de Sinais**: Cotações e ordens recebidas são assinadas digitalmente via HMAC/SHA-256.
- **Cadeia de Blocos de Auditoria (Blockchain Audit Trail)**: Cada evento de trade é encadeado ao hash do bloco anterior (`prev_hash`), garantindo imutabilidade e rastreabilidade total.
- **DataVerifier & Gate RAG**:
  - Plausibilidade de preços (checagem de bandas de volatilidade e desvio padrão do ativo).
  - Tolerância a *timestamp drift* (máximo 300s).
  - Proteção contra injeções de dados maliciosos ou adulteração de payloads.

### 4. 🧠 Inteligência Coletiva & Entanglement Quântico
- **Score Coletivo Ponderado**: Matriz de correlação e consenso entre múltiplos bots e indicadores para autorizar sinais de alta probabilidade.
- **Backtesting Coletivo**: Simulação com dados históricos reais e estresse de slippage/taxas para avaliar a resiliência das estratégias.

### 5. 💼 Gestão Multi-Broker & Contas Demo/Real
- Suporte simultâneo a múltiplas contas (Demo para testes de estratégias e Real para alocação efetiva de capital).
- Monitoramento contínuo de PnL (Lucro/Prejuízo), Win Rate, Drawdown Máximo e Sharpe Ratio.
- Conversão e liquidação multi-moedas (BRL, USD, USDT).

---

## 🏗️ Arquitetura do Projeto

```
janutrade/
├── server/
│   ├── adapters/
│   │   ├── brokerAdapters.ts        # Factory (MT5/Proft reais + demais simulados)
│   │   ├── mt5/                     # Ponte EA MetaTrader 5
│   │   └── proft/                   # Ponte ProfitDLL + REST HMAC
│   ├── routes/
│   │   └── brokerBridgeRoutes.ts    # Heartbeat / commands / report / tokens
│   ├── engine/
│   │   ├── botWorker.ts             # Loop de execução de estratégias autônomas
│   │   ├── profitRule.ts            # Motor de gerenciamento de risco e dimensionamento
│   │   └── runner247Service.ts      # Serviço do Runner 24/7 com heartbeat e Firestore sync
│   ├── regulator/
│   │   ├── marketRules.ts           # Regras de limite de ordens por bolsa
│   │   └── tradeScheduler.ts        # Controle de concorrência e modos Scalp / Normal
│   ├── services/
│   │   ├── botRegistry.ts           # Registro dinâmico e ciclo de vida dos bots
│   │   ├── collective.ts            # Inteligência coletiva e cálculo de consenso quântico
│   │   ├── firebaseService.ts       # Sincronização em nuvem com Firestore
│   │   ├── killSwitchService.ts     # Proteção de emergência e interrupção de operações
│   │   ├── operationalGuard.ts      # Guardião operacional de margem e volatilidade
│   │   ├── priceAggregator.ts       # Agregador de cotações em tempo real (Yahoo Finance / APIs)
│   │   └── webhookEngine.ts         # Ingestão de sinais externos (TradingView, webhooks)
│   ├── validation/
│   │   ├── signer.ts                # Assinaturas digitais HMAC SHA-256
│   │   ├── verifier.ts              # DataVerifier e validação de bounds RAG
│   │   └── logger.ts                # Cadeia imutável de blocos de auditoria
│   └── tester/
│       ├── demoRunner.ts            # Ingestão de testes e estresse de mercado
│       └── reportGenerator.ts       # Gerador de relatórios de conformidade em Markdown
├── src/
│   ├── components/
│   │   ├── DashboardView.tsx        # Painel central de operações e PnL ao vivo
│   │   ├── AccountsView.tsx         # Gestão de contas Multi-Broker
│   │   ├── BotsView.tsx             # Configuração e monitoramento de Bots
│   │   ├── AuditValidationView.tsx  # Validação RAG, Cadeia de Hashes e TradeScheduler
│   │   ├── EntanglementView.tsx     # Painel de inteligência coletiva e consenso
│   │   ├── BacktestingView.tsx      # Simulador de estratégias históricas
│   │   ├── WebhookView.tsx          # Gestão de Webhooks e payloads assinados
│   │   ├── TradeHistoryView.tsx     # Histórico detalhado e logs de auditoria
│   │   ├── Navbar.tsx               # Barra de navegação e status global do portfólio
│   │   └── TickerBar.tsx            # Ticker de cotações em tempo real
│   ├── firebase.ts                  # Inicialização cliente do Firebase Firestore
│   └── App.tsx                      # Componente raiz da aplicação
├── firestore.rules                  # Regras de segurança do Cloud Firestore
├── firebase-blueprint.json          # Blueprint e esquemas de dados da plataforma
├── server.ts                        # Servidor Express API + SSR/Vite
└── README.md                        # Documentação oficial do JANUTRADE
```

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologias |
| :--- | :--- |
| **Backend & Servidor** | Node.js, Express.js, TypeScript, TSX, esbuild |
| **Frontend & UI** | React 18, Vite, Tailwind CSS, Lucide React, Motion, Recharts |
| **Persistência & Nuvem** | Firebase Cloud Firestore, Sincronização em Tempo Real (SSE + REST) |
| **Criptografia & Auditoria** | Web Crypto / Node Crypto (HMAC, SHA-256, Digesting de Blocos) |
| **Feeds de Mercado** | Yahoo Finance API, WebSockets e Webhooks TradingView |

---

## 🚀 Como Executar o JANUTRADE

### 1. Pré-requisitos
- **Node.js** (v18 ou superior)
- **npm** ou **bun**

### 2. Instalação e Execução

```bash
# 1. Instalar as dependências
npm install

# 2. Iniciar em modo de desenvolvimento (Porta 3000)
npm run dev

# 3. Compilar para produção
npm run build

# 4. Iniciar o servidor compilado
npm start
```

A interface web estará disponível em `http://localhost:3000`.

---

## 📡 Principais Endpoints da API REST

### 📊 Mercado & Contas
- `GET /api/accounts`: Lista todas as contas (Demo e Real) e respectivos saldos.
- `POST /api/accounts`: Cria uma nova conta de trading.
- `GET /api/tickers`: Cotações agregadas em tempo real dos pares de ativos.
- `GET /api/trades`: Histórico e posições abertas.

### 🤖 Bots & Automação
- `GET /api/bots`: Lista de bots autônomos e status de execução.
- `POST /api/bots`: Criação ou inicialização de novo bot.
- `POST /api/bots/:id/toggle`: Alterna o estado do bot (`running` / `paused`).

### ⚡ Runner 24/7 & Proteção
- `GET /api/runner-247/status`: Status do Runner 24/7 (uptime, ticks, sincronização Firestore).
- `POST /api/runner-247/toggle`: Inicia ou pausa o Runner 24/7.
- `GET /api/kill-switch`: Status dos Kill Switches operacionais.
- `POST /api/kill-switch/toggle`: Ativa ou desativa a trava global de emergência.

### 🛡️ Auditoria Criptográfica & Scheduler
- `GET /api/audit/chain`: Consulta a cadeia completa de blocos criptográficos imutáveis.
- `GET /api/audit/report`: Gera o relatório completo de conformidade e integridade em Markdown.
- `GET /api/regulator/scheduler`: Retorna o modo ativo (`scalp` / `normal`) e regras das bolsas.
- `POST /api/regulator/scheduler/mode`: Alterna o modo de execução entre `scalp` e `normal`.

---

## 📄 Créditos e Autoria

Plataforma **JANUTRADE** concebida, arquitetada e desenvolvida por **Januario Leal**.
Todos os direitos reservados.
