"""
Estratégia real rodando dentro do motor do Lumibot (open source, MIT,
github.com/Lumiwealth/lumibot). Reaproveita o MESMO composite_signal()
de indicators.py já validado no resto do projeto — não é uma lógica
paralela, é a mesma decisão de RSI/MACD/Bollinger.

Este arquivo funciona com qualquer broker que o Lumibot suporte
(Alpaca, ccxt, Interactive Brokers, Tradier, Tradovate, Schwab...).
A escolha do broker acontece em run_backtest.py (offline) ou
run_live_alpaca.py (live, com API gratuita da Alpaca) — este arquivo
não sabe nem precisa saber qual broker está por trás.
"""
import pandas as pd
from lumibot.strategies import Strategy

try:
    from indicators import composite_signal
except ImportError:
    from .indicators import composite_signal


class SignalStrategy(Strategy):
    parameters = {
        "symbols": ["SPY", "QQQ"],  # ajuste para os ativos que seu broker suporta
        "cash_at_risk_per_trade": 0.10,  # 10% do caixa disponível por operação
        "lookback_bars": 60,
    }

    def initialize(self):
        self.sleeptime = "1D"  # frequência de decisão — 1 barra diária por padrão
        self.symbols = self.parameters["symbols"]
        self.cash_at_risk = self.parameters["cash_at_risk_per_trade"]
        self.lookback = self.parameters["lookback_bars"]

    def on_trading_iteration(self):
        cash = self.get_cash()

        for symbol in self.symbols:
            bars = self.get_historical_prices(symbol, self.lookback, "day")
            if bars is None or bars.df is None or len(bars.df) < 25:
                continue

            df = pd.DataFrame({"close": bars.df["close"]})
            sig = composite_signal(df)

            position = self.get_position(symbol)
            last_price = self.get_last_price(symbol)
            if last_price is None:
                continue

            if sig["direction"] == "buy" and position is None:
                qty = self._size_position(cash, last_price)
                if qty > 0:
                    order = self.create_order(symbol, qty, "buy")
                    self.submit_order(order)
                    self.log_message(f"[{symbol}] COMPRA {qty} @ ~{last_price:.2f} (score {sig['score']})")

            elif sig["direction"] == "sell" and position is not None:
                order = self.create_order(symbol, position.quantity, "sell")
                self.submit_order(order)
                self.log_message(f"[{symbol}] VENDA {position.quantity} @ ~{last_price:.2f} (score {sig['score']})")

    def _size_position(self, cash: float, price: float) -> int:
        budget = cash * self.cash_at_risk
        if price <= 0:
            return 0
        return int(budget // price)
