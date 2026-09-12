# ⚡ JANUTRADE - Multi-Broker, Web3 & Quantum Autonomous Trading Platform

> **Desenvolvido por Januario Leal** (`januarioleal@gmail.com`)
> 
> Plataforma de alta performance para **Trading Autônomo, Liquidação Web3 On-Chain (MetaMask), Terminal MT5 Plus Edge, Validação Criptográfica RAG, Inteligência Coletiva e Execução 24/7 Multi-Broker** com sincronização em nuvem via Firebase Firestore e gestão de risco calibrada.

---

## 🌟 Visão Geral do JANUTRADE

O **JANUTRADE** é um ecossistema completo de negociação automatizada que integra brokers centralizados, descentralizados, Web3 e tradicionais (**B3, Binance, BYDFi, Alpaca, MetaTrader 5 e MetaMask / EVM Sepolia**) com um motor de validação criptográfica à prova de fraudes (**Zero Dados Falsos**).

Projetado para operar de forma contínua com modos de execução **Scalp (Sub-minuto)** e **Normal**, o JANUTRADE possui um **Runner 24/7** com persistência em nuvem em tempo real, proteção contra slippage, verificação de limites operacionais, relógio analítico de sessões horárias e liquidação auditável na blockchain.

---

## 🚀 Principais Módulos e Recursos

### 1. 🦊 Liquidação Web3 On-Chain & Conexão Nativa MetaMask
- **Conexão Direta com Carteira Web3**: Suporte a provedores Ethereum nativos (`window.ethereum`) para abertura de popup de assinatura com 1 clique.
- **Transações Auditadas On-Chain**:
  - Disparo de ordens reais gravando na calldata o padrão criptográfico imutável: `JANUTRADE:<direction>:<symbol>:<auditCode>`.
  - Geração de Hash de Transação (TxHash) validável no Etherscan na rede **Sepolia Testnet / Ethereum Mainnet**.
  - Selo visual de verificação **"SELADO ON-CHAIN"** nas ordens executadas.
- **Detecção de Saldos On-Chain**: Leitura em tempo real de saldos livres em ETH e Sepolia ETH diretamente no painel.
- **Compatibilidade Avançada**: Suporte integrado com atalhos de abertura em nova aba (garantindo foco irrestrito ao popup da MetaMask) e modo fallback com carteira Sepolia Testnet pré-configurada (`0x71C2...b437`).

### 2. 📊 Terminal MT5 Plus Edge
- **Integração MetaTrader 5**: Painel dedicado de controle de posições e contas de corretoras Forex/CFD.
- **Monitoramento de Margem e Equity**: Leitura instantânea de Saldo, Patrimônio Líquido (Equity), Margem Utilizada e Margem Livre.
- **Gestão de Drawdown Diário**: Alerta e trava automática contra estouro do limite percentual diário de rebaixamento.
- **Circuit Breaker de Emergência**: Fechamento em massa com um único clique de todas as posições abertas no MT5 caso as condições de risco atinjam níveis críticos.

### 3. ⏰ Relógio de Trading & Análise de Sessão Horária (`TradingClockAndResetCard`)
- **Trading Clock em Tempo Real**: Relógio visual de sincronização contínua com timer de reset de sessão.
- **Métricas de Performance por Hora**:
  - PnL por hora decorrida (`$ /h`).
  - Projeção de resultado para 24 horas contínuas.
  - Painel de janelas móveis de 4 horas e 24 horas com contagem de operações e PnL consolidado.
- **Tabela Histórica de Buckets Horários**: Detalhamento hora a hora da sessão com Win Rate (%), Duração Média de Trades, Volume Total e PnL financeiro.

### 4. 🤖 Multi-Bot Execution Engine & Runner 24/7
- **Operação Ininterrupta (Runner 24/7)**: Loop contínuo de avaliação de mercado em background sincronizado com Firebase Firestore.
- **Diversidade de Estratégias**:
  - *M1 Scalp SuperTrend*: Operações rápidas sub-minuto baseadas em momentum.
  - *Quantum Breakout BRL*: Identificação de rompimentos de volatilidade em pares BRL e USDT.
  - *BTC Momentum Wave*: Rastreador de tendência adaptativo para ativos de alta liquidez.
  - *Grid Dinâmico e Reversão à Média*.
- **Gestão de Risco Calibrada**:
  - Regra de alocação máxima por operação (0.5% a 2%).
  - Cálculo automático de *Take Profit (TP)* e *Stop Loss (SL)* com relação risco/retorno ajustada.
  - **Kill Switch Global e Operacional**: Pausa imediata de todas as ordens e bots sob condições anormais de mercado.

### 5. ⚡ Regulador de Mercado (`TradeScheduler`) & Modo Scalp
- **Modos de Operação Dinâmicos**:
  - **Modo `scalp`**: Exclusivo para operações ultra-rápidas em timeframes sub-minuto (`5s`, `10s`, `15s`, `30s`).
  - **Modo `normal`**: Destinado a estratégias de intraday e swing trading (`1m`, `5m`, `15m`, `1h`, `1d`).
- **Bloqueio Automático de Timeframes**: Rejeição e auditoria instantânea de sinais fora do modo configurado.
- **Proteção de Rate Limit por Bolsa (Market Rules)**:
  - **B3 (Brasil)**: Limite de 1 ord/seg, 30 ord/min e intervalo mínimo de 1.0s.
  - **NYSE / NASDAQ / CME (US Equities & Futures)**: Limite de 2 ord/seg, 50 ord/min e intervalo de 0.5s.
  - **Crypto (Binance, BYDFi)**: Limite calibrado de 5 ord/seg com tratamento de rate limit via WebSocket/REST.

### 6. 🛡️ Autenticação Criptográfica & Trilha de Auditoria Imutável (RAG Gate)
- **Assinatura Digital de Sinais**: Cotações e ordens recebidas são assinadas digitalmente via HMAC/SHA-256.
- **Cadeia de Blocos de Auditoria (Blockchain Audit Trail)**: Cada evento de trade é encadeado ao hash do bloco anterior (`prev_hash`), garantindo imutabilidade e rastreabilidade total.
- **DataVerifier & Gate RAG**:
  - Plausibilidade de preços (checagem de bandas de volatilidade e desvio padrão do ativo).
  - Tolerância a *timestamp drift* (máximo 300s).
  - Proteção contra injeções de dados maliciosos ou adulteração de payloads.

### 7. 🧠 Inteligência Coletiva & Entanglement Quântico
- **Score Coletivo Ponderado**: Matriz de correlação e consenso entre múltiplos bots e indicadores para autorizar sinais de alta probabilidade.
- **WFA Validation Gate**: pipeline separado de dados reais → backtest determinístico → tournament → gate binário de promoção para Alpaca Paper com banca de USD 100. O motor rejeita look-ahead, custos omitidos, amostra OOS insuficiente e ausência de dados; `NO_VIABLE_STRATEGY` é uma saída válida.

### 8. 🔬 Pesquisa Walk-Forward e promoção segura
- O engine em `server/validation/walkForwardEngine.ts` usa 8 janelas expanding `TRAIN | VALIDATION | TEST`, slippage/taxas explícitos, Monte Carlo reprodutível e sensibilidade de parâmetros.
- `POST /api/validation/run` consulta Alpaca Market Data ou Yahoo Finance, registra o provider e só grava `server/data/validated_strategy.json` depois de consultar a API real da Alpaca PAPER.
- O runner Python recusa iniciar sem um manifest `APPROVED`, fixa `PAPER=true`, limita posição a 2% e ativa kill switch abaixo de USD 80.

### 8. 💼 Gestão Multi-Broker & Contas Demo/Real
- Suporte simultâneo a múltiplas contas (**Demo USD**, **Demo BRL**, **Real Binance**, **Real MetaMask Web3**, **Real MT5**).
- Monitoramento contínuo de PnL (Lucro/Prejuízo), Win Rate, Drawdown Máximo e Sharpe Ratio.
- Conversão e liquidação multi-moedas (BRL, USD, USDT, ETH).

---

## 🏗️ Arquitetura do Projeto

```
janutrade/
├── server/
│   ├── adapters/
│   │   └── brokerAdapters.ts        # Abstração de corretoras (Binance, BYDFi, B3, Alpaca, MT5, MetaMask)
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
├── server/validation/
│   ├── walkForwardEngine.ts         # Backtest determinístico + WFA + robustez
│   └── walkForwardEngine.test.ts    # Testes de reprodutibilidade sem runtime randomness
├── src/
│   ├── components/
│   │   ├── DashboardView.tsx        # Painel central de operações, saldos on-chain e PnL ao vivo
│   │   ├── AccountsView.tsx         # Gestão de contas Multi-Broker e carteira Web3
│   │   ├── BotsView.tsx             # Configuração e monitoramento de Bots
│   │   ├── AuditValidationView.tsx  # Validação RAG, Cadeia de Hashes e TradeScheduler
│   │   ├── EntanglementView.tsx     # Painel de inteligência coletiva e consenso
│   │   ├── BacktestingView.tsx      # Simulador de estratégias históricas
│   │   ├── WebhookView.tsx          # Gestão de Webhooks e payloads assinados
│   │   ├── TradeHistoryView.tsx     # Histórico detalhado e logs de auditoria
│   │   ├── MT5PlusEdgeView.tsx      # Terminal MetaTrader 5 Plus Edge e Circuit Breaker
│   │   ├── TradingClockAndResetCard.tsx # Relógio de sessão e métricas horárias
│   │   ├── Navbar.tsx               # Barra de navegação e status global do portfólio
│   │   └── TickerBar.tsx            # Ticker de cotações em tempo real
│   ├── lib/
│   │   └── web3MetaMask.ts          # Driver Web3 para integração nativa com MetaMask/Sepolia
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
| **Web3 & Blockchain** | EIP-1193, Ethereum Provider API, Calldata Ingestion, Sepolia Testnet |
| **Persistência & Nuvem** | Firebase Cloud Firestore, Sincronização em Tempo Real (SSE + REST) |
| **Criptografia & Auditoria** | Web Crypto / Node Crypto (HMAC, SHA-256, Digesting de Blocos) |
| **Feeds de Mercado** | Yahoo Finance API, WebSockets e Webhooks TradingView |

---

## 🚀 Como Executar o JANUTRADE

### 1. Pré-requisitos
- **Node.js** (v18 ou superior)
- **npm** ou **bun**

### 2. Instalação e Execução Local

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

## 📦 Sincronização com o GitHub

### Exportação Direta pelo Google AI Studio
1. No menu superior direito do **Google AI Studio**, clique no ícone de configurações / menu do projeto.
2. Selecione **"Export to GitHub"** (ou faça o download do ZIP completo).
3. Conecte sua conta GitHub e selecione o repositório de destino para sincronizar todas as alterações automaticamente.

### Sincronização via Git Terminal

Caso deseje enviar ou atualizar um repositório remoto existente diretamente via Git:

```bash
# Inicializar o repositório local (caso ainda não esteja inicializado)
git init
git branch -M main

# Configurar suas credenciais do Git
git config user.name "Januario Leal"
git config user.email "januarioleal@gmail.com"

# Adicionar todos os arquivos atualizados
git add .

# Criar o commit de atualização
git commit -m "feat: atualizacao completa JANUTRADE - Web3 MetaMask, MT5 Edge, Trading Clock e protecoes"

# Vincular ao seu repositório no GitHub (substitua pela sua URL do GitHub)
git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPOSITORIO.git

# Enviar as alterações para o GitHub
git push -u origin main --force
```

---

## 📡 Principais Endpoints da API REST

### 📊 Mercado & Contas
- `GET /api/accounts`: Lista todas as contas (Demo, Real, Web3) e respectivos saldos.
- `POST /api/accounts`: Cria uma nova conta de trading.
- `GET /api/tickers`: Cotações agregadas em tempo real dos pares de ativos.
- `GET /api/trades`: Histórico e posições abertas.

### 🦊 Web3 & Carteira MetaMask
- `GET /api/metamask/watch`: Consulta endereço EVM monitorado e status de liquidação on-chain.
- `POST /api/metamask/watch`: Define ou atualiza endereço para auditoria on-chain.

### 🤖 Bots & Automação
- `GET /api/bots`: Lista de bots autônomos e status de execução.
- `POST /api/bots`: Criação ou inicialização de novo bot.
- `POST /api/bots/:id/toggle`: Alterna o estado do bot (`running` / `paused`).

### ⚡ Runner 24/7 & Proteção
- `GET /api/runner-247/status`: Status do Runner 24/7 (uptime, ticks, sincronização Firestore).
- `POST /api/runner-247/toggle`: Inicia ou pausa o Runner 24/7.
- `GET /api/kill-switch`: Status dos Kill Switches operacionais.
- `POST /api/kill-switch/toggle`: Ativa ou desativa a trava global de emergência.

### 📈 MetaTrader 5 Plus Edge
- `GET /api/mt5/status`: Status da conexão com terminal MT5, equity e margem.
- `POST /api/mt5/circuit-breaker`: Dispara o fechamento em massa de posições de emergência.

### 🛡️ Auditoria Criptográfica & Scheduler
- `GET /api/audit/chain`: Consulta a cadeia completa de blocos criptográficos imutáveis.

### 🔬 WFA Validation Gate
- `POST /api/validation/run`: carrega dados OHLCV reais e executa backtest, tournament e promotion gate.
- `GET /api/validation/last`: recupera o último relatório da sessão.
- `GET /api/validation/manifest`: informa se há deployment PAPER aprovado.
- `GET /api/validation/last.csv`: exporta o ranking auditável em CSV.
- `POST /api/validation/operations/validate`: valida múltiplas operações contra os limites de posição, risco e exposição.
- `GET /api/validation/operations/last`: recupera o último lote auditado.
- `POST /api/validation/promote`: revalida o último resultado sem ignorar gates.
- `GET /api/audit/report`: Gera o relatório completo de conformidade e integridade em Markdown.
- `GET /api/regulator/scheduler`: Retorna o modo ativo (`scalp` / `normal`) e regras das bolsas.
- `POST /api/regulator/scheduler/mode`: Alterna o modo de execução entre `scalp` e `normal`.

---

## 📄 Créditos e Autoria

Plataforma **JANUTRADE** concebida, arquitetada e desenvolvida por **Januario Leal** (`januarioleal@gmail.com`).
Todos os direitos reservados.

