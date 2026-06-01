/**
 * CarryOn — On-Device Offline Diagnostics
 * ============================================================================
 * A self-contained overlay that shows the TRUTH about offline readiness on
 * the actual device — not a claim from the build server. Open it by adding
 * `?diag=1` to any URL, or via Settings → "Offline diagnostics".
 *
 * It answers, on the user's phone:
 *   - Is a Service Worker actually CONTROLLING this page, and which version?
 *   - How many app chunks / PDF workers / images are REALLY cached?
 *   - Is the offline feature flag on? Is at-rest encryption on?
 *   - Does the local IndexedDB mirror actually contain the profile / pinned
 *     docs / subscription (and does it DECRYPT)?
 *
 * It also offers a one-tap "Re-arm offline cache" that forces a full
 * re-precache and reports exactly which URLs failed (quota / 404 / network) —
 * which is how we diagnose a device that never becomes offline-ready.
 *
 * Intentionally dependency-light and flag-AGNOSTIC: it must work even when
 * the offline subsystem is off, because that is one of the things we need to
 * see.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw, ShieldCheck, Database, HardDrive, Cpu, CheckCircle2, AlertTriangle, Power } from 'lucide-react';
import { getOfflineMode, setOfflineMode } from '../offline/featureFlag';

// Ask the controlling Service Worker a question and await its reply over a
// dedicated MessageChannel. Resolves null if there's no controller or the SW
// doesn't answer within the timeout (which is itself a useful diagnostic).
function askServiceWorker(message, timeoutMs = 12000) {
  return new Promise((resolve) => {
    try {
      const ctrl = navigator.serviceWorker && navigator.serviceWorker.controller;
      if (!ctrl) { resolve(null); return; }
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), timeoutMs);
      channel.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
      ctrl.postMessage(message, [channel.port2]);
    } catch { resolve(null); }
  });
}

function Row({ ok, label, value }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? AlertTriangle : null;
  const color = ok === true ? '#10b981' : ok === false ? '#f59e0b' : '#64748b';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      {Icon ? <Icon className="w-4 h-4" style={{ color, flexShrink: 0 }} /> : <span style={{ width: 16 }} />}
      <span style={{ flex: 1, color: 'rgba(244,231,193,0.8)', fontSize: 13 }}>{label}</span>
      <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export default function OfflineDiagnostics() {
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState(null);
  const [mirror, setMirror] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rearm, setRearm] = useState(null);
  const [rearming, setRearming] = useState(false);
  const [crypto, setCrypto] = useState(null);

  // Open when ?diag=1 is present, or on a custom event from Settings.
  useEffect(() => {
    const check = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('diag') === '1') setOpen(true);
      } catch { /* no-op */ }
    };
    check();
    const onOpen = () => setOpen(true);
    window.addEventListener('carryon:open-diagnostics', onOpen);
    return () => window.removeEventListener('carryon:open-diagnostics', onOpen);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setDiag(null);
    setMirror(null);
    setCrypto(null);
    // 1) Ask the SW for its real cache state.
    const swInfo = await askServiceWorker({ type: 'GET_DIAG' });
    setDiag({
      controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      sw: swInfo,
      offlineMode: (() => { try { return getOfflineMode(); } catch { return 'off'; } })(),
      encryption: await (async () => { try { const m = await import('../offline/crypto'); return m.isEncryptionEnabled(); } catch { return false; } })(),
      navOnline: (typeof navigator !== 'undefined') ? navigator.onLine : null,
    });
    // 2) Read the local IndexedDB mirror directly.
    const out = {};
    try {
      const { getLocalProfile } = await import('../offline/repos/profileRepo');
      const p = await getLocalProfile();
      out.profile = p ? { ok: true, name: p.name || p.first_name || '(no name)', email: p.email || '(no email)' } : { ok: false };
    } catch (e) { out.profile = { ok: false, err: (e && e.message) || 'read/decrypt failed' }; }
    try {
      const { listPinned } = await import('../offline/pinnedDocsRepo');
      const rows = await listPinned();
      out.pinned = { count: rows.length, names: rows.slice(0, 8).map((r) => r.title || r.name || r.id) };
    } catch (e) { out.pinned = { count: -1, err: (e && e.message) || 'read failed' }; }
    try {
      const { getLocalSubscription } = await import('../offline/repos/subscriptionRepo');
      const s = await getLocalSubscription();
      out.subscription = { ok: !!s, tier: s && (s.tier || s.plan || s.status) };
    } catch (e) { out.subscription = { ok: false, err: (e && e.message) || 'read failed' }; }
    setMirror(out);

    // 3) Crypto self-test — pinpoints WHY an encrypted read returns empty
    // offline: missing token, key won't derive, or the stored profile was
    // encrypted with a DIFFERENT key than we can now re-derive.
    const c = {};
    try {
      const enc = await import('../offline/crypto');
      try {
        const t = localStorage.getItem('carryon_token');
        c.token = t ? `present (${t.length})` : 'MISSING';
      } catch { c.token = 'err'; }
      c.encEnabled = enc.isEncryptionEnabled();
      try {
        const key = await enc.ensureSessionKey();
        c.keyDerived = !!key;
      } catch (e) { c.keyDerived = false; c.keyErr = (e && e.message) || 'derive failed'; }
      // Raw stored profile row (before unseal).
      try {
        const { getDB } = await import('../offline/db');
        const raw = await getDB().user.get('current');
        c.rawFound = !!raw;
        c.rawHasEnc = !!(raw && raw.__enc);
        c.rawHasPlainData = !!(raw && raw.data);
        if (raw) {
          const un = await enc.unsealRecord(raw);
          c.unsealOk = !!un;
          c.unsealName = un && un.data ? (un.data.name || un.data.first_name || '(no name field)') : null;
        }
      } catch (e) { c.rawErr = (e && e.message) || 'raw read failed'; }
      // Fresh seal→unseal round-trip with the CURRENT key (proves WebCrypto
      // works on this device, isolating data-vs-engine problems).
      try {
        const sealed = await enc.sealRecord({ id: 't', email: 't', data: { x: 'roundtrip' } }, ['id', 'email']);
        c.roundtripEncrypted = !!sealed.__enc;
        const back = await enc.unsealRecord(sealed);
        c.roundtripOk = !!(back && back.data && back.data.x === 'roundtrip');
      } catch (e) { c.roundtripErr = (e && e.message) || 'roundtrip failed'; }
    } catch (e) { c.error = (e && e.message) || String(e); }
    setCrypto(c);

    setLoading(false);
  }, []);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const doRearm = async () => {
    setRearming(true);
    setRearm(null);
    const report = await askServiceWorker({ type: 'REARM_CACHE' }, 90000);
    setRearm(report || { error: 'No response from Service Worker (it may not be controlling this page yet — reload once online).' });
    setRearming(false);
    refresh();
  };

  const forceFlagOn = () => {
    try { setOfflineMode('on'); } catch { /* private mode */ }
    refresh();
  };

  if (!open) return null;

  const sw = diag && diag.sw;
  const expected = sw && sw.expectedChunks;
  const cached = sw && sw.cachedChunks;
  const chunksOk = expected != null && cached != null ? cached >= expected : null;

  return (
    <div
      data-testid="offline-diagnostics-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483600,
        background: 'rgba(7,12,24,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 'max(16px, env(safe-area-inset-top)) 16px 16px', overflowY: 'auto',
        fontFamily: 'var(--sans, system-ui, -apple-system, sans-serif)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 520, background: 'var(--bg, #0F1629)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 18, boxShadow: '0 30px 70px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(212,175,55,0.05)' }}>
          <ShieldCheck className="w-5 h-5" style={{ color: '#d4af37' }} />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Offline Diagnostics</div>
            <div style={{ color: 'rgba(244,231,193,0.55)', fontSize: 11 }}>Real on-device state — not a build-server claim</div>
          </div>
          <button onClick={() => setOpen(false)} data-testid="diag-close"
            style={{ width: 34, height: 34, borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div style={{ padding: '6px 16px 16px' }}>
          {loading && <div style={{ color: 'rgba(244,231,193,0.6)', fontSize: 13, padding: '16px 0' }}>Reading device state…</div>}

          {diag && (
            <>
              <SectionLabel icon={Cpu} text="Service Worker" />
              <Row ok={diag.controller} label="Controlling this page" value={diag.controller ? 'Yes' : 'No'} />
              <Row ok={!!sw} label="SW responded" value={sw ? 'Yes' : 'No (timeout)'} />
              <Row ok={sw ? true : null} label="Version" value={sw ? sw.version : '—'} />
              <Row ok={diag.navOnline} label="navigator.onLine" value={String(diag.navOnline)} />

              <SectionLabel icon={HardDrive} text="Cache (what actually downloaded)" />
              <Row ok={chunksOk} label="App chunks cached" value={sw ? `${cached ?? '?'} / ${expected ?? '?'}` : '—'} />
              <Row ok={sw ? sw.missingCount === 0 : null} label="Missing chunks" value={sw ? String(sw.missingCount ?? '?') : '—'} />
              <Row ok={sw ? sw.pdfWorkerReactCached : null} label="PDF viewer worker cached" value={sw ? (sw.pdfWorkerReactCached ? 'Yes' : 'No') : '—'} />
              <Row ok={sw ? sw.shellLogoCached : null} label="Logo / shell cached" value={sw ? (sw.shellLogoCached ? 'Yes' : 'No') : '—'} />
              {sw && sw.missingSample && sw.missingSample.length > 0 && (
                <div style={{ color: 'rgba(245,158,11,0.85)', fontSize: 10.5, padding: '6px 0', wordBreak: 'break-all' }}>
                  e.g. missing: {sw.missingSample.join(', ')}
                </div>
              )}

              <SectionLabel icon={ShieldCheck} text="Flags" />
              <Row ok={diag.offlineMode === 'on'} label="Offline flag (carryon_offline_v1)" value={diag.offlineMode} />
              <Row ok={null} label="At-rest encryption" value={diag.encryption ? 'On' : 'Off'} />
            </>
          )}

          {mirror && (
            <>
              <SectionLabel icon={Database} text="Local data mirror (IndexedDB)" />
              <Row ok={mirror.profile.ok} label="Profile" value={mirror.profile.ok ? `${mirror.profile.name}` : (mirror.profile.err || 'empty')} />
              <Row ok={mirror.pinned.count > 0} label="Pinned documents" value={mirror.pinned.count < 0 ? (mirror.pinned.err || 'error') : String(mirror.pinned.count)} />
              <Row ok={mirror.subscription.ok} label="Subscription" value={mirror.subscription.ok ? (mirror.subscription.tier || 'cached') : 'empty'} />
            </>
          )}

          {crypto && (
            <>
              <SectionLabel icon={ShieldCheck} text="Crypto self-test (why profile is empty)" />
              <Row ok={crypto.token && crypto.token !== 'MISSING'} label="Auth token in storage" value={crypto.token || '—'} />
              <Row ok={crypto.keyDerived} label="Decryption key derived" value={crypto.keyDerived ? 'Yes' : (crypto.keyErr || 'No')} />
              <Row ok={crypto.roundtripOk} label="Encrypt→decrypt round-trip" value={crypto.roundtripOk ? 'OK' : (crypto.roundtripErr || 'FAIL')} />
              <Row ok={crypto.rawFound} label="Stored profile row exists" value={crypto.rawFound ? 'Yes' : 'No'} />
              <Row ok={crypto.rawHasEnc === false ? null : crypto.rawHasEnc} label="Profile row is encrypted" value={crypto.rawFound ? (crypto.rawHasEnc ? 'Yes (__enc)' : 'No (plaintext)') : '—'} />
              <Row ok={crypto.unsealOk} label="Profile decrypts" value={crypto.unsealOk ? (crypto.unsealName || 'Yes') : 'FAILS → empty'} />
              {(crypto.rawHasEnc && crypto.roundtripOk && !crypto.unsealOk) && (
                <div style={{ color: 'rgba(245,158,11,0.9)', fontSize: 10.5, padding: '6px 0', lineHeight: 1.5 }}>
                  Diagnosis: WebCrypto works and the key derives, but the stored profile was encrypted with a DIFFERENT key — it needs re-encrypting online.
                </div>
              )}
            </>
          )}

          {rearm && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: rearm.ok ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${rearm.ok ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)'}` }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
                {rearm.error ? 'Re-arm error' : `Re-armed ${rearm.done}/${rearm.total} assets`}
              </div>
              {rearm.error && <div style={{ color: 'rgba(245,158,11,0.9)', fontSize: 11, marginTop: 4 }}>{rearm.error}</div>}
              {rearm.failed && rearm.failed.length > 0 && (
                <div style={{ color: 'rgba(245,158,11,0.9)', fontSize: 10.5, marginTop: 4, wordBreak: 'break-all' }}>
                  {rearm.failed.length} failed ({rearm.failed[0].err}): {rearm.failed.slice(0, 6).map((f) => f.u).join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
            <button onClick={doRearm} disabled={rearming} data-testid="diag-rearm"
              style={btnStyle('#d4af37', '#0B1221')}>
              <RefreshCw className={`w-4 h-4 ${rearming ? 'animate-spin' : ''}`} />
              {rearming ? 'Re-arming…' : 'Re-arm offline cache'}
            </button>
            <button onClick={refresh} disabled={loading} data-testid="diag-refresh"
              style={btnStyle('rgba(255,255,255,0.08)', '#fff')}>
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            {diag && diag.offlineMode !== 'on' && (
              <button onClick={forceFlagOn} data-testid="diag-force-flag"
                style={{ ...btnStyle('rgba(255,255,255,0.08)', '#fff'), gridColumn: '1 / -1' }}>
                <Power className="w-4 h-4" /> Turn offline flag ON (this device)
              </button>
            )}
            <button onClick={() => window.location.reload()} data-testid="diag-reload"
              style={{ ...btnStyle('rgba(255,255,255,0.08)', '#fff'), gridColumn: '1 / -1' }}>
              Reload app
            </button>
          </div>
          <div style={{ color: 'rgba(244,231,193,0.4)', fontSize: 10.5, marginTop: 12, lineHeight: 1.5 }}>
            Tip: do "Re-arm offline cache" while ONLINE, wait for it to finish, then go offline and re-open this panel to confirm chunks = expected and PDF worker = Yes.
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ icon: Icon, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 16, marginBottom: 2 }}>
      <Icon className="w-3.5 h-3.5" style={{ color: '#d4af37' }} />
      <span style={{ color: '#d4af37', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{text}</span>
    </div>
  );
}

function btnStyle(bg, color) {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: '11px 12px', borderRadius: 12, border: 0, cursor: 'pointer',
    background: bg, color, fontSize: 13, fontWeight: 600,
  };
}
