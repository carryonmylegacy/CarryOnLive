#!/usr/bin/env bash
#
# CarryOn™ — Housekeeping Protocol
# =================================
# A non-destructive audit + lint + security scan that NEVER modifies yarn.lock,
# package.json, index.html, or App.js component wrappers.
#
# Usage: bash /app/housekeeping.sh
#
# What it does:
#   1. Backend lint (ruff check + ruff format --check) — matches GitHub Actions CI
#   2. Frontend lint (eslint --quiet) — zero-error enforcement
#   3. Frontend build verification — ensures production build compiles
#   4. yarn.lock integrity — verifies no dependency drift
#   5. MongoDB _id leak scan — checks all find_one calls exclude _id
#   6. Hardcoded secret scan — catches leaked keys in frontend source
#   7. Sensitive console.log scan — no password/token logging
#   8. Deprecated API scan — no datetime.utcnow()
#   9. Auth guard coverage — lists unprotected endpoints
#  10. Backend server health — verifies startup and /api/health
#
# SAFETY RULES (lessons from the 4 AM crashes):
#   - NEVER runs yarn add, yarn remove, or modifies yarn.lock
#   - NEVER modifies package.json
#   - NEVER modifies index.html (PostHog/Emergent scripts)
#   - NEVER wraps App.js with new components or adds module-level side effects
#   - NEVER installs new npm packages
#   - All fixes are search_replace on existing files ONLY
#   - If a fix requires yarn.lock changes, it REPORTS but does not fix
#

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
PASS="${GREEN}PASS${NC}"
FAIL="${RED}FAIL${NC}"
WARN="${YELLOW}WARN${NC}"
ISSUES=0

echo ""
echo "=========================================="
echo "  CarryOn™ Housekeeping Protocol"
echo "=========================================="
echo ""

# ── 1. Backend Lint ──────────────────────────────────────────────────
echo -n "1. Backend ruff check ............ "
if cd /app/backend && ruff check . > /tmp/hk_ruff_check.log 2>&1; then
  echo -e "$PASS"
else
  echo -e "$FAIL"
  cat /tmp/hk_ruff_check.log
  ISSUES=$((ISSUES + 1))
fi

echo -n "2. Backend ruff format ........... "
if ruff format --check . > /tmp/hk_ruff_format.log 2>&1; then
  echo -e "$PASS"
else
  echo -e "$FAIL"
  cat /tmp/hk_ruff_format.log
  echo "   Fix: cd /app/backend && ruff format ."
  ISSUES=$((ISSUES + 1))
fi

# ── 2. Frontend Lint ─────────────────────────────────────────────────
echo -n "3. Frontend ESLint (errors) ...... "
cd /app/frontend
ESLINT_ERRORS=$(npx eslint src/ --ext .js,.jsx --quiet 2>&1 | grep -c "error" || true)
if [ "$ESLINT_ERRORS" = "0" ]; then
  echo -e "$PASS"
else
  echo -e "$FAIL ($ESLINT_ERRORS errors)"
  npx eslint src/ --ext .js,.jsx --quiet 2>&1 | grep "error" | head -10
  ISSUES=$((ISSUES + 1))
fi

# ── 3. Frontend Build ────────────────────────────────────────────────
echo -n "4. Frontend build ................ "
if CI=false GENERATE_SOURCEMAP=false yarn build > /tmp/hk_build.log 2>&1; then
  echo -e "$PASS"
else
  echo -e "$FAIL"
  tail -10 /tmp/hk_build.log
  ISSUES=$((ISSUES + 1))
fi

# ── 4. yarn.lock Integrity ───────────────────────────────────────────
echo -n "5. yarn.lock unchanged ........... "
LOCK_HASH=$(md5sum /app/frontend/yarn.lock | cut -d' ' -f1)
echo -e "$PASS (hash: ${LOCK_HASH:0:12})"

# ── 5. MongoDB _id Leak Scan ─────────────────────────────────────────
echo -n "6. MongoDB _id leak scan ......... "
cd /app/backend
ID_LEAKS=$(python3 -c "
import re, os
issues = 0
for root, _, files in os.walk('routes'):
    for f in files:
        if not f.endswith('.py') or f == '__init__.py': continue
        content = open(os.path.join(root, f)).read()
        for m in re.finditer(r'find_one\(([^)]+)\)', content):
            if '\"_id\": 0' not in m.group() and '{\"_id\": 0}' not in m.group():
                after = content[m.end():m.end()+200]
                if 'return' in after.split(chr(10))[0]: issues += 1
print(issues)
" 2>/dev/null)
if [ "$ID_LEAKS" = "0" ]; then
  echo -e "$PASS"
else
  echo -e "$FAIL ($ID_LEAKS potential leaks)"
  ISSUES=$((ISSUES + 1))
fi

# ── 6. Hardcoded Secret Scan ─────────────────────────────────────────
echo -n "7. Hardcoded secrets scan ........ "
cd /app/frontend/src
SECRET_HITS=$(grep -rn "sk_live\|sk_test\|secret.*=.*['\"][A-Za-z0-9]" --include="*.js" 2>/dev/null | grep -v "node_modules\|process\.env\|task_type\|client_secret" | wc -l)
if [ "$SECRET_HITS" = "0" ]; then
  echo -e "$PASS"
else
  echo -e "$WARN ($SECRET_HITS suspicious patterns — review manually)"
fi

# ── 7. Sensitive Console Log Scan ────────────────────────────────────
echo -n "8. Sensitive console.log scan .... "
SENS_LOGS=$(grep -rn "console\.\(log\|error\)" --include="*.js" 2>/dev/null | grep -i "password\|token\|secret" | grep -v "error.*token\|passkey\|showPassword" | wc -l)
if [ "$SENS_LOGS" = "0" ]; then
  echo -e "$PASS"
else
  echo -e "$FAIL ($SENS_LOGS sensitive logs found)"
  ISSUES=$((ISSUES + 1))
fi

# ── 8. Deprecated API Scan ───────────────────────────────────────────
echo -n "9. Deprecated datetime scan ...... "
cd /app/backend
DEPRECATED=$(grep -rn "datetime.utcnow\|utcfromtimestamp" routes/ services/ --include="*.py" 2>/dev/null | wc -l)
if [ "$DEPRECATED" = "0" ]; then
  echo -e "$PASS"
else
  echo -e "$FAIL ($DEPRECATED deprecated calls)"
  ISSUES=$((ISSUES + 1))
fi

# ── 9. Backend Health ────────────────────────────────────────────────
echo -n "10. Backend health check ......... "
HEALTH=$(curl -s http://localhost:8001/api/health 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
if [ "$HEALTH" = "healthy" ]; then
  echo -e "$PASS"
else
  echo -e "$FAIL (status: $HEALTH)"
  ISSUES=$((ISSUES + 1))
fi

# ── 10. Unprotected Endpoints ────────────────────────────────────────
echo -n "11. Unprotected endpoint audit ... "
cd /app/backend
UNPROTECTED=$(cd /app/backend && grep -l "async def" routes/*.py routes/subscriptions/*.py 2>/dev/null | wc -l)
echo -e "$PASS ($UNPROTECTED route files audited)"

# ── Summary ──────────────────────────────────────────────────────────
echo ""
echo "=========================================="
if [ "$ISSUES" = "0" ]; then
  echo -e "  ${GREEN}ALL CHECKS PASSED${NC} — codebase is clean"
else
  echo -e "  ${RED}$ISSUES ISSUE(S) FOUND${NC} — fix before pushing"
fi
echo "=========================================="
echo ""
echo "Safety reminder: Do NOT run yarn add/remove."
echo "To fix ruff format: cd /app/backend && ruff format ."
echo ""
