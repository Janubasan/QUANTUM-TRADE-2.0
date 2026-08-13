# Guia de Criação e Integração de Novos Bots de Trading

Este documento define a arquitetura, as interfaces e o passo a passo completo para criar e integrar novos bots autônomos de trading na plataforma **Stockraft Quantum Trade**.

---

## 1. Arquitetura Geral de Bots

A plataforma opera sob um modelo **Multi-Bot Execution Engine** desacoplado:

1. **Estado do Bot (`Bot`)**: Definido no tipo `Bot` em `src/types.ts` e mantido na `store` em memória (`server/data/store.ts`).
2. **Ciclo de Execução (`BotWorker`)**: Localizado em `server/engine/botWorker.ts`, onde um loop contínuo de tick avalia os bots em execução (`status: 'running'`).
3. **Validação do Gerenciamento de Risco (`ProfitRule Engine`)**: Localizada em `server/engine/profitRule.js`, assegura a regra de risco calibrado antes de autorizar qualquer ordem.
4. **Camada de Adaptação de Corretoras (`BrokerAdapterFactory`)**: Localizada em `server/adapters/brokerAdapters.ts`, abstrai a criação de ordens para Binance, BYDFi, Alpaca, MetaTrader 5, etc.
5. **Auditoria e Logs de Sinal (`SystemLog` / `SignalExperience`)**: Registra cada evento de abertura/fechamento e alimenta a inteligência coletiva e a trilha de auditoria.

---

## 2. Estrutura do Tipo `Bot` (`src/types.ts`)

Para criar um novo bot, sua estrutura deve respeitar a interface `Bot`:

```typescript
export interface BotConfig {
  symbol: string;         // Ex: 'BTC/BRL', 'ETH/USDT', 'SOL/BRL'
  timeframe: string;      // Ex: '1m', '3m', '5m', '15m'
  riskPercent: number;    // Risco calibrado por operação (% da banca, ex: 0.5%)
  tpRatio: number;        // Multiplicador do Take Profit (Ex: 2.0 = 2x o risco)
  slRatio: number;        // Multiplicador do Stop Loss (Ex: 1.0 = 1x o risco)
}

export interface Bot {
  id: string;
  accountId: string;      // ID da conta vinculada (Demo ou Real)
  accountName: string;
  accountType: 'demo' | 'real';
  name: string;           // Nome de exibição do Bot
  strategy: string;       // Identificador único da estratégia (Ex: 'm1_pro', 'grid_quantum', 'breakout_v1')
  config: BotConfig;
  status: 'running' | 'paused' | 'stopped';
  createdAt: string;
  totalTrades: number;
  pnlTotal: number;
  winRate: number;
  lastExecutionTime?: string;
  lastLog?: string;
}
```

---

## 3. Passo a Passo para Criar e Inserir um Novo Bot

### Passo 1: Definir o Identificador e Regra de Sinal da Estratégia
No arquivo `server/engine/botWorker.ts`, cada bot é identificado por `bot.strategy`.
Para criar uma lógica personalizada de disparo de sinal para a sua estratégia (por exemplo, `grid_quantum` ou `rsi_divergence`), implemente uma função de avaliação dentro do ciclo ou crie um handler específico:

```typescript
// Exemplo de manipulador para uma nova estratégia 'rsi_divergence'
function evaluateRsiDivergence(ticker: Ticker, botConfig: BotConfig): { trigger: boolean; direction: 'LONG' | 'SHORT' } {
  // Sua lógica de indicadores (RSI, Média Móvel, Volume, etc.)
  const rsiValue = calculateRSI(ticker); // Função hipotética ou feed de dados
  if (rsiValue < 30) return { trigger: true, direction: 'LONG' };
  if (rsiValue > 70) return { trigger: true, direction: 'SHORT' };
  return { trigger: false, direction: 'LONG' };
}
```

### Passo 2: Integrar o Bot na Engine de Execução (`server/engine/botWorker.ts`)
No método `tick()` do `BotWorker`, adicione a condição da sua estratégia:

```typescript
switch (bot.strategy) {
  case 'm1_pro':
    // Lógica padrão M1 Pro Scalper (Scalping de alta frequência)
    break;
  case 'rsi_divergence':
    // Lógica da nova estratégia
    const signal = evaluateRsiDivergence(ticker, bot.config);
    if (signal.trigger) {
      // Autorização via ProfitRule Engine e Envio via BrokerAdapter
    }
    break;
  default:
    break;
}
```

### Passo 3: Registrar Opções na API de Criação (`server.ts`)
Para permitir que os usuários criem instâncias do seu novo bot via interface ou API (`POST /api/bots`), certifique-se de expor o parâmetro `strategy`:

```typescript
app.post('/api/bots', (req, res) => {
  const { accountId, name, strategy, symbol, timeframe, riskPercent, tpRatio, slRatio } = req.body;
  // Validação e registro no store
});
```

### Passo 4: Atualizar as Opções da Interface React (`src/components/BotsView.tsx`)
Adicione o novo identificador de estratégia no seletor da UI para que os usuários possam escolher o seu bot no formulário de criação:

```tsx
<select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
  <option value="m1_pro">Quantum M1 Pro Scalper (Scalp 1m)</option>
  <option value="rsi_divergence">RSI Divergence Master (Reversão)</option>
  <option value="grid_quantum">Grid Quantum Bot (Arbitragem)</option>
</select>
```

---

## 4. Diretrizes de Segurança e Boas Práticas

1. **Validação Rígida via `ProfitRule`**: Nunca execute uma ordem sem antes chamar `validateProfitRule(account, riskPercent)`.
2. **Slippage e Latência**: Para bots operando via Webhook/TradingView, utilize os validadores de staleness (&lt;5s) e slippage (&lt;0.5%).
3. **Isolamento de Erros**: Qualquer falha na comunicação com a corretora deve ser capturada no log do bot (`bot.lastLog`) sem paralisar o `BotWorker`.
4. **Registro na Inteligência Coletiva**: Ao fechar qualquer trade, publique o evento no repositório de sinais (`store.addSignal`) para enriquecer o modelo de backtest e entanglement.
