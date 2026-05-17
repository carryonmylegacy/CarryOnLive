#!/usr/bin/env bash
# CarryOn™ — canonical "run ALL checks before push"
# ============================================================================
# The single command every contributor should run before pushing:
#   bash scripts/check.sh
#
# Runs:
#   1. Housekeeping protocol (65 checks incl. SOC 2, iOS, PWA, Vercel)
#   2. Optional pytest (if HK_RUN_TESTS=1)
#   3. Optional frontend ESLint (always)
#   4. Optional Lighthouse (if HK_RUN_LIGHTHOUSE=1)
#
# Exit code:
#   0 — all clean, safe to push
#   N — total issue count across all sections
# ============================================================================

set +e
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

BLOCKING_ISSUES=0

echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}  CarryOn™ Pre-Push Gate${NC}"
echo -e "${BOLD}═══════════════════════════════════════════${NC}"

# 1. Housekeeping (advisory — does not directly block on its own)
echo ""
echo -e "${BOLD}Stage 1/5: Housekeeping protocol (advisory)${NC}"
bash /app/housekeeping.sh

# 2. Hard-blocking: backend ruff (check + format)
echo ""
echo -e "${BOLD}Stage 2/5: Backend ruff (BLOCKING)${NC}"
cd backend
if ruff check . > /tmp/check_ruff.log 2>&1 && ruff format --check . >> /tmp/check_ruff.log 2>&1; then
  echo -e "  ${GREEN}PASS${NC}"
else
  echo -e "  ${RED}FAIL${NC}"
  cat /tmp/check_ruff.log
  echo ""
  echo "  Fix: cd backend && ruff format . && ruff check --fix ."
  BLOCKING_ISSUES=$((BLOCKING_ISSUES + 1))
fi
cd ..

# 3. Hard-blocking: frontend ESLint errors
echo ""
echo -e "${BOLD}Stage 3/5: Frontend ESLint errors (BLOCKING)${NC}"
cd frontend
if yarn lint:errors > /tmp/check_eslint.log 2>&1; then
  echo -e "  ${GREEN}PASS${NC}"
else
  ERRS=$(grep -c "error" /tmp/check_eslint.log 2>/dev/null || echo "0")
  echo -e "  ${RED}FAIL${NC} ($ERRS errors)"
  tail -30 /tmp/check_eslint.log
  BLOCKING_ISSUES=$((BLOCKING_ISSUES + 1))
fi
cd ..

# 4. Fast test suite (IDOR + core-endpoints smoke) — ALWAYS blocking
echo ""
echo -e "${BOLD}Stage 4/5: Fast test suite (BLOCKING)${NC}"
if python3 /app/scripts/check_tests_fast.py --strict > /tmp/check_fast_tests.log 2>&1; then
  echo -e "  ${GREEN}PASS${NC}"
  tail -3 /tmp/check_fast_tests.log
else
  echo -e "  ${RED}FAIL${NC}"
  tail -30 /tmp/check_fast_tests.log
  BLOCKING_ISSUES=$((BLOCKING_ISSUES + 1))
fi

# 4b. Backend pytest full suite (opt-in)
if [ "$HK_RUN_TESTS" = "1" ]; then
  echo ""
  echo -e "${BOLD}Stage 4b/5: Backend full pytest (BLOCKING)${NC}"
  cd backend
  if pytest tests/ -x -q --tb=short > /tmp/check_pytest.log 2>&1; then
    echo -e "  ${GREEN}PASS${NC}"
    tail -5 /tmp/check_pytest.log
  else
    echo -e "  ${RED}FAIL${NC}"
    tail -30 /tmp/check_pytest.log
    BLOCKING_ISSUES=$((BLOCKING_ISSUES + 1))
  fi
  cd ..
else
  echo ""
  echo -e "${BOLD}Stage 4b/5:${NC} Full pytest skipped (set HK_RUN_TESTS=1 to run)"
fi

# 5. Lighthouse (opt-in)
if [ "$HK_RUN_LIGHTHOUSE" = "1" ]; then
  echo ""
  echo -e "${BOLD}Stage 5/5: Lighthouse${NC}"
  if command -v lighthouse > /dev/null 2>&1; then
    URL="${LIGHTHOUSE_URL:-http://localhost:3000}"
    lighthouse "$URL" --only-categories=performance --quiet --chrome-flags="--headless" --output=json --output-path=/tmp/lh.json > /dev/null 2>&1
    PERF=$(python3 -c "import json; print(int(json.load(open('/tmp/lh.json'))['categories']['performance']['score']*100))" 2>/dev/null || echo "0")
    echo "  Performance: $PERF/100"
    if [ "$PERF" -lt 70 ]; then
      echo -e "  ${RED}FAIL${NC} (< 70)"
      BLOCKING_ISSUES=$((BLOCKING_ISSUES + 1))
    fi
  else
    echo -e "  ${YELLOW}SKIP${NC} (lighthouse CLI not installed — npm i -g lighthouse)"
  fi
else
  echo ""
  echo -e "${BOLD}Stage 5/5:${NC} Lighthouse skipped (set HK_RUN_LIGHTHOUSE=1 to run)"
fi

# 5b. k6 SLO load test (opt-in, requires k6 binary)
if [ "$HK_RUN_K6" = "1" ]; then
  echo ""
  echo -e "${BOLD}Stage 5b/5: k6 SLO load test (BLOCKING)${NC}"
  if ! command -v k6 >/dev/null 2>&1; then
    echo -e "  ${YELLOW}SKIP${NC} (k6 binary not installed — see https://k6.io/docs/get-started/installation/)"
  else
    API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
    if k6 run \
        --env API_URL="$API_URL" \
        --env TEST_EMAIL=info@carryon.us \
        --env TEST_PASSWORD=Demo1234! \
        /app/scripts/k6/baseline.js > /tmp/check_k6.log 2>&1; then
      echo -e "  ${GREEN}PASS${NC}"
      grep -E "p\(95\)|p\(99\)|error_rate|hotpath_latency" /tmp/check_k6.log | tail -5
    else
      echo -e "  ${RED}FAIL${NC} (SLO breach)"
      tail -30 /tmp/check_k6.log
      BLOCKING_ISSUES=$((BLOCKING_ISSUES + 1))
    fi
  fi
fi

# 5c. WCAG 2.1 AA a11y smoke (opt-in, requires playwright + chromium)
if [ "$HK_RUN_A11Y" = "1" ]; then
  echo ""
  echo -e "${BOLD}Stage 5c/5: WCAG 2.1 AA a11y smoke (BLOCKING)${NC}"
  cd frontend
  if E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/a11y.spec.js --reporter=line --workers=1 > /tmp/check_a11y.log 2>&1; then
    echo -e "  ${GREEN}PASS${NC}"
    tail -3 /tmp/check_a11y.log
    cd ..
    python3 /app/scripts/a11y_report.py > /dev/null 2>&1
    echo "  Report regenerated: /app/memory/A11Y_AUDIT.md"
  else
    echo -e "  ${RED}FAIL${NC} (a11y violations)"
    tail -30 /tmp/check_a11y.log
    cd ..
    BLOCKING_ISSUES=$((BLOCKING_ISSUES + 1))
  fi
fi

echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
if [ "$BLOCKING_ISSUES" = "0" ]; then
  echo -e "  ${GREEN}${BOLD}ALL CLEAR — SAFE TO PUSH${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════${NC}"
  exit 0
else
  echo -e "  ${RED}${BOLD}$BLOCKING_ISSUES BLOCKING ISSUE(S) — DO NOT PUSH${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════${NC}"
  exit "$BLOCKING_ISSUES"
fi
