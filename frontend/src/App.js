import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SectionLockProvider } from './components/security/SectionLock';
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
import { Loader2 } from 'lucide-react';

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
const EditBeneficiaryPage = lazy(() => import('./pages/EditBeneficiaryPage'));
const EditMilestoneMessagePage = lazy(() => import('./pages/EditMilestoneMessagePage'));
const GuardianPage = lazy(() => import('./pages/GuardianPage'));
const ChecklistPage = lazy(() => import('./pages/ChecklistPage'));
const TrusteePage = lazy(() => import('./pages/TrusteePage'));
const TransitionPage = lazy(() => import('./pages/TransitionPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const SupportChatPage = lazy(() => import('./pages/SupportChatPage'));
const SecuritySettingsPage = lazy(() => import('./pages/SecuritySettingsPage'));
const LegacyTimelinePage = lazy(() => import('./pages/LegacyTimelinePage'));
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'));
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

const AboutPage = lazy(() => import('./pages/AboutPage'));

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
  // Skip paywall for admins, beneficiaries (they don't pay), and during beta mode
  const needsSubscription = subscriptionStatus?.needs_subscription === true
    && subscriptionStatus?.trial?.trial_active !== true
    && user?.role !== 'admin'
    && user?.role !== 'beneficiary'
    && !subscriptionStatus?.beta_mode
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

      {/* Invitation Accept Route - Public */}
      <Route path="/accept-invitation/:token" element={<AcceptInvitationPage />} />

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
        <Route path="/beneficiaries/:beneficiaryId/edit" element={<EditBeneficiaryPage />} />
        <Route path="/guardian" element={<GuardianPage />} />
        <Route path="/checklist" element={<ChecklistPage />} />
        <Route path="/trustee" element={<TrusteePage />} />
        <Route path="/transition" element={<TransitionPage />} />
        <Route path="/digital-wallet" element={<DigitalWalletPage />} />
        <Route path="/timeline" element={<LegacyTimelinePage />} />
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
      </Route>

      {/* Beneficiary Full-Screen Routes (no sidebar) */}
      <Route path="/beneficiary/upload-certificate" element={
        <ProtectedRoute allowedRoles={['beneficiary']}><UploadCertificatePage /></ProtectedRoute>
      } />
      <Route path="/beneficiary/condolence" element={
        <ProtectedRoute allowedRoles={['beneficiary']}><CondolencePage /></ProtectedRoute>
      } />

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
          <AppRoutes />
          <ShareHandler />
        </BrowserRouter>
        </SectionLockProvider>
      </AuthProvider>
    </ThemeProvider>
    </ForceUpdateGate>
  );
}

export default App;
