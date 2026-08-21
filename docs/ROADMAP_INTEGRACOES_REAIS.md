# Roadmap de integração segura: carteiras Web3 e corretoras

> **Status em 21/08/2026:** o repositório tem a base de simulação e validação, mas **não está pronto para enviar ordens reais**. Os adapters em `server/adapters/brokerAdapters.ts` retornam respostas simuladas; não há `coinbaseAdapter.ts`, integração MetaMask/EVM, gateway B3 nem scheduler de abertura de mercado. Não habilite capital real antes de concluir os gates abaixo.

Este plano transforma a esteira atual em uma integração sustentável sem permitir que estratégias ou o navegador manipulem credenciais.

## 1. Diagnóstico do código atual

| Camada existente | Arquivo(s) | Situação | Ação obrigatória |
|---|---|---|---|
| Sinais/bots | `server/engine/botWorker.ts`, `server/services/botRegistry.ts`, webhooks em `server.ts` | Existe | Manter sem acesso a segredos. |
| Guard | `server/services/operationalGuard.ts`, `killSwitchService.ts` | Parcial | Hoje não há teto nocional, slippage é simulado/fixo e HMAC é opcional. Tornar os controles mandatórios e server-side. |
| Estado/auditoria | `server/data/store.ts`, Firestore, `server/validation/logger.ts` | Parcial | O store é memória e a gravação Firestore pode falhar sem bloquear execução. Criar ledger durável e outbox. |
| Corretoras | `server/adapters/brokerAdapters.ts` | **Mock** | Substituir por adapters reais, com resultado assíncrono, idempotência e reconciliação. |
| Carteira EVM | — | Ausente | Criar adapter EVM e, separadamente, fluxo de assinatura MetaMask. |
| Calendário | `server/regulator/*`, `timeGateService.ts` | Não é MarketClock | Implementar calendário/sessão por venue antes de B3. |

### Correções críticas antes de qualquer live

1. Em `botWorker.ts` e `botRegistry.ts`, `adapter.createOrder(...)` não é aguardado e o trade é gravado como aberto mesmo se a corretora rejeitar a ordem. O novo gateway deve **aguardar** o aceite, persistir `submitted` primeiro e só marcar `filled/open` após confirmação.
2. O endpoint `/api/operational-guard/sign` aceita um `secret` vindo do cliente, e `/api/open`/webhook também podem receber `secret` no body. Remover esse desenho: segredo de integridade fica apenas no servidor/Secret Manager; cliente envia somente assinatura ou usa autenticação própria.
3. `apiKeyEncrypted`/`apiSecretEncrypted` no tipo `Account` não devem virar armazenamento de credenciais em Firestore/memória. Persistir só `credentialRef` (referência para cofre) e metadados não sensíveis.
4. O kill switch deve falhar fechado: indisponibilidade do banco/cofre, discrepância de estado ou erro de reconciliação bloqueiam novos envios live.

---

## 2. Arquitetura-alvo

```text
Signal / Bot / TradingView
        │ OrderIntent (sem segredo)
        ▼
Risk & Policy Gate ──► ledger append-only / hash-chain ──► outbox
        │ aprovado                                            │
        ▼                                                     ▼
MarketClock + Instrument Rules                         ExecutionGateway
                                                              │
                              ┌───────────────────────────────┼──────────────────────────────┐
                              ▼                               ▼                              ▼
                    Coinbase Advanced Trade           EVM / DEX hot wallet        B3 partner / FIX-OAuth
                              │                               │                              │
                              └────────► receipts, fills, balances, reconciliação ◄──────────┘
```

**Contrato recomendado:** `OrderIntent` → `RiskDecision` → `ExecutionRequest` → `ExecutionReceipt` → `Fill`. Cada registro recebe `id`, `correlationId`, `clientOrderId`, `createdAt`, `prevHash` e `hash`. O `clientOrderId` é determinístico a partir do ID interno; não reutilize HMAC de payload de usuário como ID público.

Estados mínimos: `draft → approved → queued → submitted → accepted → partially_filled → filled`, com terminais `rejected`, `cancelled`, `expired`, `failed_unknown`. `failed_unknown` exige reconciliação antes de reenvio.

---

## 3. Entregas por fase (ordem de execução)

### Fase 0 — Fundação e segurança (P0, pré-requisito)

**Objetivo:** criar um caminho único de execução que ainda opera somente em paper/testnet.

1. Criar `server/execution/` com `ExecutionGateway`, `ExecutionProvider`, `CredentialProvider`, `MarketClock` e tipos de domínio. Não acrescente integrações reais em `brokerAdapters.ts` atual; ele é acoplado ao mock.
2. Alterar `src/types.ts`: separar `BrokerId`, `Venue`, `AccountMode` (`paper | sandbox | testnet | live`) e `credentialRef`. Para live, bloquear por padrão.
3. Centralizar configuração em `server/config/env.ts`: validar variáveis obrigatórias na inicialização; nunca expor variáveis `*_SECRET`, `*_PRIVATE_KEY` ou RPC autenticado ao Vite/React.
4. Criar ledger append-only (Postgres recomendado para ordens; Firestore pode espelhar a UI). Registrar decisões de risco e recibos antes/depois de I/O. Use transação/outbox, não “salvar depois em hook não bloqueante”.
5. Tornar as políticas configuráveis por conta/venue: notional máximo, exposição por ativo, perda diária, ordens/hora, slippage, allowlist de símbolos, gas máximo e aprovação humana acima de limite.
6. Escrever testes unitários de rejeição, idempotência, timeout e kill switch. Criar ambiente `paper` como default e flag de dupla confirmação para `live`.

**Gate de saída:** `npm run lint` passa; nenhum segredo aparece em logs/JSON; teste confirma que erro no adapter não cria trade “filled”; kill switch bloqueia filas e novas submissões.

### Fase 1 — Paper trading e reconciliação (P0)

1. Implementar `PaperExecutionProvider` com livro/cotações e fills determinísticos; taxas/slippage configurados por venue, não constantes globais.
2. Adaptar `BotWorker`, `BotRegistry` e rotas `server.ts` para chamar somente `ExecutionGateway.submit(intent)` e aguardar o receipt.
3. Implementar worker de reconciliação: consulta ordens/fills/saldos, atualiza ledger e alerta diferenças. Aplicar backoff, rate limit e circuit breaker.
4. Criar endpoints operacionais protegidos por autenticação/autorizações: status da fila, receipt, reconciliação e kill switch com auditoria de quem acionou.

**Gate de saída:** 7 dias paper com reconciliação sem divergência, duplicatas e ordens após kill switch igual a zero.

### Fase 2 — Coinbase Advanced Trade em sandbox (P1)

1. Confirmar no portal da Coinbase o modelo de credencial e ambientes atualmente disponíveis para o produto contratado; as APIs/fluxos mudam. Criar chave **restrita a leitura/trade**, sem saque/transferência, com allowlist de IP se oferecida.
2. Implementar `server/execution/providers/coinbaseAdvancedTradeProvider.ts` usando a autenticação oficial vigente. Não assumir que `CB-ACCESS-SIGN`, passphrase ou HMAC valem para CDP: o método depende do tipo de chave/API.
3. Mapear símbolos (`BTC-USD` etc.), precisão, mínimos, tipos de ordem e status externos. Use `client_order_id` único e persistido antes da chamada.
4. Implementar submit, get order, cancel, balances e fills; classificar erros transitórios vs definitivos. Em timeout, reconciliar por `client_order_id` antes de retry.
5. Validar sandbox com ordens mínimas e cenários: rejeição de precisão, timeout, fill parcial, cancelamento, indisponibilidade e reinício do processo.

**Variáveis (somente servidor):** use referências de segredo como `COINBASE_API_KEY`, `COINBASE_API_SECRET` e `COINBASE_ENVIRONMENT=sandbox`. O formato exato deve seguir a documentação atual da credencial emitida; não adicione passphrase legada se não for exigida.

**Gate de saída:** 100+ ordens sandbox, 0 duplicatas e reconciliação completa de ordens/fills/saldo.

### Fase 3 — EVM / MetaMask (P1)

Há dois produtos distintos; implemente-os em módulos separados.

#### 3A. Carteira do usuário com MetaMask (assinatura interativa)

1. Frontend usa EIP-1193 somente para conectar/exibir endereço e solicitar assinatura; o backend recebe endereço, chain ID, nonce e assinatura — **nunca seed/private key**.
2. Backend emite nonce de uso único, com expiração, vinculado à sessão/usuário e verifica a assinatura SIWE/EIP-4361.
3. Para cada transação: backend monta uma proposta imutável (chain, contrato, calldata, value, limites), usuário revisa e assina no wallet. Backend registra tx hash e acompanha confirmação/reorg.
4. Permitir apenas chains/contratos/spenders em allowlist e mostrar token, valor, gas e impacto de preço. Não solicitar `approve` ilimitado por padrão.

#### 3B. Hot wallet segregada para automação

1. Criar carteira exclusivamente operacional, por estratégia/rede, com saldo pequeno, limites de gas e sem patrimônio pessoal.
2. Guardar a chave em KMS/HSM/Secret Manager com controle de acesso e rotação; `BOT_WALLET_PRIVATE_KEY` é aceitável apenas em desenvolvimento local/testnet, nunca como padrão de produção.
3. Implementar `EvmExecutionProvider` com nonce manager persistente, checagem de chain ID, estimativa de gas, teto de `maxFeePerGas`, simulação (`eth_call`/simulador) e tratamento de replacement/reorg.
4. Inicialmente usar Sepolia/testnet e contratos DEX permitidos. Validar allowance exata, `minAmountOut`, deadline curto e proteção MEV/slippage quando aplicável.

**Gate de saída:** ao menos 50 transações em testnet, incluindo nonce concorrente, transação substituída, revert e reorg simulado; zero chaves em banco, logs ou frontend.

### Fase 4 — B3 e parceiros nacionais (P2)

1. Escolher **uma** instituição parceira com API documentada e contrato que permita o caso de uso. Acesso a B3/DMA/FIX, OAuth, Open Finance e APIs de cripto não são intercambiáveis; disponibilidade depende de homologação e perfil institucional.
2. Abrir homologação e obter especificação de instrumentos, lotes, horários, leilões, margem, callbacks, certificados/mTLS e regras de risco. Não modele “XP/Genial/Inter/BTG” como adapters genéricos sem contrato/API confirmado.
3. Criar provider específico, por exemplo `XpDmaProvider` ou `BtgFixProvider`; mTLS/certificados e tokens ficam no cofre. Implementar rotação OAuth/certificado sem queda.
4. Implementar `B3MarketClock`: timezone `America/Sao_Paulo`, sessões, leilões, feriados e regras por instrumento. Se fechado, persistir como `queued`; na abertura, revalidar preço, risco e intenção antes de enviar.
5. Homologar com a corretora e obter aprovação de compliance/jurídico antes de produção. Verificar obrigações CVM, suitability, LGPD, logs/retenção e responsabilidades de execução algorítmica.

**Gate de saída:** homologação formal do parceiro, testes de sessão/feriado/leilão e reconciliação do extrato/custódia por período acordado.

### Fase 5 — Live gradual e operação (P0 para ativação)

1. Revisão independente de código, modelo de ameaça, permissões e runbook de incidente.
2. Ativar uma única conta/venue com micro-lotes, allowlist estreita e kill switch inicialmente ligado até aprovação explícita.
3. Monitorar em tempo real: latência, rejeições, fills parciais, slippage real, fees, exposição, drift de saldo, fila e idade da reconciliação.
4. Fazer reconciliação diária de ordens/fills/saldos e teste mensal do kill switch/recuperação. Escalar limite somente após período estável e aprovação registrada.

---

## 4. Variáveis e gestão de segredo

Copie apenas os nomes necessários de `.env.example`; valores reais ficam no Secret Manager do ambiente. Nunca faça commit de `.env`.

```env
# Controle global — live permanece bloqueado sem as duas confirmações server-side
EXECUTION_DEFAULT_MODE=paper
LIVE_EXECUTION_ENABLED=false
LIVE_EXECUTION_CONFIRMATION=
INTEGRITY_HMAC_SECRET=

# Coinbase: confirmar formato/autenticação na documentação atual da credencial
COINBASE_ENVIRONMENT=sandbox
COINBASE_API_KEY=
COINBASE_API_SECRET=

# EVM: URLs e chave são somente backend; comece em Sepolia
WEB3_NETWORK=sepolia
SEPOLIA_RPC_URL=
ETH_RPC_URL=
BOT_WALLET_PRIVATE_KEY=

# B3: campos dependem do parceiro homologado; usar referência de cofre em produção
B3_BROKER_SELECTED=
B3_ENVIRONMENT=homologacao
B3_CREDENTIAL_REF=
```

Regras: permissões mínimas, sem withdrawal/transfer, contas segregadas, allowlist de IP se disponível, rotação/revogação documentadas e mascaramento de segredo nos logs. Para produção, prefira `*_CREDENTIAL_REF` a trazer a chave para o processo.

## 5. Checklist por ordem de execução

- [ ] Criar branch de implementação e tickets P0–P2 por fase.
- [ ] Corrigir caminho único `ExecutionGateway` e estados de ordem.
- [ ] Remover segredos recebidos pelo cliente e adotar cofre/referência.
- [ ] Implementar ledger/outbox/reconciliação e testes de falha.
- [ ] Concluir 7 dias paper.
- [ ] Integrar Coinbase somente em sandbox e concluir cenários de falha.
- [ ] Integrar EVM em Sepolia (MetaMask interativa ou hot wallet, conforme caso).
- [ ] Formalizar parceiro B3 e fazer homologação específica.
- [ ] Fazer revisão de segurança/compliance e runbook.
- [ ] Liberar live em micro-lote com monitoramento e reversão testada.

## 6. Próxima implementação recomendada

Começar pela **Fase 0**, não pela credencial da corretora. O primeiro PR deve introduzir os tipos de `OrderIntent`/`ExecutionReceipt`, um `PaperExecutionProvider`, `ExecutionGateway` aguardado pelos três fluxos existentes (bot, bot registry e rota manual), e testes que comprovem idempotência/kill switch. Com isso, Coinbase, EVM e o parceiro B3 passam a ser providers isolados e auditáveis.
