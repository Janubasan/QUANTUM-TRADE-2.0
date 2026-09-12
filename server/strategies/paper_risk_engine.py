"""Hard risk gates shared by the optional Alpaca Paper runner.

This module intentionally contains no market-data or order-generation logic. It
only approves a proposed notional after checking the account snapshot. The
runner stays PAPER-only and the validation manifest is checked before importing
this module's strategy.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class RiskDecision:
    approved: bool
    reason: str
    max_notional_usd: float


class PaperRiskEngine:
    MIN_EQUITY_USD = 80.0
    MAX_POSITION_PCT = 0.02
    DAILY_LOSS_LIMIT_PCT = 0.05
    KILL_SWITCH_DRAWDOWN_PCT = 0.15

    def check_order(self, current_equity: float, proposed_notional: float) -> RiskDecision:
        equity = float(current_equity)
        notional = float(proposed_notional)
        if equity < self.MIN_EQUITY_USD:
            return RiskDecision(False, "KILL_SWITCH: equity abaixo de USD 80.00", 0.0)
        if equity <= 0 or notional <= 0:
            return RiskDecision(False, "Ordem sem equity/notional positivo", 0.0)
        maximum = equity * self.MAX_POSITION_PCT
        if notional > maximum:
            return RiskDecision(
                False,
                f"Position sizing excede {self.MAX_POSITION_PCT:.2%} da equity",
                maximum,
            )
        return RiskDecision(True, "OK", maximum)

    def daily_loss_allows_order(self, current_equity: float, session_start_equity: float) -> bool:
        if session_start_equity <= 0:
            return False
        loss = (session_start_equity - current_equity) / session_start_equity
        return loss < self.DAILY_LOSS_LIMIT_PCT

    def drawdown_allows_order(self, current_equity: float, equity_peak: float) -> bool:
        if equity_peak <= 0:
            return False
        drawdown = (equity_peak - current_equity) / equity_peak
        return drawdown < self.KILL_SWITCH_DRAWDOWN_PCT


risk_engine = PaperRiskEngine()
