#!/usr/bin/env bash
# CarryOn Pitch-Day Smoke Test
# -----------------------------------------------------------------------------
# Hits the 8 critical user-conversion endpoints and exits non-zero if any of them
# returns an unexpected status code. Intended for a final 3-second confidence
# check before a live B2B pitch (or any production push).
#
# Usage:
#   API_URL=https://app.carryon.us bash scripts/pitch_smoke.sh
#   bash scripts/pitch_smoke.sh                       # auto-reads /app/frontend/.env
#
# Override the test login (defaults to the preview-pod benefactor):
#   TEST_EMAIL=info@carryon.us TEST_PASSWORD=Demo1234! bash scripts/pitch_smoke.sh
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more endpoints returned an unexpected status
# -----------------------------------------------------------------------------

set -u

# ---- Config ------------------------------------------------------------------
if [[ -z "${API_URL:-}" ]]; then
  if [[ -f /app/frontend/.env ]]; then
    API_URL="$(grep -E '^REACT_APP_BACKEND_URL=' /app/frontend/.env | cut -d= -f2-)"
  fi
fi
API_URL="${API_URL%/}"
TEST_EMAIL="${TEST_EMAIL:-info@carryon.us}"
TEST_PASSWORD="${TEST_PASSWORD:-Demo1234!}"

if [[ -z "${API_URL}" ]]; then
  echo "FATAL: API_URL not set and /app/frontend/.env not found." >&2
  exit 1
fi

# ---- ANSI --------------------------------------------------------------------
G="\033[0;32m"; R="\033[0;31m"; Y="\033[1;33m"; N="\033[0m"

fail_count=0
pass_count=0

check() {
  # check <label> <expected_status_spaced_list> <curl args...>
  local label="$1"; shift
  local expected="$1"; shift
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$@")"
  if [[ " ${expected} " == *" ${code} "* ]]; then
    printf "  ${G}PASS${N}  %-46s -> %s\n" "$label" "$code"
    pass_count=$((pass_count + 1))
  else
    printf "  ${R}FAIL${N}  %-46s -> %s   (expected: %s)\n" "$label" "$code" "$expected"
    fail_count=$((fail_count + 1))
  fi
}

echo "=== CarryOn Pitch Smoke Test ==="
echo "  API:     ${API_URL}"
echo "  Account: ${TEST_EMAIL}"
echo

# ---- Pre-flight: get a token (this IS the login check) ----------------------
LOGIN_BODY="{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\",\"force_login\":true}"
LOGIN_HTTP_CODE="$(curl -s -o /tmp/.pitch_smoke_login -w "%{http_code}" --max-time 10 \
  -X POST "${API_URL}/api/auth/login" -H "Content-Type: application/json" -d "${LOGIN_BODY}")"
LOGIN_RESP="$(cat /tmp/.pitch_smoke_login 2>/dev/null || true)"
rm -f /tmp/.pitch_smoke_login
TOKEN="$(printf '%s' "${LOGIN_RESP}" | python3 -c \
  "import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('access_token') or d.get('token') or '')
except Exception:
    print('')" 2>/dev/null || true)"

if [[ "${LOGIN_HTTP_CODE}" == "200" && -n "${TOKEN}" ]]; then
  printf "  ${G}PASS${N}  %-46s -> %s\n" "POST /api/auth/login (pre-flight)" "${LOGIN_HTTP_CODE}"
  pass_count=$((pass_count + 1))
else
  printf "  ${R}FAIL${N}  %-46s -> %s\n" "POST /api/auth/login (pre-flight)" "${LOGIN_HTTP_CODE}"
  echo "        response: ${LOGIN_RESP:0:240}"
  fail_count=$((fail_count + 1))
fi
AUTH_HDR="Authorization: Bearer ${TOKEN}"

# ---- 7 remaining endpoints ---------------------------------------------------
check "POST /api/auth/register (validation)" "422 400" \
  -X POST "${API_URL}/api/auth/register" -H "Content-Type: application/json" -d "{}"

check "GET  /api/subscriptions/plans" "200" \
  "${API_URL}/api/subscriptions/plans"

check "POST /api/subscriptions/checkout" "200" \
  -X POST "${API_URL}/api/subscriptions/checkout" -H "${AUTH_HDR}" -H "Content-Type: application/json" \
  -d '{"plan_id":"premium","billing_cycle":"monthly","origin_url":"https://example.com"}'

check "POST /api/auth/forgot-password" "200" \
  -X POST "${API_URL}/api/auth/forgot-password" -H "Content-Type: application/json" \
  -d "{\"username\":\"${TEST_EMAIL}\"}"

check "POST /api/auth/reset-password (validation)" "422 400" \
  -X POST "${API_URL}/api/auth/reset-password" -H "Content-Type: application/json" -d "{}"

check "GET  /api/estates" "200" \
  -H "${AUTH_HDR}" "${API_URL}/api/estates"

# Resolve the user's first estate id, then poke the dashboard aggregate.
ESTATE_ID="$(curl -s --max-time 10 -H "${AUTH_HDR}" "${API_URL}/api/estates" | python3 -c \
  "import sys, json
d = json.load(sys.stdin)
items = d if isinstance(d, list) else (d.get('estates') or [])
print(items[0]['id'] if items else '')" 2>/dev/null || true)"

if [[ -n "${ESTATE_ID}" ]]; then
  check "GET  /api/financial/portal/{estate_id}" "200" \
    -H "${AUTH_HDR}" "${API_URL}/api/financial/portal/${ESTATE_ID}"
else
  printf "  ${Y}SKIP${N}  GET  /api/financial/portal/{estate_id}    (no estate found for ${TEST_EMAIL})\n"
fi

echo
total=$((pass_count + fail_count))
if [[ ${fail_count} -eq 0 ]]; then
  printf "${G}✅  All %d checks passed. Pitch-ready.${N}\n" "${total}"
  exit 0
else
  printf "${R}❌  %d of %d checks FAILED.${N}  Do NOT pitch until these are green.\n" "${fail_count}" "${total}"
  exit 1
fi
