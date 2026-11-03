#!/usr/bin/env bash
# Simple secret scan. Fails if likely secrets or forbidden files are tracked.
set -u
fail=0
files=$(git ls-files | grep -v -E '(\.env\.example|\.env\.template|check-secrets\.sh|\.lock|pnpm-lock\.yaml)$')

if git ls-files | grep -E '(^|/)\.env$|\.(dump|bak)$|(^|/)node_modules/|(^|/)venv/'; then
  echo "ERROR: forbidden file tracked in git"; fail=1
fi

patterns='AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY-----|sk-[A-Za-z0-9]{32,}|AIza[0-9A-Za-z_-]{35}|rzp_(live|test)_[A-Za-z0-9]{10,}|xox[baprs]-[A-Za-z0-9-]{10,}'
if [ -n "$files" ] && echo "$files" | xargs -d '\n' grep -I -n -E "$patterns" 2>/dev/null; then
  echo "ERROR: possible secret found"; fail=1
fi

[ $fail -eq 0 ] && echo "Secret scan passed"
exit $fail
