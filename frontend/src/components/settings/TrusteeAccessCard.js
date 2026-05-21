import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/apiClient';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, UserPlus, Trash2, Loader2, AlertTriangle, Mail, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const DURATION_OPTIONS = [
  { value: 'indefinite', label: 'Indefinite' },
  { value: '1d', label: '1 day' },
  { value: '3d', label: '3 days' },
  { value: '5d', label: '5 days' },
  { value: '1w', label: '1 week' },
  { value: 'custom', label: 'Other (custom days)' },
];

const STATUS_BADGE = {
  pending: { label: 'Invite sent', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  otp_pending: { label: 'Verifying email', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  active: { label: 'Active', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  revoked: { label: 'Revoked', color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  expired: { label: 'Expired', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
};

/**
 * TrusteeAccessCard — benefactor-side Settings card for Trustee Mode (TMA).
 *
 * Now uses the invite-by-email flow: benefactor supplies email + display
 * name + duration + optional beneficiary inclusion. Backend mints a
 * one-time claim link, sends it via Resend. Trustee chooses their own
 * username + password on the claim page and verifies via email OTP.
 *
 * The card is hidden when the `tma` feature gate is OFF and fully
 * greyed read-only when the active session is a trustee.
 */
const TrusteeAccessCard = () => {
  const { user, getAuthHeaders, enabledFeatures } = useAuth();
  const tmaEnabled = Array.isArray(enabledFeatures) && enabledFeatures.includes('tma');
  const isTrustee = !!user?.trustee_mode;

  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  // Create form fields
  const [email, setEmail] = useState('');
  const [trusteeDisplayName, setTrusteeDisplayName] = useState('');
  const [includeBeneficiaries, setIncludeBeneficiaries] = useState(false);
  const [duration, setDuration] = useState('indefinite');
  const [customDays, setCustomDays] = useState(7);

  useEffect(() => {
    if (!tmaEnabled || isTrustee) { setLoading(false); return; }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmaEnabled, isTrustee]);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await apiClient.get(`${API_URL}/trustee/grants`, getAuthHeaders());
      setGrants(r.data?.grants || []);
    } catch (e) {
      setGrants([]);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setTrusteeDisplayName('');
    setIncludeBeneficiaries(false);
    setDuration('indefinite');
    setCustomDays(7);
    setShowCreate(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!email.trim() || !trusteeDisplayName.trim()) {
      toast.error('Email and display name are required.');
      return;
    }
    if (duration === 'custom' && (!customDays || customDays < 1)) {
      toast.error('Enter a positive number of days for custom duration.');
      return;
    }
    setBusy(true);
    try {
      const r = await apiClient.post(`${API_URL}/trustee/grants`, {
        email: email.trim(),
        trustee_display_name: trusteeDisplayName.trim(),
        include_beneficiaries: includeBeneficiaries,
        duration,
        custom_days: duration === 'custom' ? Number(customDays) : null,
      }, getAuthHeaders());
      if (r.data?.email_sent) {
        toast.success(`Invite sent to ${email.trim()}.`, {
          description: 'They have 48 hours to claim it before the link expires.',
        });
      } else {
        toast.success('Invite created.', {
          description: 'The email could not be sent automatically — share the link manually if needed.',
        });
      }
      resetForm();
      await refresh();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Could not send the trustee invite.';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleBeneficiaries = async (grant, next) => {
    setBusy(true);
    try {
      await apiClient.patch(`${API_URL}/trustee/grants/${grant.id}`, {
        include_beneficiaries: next,
      }, getAuthHeaders());
      toast.success(next
        ? 'Trustee can now also access linked beneficiary accounts.'
        : 'Trustee no longer has beneficiary-account access.');
      await refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not update trustee access.');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async (grant) => {
    setBusy(true);
    try {
      const r = await apiClient.post(`${API_URL}/trustee/grants/${grant.id}/resend`, {}, getAuthHeaders());
      if (r.data?.email_sent) {
        toast.success(`Invite re-sent to ${grant.email}. The previous link is no longer valid.`);
      } else {
        toast.success('Invite re-issued.', { description: 'Email could not be delivered — share the new link manually if needed.' });
      }
      await refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not resend the invite.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (grant) => {
    if (!window.confirm(`Revoke trustee access for "${grant.trustee_display_name}"? They will be signed out immediately and the credentials will stop working.`)) return;
    setBusy(true);
    try {
      await apiClient.delete(`${API_URL}/trustee/grants/${grant.id}`, getAuthHeaders());
      toast.success('Trustee access revoked.');
      await refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not revoke trustee access.');
    } finally {
      setBusy(false);
    }
  };

  if (!tmaEnabled) return null;

  // When a trustee is the active session, render the entire card as
  // a greyed read-only block. The trustee can never manage trustee access.
  if (isTrustee) {
    return (
      <Card className="glass-card" data-testid="trustee-access-card-readonly" aria-disabled="true">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[var(--t)]" style={{ opacity: 0.55 }}>
            <ShieldCheck className="w-5 h-5 text-[var(--gold)]" />
            Trustee Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="rounded-xl p-4"
            style={{
              background: 'rgba(120,120,120,0.08)',
              border: '1px dashed rgba(120,120,120,0.35)',
              opacity: 0.55,
              filter: 'grayscale(0.4)',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-[var(--t)] text-sm font-bold">Trustee accounts cannot manage trustee access.</p>
                <p className="text-[var(--t4)] text-sm mt-1">
                  Only the benefactor can create, modify, or revoke trustee credentials. Sign in as the benefactor to make changes here.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const visibleGrants = grants.filter(g => g.status !== 'revoked');

  return (
    <Card className="glass-card" data-testid="trustee-access-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[var(--t)]">
          <ShieldCheck className="w-5 h-5 text-[var(--gold)]" />
          Trustee Access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-[var(--t4)] text-sm">
          Invite a non-beneficiary (estate attorney, fiduciary, family steward) by email. They'll choose their own username and password, verify via email code, and then act on your behalf. Every change they save creates an undoable notification on your account.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-[var(--t4)] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : visibleGrants.length === 0 ? (
          <div className="rounded-xl p-4 text-[var(--t5)] text-sm" style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.15)' }}>
            No trustee invitations sent yet.
          </div>
        ) : (
          <div className="space-y-2">
            {visibleGrants.map(grant => {
              const badge = STATUS_BADGE[grant.is_expired ? 'expired' : (grant.status || 'active')] || STATUS_BADGE.active;
              const isPending = grant.status === 'pending' || grant.status === 'otp_pending';
              return (
                <div
                  key={grant.id}
                  className="rounded-xl p-3"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(var(--gold-rgb), 0.15)' }}
                  data-testid={`trustee-grant-row-${grant.id}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[var(--t)] text-sm font-bold truncate">{grant.trustee_display_name}</p>
                        <span
                          className="text-xs font-bold rounded-full px-2 py-0.5"
                          style={{ background: badge.bg, color: badge.color }}
                          data-testid={`trustee-grant-status-${grant.id}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-[var(--t5)] text-xs mt-1 truncate">
                        <Mail className="w-3 h-3 inline mr-1 -mt-0.5" />
                        {grant.email}
                      </p>
                      {grant.trustee_username && (
                        <p className="text-[var(--t5)] text-xs font-bold">Username: <span className="font-mono">{grant.trustee_username}</span></p>
                      )}
                      <p className="text-[var(--t5)] text-xs">
                        {isPending && grant.claim_token_expires_at ? (
                          <>Invite expires <span className="font-bold">{new Date(grant.claim_token_expires_at).toLocaleString()}</span></>
                        ) : grant.expires_at ? (
                          <>Access expires <span className="font-bold">{new Date(grant.expires_at).toLocaleString()}</span></>
                        ) : (
                          <span className="font-bold">No expiry</span>
                        )}
                        {grant.is_expired && <span className="ml-2 text-red-500 font-bold">EXPIRED</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {isPending && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResend(grant)}
                          disabled={busy}
                          data-testid={`trustee-grant-resend-${grant.id}`}
                          aria-label={`Resend trustee invite to ${grant.email}`}
                          title="Resend invite"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(grant)}
                        disabled={busy}
                        data-testid={`trustee-grant-revoke-${grant.id}`}
                        aria-label={`Revoke trustee access for ${grant.trustee_display_name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {grant.status === 'active' && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[var(--t5)] text-sm">Also access my linked beneficiary accounts</span>
                      <Switch
                        checked={!!grant.include_beneficiaries}
                        onCheckedChange={(next) => handleToggleBeneficiaries(grant, next)}
                        disabled={busy}
                        data-testid={`trustee-grant-beneficiary-toggle-${grant.id}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Invite a new trustee */}
        {!showCreate ? (
          <Button
            variant="outline"
            onClick={() => setShowCreate(true)}
            data-testid="trustee-grant-create-btn"
            className="w-full"
          >
            <UserPlus className="w-4 h-4 mr-2" /> Invite a trustee
          </Button>
        ) : (
          <form onSubmit={handleCreate} className="space-y-3 rounded-xl p-3" style={{ background: 'rgba(var(--gold-rgb), 0.04)', border: '1px solid rgba(var(--gold-rgb), 0.18)' }}>
            <div>
              <label htmlFor="tma-email" className="text-[var(--t)] text-sm font-bold">Trustee email</label>
              <Input
                id="tma-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. attorney@firm.com"
                autoComplete="off"
                data-testid="trustee-create-email"
                required
              />
              <p className="text-[var(--t5)] text-xs mt-1">The invite link will be emailed here. They'll set their own username and password.</p>
            </div>
            <div>
              <label htmlFor="tma-display" className="text-[var(--t)] text-sm font-bold">Display name</label>
              <Input
                id="tma-display"
                value={trusteeDisplayName}
                onChange={(e) => setTrusteeDisplayName(e.target.value)}
                placeholder="e.g. Jane Doe (Attorney)"
                data-testid="trustee-create-displayname"
                required
              />
            </div>
            <div className="flex items-center justify-between">
              <label htmlFor="tma-incl-ben" className="text-[var(--t)] text-sm font-bold">Also grant access to my linked beneficiary accounts</label>
              <Switch
                id="tma-incl-ben"
                checked={includeBeneficiaries}
                onCheckedChange={setIncludeBeneficiaries}
                data-testid="trustee-create-beneficiary-toggle"
              />
            </div>
            <div>
              <label htmlFor="tma-duration" className="text-[var(--t)] text-sm font-bold">Access duration</label>
              <select
                id="tma-duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                data-testid="trustee-create-duration"
                className="w-full mt-1 rounded-md border border-[var(--t6)] bg-transparent text-[var(--t)] px-3 py-2 text-sm"
              >
                {DURATION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-[var(--t5)] text-xs mt-1">Countdown begins when the trustee claims access — not when you send the invite.</p>
            </div>
            {duration === 'custom' && (
              <div>
                <label htmlFor="tma-customdays" className="text-[var(--t)] text-sm font-bold">Number of days</label>
                <Input
                  id="tma-customdays"
                  type="number"
                  min="1"
                  max="3650"
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  data-testid="trustee-create-customdays"
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} data-testid="trustee-create-submit">
                {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Send invite
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm} disabled={busy}>Cancel</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
};

export default TrusteeAccessCard;
