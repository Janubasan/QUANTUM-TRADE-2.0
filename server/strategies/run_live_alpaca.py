"""Conservative Alpaca PAPER runner.

The runner cannot wake up on a backtest alone. It requires the manifest written
by /api/validation/run only after every promotion gate passes. LIVE is rejected
unconditionally; changing a .env value cannot bypass that guard.
"""
import json
import os
from pathlib import Path

from lumibot.brokers import Alpaca
from lumibot.traders import Trader

from lumibot_signal_strategy import SignalStrategy


MANIFEST_PATH = Path(os.environ.get("VALIDATED_STRATEGY_PATH", "server/data/validated_strategy.json"))


def load_approved_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        raise SystemExit(
            f"PAPER runner bloqueado: manifest ausente em {MANIFEST_PATH}. "
            "Execute e passe o WFA Promotion Gate primeiro."
        )
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"PAPER runner bloqueado: manifest inválido ({exc}).") from exc

    if manifest.get("status") != "APPROVED" or manifest.get("mode") != "PAPER":
        raise SystemExit("PAPER runner bloqueado: deployment não está APPROVED/PAPER.")
    if manifest.get("broker") != "ALPACA_PAPER" or manifest.get("paper_only") is not True:
        raise SystemExit("PAPER runner bloqueado: broker/mode incompatível com o runner seguro.")
    if float(manifest.get("max_position_pct", 0)) > 2:
        raise SystemExit("PAPER runner bloqueado: position sizing acima de 2%.")
    return manifest


def main() -> None:
    manifest = load_approved_manifest()
    api_key = os.environ.get("ALPACA_API_KEY")
    api_secret = os.environ.get("ALPACA_SECRET_KEY")
    if not api_key or not api_secret:
        raise SystemExit("PAPER runner bloqueado: configure ALPACA_API_KEY e ALPACA_SECRET_KEY.")

    # Paper is a literal constant, not an environment-controlled switch.
    alpaca_config = {"API_KEY": api_key, "API_SECRET": api_secret, "PAPER": True}
    strategy_params = manifest.get("params") or {}
    strategy_params.update(
        {
            "symbols": [manifest.get("asset", "SPY")],
            "cash_at_risk_per_trade": min(0.02, float(manifest.get("max_position_pct", 2)) / 100),
            "lookback_bars": int(strategy_params.get("lookback_bars", 60)),
        }
    )

    print(f"🔒 WFA manifest aprovado: {manifest.get('deployment_id')}")
    print("🔌 Conectando exclusivamente à Alpaca PAPER...")
    broker = Alpaca(alpaca_config)
    strategy = SignalStrategy(broker=broker, parameters=strategy_params)
    trader = Trader()
    trader.add_strategy(strategy)
    print("🚀 Runner PAPER iniciado. LIVE permanece bloqueado por design.")
    trader.run_all()


if __name__ == "__main__":
    main()
