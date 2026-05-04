#!/bin/bash
# Per-mutation audit: for each axios.post/put/patch/delete in user-data
# pages, show the surrounding context so we can confirm there's an
# offline guard nearby (mutateWithOutbox, enqueueOutbox, navigator.onLine
# === false, or __isDeviceOffline check).
#
# Usage: bash /app/scripts/audit_per_mutation.sh
#
# Pages to deep-audit (the ones with PARTIAL guarding — fewer guards
# than mutations):

set -e
PAGES=(
  "BeneficiariesPage"
  "ChecklistPage"
  "DashboardPage"
  "FinancialPortalPage"
  "TrusteePage"
  "VaultPage"
)
PAGES_DIR="/app/frontend/src/pages"
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
GUARD_REGEX='mutateWithOutbox|enqueueOutbox|enqueue\(\{|navigator\.onLine === false|__isDeviceOffline|/uploads/chunked|addPendingUpload'

echo "=========================================="
echo "  Per-Mutation Offline Guard Audit"
echo "=========================================="
echo

total_mutations=0
guarded_mutations=0
unguarded_mutations=0
declare -a UNGUARDED=()

for page in "${PAGES[@]}"; do
  f="$PAGES_DIR/${page}.js"
  [ ! -f "$f" ] && continue
  echo -e "${CYAN}── $page ──${RESET}"

  # Get line numbers of every axios mutation
  while IFS= read -r line; do
    lineno=$(echo "$line" | cut -d: -f1)
    code=$(echo "$line" | cut -d: -f2- | sed 's/^[[:space:]]*//')
    [ -z "$lineno" ] && continue
    total_mutations=$((total_mutations + 1))

    # Look at the 25 lines BEFORE this mutation for any guard pattern
    start=$((lineno - 25))
    [ "$start" -lt 1 ] && start=1
    context=$(sed -n "${start},${lineno}p" "$f")
    if echo "$context" | grep -qE "$GUARD_REGEX"; then
      guarded_mutations=$((guarded_mutations + 1))
      echo -e "  ${GREEN}✓ L${lineno}${RESET}  ${code:0:80}"
    else
      unguarded_mutations=$((unguarded_mutations + 1))
      UNGUARDED+=("$page:L$lineno  ${code:0:90}")
      echo -e "  ${RED}✗ L${lineno}${RESET}  ${code:0:80}"
    fi
  done < <(grep -nE "axios\.(post|put|patch|delete)\s*\(" "$f")
  echo
done

echo "=========================================="
echo "  Summary"
echo "=========================================="
echo "  Total mutations:            $total_mutations"
echo -e "  ${GREEN}Guarded (offline-safe):     $guarded_mutations${RESET}"
echo -e "  ${RED}Unguarded (will fail):      $unguarded_mutations${RESET}"
echo

if [ "$unguarded_mutations" -gt 0 ]; then
  echo -e "${RED}UNGUARDED MUTATIONS:${RESET}"
  for u in "${UNGUARDED[@]}"; do echo "  ✗ $u"; done
fi
exit 0
