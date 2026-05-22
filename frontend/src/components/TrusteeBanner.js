import React, { useLayoutEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldAlert } from 'lucide-react';

/**
 * TrusteeBanner — persistent, high-contrast banner that renders on EVERY
 * page (including settings) whenever the active session was created via
 * a trustee credential.
 *
 * Layout integration:
 *  • Banner is `position: fixed` at the very top of the viewport.
 *  • Its measured height is published to two CSS variables:
 *      `--cy-trustee-banner-h` — the trustee banner's height by itself.
 *      `--cy-offline-banner-h` — additively combined with any existing
 *         offline-banner height, because the rest of the layout (sidebar,
 *         mobile header, dropdowns) already steps down by this var.
 *    When the banner unmounts we restore the offline var to whatever the
 *    NetworkStatusBanner had set (or 0px).
 *  • z-index is 40 — below the notification dropdown (z-index ≥ 50) so
 *    dropdowns layer above the banner, never the reverse.
 */
const TRUSTEE_Z = 40;

const TrusteeBanner = () => {
  const { user } = useAuth();
  const ref = useRef(null);
  const active = !!user?.trustee_mode;

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!active) {
      root.style.setProperty('--cy-trustee-banner-h', '0px');
      return undefined;
    }
    // Snapshot whatever the offline banner had set, so we can additively
    // combine + restore cleanly on unmount.
    const priorOffline = root.style.getPropertyValue('--cy-offline-banner-h') || '0px';
    const priorOfflinePx = priorOffline.endsWith('px') ? parseFloat(priorOffline) : 0;
    const priorHeaderSafeTop = root.style.getPropertyValue('--cy-header-safe-top') || 'env(safe-area-inset-top, 0px)';

    // While the trustee banner owns the top of the screen it already
    // absorbs the iOS status-bar inset (see `paddingTop` below) — zero
    // out the header's own safe-area padding so the two don't stack and
    // leave a dead gap below the banner. Mirrors NetworkStatusBanner.
    root.style.setProperty('--cy-header-safe-top', '0px');

    const measure = () => {
      const h = ref.current?.offsetHeight || 0;
      root.style.setProperty('--cy-trustee-banner-h', `${h}px`);
      // Bump the offline-banner-h by the trustee height so existing
      // layout that already steps down for offline ALSO steps down for
      // trustee — without us having to touch every CSS rule.
      root.style.setProperty('--cy-offline-banner-h', `${priorOfflinePx + h}px`);
    };
    measure();
    const t = setTimeout(measure, 60);
    let ro = null;
    try {
      if (typeof ResizeObserver !== 'undefined' && ref.current) {
        ro = new ResizeObserver(measure);
        ro.observe(ref.current);
      }
    } catch { /* fall back to measure-on-render */ }
    return () => {
      clearTimeout(t);
      if (ro) ro.disconnect();
      root.style.setProperty('--cy-trustee-banner-h', '0px');
      // Restore the offline var + header safe-area var to their prior values.
      root.style.setProperty('--cy-offline-banner-h', priorOffline);
      root.style.setProperty('--cy-header-safe-top', priorHeaderSafeTop);
    };
  }, [active]);

  if (!active) return null;

  const acting = user.name || 'the benefactor';
  const trusteeName = user.trustee_display_name || 'Trustee';

  return (
    <div
      ref={ref}
      data-testid="trustee-mode-banner"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: TRUSTEE_Z,
        background: 'linear-gradient(90deg, #b45309 0%, #d97706 50%, #b45309 100%)',
        color: '#fff7ed',
        borderBottom: '2px solid #92400e',
        padding: '8px 16px 8px',
        textAlign: 'center',
        fontWeight: 700,
        letterSpacing: '0.02em',
        boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
        paddingTop: 'calc(2px + env(safe-area-inset-top, 0px))',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
        <ShieldAlert
          size={22}
          strokeWidth={2.5}
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: '#fff7ed',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
          }}
        />
        TRUSTEE MODE — {trusteeName} acting on behalf of {acting}
      </span>
    </div>
  );
};

export default TrusteeBanner;
