// Gestão de risco — position sizing, travas diárias e kill-switch.
export interface RiskState {
  equity: number;
  dayStartEquity: number;
  day: string;
  maxDailyLossPct: number;
  maxPositions: number;
  openPositions: number;
  killed: boolean;
  killReason?: string;
}

export function newRiskState(equity: number, maxDailyLossPct = 3, maxPositions = 4): RiskState {
  const day = new Date().toISOString().slice(0, 10);
  return { equity, dayStartEquity: equity, day, maxDailyLossPct, maxPositions, openPositions: 0, killed: false };
}

/** Quantidade = risco($) / distância do stop. */
export function positionSize(equity: number, riskPercent: number, entry: number, stop: number): number {
  const riskMoney = equity * (riskPercent / 100);
  const dist = Math.abs(entry - stop);
  if (!dist || !isFinite(dist)) return 0;
  return riskMoney / dist;
}

export function rollDayIfNeeded(s: RiskState, equity: number): RiskState {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== s.day) return { ...s, day, dayStartEquity: equity, equity };
  return { ...s, equity };
}

export function canOpen(s: RiskState): { allowed: boolean; reason: string } {
  if (s.killed) return { allowed: false, reason: `KILL-SWITCH: ${s.killReason}` };
  if (s.openPositions >= s.maxPositions) return { allowed: false, reason: `limite de ${s.maxPositions} posições abertas` };
  const dd = ((s.dayStartEquity - s.equity) / s.dayStartEquity) * 100;
  if (dd >= s.maxDailyLossPct) return { allowed: false, reason: `trava diária: DD ${dd.toFixed(2)}% ≥ ${s.maxDailyLossPct}%` };
  return { allowed: true, reason: 'risco OK' };
}

export function killSwitch(s: RiskState, reason: string): RiskState {
  return { ...s, killed: true, killReason: reason };
}
