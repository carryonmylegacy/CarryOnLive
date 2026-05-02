import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

// Core pages — eagerly loaded for fast navigation
import DashboardPage from './pages/DashboardPage';
import VaultPage from './pages/VaultPage';
import MessagesPage from './pages/MessagesPage';
import BeneficiariesPage from './pages/BeneficiariesPage';
import DigitalWalletPage from './pages/DigitalWalletPage';

// Lazy-loaded pages — only downloaded when navigated to
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
const FoundersCirclePage = lazy(() => import('./pages/FoundersCirclePage'));
const OperationsPage = lazy(() => import('./pages/OperationsPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));

import TransitionGate from './components/TransitionGate';

// Beneficiary Pages
const BeneficiaryHubPage = lazy(() => import('./pages/beneficiary/BeneficiaryHubPage'));
const PreTransitionPage = lazy(() => import('./pages/beneficiary/PreTransitionPage'));
const BeneficiaryDashboardPage = lazy(() => import('./pages/beneficiary/BeneficiaryDashboardPage'));
const BeneficiaryVaultPage = lazy(() => import('./pages/beneficiary/BeneficiaryVaultPage'));
const BeneficiaryMessagesPage = lazy(() => import('./pages/beneficiary/BeneficiaryMessagesPage'));
const BeneficiaryChecklistPage = lazy(() => import('./pages/beneficiary/BeneficiaryChecklistPage'));
const BeneficiaryGuardianPage = lazy(() => import('./pages/beneficiary/BeneficiaryGuardianPage'));
const MilestoneReportPage = lazy(() => import('./pages/beneficiary/MilestoneReportPage'));
const UploadCertificatePage = lazy(() => import('./pages/beneficiary/UploadCertificatePage'));
const CondolencePage = lazy(() => import('./pages/beneficiary/CondolencePage'));
const BeneficiarySettingsPage = lazy(() => import('./pages/beneficiary/BeneficiarySettingsPage'));
const BeneficiaryFinancialPage = lazy(() => import('./pages/beneficiary/BeneficiaryFinancialPage'));

const CreateEstatePage = lazy(() => import('./pages/CreateEstatePage'));

const GetStartedPage = lazy(() => import('./pages/GetStartedPage'));

const AboutPage = lazy(() => import('./pages/AboutPage'));
const FounderAboutPage = lazy(() => import('./pages/FounderAboutPage'));

const HomePage = lazy(() => import('./pages/HomePage'));
const VoicesPage = lazy(() => import('./pages/VoicesPage'));
const SecurityPage = lazy(() => import('./pages/SecurityPage'));
const WindDownPromisePage = lazy(() => import('./pages/WindDownPromisePage'));

const SharedPlanPage = lazy(() => import('./pages/SharedPlanPage'));

const SpeakWithUsPage = lazy(() => import('./pages/SpeakWithUsPage'));
const SharePage = lazy(() => import('./pages/SharePage'));

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
  state = { hasError: false, errorPath: null, errorKind: null };
  static getDerivedStateFromError(error) {
    // Detect "chunk failed to load" errors — these happen when the user
    // navigates to a lazy-loaded route whose JS bundle isn't in the SW
    // cache and the device is offline. They need a friendlier message.
    const msg = String(error?.message || error || '');
    const name = String(error?.name || '');
    const isChunk = /loading chunk \d+ failed|failed to fetch dynamically imported module|import.*(failed|error)|script error/i.test(msg)
      || name === 'ChunkLoadError';
    return { hasError: true, errorKind: isChunk ? 'chunk' : 'generic' };
  }
  componentDidCatch(error, info) {
    this.setState({ errorPath: typeof window !== 'undefined' ? window.location.pathname : null });
    // Don't spam Sentry with offline chunk-load failures — those are
    // an environmental condition, not a real bug.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (!(offline && this.state.errorKind === 'chunk')) {
      reportError(error, info?.componentStack ? `ErrorBoundary:${info.componentStack.split('\n')[1]?.trim()}` : 'ErrorBoundary');
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
    window.addEventListener('pushstate', this._onPop);
    window.addEventListener('online', this._onOnline);
    // Patch history.pushState/replaceState once so React Router navigations also clear.
    if (!window.__carryon_history_patched) {
      const fire = () => window.dispatchEvent(new Event('pushstate'));
      const push = window.history.pushState;
      const replace = window.history.replaceState;
      window.history.pushState = function (...args) { push.apply(this, args); fire(); };
      window.history.replaceState = function (...args) { replace.apply(this, args); fire(); };
      window.__carryon_history_patched = true;
    }
  }
  componentWillUnmount() {
    window.removeEventListener('popstate', this._onPop);
    window.removeEventListener('pushstate', this._onPop);
    window.removeEventListener('online', this._onOnline);
  }
  handleRetry = () => {
    this.setState({ hasError: false, errorPath: null, errorKind: null });
  };
  render() {
    if (this.state.hasError) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const isOfflineChunk = this.state.errorKind === 'chunk' && offline;
      // The red "You're offline" banner at the top already communicates
      // the state — so when this is clearly an offline-chunk issue, show
      // an honest, reassuring message instead of the scary generic one.
      const title = isOfflineChunk ? 'This page needs a connection the first time' : 'Something went wrong';
      const subtitle = isOfflineChunk
        ? "We couldn't load this page offline because you haven't opened it before. Pick another page, or reconnect and try again — it'll work everywhere from then on."
        : null;
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg, #0F1629)' }}>
          <div className="text-center p-6 max-w-md">
            <p className="text-white text-lg font-bold mb-2" data-testid="error-boundary-title">{title}</p>
            {subtitle && (
              <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.7)' }} data-testid="error-boundary-offline-subtitle">{subtitle}</p>
            )}
            <div className="flex gap-2 justify-center">
              <button onClick={this.handleRetry} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#d4af37', color: '#080e1a' }} data-testid="error-boundary-retry">
                Try again
              </button>
              {/* Hide the Reload button when offline — reloading while
                  disconnected re-mounts the whole app from the SW shell
                  cache, which rebuilds auth/role context from scratch
                  and can land the user on the default Beneficiary
                  Portal ("Welcome back, there! 0 benefactor estates")
                  even when they were signed in as the benefactor/owner.
                  Try-again without reloading keeps the current session
                  and avoids the ghost-portal jump. */}
              {!offline && (
                <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }} data-testid="error-boundary-reload">
                  Reload
                </button>
              )}
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
      return <Navigate to="/beneficiary" replace />;
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
      return <Navigate to="/beneficiary" replace />;
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
      return <Navigate to="/beneficiary" replace />;
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
      <Route path="/home" element={<HomePage />} />
      <Route path="/voices" element={<VoicesPage />} />
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

      {/* Beneficiary Routes */}
      <Route element={
        <ProtectedRoute allowedRoles={['beneficiary']}>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route path="/beneficiary" element={<BeneficiaryHubPage />} />
        <Route path="/beneficiary/pre" element={<PreTransitionPage />} />
        <Route path="/beneficiary/dashboard" element={<TransitionGate><BeneficiaryDashboardPage /></TransitionGate>} />
        <Route path="/beneficiary/vault" element={<TransitionGate section="vault" allowPreTransition><BeneficiaryVaultPage /></TransitionGate>} />
        <Route path="/beneficiary/messages" element={<TransitionGate section="messages"><BeneficiaryMessagesPage /></TransitionGate>} />
        <Route path="/beneficiary/checklist" element={<TransitionGate section="checklist"><BeneficiaryChecklistPage /></TransitionGate>} />
        <Route path="/beneficiary/guardian" element={<TransitionGate section="guardian"><BeneficiaryGuardianPage /></TransitionGate>} />
        <Route path="/beneficiary/milestone" element={<TransitionGate><MilestoneReportPage /></TransitionGate>} />
        <Route path="/beneficiary/settings" element={<BeneficiarySettingsPage />} />
        <Route path="/beneficiary/subscription" element={<SubscriptionPage />} />
        <Route path="/beneficiary/upload-certificate" element={<UploadCertificatePage />} />
        <Route path="/beneficiary/condolence" element={<CondolencePage />} />
        <Route path="/beneficiary/estate-chat" element={<FeatureGate><EstateChatPage /></FeatureGate>} />
        <Route path="/beneficiary/connected-protocol" element={<FeatureGate><BeneficiaryCCPPage /></FeatureGate>} />
        <Route path="/beneficiary/financial" element={<FeatureGate><BeneficiaryFinancialPage /></FeatureGate>} />
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
        </BrowserRouter>
        <SpeedInsights />
        </SectionLockProvider>
      </AuthProvider>
    </ThemeProvider>
    </ForceUpdateGate>
  );
}

export default App;
