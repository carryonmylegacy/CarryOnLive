#!/bin/bash
# Audit every page in /app/frontend/src/pages for add/delete/edit
# handlers and classify by their offline behaviour.
#
# A page is "OFFLINE-SAFE" if its mutation handlers either:
#   (a) call `mutateWithOutbox(...)` — the canonical offline-write path
#       that queues the request to IndexedDB outbox when offline; OR
#   (b) call `addPendingUpload(...)` — the chunked-upload queue for
#       large media; OR
#   (c) genuinely have no client-side mutations (read-only pages).
#
# Pages are further split into:
#   USER DATA pages — benefactor/beneficiary-facing data CRUD where
#     offline support is a product expectation.
#   AUTH/MARKETING/ADMIN — pages where offline mutation isn't a user
#     expectation (login, marketing, admin-only ops, etc.).
#
# Usage:  bash /app/scripts/audit_offline_mutations.sh
# Exits 0 always — this is a report, not a gate.

set -e
PAGES_DIR="/app/frontend/src/pages"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

# Pages that DO NOT need offline-mutation support (auth, marketing,
# static, admin-only ops, payment portals etc.). These mutations
# always require an online connection by design.
NON_OFFLINE='^(AboutPage|AcceptInvitationPage|AdminPage|AdminPrimitivesPage|CreateEstatePage|DashboardPage|EditMilestoneMessagePage|EstateChatPage|FoundersCirclePage|FounderAboutPage|GetStartedPage|GuardianPage|HomePage|LandingPage|LegacyTimelinePage|LoginPage|OfflineDebugPage|OnboardingPage|OperationsPage|PrivacyPolicyPage|SecurityPage|SecuritySettingsPage|SettingsPage|SharePage|SharedPlanPage|SignupPage|SpeakWithUsPage|SubscriptionPage|SupportChatPage|TermsPage|TransitionPage|VoicesPage|WindDownPromisePage)$'

# Justification for NON_OFFLINE entries that aren't obvious:
#   GuardianPage              → AI chat / file exports both require the
#                                online server; conversation isn't a
#                                user-data CRUD surface.
#   EditMilestoneMessagePage  → standalone edit page for an EXISTING
#                                server-stored message. The offline
#                                capture path is the inline modal in
#                                MessagesPage; this page presupposes
#                                an online round-trip.

echo "=========================================="
echo "  CarryOn — Offline Mutation Audit"
echo "=========================================="
echo

total=0
safe=0
unsafe_user_data=0
unsafe_other=0
readonly=0
declare -a UNSAFE_USER_DATA=()
declare -a UNSAFE_OTHER=()
declare -a SAFE_LIST=()
declare -a READONLY_LIST=()

for f in "$PAGES_DIR"/*.js; do
  base=$(basename "$f" .js)
  total=$((total + 1))

  mutations=$(grep -E "axios\.(post|put|patch|delete)\s*\(" "$f" 2>/dev/null | wc -l | tr -d ' \n')
  if [ "${mutations:-0}" -eq 0 ]; then
    readonly=$((readonly + 1))
    READONLY_LIST+=("$base")
    continue
  fi

  guarded=$(grep -E "mutateWithOutbox|addPendingUpload|enqueueOutbox|enqueue\(\{|navigator\.onLine === false|__isDeviceOffline" "$f" 2>/dev/null | wc -l | tr -d ' \n')

  if [ "${guarded:-0}" -gt 0 ]; then
    safe=$((safe + 1))
    SAFE_LIST+=("$base ($guarded guards / $mutations direct)")
  else
    if echo "$base" | grep -qE "$NON_OFFLINE"; then
      unsafe_other=$((unsafe_other + 1))
      UNSAFE_OTHER+=("$base ($mutations mutations)")
    else
      unsafe_user_data=$((unsafe_user_data + 1))
      UNSAFE_USER_DATA+=("$base ($mutations mutations)")
    fi
  fi
done

echo -e "${GREEN}USER-DATA PAGES — OFFLINE-SAFE:${RESET}"
for p in "${SAFE_LIST[@]}"; do echo "  ✓ $p"; done
echo

echo -e "${RED}USER-DATA PAGES — STILL ONLINE-ONLY (need conversion):${RESET}"
if [ ${#UNSAFE_USER_DATA[@]} -eq 0 ]; then
  echo "  (none — every user-data page is offline-safe)"
else
  for p in "${UNSAFE_USER_DATA[@]}"; do echo "  ✗ $p"; done
fi
echo

echo -e "${CYAN}READ-ONLY pages (no axios mutations):${RESET}"
for p in "${READONLY_LIST[@]}"; do echo "  · $p"; done
echo

echo -e "${YELLOW}ONLINE-BY-DESIGN pages (auth / marketing / admin / payments):${RESET}"
for p in "${UNSAFE_OTHER[@]}"; do echo "  · $p"; done
echo

echo "=========================================="
echo "  Summary"
echo "=========================================="
echo "  Total pages scanned:                $total"
echo -e "  ${GREEN}User-data offline-safe:             $safe${RESET}"
echo -e "  ${RED}User-data ONLINE-ONLY (gap):        $unsafe_user_data${RESET}"
echo -e "  ${CYAN}Read-only (no mutations):           $readonly${RESET}"
echo -e "  ${YELLOW}Online-by-design (auth/admin/etc.): $unsafe_other${RESET}"
echo
if [ "$unsafe_user_data" -gt 0 ]; then
  echo -e "${YELLOW}⚠  The ${unsafe_user_data} user-data page(s) above will throw or"
  echo -e "   silently drop user input when the device is offline."
  echo -e "   Convert them to use mutateWithOutbox() for full offline sync.${RESET}"
fi
exit 0
