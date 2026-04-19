// CarryOn™ — AppScroller
// ============================================================================
// Mounts OverlayScrollbars on the `.main-content` element (authenticated
// layout only). This is the scroll container on mobile, where the user
// experiences the long pages (Settings, Vault, Messages, Dashboard, etc.).
//
// On desktop, `.main-content` is min-height but does not internally scroll —
// the window scrolls. In that case OverlayScrollbars is inert here and the
// existing CSS `::-webkit-scrollbar` gold styling on the window still applies.
//
// Marketing/public pages (home, login, signup) are OUTSIDE DashboardLayout
// and never receive this treatment — they keep native scroll.
//
// Sets `html.os-dragging` during thumb drag so CSS can disable text selection.

import { useEffect } from 'react';
import { OverlayScrollbars } from 'overlayscrollbars';
import 'overlayscrollbars/overlayscrollbars.css';
import '../styles/overlay-scrollbars.css';

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Attaches OverlayScrollbars to an element. Returns the instance so callers
 * can dispose on unmount.
 */
function attachOverlayScrollbars(target) {
  if (!target || OverlayScrollbars(target)) return null;
  return OverlayScrollbars(
    { target, cancel: { nativeScrollbarsOverlaid: false, body: false } },
    {
      scrollbars: {
        theme: 'os-theme-carryon-gold',
        visibility: 'auto',
        autoHide: 'scroll',
        autoHideDelay: prefersReducedMotion() ? 0 : 1200,
        autoHideSuspend: false,
        dragScroll: true,
        clickScroll: false,
        pointers: ['mouse', 'touch', 'pen'],
      },
      overflow: { x: 'hidden', y: 'scroll' },
    }
  );
}

const AppScroller = ({ enabled = true }) => {
  useEffect(() => {
    if (!enabled) return;

    let instance = null;
    let observer = null;
    const handleDragStart = () => document.documentElement.classList.add('os-dragging');
    const handleDragEnd = () => document.documentElement.classList.remove('os-dragging');

    const wireDragHandlers = () => {
      if (!instance) return;
      const els = instance.elements();
      const handles = [
        els.scrollbarHorizontal?.handle,
        els.scrollbarVertical?.handle,
      ].filter(Boolean);
      handles.forEach((h) => h.addEventListener('pointerdown', handleDragStart));
    };

    const init = () => {
      const target = document.querySelector('.main-content');
      if (!target) return false;
      instance = attachOverlayScrollbars(target);
      if (instance) wireDragHandlers();
      return !!instance;
    };

    // Try to init immediately; if .main-content hasn't mounted yet
    // (lazy routes, auth gate), observe DOM until it appears.
    if (!init()) {
      observer = new MutationObserver(() => {
        if (init()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener('pointerup', handleDragEnd);
    window.addEventListener('pointercancel', handleDragEnd);
    window.addEventListener('blur', handleDragEnd);

    return () => {
      observer?.disconnect();
      window.removeEventListener('pointerup', handleDragEnd);
      window.removeEventListener('pointercancel', handleDragEnd);
      window.removeEventListener('blur', handleDragEnd);
      instance?.destroy();
      document.documentElement.classList.remove('os-dragging');
    };
  }, [enabled]);

  return null;
};

export default AppScroller;

