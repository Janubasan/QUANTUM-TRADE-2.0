/**
 * riskManager.ts
 * ---------------------------------------------------------------------------
 * Camada de Proteção de Risco do Comitê JARVIS (banca de $100 USD).
 *
 * Nenhuma ordem entra "a mercado" sem passar pelas salvaguardas hard-coded:
 *   - Trava de 3 perdas consecutivas (MAX_CONSECUTIVE_LOSSES = 3);
 *   - Dimensionamento sobre a banca: 2% por trade ($2.00) no modo padrão e
 *     0.5% ($0.50) no modo Scalpers (habilitado via flag 2FA);
 *   - Teto de alocação por ativo: $30.00 (permite até 3 posições simultâneas);
 *   - Piso de caixa: $5.00 de saldo disponível mínimo para novas ordens;
 *   - Disjuntor de drawdown diário: congela ordens ao atingir o limite.
 *
 * Todos os eventos relevantes são registrados na cadeia de auditoria SHA-256.
 */

import crypto from 'crypto';
import { CommitteeAuditChain } from './auditChain.js';
import { round, clamp } from './indicators.js';

export interface PaperPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  notional: number;
  tpPrice: number;
  slPrice: number;
  status: 'OPEN' | 'CLOSED';
  entryTime: string;
  closeTime?: string;
  closeReason?: 'TP' | 'SL' | 'HALT' | 'MANUAL';
  pnl: number;
  riskAmount: number;
  scoreAtEntry: number;
  confidenceAtEntry: number;
}

export interface StagedOperation {
  id: string;
  commitHash: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  notional: number;
  tpPrice: number;
  slPrice: number;
  riskAmount: number;
  scoreAtEntry: number;
  confidenceAtEntry: number;
  status: 'STAGED' | 'APPROVED' | 'REJECTED';
  reason: string;
  createdAt: string;
}

export interface RiskManagerSnapshot {
  initialBalance: number;
  currentBalance: number;
  availableCash: number;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  lockActive: boolean;
  lockReason?: string;
  scalperMode: boolean;
  riskPercent: number;
  riskPerTrade: number;
  maxAllocationPerAsset: number;
  cashFloor: number;
  dailyDrawdownLimitPct: number;
  dailyDrawdownPercent: number;
  peakBalanceToday: number;
  openPositions: PaperPosition[];
  closedToday: PaperPosition[];
  /** Mesa OpenAlice (Trading-as-Git): operações staged aguardando aprovação. */
  deskMode: boolean;
  stagedOperations: StagedOperation[];
}

export interface OpenPositionResult {
  success: boolean;
  position?: PaperPosition;
  reason: string;
}

const FEE_RATE = 0.001; // 0,1%
const SLIPPAGE_RATE = 0.0005; // 0,05%

export class RiskManager {
  private readonly audit: CommitteeAuditChain;
  public readonly initialBalance = 100;
  public balance = 100;
  public scalperMode = false;
  public deskMode = false;

  private positions: PaperPosition[] = [];
  private closedPositions: PaperPosition[] = [];
  private stagedOperations: StagedOperation[] = [];
  private consecutiveLosses = 0;
  private readonly maxConsecutiveLosses = 3;
  private lockActive = false;
  private lockReason?: string;
  private readonly maxAllocationPerAsset = 30;
  private readonly cashFloor = 5;
  private readonly dailyDrawdownLimitPct = 10;
  private peakBalanceToday = 100;
  private dayKey = '';

  constructor(audit: CommitteeAuditChain) {
    this.audit = audit;
    this.rollDayIfNeeded();
  }

  public get riskPercent(): number {
    return this.scalperMode ? 0.5 : 2.0;
  }

  private rollDayIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dayKey !== today) {
      this.dayKey = today;
      this.peakBalanceToday = this.balance;
      this.closedPositions = this.closedPositions.filter((p) => {
        const d = (p.closeTime || '').slice(0, 10);
        return d === today;
      });
      if (this.lockReason === 'drawdown') {
        this.lockActive = false;
        this.lockReason = undefined;
        this.audit.append({
          type: 'CONFIG',
          detail: 'Disjuntor de drawdown diário resetado na virada do dia.',
        });
      }
    }
  }

  private totalOpenNotional(): number {
    return this.positions
      .filter((p) => p.status === 'OPEN')
      .reduce((acc, p) => acc + p.notional, 0);
  }

  public getAvailableCash(): number {
    return round(this.balance - this.totalOpenNotional(), 2);
  }

  public getOpenPositions(): PaperPosition[] {
    return this.positions.filter((p) => p.status === 'OPEN');
  }

  public getDailyDrawdownPercent(): number {
    if (this.peakBalanceToday <= 0) return 0;
    return round(((this.peakBalanceToday - this.balance) / this.peakBalanceToday) * 100, 2);
  }

  public canOpen(symbol: string, score: number, confidence: number): { allowed: boolean; reason: string } {
    this.rollDayIfNeeded();

    if (this.lockActive) {
      return { allowed: false, reason: `Trava ativa: ${this.lockReason ?? 'bloqueio de segurança'}.` };
    }
    if (this.consecutiveLosses >= this.maxConsecutiveLosses) {
      this.triggerLock('3 perdas consecutivas em Stop-Loss');
      return { allowed: false, reason: 'Trava de 3 perdas consecutivas acionada.' };
    }
    if (this.getDailyDrawdownPercent() >= this.dailyDrawdownLimitPct) {
      this.triggerLock('drawdown');
      return { allowed: false, reason: `Disjuntor de drawdown diário (${this.getDailyDrawdownPercent()}% >= ${this.dailyDrawdownLimitPct}%).` };
    }
    const symbolNotional = this.positions
      .filter((p) => p.status === 'OPEN' && p.symbol === symbol)
      .reduce((acc, p) => acc + p.notional, 0);
    if (symbolNotional >= this.maxAllocationPerAsset) {
      return { allowed: false, reason: `Teto de alocação de $${this.maxAllocationPerAsset} atingido para ${symbol}.` };
    }
    if (this.getAvailableCash() < this.cashFloor) {
      return { allowed: false, reason: `Piso de caixa de $${this.cashFloor} insuficiente (disponível: $${this.getAvailableCash().toFixed(2)}).` };
    }
    return { allowed: true, reason: 'RiskManager: todas as salvaguardas aprovadas.' };
  }

  private triggerLock(reason: '3 perdas consecutivas em Stop-Loss' | 'drawdown'): void {
    if (this.lockActive) return;
    this.lockActive = true;
    this.lockReason = reason;
    this.audit.append({
      type: 'HALT',
      detail: `HALT: ${reason}. Novas entradas vetadas até liberação manual.`,
    });
  }

  public releaseLock(): void {
    if (!this.lockActive && this.consecutiveLosses < this.maxConsecutiveLosses) return;
    this.lockActive = false;
    this.consecutiveLosses = 0;
    this.lockReason = undefined;
    this.audit.append({ type: 'CONFIG', detail: 'Trava de risco liberada manualmente.' });
  }

  public openPosition(
    symbol: string,
    side: 'LONG' | 'SHORT',
    entryPrice: number,
    atr: number,
    score: number,
    confidence: number,
    tpRatio = 2.0
  ): OpenPositionResult {
    const gate = this.canOpen(symbol, score, confidence);
    if (!gate.allowed) {
      this.audit.append({
        type: 'RISK_VETO',
        symbol,
        direction: side,
        score: round(score, 4),
        confidence: round(confidence, 4),
        detail: `RISK_VETO: sinal dos agentes bloqueado (${gate.reason})`,
      });
      return { success: false, reason: gate.reason };
    }

    // Dimensionamento sobre a banca
    const riskAmount = round((this.balance * this.riskPercent) / 100, 2);
    const slDist = Math.max(1.2 * atr, entryPrice * 0.001);
    const tpDist = slDist * tpRatio;

    let quantity = riskAmount / slDist;
    // Teto de alocação por ativo ($30 de notional)
    const maxQtyByAllocation = this.maxAllocationPerAsset / entryPrice;
    quantity = Math.min(quantity, maxQtyByAllocation);
    if (quantity <= 0) {
      this.audit.append({
        type: 'RISK_VETO',
        symbol,
        direction: side,
        detail: 'RISK_VETO: quantidade calculada inválida (zero).',
      });
      return { success: false, reason: 'Quantidade inválida para o ativo.' };
    }

    // Execução realista: slippage + taxa
    const slippage = entryPrice * SLIPPAGE_RATE;
    const fillPrice = side === 'LONG' ? entryPrice + slippage : entryPrice - slippage;
    const notional = quantity * fillPrice;
    const fee = notional * FEE_RATE;

    const tpPrice = side === 'LONG' ? fillPrice + tpDist : fillPrice - tpDist;
    const slPrice = side === 'LONG' ? fillPrice - slDist : fillPrice + slDist;

    const position: PaperPosition = {
      id: `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      symbol,
      side,
      entryPrice: round(fillPrice, 6),
      quantity: round(quantity, 8),
      notional: round(notional, 2),
      tpPrice: round(tpPrice, 6),
      slPrice: round(slPrice, 6),
      status: 'OPEN',
      entryTime: new Date().toISOString(),
      pnl: round(-fee, 4),
      riskAmount,
      scoreAtEntry: round(score, 4),
      confidenceAtEntry: round(confidence, 4),
    };

    this.positions.push(position);
    this.audit.append({
      type: 'ORDER_FILLED',
      symbol,
      direction: side,
      score: round(score, 4),
      confidence: round(confidence, 4),
      detail: `ORDER_FILLED: ${side} ${symbol} @ ${fillPrice.toFixed(2)} (qty ${quantity.toFixed(8)}, risco $${riskAmount.toFixed(2)}, TP ${tpPrice.toFixed(2)}, SL ${slPrice.toFixed(2)}).`,
    });

    return { success: true, position, reason: 'Posição aberta com risco calibrado.' };
  }

  /**
   * MESA OPENALICE (Trading-as-Git): cria uma operação "staged" sem executar.
   * A ordem só vai ao mercado após aprovação humana (approveOperation).
   */
  public stageOperation(
    symbol: string,
    side: 'LONG' | 'SHORT',
    entryPrice: number,
    atr: number,
    score: number,
    confidence: number,
    tpRatio = 2.0
  ): StagedOperation {
    const riskAmount = round((this.balance * this.riskPercent) / 100, 2);
    const slDist = Math.max(1.2 * atr, entryPrice * 0.001);
    const tpDist = slDist * tpRatio;
    let quantity = riskAmount / slDist;
    quantity = Math.min(quantity, this.maxAllocationPerAsset / entryPrice);

    const slippage = entryPrice * SLIPPAGE_RATE;
    const fillPrice = side === 'LONG' ? entryPrice + slippage : entryPrice - slippage;
    const notional = round(quantity * fillPrice, 2);
    const tpPrice = side === 'LONG' ? fillPrice + tpDist : fillPrice - tpDist;
    const slPrice = side === 'LONG' ? fillPrice - slDist : fillPrice + slDist;
    const commitHash = crypto.createHash('sha256')
      .update(`${symbol}:${side}:${Date.now()}:${Math.random()}`)
      .digest('hex')
      .slice(0, 8);

    const op: StagedOperation = {
      id: `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      commitHash,
      symbol,
      side,
      entryPrice: round(fillPrice, 6),
      quantity: round(quantity, 8),
      notional,
      tpPrice: round(tpPrice, 6),
      slPrice: round(slPrice, 6),
      riskAmount,
      scoreAtEntry: round(score, 4),
      confidenceAtEntry: round(confidence, 4),
      status: 'STAGED',
      reason: 'Operação staged pela mesa ALICE — aguardando aprovação humana.',
      createdAt: new Date().toISOString(),
    };

    this.stagedOperations.unshift(op);
    if (this.stagedOperations.length > 50) this.stagedOperations.pop();
    this.audit.append({
      type: 'STAGED',
      symbol,
      direction: side,
      score: round(score, 4),
      confidence: round(confidence, 4),
      detail: `STAGED (commit ${commitHash}): ${side} ${symbol} @ ${fillPrice.toFixed(2)} — diff: qty ${quantity.toFixed(8)}, risco $${riskAmount.toFixed(2)}, TP ${tpPrice.toFixed(2)}, SL ${slPrice.toFixed(2)}.`,
    });
    return op;
  }

  public approveOperation(id: string): OpenPositionResult {
    const op = this.stagedOperations.find((o) => o.id === id && o.status === 'STAGED');
    if (!op) return { success: false, reason: 'Operação staged não encontrada.' };

    const gate = this.canOpen(op.symbol, op.scoreAtEntry, op.confidenceAtEntry);
    if (!gate.allowed) {
      op.status = 'REJECTED';
      op.reason = `Rejeitada pelo RiskManager: ${gate.reason}`;
      this.audit.append({ type: 'RISK_VETO', symbol: op.symbol, direction: op.side, detail: `APPROVAL VETO: ${gate.reason}` });
      return { success: false, reason: gate.reason };
    }

    op.status = 'APPROVED';
    op.reason = 'Aprovada pela mesa ALICE — executada.';

    const fee = op.notional * FEE_RATE;
    const position: PaperPosition = {
      id: `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      symbol: op.symbol,
      side: op.side,
      entryPrice: op.entryPrice,
      quantity: op.quantity,
      notional: op.notional,
      tpPrice: op.tpPrice,
      slPrice: op.slPrice,
      status: 'OPEN',
      entryTime: new Date().toISOString(),
      pnl: round(-fee, 4),
      riskAmount: op.riskAmount,
      scoreAtEntry: op.scoreAtEntry,
      confidenceAtEntry: op.confidenceAtEntry,
    };
    this.positions.push(position);
    this.audit.append({
      type: 'APPROVED',
      symbol: op.symbol,
      direction: op.side,
      detail: `APPROVED (commit ${op.commitHash}): ordem executada via mesa ALICE.`,
    });
    this.audit.append({
      type: 'ORDER_FILLED',
      symbol: op.symbol,
      direction: op.side,
      score: op.scoreAtEntry,
      confidence: op.confidenceAtEntry,
      detail: `ORDER_FILLED: ${op.side} ${op.symbol} @ ${op.entryPrice.toFixed(2)} (aprovado por ALICE).`,
    });
    return { success: true, position, reason: 'Operação aprovada e executada.' };
  }

  public rejectOperation(id: string, reason = 'Rejeitada pela mesa ALICE.'): boolean {
    const op = this.stagedOperations.find((o) => o.id === id && o.status === 'STAGED');
    if (!op) return false;
    op.status = 'REJECTED';
    op.reason = reason;
    this.audit.append({ type: 'REJECTED', symbol: op.symbol, direction: op.side, detail: `REJECTED (commit ${op.commitHash}): ${reason}` });
    return true;
  }

  public getStagedOperations(): StagedOperation[] {
    return [...this.stagedOperations];
  }

  /** Atualiza posições abertas contra o preço corrente; encerra em TP/SL. */
  public updatePositions(currentPrice: number): PaperPosition[] {
    this.rollDayIfNeeded();
    const closedNow: PaperPosition[] = [];

    for (const pos of this.positions) {
      if (pos.status !== 'OPEN') continue;

      const hitTP = pos.side === 'LONG' ? currentPrice >= pos.tpPrice : currentPrice <= pos.tpPrice;
      const hitSL = pos.side === 'LONG' ? currentPrice <= pos.slPrice : currentPrice >= pos.slPrice;

      if (!hitTP && !hitSL) {
        // Marca a mercado o PnL flutuante (sem fechar)
        const directionMult = pos.side === 'LONG' ? 1 : -1;
        pos.pnl = round(directionMult * (currentPrice - pos.entryPrice) * pos.quantity, 4);
        continue;
      }

      const exitPrice = hitTP ? pos.tpPrice : pos.slPrice;
      const directionMult = pos.side === 'LONG' ? 1 : -1;
      const gross = directionMult * (exitPrice - pos.entryPrice) * pos.quantity;
      const fee = pos.notional * FEE_RATE;
      const pnl = round(gross - fee, 4);

      pos.status = 'CLOSED';
      pos.closeTime = new Date().toISOString();
      pos.closeReason = hitTP ? 'TP' : 'SL';
      pos.pnl = pnl;
      this.closedPositions.push(pos);

      this.balance = round(this.balance + pnl, 2);
      if (this.balance > this.peakBalanceToday) this.peakBalanceToday = this.balance;

      if (pnl < 0 && pos.closeReason === 'SL') {
        this.consecutiveLosses += 1;
      } else {
        this.consecutiveLosses = 0;
      }

      this.audit.append({
        type: 'POSITION_CLOSED',
        symbol: pos.symbol,
        direction: pos.side,
        detail: `POSITION_CLOSED: ${pos.side} ${pos.symbol} via ${pos.closeReason} com PnL $${pnl.toFixed(2)} (perdas consecutivas: ${this.consecutiveLosses}).`,
      });

      if (this.consecutiveLosses >= this.maxConsecutiveLosses) {
        this.triggerLock('3 perdas consecutivas em Stop-Loss');
      }
      if (this.getDailyDrawdownPercent() >= this.dailyDrawdownLimitPct) {
        this.triggerLock('drawdown');
      }

      closedNow.push(pos);
    }

    return closedNow;
  }

  public snapshot(): RiskManagerSnapshot {
    this.rollDayIfNeeded();
    return {
      initialBalance: this.initialBalance,
      currentBalance: round(this.balance, 2),
      availableCash: this.getAvailableCash(),
      consecutiveLosses: this.consecutiveLosses,
      maxConsecutiveLosses: this.maxConsecutiveLosses,
      lockActive: this.lockActive,
      lockReason: this.lockReason,
      scalperMode: this.scalperMode,
      riskPercent: this.riskPercent,
      riskPerTrade: round((this.balance * this.riskPercent) / 100, 2),
      maxAllocationPerAsset: this.maxAllocationPerAsset,
      cashFloor: this.cashFloor,
      dailyDrawdownLimitPct: this.dailyDrawdownLimitPct,
      dailyDrawdownPercent: this.getDailyDrawdownPercent(),
      peakBalanceToday: round(this.peakBalanceToday, 2),
      openPositions: this.getOpenPositions(),
      closedToday: this.closedPositions.slice(-20),
      deskMode: this.deskMode,
      stagedOperations: this.stagedOperations.filter((o) => o.status === 'STAGED'),
    };
  }
}
