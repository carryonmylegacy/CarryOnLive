import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SectionLockProvider } from './components/security/SectionLock';
import { Toaster } from './components/ui/sonner';

// Pages
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import AcceptInvitationPage from './pages/AcceptInvitationPage';
import DashboardPage from './pages/DashboardPage';
import VaultPage from './pages/VaultPage';
import MessagesPage from './pages/MessagesPage';
import BeneficiariesPage from './pages/BeneficiariesPage';
import GuardianPage from './pages/GuardianPage';
import ChecklistPage from './pages/ChecklistPage';
import TrusteePage from './pages/TrusteePage';
import TransitionPage from './pages/TransitionPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';

// Beneficiary Pages
import BeneficiaryHubPage from './pages/beneficiary/BeneficiaryHubPage';
import PreTransitionPage from './pages/beneficiary/PreTransitionPage';
import BeneficiaryDashboardPage from './pages/beneficiary/BeneficiaryDashboardPage';
import BeneficiaryVaultPage from './pages/beneficiary/BeneficiaryVaultPage';
import BeneficiaryMessagesPage from './pages/beneficiary/BeneficiaryMessagesPage';
import BeneficiaryChecklistPage from './pages/beneficiary/BeneficiaryChecklistPage';
import BeneficiaryGuardianPage from './pages/beneficiary/BeneficiaryGuardianPage';
import MilestoneReportPage from './pages/beneficiary/MilestoneReportPage';
import UploadCertificatePage from './pages/beneficiary/UploadCertificatePage';
import CondolencePage from './pages/beneficiary/CondolencePage';
import BeneficiarySettingsPage from './pages/beneficiary/BeneficiarySettingsPage';

// Layout
import DashboardLayout from './components/layout/DashboardLayout';

import DevSwitcher from './components/dev/DevSwitcher';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading, isAuthenticated } = useAuth();

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
    // Redirect based on role
    if (user?.role === 'beneficiary') {
      return <Navigate to="/beneficiary" replace />;
    } else if (user?.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/dashboard" replace />;
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

function AppRoutes() {
  return (
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
      
      {/* Invitation Accept Route - Public */}
      <Route path="/accept-invitation/:token" element={<AcceptInvitationPage />} />

      {/* Benefactor Routes */}
      <Route element={
        <ProtectedRoute allowedRoles={['benefactor']}>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/vault" element={<VaultPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/beneficiaries" element={<BeneficiariesPage />} />
        <Route path="/guardian" element={<GuardianPage />} />
        <Route path="/checklist" element={<ChecklistPage />} />
        <Route path="/trustee" element={<TrusteePage />} />
        <Route path="/transition" element={<TransitionPage />} />
      </Route>

      {/* Beneficiary Routes */}
      <Route element={
        <ProtectedRoute allowedRoles={['beneficiary']}>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route path="/beneficiary" element={<BeneficiaryHubPage />} />
        <Route path="/beneficiary/pre" element={<PreTransitionPage />} />
        <Route path="/beneficiary/dashboard" element={<BeneficiaryDashboardPage />} />
        <Route path="/beneficiary/vault" element={<BeneficiaryVaultPage />} />
        <Route path="/beneficiary/messages" element={<BeneficiaryMessagesPage />} />
        <Route path="/beneficiary/checklist" element={<BeneficiaryChecklistPage />} />
        <Route path="/beneficiary/guardian" element={<BeneficiaryGuardianPage />} />
        <Route path="/beneficiary/milestone" element={<MilestoneReportPage />} />
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
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/transition" element={<AdminPage />} />
        <Route path="/admin/dts" element={<AdminPage />} />
        <Route path="/admin/certificates" element={<AdminPage />} />
      </Route>

      {/* Shared Settings Route */}
      <Route element={
        <ProtectedRoute>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Default Redirect */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SectionLockProvider>
        <BrowserRouter>
          <AppRoutes />
          <DevSwitcher />
          <Toaster 
            position="top-right"
            toastOptions={{
              style: {
                background: '#141C33',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#f8fafc',
              },
            }}
          />
        </BrowserRouter>
        </SectionLockProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
