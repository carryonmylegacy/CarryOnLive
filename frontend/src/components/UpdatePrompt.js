import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * UpdatePrompt — "New version available — tap to refresh" banner.
 *
 * The service-worker registration in `index.js` no longer silently
 * skip-waits a freshly-installed worker. Instead it dispatches a
 * `carryon:update-available` window event and exposes
 * `window.__carryonApplyUpdate()`. This component listens for that
 * event and shows a dismissible bottom-center banner. Tapping "Refresh"
 * activates the waiting worker and reloads once it takes control, so the
 * user immediately runs the new build instead of having to fully close
 * and reopen the installed PWA.
 *
 * Mounted once at the top of the app tree (App.js). Renders nothing
 * until an update is actually ready.
 */
export const UpdatePrompt = () => {
  const [show, setShow] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const onUpdate = () => setShow(true);
    window.addEventListener('carryon:update-available', onUpdate);
    return () => window.removeEventListener('carryon:update-available', onUpdate);
  }, []);

  if (!show) return null;

  const apply = () => {
    setRefreshing(true);
    if (typeof window.__carryonApplyUpdate === 'function') {
      window.__carryonApplyUpdate();
    } else {
      window.location.reload();
    }
  };

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[2000] w-[calc(100%-2rem)] max-w-md"
      style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
      data-testid="pwa-update-prompt"
      role="status"
      aria-live="polite"
    >
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl animate-fade-in"
        style={{
          background: 'var(--bg2, #0F1729)',
          border: '1px solid rgba(var(--gold-rgb), 0.35)',
          boxShadow: '0 12px 40px -8px rgba(0,0,0,0.55)',
        }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(var(--gold-rgb), 0.12)' }}
        >
          <RefreshCw
            className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
            style={{ color: 'var(--gold, #d4af37)' }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight" style={{ color: 'var(--t, #fff)' }}>
            New version available
          </p>
          <p className="text-[11px] leading-tight" style={{ color: 'var(--t5, #94a3b8)' }}>
            Tap refresh to get the latest CarryOn.
          </p>
        </div>
        <button
          onClick={apply}
          disabled={refreshing}
          className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all disabled:opacity-60"
          style={{ background: 'var(--gold, #d4af37)', color: '#0F172A' }}
          data-testid="pwa-update-refresh-button"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button
          onClick={() => setShow(false)}
          className="flex-shrink-0 p-1 rounded-full transition-colors hover:bg-[var(--s,rgba(255,255,255,0.06))]"
          aria-label="Dismiss update notification"
          data-testid="pwa-update-dismiss-button"
        >
          <X className="w-4 h-4" style={{ color: 'var(--t5, #94a3b8)' }} />
        </button>
      </div>
    </div>
  );
};

export default UpdatePrompt;
