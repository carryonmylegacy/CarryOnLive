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
 * Persistence (Feb 2026): the AUTHORITATIVE store is the MongoDB
 * `platform_settings.offline_mode` document, exposed via the existing
 * `/api/admin/platform-settings` GET/PUT pair (same surface
 * SignupOtpToggle / OtpToggle use). On mount we hydrate from the
 * server so a fresh PWA install or a new deployment automatically
 * restores the founder's last-set value instead of resetting to 'off'.
 *
 * `localStorage.carryon_offline_v1` is still the runtime truth for
 * synchronous reads inside `featureFlag.js`; we keep both in sync.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { CloudOff } from 'lucide-react';
import { API_URL } from '../../config';

const MobileOfflineToggle = () => {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem('carryon_offline_v1') === 'on'; }
    catch { return false; }
  });

  // Hydrate from server on mount — restores the founder's last value
  // even after a PWA reinstall (which wipes localStorage on iOS).
  useEffect(() => {
    const token = (() => { try { return localStorage.getItem('carryon_token'); } catch { return null; } })();
    if (!token) return;
    let cancelled = false;
    axios.get(`${API_URL}/admin/platform-settings`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => {
      if (cancelled) return;
      const serverMode = res?.data?.offline_mode;
      if (serverMode !== 'on' && serverMode !== 'off') return;
      const serverOn = serverMode === 'on';
      try {
        const localOn = localStorage.getItem('carryon_offline_v1') === 'on';
        if (serverOn !== localOn) {
          localStorage.setItem('carryon_offline_v1', serverOn ? 'on' : 'off');
          setOn(serverOn);
          try { window.dispatchEvent(new CustomEvent('carryon:offline-flag-changed', { detail: { mode: serverOn ? 'on' : 'off' } })); } catch {}
        }
      } catch {}
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggle = async () => {
    const next = !on;
    setOn(next);
    const token = (() => { try { return localStorage.getItem('carryon_token'); } catch { return null; } })();
    if (token) {
      try {
        await axios.put(
          `${API_URL}/admin/platform-settings`,
          { offline_mode: next ? 'on' : 'off' },
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
        );
      } catch { /* non-fatal — local flag still toggles */ }
    }
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
