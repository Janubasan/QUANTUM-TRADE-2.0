"""
run_live_alpaca.py - Execução ao vivo (Paper / Live) no Alpaca com Lumibot
Conecta a SignalStrategy diretamente à API gratuita da Alpaca ou qualquer broker compatível.
"""
import os
from lumibot.brokers import Alpaca
from lumibot.traders import Trader
from lumibot_signal_strategy import SignalStrategy

ALPACA_CONFIG = {
    "API_KEY": os.environ.get("ALPACA_API_KEY", "YOUR_ALPACA_API_KEY"),
    "API_SECRET": os.environ.get("ALPACA_SECRET_KEY", "YOUR_ALPACA_SECRET_KEY"),
    "PAPER": True,  # True para simulação (Paper Trading), False para conta real
}

if __name__ == "__main__":
    print("🔌 Conectando ao Broker Alpaca...")
    broker = Alpaca(ALPACA_CONFIG)

    strategy = SignalStrategy(
        broker=broker,
        parameters={
            "symbols": ["SPY", "QQQ"],
            "cash_at_risk_per_trade": 0.10,
            "lookback_bars": 60,
        },
    )

    trader = Trader()
    trader.add_strategy(strategy)
    print("🚀 Trader Lumibot iniciado! Monitorando iterações diárias...")
    trader.run_all()
