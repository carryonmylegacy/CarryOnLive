import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SectionLockProvider } from './components/security/SectionLock';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { isNative } from './services/native';
import SubscriptionPaywall from './components/SubscriptionPaywall';
import DashboardLayout from './components/layout/DashboardLayout';
import ShareUploadModal from './components/ShareUploadModal';
import ForceUpdateGate from './components/ForceUpdateGate';
import NetworkStatusBanner from './components/NetworkStatusBanner';
import NotificationContainer from './components/AppNotification';
import OfflineSyncProgress from './components/OfflineSyncProgress';
import PendingUploadsIndicator from './components/PendingUploadsIndicator';
import PendingSyncChip from './components/PendingSyncChip';
import ScrollRestorationProvider from './components/ScrollRestorationProvider';
import PartnerHeadBranding from './components/PartnerHeadBranding';
import { AmberAlertProvider } from './components/AmberAlert';
import { initErrorReporter, reportError } from './utils/errorReporter';
import { checkForUpdates } from './utils/versionCheck';
import { Loader2 } from 'lucide-react';

const CARRYON_BUILD = '2026-04-28T00:00:00Z-pre-launch-refactor';
if (typeof window !== 'undefined' && !window.__CARRYON_BUILD_LOGGED) {
  window.__CARRYON_BUILD = CARRYON_BUILD;
  window.__CARRYON_BUILD_LOGGED = true;
  console.log(`%c[CarryOn] Build: ${CARRYON_BUILD}`, 'color: #d4af37; font-weight: bold');
}

// Eagerly loaded (needed immediately)
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import LandingPage from './pages/LandingPage';

// Core pages — DashboardPage stays eager so the post-login landing is
// instant. Others moved to lazy-load (Feb 2026 production-scale audit
// P0.4) so a first-time visitor on 4G doesn't download ~700KB of
// detail-page JS before they can see the dashboard. The first
// navigation to any lazy page incurs a one-time ~200ms chunk fetch,
// but the chunk is cached for subsequent visits.
import DashboardPage from './pages/DashboardPage';

// Lazy-loaded pages — only downloaded when navigated to
const VaultPage = lazy(() => import('./pages/VaultPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const BeneficiariesPage = lazy(() => import('./pages/BeneficiariesPage'));
const DigitalWalletPage = lazy(() => import('./pages/DigitalWalletPage'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const AcceptInvitationPage = lazy(() => import('./pages/AcceptInvitationPage'));
// EditBeneficiaryPage removed — editing now handled by SlidePanel in BeneficiariesPage
const EditMilestoneMessagePage = lazy(() => import('./pages/EditMilestoneMessagePage'));
const GuardianPage = lazy(() => import('./pages/GuardianPage'));
const ChecklistPage = lazy(() => import('./pages/ChecklistPage'));
const OfflineDebugPage = lazy(() => import('./pages/OfflineDebugPage'));
const TrusteePage = lazy(() => import('./pages/TrusteePage'));
const FFNPage = lazy(() => import('./pages/FFNPage'));
const EstateChatPage = lazy(() => import('./pages/EstateChatPage'));
const ConnectedProtocolPage = lazy(() => import('./pages/ConnectedProtocolPage'));
const FinancialPortalPage = lazy(() => import('./pages/FinancialPortalPage'));
const BeneficiaryCCPPage = lazy(() => import('./pages/beneficiary/BeneficiaryCCPPage'));
const TransitionPage = lazy(() => import('./pages/TransitionPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AdminPrimitivesPage = lazy(() => import('./pages/AdminPrimitivesPage'));
const SupportChatPage = lazy(() => import('./pages/SupportChatPage'));
const SecuritySettingsPage = lazy(() => import('./pages/SecuritySettingsPage'));
const LegacyTimelinePage = lazy(() => import('./pages/LegacyTimelinePage'));
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'));
const PartnerPortalPage = lazy(() => import('./pages/PartnerPortalPage'));
const FoundersCirclePage = lazy(() => import('./pages/FoundersCirclePage'));
const OperationsPage = lazy(() => import('./pages/OperationsPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));

import TransitionGate from './components/TransitionGate';

// Beneficiary Pages
const BeneficiaryDashboardPage = lazy(() => import('./pages/beneficiary/BeneficiaryDashboardPage'));
const BeneficiaryHubPage = lazy(() => import('./pages/beneficiary/BeneficiaryHubPage'));
const BeneficiaryConciergePage = lazy(() => import('./pages/beneficiary/BeneficiaryConciergePage'));
const BeneficiaryVaultPage = lazy(() => import('./pages/beneficiary/BeneficiaryVaultPage'));
const BeneficiaryMessagesPage = lazy(() => import('./pages/beneficiary/BeneficiaryMessagesPage'));
const BeneficiaryChecklistPage = lazy(() => import('./pages/beneficiary/BeneficiaryChecklistPage'));
// BeneficiaryGuardianPage is no longer mounted directly — the
// /beneficiary/guardian route redirects to /beneficiary/concierge as
// of May 5, 2026. Keeping the page file around in the repo but no
// longer lazy-importing it here keeps the bundle smaller.
const MilestoneReportPage = lazy(() => import('./pages/beneficiary/MilestoneReportPage'));
const UploadCertificatePage = lazy(() => import('./pages/beneficiary/UploadCertificatePage'));
const CondolencePage = lazy(() => import('./pages/beneficiary/CondolencePage'));
const BeneficiarySettingsPage = lazy(() => import('./pages/beneficiary/BeneficiarySettingsPage'));
const BeneficiaryFinancialPage = lazy(() => import('./pages/beneficiary/BeneficiaryFinancialPage'));
const BeneficiaryEntitiesPage = lazy(() => import('./pages/beneficiary/BeneficiaryEntitiesPage'));
const EntitiesPrintPage = lazy(() => import('./pages/print/EntitiesPrintPage'));
const PdfPreviewModal = lazy(() => import('./components/PdfPreviewModal'));
const PdfJobChip = lazy(() => import('./components/PdfJobChip'));
const PWAInstallPrompt = lazy(() => import('./components/PWAInstallPrompt'));
const PdfPreviewLegacyExpired = lazy(() =>
  import('./components/PdfPreviewModal').then((m) => ({ default: m.PdfPreviewLegacyExpired }))
);

const CreateEstatePage = lazy(() => import('./pages/CreateEstatePage'));

const GetStartedPage = lazy(() => import('./pages/GetStartedPage'));

const AboutPage = lazy(() => import('./pages/AboutPage'));
const FounderAboutPage = lazy(() => import('./pages/FounderAboutPage'));

const HomePage = lazy(() => import('./pages/HomePage'));
const VoicesPage = lazy(() => import('./pages/VoicesPage'));
const PartnerBriefPage = lazy(() => import('./pages/PartnerBriefPage'));
const SecurityPage = lazy(() => import('./pages/SecurityPage'));
const WindDownPromisePage = lazy(() => import('./pages/WindDownPromisePage'));

const SharedPlanPage = lazy(() => import('./pages/SharedPlanPage'));

const SpeakWithUsPage = lazy(() => import('./pages/SpeakWithUsPage'));
const SharePage = lazy(() => import('./pages/SharePage'));
const SharedBinderPage = lazy(() => import('./pages/SharedBinderPage'));

import UsernameReviewModal from './components/UsernameReviewModal';
import FeatureGate from './components/FeatureGate';

// Loading fallback — only visible after 180ms to avoid flashing on cache hits.
// This eliminates the sub-100ms "white-out" that feels JV during navigation.
const PageLoader = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 180);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)', animation: 'fadeIn 0.25s ease-out' }}>
      <Loader2 className="w-8 h-8 text-[#d4af37] animate-spin" />
    </div>
  );
};

// Error boundary for lazy-loaded routes — reports to backend and
// auto-recovers on route changes so a transient error on one page
// doesn't lock the user on a "Something went wrong" screen until reload.
class RouteErrorBoundary extends React.Component {
  state = { hasError: false, errorPath: null, errorKind: null, autoRetried: false, gracePending: false, errorMsg: null, errorName: null, errorFrame: null };
  static getDerivedStateFromError(error) {
    // Detect "chunk failed to load" errors — these happen when the user
    // navigates to a lazy-loaded route whose JS bundle isn't in the SW
    // cache and the device is offline. They need a friendlier message.
    // Patterns cover Chrome/Firefox/Edge ("Loading chunk N failed",
    // "Failed to fetch dynamically imported module"), Safari/iOS PWA
    // ("Importing a module script failed", "Module specifier"), and
    // service-worker fetch failures triggered by a missing SW cache.
    const msg = String(error?.message || error || '');
    const name = String(error?.name || '');
    const isChunk = /loading chunk \d+ failed|failed to fetch dynamically imported module|importing a module script failed|module specifier|import.*(failed|error)|script error|failed to fetch/i.test(msg)
      || name === 'ChunkLoadError'
      || name === 'TypeError' && /fetch|import|module/i.test(msg);
    // Capture the error name + message + first identifiable stack frame
    // directly into state so the boundary UI can render them inline
    // without any localStorage roundtrip. This is what appears under
    // the "Something went wrong" headline so the founder can screenshot
    // the exact failure from the iPhone PWA.
    const firstFrame = String(error?.stack || '').split('\n').slice(1).find(l => /\.js|\.tsx|\.jsx/.test(l)) || '';
    return {
      hasError: true,
      errorKind: isChunk ? 'chunk' : 'generic',
      errorName: name.slice(0, 80),
      errorMsg: msg.slice(0, 500),
      errorFrame: firstFrame.trim().slice(0, 300),
    };
  }
  componentDidCatch(error, info) {
    this.setState({ errorPath: typeof window !== 'undefined' ? window.location.pathname : null });
    // Diagnostic breadcrumb (Feb 2026): persist the most recent boundary
    // catch into localStorage so the founder can read it back to us via
    // a Settings → Diagnostics surface or via DevTools after the iPhone
    // PWA crashes offline (Sentry needs network; Safari devtools is a
    // pain to attach). Capped at 5 KB total. Strictly client-side, no
    // PII beyond what the stack frame strings reveal.
    try {
      const entry = {
        t: new Date().toISOString(),
        path: typeof window !== 'undefined' ? window.location.pathname : '',
        online: typeof navigator !== 'undefined' ? !!navigator.onLine : null,
        msg: String(error?.message || error || '').slice(0, 500),
        name: String(error?.name || '').slice(0, 80),
        stack: String(error?.stack || '').split('\n').slice(0, 8).join('\n').slice(0, 1500),
        comp: String(info?.componentStack || '').split('\n').slice(0, 6).join('\n').slice(0, 1200),
      };
      localStorage.setItem('carryon_last_render_error', JSON.stringify(entry));
    } catch { /* private mode etc. */ }
    // Don't spam Sentry with offline chunk-load failures — those are
    // an environmental condition, not a real bug.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (!(offline && this.state.errorKind === 'chunk')) {
      reportError(error, info?.componentStack ? `ErrorBoundary:${info.componentStack.split('\n')[1]?.trim()}` : 'ErrorBoundary');
    }
    // First-render auto-recovery (Feb 2026): when a render throws
    // immediately after an offline login (the stored JWT was hydrated
    // from IndexedDB but the page raced an in-flight `/api/auth/me`
    // refresh that returned undefined data), give the tree exactly
    // ONE silent retry on a short timer. The vast majority of these
    // are transient state-not-yet-populated races, and a re-mount
    // 250ms later usually paints cleanly. This keeps the founder
    // from seeing the "Something went wrong" page after every offline
    // PWA cold start. Guarded by `autoRetried` so we never retry-loop.
    if (!this.state.autoRetried && this.state.errorKind !== 'chunk') {
      const isPostAuthLanding = /^\/(admin|dashboard|beneficiary)/.test(
        typeof window !== 'undefined' ? window.location.pathname : ''
      );
      if (isPostAuthLanding) {
        this.setState({ autoRetried: true, gracePending: true });
        setTimeout(() => {
          this.setState({ hasError: false, errorPath: null, errorKind: null, gracePending: false });
        }, 250);
      }
    }
    // Online ChunkLoadError auto-recovery (May 2026): the user hit a
    // missing chunk while ONLINE, which almost always means a fresh
    // deploy shipped new chunk hashes and the cached main.js still
    // references the old filenames. A plain reload(true) often serves
    // the same stale shell from the service worker and re-triggers the
    // same crash. Fire one silent hard-reload (unregister SW + clear
    // caches + cache-busted location.replace). Guarded by sessionStorage
    // so we never loop — if the hard-reload didn't fix it, the user
    // sees the boundary UI on the second crash and can sign out.
    if (this.state.errorKind === 'chunk') {
      const online = typeof navigator !== 'undefined' && navigator.onLine !== false;
      let alreadyTried = false;
      try { alreadyTried = window.sessionStorage?.getItem('carryon_chunk_recovery') === '1'; } catch { /* private mode */ }
      if (online && !alreadyTried) {
        this.handleHardReload();
      }
    }
  }
  componentDidMount() {
    this._onPop = () => {
      // Any navigation event should clear the error so the new route can render.
      if (this.state.hasError) this.setState({ hasError: false, errorPath: null, errorKind: null });
    };
    // If we went offline and into a chunk error, auto-retry the moment we come back online.
    this._onOnline = () => {
      if (this.state.hasError && this.state.errorKind === 'chunk') {
        this.setState({ hasError: false, errorPath: null, errorKind: null });
      }
    };
    window.addEventListener('popstate', this._onPop);
    window.addEventListener('online', this._onOnline);
    // NOTE: we used to also patch window.history.pushState/replaceState
    // here to dispatch a synthetic 'pushstate' event so the boundary
    // would clear on every React Router navigation. That patch combined
    // with versionCheck.js's identical patch caused iOS Safari to hit
    // its 100-replaceState-per-10-seconds rate limit and throw a
    // SecurityError, which then triggered THIS boundary — exactly the
    // "Something went wrong" loop the user reported. The popstate
    // listener above is sufficient: handleSignOut and handleRetry
    // dispatch popstate explicitly, and React Router naturally fires
    // popstate for browser back/forward. No history monkey-patching
    // is needed and removing it is the actual fix for the loop.
  }
  componentWillUnmount() {
    window.removeEventListener('popstate', this._onPop);
    window.removeEventListener('online', this._onOnline);
  }
  handleHardReload = async () => {
    // True post-deploy chunk-load recovery for a PWA. A naive
    // window.location.reload() often re-serves the same stale shell
    // from the service worker and we land back on the broken main.js
    // referencing the missing chunk filename. Steps, in order:
    //   1. Mark the attempt in sessionStorage so the boundary doesn't
    //      retry-loop if the new shell is also broken.
    //   2. Unregister every service-worker registration so the next
    //      navigation hits the network for a fresh index.html.
    //   3. Clear every Cache Storage entry — covers Workbox precache,
    //      runtime caches, and the founder's LocalForage shells.
    //   4. location.replace() with a cache-bust query so the browser
    //      and any intermediate CDN don't serve the old HTML.
    try { window.sessionStorage?.setItem('carryon_chunk_recovery', '1'); } catch { /* private mode */ }
    try {
      if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
      }
    } catch { /* SW APIs unavailable / disabled */ }
    try {
      if (typeof caches !== 'undefined' && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
      }
    } catch { /* Cache APIs unavailable */ }
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('_cb', String(Date.now()));
      window.location.replace(u.toString());
    } catch {
      window.location.reload();
    }
  };
  handleRetry = () => {
    // When offline, retrying the same broken route just re-throws —
    // the user sees a flash and stays on the error screen. Send them
    // to /login as the safe escape and force-clear AuthContext state
    // (otherwise /login auto-redirects them back to the broken route
    // because they're still "authenticated" in React state).
    // When online, just reset the boundary so the route can fetch
    // again — keeps the existing well-tested behavior intact.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline) {
      try { window.dispatchEvent(new Event('carryon-force-logout')); } catch { /* empty */ }
      try { window.history.replaceState({}, '', '/login'); } catch { /* empty */ }
      try { window.dispatchEvent(new PopStateEvent('popstate')); } catch { /* empty */ }
    }
    this.setState({ hasError: false, errorPath: null, errorKind: null });
  };
  handleSignOut = () => {
    // Escape hatch: clear every auth-related artifact so the user
    // can never get stuck on this screen. Two layers:
    //
    //   1. localStorage keys — cleared here for resilience in case
    //      AuthContext isn't mounted (extremely rare but possible if
    //      the throw came from inside AuthProvider itself).
    //   2. AuthContext in-memory state — cleared by dispatching a
    //      custom event that AuthProvider listens for. Without this
    //      step the user got stuck in a flash-loop: localStorage was
    //      empty but React state still had token+user, so /login
    //      auto-redirected them straight back to /dashboard which
    //      threw again.
    try {
      ['carryon_token','carryon_user','selected_estate_id','beneficiary_estate_id','beneficiary_feature_access','carryon_last_portal','enabled_features']
        .forEach(k => localStorage.removeItem(k));
    } catch { /* private mode etc. */ }
    try { window.dispatchEvent(new Event('carryon-force-logout')); } catch { /* very old browsers */ }
    // Drive React Router to /login. replaceState alone doesn't trigger
    // RR v6 (it only listens for popstate), so we explicitly dispatch
    // popstate after replaceState. No hard nav, no SW shell race.
    try { window.history.replaceState({}, '', '/login'); } catch { /* iOS quirky */ }
    try { window.dispatchEvent(new PopStateEvent('popstate')); } catch { /* very old browsers */ }
    this.setState({ hasError: false, errorPath: null, errorKind: null });
  };
  render() {
    if (this.state.hasError) {
      // Silent first-error grace window (Feb 2026): on a post-auth
      // landing route, when we've scheduled an auto-retry inside
      // componentDidCatch, render NOTHING for ~250ms instead of the
      // "Something went wrong" panel. That covers the common offline
      // race where AuthContext is still hydrating user/sub state when
      // the landing page first mounts and dereferences something
      // undefined. If the retry succeeds, the user never sees a flash;
      // if it fails again, this branch is skipped (autoRetried=true is
      // already set when the second crash arrives) and the regular
      // boundary UI renders.
      const isPostAuthLanding = /^\/(admin|dashboard|beneficiary)/.test(
        typeof window !== 'undefined' ? window.location.pathname : ''
      );
      if (this.state.autoRetried && this.state.errorKind !== 'chunk' && isPostAuthLanding) {
        // Note: autoRetried is set BEFORE the 250ms timer in
        // componentDidCatch fires. So during the grace window
        // hasError is still true and autoRetried is also true — that
        // is the signal to render an empty placeholder rather than
        // the boundary UI. The timer then flips hasError to false
        // and the children re-render normally.
        // We track which retry we're in by checking a sibling flag
        // (gracePending) so subsequent crashes (post-retry) DO show
        // the boundary instead of looping silently.
        if (!this.state.gracePending) {
          // The retry has already fired and the second crash arrived
          // — fall through to the regular boundary UI below.
        } else {
          return (
            <div className="min-h-screen" style={{ background: 'var(--bg, #0F1629)' }} data-testid="error-boundary-grace" />
          );
        }
      }
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      // Pull directly from state (getDerivedStateFromError captures
      // name/msg/firstFrame synchronously). No localStorage roundtrip.
      const debugLine = this.state.errorName
        ? `${this.state.errorName}: ${this.state.errorMsg || '(no message)'}${this.state.errorFrame ? '\n' + this.state.errorFrame : ''}`
        : null;
      // Only show the friendly "needs connection first time" copy for
      // genuine chunk-load failures while offline — those are the
      // case where the JS bundle truly wasn't cached. For any other
      // error (real exception in a component on a page the user has
      // visited before), keep the honest "Something went wrong"
      // headline so we don't lie to the user. The Sign-out button
      // below is the universal escape hatch either way.
      const isOfflineChunk = this.state.errorKind === 'chunk' && offline;
      const title = isOfflineChunk ? 'This page needs a connection the first time' : 'Something went wrong';
      const subtitle = isOfflineChunk
        ? "We couldn't load this page offline because you haven't opened it before. Pick another page, or reconnect and try again — it'll work everywhere from then on."
        : "If this keeps happening, sign out and back in. Your saved work is preserved and will sync when you reconnect.";
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg, #0F1629)' }}>
          <div className="text-center p-6 max-w-md">
            <p className="text-white text-lg font-bold mb-2" data-testid="error-boundary-title">{title}</p>
            <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.7)' }} data-testid="error-boundary-subtitle">{subtitle}</p>
            {debugLine && (
              <pre className="text-[11px] text-left p-2 mb-4 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: '#fca5a5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} data-testid="error-boundary-debug">
                {debugLine}
              </pre>
            )}
            <div className="flex flex-col gap-2 items-center">
              <div className="flex gap-2 justify-center">
                <button onClick={this.handleRetry} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#d4af37', color: '#080e1a' }} data-testid="error-boundary-retry">
                  Try again
                </button>
                {!offline && (
                  <button onClick={this.handleHardReload} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }} data-testid="error-boundary-reload">
                    Reload
                  </button>
                )}
              </div>
              {/* Escape hatch — always rendered so a user trapped on
                  this screen on a real device can recover without
                  uninstalling the PWA. Clears local auth and lands on
                  /login. Available offline (sign-out is a local
                  operation; logout API gets called on the next online
                  start). */}
              <button onClick={this.handleSignOut} className="text-xs underline mt-2" style={{ color: 'rgba(255,255,255,0.55)' }} data-testid="error-boundary-signout">
                Sign out and start over
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading, isAuthenticated, subscriptionStatus } = useAuth();
  const [showPaywall, setShowPaywall] = useState(() => sessionStorage.getItem('paywall_dismissed') === 'true');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1629] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // Founder (admin) can access ALL pages
    if (user?.role === 'admin') {
      return children;
    }
    // Operators can access admin routes (they share the same portal structure)
    if (user?.role === 'operator' && allowedRoles.includes('admin')) {
      return children;
    }
    // Benefactors can also access beneficiary routes (they may have been a beneficiary first)
    if (user?.role === 'benefactor' && allowedRoles.includes('beneficiary')) {
      return children;
    }
    // Beneficiaries who also own estates can access benefactor routes
    if (user?.role === 'beneficiary' && allowedRoles.includes('benefactor') && user?.is_also_benefactor) {
      return children;
    }
    // Redirect based on role
    if (user?.role === 'beneficiary') {
      return <Navigate to="/beneficiary/dashboard" replace />;
    }
    if (user?.role === 'operator') {
      return <Navigate to="/ops" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  // Check subscription status - show paywall if trial expired and no active sub
  // Paywall logic is PORTAL-AWARE, not role-based:
  //   - Benefactor portal → benefactor paywall (even for multi-role users whose role is 'beneficiary')
  //   - Beneficiary portal → no paywall here (handled separately in beneficiary settings)
  //   - /create-estate → no paywall (onboarding must complete first)
  const currentPath = window.location.pathname;

  // Feature-gate UX is now handled by the per-route <FeatureGate> wrapper —
  // it renders a friendly "isn't on your plan" panel with an upgrade CTA
  // instead of silently redirecting. (See components/FeatureGate.js)

  const isOnBeneficiaryRoute = currentPath.startsWith('/beneficiary');
  const isOnCreateEstate = currentPath === '/create-estate';
  const isOnSettings = currentPath === '/settings' || currentPath === '/security-settings';
  const needsSubscription = subscriptionStatus?.needs_subscription === true
    && subscriptionStatus?.trial?.trial_active !== true
    && user?.role !== 'admin'
    && !isOnBeneficiaryRoute
    && !isOnCreateEstate
    && !isOnSettings
    && !subscriptionStatus?.beta_mode
    && !subscriptionStatus?.is_beta_tester
    && !subscriptionStatus?.has_active_subscription;

  if (needsSubscription && !showPaywall) {
    return <SubscriptionPaywall onDismiss={() => { setShowPaywall(true); sessionStorage.setItem('paywall_dismissed', 'true'); }} />;
  }

  return children;
};

// Public Route (redirect if logged in)
const PublicRoute = ({ children }) => {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1629] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    if (user?.role === 'beneficiary' && user?.is_also_benefactor) {
      return <Navigate to="/dashboard" replace />;
    }
    if (user?.role === 'beneficiary') {
      return <Navigate to="/beneficiary/dashboard" replace />;
    } else if (user?.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// Share Extension handler — processes files shared from other apps
function ShareHandler() {
  const { useShareTarget } = require('./hooks/useShareTarget');
  const share = useShareTarget();
  if (!share.showCategoryPicker) return null;
  return (
    <ShareUploadModal
      pendingShare={share.pendingShare}
      categories={share.CATEGORY_OPTIONS}
      uploading={share.uploading}
      onUpload={share.uploadSharedFile}
      onCancel={share.cancelShare}
    />
  );
}

// Public Device Mode — wires the wipe-on-pagehide + wipe-on-idle handlers
// when the user's effective `public_device_mode` flag is true. Mounted at
// the AppRoutes scope so it has access to the auth context but doesn't
// re-create on every route change.
function PublicDeviceModeMount() {
  const { user, token } = useAuth();
  const usePDM = require('./hooks/usePublicDeviceMode').default;
  usePDM({
    enabled: !!user?.public_device_mode,
    idleSeconds: user?.public_device_idle_seconds || 90,
    token,
  });
  return null;
}

// `/` and `/login` both land on the Login screen as part of the B2B-first
// strategic pivot (Feb 2026). The consumer-facing marketing landing page is
// preserved (archived) at `/landing-consumer` so it can be re-enabled when
// B2C funnels spin up. Authenticated users are still routed straight into
// their portal so existing bookmarks of `/` keep working.
function RootRoute() {
  const { user, isAuthenticated } = useAuth();
  if (isAuthenticated) {
    if (user?.role === 'beneficiary' && user?.is_also_benefactor) {
      return <Navigate to="/dashboard" replace />;
    }
    if (user?.role === 'beneficiary') {
      return <Navigate to="/beneficiary/dashboard" replace />;
    }
    if (user?.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }
  return <LoginPage />;
}

function AppRoutes() {
  return (
    <RouteErrorBoundary>
    <Suspense fallback={<PageLoader />}>
    <PublicDeviceModeMount />
    {/* Restores per-pathname scroll offset when the user has the
        "Remember scroll position" preference enabled. No-op when
        the pref is OFF. */}
    <ScrollRestorationProvider />
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      } />
      <Route path="/signup" element={
        <PublicRoute>
          <SignupPage />
        </PublicRoute>
      } />
      
      {/* Legal Pages - Public */}
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/founder-about" element={<FounderAboutPage />} />
      <Route path="/founder-about/:token" element={<FounderAboutPage />} />
      {/* Short alias — share-friendly URL. Renders the same gate/login. */}
      <Route path="/founder" element={<FounderAboutPage />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/voices" element={<VoicesPage />} />
      {/* B2B white-label partner landing — `/p/:slug`. Public, mirrors
          the LoginPage hero but swaps the CarryOn logo for the
          partner's. Stashes partner slug in localStorage so the
          onboarding flow can prompt for the partner's enterprise
          code at the end of signup. */}
      <Route path="/p/:slug" element={<PartnerPortalPage />} />
      {/* Public B2B partner brief — shareable URL, no auth. Linked from
          Admin → Marketing → Sales Brief. Used by the founder\u2019s assistant
          and anyone the founder forwards the link to. */}
      <Route path="/partner-brief" element={<PartnerBriefPage />} />
      {/* Archived D2C consumer marketing landing page — preserved so it can
          be re-enabled at `/` when consumer funnels are spun up. Per the
          B2B-first strategic pivot (Feb 2026), `/` now lands on Login. */}
      <Route path="/landing-consumer" element={<LandingPage />} />
      <Route path="/security" element={<SecurityPage />} />
      <Route path="/wind-down-promise" element={<WindDownPromisePage />} />
      <Route path="/get-started" element={<GetStartedPage />} />
      <Route path="/speak-with-us" element={<SpeakWithUsPage />} />

      {/* Invitation Accept Route - Public */}
      <Route path="/accept-invitation/:token" element={<AcceptInvitationPage />} />

      {/* Shared Plan - Public (no auth required) */}
      <Route path="/shared/plan/:token" element={<SharedPlanPage />} />
      <Route path="/s/:token" element={<SharedBinderPage />} />

      {/* Create Estate Wizard - accessible by both beneficiaries and benefactors */}
      <Route path="/create-estate" element={
        <ProtectedRoute allowedRoles={['beneficiary', 'benefactor']}>
          <CreateEstatePage />
        </ProtectedRoute>
      } />

      {/* Benefactor Routes */}
      <Route element={
        <ProtectedRoute allowedRoles={['benefactor']}>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/share" element={<SharePage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/vault" element={<FeatureGate><VaultPage /></FeatureGate>} />
        <Route path="/messages" element={<FeatureGate><MessagesPage /></FeatureGate>} />
        <Route path="/messages/:messageId/edit" element={<FeatureGate><EditMilestoneMessagePage /></FeatureGate>} />
        <Route path="/beneficiaries" element={<FeatureGate><BeneficiariesPage /></FeatureGate>} />
        {/* Beneficiary edit now handled by SlidePanel */}
        <Route path="/guardian" element={null} />
        <Route path="/checklist" element={<FeatureGate><ChecklistPage /></FeatureGate>} />
        <Route path="/trustee" element={<FeatureGate><TrusteePage /></FeatureGate>} />
        <Route path="/ffn" element={<FeatureGate><FFNPage /></FeatureGate>} />
        <Route path="/transition" element={<TransitionPage />} />
        <Route path="/digital-wallet" element={<FeatureGate><DigitalWalletPage /></FeatureGate>} />
        <Route path="/financial" element={<FeatureGate><FinancialPortalPage /></FeatureGate>} />
        {/* Friendly alias — old marketing/email links and the documented
            test plan reference /financial-portal; canonical path is
            /financial. Redirect rather than 404 so historical links keep
            working without a silent fall-through to /dashboard. */}
        <Route path="/financial-portal" element={<Navigate to="/financial" replace />} />
        <Route path="/timeline" element={<FeatureGate><LegacyTimelinePage /></FeatureGate>} />
        <Route path="/estate-chat" element={<FeatureGate><EstateChatPage /></FeatureGate>} />
        <Route path="/connected-protocol" element={<FeatureGate><ConnectedProtocolPage /></FeatureGate>} />
      </Route>

      {/* Print-only routes — benefactor-gated but NOT wrapped in
          DashboardLayout so the sidebar / dock / mobile nav don't
          show up on the printed page. The page itself fires
          window.print() once layout settles. */}
      <Route element={<ProtectedRoute allowedRoles={['benefactor']}><Outlet /></ProtectedRoute>}>
        <Route path="/financial/entities/:estateId/print" element={<EntitiesPrintPage />} />
      </Route>

      {/* Legacy /pdf-preview/:key route — previews are now an in-app modal
          overlay (see PdfPreviewModal mounted at app root). This route shows
          a friendly "preview unavailable" message for any cached deep-links. */}
      <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
        <Route path="/pdf-preview/:key" element={<PdfPreviewLegacyExpired />} />
      </Route>

      {/* Beneficiary Routes */}
      <Route element={
        <ProtectedRoute allowedRoles={['beneficiary']}>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        {/* /beneficiary = Estate Plan Network HUB. The user-in-the-center
            orbit view of all benefactors who've added them. Tapping any
            benefactor avatar OR estate tile sets beneficiary_estate_id
            and SPA-navigates to /beneficiary/dashboard, which renders
            pre or post-transition content for that estate. The hub is
            the canonical landing for the "My Beneficiary Portal"
            sidebar / mobile nav button. */}
        <Route path="/beneficiary" element={<BeneficiaryHubPage />} />
        {/* Legacy /beneficiary/pre redirects to /beneficiary/dashboard.
            The dashboard now renders pre-transition content INLINE
            (lock banner + EAD shortcuts + estate switcher), so the
            standalone PreTransitionPage is no longer reachable. Kept
            as a redirect so any cached link / TransitionGate redirect
            doesn't 404 or trap the user in a loop. */}
        <Route path="/beneficiary/pre" element={<Navigate to="/beneficiary/dashboard" replace />} />
        {/* Dashboard is NOT wrapped in TransitionGate — it self-handles
            both pre and post transition states (inline panel vs tile
            grid) AND handles missing/invalid estate ids via its own
            empty-state. Wrapping it caused redirect loops:
              - missing estate id → TransitionGate redirected to
                /beneficiary → /beneficiary/dashboard → loop.
              - pre-transition → redirected to /beneficiary/pre,
                whose own back button looped back here. */}
        <Route path="/beneficiary/dashboard" element={<BeneficiaryDashboardPage />} />
        {/* Beneficiary Estate Concierge AI — POST-transition feature
            gated server-side on (1) post-transition estate, (2) caller
            being a beneficiary, (3) benefactor's plan having the `bec`
            feature flag enabled. The page itself fetches its own
            status and renders a precise "why unavailable" panel for
            each rejection reason; we deliberately do NOT wrap it in
            TransitionGate because we want the user to LAND here and
            see the explanation rather than be silently redirected. */}
        <Route path="/beneficiary/concierge" element={<BeneficiaryConciergePage />} />
        <Route path="/beneficiary/vault" element={<TransitionGate section="vault" allowPreTransition><BeneficiaryVaultPage /></TransitionGate>} />
        <Route path="/beneficiary/messages" element={<TransitionGate section="messages"><BeneficiaryMessagesPage /></TransitionGate>} />
        <Route path="/beneficiary/checklist" element={<TransitionGate section="checklist"><BeneficiaryChecklistPage /></TransitionGate>} />
        {/* Legacy /beneficiary/guardian route — Estate Guardian (EGA)
            was the benefactor-side AI; pointing beneficiaries to it was
            an artifact of an earlier build. As of May 5, 2026 the
            beneficiary AI experience is the Beneficiary Estate
            Concierge (BEC) at /beneficiary/concierge. Redirect any
            stale bookmark / nav cache here so beneficiaries land on
            the right surface. */}
        <Route path="/beneficiary/guardian" element={<Navigate to="/beneficiary/concierge" replace />} />
        <Route path="/beneficiary/milestone" element={<TransitionGate><MilestoneReportPage /></TransitionGate>} />
        <Route path="/beneficiary/settings" element={<BeneficiarySettingsPage />} />
        <Route path="/beneficiary/subscription" element={<SubscriptionPage />} />
        <Route path="/beneficiary/upload-certificate" element={<UploadCertificatePage />} />
        <Route path="/beneficiary/condolence" element={<CondolencePage />} />
        <Route path="/beneficiary/estate-chat" element={<FeatureGate><EstateChatPage /></FeatureGate>} />
        <Route path="/beneficiary/connected-protocol" element={<FeatureGate><BeneficiaryCCPPage /></FeatureGate>} />
        <Route path="/beneficiary/financial" element={<FeatureGate><BeneficiaryFinancialPage /></FeatureGate>} />
        <Route path="/beneficiary/entities/:estateId" element={<FeatureGate><BeneficiaryEntitiesPage /></FeatureGate>} />
      </Route>

      {/* Admin Routes */}
      <Route element={
        <ProtectedRoute allowedRoles={['admin']}>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        {/* Staff-only UI primitives showcase — must precede the splat. */}
        <Route path="/admin/primitives" element={<AdminPrimitivesPage />} />
        <Route path="/admin/*" element={<AdminPage />} />
      </Route>

      {/* Operations Portal Routes */}
      <Route element={
        <ProtectedRoute allowedRoles={['admin']}>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route path="/ops/*" element={<OperationsPage />} />
      </Route>

      {/* Shared Settings Route */}
      <Route element={
        <ProtectedRoute>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/subscription" element={<SubscriptionPage />} />
        <Route path="/founders-circle" element={<FoundersCirclePage />} />
        <Route path="/security-settings" element={<SecuritySettingsPage />} />
        <Route path="/support" element={<SupportChatPage />} />
        <Route path="/debug/offline" element={<OfflineDebugPage />} />
      </Route>

      {/* Default Redirect */}
      <Route path="/" element={<RootRoute />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </Suspense>
    </RouteErrorBoundary>
  );
}

function App() {
  // Ensure WebView extends behind the status bar on native iOS.
  // With contentInset:'never' in capacitor.config + this call, only our
  // CSS env(safe-area-inset-top) handles the notch — no double padding.
  useEffect(() => {
    if (!isNative) return;
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      StatusBar.setOverlaysWebView({ overlay: true });
      StatusBar.setStyle({ style: Style.Dark });
    }).catch(() => {});
  }, []);

  // Initialize Capgo live updates and native optimizations
  useEffect(() => {
    // Initialize global error reporter
    initErrorReporter();

    // Prune synced offline outbox + expired image blobs and surface
    // storage-pressure events when IndexedDB usage exceeds 80% of
    // the device quota. Runs once on boot (cheap when nothing to
    // prune) so a long-lived PWA install can't silently fill the
    // per-origin storage cap.
    import('./offline/quotaGuard')
      .then(({ runQuotaGuard }) => runQuotaGuard())
      .catch(() => { /* offline module load failed — non-fatal */ });

    // Check for platform updates (web only — safe, silent, no crashes)
    if (!isNative) {
      const timer = setTimeout(() => checkForUpdates(), 5000);
      return () => clearTimeout(timer);
    }

    if (isNative) {
      CapacitorUpdater.notifyAppReady();
      document.body.classList.add('native-app');

      // Handle background/foreground transitions
      import('@capacitor/app').then(({ App: CapApp }) => {
        CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            // Returning to foreground — invalidate stale caches
            import('./utils/apiCache').then(({ clearCache }) => clearCache());
          } else {
            // Going to background — free memory
            import('./utils/apiCache').then(({ clearCache }) => clearCache());
            import('./utils/blobCache').then(({ clearBlobCache }) => clearBlobCache());
          }
        });

        // Listen for low memory warnings (iOS fires this before killing the app)
        CapApp.addListener('backButton', () => {
          // Android back button — no-op for now
        });
      }).catch(() => {});
    }
  }, []);

  return (
    <ForceUpdateGate>
    <ThemeProvider>
      <AuthProvider>
        <PartnerHeadBranding />
        <SectionLockProvider>
        <BrowserRouter>
          <NetworkStatusBanner />
          <PendingSyncChip />
          <NotificationContainer />
          <OfflineSyncProgress />
          <PendingUploadsIndicator />
          <AmberAlertProvider />
          <UsernameReviewModal />
          <AppRoutes />
          <ShareHandler />
          {/* Global PDF preview modal — listens for `carryon:open-pdf-preview`
              CustomEvent so any caller can pop the preview overlay without
              navigating away (instant back, no boot-splash flash). */}
          <Suspense fallback={null}>
            <PdfPreviewModal />
          </Suspense>
          {/* Global PDF generation progress chip — persists across SPA
              navigation so a 30s xAI call survives the user wandering off
              to another page and back. */}
          <Suspense fallback={null}>
            <PdfJobChip />
          </Suspense>
          {/* PWA install prompt — captures beforeinstallprompt on
              install-capable browsers (Chrome / Edge / Brave / Samsung
              Internet). Self-gated against already-installed devices
              and respects a 14-day dismissal cooldown. iOS Safari is
              handled separately by IOSAddToHomeSheet. */}
          <Suspense fallback={null}>
            <PWAInstallPrompt />
          </Suspense>
        </BrowserRouter>
        <SpeedInsights />
        </SectionLockProvider>
      </AuthProvider>
    </ThemeProvider>
    </ForceUpdateGate>
  );
}

export default App;
