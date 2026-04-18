import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { useAuth } from '../../contexts/AuthContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../PullToRefreshIndicator';
import { haptics } from '../../utils/haptics';
import BetaFeedbackButton from '../BetaFeedbackButton';
import BetaWelcomeModal from '../BetaWelcomeModal';
import ScrollBar from '../ScrollBar';
import PageScrollBar from '../PageScrollBar';

const GuardianPage = lazy(() => import('../../pages/GuardianPage'));

const DashboardLayout = () => {
  const location = useLocation();
  const { user, subscriptionStatus, refreshUser } = useAuth();
  const isOnGuardian = location.pathname === '/guardian';
  const [guardianMounted, setGuardianMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('carryon_sidebar_collapsed') === 'true');
  const [betaAccepted, setBetaAccepted] = useState(true);
  const mainRef = useRef(null);

  // Check if user is a beta tester who hasn't accepted yet
  const isBetaTester = user?.is_beta_tester || subscriptionStatus?.is_beta_tester;
  const hasBetaAccepted = user?.beta_accepted || subscriptionStatus?.beta_accepted;

  useEffect(() => {
    if (isBetaTester && !hasBetaAccepted) {
      setBetaAccepted(false);
    } else {
      setBetaAccepted(true);
    }
  }, [isBetaTester, hasBetaAccepted]);

  useEffect(() => {
    if (isOnGuardian) setGuardianMounted(true);
  }, [isOnGuardian]);

  useEffect(() => {
    const onStorage = () => setSidebarCollapsed(localStorage.getItem('carryon_sidebar_collapsed') === 'true');
    window.addEventListener('storage', onStorage);
    // Also listen for custom event from same tab
    window.addEventListener('sidebar-toggle', onStorage);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('sidebar-toggle', onStorage); };
  }, []);

  const handleRefresh = useCallback(async () => {
    haptics.medium();
    // Dispatch a custom event so page components can react
    window.dispatchEvent(new CustomEvent('carryon-pull-refresh'));
    // Small delay so users feel the refresh
    await new Promise(r => setTimeout(r, 600));
    haptics.success();
  }, []);

  const { pullProgress, refreshing } = usePullToRefresh(handleRefresh);

  // iOS PWA: scroll focused input into view when virtual keyboard opens
  useEffect(() => {
    if (!window.visualViewport) return;
    const onResize = () => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100);
      }
    };
    window.visualViewport.addEventListener('resize', onResize);
    return () => window.visualViewport.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="app">
      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator pullProgress={pullProgress} refreshing={refreshing} />

      {/* Background decorations */}
      <div 
        className="floating-orb" 
        style={{
          top: '10%',
          left: '60%',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(59,123,247,0.06), transparent 70%)'
        }}
      />
      <div 
        className="floating-orb" 
        style={{
          top: '50%',
          right: '10%',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(224,173,43,0.04), transparent 70%)',
          animationDelay: '-10s'
        }}
      />
      
      {/* Desktop Sidebar */}
      <Sidebar />
      
      {/* Mobile Navigation */}
      <MobileNav />
      
      {/* Main Content */}
      <main
        ref={mainRef}
        id="main-content"
        className={`main-content ${sidebarCollapsed ? 'sb-collapsed' : ''}`}
        role="main"
        aria-label="Main content"
      >
        <Outlet />
        <PageScrollBar scrollRef={mainRef} />
      </main>

      {/* Persistent Guardian — stays mounted after first visit so chat state survives navigation */}
      {guardianMounted && (
        <div style={{ display: isOnGuardian ? 'block' : 'none' }}>
          <Suspense fallback={null}>
            <GuardianPage />
          </Suspense>
        </div>
      )}

      {/* Beta Tester: Welcome Modal (one-time) */}
      {isBetaTester && !betaAccepted && (
        <BetaWelcomeModal onAccepted={() => { setBetaAccepted(true); refreshUser(); }} />
      )}

      {/* Beta Tester: Floating Feedback Button (can be hidden via settings) */}
      {isBetaTester && betaAccepted && localStorage.getItem('hide_beta_bug_icon') !== 'true' && <BetaFeedbackButton />}
    </div>
  );
};

export default DashboardLayout;
