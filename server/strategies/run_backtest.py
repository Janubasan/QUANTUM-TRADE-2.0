"""
run_backtest.py - Execução offline de backtest com Lumibot e YahooDataBacktesting
Executa a SignalStrategy em múltiplos ativos com histórico diário/intraday.
"""
from datetime import datetime
from lumibot.backtesting import YahooDataBacktesting
from lumibot_signal_strategy import SignalStrategy

if __name__ == "__main__":
    backtest_start = datetime(2023, 1, 1)
    backtest_end = datetime(2026, 1, 1)

    print("🚀 [Lumibot] Iniciando Backtest Offline para SignalStrategy...")
    results = SignalStrategy.backtest(
        YahooDataBacktesting,
        backtest_start,
        backtest_end,
        parameters={
            "symbols": ["SPY", "QQQ"],
            "cash_at_risk_per_trade": 0.10,
            "lookback_bars": 60,
        },
        benchmark_asset="SPY",
    )

    print("✅ Backtest Finalizado!")
    print(f"CAGR: {results.get('cagr', 'N/A')}")
    print(f"Sharpe Ratio: {results.get('sharpe', 'N/A')}")
    print(f"Max Drawdown: {results.get('max_drawdown', 'N/A')}")
