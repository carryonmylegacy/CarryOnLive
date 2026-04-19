import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import 'overlayscrollbars/overlayscrollbars.css';
import '../../styles/overlay-scrollbars.css';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { useAuth } from '../../contexts/AuthContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../PullToRefreshIndicator';
import { haptics } from '../../utils/haptics';
import BetaFeedbackButton from '../BetaFeedbackButton';
import BetaWelcomeModal from '../BetaWelcomeModal';

const GuardianPage = lazy(() => import('../../pages/GuardianPage'));

// OverlayScrollbars options — iOS-like overlay with brand theme.
const OS_OPTIONS = {
  scrollbars: {
    theme: 'os-theme-carryon-gold',
    visibility: 'auto',
    autoHide: 'scroll',
    autoHideDelay: 1200,
    autoHideSuspend: false,
    dragScroll: true,
    clickScroll: false,
    pointers: ['mouse', 'touch', 'pen'],
  },
  overflow: { x: 'hidden', y: 'scroll' },
};

// Threshold: hide the scrollbar when content doesn't exceed this multiple
// of the viewport height. 1.5 means "if the page is less than 1.5 screens
// tall, don't bother showing a scrollbar." Scales automatically with any
// device size because it's relative to the viewport.
const RATIO_THRESHOLD = 1.5;

// Sets html.os-dragging while the user drags the thumb so CSS can
// globally disable text selection. Also toggles `data-ratio-low` on the
// host element when content is below the threshold.
const OS_EVENTS = {
  initialized: (instance) => {
    const els = instance.elements();
    const handles = [
      els.scrollbarHorizontal?.handle,
      els.scrollbarVertical?.handle,
    ].filter(Boolean);
    const onDown = () => document.documentElement.classList.add('os-dragging');
    const onUp = () => document.documentElement.classList.remove('os-dragging');
    handles.forEach((h) => h.addEventListener('pointerdown', onDown));
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);
  },
  updated: (instance) => {
    const host = instance.elements().host;
    const viewport = instance.elements().viewport;
    if (!host || !viewport) return;
    const visible = viewport.clientHeight || 1;
    const total = viewport.scrollHeight || 0;
    const ratio = total / visible;
    host.setAttribute('data-ratio-low', ratio < RATIO_THRESHOLD ? 'true' : 'false');
  },
};

const DashboardLayout = () => {
  const location = useLocation();
  const { user, subscriptionStatus, refreshUser } = useAuth();
  const isOnGuardian = location.pathname === '/guardian';
  const [guardianMounted, setGuardianMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('carryon_sidebar_collapsed') === 'true');
  const [betaAccepted, setBetaAccepted] = useState(true);

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
      
      {/* Main Content — wrapped in OverlayScrollbarsComponent for
          React-aware, iOS-like auto-hide scrollbars. `defer` avoids a
          flash during lazy route transitions. */}
      <OverlayScrollbarsComponent
        element="main"
        options={OS_OPTIONS}
        events={OS_EVENTS}
        defer
        id="main-content"
        className={`main-content ${sidebarCollapsed ? 'sb-collapsed' : ''}`}
        role="main"
        aria-label="Main content"
      >
        <Outlet />
      </OverlayScrollbarsComponent>

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
