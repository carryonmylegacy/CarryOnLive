import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Toaster } from './components/ui/sonner';

// Pages
import LoginPage from './pages/LoginPage';
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
import BeneficiaryVaultPage from './pages/beneficiary/BeneficiaryVaultPage';
import BeneficiaryMessagesPage from './pages/beneficiary/BeneficiaryMessagesPage';
import MilestoneReportPage from './pages/beneficiary/MilestoneReportPage';

// Layout
import DashboardLayout from './components/layout/DashboardLayout';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1120] flex items-center justify-center">
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
      <div className="min-h-screen bg-[#0b1120] flex items-center justify-center">
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
        <Route path="/beneficiary/vault" element={<BeneficiaryVaultPage />} />
        <Route path="/beneficiary/messages" element={<BeneficiaryMessagesPage />} />
        <Route path="/beneficiary/milestone" element={<MilestoneReportPage />} />
      </Route>

      {/* Admin Routes */}
      <Route element={
        <ProtectedRoute allowedRoles={['admin']}>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route path="/admin" element={<AdminPage />} />
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
        <BrowserRouter>
          <AppRoutes />
          <Toaster 
            position="top-right"
            toastOptions={{
              style: {
                background: '#0f1d35',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#f8fafc',
              },
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
