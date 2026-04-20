/**
 * CarryOn — Offline Debug Console
 * ============================================================================
 * Dev tool for flipping the offline feature flag and inspecting the local
 * IndexedDB mirror. Only reachable via /debug/offline (admin-only route).
 * Not linked from any menu — intentionally hidden until we're ready to go
 * live with offline mode.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { getOfflineMode, setOfflineMode } from '../offline/featureFlag';
import { syncClient } from '../offline/syncClient';
import { toast } from '../utils/toast';

export default function OfflineDebugPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState(getOfflineMode());
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await syncClient.snapshot());
    } catch (e) {
      setSnapshot({ error: String(e) });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Gate: admin only. Anything else bounces back to the dashboard.
  if (!user) return <Navigate to="/login" />;
  if (!user.is_admin && !user.admin_scope) return <Navigate to="/dashboard" />;

  const handleModeChange = async (next) => {
    setOfflineMode(next);
    setMode(next);
    toast.success(`Offline mode set to ${next}.`);
    if (next !== 'off') {
      await syncClient.init();
      refresh();
    }
  };

  const handlePurge = async () => {
    setBusy(true);
    try {
      await syncClient.clearAll();
      await refresh();
      toast.success('Local offline data purged.');
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
      <h1 className="text-2xl font-bold mb-1">Offline Debug Console</h1>
      <p className="text-sm text-[var(--t4)] mb-6">
        Phase 0 — foundation only. Toggle the flag to verify no regression.
        When <code>off</code>, the offline subsystem is entirely inert.
      </p>

      <section className="rounded-xl border p-4 mb-4" style={{ borderColor: 'var(--b)', background: 'var(--bg2)' }}>
        <h2 className="font-semibold mb-3">Feature flag</h2>
        <div className="flex gap-2">
          {['off', 'shadow', 'on'].map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition"
              style={{
                background: mode === m ? 'linear-gradient(135deg, #d4af37, #b8962e)' : 'transparent',
                color: mode === m ? '#080e1a' : 'var(--t)',
                border: `1px solid ${mode === m ? 'transparent' : 'var(--b)'}`,
              }}
              data-testid={`offline-flag-${m}`}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--t4)] mt-3">
          Current: <strong>{mode}</strong>. Persisted in <code>localStorage.carryon_offline_v1</code>.
          URL override: <code>?offline=on|off|shadow</code>.
        </p>
      </section>

      <section className="rounded-xl border p-4 mb-4" style={{ borderColor: 'var(--b)', background: 'var(--bg2)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Local DB snapshot</h2>
          <div className="flex gap-2">
            <button onClick={refresh} className="text-sm px-3 py-1 rounded-lg border" style={{ borderColor: 'var(--b)' }}>Refresh</button>
            <button onClick={handlePurge} disabled={busy} className="text-sm px-3 py-1 rounded-lg border" style={{ borderColor: 'var(--b)' }}>Purge</button>
          </div>
        </div>
        <pre className="text-xs bg-[var(--bg)] p-3 rounded-lg overflow-auto">
{JSON.stringify(snapshot, null, 2)}
        </pre>
      </section>

      <section className="text-xs text-[var(--t4)]">
        Phase roadmap: 0 Foundation · 1 Beneficiaries read · 2 Beneficiaries write+outbox · 3 Estates/Dashboard/Profile · 4 Chat · 5 Share/Voices/Vault · 6 Login sync packet · 7 Encryption · 8 Conflicts.
      </section>
    </div>
  );
}
