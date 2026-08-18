#!/usr/bin/env python3
"""Agente auditado JANUTRADE <-> Profit Chart (Nelogica) / API Proft.

O mesmo processo serve demo e live. Live só é enviado se o servidor
JANUTRADE tiver ALLOW_LIVE_TRADING=true e a conta estiver promovida.

Modos de execução, nesta ordem:
1. REST HMAC em PROFT_API_BASE_URL (ou --base-rest)
2. ProfitDLL (Windows), se ProfitDLL64.dll estiver no PATH
3. Sem venue: reporta rejected. Nunca inventa fill.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import hmac
import hashlib
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

AGENT_VERSION = "2.0.0"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def http_json(method: str, url: str, token: str, account_id: str, payload: dict | None = None) -> dict:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("X-Account-Id", account_id)
    req.add_header("Content-Type", "application/json")
    try:
        with urlopen(req, timeout=12) as res:
            raw = res.read().decode("utf-8") or "{}"
            return json.loads(raw)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {exc.code} {url}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Falha de rede {url}: {exc.reason}") from exc


def sign_rest(secret: str, timestamp: str, method: str, path: str, body: str) -> str:
    msg = f"{timestamp}{method.upper()}{path}{body}"
    return hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()


class RestVenue:
    def __init__(self, base_url: str, api_key: str, api_secret: str, environment: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.api_secret = api_secret
        self.environment = environment

    def place(self, cmd: dict) -> dict:
        path = "/v1/orders"
        payload = {
            "clientOrderId": cmd.get("id"),
            "symbol": cmd.get("symbol"),
            "side": "buy" if cmd.get("direction") == "LONG" else "sell",
            "quantity": cmd.get("volume"),
            "type": "market",
            "stopLoss": cmd.get("sl"),
            "takeProfit": cmd.get("tp"),
            "comment": cmd.get("comment") or "QT2",
        }
        return self._request("POST", path, payload)

    def close(self, cmd: dict) -> dict:
        ticket = cmd.get("ticket") or cmd.get("id")
        return self._request("DELETE", f"/v1/orders/{ticket}", {})

    def account(self) -> dict:
        return self._request("GET", "/v1/account", {})

    def _request(self, method: str, path: str, payload: dict) -> dict:
        body = "" if method == "GET" else json.dumps(payload)
        ts = str(int(time.time()))
        signature = sign_rest(self.api_secret, ts, method, path, body)
        req = Request(f"{self.base_url}{path}", data=None if method == "GET" else body.encode(), method=method)
        req.add_header("Content-Type", "application/json")
        req.add_header("X-API-Key", self.api_key)
        req.add_header("X-Timestamp", ts)
        req.add_header("X-Signature", signature)
        req.add_header("X-Environment", self.environment)
        try:
            with urlopen(req, timeout=12) as res:
                return json.loads(res.read().decode("utf-8") or "{}")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            return {"status": "rejected", "error": f"HTTP {exc.code}: {detail}"}
        except URLError as exc:
            return {"status": "rejected", "error": str(exc.reason)}


class ProfitDllVenue:
    def __init__(self):
        self.ok = False
        self.error = "ProfitDLL indisponível neste SO"
        if os.name != "nt":
            return
        try:
            import ctypes  # noqa: WPS433

            dll_name = os.environ.get("PROFIT_DLL_PATH", "ProfitDLL64.dll")
            self.dll = ctypes.WinDLL(dll_name)
            self.ok = True
            self.error = ""
        except OSError as exc:
            self.error = f"Não carregou ProfitDLL: {exc}"

    def place(self, cmd: dict) -> dict:
        if not self.ok:
            return {"status": "rejected", "error": self.error}
        return {
            "status": "rejected",
            "error": "ProfitDLL carregada, mas SendOrder precisa da chave de ativação Nelogica. Configure PROFIT_ACTIVATION_KEY.",
        }


class Agent:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.rest = None
        if args.rest_url and args.api_key and args.api_secret:
            self.rest = RestVenue(args.rest_url, args.api_key, args.api_secret, args.environment)
        self.dll = ProfitDllVenue()

    def heartbeat(self) -> None:
        payload = {
            "accountId": self.args.account_id,
            "login": self.args.login or self.args.account_id,
            "server": self.args.server or "proft",
            "company": "Profit/Proft",
            "tradeMode": self.args.environment,
            "currency": "BRL",
            "agentVersion": AGENT_VERSION,
            "positions": [],
            "quotes": {},
        }
        if self.rest:
            acc = self.rest.account()
            if isinstance(acc, dict) and not acc.get("error"):
                payload["balance"] = acc.get("balance")
                payload["equity"] = acc.get("equity") or acc.get("balance")
                payload["currency"] = acc.get("currency") or "BRL"
        http_json(
            "POST",
            f"{self.args.hub}/api/proft/bridge/heartbeat",
            self.args.token,
            self.args.account_id,
            payload,
        )

    def pull(self) -> list[dict]:
        data = http_json(
            "POST",
            f"{self.args.hub}/api/proft/bridge/commands",
            self.args.token,
            self.args.account_id,
            {"accountId": self.args.account_id},
        )
        return list(data.get("commands") or [])

    def report(self, command_id: str, result: dict) -> None:
        http_json(
            "POST",
            f"{self.args.hub}/api/proft/bridge/report",
            self.args.token,
            self.args.account_id,
            {
                "commandId": command_id,
                "accountId": self.args.account_id,
                "status": result.get("status") or "rejected",
                "ticket": str(result.get("ticket") or result.get("id") or ""),
                "price": result.get("avgPrice") or result.get("price") or 0,
                "volume": result.get("quantity") or result.get("volume") or 0,
                "comment": result.get("error") or result.get("comment") or "",
                "raw": result,
            },
        )

    def execute(self, cmd: dict) -> None:
        action = cmd.get("action")
        if action == "ping":
            self.report(cmd["id"], {"status": "filled", "comment": "pong"})
            return
        result: dict[str, Any]
        if self.rest:
            result = self.rest.close(cmd) if action in {"close", "cancel"} else self.rest.place(cmd)
        elif self.dll.ok:
            result = self.dll.place(cmd)
        else:
            result = {
                "status": "rejected",
                "error": "Nenhuma venue real: defina PROFT_API_BASE_URL+chaves ou carregue ProfitDLL64.dll",
            }
        status = str(result.get("status") or result.get("state") or "rejected").lower()
        if "fill" in status or status == "executed":
            result["status"] = "filled"
        elif "reject" in status or result.get("error"):
            result["status"] = "rejected"
        else:
            result["status"] = "filled" if result.get("ticket") or result.get("id") else "rejected"
        self.report(cmd["id"], result)

    def run(self) -> None:
        print(f"[{utc_now()}] Agente Proft/Profit iniciado hub={self.args.hub} account={self.args.account_id}")
        print(f"REST={'on' if self.rest else 'off'} ProfitDLL={'on' if self.dll.ok else 'off'} ({self.dll.error or 'ok'})")
        while True:
            try:
                self.heartbeat()
                for cmd in self.pull():
                    print(f"[{utc_now()}] cmd {cmd.get('id')} {cmd.get('action')} {cmd.get('symbol')}")
                    self.execute(cmd)
            except Exception as exc:  # noqa: BLE001
                print(f"[{utc_now()}] erro: {exc}", file=sys.stderr)
            time.sleep(max(1, self.args.poll))


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Agente JANUTRADE Profit/Proft")
    p.add_argument("--hub", default=os.environ.get("QUANTUM_HUB_URL", "http://127.0.0.1:3000"))
    p.add_argument("--account-id", default=os.environ.get("QUANTUM_ACCOUNT_ID", "acc-proft-demo"))
    p.add_argument("--token", default=os.environ.get("QUANTUM_BRIDGE_TOKEN", ""))
    p.add_argument("--login", default=os.environ.get("PROFT_LOGIN", ""))
    p.add_argument("--server", default=os.environ.get("PROFT_SERVER", "profit-demo"))
    p.add_argument("--environment", default=os.environ.get("PROFT_ENVIRONMENT", "demo"), choices=("demo", "live"))
    p.add_argument("--rest-url", default=os.environ.get("PROFT_API_BASE_URL", ""))
    p.add_argument("--api-key", default=os.environ.get("PROFT_API_KEY", ""))
    p.add_argument("--api-secret", default=os.environ.get("PROFT_API_SECRET", ""))
    p.add_argument("--poll", type=int, default=int(os.environ.get("PROFT_POLL_SECONDS", "2")))
    args = p.parse_args()
    if not args.token:
        p.error("Informe --token ou QUANTUM_BRIDGE_TOKEN")
    return args


if __name__ == "__main__":
    Agent(parse_args()).run()
