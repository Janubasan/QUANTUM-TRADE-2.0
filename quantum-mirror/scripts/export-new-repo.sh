#!/usr/bin/env bash
# Publica quantum-mirror/ como um NOVO repositório independente no GitHub.
# Uso: ./scripts/export-new-repo.sh [nome-do-repo]   (padrão: QUANTUM-MIRROR)
set -euo pipefail
REPO_NAME="${1:-QUANTUM-MIRROR}"
TMP="/tmp/${REPO_NAME}-export"

echo "📦 Exportando quantum-mirror/ para novo repo: ${REPO_NAME}"
rm -rf "$TMP"
mkdir -p "$TMP"
# Copia tudo exceto dados voláteis
tar --exclude='./data' --exclude='./node_modules' --exclude='./dist' -cf - -C "$(dirname "$0")/.." . | tar -xf - -C "$TMP"
cd "$TMP"
git init -q
git branch -M main
git add .
git commit -qm "feat: Quantum Mirror v1 — 4 audited bots, \$100 demo, integrations matrix, TradingView mirror"
if command -v gh >/dev/null 2>&1; then
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push \
    --description "Audited multi-bot trading system (\$100 demo) with broker/wallet/chain integrations and TradingView mirror"
  echo "✅ Publicado: $(gh repo view --json url -q .url)"
else
  echo "⚠️ gh CLI não encontrado. Repo local pronto em $TMP — crie o remoto e rode:"
  echo "   git remote add origin git@github.com:SEU-USER/${REPO_NAME}.git && git push -u origin main"
fi
