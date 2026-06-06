#!/usr/bin/env bash
# CarryOn — Vercel install wrapper.
# ============================================================================
# Runs `yarn install` but strips the IRREDUCIBLE upstream yarn-classic warning
# noise from the Vercel build log so every deploy reads clean. None of these
# affect the build or runtime — they are third-party metadata artifacts:
#
#   • "... has unmet peer dependency ..."
#       CRA's eslint-config-react-app pins eslint-plugin-react-hooks@4 (peer
#       eslint <=7) against CRA's own bundled eslint 8; @axe-core/playwright and
#       eslint-plugin-unused-imports declare peer ranges that can't all be
#       satisfied at once. Bumping any of them just trades one warning for
#       another (CRA owns the toolchain), so there is no in-repo fix.
#
#   • "Workspaces can only be enabled in private projects."
#       Emitted by upstream deps (recharts, es-toolkit, @napi-rs/canvas) that
#       publish a `workspaces` field in their package.json. We can't change how
#       third parties publish.
#
# IMPORTANT: real install ERRORS are not "warnings", so they are NOT filtered —
# they pass through untouched and the script exits with yarn's own status, so
# Vercel still fails the build on a genuine install failure.
set -uo pipefail

LOG="$(mktemp)"
yarn install "$@" >"$LOG" 2>&1
code=$?

grep -vE 'has unmet peer dependency|Workspaces can only be enabled in private projects' "$LOG" || true
rm -f "$LOG"
exit "$code"
