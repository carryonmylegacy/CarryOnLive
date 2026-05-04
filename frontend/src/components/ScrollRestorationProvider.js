import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useScrollRestoration } from '../hooks/useScrollRestoration';

/**
 * <ScrollRestorationProvider />
 *
 * Mounted once inside the routed area (App.js, after BrowserRouter
 * but inside Suspense). Watches `useLocation()` and on every pathname
 * change:
 *   1. SAVES the current scroll offset against the OUTGOING pathname.
 *   2. RESTORES the saved offset for the INCOMING pathname (or 0).
 *
 * Also debounces a save on every `scroll` event so even if the user
 * is mid-page when the tab is closed (or the iOS PWA is suspended)
 * we capture their last known position.
 *
 * Honors the `Remember scroll position` user pref — when OFF, both
 * save and restore are no-ops, so the rest of the app behaves like
 * stock React Router (scroll-to-top semantics from <ScrollToTop />
 * elsewhere stay intact).
 *
 * Renders nothing.
 */
export default function ScrollRestorationProvider() {
  const location = useLocation();
  const { enabled, saveCurrent, restore, debounceMs } = useScrollRestoration();
  const prevPathRef = useRef(location.pathname);
  const debounceRef = useRef(null);

  // Disable the browser's built-in scroll restoration so it doesn't
  // race with ours — manual mode lets us be the single source of
  // truth for scroll offsets across SPA routes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prev = window.history.scrollRestoration;
    try {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = enabled ? 'manual' : 'auto';
      }
    } catch { /* not supported — ignore */ }
    return () => {
      try {
        if ('scrollRestoration' in window.history) {
          window.history.scrollRestoration = prev;
        }
      } catch { /* ignore */ }
    };
  }, [enabled]);

  // Save outgoing path's offset, then restore incoming path's offset
  // on every navigation.
  useEffect(() => {
    const incoming = location.pathname;
    const outgoing = prevPathRef.current;
    if (outgoing && outgoing !== incoming) {
      saveCurrent(outgoing);
    }
    prevPathRef.current = incoming;
    restore(incoming, location.hash);
  }, [location.pathname, location.hash, saveCurrent, restore]);

  // Debounced save while the user scrolls. We attach to BOTH the
  // window AND the OverlayScrollbars viewport (the real scroll
  // container in DashboardLayout) — whichever is moving for the
  // current view will fire.
  useEffect(() => {
    if (!enabled) return undefined;
    const onScroll = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveCurrent(location.pathname);
      }, debounceMs);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    let viewport = null;
    // The viewport may not exist immediately (lazy-loaded route) — poll
    // briefly until it shows up.
    let pollId = null;
    let pollAttempts = 0;
    const attach = () => {
      viewport = document.querySelector('.main-content [data-overlayscrollbars-viewport]');
      if (viewport) {
        viewport.addEventListener('scroll', onScroll, { passive: true });
        return true;
      }
      return false;
    };
    if (!attach()) {
      pollId = setInterval(() => {
        pollAttempts += 1;
        if (attach() || pollAttempts > 20) clearInterval(pollId);
      }, 250);
    }
    // Also save on visibility change / pagehide so iOS PWA suspends
    // capture the most recent offset.
    const onHide = () => saveCurrent(location.pathname);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (viewport) viewport.removeEventListener('scroll', onScroll);
      if (pollId) clearInterval(pollId);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, location.pathname, saveCurrent, debounceMs]);

  return null;
}
