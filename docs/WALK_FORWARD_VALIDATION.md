# WFA Validation Gate

O JANUTRADE agora separa pesquisa e execução em três gates auditáveis:

```text
provider OHLCV real
      ↓
backtest determinístico + walk-forward (8 janelas OOS)
      ↓
tournament / robustez / cross-asset
      ↓
Promotion Gate → Alpaca PAPER (nunca LIVE)
```

## O que foi implementado

- `POST /api/validation/run` carrega candles reais do Alpaca Market Data quando as credenciais estão disponíveis e usa Yahoo Finance como fallback.
- O pipeline não cria candles sintéticos. Se o provider falhar ou houver menos de 240 candles, o resultado é `NO_DATA`/`INVALID_BACKTEST`.
- A execução de uma ordem simulada usa a abertura da vela seguinte ao candle que produziu o sinal. Indicadores nunca recebem a vela de execução; isso é o controle de look-ahead.
- Os custos são explícitos: taxa em basis points, slippage em basis points e position sizing. Os valores aparecem no JSON e no relatório.
- O engine constrói oito janelas temporais em modo expanding: `TRAIN | VALIDATION | TEST`. O score de seleção usa TRAIN/VALIDATION; nenhuma janela de teste é usada para escolher parâmetros. O TEST apenas mede generalização e decide os gates de robustez.
- O tournament testa trend following, mean reversion e breakout; registra candidatas rejeitadas, amostra OOS, profit factor, Sharpe, drawdown, estabilidade, bootstrap Monte Carlo com múltiplas seeds determinísticas e validação cross-asset.
- Um retorno positivo não é suficiente. Se não houver uma estratégia robusta, a saída correta é `NO_VIABLE_STRATEGY`.
- O gate de promoção consulta a API real da Alpaca PAPER. Sem `ALPACA_API_KEY` e `ALPACA_SECRET_KEY`, compatibilidade de capital fica `NOT_VERIFIED` e a decisão é `REJECTED`.
- Só um gate `APPROVED` escreve `server/data/validated_strategy.json`. O arquivo é ignorado pelo Git e o runner Python recusa iniciar sem ele.
- Mesmo com manifest aprovado, o heartbeat Node permanece opt-in (`ENABLE_PAPER_RUNNER=false` por padrão) e o worker legado fica desligado (`ENABLE_LEGACY_BOT_WORKER=false`). Assim, o servidor web não acorda uma execução simulada por acidente.

## Uso pela API

```bash
curl -X POST http://localhost:3000/api/validation/run \
  -H 'content-type: application/json' \
  -d '{
    "asset": "SPY",
    "validation_assets": ["QQQ", "IWM"],
    "timeframe": "1d",
    "lookback_days": 1095,
    "initial_capital": 100,
    "position_pct": 0.02,
    "fee_rate_bps": 0,
    "slippage_bps": 1
  }'
```

A resposta inclui `backtest`, `tournament` e `promotion` em JSON. Os principais endpoints são:

- `GET /api/validation/last` — último relatório da sessão;
- `GET /api/validation/manifest` — informa se existe um deployment validado;
- `GET /api/validation/last.csv` — exporta o ranking de candidatas em CSV;
- `POST /api/validation/operations/validate` — valida um lote de operações antes de qualquer envio.
- `GET /api/validation/operations/last` — recupera o último lote auditado.
- `POST /api/validation/promote` — reexecuta o checklist sobre o último tournament; não ignora nenhuma falha.

A tela **WFA Validation Gate** no menu Backtest executa o mesmo fluxo sem esconder falhas de dados.

## Critérios do Promotion Gate

Todos precisam passar:

- eficiência OOS ≥ 0,5;
- Sharpe OOS ≥ 0,8;
- drawdown OOS ≤ 25%;
- pior percentil 97,5% do drawdown Monte Carlo ≤ 35%;
- parâmetros estáveis;
- ao menos 30 trades OOS;
- cross-asset `PASSED` ou `NOT_TESTED` com justificativa explícita;
- custos abaixo de 40% do lucro bruto;
- ativo, lote, fractional shares e conta de USD 100 verificados na Alpaca PAPER.

O deployment aprovado fixa `mode: PAPER`, `max_position_pct: 2`, no máximo 5 posições simultâneas, exposição bruta de 10%, risco por operação de 1%, limite de perda diária de 5%, kill switch de drawdown de 15% e reavaliação a cada 14 dias. Nenhum código do pipeline altera `PAPER` para `LIVE`.

## Lote de operações

`POST /api/validation/operations/validate` recebe várias operações e valida, em ordem:

- direção, entrada, stop e alvo;
- notional máximo de USD 2 por posição;
- risco máximo de USD 1 por stop;
- até 5 posições e USD 10 de exposição agregada;
- IDs e ativos duplicados;
- divergência máxima de 2% entre entrada e cotação informada.

O resultado é `VALID_BATCH`, `PARTIAL_BATCH` ou `REJECTED_BATCH`, com motivo e checks de cada operação. Validar o lote não envia ordens à corretora.

## Limitações honestas

Yahoo Finance tem limites próprios para timeframes intraday. Para 8 janelas e uma amostra OOS útil, prefira `1d` com histórico longo ou configure Alpaca Market Data. A ausência de credenciais, candles ou fractional shares é uma condição de rejeição — não é preenchida por números inventados.
