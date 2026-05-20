import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/apiClient';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, UserPlus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
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

/**
 * TrusteeAccessCard — benefactor-side Settings card for Trustee Mode (TMA).
 *
 * Hidden unless the `tma` feature gate is enabled for the user's tier.
 * Completely GREYED OUT (read-only) whenever the active session is a
 * trustee session — the trustee can NEVER manage trustee access for the
 * benefactor.
 */
const TrusteeAccessCard = () => {
  const { user, getAuthHeaders, enabledFeatures } = useAuth();
  // Only render once enabledFeatures has loaded — otherwise we briefly
  // flash the card on every settings open before the gate resolves.
  const tmaEnabled = Array.isArray(enabledFeatures) && enabledFeatures.includes('tma');
  const isTrustee = !!user?.trustee_mode;

  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  // Create form fields
  const [trusteeUsername, setTrusteeUsername] = useState('');
  const [trusteeDisplayName, setTrusteeDisplayName] = useState('');
  const [password, setPassword] = useState('');
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
      // Endpoint may 403 if user can't manage; silently render empty.
      setGrants([]);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTrusteeUsername('');
    setTrusteeDisplayName('');
    setPassword('');
    setIncludeBeneficiaries(false);
    setDuration('indefinite');
    setCustomDays(7);
    setShowCreate(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!trusteeUsername.trim() || !trusteeDisplayName.trim() || password.length < 8) {
      toast.error('Username, display name, and a password of 8+ characters are required.');
      return;
    }
    if (duration === 'custom' && (!customDays || customDays < 1)) {
      toast.error('Enter a positive number of days for custom duration.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`${API_URL}/trustee/grants`, {
        trustee_username: trusteeUsername.trim(),
        trustee_display_name: trusteeDisplayName.trim(),
        password,
        include_beneficiaries: includeBeneficiaries,
        duration,
        custom_days: duration === 'custom' ? Number(customDays) : null,
      }, getAuthHeaders());
      toast.success('Trustee access created.', {
        description: `${trusteeDisplayName} can now sign in using the credentials you set.`,
      });
      resetForm();
      await refresh();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Could not create trustee access.';
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

  // When a trustee is the active session, render the card fully greyed out
  // and read-only. We still tell them what it is so the UI is not blank.
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
          Grant a non-beneficiary (estate attorney, fiduciary, family steward) read/write access to your portal under their own username and password. Every change they save creates an undoable notification on your account.
        </p>

        {/* List of existing grants */}
        {loading ? (
          <div className="flex items-center gap-2 text-[var(--t4)] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : grants.length === 0 ? (
          <div className="rounded-xl p-4 text-[var(--t5)] text-sm" style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.15)' }}>
            No trustee access has been granted yet.
          </div>
        ) : (
          <div className="space-y-2">
            {grants.filter(g => !g.revoked_at).map(grant => (
              <div
                key={grant.id}
                className="rounded-xl p-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(var(--gold-rgb), 0.15)' }}
                data-testid={`trustee-grant-row-${grant.id}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-[var(--t)] text-sm font-bold truncate">{grant.trustee_display_name}</p>
                    <p className="text-[var(--t5)] text-xs font-bold">
                      Username: <span className="font-mono">{grant.trustee_username}</span>
                    </p>
                    <p className="text-[var(--t5)] text-xs">
                      {grant.expires_at
                        ? <>Expires <span className="font-bold">{new Date(grant.expires_at).toLocaleString()}</span></>
                        : <span className="font-bold">No expiry</span>
                      }
                      {grant.is_expired && <span className="ml-2 text-red-500 font-bold">EXPIRED</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
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
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[var(--t5)] text-sm">Also access my linked beneficiary accounts</span>
                  <Switch
                    checked={!!grant.include_beneficiaries}
                    onCheckedChange={(next) => handleToggleBeneficiaries(grant, next)}
                    disabled={busy}
                    data-testid={`trustee-grant-beneficiary-toggle-${grant.id}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create new grant */}
        {!showCreate ? (
          <Button
            variant="outline"
            onClick={() => setShowCreate(true)}
            data-testid="trustee-grant-create-btn"
            className="w-full"
          >
            <UserPlus className="w-4 h-4 mr-2" /> Grant trustee access
          </Button>
        ) : (
          <form onSubmit={handleCreate} className="space-y-3 rounded-xl p-3" style={{ background: 'rgba(var(--gold-rgb), 0.04)', border: '1px solid rgba(var(--gold-rgb), 0.18)' }}>
            <div>
              <label htmlFor="tma-username" className="text-[var(--t)] text-sm font-bold">Trustee username</label>
              <Input
                id="tma-username"
                value={trusteeUsername}
                onChange={(e) => setTrusteeUsername(e.target.value)}
                placeholder="e.g. trustee_jdoe"
                autoComplete="off"
                data-testid="trustee-create-username"
                required
              />
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
            <div>
              <label htmlFor="tma-password" className="text-[var(--t)] text-sm font-bold">Password (min 8 characters)</label>
              <Input
                id="tma-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a strong password"
                autoComplete="new-password"
                data-testid="trustee-create-password"
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
                Create
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
