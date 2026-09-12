"""Deterministic Lumibot signal strategy used only after WFA promotion.

The strategy calculates indicators from closed bars and delegates every order to
an explicit risk gate. It does not invent prices or turn a failed validation
into a live signal.
"""
import pandas as pd
from lumibot.strategies import Strategy

try:
    from indicators import composite_signal
    from paper_risk_engine import risk_engine
except ImportError:
    from .indicators import composite_signal
    from .paper_risk_engine import risk_engine


class SignalStrategy(Strategy):
    parameters = {
        "symbols": ["SPY"],
        "cash_at_risk_per_trade": 0.02,
        "lookback_bars": 60,
    }

    def initialize(self):
        self.sleeptime = "1D"
        self.symbols = self.parameters["symbols"]
        self.cash_at_risk = min(float(self.parameters["cash_at_risk_per_trade"]), risk_engine.MAX_POSITION_PCT)
        self.lookback = int(self.parameters["lookback_bars"])
        self.equity_peak = float(self.get_cash() or 0)
        self.session_start_equity = self.equity_peak

    def _equity(self) -> float:
        try:
            return float(self.get_portfolio_value())
        except (AttributeError, TypeError, ValueError):
            return float(self.get_cash() or 0)

    def _submit_checked(self, order, price: float, quantity: float) -> bool:
        equity = self._equity()
        self.equity_peak = max(self.equity_peak, equity)
        decision = risk_engine.check_order(equity, abs(float(quantity) * float(price)))
        if not decision.approved:
            self.log_message(f"RISK BLOCK: {decision.reason}")
            return False
        if not risk_engine.daily_loss_allows_order(equity, self.session_start_equity):
            self.log_message("RISK BLOCK: limite de perda diária de 5% atingido")
            return False
        if not risk_engine.drawdown_allows_order(equity, self.equity_peak):
            self.log_message("RISK BLOCK: kill switch de drawdown de 15% atingido")
            return False
        self.submit_order(order)
        return True

    def on_trading_iteration(self):
        cash = float(self.get_cash() or 0)

        for symbol in self.symbols:
            bars = self.get_historical_prices(symbol, self.lookback, "day")
            if bars is None or bars.df is None or len(bars.df) < 25:
                continue

            # Only closed historical bars are passed to the indicator function.
            df = pd.DataFrame({"close": bars.df["close"]})
            sig = composite_signal(df)
            position = self.get_position(symbol)
            last_price = self.get_last_price(symbol)
            if last_price is None or float(last_price) <= 0:
                continue

            if sig["direction"] == "buy" and position is None:
                qty = self._size_position(cash, float(last_price))
                if qty > 0:
                    order = self.create_order(symbol, qty, "buy")
                    if self._submit_checked(order, float(last_price), qty):
                        self.log_message(f"[{symbol}] COMPRA {qty:.6f} @ ~{last_price:.2f} (score {sig['score']})")

            elif sig["direction"] == "sell" and position is not None:
                qty = float(position.quantity)
                order = self.create_order(symbol, qty, "sell")
                if self._submit_checked(order, float(last_price), qty):
                    self.log_message(f"[{symbol}] VENDA {qty:.6f} @ ~{last_price:.2f} (score {sig['score']})")

    def _size_position(self, cash: float, price: float) -> float:
        budget = cash * self.cash_at_risk
        if price <= 0:
            return 0.0
        # Fractional quantity is checked against Alpaca metadata by the gate.
        return round(budget / price, 6)
