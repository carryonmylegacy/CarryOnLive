/**
 * CarryOn — Route Chunk Prewarmer
 * ============================================================================
 * After a successful login (while the user is online), kick off background
 * `import()` calls for every lazy-loaded page chunk in the app. Each import
 * downloads its JS + CSS bundle via webpack, which the Service Worker's
 * stale-while-revalidate handler caches into RUNTIME_CACHE. After the
 * prewarm finishes, the user can navigate to ANY page while offline and
 * it will render from cache — no more "Something went wrong" on pages
 * they've never visited.
 *
 * This does NOT mount the components — it just fetches and evaluates the
 * module, which at the top level is only function definitions + imports.
 * Idempotent.
 *
 * Scheduling strategy:
 *   • `requestIdleCallback` when available so we don't block the first
 *     paint / interaction on the post-login page.
 *   • Throttle to ~4 chunks in flight at a time so a slow connection
 *     doesn't get saturated.
 *   • Skip entirely if the device is offline at call time.
 */

const ROUTE_CHUNK_IMPORTERS = [
  () => import('../pages/OnboardingPage'),
  () => import('../pages/AcceptInvitationPage'),
  () => import('../pages/EditMilestoneMessagePage'),
  () => import('../pages/GuardianPage'),
  () => import('../pages/ChecklistPage'),
  () => import('../pages/OfflineDebugPage'),
  () => import('../pages/TrusteePage'),
  () => import('../pages/FFNPage'),
  () => import('../pages/EstateChatPage'),
  () => import('../pages/ConnectedProtocolPage'),
  () => import('../pages/FinancialPortalPage'),
  () => import('../pages/beneficiary/BeneficiaryCCPPage'),
  () => import('../pages/TransitionPage'),
  () => import('../pages/SettingsPage'),
  () => import('../pages/AdminPage'),
  () => import('../pages/SupportChatPage'),
  () => import('../pages/SecuritySettingsPage'),
  () => import('../pages/LegacyTimelinePage'),
  () => import('../pages/SubscriptionPage'),
  () => import('../pages/FoundersCirclePage'),
  () => import('../pages/OperationsPage'),
  () => import('../pages/PrivacyPolicyPage'),
  () => import('../pages/TermsPage'),
  () => import('../pages/beneficiary/BeneficiaryHubPage'),
  () => import('../pages/beneficiary/PreTransitionPage'),
  () => import('../pages/beneficiary/BeneficiaryDashboardPage'),
  () => import('../pages/beneficiary/BeneficiaryVaultPage'),
  () => import('../pages/beneficiary/BeneficiaryMessagesPage'),
  () => import('../pages/beneficiary/BeneficiaryChecklistPage'),
  () => import('../pages/beneficiary/BeneficiaryGuardianPage'),
  () => import('../pages/beneficiary/MilestoneReportPage'),
  () => import('../pages/beneficiary/UploadCertificatePage'),
  () => import('../pages/beneficiary/CondolencePage'),
  () => import('../pages/beneficiary/BeneficiarySettingsPage'),
  () => import('../pages/beneficiary/BeneficiaryFinancialPage'),
  () => import('../pages/CreateEstatePage'),
  () => import('../pages/GetStartedPage'),
  () => import('../pages/AboutPage'),
  () => import('../pages/FounderAboutPage'),
  () => import('../pages/HomePage'),
];

let _prewarmStarted = false;

const MAX_IN_FLIGHT = 4;

async function _runPrewarm() {
  // Simple concurrency-limited runner: at most MAX_IN_FLIGHT import() calls
  // in flight at once, so we don't saturate a slow cellular connection.
  const queue = [...ROUTE_CHUNK_IMPORTERS];
  const inFlight = [];
  const kick = () => {
    while (inFlight.length < MAX_IN_FLIGHT && queue.length > 0) {
      const importer = queue.shift();
      const p = Promise.resolve()
        .then(importer)
        .catch(() => null) // swallow per-chunk failures — best-effort
        .finally(() => {
          const idx = inFlight.indexOf(p);
          if (idx >= 0) inFlight.splice(idx, 1);
          kick();
        });
      inFlight.push(p);
    }
  };
  kick();
  // Wait for all imports to settle before resolving.
  while (inFlight.length > 0) {
    await Promise.all(inFlight.slice());
  }
}

export function prewarmRouteChunks() {
  if (_prewarmStarted) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  _prewarmStarted = true;

  const schedule = (cb) => {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      return window.requestIdleCallback(cb, { timeout: 3000 });
    }
    return setTimeout(cb, 1500);
  };

  schedule(() => {
    _runPrewarm().catch(() => { _prewarmStarted = false; });
  });
}

/** Exposed for tests — reset so a second call actually runs. */
export function _resetPrewarmForTests() {
  _prewarmStarted = false;
}
