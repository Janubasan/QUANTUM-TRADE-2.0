# 🔍 Auditoria de Autenticidade das Operações

**Repositório:** `Janubasan/QUANTUM-TRADE-2.0`
**Commit auditado:** `5ad046488130cb217643dac89e10923483e3402a` ("feat: integrate multi-broker and blockchain support")
**Data da auditoria:** 2026-09-05
**Método:** leitura integral do código + verificação empírica por execução (comandos reproduzíveis citados em cada achado)

---

## 1. Veredito resumido

O `README.md` afirma, na linha 11, que a plataforma opera com **"Zero Dados Falsos"**.

> **Essa afirmação é falsa no estado auditado.** A maior parte das operações do sistema é simulada, e — ponto crítico — **a simulação não se declara como simulação**: ela devolve hashes de transação, saldos, preços e latências com aparência de dados reais.

O problema não é existir simulação. Simulação é legítima e útil em trading. O problema é **indistinguibilidade**: um hash gerado por `Math.random()` devolvido num campo chamado `externalOrderId`, ao lado de um campo `status: 'FILLED'`, leva qualquer operador (ou auditor) a concluir que uma ordem foi executada quando nada aconteceu.

| Subsistema | Estado | Detalhe |
|---|---|---|
| Cotações (`priceAggregator`) | 🟢 **REAL** | Binance + Yahoo Finance + CoinGecko via HTTP |
| Execução on-chain EVM | 🔴 **FABRICADA** | → corrigida nesta entrega |
| Carteira MetaMask | 🔴 **FABRICADA** | → corrigida nesta entrega |
| Trilha de auditoria | 🟡 **PARCIAL** | Hash encadeado real, mas volátil e com assinatura falsa |
| Sinais dos bots (`botWorker`) | 🔴 **FABRICADOS** | RSI, EMA e direção vêm de `Math.random()` |
| Preços do `demoRunner` | 🔴 **FABRICADOS** | rotulados como `yahoo_finance` / `tradingview_ws` |
| Binance / Coinbase / MT5 | 🟡 **PARCIAL** | `ping` e ordens têm HTTP real; saldos são hardcoded |
| cTrader / B3 (nacional) | 🔴 **FABRICADOS** | nenhuma chamada de rede no arquivo |
| Paper trading | 🟢 **CORRETO** | simulação declarada como tal |
| Validação HMAC / verifier | 🟢 **REAL** | HMAC-SHA256 com `timingSafeEqual` |

---

## 2. Achados detalhados

### 🔴 F-01 — Swap on-chain devolvia hash inventado

**Arquivo:** `server/services/adapters/blockchainAdapter.ts` (commit `5ad0464`), linha 259

```ts
if (!this.wallet || this.isSandbox) {
  return {
    hash: `0x${Math.random().toString(16).substring(2)}${Date.now()}`,
    status: 'success',
    blockNumber: 19845210,
    gasUsed: '142850',
    explorerHint: `Execução simulada Sandbox EVM (${this.currentChainKey})`,
  };
}
```

Como `isSandbox` nasce `true` (linha 145), **todo swap passava por este caminho**. O hash não é um hash: `Math.random().toString(16)` produz ~11 caracteres, não 64 hex. O valor nunca existiria em nenhum explorador de blocos.

**Reprodução:**
```bash
git show 5ad0464:server/services/adapters/blockchainAdapter.ts | grep -n "Math.random().toString(16)"
# 259:        hash: `0x${Math.random().toString(16).substring(2)}${Date.now()}`,
```

---

### 🔴 F-02 — Saldos hardcoded exibidos como saldo de carteira

**Arquivo:** `blockchainAdapter.ts`, linhas 218, 225, 328, 335

```ts
async getNativeBalance(): Promise<string> {
  if (!this.wallet || !this.provider) return '1.50';          // linha 218
}
async getTokenBalance(tokenAddress: string) {
  if (!this.wallet || !this.provider) return { balance: '1000.0', symbol: 'USDC' };  // linha 225
}
public async getBalances(): Promise<Balance[]> {
  return [
    { asset: chain.nativeSymbol, free: parseFloat(nativeBal), ... },
    { asset: 'USDC', free: 5400.0, ... },   // linha 328 — sempre
    { asset: 'WETH', free: 1.25,  ... },    // linha 335 — sempre
  ];
}
```

`USDC 5400.00` e `WETH 1.25` apareciam **em todas as 7 redes**, independentemente de carteira, saldo ou conectividade. O endpoint `GET /api/blockchain/wallet` repassava esses números à interface.

---

### 🔴 F-03 — `placeOrder()` ignorava o lado da ordem e fixava o token da Polygon

**Arquivo:** `blockchainAdapter.ts`, linhas 348–371

```ts
const swapRes = await this.swapTokens(
  chain.wrappedNative,
  '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC padrão   ← linha 352
  order.quantity.toString(),
  100
);
...
return {
  executedPrice: order.price || 3450.0,   // linha 370
  status: 'FILLED',                       // linha 375 — incondicional
};
```

Três defeitos independentes:

1. `0x2791Bca1...` é o USDC **da Polygon**. Numa chamada com `chainKey = 'ethereum'`, o código tentaria interagir com esse endereço na mainnet da Ethereum, onde ele é outro contrato.
2. `order.side` é lido apenas para preencher o campo `side` do recibo — **nunca influencia a direção do swap**. BUY e SELL executavam a mesma operação.
3. `status: 'FILLED'` é devolvido mesmo quando `swapRes.status === 'failed'`. Só o campo booleano `success` refletia a falha.

---

### 🔴 F-04 — Endereço de router da Optimism não é um endereço EVM

**Arquivo:** `blockchainAdapter.ts`, linha 99

```ts
dexRouter: '0x4A7b5Da61326A6379179b40d00F57E5bbDC962c',
```

**Reprodução:**
```bash
node -e "const a='0x4A7b5Da61326A6379179b40d00F57E5bbDC962c'; console.log(a.length-2)"
# 39        ← endereços EVM têm 40 caracteres hex
```

Um endereço de 39 hex falha na validação de checksum do ethers. Qualquer swap na Optimism quebraria com um erro obscuro. Além disso, a OP Mainnet usa **Velodrome**, cujo router não é compatível com a ABI Uniswap V2 usada pelo restante do código — o endereço, mesmo com o tamanho corrigido, não funcionaria.

---

### 🔴 F-05 — Adaptador MetaMask 100% fabricado

**Arquivo:** `server/services/adapters/metamaskAdapter.ts` (commit `5ad0464`)

| Linha | Conteúdo |
|---|---|
| 18 | `walletAddress = '0x71C...89e2 (Sepolia Testnet)'` — nem é um endereço EVM |
| 20–25 | `simulatedBalances`: 4.85 ETH, 12450 USDT, 2.1 WETH, 180 UNI |
| 43 | `latency = Math.floor(Math.random() * 80 + 35)` |
| 48 | `mockTxHash` = 64 hex aleatórios |
| 87 | `blockNumber: 5412890` fixo |
| 124 | `lastPingMs: 18` fixo, `isConnected: true` fixo |

O agravante conceitual: **MetaMask é uma carteira de navegador**. Um processo Node no servidor não tem como assinar por ela. O adaptador fingia fazer algo estruturalmente impossível.

---

### 🔴 F-06 — Sinais de trading gerados por `Math.random()`

**Arquivo:** `server/engine/botWorker.ts`

```ts
60:  const deltaPercent = (Math.random() - 0.44) * 0.003 + bias;      // preço do ticker
183:      rsi: Math.round(30 + Math.random() * 40),                   // RSI "calculado"
184:      emaDiff: Number((Math.random() * 0.005).toFixed(4)),        // EMA "calculada"
185:      volatility: Number((Math.random() * 0.02).toFixed(4)),
268:  const isLong = Math.random() > 0.35; // 65% long bias           // direção da ordem
```

O RSI exibido na interface não é calculado a partir de série histórica: é um inteiro uniforme em `[30, 70)`. A direção LONG/SHORT de cada operação é um sorteio com viés de 65%. Isso significa que **o "motor de estratégias" não tem estratégia** — e o win rate reportado nos relatórios mede o viés do `Math.random()`, não a qualidade de um sinal.

**Este achado está fora do escopo desta entrega (blockchain) e permanece em aberto.**

---

### 🔴 F-07 — Cotações do `demoRunner` rotuladas com fontes que não foram consultadas

**Arquivo:** `server/tester/demoRunner.ts`

```ts
28:  source: 'yahoo_finance',
30:  close: 92450.0 + (Math.random() * 200 - 100),
36:  source: 'tradingview_ws',
38:  close: 232.5 + (Math.random() * 2 - 1),
44:  source: 'cme_micro_futures',
46:  close: 5850.25 + (Math.random() * 10 - 5),
```

O campo `source` declara a origem do dado; o valor ao lado é aleatório. Como esses envelopes passam pelo `DataVerifier` (que confere hash, assinatura HMAC e plausibilidade), **o sistema valida com sucesso um dado que ele mesmo inventou** — a validação criptográfica atesta integridade de transporte, não veracidade de origem.

---

### 🟡 F-08 — Trilha de auditoria "imutável" é um array em memória

**Arquivo:** `server/validation/logger.ts`

```ts
13:  private chain: AuditBlock[] = [];      // volátil
65:  if (this.chain.length > 500) {
66:    this.chain.shift();                  // descarta os blocos mais antigos
131:      signature: `SIG_AUDITED_${trade.id...}_${Date.now()}`,   // não é assinatura
```

Três problemas:

1. **Volatilidade** — reiniciar o processo apaga toda a trilha.
2. **Truncamento** — acima de 500 blocos, o bloco mais antigo é descartado. A cadeia passa a não ter gênese verificável.
3. **Assinatura decorativa** — `SIG_AUDITED_<id>_<timestamp>` é uma string formatada, não uma assinatura criptográfica. Não há como verificar quem a produziu.

O encadeamento `prev_hash → current_hash` em si (linhas 47–70) está **corretamente implementado** e `verifyIntegrity()` (linhas 79–104) recalcula os hashes de verdade. O defeito é de persistência e de atribuição, não do algoritmo de encadeamento.

---

### 🟡 F-09 — Saldos hardcoded em adaptadores que têm HTTP real

| Arquivo | HTTP real | Saldo |
|---|---|---|
| `binanceAdapter.ts` | ✅ linhas 66, 93, 145 | ❌ `simulatedBalances` linha 26, retornado na linha 118 |
| `coinbaseAdapter.ts` | ✅ linhas 51, 138 | ❌ `simulatedBalances` linha 16 |
| `mt5Adapter.ts` | ✅ bridge FastAPI (4 `fetch`) | ❌ `simulatedBalances` linha 26 |
| `ctraderAdapter.ts` | ❌ nenhum | ❌ `simulatedBalances` linha 25 |
| `nationalBrokerAdapter.ts` | ❌ nenhum | ❌ `simulatedBalances` linha 14 |
| `paperAdapter.ts` | — | ✅ simulação **declarada** como tal |

O `paperAdapter` é o modelo correto: ele se identifica como `kind: 'paper'`. Os demais se identificam como `exchange` / `broker` enquanto devolvem saldo fictício.

**Verificação:**
```bash
for f in binanceAdapter coinbaseAdapter mt5Adapter ctraderAdapter nationalBrokerAdapter; do
  printf "%-24s fetch=%s\n" "$f" "$(grep -c 'fetch(' server/services/adapters/$f.ts)"
done
```

---

### 🟢 F-10 — O que estava genuinamente correto

É importante registrar, para que a auditoria não vire condenação genérica:

- **`priceAggregator.ts`** — consultas reais a `api.binance.com`, `yahoo-finance2` e `api.coingecko.com`, com consolidação multi-fonte.
- **`cryptoService.ts`** — AES-256-GCM com IV aleatório de 12 bytes e auth tag; `verifyHmacSignature` usa `crypto.timingSafeEqual` (proteção contra timing attack), com comparação de comprimento prévia.
- **`validation/signer.ts` + `verifier.ts`** — serialização canônica (chaves ordenadas) antes do hash, HMAC sobre `hash + timestamp` (anti-replay), tolerância de 300 s com rejeição de timestamp futuro.
- **`killSwitchService` + middleware global** — o bloqueio de ordens cobre `/api/open`, `/api/close`, `/api/trades/manual`, `/api/bot/evaluate` e os webhooks.
- **`marketClockService` + `executionScheduler`** — mercado fechado gera enfileiramento ou rejeição auditada, não execução.

---

## 3. Defeito adicional encontrado durante a correção

### 🟠 F-11 — `provider.getBlockNumber()` do ethers devolve valor defasado em até 250 ms

Descoberto ao escrever os testes da nova integração, e reproduzido:

```
stub antes  = 18000000
diagnose #1 = 18000000 | stub = 18000000
stub pos-tx = 18000001
diagnose #2 = 18000000 | stub = 18000001   ← defasado
send direto = 18000001 | stub = 18000001   ← correto
```

**Causa raiz** (`node_modules/ethers/lib.commonjs/providers/abstract-provider.js:159`):

```js
cacheTimeout: 250,
```

`AbstractProvider` mantém um `#performCache` indexado pelo método, com TTL de 250 ms. Em um endpoint de saúde isso produz altura de bloco antiga e latência próxima de zero — **telemetria que mente**.

**Correção aplicada:** `EvmConnection.freshBlockNumber()` usa `provider.send('eth_blockNumber', [])`, que vai direto ao transporte HTTP sem passar pelo cache. Há teste de regressão (`getBlockNumber() NÃO devolve valor obsoleto do cache de 250ms do ethers`).

---

## 4. O que foi corrigido nesta entrega

| Achado | Correção | Onde |
|---|---|---|
| F-01, F-02, F-03, F-04 | Reimplementação completa da execução on-chain | `server/services/onchain/` |
| F-05 | MetaMask virou visualizador somente-leitura que recusa ordens explicitamente | `server/services/adapters/metamaskAdapter.ts` |
| F-08 | Trilha persistida em JSONL append-only + assinatura HMAC + ancoragem on-chain | `server/services/onchain/auditAnchor.ts` |
| F-11 | Leitura de bloco sem cache | `server/services/onchain/evmProvider.ts` |

### Princípios aplicados na reimplementação

1. **Proveniência declarada.** Todo dado carrega `provenance: 'onchain' | 'rpc_config' | 'local' | 'unavailable'`. Não existe campo "chutado".
2. **Ausência no lugar de invenção.** Sem carteira → exceção. Sem router → swap recusado. RPC fora do ar → erro com a causa de cada endpoint. Nunca um número plausível.
3. **Escrita exige dupla confirmação.** Swap on-chain precisa de `confirm: true` no corpo **e**, em mainnet, do header `X-Confirm-Live: <chainKey>`, **e** de `ONCHAIN_ALLOW_LIVE=true`.
4. **Router verificado contra a chain.** `verifyChain()` lê o bytecode do contrato e chama `WETH()` no router, comparando com a tabela. Discordou → `invalid` → swap bloqueado antes de gastar gas.
5. **Aprovação exata por padrão.** `approve(router, amountIn)`, não `MaxUint256`. Aprovação infinita é opt-in via `ONCHAIN_INFINITE_APPROVAL`.
6. **`eth_estimateGas` antes do envio.** Detecta revert localmente, sem custo.
7. **Revert é revert.** Quando o ethers lança `CALL_EXCEPTION` com receipt anexado, o resultado é `REVERTED` (minerada, gas consumido) — não `FAILED` (genérico).
8. **Prova por delta de saldo.** Após a confirmação, o saldo de saída é relido e o delta real é reportado em `realizedOutAmount`.
9. **O modo não é um botão.** `isSandbox` deriva da rede (testnet ⇒ sandbox, mainnet ⇒ live). O setter é intencionalmente inerte: permitir que a UI "ligasse o modo live" seria reintroduzir a fabricação.

---

## 5. Verificação executada

Nenhum achado acima depende de leitura de código apenas. Todos foram confirmados por execução.

### Teste de integração — 44 asserções, todas verdes

```bash
npm run test:onchain
# Resultado: 44 passaram, 0 falharam
```

Sobe um nó JSON-RPC local (`server/services/onchain/testing/localChainStub.ts`) e executa o `OnchainService`, o `OnchainAdapter` e o `AuditAnchorService` **reais** contra ele. Quem assina e serializa as transações é o `ethers` real, dentro do código de produção. Entre as asserções:

- `swap() SEM confirm NÃO envia transação e NÃO inventa hash` — hash é `null`, `provenance: 'local'`, zero transações no nó;
- `swap(confirm=true) envia approve + swap REAIS e confirma` — confere o calldata decodificado: `approve` com o valor **exato** (não infinito), `swapExactTokensForTokens` com `amountOutMin` = 99% da cotação;
- `swap() relê saldo de saída e reporta o delta REAL` — 2 in × rate 2 = 4 out;
- `adapter.getOrder()` — hash inválido nunca vira `FILLED`;
- `resolveToken()` — USDC da Ethereum ≠ USDC da Polygon (fim do F-03).

### Teste de fumaça HTTP — 15 asserções, todas verdes

```bash
npm run test:http
# Resultado: 15 passaram, 0 falharam
```

Inicia o servidor Express **real** (`server.ts`) apontado para o nó local e chama os endpoints HTTP. Cobre o caminho completo: rota → gateway → `OnchainService` → ethers → JSON-RPC → assinatura → receipt.

### Typecheck

```bash
npm run lint     # tsc --noEmit → exit 0
```

### ⚠️ Limite da verificação — declarado explicitamente

**Este sandbox não tem saída de rede para RPCs públicos.** Confirmado:

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 https://polygon-rpc.com
# 000        (TLS bloqueado)
```

Consequência honesta:

- ✅ **Verificado aqui:** toda a lógica, o calldata, a assinatura, o parsing de receipt, os guards, a persistência e as rotas HTTP — contra um nó que fala o protocolo JSON-RPC real.
- ❌ **Não verificado aqui:** uma transação **em uma blockchain pública**. Isso exige rede e precisa ser feito por você, seguindo o passo 6 do guia (`docs/GUIA_INTEGRACAO_BLOCKCHAIN.md`), em testnet.
- 
Essa distinção importa: o que está provado é que o código se comporta corretamente contra o protocolo. O que ainda não está provado é que os endereços de router e token da tabela estão corretos **em cada mainnet** — e é exatamente por isso que `verifyChain()` existe: ele confere isso contra a chain antes de qualquer swap.

---

## 6. Achados em aberto

Estes **não** foram corrigidos nesta entrega e continuam valendo:

| # | Achado | Impacto |
|---|---|---|
| F-06 | Sinais e indicadores dos bots vêm de `Math.random()` | Crítico — invalida qualquer métrica de performance |
| F-07 | Cotações do `demoRunner` rotuladas com fontes não consultadas | Alto — a validação criptográfica atesta dado inventado |
| F-09 | Saldos hardcoded em Binance/Coinbase/MT5/cTrader/B3 | Alto — carteira exibida não é a carteira real |
| — | `README.md:11` afirma "Zero Dados Falsos" | Alto — afirmação contradiz o código |

Recomendação para F-09: aplicar o mesmo padrão usado aqui — `provenance` por campo e exceção no lugar de saldo inventado.
