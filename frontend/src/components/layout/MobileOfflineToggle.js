/**
 * MobileOfflineToggle — founder-only quick toggle for platform-wide offline
 * mode. Sits directly below the OTP toggle in the mobile nav drawer per PM.
 *
 * Flipping this single switch engages every offline feature at once:
 *   • IndexedDB sync (Dexie)
 *   • Outbox + drain for FFN / CCP / Beneficiaries / Checklist / Profile / Estate
 *   • Pending chunked uploads for DAV docs, milestones, chat attachments
 *   • AES-256-GCM at-rest encryption (session key auto-derived from JWT)
 *   • Conflict resolver modal on sync collisions
 *
 * Source of truth: `localStorage.carryon_offline_v1` ('on' | 'off' | 'shadow').
 * We reload on toggle so repos, service worker, and crypto session key
 * reinitialize cleanly — otherwise sync hooks subscribed with the old flag
 * value would stay dormant.
 */
import React, { useState } from 'react';
import { CloudOff } from 'lucide-react';

const MobileOfflineToggle = () => {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem('carryon_offline_v1') === 'on'; }
    catch { return false; }
  });
  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem('carryon_offline_v1', next ? 'on' : 'off');
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent('carryon:offline-flag-changed', {
        detail: { mode: next ? 'on' : 'off' },
      }));
    } catch {}
    setTimeout(() => { try { window.location.reload(); } catch {} }, 150);
  };
  return (
    <button
      onClick={toggle}
      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all"
      style={{
        background: on ? 'rgba(212,175,55,0.10)' : 'var(--b)',
        border: `1px solid ${on ? 'rgba(212,175,55,0.35)' : 'rgba(255,255,255,0.1)'}`,
      }}
      data-testid="mobile-offline-toggle"
    >
      <CloudOff className="w-5 h-5" style={{ color: on ? '#d4af37' : '#A0AABF' }} />
      <span className="font-medium" style={{ color: on ? '#d4af37' : '#A0AABF' }}>
        Offline {on ? 'On' : 'Off'}
      </span>
    </button>
  );
};

export default MobileOfflineToggle;
