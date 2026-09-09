#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# End-to-end test for the "Invoice & Payment Management" n8n workflow.
#
# Usage:
#   export N8N_BASE_URL="https://your-n8n.example.com"
#   export INVOICE_WEBHOOK_API_KEY="your-secret-key"
#   ./test-webhooks.sh
#
# Runs the full business cycle:
#   1. invoice.created  → 201-style processed response (PDF + email)
#   2. invoice.created  → replayed   → duplicate response (no 2nd email!)
#   3. payment.received → partial    → receipt email
#   4. payment.received → remainder  → final confirmation email
#   5. refund.created   → partial    → refund confirmation email
# plus negative tests (bad API key, bad payload).
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

BASE_URL="${N8N_BASE_URL:?Set N8N_BASE_URL, e.g. https://your-n8n.example.com}"
API_KEY="${INVOICE_WEBHOOK_API_KEY:?Set INVOICE_WEBHOOK_API_KEY}"
WEBHOOK="${BASE_URL%/}/webhook/invoice-payment-management"
DIR="$(cd "$(dirname "$0")" && pwd)"

call() {
  local label="$1" payload="$2" key="${3:-$API_KEY}"
  echo
  echo "━━━ $label ━━━"
  curl -sS -w "\nHTTP %{http_code}\n" -X POST "$WEBHOOK" \
    -H "Content-Type: application/json" \
    -H "x-api-key: $key" \
    -d @"$payload" | tee /dev/stderr >/dev/null 2>&1 || true
}

call "1) Create invoice INV-2026-0001 (expect: processed)" "$DIR/invoice-created.json"
call "2) Replay the same invoice event (expect: duplicate)" "$DIR/invoice-created.json"
call "3) Partial payment of 500.00 (expect: processed / partially_paid)" "$DIR/payment-received.json"

# 4) final payment that settles the invoice — generated on the fly
FINAL_PAY=$(mktemp /tmp/final-payment.XXXXXX.json)
cat >"$FINAL_PAY" <<'JSON'
{
  "eventType": "payment.received",
  "payment": {
    "paymentId": "PAY-2026-0002",
    "invoiceId": "INV-2026-0001",
    "amount": 998.70,
    "currency": "USD",
    "method": "bank_transfer",
    "receivedAt": "2026-09-15T14:05:00Z"
  }
}
JSON
call "4) Final payment of 998.70 (expect: processed / paid)" "$FINAL_PAY"

call "5) Refund of 400.00 (expect: processed / partially_refunded)" "$DIR/refund-created.json"

# negative tests
BAD_PAY=$(mktemp /tmp/bad-event.XXXXXX.json)
cat >"$BAD_PAY" <<'JSON'
{ "eventType": "payment.received", "payment": { "amount": -5 } }
JSON
call "6) Invalid payload (expect: HTTP 400 invalid_request)" "$BAD_PAY"
call "7) Wrong API key (expect: HTTP 401 unauthorized)" "$DIR/invoice-created.json" "definitely-the-wrong-key"

echo
echo "Done. Check the execution list in n8n and the Invoices/Payments/Refunds tabs."
