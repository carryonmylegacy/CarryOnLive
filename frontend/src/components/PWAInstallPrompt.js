import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { isStandalone } from '../utils/isPWA';

/**
 * CarryOn™ — "Install CarryOn" CTA banner.
 *
 * Captures the browser's `beforeinstallprompt` event (Chrome / Edge /
 * Samsung Internet / Brave) and surfaces a discreet install banner
 * the first time the user is signed in and the platform supports
 * native PWA install. On iOS Safari (which never fires
 * beforeinstallprompt), shows the Apple-specific "Add to Home Screen"
 * instructional sheet via the existing IOSAddToHomeSheet component.
 *
 * Dismissals are persisted in localStorage so we don't nag.
 */

const DISMISS_KEY = 'carryon_pwa_install_dismissed_at';
const COOLDOWN_DAYS = 14;

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already installed — never show.
    if (isStandalone()) return undefined;

    // Recently dismissed — respect cooldown.
    try {
      const dismissedAt = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
      const ageMs = Date.now() - dismissedAt;
      if (dismissedAt && ageMs < COOLDOWN_DAYS * 24 * 60 * 60 * 1000) return undefined;
    } catch { /* localStorage blocked — proceed anyway */ }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Cleanup
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
      } else {
        // User dismissed at the OS prompt — apply cooldown to avoid nagging.
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
      }
    } catch { /* user-gesture rejected, no-op */ }
    setDeferredPrompt(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  };

  if (!visible || !deferredPrompt) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] rounded-xl shadow-2xl"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid rgba(212,175,55,0.55)',
        boxShadow: '0 0 24px rgba(212,175,55,0.20), 0 8px 32px rgba(0,0,0,0.40)',
      }}
      data-testid="pwa-install-prompt"
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(212,175,55,0.10)', color: 'var(--gold)' }}
        >
          <Download className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[var(--t)] mb-0.5">Install CarryOn</div>
          <div className="text-[12px] text-[var(--t4)] leading-snug">
            Add CarryOn to your home screen for one-tap launch, offline access, and a faster, native-feel experience.
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleInstall}
              className="px-3 py-1.5 text-[12px] font-bold rounded-lg"
              style={{ background: 'var(--gold)', color: '#0b0b0d' }}
              data-testid="pwa-install-accept-btn"
            >
              Install
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-1.5 text-[12px] font-bold rounded-lg text-[var(--t4)] hover:text-[var(--t)] transition-colors"
              data-testid="pwa-install-dismiss-btn"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 text-[var(--t5)] hover:text-[var(--t)] transition-colors"
          aria-label="Dismiss"
          data-testid="pwa-install-close-btn"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
