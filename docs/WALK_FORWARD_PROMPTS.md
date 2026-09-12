# Prompts operacionais do pipeline

Os três prompts de operação são implementados como responsabilidades separadas no código:

1. **Backtest Engine** — `server/validation/walkForwardEngine.ts`: só consome OHLCV real, calcula indicadores determinísticos e produz métricas com TRAIN/VALIDATION/TEST e oito janelas walk-forward.
2. **Strategy Tournament** — `candidateGrid` + `runTournament`: compara famílias e parâmetros, filtra amostras frágeis, executa Monte Carlo reprodutível, sensibilidade e cross-asset. Não força uma campeã.
3. **Promotion Gate / SRE** — `validationPipelineService.ts` + `paper_risk_engine.py`: consulta Alpaca PAPER, grava um manifesto somente após todos os gates e bloqueia a execução sem `APPROVED`.

## Contrato que não pode ser quebrado

- O motor nunca deve receber preços futuros como input de uma decisão. Sinais usam o candle fechado em `i - 1`; fills usam a abertura de `i`.
- `Math.random` não participa do backtest nem do Monte Carlo. O bootstrap usa seeds explícitas e um LCG determinístico; seeds e hash devem continuar auditáveis.
- Dado ausente é `NO_DATA`, não um candle inventado.
- `NO_VIABLE_STRATEGY` é uma saída válida.
- O manifest sempre informa `mode: PAPER` e o runner recusa LIVE por design.
