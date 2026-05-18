/**
 * SharedBinderPage — Public recipient page (no auth) at /s/:token.
 *
 * Hits GET /api/share/binder/:token to:
 *   1. First call (no passphrase param) — either:
 *      • 302 → S3 presigned URL (success, no passphrase required)
 *      • 401 {passphrase_required:true, title, estate_name} → render input
 *      • 410 → expired / revoked / max-opens reached
 *      • 404 → invalid token
 *   2. Once user enters passphrase, re-issue with ?passphrase=… so the
 *      backend can validate. Wrong passphrase returns 401 with `detail`
 *      and does NOT increment opens.
 *
 * Successful flow uses `window.location.assign(presignedUrl)` so the
 * browser performs the actual download against S3 directly — our pod
 * is only touched for token validation.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Lock, AlertTriangle, Download, ShieldCheck } from 'lucide-react';
import { API_URL } from '../config';

const STATES = Object.freeze({
  CHECKING: 'checking',
  NEEDS_PASS: 'needs_pass',
  DOWNLOADING: 'downloading',
  ERROR: 'error',
});

const SharedBinderPage = () => {
  const { token } = useParams();
  const [state, setState] = useState(STATES.CHECKING);
  const [meta, setMeta] = useState({ title: 'Estate Binder', estate_name: '' });
  const [errorMsg, setErrorMsg] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchShare = useCallback(
    async (pass) => {
      const params = pass ? `?passphrase=${encodeURIComponent(pass)}` : '';
      // We need to inspect the response (status + body or redirect)
      // without auto-following. `manual` redirect lets us read the 302
      // Location header AND auto-navigate to it ourselves.
      const res = await fetch(`${API_URL}/share/binder/${encodeURIComponent(token)}${params}`, {
        redirect: 'manual',
      });

      if (res.type === 'opaqueredirect' || res.status === 0) {
        // Browser refused to expose the redirect target — fall back to
        // a plain top-level navigation (the backend will redirect once
        // the browser follows the response itself).
        window.location.assign(
          `${API_URL}/share/binder/${encodeURIComponent(token)}${params}`,
        );
        return { handled: true };
      }

      return { handled: false, res };
    },
    [token],
  );

  // Initial probe on mount: discover whether a passphrase is required.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const out = await fetchShare(null);
        if (!alive || out.handled) return;
        const { res } = out;
        if (res.status === 401) {
          const data = await res.json().catch(() => ({}));
          if (data?.passphrase_required) {
            setMeta({
              title: data.title || 'Estate Binder',
              estate_name: data.estate_name || '',
            });
            setState(STATES.NEEDS_PASS);
            return;
          }
        }
        if (res.status === 404) {
          setErrorMsg('This share link is invalid.');
          setState(STATES.ERROR);
          return;
        }
        if (res.status === 410) {
          const data = await res.json().catch(() => ({}));
          setErrorMsg(data?.detail || 'This share link is no longer available.');
          setState(STATES.ERROR);
          return;
        }
        if (res.status === 429) {
          setErrorMsg('Too many attempts. Please wait a minute and try again.');
          setState(STATES.ERROR);
          return;
        }
        // Anything else → ambiguous; fall back to a plain navigation.
        window.location.assign(`${API_URL}/share/binder/${encodeURIComponent(token)}`);
      } catch (err) {
        console.warn('[SharedBinder] probe failed', err);
        setErrorMsg('Network error — please retry.');
        setState(STATES.ERROR);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchShare, token]);

  const handleSubmitPass = useCallback(
    async (e) => {
      e.preventDefault();
      if (submitting || !passphrase.trim()) return;
      setSubmitting(true);
      try {
        const out = await fetchShare(passphrase.trim());
        if (out.handled) return;
        const { res } = out;
        if (res.status === 401) {
          setErrorMsg('Incorrect passphrase — please try again.');
          setSubmitting(false);
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErrorMsg(data?.detail || `Could not open (HTTP ${res.status})`);
          setState(STATES.ERROR);
          return;
        }
        // OK / 2xx (unusual with manual redirect but possible on dev).
        // Fall back to a top-level navigation to trigger the file download.
        setState(STATES.DOWNLOADING);
        window.location.assign(
          `${API_URL}/share/binder/${encodeURIComponent(token)}?passphrase=${encodeURIComponent(
            passphrase.trim(),
          )}`,
        );
      } catch (err) {
        console.warn('[SharedBinder] submit failed', err);
        setErrorMsg('Network error — please retry.');
        setSubmitting(false);
      }
    },
    [fetchShare, passphrase, submitting, token],
  );

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-10"
      style={{
        background:
          'radial-gradient(1200px circle at 50% 0%, rgba(96,165,250,0.10), transparent 60%), #0b1224',
        color: 'var(--t, #f5f5f7)',
      }}
      data-testid="shared-binder-page"
    >
      <div
        className="w-full max-w-md glass-card p-6 lg:p-8 text-center"
        style={{
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 0 36px rgba(96,165,250,0.18)',
        }}
      >
        <div
          className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{
            color: '#60a5fa',
            background: 'rgba(96,165,250,0.10)',
            border: '1px solid rgba(96,165,250,0.40)',
          }}
        >
          {state === STATES.CHECKING || state === STATES.DOWNLOADING ? (
            <Loader2 className="w-7 h-7 animate-spin" />
          ) : state === STATES.NEEDS_PASS ? (
            <Lock className="w-7 h-7" />
          ) : state === STATES.ERROR ? (
            <AlertTriangle className="w-7 h-7" />
          ) : (
            <Download className="w-7 h-7" />
          )}
        </div>

        <h1 className="text-xl lg:text-2xl font-bold mb-1" data-testid="shared-binder-title">
          {meta.title || 'Estate Binder'}
        </h1>
        {meta.estate_name && (
          <p className="text-xs text-[var(--t4)] mb-4">{meta.estate_name}</p>
        )}

        {state === STATES.CHECKING && (
          <p className="text-sm text-[var(--t3)] mt-4">Verifying link…</p>
        )}

        {state === STATES.DOWNLOADING && (
          <p className="text-sm text-[var(--t3)] mt-4">Starting download…</p>
        )}

        {state === STATES.NEEDS_PASS && (
          <form onSubmit={handleSubmitPass} className="mt-4 space-y-3">
            <p className="text-sm text-[var(--t3)]">
              This link is passphrase-protected. Enter the passphrase the sender
              shared with you.
            </p>
            <input
              type="text"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Passphrase"
              data-testid="shared-binder-pass-input"
              className="w-full px-3 py-2 rounded-lg text-center"
              style={{
                background: 'rgba(0,0,0,0.30)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'var(--t)',
                fontSize: '16px',
              }}
            />
            {errorMsg && (
              <p className="text-xs text-red-400" data-testid="shared-binder-error">
                {errorMsg}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || !passphrase.trim()}
              data-testid="shared-binder-pass-submit"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition disabled:opacity-50"
              style={{
                color: '#0b1224',
                background: 'linear-gradient(180deg, #d4af37, #b8932a)',
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {submitting ? 'Verifying…' : 'Unlock & Download'}
            </button>
          </form>
        )}

        {state === STATES.ERROR && (
          <div className="mt-4">
            <p className="text-sm text-red-300" data-testid="shared-binder-error">
              {errorMsg || 'Something went wrong.'}
            </p>
            <p className="text-[11px] text-[var(--t5)] mt-3">
              If you believe this is an error, please contact the sender for a fresh link.
            </p>
          </div>
        )}

        <p className="mt-6 text-[11px] text-[var(--t5)] uppercase tracking-wider">
          Secured by CarryOn™
        </p>
      </div>
    </div>
  );
};

export default SharedBinderPage;
