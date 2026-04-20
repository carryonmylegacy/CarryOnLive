import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { WifiOff, Wifi, Info } from 'lucide-react';

/**
 * CarryOn — Network Status Banner (Offline UX Polish)
 *
 * Shows an honest, reassuring message whenever the device goes offline.
 * Every time the user enters the app or loses signal, they see this
 * contract: "You can still create. We'll sync it later. Existing files
 * open when you reconnect."
 *
 * Two states:
 *   - Offline: full reassurance banner (taller, readable, non-dismissible).
 *   - Back online: brief "Back online" confirmation (auto-hides).
 *
 * Layout contract: the banner publishes its rendered height into the
 * `--cy-offline-banner-h` CSS variable on :root. The mobile header
 * (`.mobile-header`) and main content (`.main-content`) read this var
 * and shift down accordingly so the banner never occludes the logo /
 * hamburger / page body. When hidden, the var is set back to 0px.
 */
const NetworkStatusBanner = () => {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const bannerRef = useRef(null);

  useEffect(() => {
    const goOffline = () => {
      setOnline(false);
      setWasOffline(true);
      setShowReconnected(false);
      setExpanded(true);
    };
    const goOnline = () => {
      setOnline(true);
      if (wasOffline) {
        setShowReconnected(true);
        setTimeout(() => setShowReconnected(false), 3000);
      }
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [wasOffline]);

  // Push the rendered banner height into a CSS variable so the
  // mobile header + main content can shift out of the way. Runs on
  // every visibility / expanded-state change.
  const visible = !online || showReconnected;
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.setProperty('--cy-offline-banner-h', '0px');
      // Restore the header's own safe-area padding when the banner is gone.
      root.style.setProperty('--cy-header-safe-top', 'env(safe-area-inset-top, 0px)');
      return;
    }
    // While the banner owns the top of the screen it already absorbs the
    // iOS status bar inset — zero out the header's own safe-area padding
    // so the two don't stack and leave a dead gap below the banner.
    root.style.setProperty('--cy-header-safe-top', '0px');
    const measure = () => {
      const h = bannerRef.current?.offsetHeight || 0;
      root.style.setProperty('--cy-offline-banner-h', `${h}px`);
    };
    measure();
    // Re-measure after a tick in case fonts or safe-area insets resolved late.
    const t = setTimeout(measure, 60);
    let ro = null;
    try {
      if (typeof ResizeObserver !== 'undefined' && bannerRef.current) {
        ro = new ResizeObserver(measure);
        ro.observe(bannerRef.current);
      }
    } catch { /* ResizeObserver not supported — fall back to measure on re-render */ }
    return () => {
      clearTimeout(t);
      if (ro) ro.disconnect();
      root.style.setProperty('--cy-offline-banner-h', '0px');
      root.style.setProperty('--cy-header-safe-top', 'env(safe-area-inset-top, 0px)');
    };
  }, [visible, expanded]);

  if (online && !showReconnected) return null;

  // Back-online confirmation — thin green bar, same as before.
  if (online && showReconnected) {
    return (
      <div
        ref={bannerRef}
        className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          background: '#059669',
          color: '#fff',
          animation: 'slideDown 0.3s ease-out',
        }}
        data-testid="network-status-banner"
        role="status"
      >
        <Wifi className="w-3.5 h-3.5" />
        <span>Back online — syncing your changes</span>
      </div>
    );
  }

  // Offline — honest, reassuring, teaching banner.
  return (
    <div
      ref={bannerRef}
      className="fixed top-0 left-0 right-0 z-[9999]"
      style={{
        // Sit snug under the iOS status bar — just a 2 px breather so
        // the Wi-Fi icon isn't kissing the camera notch. Tightened at
        // user request (was +8 / pb:10).
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2px)',
        paddingBottom: 6,
        paddingLeft: 14,
        paddingRight: 14,
        background: '#7C1D1D',
        color: '#FFF6E8',
        animation: 'slideDown 0.3s ease-out',
        boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
      }}
      data-testid="network-status-banner"
      role="alert"
    >
      <div className="flex items-center gap-2 mb-0.5">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span className="text-sm font-bold">You're offline</span>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="ml-auto text-[11px] underline opacity-80 hover:opacity-100"
          data-testid="network-status-toggle"
          aria-label={expanded ? 'Collapse offline details' : 'Expand offline details'}
        >
          {expanded ? 'Hide' : 'Details'}
        </button>
      </div>
      {expanded && (
        <p
          className="text-[12px] leading-snug"
          data-testid="network-status-details"
          style={{ opacity: 0.95 }}
        >
          <Info className="inline w-3 h-3 mr-1 -mt-0.5" />
          You can still record milestones, upload documents, send messages,
          and create anything in CarryOn — we'll sync it all when you
          reconnect. Existing files will open again when you're back online.
        </p>
      )}
    </div>
  );
};

export default NetworkStatusBanner;
