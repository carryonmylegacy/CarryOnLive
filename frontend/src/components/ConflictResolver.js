/**
 * CarryOn — Offline Conflict Resolver Modal (Phase 8)
 * ============================================================================
 * When the outbox drain hits an HTTP 409 / 412 while replaying a queued
 * write, the conflicting row stays in IndexedDB with `status='conflict'`.
 * This component listens for `carryon:outbox:conflict` events and opens
 * a modal asking the user whether to keep their version, keep the
 * server's version, or dismiss.
 *
 * Design:
 *   - Only mounts when the offline feature flag is 'on'. Off and shadow
 *     modes never see this modal.
 *   - Handles conflicts one at a time (queue). If multiple conflicts land
 *     at once we walk through them sequentially to avoid overwhelming the
 *     user.
 *   - Uses the shared glass-card + Button styling from the rest of the app.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { getOfflineMode } from '../offline/featureFlag';
import { listConflicts, resolveConflict } from '../offline/outbox';
import { toast } from '../utils/toast';

const PRETTY_ENTITY = {
  beneficiary: 'Beneficiary',
  profile: 'Your profile',
  chat_message: 'Message',
  estate: 'Estate',
};

export default function ConflictResolver() {
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);

  const pickNext = useCallback(async () => {
    try {
      const rows = await listConflicts();
      setConflict(rows[0] || null);
    } catch {
      setConflict(null);
    }
  }, []);

  useEffect(() => {
    // Phase 8: always attach the listener, but no-op when the flag is
    // not 'on' at the moment the event fires. This allows users (and
    // tests) to toggle the flag AFTER the component mounts without
    // requiring a page reload.
    const onConflict = () => {
      if (getOfflineMode() !== 'on') return;
      pickNext();
    };
    const onStorage = (e) => {
      if (e.key === 'carryon_offline_v1') {
        // Flag changed mid-session: refresh the conflict queue.
        if (getOfflineMode() === 'on') pickNext();
        else setConflict(null);
      }
    };
    window.addEventListener('carryon:outbox:conflict', onConflict);
    window.addEventListener('storage', onStorage);
    // Also poll once on mount in case a conflict was persisted from a
    // previous session.
    if (getOfflineMode() === 'on') pickNext();
    return () => {
      window.removeEventListener('carryon:outbox:conflict', onConflict);
      window.removeEventListener('storage', onStorage);
    };
  }, [pickNext]);

  const handle = async (choice) => {
    if (!conflict) return;
    setBusy(true);
    try {
      await resolveConflict(conflict.id, choice);
      toast.success(
        choice === 'mine'
          ? 'Your version will be applied when the queue drains.'
          : 'Kept the other version. Your unsaved change was discarded.',
      );
      await pickNext();
    } catch {
      toast.error('Could not resolve the conflict. Please try again.');
    } finally { setBusy(false); }
  };

  if (!conflict) return null;

  const label = PRETTY_ENTITY[conflict.entity_type] || conflict.entity_type;
  const mineSummary = typeof conflict.body === 'object'
    ? Object.keys(conflict.body || {}).slice(0, 5).join(', ')
    : String(conflict.body || '');
  const theirsSummary = typeof conflict.server_row === 'object'
    ? Object.keys(conflict.server_row || {}).slice(0, 5).join(', ')
    : '—';

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="conflict-resolver"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: 'var(--bg2, #0f1629)',
          color: 'var(--t, #e9edf5)',
          border: '1px solid var(--b, rgba(255,255,255,0.08))',
          borderRadius: 18,
          padding: 22,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          fontFamily: 'var(--sans, system-ui)',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>
          Heads up — a conflict was found.
        </h2>
        <p style={{ fontSize: 13, opacity: 0.8, margin: '0 0 18px', lineHeight: 1.5 }}>
          Your queued change to <strong>{label}</strong> couldn't be saved
          because someone (possibly you on another device) changed it first.
          Which version should win?
        </p>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16,
        }}>
          <div style={{ padding: 12, borderRadius: 10, background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.3)' }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>YOUR VERSION</div>
            <div style={{ fontSize: 12, fontFamily: 'var(--mono, monospace)', wordBreak: 'break-word' }}>{mineSummary}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--b, rgba(255,255,255,0.08))' }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>SERVER VERSION</div>
            <div style={{ fontSize: 12, fontFamily: 'var(--mono, monospace)', wordBreak: 'break-word' }}>{theirsSummary}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => handle('theirs')}
            disabled={busy}
            data-testid="conflict-keep-theirs"
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              background: 'transparent',
              color: 'var(--t, #fff)',
              border: '1px solid var(--b, rgba(255,255,255,0.2))',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Keep theirs
          </button>
          <button
            onClick={() => handle('mine')}
            disabled={busy}
            data-testid="conflict-keep-mine"
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              background: 'linear-gradient(135deg, #d4af37, #b8962e)',
              color: '#080e1a',
              border: 'none',
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            Keep mine
          </button>
        </div>
      </div>
    </div>
  );
}
