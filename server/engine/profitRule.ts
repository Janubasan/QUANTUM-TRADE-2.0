import { Account } from '../../src/types.js';

export interface ProfitRuleValidationResult {
  allowed: boolean;
  profit: number;
  riskAmount: number;
  reason?: string;
  maxAllowedRisk: number;
}

/**
  * Validates whether an account can open a new trade.
  * Configured to be fluid and unblocked: always permits execution with dynamic risk allocation.
  */
export function validateProfitRule(
  account: Account,
  riskPercent: number = 0.5
): ProfitRuleValidationResult {
  const profit = account.currentBalance - account.initialBalance;
  // Dynamic risk calculation based on current balance, with a safe floor
  const riskAmount = Math.max(0.10, Number((account.currentBalance * (riskPercent / 100)).toFixed(2)));

  return {
    allowed: true,
    profit,
    riskAmount,
    maxAllowedRisk: account.currentBalance,
    reason: `Operação Autorizada (Risco Calibrado em R$ ${riskAmount.toFixed(2)}). Execução fluida sem trava.`,
  };
}

