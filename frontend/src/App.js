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
import { AmberAlertProvider } from './components/AmberAlert';
import { initErrorReporter, reportError } from './utils/errorReporter';
import { checkForUpdates } from './utils/versionCheck';
import { isFeatureEnabled } from './utils/featureGates';
import { Loader2 } from 'lucide-react';

const CARRYON_BUILD = '2026-03-10T20:30:00Z-fix-portal-paywall';
if (typeof window !== 'undefined') {
  window.__CARRYON_BUILD = CARRYON_BUILD;
  console.log(`%c[CarryOn] Build: ${CARRYON_BUILD}`, 'color: #d4af37; font-weight: bold');
}

// Eagerly loaded (needed immediately)
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';

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
const TrusteePage = lazy(() => import('./pages/TrusteePage'));
const FFNPage = lazy(() => import('./pages/FFNPage'));
const EstateChatPage = lazy(() => import('./pages/EstateChatPage'));
const ConnectedProtocolPage = lazy(() => import('./pages/ConnectedProtocolPage'));
const FinancialPortalPage = lazy(() => import('./pages/FinancialPortalPage'));
const BeneficiaryCCPPage = lazy(() => import('./pages/beneficiary/BeneficiaryCCPPage'));
const TransitionPage = lazy(() => import('./pages/TransitionPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
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

const SharedPlanPage = lazy(() => import('./pages/SharedPlanPage'));

const SpeakWithUsPage = lazy(() => import('./pages/SpeakWithUsPage'));

import UsernameReviewModal from './components/UsernameReviewModal';

// Loading fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
    <Loader2 className="w-8 h-8 text-[#d4af37] animate-spin" />
  </div>
);

// Error boundary for lazy-loaded routes — reports to backend
class RouteErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) {
    reportError(error, info?.componentStack ? `ErrorBoundary:${info.componentStack.split('\n')[1]?.trim()}` : 'ErrorBoundary');
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg, #0F1629)' }}>
          <div className="text-center p-6">
            <p className="text-white text-lg font-bold mb-2">Something went wrong</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#d4af37', color: '#080e1a' }}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading, isAuthenticated, subscriptionStatus, enabledFeatures } = useAuth();
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

  // Feature gate enforcement — redirect to dashboard if the route's feature is gated
  if (user?.role !== 'admin' && user?.role !== 'operator') {
    if (!isFeatureEnabled(currentPath, enabledFeatures)) {
      return <Navigate to="/dashboard" replace />;
    }
  }

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

function AppRoutes() {
  return (
    <RouteErrorBoundary>
    <Suspense fallback={<PageLoader />}>
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
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/vault" element={<VaultPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:messageId/edit" element={<EditMilestoneMessagePage />} />
        <Route path="/beneficiaries" element={<BeneficiariesPage />} />
        {/* Beneficiary edit now handled by SlidePanel */}
        <Route path="/guardian" element={null} />
        <Route path="/checklist" element={<ChecklistPage />} />
        <Route path="/trustee" element={<TrusteePage />} />
        <Route path="/ffn" element={<FFNPage />} />
        <Route path="/transition" element={<TransitionPage />} />
        <Route path="/digital-wallet" element={<DigitalWalletPage />} />
        <Route path="/financial" element={<FinancialPortalPage />} />
        <Route path="/timeline" element={<LegacyTimelinePage />} />
        <Route path="/estate-chat" element={<EstateChatPage />} />
        <Route path="/connected-protocol" element={<ConnectedProtocolPage />} />
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
        <Route path="/beneficiary/estate-chat" element={<EstateChatPage />} />
        <Route path="/beneficiary/connected-protocol" element={<BeneficiaryCCPPage />} />
        <Route path="/beneficiary/financial" element={<BeneficiaryFinancialPage />} />
      </Route>

      {/* Admin Routes */}
      <Route element={
        <ProtectedRoute allowedRoles={['admin']}>
          <DashboardLayout />
        </ProtectedRoute>
      }>
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
      </Route>

      {/* Default Redirect */}
      <Route path="/" element={<Navigate to="/login" replace />} />
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
          <NotificationContainer />
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
