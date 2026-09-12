#!/usr/bin/env bash
set -euo pipefail
HOOK_PATH="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HOOK_PATH/pre-commit" ] || { echo "ERROR: pre-commit not found in $HOOK_PATH" >&2; exit 1; }
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/*.sh 2>/dev/null || true
echo "OK: git now uses $(git config core.hooksPath)"
