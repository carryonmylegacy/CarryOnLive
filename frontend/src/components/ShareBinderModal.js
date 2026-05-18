/**
 * ShareBinderModal — Owner-side modal for minting a public share link
 * to the cached Estate Binder.
 *
 * Triggered from the EstateBinderButton flow AFTER a successful binder
 * generation. Lets the benefactor:
 *   • set TTL (1h, 24h, 7d)
 *   • set max opens (1, 3, 10, 50)
 *   • optionally protect with a passphrase
 *   • view + copy the resulting share URL
 *   • see their existing active shares with open counts
 *   • revoke any active share inline
 *
 * Backend contract: POST /api/share/binder · GET /api/share/my ·
 * DELETE /api/share/binder/{token}. All guardrails (active-share cap,
 * per-user rate limit) are enforced server-side; this UI just surfaces
 * the resulting 4xx as a toast.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Share2, Copy, Check, Lock, Trash2, Loader2, Clock, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import { toast } from '../utils/toast';

const TTL_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
];

const MAX_OPENS_OPTIONS = [1, 3, 10, 50];

const formatExpiry = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const ShareBinderModal = ({ open, onClose }) => {
  const { getAuthHeaders } = useAuth();
  const [ttlHours, setTtlHours] = useState(24);
  const [maxOpens, setMaxOpens] = useState(10);
  const [passphrase, setPassphrase] = useState('');
  const [protectWithPass, setProtectWithPass] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeShares, setActiveShares] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [justCreated, setJustCreated] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);

  const headers = useMemo(() => (getAuthHeaders() || {}).headers || {}, [getAuthHeaders]);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch(`${API_URL}/share/my`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setActiveShares(data.shares || []);
    } catch (err) {
      console.warn('[ShareBinder] list failed', err);
    } finally {
      setLoadingList(false);
    }
  }, [headers]);

  useEffect(() => {
    if (!open) return;
    refreshList();
    // Reset transient form state when re-opened
    setJustCreated(null);
    setPassphrase('');
    setProtectWithPass(false);
  }, [open, refreshList]);

  const handleCreate = useCallback(async () => {
    if (creating) return;
    if (protectWithPass && passphrase.trim().length < 6) {
      toast.error('Passphrase must be at least 6 characters.');
      return;
    }
    setCreating(true);
    try {
      const body = { ttl_hours: ttlHours, max_opens: maxOpens };
      if (protectWithPass && passphrase.trim()) body.passphrase = passphrase.trim();
      const res = await fetch(`${API_URL}/share/binder`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detail = errBody.detail || `HTTP ${res.status}`;
        toast.error(typeof detail === 'string' ? detail : 'Could not create share link.');
        return;
      }
      const data = await res.json();
      setJustCreated(data);
      await refreshList();
      toast.success('Share link ready — copy it below.');
    } catch (err) {
      console.warn('[ShareBinder] create failed', err);
      toast.error('Could not create share link — please try again.');
    } finally {
      setCreating(false);
    }
  }, [creating, ttlHours, maxOpens, protectWithPass, passphrase, headers, refreshList]);

  const handleCopy = useCallback(async (url, token) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 1800);
      toast.success('Copied to clipboard.');
    } catch {
      toast.error('Could not copy — long-press to select.');
    }
  }, []);

  const handleRevoke = useCallback(
    async (token) => {
      try {
        const res = await fetch(`${API_URL}/share/binder/${encodeURIComponent(token)}`, {
          method: 'DELETE',
          headers,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.success('Share link revoked.');
        await refreshList();
      } catch (err) {
        console.warn('[ShareBinder] revoke failed', err);
        toast.error('Could not revoke link.');
      }
    },
    [headers, refreshList],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center px-4"
      data-testid="share-binder-modal"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0"
        style={{
          backdropFilter: 'blur(20px) saturate(130%)',
          WebkitBackdropFilter: 'blur(20px) saturate(130%)',
          background: 'rgba(8,14,26,0.78)',
        }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-lg glass-card p-6 lg:p-7 overflow-y-auto"
        style={{
          maxHeight: '88vh',
          border: '1px solid rgba(96,165,250,0.35)',
          boxShadow: '0 0 36px rgba(96,165,250,0.25)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-lg text-[var(--t5)] hover:text-[var(--t)] transition"
          aria-label="Close"
          data-testid="share-binder-close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div
            className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
            style={{
              color: '#60a5fa',
              background: 'rgba(96,165,250,0.10)',
              border: '1px solid rgba(96,165,250,0.40)',
            }}
          >
            <Share2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg lg:text-xl font-bold text-[var(--t)]">Share Estate Binder</h3>
            <p className="text-xs text-[var(--t4)]">
              Send a private, expiring link to your attorney, CPA, or family.
            </p>
          </div>
        </div>

        {/* Create form */}
        {!justCreated && (
          <div className="space-y-4 mb-5">
            <div>
              <label className="text-xs font-semibold text-[var(--t3)] flex items-center gap-1.5 mb-1.5">
                <Clock className="w-3.5 h-3.5" /> Link expires in
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {TTL_OPTIONS.map((opt) => (
                  <button
                    key={opt.hours}
                    type="button"
                    onClick={() => setTtlHours(opt.hours)}
                    data-testid={`share-binder-ttl-${opt.hours}`}
                    className="text-xs font-semibold py-2 rounded-lg transition"
                    style={{
                      background:
                        ttlHours === opt.hours
                          ? 'rgba(96,165,250,0.18)'
                          : 'rgba(255,255,255,0.04)',
                      border:
                        ttlHours === opt.hours
                          ? '1px solid rgba(96,165,250,0.55)'
                          : '1px solid rgba(255,255,255,0.10)',
                      color:
                        ttlHours === opt.hours ? '#93c5fd' : 'var(--t3)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--t3)] flex items-center gap-1.5 mb-1.5">
                <Users className="w-3.5 h-3.5" /> Maximum opens
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {MAX_OPENS_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxOpens(n)}
                    data-testid={`share-binder-max-${n}`}
                    className="text-xs font-semibold py-2 rounded-lg transition"
                    style={{
                      background:
                        maxOpens === n
                          ? 'rgba(96,165,250,0.18)'
                          : 'rgba(255,255,255,0.04)',
                      border:
                        maxOpens === n
                          ? '1px solid rgba(96,165,250,0.55)'
                          : '1px solid rgba(255,255,255,0.10)',
                      color:
                        maxOpens === n ? '#93c5fd' : 'var(--t3)',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-[var(--t3)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={protectWithPass}
                  onChange={(e) => setProtectWithPass(e.target.checked)}
                  data-testid="share-binder-passphrase-toggle"
                  className="w-3.5 h-3.5"
                />
                <Lock className="w-3.5 h-3.5" /> Protect with a passphrase (recommended)
              </label>
              {protectWithPass && (
                <input
                  type="text"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="At least 6 characters — share separately"
                  data-testid="share-binder-passphrase-input"
                  className="mt-2 w-full px-3 py-2 text-sm rounded-lg"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'var(--t)',
                    fontSize: '16px', // prevent iOS auto-zoom
                  }}
                />
              )}
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              data-testid="share-binder-create-btn"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition"
              style={{
                color: '#0b1224',
                background: 'linear-gradient(180deg, #d4af37, #b8932a)',
                boxShadow: '0 0 18px rgba(212,175,55,0.35)',
                cursor: creating ? 'wait' : 'pointer',
              }}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              {creating ? 'Creating…' : 'Create Share Link'}
            </button>
          </div>
        )}

        {/* Just-created success card */}
        {justCreated && (
          <div
            className="mb-5 p-4 rounded-xl"
            style={{
              background: 'rgba(34,197,94,0.10)',
              border: '1px solid rgba(34,197,94,0.45)',
            }}
            data-testid="share-binder-created-card"
          >
            <p className="text-xs font-semibold text-[var(--t)] mb-1">Link ready</p>
            <p className="text-[11px] text-[var(--t4)] mb-2">
              Expires {formatExpiry(justCreated.expires_at)} ·{' '}
              {justCreated.max_opens} open{justCreated.max_opens === 1 ? '' : 's'}{' '}
              {justCreated.requires_passphrase ? '· passphrase required' : ''}
            </p>
            <div
              className="flex items-center gap-1.5 p-2 rounded-lg"
              style={{
                background: 'rgba(0,0,0,0.30)',
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
              <code className="flex-1 text-[11px] text-[var(--t)] truncate" data-testid="share-binder-created-url">
                {justCreated.share_url}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(justCreated.share_url, justCreated.token)}
                data-testid="share-binder-copy-btn"
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded transition"
                style={{
                  color: copiedToken === justCreated.token ? '#22c55e' : '#93c5fd',
                  background:
                    copiedToken === justCreated.token
                      ? 'rgba(34,197,94,0.15)'
                      : 'rgba(96,165,250,0.15)',
                }}
              >
                {copiedToken === justCreated.token ? (
                  <><Check className="w-3 h-3" /> Copied</>
                ) : (
                  <><Copy className="w-3 h-3" /> Copy</>
                )}
              </button>
            </div>
            {justCreated.requires_passphrase && (
              <p className="mt-2 text-[11px] text-amber-300">
                ⚠ Send the passphrase to your recipient through a different channel
                (text vs email).
              </p>
            )}
            <button
              type="button"
              onClick={() => setJustCreated(null)}
              data-testid="share-binder-new-btn"
              className="mt-3 w-full text-xs font-semibold py-2 rounded-lg transition"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: 'var(--t3)',
              }}
            >
              Create another
            </button>
          </div>
        )}

        {/* Active shares list */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--t4)] mb-2">
            Your active shares
          </p>
          {loadingList && activeShares.length === 0 ? (
            <div className="text-[11px] text-[var(--t5)] italic py-3 text-center">Loading…</div>
          ) : activeShares.length === 0 ? (
            <div className="text-[11px] text-[var(--t5)] italic py-3 text-center">
              No active share links.
            </div>
          ) : (
            <div className="space-y-1.5" data-testid="share-binder-list">
              {activeShares
                .filter((s) => !s.revoked && new Date(s.expires_at) > new Date())
                .map((s) => (
                  <div
                    key={s.token}
                    className="flex items-center gap-2 p-2.5 rounded-lg"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                    data-testid={`share-binder-row-${s.token.slice(0, 8)}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-[var(--t)] truncate">
                        …{s.token.slice(-10)}
                        {s.requires_passphrase && (
                          <Lock className="inline w-3 h-3 ml-1 text-amber-300" />
                        )}
                      </p>
                      <p className="text-[11px] text-[var(--t4)]">
                        {s.opens}/{s.max_opens} opens · expires{' '}
                        {formatExpiry(s.expires_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(s.share_url, s.token)}
                      className="p-1.5 rounded transition"
                      style={{ color: copiedToken === s.token ? '#22c55e' : '#93c5fd' }}
                      aria-label="Copy link"
                      data-testid={`share-binder-copy-${s.token.slice(0, 8)}`}
                    >
                      {copiedToken === s.token ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(s.token)}
                      className="p-1.5 rounded transition text-red-400 hover:text-red-300"
                      aria-label="Revoke"
                      data-testid={`share-binder-revoke-${s.token.slice(0, 8)}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareBinderModal;
