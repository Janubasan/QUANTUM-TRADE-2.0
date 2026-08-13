# Quantum Trade Engine & Cryptographic Audit System

> **Programa desenvolvido por Januario Leal**

Uma plataforma avançada de **Trading Autônomo, Validação Criptográfica e Regulação de Mercado**, projetada para operar em alta frequência com modos de execução **Scalp (Sub-minuto)** e **Normal**, garantindo **Zero Dados Falsos** via verificação RAG, assinaturas digitais HMAC/SHA-256 e uma cadeia imutável de auditoria em blocos.

---

## 🌟 Principais Recursos e Módulos

### 1. ⚡ Regulador de Mercado (`TradeScheduler`) & Modo Scalp
- **Modos de Operação Dinâmicos**:
  - **Modo `scalp`**: Exclusivo para operações rápidas em timeframes sub-minuto (`5s`, `10s`, `15s`, `30s`).
  - **Modo `normal`**: Destinado a estratégias de intraday/swing (`1m`, `5m`, `10m`, `15m`, `30m`, `1h`).
- **Bloqueio Automático de Timeframes**: Sinais que chegam com timeframes fora do modo ativo são rejeitados e registrados instantaneamente na auditoria.
- **Proteção de Rate Limit por Bolsa (Market Rules)**:
  - **B3 (Brasil)**: Limite de 1 ord/seg, 30 ord/min e intervalo mínimo de 1.0s.
  - **NYSE / NASDAQ (US Equities & Futures)**: Limite de 2 ord/seg, 50 ord/min e intervalo de 0.5s.

### 2. 🛡️ Autenticação Criptográfica & Trilha de Auditoria Imutável
- **Assinatura Digital de Sinais**: Todos os cotações de provedores (Yahoo Finance, TradingView, CME) são assinados criptograficamente.
- **Cadeia de Hashes (Blockchain Audit Trail)**: Cada entrada é vinculada ao hash do bloco anterior (`prev_hash`), impedindo qualquer adulteração retroativa dos logs de negociação.
- **DataVerifier & Gate RAG**:
  - Validação de plausibilidade de preços (limites de volatilidade e desvio do ativo).
  - Tolerância rigorosa a *timestamp drift* (máximo 300s).
  - Filtro contra injeções malicious ou *hash mismatch*.

### 3. 🤖 Bots Autônomos & Gestão Multi-Broker
- Execução distribuída de estratégias autônomas em tempo real.
- Gestão centralizada de contas e saldos em Múltiplos Brokers.
- Monitoramento contínuo de KPIs: Profit/Loss, Win Rate, Drawdown Máximo e Sharpe Ratio.

### 4. 📊 Interface Visual Interativa e Relatórios
- Painel para alternar entre os modos **SCALP** e **NORMAL**.
- Visualização ao vivo da **Cadeia de Hashes de Auditoria**.
- Gerador autônomo de **Relatório de Auditoria em Markdown**.

---

## 🏗️ Arquitetura do Sistema

```
├── server/
│   ├── regulator/
│   │   ├── marketRules.ts        # Definição de limites por bolsa e timeframes (Scalp/Normal)
│   │   └── tradeScheduler.ts     # Controlador de concorrência e validação temporal
│   ├── validation/
│   │   ├── signer.ts             # Assinatura HMAC SHA-256 de payloads de sinais
│   │   ├── verifier.ts           # Motor DataVerifier (Signature, Hash, Timestamp, RAG Bounds)
│   │   └── logger.ts             # Encadear imutável de blocos de auditoria
│   └── tester/
│       ├── demoRunner.ts         # Ingestão de feeds e execução de vetores de teste
│       └── reportGenerator.ts    # Compilação de relatórios Markdown de auditoria
├── src/
│   ├── components/
│   │   ├── AuditValidationView.tsx # Painel de Validação, RAG, Hashes e TradeScheduler
│   │   ├── DashboardView.tsx       # Métrica quântica e PnL ao vivo
│   │   ├── BotsView.tsx            # Gestão de Bots Autônomos
│   │   ├── AccountsView.tsx        # Contas Multi-Broker
│   │   └── WebhookView.tsx         # Recebimento de Webhooks e sinais externos
│   ├── services/
│   │   └── api.ts                  # Cliente REST para comunicação com o backend Node/Express
│   └── App.tsx
├── server.ts                       # Servidor Express com API REST + Vite Middleware
└── README.md
```

---

## 🛠️ Tecnologias Utilizadas

- **Linguagem & Runtime**: TypeScript, Node.js (ES Modules / CommonJS bundling via esbuild).
- **Backend Framework**: Express.js.
- **Frontend UI**: React 18, Vite, Tailwind CSS, Lucide React icons, Motion.
- **Criptografia & Segurança**: Crypto (SHA-256 / HMAC / Digesting).

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- **Node.js** v18+ e **npm** instalados.

### Passos para Instalação e Execução

1. **Instalar as dependências**:
   ```bash
   npm install
   ```

2. **Iniciar o Ambiente de Desenvolvimento**:
   ```bash
   npm run dev
   ```
   O servidor estará acessível em `http://localhost:3000`.

3. **Compilação e Build para Produção**:
   ```bash
   npm run build
   npm start
   ```

---

## 📡 Referência de Endpoints Principais

### Regulador de Mercado
- `GET /api/regulator/scheduler`: Retorna o modo ativo (`scalp` ou `normal`), timeframes permitidos e regras das bolsas.
- `POST /api/regulator/scheduler/mode`: Altera o modo de operação entre `scalp` e `normal`.
  ```json
  { "mode": "scalp" }
  ```

### Auditoria & Criptografia
- `GET /api/audit/chain`: Consulta o estado completo da cadeia de hashes imutável.
- `GET /api/audit/report`: Retorna o relatório de auditoria formatado em Markdown.
- `POST /api/audit/run-demo`: Executa um ciclo completo de ingestão, validação RAG, testes de invasão e relatórios.

---

## 📄 Créditos e Autoria

Este sistema foi concebido, arquitetado e desenvolvido por **Januario Leal**. Todos os direitos reservados.
