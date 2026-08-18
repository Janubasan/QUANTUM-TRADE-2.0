# Integração real MT5 + Proft/Profit (demo auditado → live)

## Auditoria do que existia

Os adaptadores em `server/adapters/brokerAdapters.ts` **não falavam com corretora**. `createOrder` devolvia `status: 'filled'` local, sem ticket, sem deal, sem saldo real. API keys eram truncadas e nunca usadas. O README citava MT5, mas o tipo `BrokerId` não incluía `mt5`.

Isso **não é replicável no mundo real**. O caminho novo recusa fill inventado.

## Por que não existe “REST oficial do MT5”

A MetaQuotes **não publica API HTTP de varejo** para abrir ordem na conta do trader. Integração real de varejo é:

1. Expert Advisor no terminal (este repositório: `mt5/QuantumTradeBridge.mq5`)
2. Manager API / Web API **só no lado da corretora**
3. Provedor terceirizado tipo MetaApi (não embutido)

O site na nuvem **não consegue** `OrderSend` sozinho. O EA no Windows do trader (ou VPS) faz o `OrderSend` e devolve ticket/retcode.

## Sobre proft.com

`http://proft.com` não é uma mesa de trade (é um site antigo de consultoria). No Brasil, a stack equivalente é **Profit Chart / ProfitDLL (Nelogica)** ou o REST da sua mesa.

O conector `proft` deste repo fala:

- protocolo de ponte idêntico ao MT5 (`/api/proft/bridge/*`)
- REST HMAC (`PROFT_API_BASE_URL` + `X-API-Key` / `X-Timestamp` / `X-Signature`)
- agente Windows `profit/quantum_trade_profit_agent.py` para ProfitDLL

## Mesmo código demo e live

| Trava | Demo | Live |
| --- | --- | --- |
| EA / agente | mesmo binário | mesmo binário |
| Endpoints | mesmos | mesmos |
| `venueEnvironment` | `demo` | `live` |
| `ALLOW_LIVE_TRADING` | irrelevante | obrigatório `true` |
| `allowLiveExecution` na conta | false | true + conta `real` |
| Fill | só com ticket da venue | só com ticket da venue |

## Passo a passo MT5 demo

1. Crie conta demo na corretora (ou MetaQuotes-Demo).
2. Copie `mt5/QuantumTradeBridge.mq5` para `MQL5/Experts/` e compile.
3. Em **Ferramentas → Opções → Expert Advisors**, marque “Permitir WebRequest” e adicione a URL do JANUTRADE.
4. Abra o site → **MT5 & Proft** → emita o bridge token da conta `acc-mt5-demo`.
5. Anexe o EA ao gráfico. Inputs:

```
InpBaseUrl     = https://SEU-HOST
InpAccountId   = acc-mt5-demo
InpBridgeToken = qt_...
InpPollSeconds = 2
```

6. O card deve ir para **venue online** com saldo/equity do terminal.
7. Clique **Ordem teste demo**. A ordem fica `pending` até o EA reportar `filled` + ticket.
8. Confira a trilha HMAC em **Validação RAG** e em **MT5 & Proft**.

## Passo a passo Profit / Proft

```bash
python profit/quantum_trade_profit_agent.py \
  --hub https://SEU-HOST \
  --account-id acc-proft-demo \
  --token qt_... \
  --environment demo \
  --rest-url https://api.sua-mesa.com \
  --api-key ... \
  --api-secret ...
```

No Windows, se `ProfitDLL64.dll` estiver no PATH e `PROFIT_ACTIVATION_KEY` for da Nelogica, o agente tenta a DLL. Sem REST e sem DLL, o report é `rejected` — **não há fill fantasma**.

## Contrato da ponte

Autenticação: `Authorization: Bearer <bridgeToken>` + `X-Account-Id`.

```
POST /api/mt5/bridge/heartbeat
POST /api/mt5/bridge/commands   → { commands: [...] }
POST /api/mt5/bridge/report     → ticket, retcode, price, volume

POST /api/proft/bridge/heartbeat
POST /api/proft/bridge/commands
POST /api/proft/bridge/report
```

Comando típico:

```json
{
  "id": "mt5-...",
  "action": "open",
  "symbol": "EURUSD",
  "direction": "LONG",
  "volume": 0.01,
  "sl": 1.0800,
  "tp": 1.0900,
  "comment": "QT2",
  "magic": 20260818
}
```

## Promover para live

1. Rode o demo até a cadeia de auditoria bater com o extrato da corretora.
2. `ALLOW_LIVE_TRADING=true` no servidor.
3. Crie conta `type=real` e `POST /api/accounts/:id/routing` com `{ "venueEnvironment": "live", "allowLiveExecution": true, "routeToVenue": true }`.
4. No MT5, troque o login para a conta real. O EA é o mesmo.

## Arquivos

- `server/adapters/mt5/*` — fila, heartbeat, reconciliação
- `server/adapters/proft/*` — ponte + cliente REST HMAC
- `server/services/brokerExecutionService.ts` — roteamento único
- `server/services/brokerAudit.ts` — eventos assinados
- `server/routes/brokerBridgeRoutes.ts` — HTTP da ponte
- `mt5/QuantumTradeBridge.mq5`
- `profit/quantum_trade_profit_agent.py`
