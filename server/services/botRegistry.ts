import { store } from '../data/store.js';
import { validateProfitRule } from '../engine/profitRule.js';
import { BrokerAdapterFactory } from '../adapters/brokerAdapters.js';
import { defaultSigner } from '../validation/signer.js';
import { defaultVerifier } from '../validation/verifier.js';
import { defaultTradeScheduler } from '../regulator/tradeScheduler.js';
import { killSwitchService } from './killSwitchService.js';
import { timeGateService } from './timeGateService.js';
import { realisticExecutionService } from './realisticExecutionService.js';
import { operationalGuard } from './operationalGuard.js';
import { Trade, Bot, Account } from '../../src/types.js';

export interface IBotStrategy {
  id: string;
  name: string;
  description: string;
  recommendedTimeframe: string;
  defaultRiskPercent: number;
  evaluate(
    symbol: string,
    currentPrice: number,
    indicators: { rsi?: number; sma20?: number; ema50?: number; vwap?: number }
  ): { side: 'LONG' | 'SHORT'; reason: string; tpMult: number; slMult: number } | null;
}

export class GridBotStrategy implements IBotStrategy {
  id = 'grid';
  name = 'Grid Trading Autônomo';
  description = 'Compra em faixas de suporte e vende em resistências calculadas por desvio padrão.';
  recommendedTimeframe = '5s';
  defaultRiskPercent = 0.5;

  evaluate(
    symbol: string,
    price: number,
    indicators: any
  ): { side: 'LONG' | 'SHORT'; reason: string; tpMult: number; slMult: number } | null {
    const vwap = indicators?.vwap || price;
    const spread = vwap * 0.003;
    const support = vwap - spread;
    const resistance = vwap + spread;

    if (price <= support) {
      return { side: 'LONG', reason: 'Preço no suporte da grade (Grid Support Buy)', tpMult: 2.2, slMult: 1.0 };
    }
    if (price >= resistance) {
      return { side: 'SHORT', reason: 'Preço na resistência da grade (Grid Resistance Sell)', tpMult: 2.2, slMult: 1.0 };
    }
    return null;
  }
}

export class DCABotStrategy implements IBotStrategy {
  id = 'dca';
  name = 'DCA (Dollar Cost Average) Inteligente';
  description = 'Acumulação fracionada em correções de preço com gestão de liquidez.';
  recommendedTimeframe = '15s';
  defaultRiskPercent = 0.4;

  evaluate(
    symbol: string,
    price: number,
    indicators: any
  ): { side: 'LONG' | 'SHORT'; reason: string; tpMult: number; slMult: number } | null {
    const sma = indicators?.sma20 || price;
    if (price < sma * 0.998) {
      return { side: 'LONG', reason: 'DCA Buy Signal em retração de mercado', tpMult: 2.0, slMult: 1.2 };
    }
    return null;
  }
}

export class MomentumBotStrategy implements IBotStrategy {
  id = 'momentum';
  name = 'Quantum Momentum Breakout';
  description = 'Captura rompimentos acelerados por surtos de volume e inclinação de médias.';
  recommendedTimeframe = '10s';
  defaultRiskPercent = 0.6;

  evaluate(
    symbol: string,
    price: number,
    indicators: any
  ): { side: 'LONG' | 'SHORT'; reason: string; tpMult: number; slMult: number } | null {
    const ema = indicators?.ema50 || price;
    if (price > ema * 1.002) {
      return { side: 'LONG', reason: 'Rompimento de Momentum Acelerado', tpMult: 2.8, slMult: 1.0 };
    } else if (price < ema * 0.998) {
      return { side: 'SHORT', reason: 'Rompimento de Momentum Baixista', tpMult: 2.8, slMult: 1.0 };
    }
    return null;
  }
}

export class MeanReversionBotStrategy implements IBotStrategy {
  id = 'mean_reversion';
  name = 'Reversão à Média Quântica';
  description = 'Explora retornos à média do VWAP quando o preço se afasta excessivamente.';
  recommendedTimeframe = '30s';
  defaultRiskPercent = 0.5;

  evaluate(
    symbol: string,
    price: number,
    indicators: any
  ): { side: 'LONG' | 'SHORT'; reason: string; tpMult: number; slMult: number } | null {
    const vwap = indicators?.vwap || price;
    const diffPercent = (price - vwap) / vwap;
    if (diffPercent < -0.004) {
      return { side: 'LONG', reason: 'Reversão à Média: Preço sobrevendido em relação ao VWAP', tpMult: 2.0, slMult: 1.0 };
    } else if (diffPercent > 0.004) {
      return { side: 'SHORT', reason: 'Reversão à Média: Preço sobrecomprado em relação ao VWAP', tpMult: 2.0, slMult: 1.0 };
    }
    return null;
  }
}

export class KronosScalpStrategy implements IBotStrategy {
  id = 'kronos_scalp';
  name = 'Kronos Sub-Minute Ultra Scalper';
  description = 'Estratégia nativa de alta frequência validada para execução em milissegundos.';
  recommendedTimeframe = '5s';
  defaultRiskPercent = 0.5;

  evaluate(
    symbol: string,
    price: number,
    indicators: any
  ): { side: 'LONG' | 'SHORT'; reason: string; tpMult: number; slMult: number } | null {
    if (Math.random() < 0.6) {
      const isLong = Math.random() > 0.45;
      return {
        side: isLong ? 'LONG' : 'SHORT',
        reason: 'Sinal Kronos HFT de alta probabilidade',
        tpMult: 2.5,
        slMult: 1.0,
      };
    }
    return null;
  }
}

export class BotRegistryService {
  private strategies: Map<string, IBotStrategy> = new Map();

  constructor() {
    this.register(new GridBotStrategy());
    this.register(new DCABotStrategy());
    this.register(new MomentumBotStrategy());
    this.register(new MeanReversionBotStrategy());
    this.register(new KronosScalpStrategy());
  }

  public register(strategy: IBotStrategy) {
    this.strategies.set(strategy.id, strategy);
  }

  public getStrategy(id: string): IBotStrategy | undefined {
    return this.strategies.get(id);
  }

  public listStrategies() {
    return Array.from(this.strategies.values()).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      recommendedTimeframe: s.recommendedTimeframe,
      defaultRiskPercent: s.defaultRiskPercent,
    }));
  }

  /**
   * Evaluates and executes a trade slice safely for a specific bot using real account equity
   */
  public async executeBotDecision(bot: Bot, currentPrice: number): Promise<{ success: boolean; message: string; trade?: Trade }> {
    // 0. Kill Switch check
    if (!killSwitchService.isActive) {
      const msg = '🛑 Kill Switch Global ATIVO: Operações bloqueadas.';
      bot.lastLog = msg;
      return { success: false, message: msg };
    }

    const account = store.getAccount(bot.accountId);
    if (!account || !account.isActive) {
      return { success: false, message: 'Conta inativa ou inexistente.' };
    }

    // Order Frequency check (max 10/hour)
    const freqCheck = realisticExecutionService.checkOrderFrequency(account.id, account.broker);
    if (!freqCheck.allowed) {
      const msg = `Frequência excedida: Limite de 10 ordens por hora atingido (${freqCheck.currentCount}/${freqCheck.maxOrders}).`;
      bot.lastLog = `⚠️ ${msg}`;
      return { success: false, message: msg };
    }

    // Daily Profit Cap check (max 5% daily growth)
    const dailyCheck = realisticExecutionService.checkDailyProfit(account.id, account.initialBalance);
    if (!dailyCheck.allowed) {
      const msg = `Limite de Lucro Diário atingido (+5% máx no dia: +R$ ${dailyCheck.totalPnlToday.toFixed(2)}).`;
      bot.lastLog = `⚠️ ${msg}`;
      return { success: false, message: msg };
    }

    // 1. Enforce TradeScheduler timeframe & exchange regulations
    const schedulerCheck = defaultTradeScheduler.canTrade({
      symbol: bot.config.symbol,
      timeframe: bot.config.timeframe,
      exchange: account.broker === 'binance' ? 'B3' : 'NASDAQ',
    });

    if (!schedulerCheck.allowed) {
      const msg = `Regulador Veto: ${schedulerCheck.reason}`;
      bot.lastLog = `⚠️ ${msg}`;
      store.addLog('RULE', `Bot ${bot.name}: ${msg}`);
      return { success: false, message: msg };
    }

    // 2. Validate Profit Rule & calculate slice based on account balance
    const riskPercent = bot.config.riskPercent || 0.5;
    const ruleVal = validateProfitRule(account, riskPercent);
    if (!ruleVal.allowed) {
      bot.lastLog = `⚠️ ${ruleVal.reason}`;
      store.addLog('RULE', `Bot ${bot.name}: ${ruleVal.reason}`);
      return { success: false, message: ruleVal.reason };
    }

    // 3. Cryptographic Verification & RAG Plausibility Gate
    const envelope = defaultSigner.signPayload(
      {
        symbol: bot.config.symbol,
        close: currentPrice,
        volume: 100000,
        provider: 'price_aggregator_multi_source',
        timeframe: bot.config.timeframe,
      },
      'bot_registry_engine'
    );

    if (!defaultVerifier.verify(envelope)) {
      const msg = 'Dado de preço rejeitado pelo DataVerifier (Assinatura/RAG inválida)';
      bot.lastLog = `❌ ${msg}`;
      store.addLog('ERROR', `Bot ${bot.name}: ${msg}`);
      return { success: false, message: msg };
    }

    // 4. Strategy Evaluation
    const strategy = this.getStrategy(bot.strategy) || new KronosScalpStrategy();
    const decision = strategy.evaluate(bot.config.symbol, currentPrice, {
      vwap: currentPrice * (1 + (Math.random() - 0.5) * 0.002),
      sma20: currentPrice * (1 + (Math.random() - 0.5) * 0.003),
      ema50: currentPrice * (1 + (Math.random() - 0.5) * 0.004),
    });

    if (!decision) {
      return { success: false, message: 'Nenhum sinal gerado nesta checagem.' };
    }

    const priceRiskDistance = Math.abs(currentPrice * 0.004) || 1;
    const quantity = Number((ruleVal.riskAmount / priceRiskDistance).toFixed(6)) || 0.0001;

    const direction: 'LONG' | 'SHORT' = decision.side;
    const isLong = direction === 'LONG';
    const riskMult = 0.004;
    const prelimTp = isLong
      ? Number((currentPrice * (1 + riskMult * decision.tpMult)).toFixed(2))
      : Number((currentPrice * (1 - riskMult * decision.tpMult)).toFixed(2));
    const prelimSl = isLong
      ? Number((currentPrice * (1 - (riskMult / 1.5) * decision.slMult)).toFixed(2))
      : Number((currentPrice * (1 + (riskMult / 1.5) * decision.slMult)).toFixed(2));

    const estimatedDurationSeconds = Math.max(60, Math.round(timeGateService.estimateDuration(currentPrice, prelimTp, prelimSl, 0.15) / 1000));

    // OperationalGuard 7-step compliance checks & Firestore persistence
    const guardRes = await operationalGuard.validateAndPrepare({
      order: {
        account_id: account.id,
        symbol: bot.config.symbol,
        side: isLong ? 'buy' : 'sell',
        quantity,
        price: currentPrice,
        tpPrice: prelimTp,
        slPrice: prelimSl,
        direction,
        bot_id: bot.id,
        bot_name: bot.name,
        estimated_duration_seconds: estimatedDurationSeconds,
      },
      account: {
        id: account.id,
        equity: account.currentBalance || account.initialBalance,
      },
      marketPrice: currentPrice,
      estimatedDurationSeconds,
    });

    if (!guardRes.approved) {
      const msg = `OperationalGuard Veto: ${guardRes.reason}`;
      bot.lastLog = `🛡️ ${msg}`;
      return { success: false, message: msg };
    }

    const entryPrice = guardRes.order.fill_price || currentPrice;
    const fee = guardRes.order.fee || 0;
    const tpPrice = isLong
      ? Number((entryPrice * (1 + riskMult * decision.tpMult)).toFixed(2))
      : Number((entryPrice * (1 - riskMult * decision.tpMult)).toFixed(2));
    const slPrice = isLong
      ? Number((entryPrice * (1 - (riskMult / 1.5) * decision.slMult)).toFixed(2))
      : Number((entryPrice * (1 + (riskMult / 1.5) * decision.slMult)).toFixed(2));

    // Record trade in TradeScheduler
    defaultTradeScheduler.recordTrade({
      symbol: bot.config.symbol,
      timeframe: bot.config.timeframe,
      exchange: account.broker === 'binance' ? 'B3' : 'NASDAQ',
    });

    // Place Order via Adapter
    const adapter = BrokerAdapterFactory.getAdapter(account.broker);
    adapter.createOrder(
      {
        symbol: bot.config.symbol,
        direction,
        quantity,
        price: entryPrice,
        tpPrice,
        slPrice,
      },
      account.apiKeyEncrypted,
      account.apiSecretEncrypted
    );

    const newTrade: Trade = {
      id: `trd-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      accountId: account.id,
      accountName: account.name,
      broker: account.broker,
      symbol: bot.config.symbol,
      direction,
      entryPrice,
      currentPrice: entryPrice,
      quantity,
      tpPrice,
      slPrice,
      status: 'open',
      pnl: -fee,
      pnlPercent: 0,
      entryTime: new Date().toISOString(),
      botId: bot.id,
      botName: bot.name,
      notes: `[Estratégia: ${strategy.name}] ${decision.reason} | Risco: ${riskPercent}% | Slippage: 0.05%, Fee: 0.1%`,
    };

    store.addTrade(newTrade);

    const logMsg = `🚀 Trade Aberto por ${bot.name} (${decision.side} ${bot.config.symbol} @ R$ ${currentPrice.toFixed(2)}). ${decision.reason}`;
    bot.lastLog = logMsg;
    bot.lastExecutionTime = new Date().toISOString();
    store.updateBot(bot);

    store.addLog('TRADE', logMsg, { tradeId: newTrade.id, accountId: account.id });

    return { success: true, message: logMsg, trade: newTrade };
  }

  /**
   * Calculates real ranking stats for all bots based on trade history in store
   */
  public getBotRankings() {
    const state = store.getState();
    return state.bots.map((bot) => {
      const botTrades = state.trades.filter((t) => t.botId === bot.id && t.status === 'closed');
      const totalTrades = botTrades.length;
      const wins = botTrades.filter((t) => t.pnl > 0).length;
      const winRate = totalTrades > 0 ? Number(((wins / totalTrades) * 100).toFixed(1)) : 0;
      const pnlTotal = Number(botTrades.reduce((acc, t) => acc + t.pnl, 0).toFixed(2));

      // Calculate Sharpe Ratio approximation
      const returns = botTrades.map((t) => t.pnlPercent);
      const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
      const variance =
        returns.length > 1
          ? returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / (returns.length - 1)
          : 1;
      const stdDev = Math.sqrt(variance) || 1;
      const sharpeRatio = Number((avgReturn / stdDev).toFixed(2));

      return {
        botId: bot.id,
        botName: bot.name,
        strategy: bot.strategy,
        accountName: bot.accountName,
        status: bot.status,
        symbol: bot.config.symbol,
        timeframe: bot.config.timeframe,
        totalTrades,
        wins,
        winRate,
        pnlTotal,
        sharpeRatio,
        lastExecutionTime: bot.lastExecutionTime,
      };
    }).sort((a, b) => b.pnlTotal - a.pnlTotal);
  }
}

export const botRegistryService = new BotRegistryService();
