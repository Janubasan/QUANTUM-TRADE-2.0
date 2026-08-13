import { store } from '../data/store.js';

export class RealisticExecutionService {
  private dailyProfitLimitPct = 0.05; // Máximo 5% de lucro sobre o capital por dia
  private maxOrdersPerHour = 30; // Limite saudável de ordens por hora
  private orderCounts: Map<string, { count: number; resetTime: number }> = new Map();

  public resetCounts() {
    this.orderCounts.clear();
  }

  /**
   * Aplica slippage fixo (0.05%) e taxa de corretagem (0.1% maker/taker) ao valor nocional da ordem
   */
  public applySlippageAndFee(
    price: number,
    side: 'BUY' | 'SELL' | 'LONG' | 'SHORT',
    quantity: number = 0.001
  ): { price: number; fee: number; slippageAmount: number } {
    const slippagePct = 0.0005; // 0.05%
    const feeRate = 0.001; // 0.1%

    const isBuying = side === 'BUY' || side === 'LONG';
    const executedPrice = isBuying ? price * (1 + slippagePct) : price * (1 - slippagePct);
    const slippageAmount = Math.abs(executedPrice - price);
    
    // A taxa de corretagem (0.1%) é calculada sobre o valor total operado (quantidade * preço)
    const notionalValue = executedPrice * (Math.abs(quantity) || 0.001);
    const fee = Number(Math.max(0.01, notionalValue * feeRate).toFixed(4));

    return {
      price: Number(executedPrice.toFixed(2)),
      fee,
      slippageAmount: Number(slippageAmount.toFixed(4)),
    };
  }

  /**
   * Verifica se o lucro acumulado no dia excedeu o limite máximo (5% do capital)
   */
  public checkDailyProfit(
    accountId: string,
    currentCapital: number
  ): { allowed: boolean; totalPnlToday: number; maxProfit: number; remainingAllowed: number } {
    const todayStr = new Date().toISOString().split('T')[0];
    const trades = store.getState().trades.filter((t) => {
      const tradeAccountId = t.accountId || 'acc-demo-1';
      const closedAt = t.closeTime || t.exitTime || '';
      return (
        tradeAccountId === accountId &&
        t.status === 'closed' &&
        closedAt.startsWith(todayStr)
      );
    });

    const totalPnlToday = trades.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const maxProfit = currentCapital * this.dailyProfitLimitPct;
    const remainingAllowed = maxProfit - totalPnlToday;

    return {
      allowed: remainingAllowed > 0,
      totalPnlToday: Number(totalPnlToday.toFixed(2)),
      maxProfit: Number(maxProfit.toFixed(2)),
      remainingAllowed: Number(remainingAllowed.toFixed(2)),
    };
  }

  /**
   * Controla a frequência de ordens (máximo de 10 a 30 por hora para conformidade com corretoras)
   */
  public checkOrderFrequency(accountId: string, exchange: string): { allowed: boolean; currentCount: number; maxOrders: number } {
    const oneHourAgo = Date.now() - 3600000;
    const tradesLastHour = store.getState().trades.filter(
      (t) => (t.accountId === accountId || !t.accountId) && new Date(t.entryTime).getTime() >= oneHourAgo
    );
    const count = tradesLastHour.length;

    return {
      allowed: count < this.maxOrdersPerHour,
      currentCount: count,
      maxOrders: this.maxOrdersPerHour,
    };
  }

  public recordOrder(accountId: string, exchange: string) {
    const key = `${accountId}:${exchange}`;
    const now = Date.now();
    const entry = this.orderCounts.get(key);
    if (!entry || now > entry.resetTime) {
      this.orderCounts.set(key, { count: 1, resetTime: now + 3600000 });
    } else {
      entry.count++;
    }
  }

  public getSettings() {
    return {
      dailyProfitLimitPct: this.dailyProfitLimitPct * 100,
      maxOrdersPerHour: this.maxOrdersPerHour,
      slippagePct: 0.05,
      feeRatePct: 0.1,
    };
  }
}

export const realisticExecutionService = new RealisticExecutionService();
