import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import 'overlayscrollbars/overlayscrollbars.css';
import '../../styles/overlay-scrollbars.css';
import attachDragMomentum from '../../utils/scrollbarMomentum';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import BackButton from './BackButton';
import { useAuth } from '../../contexts/AuthContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../PullToRefreshIndicator';
import { haptics } from '../../utils/haptics';
import BetaFeedbackButton from '../BetaFeedbackButton';
import BetaWelcomeModal from '../BetaWelcomeModal';
import { useLocalStorageBoolean } from '../../hooks/useLocalStorageBoolean';
import FeatureGate from '../FeatureGate';

const GuardianPage = lazy(() => import('../../pages/GuardianPage'));

// OverlayScrollbars options — iOS-like overlay with brand theme.
const OS_OPTIONS = {
  scrollbars: {
    theme: 'os-theme-carryon-gold',
    visibility: 'auto',
    autoHide: 'scroll',
    autoHideDelay: 1200,
    // `true` = bar stays hidden on mount until the user's first scroll.
    // Without this, the bar appears on page load for any overflowing page,
    // which violates the "only appear while scrolling" UX rule.
    autoHideSuspend: true,
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
    attachDragMomentum(instance);

    // Safety net: also recompute ratio on scroll events, not just on
    // OS's internal ResizeObserver. Catches async content-load cases
    // where `updated` may not fire (e.g., late-loaded images).
    const recomputeRatio = () => {
      const h = instance.elements().host;
      const v = instance.elements().viewport;
      if (!h || !v) return;
      const visible = v.clientHeight || 1;
      const total = v.scrollHeight || 0;
      h.setAttribute('data-ratio-low', (total / visible) < RATIO_THRESHOLD ? 'true' : 'false');
    };
    els.viewport?.addEventListener('scroll', recomputeRatio, { passive: true });
    [250, 750, 2000].forEach((ms) => setTimeout(recomputeRatio, ms));
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
  // Mirror of the BackButton's own `HIDDEN_EXACT` set — used to
  // toggle the `with-back-button` class on `main-content` so the
  // global CSS rule that bumps each page's first content row right
  // only fires on pages that actually render the chip. Kept in
  // sync manually because importing the set from BackButton would
  // tie layout startup to its lazy chunk.
  const BACK_HIDDEN = new Set([
    '/dashboard', '/admin', '/ops', '/beneficiary',
    '/beneficiary/dashboard', '/beneficiary/hub',
    '/onboarding', '/transition',
  ]);
  const showUniversalBack = !BACK_HIDDEN.has(location.pathname);
  const [guardianMounted, setGuardianMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('carryon_sidebar_collapsed') === 'true');
  const [betaAccepted, setBetaAccepted] = useState(true);
  // Reactive mirror of `localStorage.hide_beta_bug_icon`. Backed by
  // `useSyncExternalStore` via useLocalStorageBoolean — guarantees this
  // component re-renders the instant the Settings toggle writes a new
  // value, even if both live in the same tab. Replaces a previous manual
  // CustomEvent + useState setup that was brittle under remounts.
  const [betaIconHidden] = useLocalStorageBoolean('hide_beta_bug_icon');

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

  // Reset scroll to top on every route change so pages like Settings/Vault
  // don't preserve prior scroll position across visits. Targets the
  // OverlayScrollbars viewport (the real scroll container on mobile) and
  // falls back to window scroll on desktop. `smooth` ensures it feels
  // natural instead of a hard jump.
  // Scroll to top on every route change inside DashboardLayout —
  // unless the user has opted into the "Remember scroll position"
  // preference, in which case <ScrollRestorationProvider /> takes
  // over and restores the saved offset for the new route.
  //
  // EXCEPTION: tab navigation inside the same admin/ops portal
  // section (e.g. /admin/users → /admin/transition) is logically
  // a sub-tab change, not a new page. The user explicitly asked
  // (May 5, 2026) for the scroll position to be preserved when
  // tapping between tabs in the Founder Portal so the view
  // doesn't slam back to the top. We detect "same section"
  // navigation here and skip the auto-reset; useScrollLock then
  // handles freezing the position during the React render swap.
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    // Default-ON semantics (May 21 2026): the scroll-restoration pref
    // is treated as ON unless the user has explicitly stored '0'. This
    // mirrors `isScrollRestorationEnabled()` in useScrollRestoration.js
    // — keep both in sync. Anything other than the literal string '0'
    // (including a null / missing key) means the feature is active and
    // `<ScrollRestorationProvider />` is the authority on scroll.
    let pref = true;
    try { pref = localStorage.getItem('carryon_remember_scroll') !== '0'; } catch { /* ignore */ }
    const prev = prevPathRef.current;
    prevPathRef.current = location.pathname;
    const isSameAdminSection = (prev.startsWith('/admin/') && location.pathname.startsWith('/admin/'))
      || (prev.startsWith('/ops/') && location.pathname.startsWith('/ops/'));
    if (pref || isSameAdminSection) return undefined;
    const scrollToTop = () => {
      const viewport = document.querySelector('.main-content [data-overlayscrollbars-viewport]');
      if (viewport) {
        viewport.scrollTo({ top: 0, behavior: 'auto' });
      }
      // Desktop fallback where window scrolls instead of main-content
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    // Run after the next paint so lazy route content has mounted
    const id = requestAnimationFrame(scrollToTop);
    return () => cancelAnimationFrame(id);
  }, [location.pathname]);

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
        className={`main-content ${sidebarCollapsed ? 'sb-collapsed' : ''} ${showUniversalBack ? 'with-back-button' : ''}`}
        role="main"
        aria-label="Main content"
      >
        <BackButton />
        <Outlet />
      </OverlayScrollbarsComponent>

      {/* Persistent Guardian — stays mounted after first visit so chat state survives navigation */}
      {guardianMounted && (
        <div style={{ display: isOnGuardian ? 'block' : 'none' }}>
          <Suspense fallback={null}>
            {isOnGuardian ? (
              <FeatureGate><GuardianPage /></FeatureGate>
            ) : (
              <GuardianPage />
            )}
          </Suspense>
        </div>
      )}

      {/* Beta Tester: Welcome Modal (one-time) */}
      {isBetaTester && !betaAccepted && (
        <BetaWelcomeModal onAccepted={() => { setBetaAccepted(true); refreshUser(); }} />
      )}

      {/* Beta Tester: Floating Feedback Button (can be hidden via settings) */}
      {isBetaTester && betaAccepted && !betaIconHidden && <BetaFeedbackButton />}
    </div>
  );
};

export default DashboardLayout;
