# ⛓️ Guia de Integração Blockchain — Passo a Passo

Integração **on-chain real** com redes EVM (Ethereum, Polygon, BSC, Arbitrum, Base, Optimism, Avalanche + testnets).

> **Leia antes de começar:** este guia foi escrito para que você execute a primeira transação real **somente no passo 8**, em testnet, com valor sem importância. Os passos 1 a 7 são preparação e verificação. Não pule etapas: cada uma delas existe porque a versão anterior deste projeto tinha um defeito que aquela etapa previne.
>
> Relatório da auditoria que motivou esta integração: [`docs/AUDITORIA_AUTENTICIDADE.md`](./AUDITORIA_AUTENTICIDADE.md)

---

## Índice

1. [O que foi implementado](#1-o-que-foi-implementado)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Instalação](#3-instalação)
4. [Criar a carteira dedicada](#4-criar-a-carteira-dedicada)
5. [Configurar o `.env`](#5-configurar-o-env)
6. [Financiar a carteira em testnet](#6-financiar-a-carteira-em-testnet)
7. [Verificar a conexão e o router](#7-verificar-a-conexão-e-o-router)
8. [Primeira operação real (testnet)](#8-primeira-operação-real-testnet)
9. [Integrar ao motor de ordens](#9-integrar-ao-motor-de-ordens)
10. [Ancoragem on-chain da auditoria](#10-ancoragem-on-chain-da-auditoria)
11. [Migrar para mainnet](#11-migrar-para-mainnet-dinheiro-real)
12. [Integrar neste repositório do GitHub](#12-integrar-neste-repositório-do-github)
13. [Referência de endpoints](#13-referência-de-endpoints)
14. [Solução de problemas](#14-solução-de-problemas)
15. [Checklist de segurança](#15-checklist-de-segurança)

---

## 1. O que foi implementado

```
server/services/onchain/
├── types.ts                     Tipos + campo `provenance` em todo dado
├── chainRegistry.ts             Redes + VERIFICAÇÃO ON-CHAIN do router
├── evmProvider.ts               JSON-RPC com failover + leitura sem cache
├── tokenRegistry.ts             Símbolo → contrato, específico por rede
├── onchainService.ts            Saldo, cotação, approve, swap, receipt
├── onchainAdapter.ts            BrokerAdapter real (id 'blockchain_evm')
├── auditAnchor.ts               Trilha de auditoria persistida + ancorada
├── onchain.integration.test.ts  44 asserções contra nó JSON-RPC local
└── testing/localChainStub.ts    Nó JSON-RPC local (só para testes)
```

**Garantias que o código oferece** (todas cobertas por teste automatizado):

| Garantia | Como |
|---|---|
| Nenhum dado inventado | Sem carteira → exceção. Sem router → swap recusado. Sem transação → `hash: null` |
| Dry-run explícito | Sem `confirm: true`, nada é enviado e `dryRun: true` é retornado |
| Router conferido na chain | `eth_getCode` + `WETH()` comparado com a tabela |
| Aprovação exata | `approve(router, amountIn)` por padrão, não `MaxUint256` |
| Revert detectado antes | `eth_estimateGas` com o calldata real |
| Mainnet protegida | `ONCHAIN_ALLOW_LIVE=true` + `confirm: true` + header `X-Confirm-Live` |
| Execução comprovável | `realizedOutAmount` = delta real de saldo lido após a confirmação |

---

## 2. Pré-requisitos

| Item | Versão mínima | Verificar com |
|---|---|---|
| Node.js | 18.x (recomendado 20+) | `node -v` |
| npm | 9.x | `npm -v` |
| Git | 2.x | `git --version` |
| Acesso a RPC EVM | — | `curl -s https://ethereum-sepolia-rpc.publicnode.com` |

Dependência de blockchain: **`ethers` v6** — já está em `package.json` (`"ethers": "^6.17.0"`).

---

## 3. Instalação

```bash
# 1. Clonar e entrar no repositório
git clone https://github.com/Janubasan/QUANTUM-TRADE-2.0.git
cd QUANTUM-TRADE-2.0

# 2. Criar um branch de trabalho (NUNCA trabalhe direto na main)
git checkout -b feat/onchain-integration

# 3. Instalar dependências
npm install

# 4. Rodar os testes da camada on-chain (não precisa de internet)
npm run test:onchain
# → Resultado: 44 passaram, 0 falharam

# 5. Typecheck
npm run lint
# → exit 0
```

**Se o passo 4 falhar, pare aqui.** Não faz sentido configurar carteira com a camada base quebrada.

---

## 4. Criar a carteira dedicada

> ⚠️ **Regra número um:** use uma carteira **nova e exclusiva** para o bot. Nunca a sua carteira pessoal. Se a chave vazar, o prejuízo é limitado ao que estiver nela.

### Opção A — linha de comando (recomendada para servidor)

```bash
node -e "
const { ethers } = require('ethers');
const w = ethers.Wallet.createRandom();
console.log('Endereço      :', w.address);
console.log('Chave privada :', w.privateKey);
console.log('Mnemônico     :', w.mnemonic.phrase);
"
```

**Guarde o mnemônico offline** (papel, gerenciador de senhas). Ele é a única forma de recuperar a carteira.

### Opção B — MetaMask

1. MetaMask → *Criar conta* → nova conta dedicada (ex.: "JANUTRADE Bot").
2. Detalhes da conta → *Exportar chave privada*.

### Cifrar a chave antes de colocar no `.env`

O `.env` fica em texto plano no disco. O projeto tem cofre AES-256-GCM (`server/services/cryptoService.ts`) — use-o:

```bash
node -e "
require('dotenv').config();
const { encryptSecret } = require('./server/services/cryptoService.ts');
console.log(encryptSecret(process.argv[1]));
" "0xSUA_CHAVE_PRIVADA_AQUI"
# vault:v1:1a2b3c...:deadbeef...:9f8e7d...
```

O `OnchainService` aceita os dois formatos: texto puro **ou** `vault:v1:...`.

> Se você usa `tsx` em vez de `node` para rodar TypeScript:
> `npx tsx -e "import {encryptSecret} from './server/services/cryptoService.js'; console.log(encryptSecret('0x...'))"`

---

## 5. Configurar o `.env`

```bash
cp .env.example .env
```

Edite `.env` — o mínimo para começar em testnet:

```ini
# Chave mestra do cofre. TROQUE: o valor do exemplo é público no repositório.
ENCRYPTION_KEY="gere-uma-string-longa-e-aleatoria-aqui"

# Carteira dedicada do passo 4
EVM_PRIVATE_KEY="0x..."

# Testnet primeiro. Sempre.
DEFAULT_CHAIN="sepolia"

# Travas — deixe exatamente assim nesta fase
ONCHAIN_ALLOW_LIVE="false"
ONCHAIN_MAX_NOTIONAL_USD="1000"
ONCHAIN_CONFIRMATIONS="1"
ONCHAIN_INFINITE_APPROVAL="false"
```

**Confirme que o `.env` não será commitado:**

```bash
grep -q '^\.env\*' .gitignore && echo "OK: .env está ignorado" || echo "ERRO: ajuste o .gitignore"
git check-ignore -v .env
# → .gitignore:7:.env*   .env
```

### Variáveis relevantes

| Variável | Padrão | Efeito |
|---|---|---|
| `DEFAULT_CHAIN` | `sepolia` | Rede ativa na inicialização |
| `EVM_PRIVATE_KEY` | vazio | Sem ela, nada é assinado (e nada é fingido) |
| `ONCHAIN_ALLOW_LIVE` | `false` | `false` ⇒ mainnet recusada sempre |
| `ONCHAIN_MAX_NOTIONAL_USD` | `1000` | Teto bruto por operação |
| `ONCHAIN_CONFIRMATIONS` | `1` | Confirmações antes de `CONFIRMED` |
| `ONCHAIN_INFINITE_APPROVAL` | `false` | `true` ⇒ `approve(MaxUint256)` |
| `RPC_<REDE>` | vazio | RPC próprio, com prioridade sobre os públicos |
| `DEX_ROUTER_<REDE>` | vazio | Sobrescreve o router da tabela |
| `TOKEN_<REDE>_<SIMBOLO>` | — | Registra token novo para aquela rede |
| `AUDIT_DIR` | `server/data/audit` | Onde a trilha de auditoria é persistida (pasta em `.gitignore`) |
| `AUDIT_ANCHOR_CONTRACT` | vazio | Contrato `anchor(bytes32)` opcional |

---

## 6. Financiar a carteira em testnet

Descubra o endereço:

```bash
curl -s http://localhost:3000/api/onchain/status | jq '.wallet'
# { "address": "0x7099...79C8", "chainKey": "sepolia", "hasSigningKey": true, "isTestnet": true }
```

Pegue ETH de teste na **Sepolia**:

- https://faucets.chain.link/sepolia
- https://sepoliafaucet.com
- https://cloud.google.com/application/web3/faucet/ethereum/sepolia

Confirme o saldo **on-chain** (não confie só no faucet):

```bash
curl -s "http://localhost:3000/api/onchain/balances?tokens=" | jq '.native'
# { "amount": "0.5", "symbol": "ETH", "blockNumber": 6812345, "provenance": "onchain" }
```

O campo `provenance: "onchain"` é a garantia de que o número veio da chain. Se vier `"unavailable"`, o saldo **não** foi lido — não há valor de mentira no lugar.

---

## 7. Verificar a conexão e o router

### 7.1 Subir o servidor

```bash
npm run dev
# 🚀 Quantum Trade Server listening on http://0.0.0.0:3000
```

### 7.2 Diagnóstico do RPC

```bash
curl -s http://localhost:3000/api/onchain/status | jq '.rpc'
```

```json
{
  "chainId": 11155111,
  "blockNumber": 6812345,
  "connected": true,
  "latencyMs": 142,
  "rpcUsed": "https://ethereum-sepolia-rpc.publicnode.com",
  "endpoints": [ { "url": "...", "successes": 3, "failures": 0, "avgLatencyMs": 138.4 } ]
}
```

Se `connected: false`, o campo `error` traz **a falha de cada endpoint testado** — não uma mensagem genérica.

### 7.3 Verificar o router ON-CHAIN

Este passo é obrigatório antes de qualquer swap. Ele confere, na própria blockchain, que o router configurado existe e usa o token envelopado esperado:

```bash
curl -s -X POST http://localhost:3000/api/onchain/verify | jq
```

```json
{
  "success": true,
  "verification": "verified",
  "detail": "Router 0x3bFA...e48E confirmado on-chain (WETH()=0xfFf9...6B14)."
}
```

| `verification` | Significado | Swap? |
|---|---|---|
| `verified` | Router e wrappedNative confirmados na chain | ✅ permitido |
| `unverified` | Ainda não conferido | ❌ recusado |
| `invalid` | Chain e tabela discordam, ou não há contrato | ❌ recusado |

> **Por que isto importa:** a versão anterior trazia na Optimism o "router" `0x4A7b5Da61326A6379179b40d00F57E5bbDC962c` — 39 caracteres hex, não um endereço EVM. Ninguém notou porque nada validava a tabela. `verifyChain()` torna essa classe de erro impossível de passar despercebida.

### 7.4 Conferir os tokens registrados na rede ativa

```bash
curl -s http://localhost:3000/api/onchain/status | jq '.tokens'
curl -s http://localhost:3000/api/onchain/resolve/WETH | jq
```

---

## 8. Primeira operação real (testnet)

### 8.1 Cotação (não envia nada)

```bash
WETH=$(curl -s http://localhost:3000/api/onchain/resolve/WETH | jq -r .address)
USDC=$(curl -s http://localhost:3000/api/onchain/resolve/USDC | jq -r .address)

curl -s -X POST http://localhost:3000/api/onchain/quote \
  -H 'content-type: application/json' \
  -d "{\"tokenIn\":\"$WETH\",\"tokenOut\":\"$USDC\",\"amountIn\":\"0.001\",\"slippageBps\":100}" | jq '.quote'
```

```json
{
  "path": ["0xfFf9...6B14", "0x1c7D...7238"],
  "amountInHuman": "0.001",
  "amountOutHuman": "2.41",
  "amountOutMinHuman": "2.3859",
  "slippageBps": 100,
  "router": "0x3bFA...e48E",
  "blockNumber": 6812350,
  "provenance": "onchain"
}
```

### 8.2 Dry-run (ainda não envia nada)

Sem `confirm`, o endpoint **não envia transação** e devolve `hash: null`:

```bash
curl -s -X POST http://localhost:3000/api/onchain/swap \
  -H 'content-type: application/json' \
  -d "{\"tokenIn\":\"$WETH\",\"tokenOut\":\"$USDC\",\"amountIn\":\"0.001\"}" | jq '.result | {hash, status, dryRun, dryRunReason}'
```

```json
{
  "hash": null,
  "status": "NOT_SENT",
  "dryRun": true,
  "dryRunReason": "confirm ausente ou false: nenhuma transação enviada. Envie confirm=true para executar de verdade."
}
```

**Isto é intencional.** A versão anterior devolvia aqui um hash inventado com `Math.random()`. Agora a ausência é declarada.

### 8.3 Executar de verdade

```bash
curl -s -X POST http://localhost:3000/api/onchain/swap \
  -H 'content-type: application/json' \
  -d "{\"tokenIn\":\"$WETH\",\"tokenOut\":\"$USDC\",\"amountIn\":\"0.001\",\"slippageBps\":100,\"confirm\":true}" | jq '.result'
```

```json
{
  "hash": "0x9f2c1a...",
  "status": "CONFIRMED",
  "blockNumber": 6812401,
  "confirmations": 1,
  "gasUsed": "142310",
  "txFeeNative": "0.00028462",
  "explorerUrl": "https://sepolia.etherscan.io/tx/0x9f2c1a...",
  "provenance": "onchain",
  "realizedOutAmount": "2410000",
  "approval": { "hash": "0x7b1e...", "status": "CONFIRMED" }
}
```

**Audite você mesmo:** abra `explorerUrl`. O hash, o bloco e o gas devem bater. `realizedOutAmount` é o delta real do saldo de saída, relido da chain após a confirmação — se o swap não tivesse acontecido, seria `0`.

### 8.4 Status de uma transação

```bash
curl -s http://localhost:3000/api/onchain/tx/0x9f2c1a... | jq
```

Hash inexistente devolve `found: false` — nunca uma confirmação inventada.

---

## 9. Integrar ao motor de ordens

O adaptador está registrado no `RealExecutionGateway` com o id **`blockchain_evm`**, então o despacho existente (`POST /api/real-execution/dispatch`) já o alcança.

### 9.1 Rotear um símbolo para a blockchain

`selectAdapterForInstrument()` envia para `blockchain_evm` símbolos contendo `DEX`, `EVM`, `SWAP`, `POLYGON`, `ARBITRUM`, `AVAX`, `DEFI` ou `ERC20`. Ex.: `SWAP-ETH/USDC`.

### 9.2 Confirmar a execução

**Por padrão o adaptador NÃO executa.** Uma ordem sem confirmação volta como `QUEUED`:

```ts
const order: SignedOrder = {
  id: 'ord-1',
  account_id: 'acc-1',
  symbol: 'ETH/USDC',     // par BASE/QUOTE
  side: 'BUY',            // BUY = compra BASE pagando QUOTE
  quantity: 0.01,
  price: 2400,            // em BUY: notional = price * quantity, em QUOTE
  meta: {
    onchainConfirm: true, // sem isto: dry-run, nada é enviado
    slippageBps: 100,
  },
};
```

Sem `meta.onchainConfirm`, o recibo vem `status: 'QUEUED'`, `success: false` e **sem** `externalOrderId` — nunca um `FILLED` falso.

### 9.3 Símbolos precisam estar registrados

`ETH/USDC` funciona se ambos estiverem no `TOKEN_REGISTRY` **da rede ativa**. Consulte:

```bash
curl -s http://localhost:3000/api/onchain/status | jq '.tokens'
```

Para adicionar um token, no `.env`:

```ini
TOKEN_SEPOLIA_MEUTOKEN="0x..."
```

Símbolo não registrado ⇒ recibo `REJECTED` com a mensagem `"Token não registrado na rede X"`. Isso é deliberado: a versão anterior usava o USDC **da Polygon** em todas as redes.

---

## 10. Ancoragem on-chain da auditoria

A trilha de auditoria era um array em memória (`private chain: AuditBlock[] = []`), apagado a cada restart e truncado acima de 500 blocos. Agora ela é:

1. **persistida** em JSONL append-only (`AUDIT_DIR`, padrão `server/data/audit/audit-chain.jsonl`);
2. **assinada** com HMAC-SHA256 por bloco;
3. **ancorada on-chain** — o hash da cabeça da cadeia vai no `data` de uma transação de valor zero.

### 10.1 Ancorar agora

```bash
curl -s -X POST http://localhost:3000/api/onchain/audit/anchor \
  -H 'content-type: application/json' -d '{}' | jq '.anchor'
```

```json
{
  "auditHeadHash": "3fa8c1...",
  "auditBlockNumber": 42,
  "blocksCovered": 43,
  "txHash": "0x5d91...",
  "blockNumber": 6812510,
  "explorerUrl": "https://sepolia.etherscan.io/tx/0x5d91...",
  "anchored": true,
  "signature": "c0ffee..."
}
```

Sem carteira, `anchored: false` e `reason` explica — **não há ancoragem fingida**.

### 10.2 Verificar integridade

```bash
curl -s http://localhost:3000/api/onchain/audit/integrity | jq '{valid, totalBlocks, persistedBlocks, brokenReason}'
```

`valid: true` significa que cada bloco foi recalculado (`sha256(prev_hash + entry)`) e bate com o armazenado.

### 10.3 Ancoragem periódica

```ts
import { getAuditAnchorService } from './server/services/onchain/auditAnchor.js';
getAuditAnchorService().startPeriodicAnchoring(10); // a cada 10 minutos
```

### 10.4 Por que isso é mais forte

Depois de ancorado, adulterar um bloco da auditoria exige encontrar uma pré-imagem SHA-256 **e** o hash ancorado continua conferível no explorador público. Quem audita não precisa mais confiar na memória do processo.

Para ancorar num contrato próprio (índice consultável), defina `AUDIT_ANCHOR_CONTRACT` com um contrato que exponha `anchor(bytes32)`.

---

## 11. Migrar para mainnet (dinheiro real)

> 🔴 **Não faça isto antes de rodar pelo menos uma semana em testnet.**

Mainnet exige **quatro** condições simultâneas. Faltando qualquer uma, a transação é recusada antes do envio:

| # | Condição | Onde |
|---|---|---|
| 1 | `ONCHAIN_ALLOW_LIVE="true"` | `.env` |
| 2 | `confirm: true` | corpo da requisição |
| 3 | Header `X-Confirm-Live: <chainKey>` | HTTP (ex.: `X-Confirm-Live: polygon`) |
| 4 | Router `verified` na rede | `POST /api/onchain/verify` |

```bash
curl -s -X POST http://localhost:3000/api/onchain/swap \
  -H 'content-type: application/json' \
  -H 'X-Confirm-Live: polygon' \
  -d '{"tokenIn":"0x...","tokenOut":"0x...","amountIn":"1","slippageBps":50,"confirm":true}' | jq
```

Sem o header, a resposta é `412 Precondition Failed` com `"sent": false`.

### Recomendações para mainnet

1. **Comece com `ONCHAIN_MAX_NOTIONAL_USD` baixo** (ex.: `50`) e suba gradualmente.
2. **RPC próprio.** RPC público aplica rate limit e cai. Configure `RPC_POLYGON="https://polygon-mainnet.g.alchemy.com/v2/SUA_KEY"`.
3. **`ONCHAIN_CONFIRMATIONS=2` ou mais** em redes com reorg frequente.
4. **Nunca** `ONCHAIN_INFINITE_APPROVAL=true` sem necessidade — aprovação infinita deixa o router com acesso permanente ao saldo.
5. **`ONCHAIN_FORCE_MULTIHOP=true`** se o par direto tiver pouca liquidez.
6. **Monitore** `/api/onchain/status`: `endpoints[].failures` crescendo indica RPC instável.

---

## 12. Integrar neste repositório do GitHub

### 12.1 Fluxo de branch e PR

```bash
# você já está no branch do passo 3
git status

# revisar o que vai entrar
git diff --stat

# adicionar SOMENTE o que pertence à integração
git add server/services/onchain/ \
        server/services/adapters/blockchainAdapter.ts \
        server/services/adapters/metamaskAdapter.ts \
        server/services/realExecutionGateway.ts \
        server.ts \
        .env.example \
        package.json \
        docs/AUDITORIA_AUTENTICIDADE.md \
        docs/GUIA_INTEGRACAO_BLOCKCHAIN.md

# conferir que NENHUM segredo entrou
git diff --cached | grep -iE "private_key|0x[a-fA-F0-9]{64}" && echo "⚠️ REVISE" || echo "✅ sem segredo"

git commit -m "feat(onchain): execução EVM real + auditoria ancorada

- Substitui blockchainAdapter/metamaskAdapter fabricados por execução on-chain real
- Verificação do router contra a chain antes de qualquer swap
- Trilha de auditoria persistida (JSONL) e ancorada on-chain
- Leitura de bloco sem o cache de 250ms do ethers
- 44 testes de integração + 15 testes de fumaça HTTP"

git push -u origin feat/onchain-integration
```

### 12.2 Abrir o Pull Request

```bash
gh pr create \
  --base main \
  --head feat/onchain-integration \
  --title "feat(onchain): integração blockchain real (EVM)" \
  --body "$(cat <<'EOF'
## O que muda
Substitui a camada on-chain simulada por execução real em redes EVM, e ancora a
trilha de auditoria na chain.

## Motivação
Auditoria em `docs/AUDITORIA_AUTENTICIDADE.md`. Resumo: o adaptador devolvia
hash de transação gerado por `Math.random()`, saldo hardcoded (USDC 5400) e
`status: 'FILLED'` sem transação alguma.

## Verificação
- `npm run test:onchain` → 44/44
- `npm run test:http` → 15/15
- `npm run lint` → exit 0

## Não incluído (segue em aberto)
- F-06: sinais dos bots ainda usam `Math.random()` (`botWorker.ts`)
- F-07: cotações do `demoRunner` rotuladas com fontes não consultadas
- F-09: saldos hardcoded em Binance/Coinbase/MT5/cTrader/B3
EOF
)"
```

### 12.3 Segredos: GitHub Actions, não `.env`

O `.env` **nunca** vai para o repositório (`.gitignore:7` cobre `.env*`). Em CI, use **Secrets** do repositório:

*Settings → Secrets and variables → Actions → New repository secret*

| Secret | Conteúdo |
|---|---|
| `ENCRYPTION_KEY` | chave mestra do cofre |
| `EVM_PRIVATE_KEY_TESTNET` | chave da carteira **de teste** |

Exemplo de workflow (`.github/workflows/onchain.yml`) que roda só o que **não** toca a chain pública:

```yaml
name: onchain
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run test:onchain
      - run: npm run test:http
```

> `test:onchain` e `test:http` rodam contra um nó JSON-RPC **local**, então não precisam de segredo nem de internet. É proposital: CI que depende de RPC público é CI que falha sozinho.

### 12.4 Se você precisa commitar o `package-lock.json`

Este repositório padroniza em **bun** (`bun.lock` está commitado). Se você usa npm, ou migra o lockfile inteiro, ou mantém o `package-lock.json` fora do versionamento:

```bash
echo "package-lock.json" >> .gitignore
```

---

## 13. Referência de endpoints

### Rede e diagnóstico

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/onchain/chains` | Redes suportadas + estado de verificação |
| `GET` | `/api/onchain/status` | Rede ativa, carteira, saúde do RPC, tokens |
| `POST` | `/api/onchain/chain` | `{ chainKey }` — troca de rede |
| `POST` | `/api/onchain/verify` | Confere o router **na chain** |
| `POST` | `/api/onchain/wallet/key` | `{ privateKey }` — carrega carteira em memória |
| `POST` | `/api/onchain/watch-address` | `{ address }` — endereço só observado |

### Leitura e execução

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/onchain/balances?tokens=0x..,0x..` | Saldos reais (nativo + ERC-20) |
| `GET` | `/api/onchain/resolve/:symbol` | Símbolo → contrato na rede ativa |
| `POST` | `/api/onchain/quote` | `{ tokenIn, tokenOut, amountIn, slippageBps }` |
| `POST` | `/api/onchain/swap` | `{ ..., confirm, dryRun }` — header `X-Confirm-Live` em mainnet |
| `GET` | `/api/onchain/tx/:hash` | Receipt real (`found`, `status`, `gasUsed`) |

### Auditoria

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/onchain/audit/anchor` | `{ dryRun? }` — ancora a cabeça da cadeia |
| `GET` | `/api/onchain/audit/integrity` | Recalcula hash por hash + lista âncoras |

### Legados (compatibilidade)

`GET /api/blockchain/chains` · `GET /api/blockchain/wallet` · `POST /api/blockchain/select-chain` · `POST /api/blockchain/quote` · `POST /api/blockchain/swap`

Todos reapontados para a implementação real. `GET /api/blockchain/wallet` sem carteira devolve **400**, não saldo inventado.

---

## 14. Solução de problemas

| Sintoma | Causa provável | Ação |
|---|---|---|
| `Nenhuma carteira configurada` | `EVM_PRIVATE_KEY` vazio | Passo 4. Nada é simulado no lugar |
| `Falha ao decriptografar credencial` | `ENCRYPTION_KEY` mudou após cifrar | Recifre a chave com a chave atual |
| `Router de X não verificado` | `POST /api/onchain/verify` não rodou | Rode a verificação |
| `Nenhum contrato no endereço 0x...` | Router errado para aquela chainId | Ajuste `DEX_ROUTER_<REDE>` |
| `Router responde WETH()=0xA, mas a tabela declara 0xB` | Tabela desatualizada | Confie na chain: atualize a tabela |
| `Símbolo "X" não registrado na rede Y` | Token fora do registro | `TOKEN_<REDE>_<SIMBOLO>=0x...` |
| `execution reverted: INSUFFICIENT_OUTPUT_AMOUNT` | Slippage menor que o movimento de preço | Aumente `slippageBps` |
| `eth_estimateGas rejeitou o swap` | A transação reverteria | Nada foi enviado; veja a cotação e o saldo |
| `Guarda de risco: saída estimada ... excede` | Acima de `ONCHAIN_MAX_NOTIONAL_USD` | Intencional. Ajuste só se for o caso |
| `Falha em "..." em todos os N RPCs` | Rede/RPC fora do ar | Configure `RPC_<REDE>` próprio |
| `connected: false` em `/status` | Veja `endpoints[].lastError` | Cada endpoint traz a própria causa |
| Swap em mainnet devolve 412 | Falta `X-Confirm-Live` | Intencional — leia o passo 11 |

### Testes

```bash
npm run test:onchain   # 44 asserções contra nó JSON-RPC local
npm run test:http      # 15 asserções contra o servidor Express real
npm run lint           # tsc --noEmit
```

---

## 15. Checklist de segurança

**Antes de qualquer operação:**
- [ ] Carteira **dedicada**, nunca a pessoal
- [ ] Mnemônico guardado offline
- [ ] `ENCRYPTION_KEY` trocado (o do `.env.example` é público)
- [ ] `.env` confirmado no `.gitignore` (`git check-ignore -v .env`)
- [ ] `git log -p | grep -i private_key` sem ocorrências
- [ ] `POST /api/onchain/verify` retornando `verified`

**Em testnet:**
- [ ] `DEFAULT_CHAIN` é uma testnet
- [ ] `ONCHAIN_ALLOW_LIVE="false"`
- [ ] Dry-run conferido antes do `confirm: true`
- [ ] Hash conferido no explorador de blocos

**Antes de mainnet:**
- [ ] Pelo menos uma semana estável em testnet
- [ ] RPC próprio configurado (não público)
- [ ] `ONCHAIN_MAX_NOTIONAL_USD` baixo
- [ ] `ONCHAIN_INFINITE_APPROVAL="false"`
- [ ] `ONCHAIN_CONFIRMATIONS` ≥ 2
- [ ] Limite diário de perda definido e kill switch testado
- [ ] Você entende que **transação on-chain é irreversível**

---

## O que ainda não está pronto

Honestidade sobre o escopo, para ninguém assumir mais do que foi feito:

1. **Sem oráculo de preço.** `ONCHAIN_MAX_NOTIONAL_USD` compara com a quantidade do token de saída, não com USD convertido. É um teto bruto.
2. **Só ABI Uniswap V2.** DEXs com router diferente (Velodrome na OP, Uniswap V3, Curve) não são suportados. Por isso a OP Mainnet vem **sem** router configurado.
3. **Sem roteamento multi-hop inteligente.** O caminho é direto ou via wrapped native (com `ONCHAIN_FORCE_MULTIHOP`); não há busca de melhor rota entre DEXs.
4. **Sem proteção MEV.** Não há private mempool (Flashbots/MEV Blocker). Swaps grandes em mainnet ficam expostos a sandwich attack além do que o slippage cobre.
5. **Os achados F-06, F-07 e F-09 da auditoria seguem em aberto** — sinais aleatórios no `botWorker`, cotações fabricadas no `demoRunner` e saldos hardcoded em Binance/Coinbase/MT5/cTrader/B3.
