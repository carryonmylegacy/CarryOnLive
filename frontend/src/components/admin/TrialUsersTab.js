import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Clock, Loader2, User, Mail, ChevronDown, ChevronUp, Check, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { ResetTrialModal } from './ResetTrialModal';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const roleColors = {
  benefactor: { bg: 'rgba(37,99,235,0.1)', color: '#60A5FA' },
  beneficiary: { bg: 'rgba(139,92,246,0.1)', color: '#B794F6' },
};

const urgencyColor = (days) => {
  if (days <= 3) return '#EF4444';
  if (days <= 7) return '#F59E0B';
  return '#22C993';
};

// ─── Trial Policy Picker ────────────────────────────────────────
// Global control: founder selects the platform-wide trial duration.
// Reminder cadence is auto-derived per option. Changing the policy
// retroactively shifts every in-progress trial's end date so the
// new policy applies platform-wide.
const TrialPolicyCard = ({ policy, onChange, getAuthHeaders, saving, setSaving, fetchFailed }) => {
  const [expanded, setExpanded] = useState(false);

  // Visible error/retry surface — if the initial fetch failed (e.g.
  // axios timed out under preview-pod contention) we MUST show a
  // recoverable UI rather than silently rendering nothing.
  if (!policy) {
    if (fetchFailed) {
      return (
        <Card className="glass-card" style={{ borderColor: 'rgba(239,68,68,0.25)' }} data-testid="trial-policy-card">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Clock className="w-4 h-4 text-red-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--t)]">Global trial policy unavailable</p>
                <p className="text-[11px] text-[var(--t5)]">Network glitch — retry to load the picker.</p>
              </div>
            </div>
            <button
              onClick={onChange}
              className="px-3 py-1.5 rounded-md text-xs font-bold bg-[var(--gold)]/12 text-[var(--gold)] hover:bg-[var(--gold)]/20"
              data-testid="trial-policy-retry"
            >Retry</button>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  const apply = async (days) => {
    if (days === policy.trial_days) return;
    const cadence = policy.cadence_map?.[String(days)] || [];
    const cadenceText = cadence.length ? cadence.map((d) => `${d}d`).join(' · ') : 'none';
    const ok = window.confirm(
      `Set the global free trial to ${days} days?\n\n` +
      `• Every user currently in trial will have their end date ` +
      `recomputed to (signup date + ${days} days).\n` +
      `• Reminder emails will be queued at: ${cadenceText} before end.\n\n` +
      `Continue?`,
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await axios.put(
        `${API_URL}/admin/trial-policy`,
        { trial_days: days },
        { ...(getAuthHeaders() || {}), timeout: 60000 },
      );
      toast.success(
        `Trial set to ${days} days · ${res.data.users_shifted} user${res.data.users_shifted !== 1 ? 's' : ''} re-scheduled`,
      );
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update trial policy');
    } finally {
      setSaving(false);
    }
  };

  const activeCadence = policy.cadence_map?.[String(policy.trial_days)] || policy.reminder_intervals || [];

  return (
    <Card className="glass-card" style={{ borderColor: 'rgba(212,175,55,0.25)' }} data-testid="trial-policy-card">
      <CardContent className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.12)' }}>
            <Clock className="w-4 h-4 text-[var(--gold)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-[var(--t)]">Global Free Trial Duration</h4>
              <span className="text-[11px] text-[var(--t5)] font-mono">
                Currently <span className="text-[var(--gold)] font-bold">{policy.trial_days} days</span>
              </span>
            </div>
            <p className="text-[11px] text-[var(--t5)] mt-0.5 leading-relaxed">
              Applies to every new signup and the &quot;Reset Trial&quot; admin action. Changing this
              re-stretches every user currently in trial to <em>signup&nbsp;+&nbsp;new duration</em>.
            </p>
          </div>
        </div>

        {/* Picker — pill row */}
        <div className="flex flex-wrap gap-1.5 mb-3" data-testid="trial-policy-pills">
          {(policy.allowed || []).map((d) => {
            const active = d === policy.trial_days;
            return (
              <button
                key={d}
                onClick={() => apply(d)}
                disabled={saving}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  active
                    ? 'bg-[var(--gold)] text-[#0F1629]'
                    : 'bg-[var(--s)] text-[var(--t4)] hover:bg-[var(--gold)]/10 hover:text-[var(--gold)]'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                data-testid={`trial-policy-pill-${d}`}
              >
                {active && <Check className="w-3 h-3 inline mr-1 -mt-0.5" />}
                {d} days
              </button>
            );
          })}
          {saving && <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)] ml-1 mt-1.5" />}
        </div>

        {/* Active cadence */}
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-[var(--t5)]">
          <Mail className="w-3 h-3" />
          <span>Reminder emails:</span>
          {activeCadence.length === 0 ? (
            <span className="italic">none</span>
          ) : (
            activeCadence.map((d, i) => (
              <span key={d} className="inline-flex items-center gap-1">
                <span className="font-mono text-[var(--gold)]">{d}d</span>
                {i < activeCadence.length - 1 && <span>·</span>}
              </span>
            ))
          )}
          <span className="text-[var(--t5)]">before end · 1 expired notice</span>
        </div>

        {/* Toggle to show all cadences */}
        <button
          onClick={() => setExpanded((x) => !x)}
          className="mt-2 text-[11px] text-[var(--t5)] hover:text-[var(--gold)] flex items-center gap-1"
          data-testid="trial-policy-expand"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Hide' : 'Show'} all cadence presets
        </button>
        {expanded && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
            {(policy.allowed || []).map((d) => {
              const cad = policy.cadence_map?.[String(d)] || [];
              return (
                <div key={d} className="flex justify-between gap-2 p-2 rounded-md bg-[var(--s)]">
                  <span className="font-bold text-[var(--t4)]">{d}-day trial</span>
                  <span className="font-mono text-[var(--gold)]">
                    {cad.map((x) => `${x}d`).join(' · ')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const TrialUsersTab = ({ getAuthHeaders }) => {
  const [users, setUsers] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Tracks the most recent policy-fetch outcome. When TRUE the card
  // renders a visible "Network glitch — Retry" surface instead of
  // disappearing. Reset on every successful refetch.
  const [policyFetchFailed, setPolicyFetchFailed] = useState(false);
  // Reset-trial confirmation modal state — the founder taps the
  // Clock icon on a tile, we open the same ResetTrialModal already
  // used in UsersTab. Modal pulls trial duration from the live
  // policy so the "+N days" preview is honest.
  const [resetTrialTarget, setResetTrialTarget] = useState(null);
  const [resettingTrialId, setResettingTrialId] = useState(null);

  const handleResetTrial = async () => {
    if (!resetTrialTarget) return;
    const userId = resetTrialTarget.id;
    setResettingTrialId(userId);
    try {
      const res = await axios.post(
        `${API_URL}/admin/users/${userId}/reset-trial`,
        {},
        getAuthHeaders(),
      );
      // Optimistic local-state update + recompute days_remaining.
      const newEnd = res.data.trial_ends_at;
      let daysLeft = res.data.trial_days;
      try {
        const ends = new Date(newEnd);
        daysLeft = Math.max(0, Math.ceil((ends - new Date()) / 86400000));
      } catch { /* fallback to server-provided trial_days */ }
      setUsers((prev) => prev.map((u) =>
        u.id === userId
          ? { ...u, trial_ends_at: newEnd, days_remaining: daysLeft }
          : u,
      ));
      toast.success(`Trial reset — ${res.data.trial_days} days from today`);
      setResetTrialTarget(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reset trial');
    }
    setResettingTrialId(null);
  };

  const fetchAll = useCallback(async () => {
    // Build auth headers once + extend with a generous 30s timeout so
    // these calls aren't killed by the global 8s axios default during
    // preview-pod parallel-fetch contention (AdminPage fires many
    // admin endpoints concurrently on mount).
    const cfg = { ...(getAuthHeaders() || {}), timeout: 30000 };

    // Use allSettled rather than Promise.all so a slow/timing-out
    // trial-users call (or vice versa) doesn't take down the OTHER
    // fetch with it.
    const [usersRes, policyRes] = await Promise.allSettled([
      axios.get(`${API_URL}/admin/trial-users`, cfg),
      axios.get(`${API_URL}/admin/trial-policy`, cfg),
    ]);
    if (usersRes.status === 'fulfilled') {
      setUsers(usersRes.value.data || []);
    } else {
      toast.error('Failed to load trial users list');
    }
    if (policyRes.status === 'fulfilled') {
      setPolicy(policyRes.value.data);
      setPolicyFetchFailed(false);
    } else {
      setPolicyFetchFailed(true);
      toast.error('Failed to load trial policy');
    }
    setLoading(false);
  }, [getAuthHeaders]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>;

  return (
    <div className="space-y-4" data-testid="trial-users-tab">
      <TrialPolicyCard
        policy={policy}
        onChange={fetchAll}
        getAuthHeaders={getAuthHeaders}
        saving={saving}
        setSaving={setSaving}
        fetchFailed={policyFetchFailed}
      />

      <p className="text-sm text-[var(--t4)]">{users.length} user{users.length !== 1 ? 's' : ''} currently in trial</p>
      {users.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-8 text-center">
          <Clock className="w-10 h-10 mx-auto text-[var(--t5)] mb-3 opacity-40" />
          <p className="text-sm text-[var(--t4)]">No users currently in their trial period.</p>
        </CardContent></Card>
      ) : (
        users.map(u => {
          const rc = roleColors[u.role] || roleColors.benefactor;
          const dc = urgencyColor(u.days_remaining);
          const isResetting = resettingTrialId === u.id;
          return (
            <Card key={u.id} className="glass-card" data-testid={`trial-user-${u.id}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: rc.bg }}>
                  <User className="w-4 h-4" style={{ color: rc.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[var(--t)] truncate">{u.name || u.email}</div>
                  <div className="text-xs text-[var(--t5)] truncate">{u.email}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className="text-xs px-2 py-0.5 rounded-md font-bold capitalize"
                    style={{ background: rc.bg, color: rc.color }}>{u.role}</span>
                  <span className="text-xs font-bold" style={{ color: dc }}>
                    {u.days_remaining} day{u.days_remaining !== 1 ? 's' : ''} left
                  </span>
                </div>
                {/* Reset Trial — same flow as Users tab, just placed
                    on the tile where a trial-period user actually
                    lives. Disabled mid-request. */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[var(--t5)] h-8 w-8 p-0 hover:bg-[var(--s)] hover:text-[var(--gold)] flex-shrink-0"
                  onClick={() => setResetTrialTarget({
                    id: u.id,
                    name: u.name || u.email,
                    role: u.role,
                    trial_ends_at: u.trial_ends_at,
                  })}
                  disabled={isResetting}
                  title={`Reset ${policy?.trial_days || 30}-day free trial`}
                  data-testid={`trial-reset-${u.id}`}
                >
                  {isResetting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <RotateCcw className="w-4 h-4" />}
                </Button>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Reset-trial confirmation modal — same one UsersTab uses,
          mounted once at tab level. trialDays prop drives the
          dynamic body copy + new-end-date preview. */}
      <ResetTrialModal
        resetTarget={resetTrialTarget}
        handleResetTrial={handleResetTrial}
        resetting={resettingTrialId === resetTrialTarget?.id}
        onCancel={() => setResetTrialTarget(null)}
        trialDays={policy?.trial_days || 30}
      />
    </div>
  );
};
