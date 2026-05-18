import React, { useState, useEffect } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { Search, Users, Trash2, Loader2, ChevronDown, ChevronRight, KeyRound, Unlock, GitBranch, User, AlertTriangle, Zap, ArrowUpDown, ShieldOff, Link2, Clock, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from '../../utils/toast';
import { DeleteUserModal } from './DeleteUserModal';
import { ResetTrialModal } from './ResetTrialModal';
import { API_URL } from '../../config';

const roleColors = {
  benefactor: { bg: 'rgba(37,99,235,0.1)', color: '#60A5FA' },
  beneficiary: { bg: 'rgba(139,92,246,0.1)', color: '#B794F6' },
  admin: { bg: 'rgba(224,173,43,0.1)', color: '#F0C95C' },
};

const statusColors = {
  draft: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444' },
  pending: { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B' },
  sent: { bg: 'rgba(139,92,246,0.12)', color: '#8B5CF6' },
  accepted: { bg: 'rgba(34,201,147,0.12)', color: '#22C993' },
};

export const UsersTab = ({ users, setUsers, currentUserId, getAuthHeaders, operatorMode = false }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [viewMode, setViewMode] = useState('hierarchy'); // 'list' | 'hierarchy' | 'tree'
  const [unlockUserId, setUnlockUserId] = useState(null);
  const [masterKeyInput, setMasterKeyInput] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name, role }
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePw, setShowDeletePw] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingBeta, setTogglingBeta] = useState(null);
  const [togglingExempt, setTogglingExempt] = useState(null);
  const [togglingAiUnlimited, setTogglingAiUnlimited] = useState(null);
  const [resettingTrial, setResettingTrial] = useState(null);
  const [resetTrialTarget, setResetTrialTarget] = useState(null); // { id, name, role, trial_ends_at }
  const [settingTier, setSettingTier] = useState(null);
  const [sortBy, setSortBy] = useState('default');
  // The CURRENT global trial duration. Read once on mount and used
  // for any copy that references "the trial period" (Reset Trial
  // tooltip, modal body, beta-mode toggle toast).
  const [trialDays, setTrialDays] = useState(30);

  useEffect(() => {
    apiClient.get(`${API_URL}/admin/trial-policy`, getAuthHeaders())
      .then((res) => { if (res.data?.trial_days) setTrialDays(res.data.trial_days); })
      .catch(() => { /* default of 30 is safe */ });
  }, [getAuthHeaders]);

  const handleToggleBeta = async (userId, currentBeta) => {
    setTogglingBeta(userId);
    try {
      await apiClient.put(`${API_URL}/admin/user/${userId}/beta`, { is_beta: !currentBeta }, getAuthHeaders());
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_beta_tester: !currentBeta } : u));
      toast.success(!currentBeta ? 'Beta mode activated' : `Beta mode deactivated — ${trialDays}-day grace period started`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to toggle beta');
    }
    setTogglingBeta(null);
  };

  const handleToggleSessionExempt = async (userId, currentExempt) => {
    setTogglingExempt(userId);
    try {
      const res = await apiClient.put(`${API_URL}/admin/users/${userId}/session-exempt`, {}, getAuthHeaders());
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, session_exempt: res.data.session_exempt } : u));
      toast.success(res.data.session_exempt ? 'Multi-session enabled — no lockout or session limits' : 'Multi-session disabled — standard restrictions restored');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to toggle session exemption');
    }
    setTogglingExempt(null);
  };

  const handleToggleAiUnlimited = async (userId, currentVal) => {
    setTogglingAiUnlimited(userId);
    try {
      const res = await apiClient.put(`${API_URL}/admin/users/${userId}/ai-unlimited`, {}, getAuthHeaders());
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ai_unlimited: res.data.ai_unlimited } : u));
      toast.success(res.data.ai_unlimited ? 'AI daily limits removed for this user' : 'AI daily limits restored');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to toggle AI limit override');
    }
    setTogglingAiUnlimited(null);
  };

  const handleResetTrial = async () => {
    if (!resetTrialTarget) return;
    const userId = resetTrialTarget.id;
    setResettingTrial(userId);
    try {
      const res = await apiClient.post(`${API_URL}/admin/users/${userId}/reset-trial`, {}, getAuthHeaders());
      setUsers(prev => prev.map(u => u.id === userId ? {
        ...u,
        trial_ends_at: res.data.trial_ends_at,
        subscription_status: 'trialing',
      } : u));
      toast.success(`Trial reset — ${res.data.trial_days} days from today`);
      setResetTrialTarget(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reset trial');
    }
    setResettingTrial(null);
  };

  const handleSetEstateTier = async (estateId, tier, ownerUserId) => {
    setSettingTier(estateId);
    try {
      await apiClient.put(`${API_URL}/admin/estate/${estateId}/tier`, { tier }, { ...getAuthHeaders(), headers: { ...getAuthHeaders().headers, 'Content-Type': 'application/json' } });
      // Update estate_groups in the local state
      setUsers(prev => prev.map(u => {
        if (u.id !== ownerUserId) return u;
        return {
          ...u,
          estate_groups: (u.estate_groups || []).map(g =>
            g.estate_id === estateId ? { ...g, verified_tier: tier || undefined } : g
          ),
        };
      }));
      toast.success(tier ? `Estate tier set to ${tier}` : 'Estate tier removed');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to set tier');
    }
    setSettingTier(null);
  };

  const filteredUsers = users
    .filter(u => operatorMode ? (u.role !== 'admin' && u.role !== 'operator') : true)
    .filter(u => roleFilter === 'all' || u.role === roleFilter || (roleFilter === 'benefactor' && u.is_also_benefactor) || (roleFilter === 'beneficiary' && u.is_also_beneficiary))
    .filter(u => !searchQuery || u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.email?.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // Admins always on top in the All Estates view
      if (roleFilter === 'all') {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (b.role === 'admin' && a.role !== 'admin') return 1;
      }
      // Apply sort preference
      if (sortBy === 'first_name') {
        return (a.first_name || a.name?.split(' ')[0] || '').localeCompare(b.first_name || b.name?.split(' ')[0] || '');
      }
      if (sortBy === 'last_name') {
        const aLast = a.last_name || (a.name?.split(' ').slice(1).join(' ')) || '';
        const bLast = b.last_name || (b.name?.split(' ').slice(1).join(' ')) || '';
        return aLast.localeCompare(bLast);
      }
      if (sortBy === 'date_created') {
        return (a.created_at || '').localeCompare(b.created_at || '');
      }
      if (sortBy === 'birthday') {
        const aDob = a.date_of_birth || '';
        const bDob = b.date_of_birth || '';
        if (!aDob && !bDob) return 0;
        if (!aDob) return 1;
        if (!bDob) return -1;
        return aDob.localeCompare(bDob);
      }
      if (sortBy === 'most_beneficiaries') {
        return (b.linked_beneficiaries?.length || 0) - (a.linked_beneficiaries?.length || 0);
      }
      if (sortBy === 'least_beneficiaries') {
        return (a.linked_beneficiaries?.length || 0) - (b.linked_beneficiaries?.length || 0);
      }
      // Default sort: alphabetical by name for filtered roles
      if (roleFilter !== 'all') return (a.name || '').localeCompare(b.name || '');
      return 0;
    });

  const toggleExpand = (userId) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget || !deletePassword.trim()) return;
    setDeleting(true);
    try {
      const targetId = deleteTarget.id;
      const targetName = deleteTarget.name;
      await apiClient.delete(`${API_URL}/admin/users/${targetId}?admin_password=${encodeURIComponent(deletePassword)}`, getAuthHeaders());
      // Close modal FIRST so iOS Safari repaints the underlying content
      setDeleteTarget(null);
      setDeletePassword('');
      toast.success(`${targetName} and all associated data deleted`);
      // Update user list after modal is gone (prevents iOS blank-screen rendering bug)
      setTimeout(() => {
        setUsers(prev => prev.filter(u => u.id !== targetId));
      }, 50);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to delete';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const handleUnlockVault = async (userId) => {
    if (!masterKeyInput.trim()) { toast.error('Enter the master key'); return; }
    setUnlocking(true);
    try {
      const res = await apiClient.post(`${API_URL}/admin/user/${userId}/unlock-all-documents`,
        { master_key: masterKeyInput },
        { headers: { ...getAuthHeaders()?.headers, 'Content-Type': 'application/json' } }
      );
      toast.error(`Unlocked ${res.data.unlocked_count} document(s). User must re-lock individually.`);
      setMasterKeyInput('');
      setUnlockUserId(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Master key does not match');
    } finally {
      setUnlocking(false);
    }
  };

  // User row component shared between list and tree views
  const UserRow = ({ u, indent = false }) => {
    const rc = roleColors[u.role] || roleColors.benefactor;
    const hasBens = u.linked_beneficiaries?.length > 0;
    const isExpanded = expandedUsers.has(u.id);

    // Billing status border colors
    const billingStatus = u.billing_status || 'active';
    const borderStyle = billingStatus === 'dormant'
      ? { border: '2px solid #EF4444', boxShadow: '0 0 8px rgba(239,68,68,0.2)' }
      : (billingStatus === 'grace_period' || billingStatus === 'trial')
        ? { border: '2px solid #F5A623', boxShadow: '0 0 8px rgba(245,166,35,0.2)' }
        : {};

    return (
      <React.Fragment key={u.id}>
        <div className={`glass-card p-3 ${indent ? 'ml-6 sm:ml-8 border-l-2 border-[var(--b)]' : ''}`} style={borderStyle} data-testid={`admin-user-${u.id}`}>
          <div className="flex items-start gap-2.5">
            {/* Tree toggle for benefactors with beneficiaries (tree mode only) */}
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: rc.bg, color: rc.color }}>
              {u.name ? u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[var(--t)] text-sm">{u.name || 'No name'}</div>
              <div className="text-xs text-[var(--t4)]">{u.email}</div>
              {u.subscription?.plan_id && (
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[11px] px-1.5 py-0.5 rounded font-bold capitalize" style={{ background: 'rgba(var(--gold-rgb), 0.1)', color: '#d4af37' }}>
                    {u.subscription.plan_name || u.subscription.plan_id}
                  </span>
                  <span className="text-[11px] text-[var(--t5)] capitalize">{u.subscription.billing_cycle || 'monthly'}</span>
                  {u.subscription.beta_plan && <span className="text-[11px] text-purple-400">(beta)</span>}
                </div>
              )}
              {/* Per-estate tier selectors — Founder only */}
              {!operatorMode && (u.role === 'benefactor' || u.is_also_benefactor) && (u.estate_groups || []).length > 0 && (
                <div className="flex flex-col gap-1 mt-1">
                  {(u.estate_groups || []).map(g => (
                    <div key={g.estate_id} className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[var(--t5)]" style={{ whiteSpace: 'nowrap' }}>
                        {g.estate_name}:
                      </span>
                      <select
                        value={g.verified_tier || ''}
                        onChange={(e) => handleSetEstateTier(g.estate_id, e.target.value, u.id)}
                        disabled={settingTier === g.estate_id}
                        className="text-[11px] px-1.5 py-0.5 rounded font-semibold capitalize cursor-pointer"
                        style={{
                          background: g.verified_tier ? 'rgba(var(--gold-rgb), 0.1)' : 'rgba(100,116,139,0.1)',
                          color: g.verified_tier ? '#d4af37' : 'var(--t5)',
                          border: '1px solid rgba(var(--gold-rgb), 0.15)',
                          outline: 'none',
                          fontSize: '11px',
                          minWidth: 80,
                        }}
                        data-testid={`tier-select-${g.estate_id}`}
                        title={`Feature gate tier for ${g.estate_name}`}
                      >
                        <option value="">No Tier</option>
                        <option value="premium">Premium</option>
                        <option value="standard">Standard</option>
                        <option value="base">Base</option>
                        <option value="new_adult">New Adult</option>
                        <option value="military">Military</option>
                        <option value="hospice">Hospice</option>
                        <option value="veteran">Veteran</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Badges + actions row */}
          <div className="flex items-center justify-between mt-2 ml-11">
            <div className="flex items-center gap-1 flex-wrap">
            <span
              className="text-xs px-2 py-0.5 rounded-md font-bold capitalize"
              style={{ background: rc.bg, color: rc.color }}
              data-testid={`admin-role-badge-${u.id}`}
            >
              {u.role}
            </span>
            {u.is_also_beneficiary && u.role !== 'beneficiary' && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
                + Beneficiary
              </span>
            )}
            {u.is_also_benefactor && u.role !== 'benefactor' && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: 'rgba(37,99,235,0.12)', color: '#60a5fa' }}>
                + Benefactor
              </span>
            )}
            {billingStatus === 'grace_period' && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold"
                style={{ background: 'rgba(245,166,35,0.15)', color: '#F5A623', border: '1px solid rgba(245,166,35,0.3)' }}
                data-testid={`billing-grace-${u.id}`}>
                GRACE {u.grace_days_remaining != null ? `${u.grace_days_remaining}d` : ''}
              </span>
            )}
            {billingStatus === 'trial' && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold"
                style={{ background: 'rgba(245,166,35,0.15)', color: '#F5A623', border: '1px solid rgba(245,166,35,0.3)' }}
                data-testid={`billing-trial-${u.id}`}>
                TRIAL {u.trial_days_remaining != null ? `${u.trial_days_remaining}d` : ''}
              </span>
            )}
            {billingStatus === 'dormant' && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}
                data-testid={`billing-dormant-${u.id}`}>
                DORMANT
              </span>
            )}
            {u.is_beta_tester && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold"
                style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}
                data-testid={`beta-badge-${u.id}`}>
                BETA
              </span>
            )}
            {u.session_exempt && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold"
                style={{ background: 'rgba(34,211,238,0.15)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)' }}
                data-testid={`exempt-badge-${u.id}`}>
                MULTI-SESSION
              </span>
            )}
            {u.ai_unlimited && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold"
                style={{ background: 'rgba(var(--gold-rgb), 0.15)', color: '#d4af37', border: '1px solid rgba(var(--gold-rgb), 0.3)' }}
                data-testid={`ai-unlimited-badge-${u.id}`}>
                AI ∞
              </span>
            )}
          </div>
          {u.id !== currentUserId && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {(u.role === 'benefactor' || u.role === 'beneficiary') && !operatorMode && (
                <Button variant="ghost" size="sm"
                  className={`h-8 w-8 p-0 hover:bg-[var(--s)] hover:text-current ${u.is_beta_tester ? 'text-[#fbbf24]' : 'text-[var(--t5)]'}`}
                  onClick={() => handleToggleBeta(u.id, u.is_beta_tester)}
                  disabled={togglingBeta === u.id}
                  title={u.is_beta_tester ? 'Remove from Beta' : 'Add to Beta'}
                  data-testid={`beta-toggle-${u.id}`}>
                  {togglingBeta === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                </Button>
              )}
              {!operatorMode && (
                <Button variant="ghost" size="sm"
                  className={`h-8 w-8 p-0 hover:bg-[var(--s)] hover:text-current ${u.session_exempt ? 'text-[#22d3ee]' : 'text-[var(--t5)]'}`}
                  onClick={() => handleToggleSessionExempt(u.id, u.session_exempt)}
                  disabled={togglingExempt === u.id}
                  title={u.session_exempt ? 'Disable multi-session (restore lockout + single-session)' : 'Enable multi-session (no lockout, simultaneous logins allowed)'}
                  data-testid={`session-exempt-toggle-${u.id}`}>
                  {togglingExempt === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                </Button>
              )}
              {!operatorMode && (
                <Button variant="ghost" size="sm"
                  className={`h-8 w-8 p-0 hover:bg-[var(--s)] hover:text-current ${u.ai_unlimited ? 'text-[#d4af37]' : 'text-[var(--t5)]'}`}
                  onClick={() => handleToggleAiUnlimited(u.id, u.ai_unlimited)}
                  disabled={togglingAiUnlimited === u.id}
                  title={u.ai_unlimited ? 'Restore daily AI limits (1/day IAC, 10/day EGA)' : 'Remove daily AI limits for this user'}
                  data-testid={`ai-unlimited-toggle-${u.id}`}>
                  {togglingAiUnlimited === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                </Button>
              )}
              {(u.role === 'benefactor' || u.role === 'beneficiary') && (
                <Button variant="ghost" size="sm" className="text-[var(--t5)] h-8 w-8 p-0 hover:bg-[var(--s)] hover:text-current"
                  onClick={() => { setUnlockUserId(unlockUserId === u.id ? null : u.id); setMasterKeyInput(''); }}
                  title="Vault Unlock" data-testid={`vault-unlock-${u.id}`}>
                  <KeyRound className="w-4 h-4" />
                </Button>
              )}
              {(u.role === 'benefactor' || u.role === 'beneficiary') && !operatorMode && (
                <Button variant="ghost" size="sm" className="text-[var(--t5)] h-8 w-8 p-0 hover:bg-[var(--s)] hover:text-current"
                  onClick={() => setResetTrialTarget({ id: u.id, name: u.name, role: u.role, trial_ends_at: u.trial_ends_at })}
                  disabled={resettingTrial === u.id}
                  title={`Reset ${trialDays}-day free trial`} data-testid={`admin-reset-trial-${u.id}`}>
                  {resettingTrial === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                </Button>
              )}
              {!operatorMode && (
              <Button variant="ghost" size="sm" className="text-[var(--rd)] hover:bg-[var(--rdbg)] hover:text-[var(--rd)] h-8 w-8 p-0" onClick={() => { setDeleteTarget({ id: u.id, name: u.name, role: u.role }); setDeletePassword(''); setShowDeletePw(false); }} data-testid={`admin-delete-user-${u.id}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
              )}
            </div>
          )}
          </div>
        </div>
        {unlockUserId === u.id && (
          <div className={`px-3 pb-3 -mt-1 ${indent ? 'ml-8' : ''}`}>
            <div className="p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <p className="text-xs text-[var(--t4)] mb-2">Enter the master key spoken by <strong>{u.name}</strong> to unlock all their vault documents.</p>
              <div className="flex gap-2">
                <Input value={masterKeyInput} onChange={(e) => setMasterKeyInput(e.target.value)}
                  placeholder="Master key" className="input-field text-sm flex-1" data-testid="admin-master-key-input" />
                <Button size="sm" disabled={unlocking || !masterKeyInput.trim()}
                  onClick={() => handleUnlockVault(u.id)}
                  style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white' }}
                  data-testid="admin-unlock-all-btn">
                  {unlocking ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Unlock className="w-3 h-3 mr-1" />}
                  Unlock All
                </Button>
              </div>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  };

  // Beneficiary row in tree view (linked but not yet a user)
  const BeneficiaryLeaf = ({ ben }) => {
    const sc = statusColors[ben.invitation_status] || statusColors.draft;
    const [showLink, setShowLink] = useState(false);
    const [linkInput, setLinkInput] = useState('');
    const [linking, setLinking] = useState(false);
    const needsLink = ben.invitation_status !== 'accepted';

    const handleForceLink = async () => {
      if (!linkInput.trim()) return;
      setLinking(true);
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem('carryon_token')}` };
        const res = await apiClient.post(`${API_URL}/beneficiaries/force-link`, {
          beneficiary_id: ben.id,
          username_or_email: linkInput.trim(),
        }, { headers });
        toast.success(res.data.message);
        setShowLink(false);
        setLinkInput('');
        // Refresh user list to reflect the status change
        try {
          const usersRes = await apiClient.get(`${API_URL}/admin/users`, { headers });
          setUsers(usersRes.data);
        } catch { /* ignore refresh error */ }
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to link');
      } finally {
        setLinking(false);
      }
    };

    return (
      <div className="py-2 px-3" data-testid={`tree-ben-${ben.id}`}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
            style={{ background: 'rgba(139,92,246,0.1)', color: '#B794F6' }}>
            {ben.name ? ben.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[var(--t3)] text-xs truncate">{ben.name || 'Unnamed'}</div>
            <div className="text-[11px] text-[var(--t5)] truncate">{ben.email || 'No email'} · {ben.relation || 'beneficiary'}</div>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full font-bold capitalize" style={{ background: sc.bg, color: sc.color }}>
            {ben.invitation_status || 'draft'}
          </span>
          {needsLink && (
            <button
              onClick={() => setShowLink(!showLink)}
              className="ml-1 flex items-center gap-1 px-2 py-1 rounded-lg transition-colors"
              style={{ background: 'rgba(224,173,43,0.15)', border: '1px solid rgba(224,173,43,0.3)' }}
              title="Force-link to user account"
              data-testid={`force-link-btn-${ben.id}`}
            >
              <Link2 className="w-3 h-3 text-[var(--gold)]" />
              <span className="text-[11px] font-bold text-[var(--gold)]">Link</span>
            </button>
          )}
        </div>
        {showLink && (
          <div className="mt-2 ml-10 flex items-center gap-2">
            <Input
              value={linkInput}
              onChange={e => setLinkInput(e.target.value)}
              placeholder="Username or email"
              className="h-7 text-xs flex-1"
              data-testid={`force-link-input-${ben.id}`}
              onKeyDown={e => e.key === 'Enter' && handleForceLink()}
            />
            <Button
              size="sm"
              onClick={handleForceLink}
              disabled={linking || !linkInput.trim()}
              className="h-7 text-xs px-3"
              data-testid={`force-link-submit-${ben.id}`}
            >
              {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Link'}
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Helper: calculate age from DOB
  const getAge = (dob) => {
    if (!dob) return 999;
    const d = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    return age;
  };

  // Sort estate entries based on sortBy preference (shared by hierarchy + graph views)
  const sortEstateEntries = (entries) => {
    return [...entries].sort((a, b) => {
      if (sortBy === 'first_name') {
        return (a.owner.first_name || a.owner.name?.split(' ')[0] || '').localeCompare(b.owner.first_name || b.owner.name?.split(' ')[0] || '');
      }
      if (sortBy === 'last_name') {
        const aLast = a.owner.last_name || (a.owner.name?.split(' ').slice(1).join(' ')) || '';
        const bLast = b.owner.last_name || (b.owner.name?.split(' ').slice(1).join(' ')) || '';
        return aLast.localeCompare(bLast);
      }
      if (sortBy === 'date_created') {
        return (a.owner.created_at || '').localeCompare(b.owner.created_at || '');
      }
      if (sortBy === 'birthday') {
        const aDob = a.owner.date_of_birth || '';
        const bDob = b.owner.date_of_birth || '';
        if (!aDob && !bDob) return 0;
        if (!aDob) return 1;
        if (!bDob) return -1;
        return aDob.localeCompare(bDob);
      }
      if (sortBy === 'most_beneficiaries') {
        return (b.beneficiaries?.length || b.bens?.length || 0) - (a.beneficiaries?.length || a.bens?.length || 0);
      }
      if (sortBy === 'least_beneficiaries') {
        return (a.beneficiaries?.length || a.bens?.length || 0) - (b.beneficiaries?.length || b.bens?.length || 0);
      }
      // Default: sort by age (youngest first)
      return getAge(a.owner.date_of_birth) - getAge(b.owner.date_of_birth);
    });
  };

  // Beneficiary-centric view: shows each beneficiary as root with connected estates underneath
  const renderBeneficiaryCentricView = () => {
    // Build reverse map: beneficiary email → estates/benefactors they belong to
    const allBenefactors = users.filter(u => u.role === 'benefactor' || u.is_also_benefactor);
    const estatesByBenEmail = new Map();

    allBenefactors.forEach(owner => {
      const groups = owner.estate_groups || [];
      if (groups.length > 0) {
        groups.forEach(group => {
          (group.beneficiaries || []).forEach(ben => {
            if (ben.email) {
              const email = ben.email.toLowerCase();
              if (!estatesByBenEmail.has(email)) estatesByBenEmail.set(email, []);
              estatesByBenEmail.get(email).push({
                owner,
                estateName: group.estate_name || `${owner.name}'s Estate`,
                relation: ben.relation || 'beneficiary',
              });
            }
          });
        });
      } else {
        (owner.linked_beneficiaries || []).forEach(ben => {
          if (ben.email) {
            const email = ben.email.toLowerCase();
            if (!estatesByBenEmail.has(email)) estatesByBenEmail.set(email, []);
            estatesByBenEmail.get(email).push({
              owner,
              estateName: `${owner.name}'s Estate`,
              relation: ben.relation || 'beneficiary',
            });
          }
        });
      }
    });

    return (
      <div className="space-y-3">
        {filteredUsers.map(benUser => {
          const connectedEstates = estatesByBenEmail.get(benUser.email?.toLowerCase()) || [];
          const isExpanded = expandedUsers.has(benUser.id);

          return (
            <div key={benUser.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)', background: 'rgba(255,255,255,0.01)' }}>
              {connectedEstates.length > 0 && (
                <button
                  onClick={() => toggleExpand(benUser.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--s)]"
                  data-testid={`ben-header-${benUser.id}`}
                >
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    {isExpanded ? <ChevronDown className="w-4 h-4" style={{ color: '#B794F6' }} /> : <ChevronRight className="w-4 h-4 text-[var(--t5)]" />}
                  </div>
                  <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.1)' }}>
                    <User className="w-3.5 h-3.5" style={{ color: '#B794F6' }} />
                  </div>
                  <span className="text-xs font-bold flex-1" style={{ color: '#B794F6' }}>
                    Connected to {connectedEstates.length} estate{connectedEstates.length !== 1 ? 's' : ''}
                  </span>
                </button>
              )}

              <div className="px-2 pb-1">
                <UserRow u={benUser} />
              </div>

              {isExpanded && connectedEstates.length > 0 && (
                <div className="pb-3 px-2">
                  <div className="ml-4 sm:ml-6 rounded-lg overflow-hidden" style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.1)' }}>
                    <div style={{ borderLeft: '4px solid rgba(37,99,235,0.5)' }}>
                      {connectedEstates.map((estate, idx) => (
                        <div key={`${estate.owner.id}-${idx}`} className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} data-testid={`ben-estate-${estate.owner.id}`}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                            style={{ background: roleColors.benefactor.bg, color: roleColors.benefactor.color }}>
                            {estate.owner.name ? estate.owner.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-[var(--t)] text-xs truncate">{estate.estateName}</div>
                            <div className="text-[11px] text-[var(--t5)] truncate">{estate.owner.name}<span className="capitalize"> · {estate.relation}</span></div>
                          </div>
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: roleColors.benefactor.bg, color: roleColors.benefactor.color }}>
                            estate
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredUsers.length === 0 && (
          <div className="text-center py-8 text-xs text-[var(--t5)]">No beneficiaries found</div>
        )}
      </div>
    );
  };

  // Tree view: group by ESTATE, benefactors at top sorted by age, beneficiaries indented below sorted by age
  const renderTreeView = () => {
    // Beneficiary filter: use flipped relationship view
    if (roleFilter === 'beneficiary') {
      return renderBeneficiaryCentricView();
    }

    const benefactors = filteredUsers.filter(u => u.role === 'benefactor' || u.is_also_benefactor);
    const beneficiaryUsers = filteredUsers.filter(u => u.role === 'beneficiary' && !u.is_also_benefactor);
    const admins = filteredUsers.filter(u => u.role === 'admin');

    // Build email lookup for ALL potential beneficiaries (including dual-role benefactors)
    const benUserByEmail = new Map();
    filteredUsers.forEach(u => {
      if (u.email && (u.role === 'beneficiary' || u.is_also_beneficiary)) {
        benUserByEmail.set(u.email.toLowerCase(), u);
      }
    });

    // Build estate map: each estate is a separate entry (supports multi-estate owners)
    const estateEntries = [];

    benefactors.forEach(owner => {
      const groups = owner.estate_groups || [];
      if (groups.length > 0) {
        groups.forEach(group => {
          const bens = group.beneficiaries || [];
          estateEntries.push({
            key: `${owner.id}-${group.estate_id}`,
            owner,
            estateName: group.estate_name || `${owner.name || 'Unknown'}'s Estate`,
            beneficiaries: bens,
            linkedUsers: bens
              .map(b => b.email ? benUserByEmail.get(b.email.toLowerCase()) : null)
              .filter(Boolean),
          });
        });
      } else {
        // Fallback for users without estate_groups
        const bens = owner.linked_beneficiaries || [];
        estateEntries.push({
          key: owner.id,
          owner,
          estateName: `${owner.name || 'Unknown'}'s Estate`,
          beneficiaries: bens,
          linkedUsers: bens
            .map(b => b.email ? benUserByEmail.get(b.email.toLowerCase()) : null)
            .filter(Boolean),
        });
      }
    });

    // Track shown beneficiary user IDs so we can show orphans
    const shownBenIds = new Set();
    estateEntries.forEach(estate => {
      estate.linkedUsers.forEach(u => shownBenIds.add(u.id));
    });
    const orphans = beneficiaryUsers.filter(u => !shownBenIds.has(u.id));

    // Sort estates based on user's sort preference
    const sortedEstates = sortEstateEntries(estateEntries);

    return (
      <div className="space-y-3">
        {admins.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2">Administrators</p>
            <div className="space-y-2">
              {admins.map(u => <UserRow key={u.id} u={u} />)}
            </div>
          </div>
        )}

        {sortedEstates.map(({ key, owner, estateName, beneficiaries: bens, linkedUsers }) => {
          const isExpanded = expandedUsers.has(key);

          // Sort linked beneficiaries by age
          const sortedLinkedUsers = [...linkedUsers].sort((a, b) => getAge(a.date_of_birth) - getAge(b.date_of_birth));
          const linkedEmails = new Set(linkedUsers.map(u => u.email?.toLowerCase()));
          const nonUserBens = bens
            .filter(b => !b.email || !linkedEmails.has(b.email.toLowerCase()))
            .sort((a, b) => getAge(a.date_of_birth || a.dob) - getAge(b.date_of_birth || b.dob));

          return (
            <div key={key} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)', background: 'rgba(255,255,255,0.01)' }}>
              {/* Estate header */}
              <button
                onClick={() => toggleExpand(key)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--s)]"
                data-testid={`estate-header-${key}`}
              >
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--gold)]" /> : <ChevronRight className="w-4 h-4 text-[var(--t5)]" />}
                </div>
                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(var(--gold-rgb), 0.1)' }}>
                  <Users className="w-3.5 h-3.5 text-[var(--gold)]" />
                </div>
                <span className="text-xs font-bold text-[var(--gold)] flex-1">{estateName}</span>
                <span className="text-[11px] text-[var(--t5)] px-2 py-0.5 rounded-full" style={{ background: 'var(--s)' }}>
                  {bens.length} beneficiar{bens.length === 1 ? 'y' : 'ies'}
                </span>
              </button>

              {/* Always show the benefactor row */}
              <div className="px-2 pb-1">
                <UserRow u={owner} />
              </div>

              {/* Expanded: beneficiaries in a polished nested container */}
              {isExpanded && (() => {
                const benEntryByEmail = new Map();
                bens.forEach(b => { if (b.email) benEntryByEmail.set(b.email.toLowerCase(), b); });
                const hasChildren = sortedLinkedUsers.length > 0 || nonUserBens.length > 0;
                return hasChildren ? (
                  <div className="pb-3 px-2">
                    <div className="ml-4 sm:ml-6 rounded-lg overflow-hidden" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.1)' }}>
                      <div style={{ borderLeft: '4px solid rgba(139,92,246,0.5)' }}>
                        {sortedLinkedUsers.map(bu => {
                          const benEntry = benEntryByEmail.get(bu.email?.toLowerCase());
                          const relation = benEntry?.relation || '';
                          const invStatus = benEntry?.invitation_status || '';
                          const sc = statusColors[invStatus] || statusColors.accepted;
                          const needsStatusFix = benEntry && invStatus !== 'accepted';
                          return (
                            <div key={bu.id} className="px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} data-testid={`tree-child-${bu.id}`}>
                              <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                                style={{ background: roleColors.beneficiary.bg, color: roleColors.beneficiary.color }}>
                                {bu.name ? bu.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-[var(--t)] text-xs truncate">{bu.name || 'No name'}</div>
                                <div className="text-[11px] text-[var(--t5)] truncate">
                                  {bu.email}{relation && <span className="capitalize"> · {relation}</span>}
                                </div>
                              </div>
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold capitalize" style={{ background: sc.bg, color: sc.color }}>
                                {invStatus || 'active'}
                              </span>
                              {needsStatusFix && (
                                <button
                                  onClick={async () => {
                                    try {
                                      const headers = { Authorization: `Bearer ${localStorage.getItem('carryon_token')}` };
                                      await apiClient.post(`${API_URL}/beneficiaries/force-link`, {
                                        beneficiary_id: benEntry.id,
                                        username_or_email: bu.email || bu.username,
                                      }, { headers });
                                      toast.success(`Linked ${bu.name} successfully`);
                                      const usersRes = await apiClient.get(`${API_URL}/admin/users`, { headers });
                                      setUsers(usersRes.data);
                                    } catch (err) {
                                      toast.error(err.response?.data?.detail || 'Failed to link');
                                    }
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors"
                                  style={{ background: 'rgba(224,173,43,0.15)', border: '1px solid rgba(224,173,43,0.3)' }}
                                  data-testid={`force-link-user-${bu.id}`}
                                >
                                  <Link2 className="w-3 h-3 text-[var(--gold)]" />
                                  <span className="text-[11px] font-bold text-[var(--gold)]">Link</span>
                                </button>
                              )}
                              {bu.id !== currentUserId && !operatorMode && (
                                <Button variant="ghost" size="sm" className="text-[var(--rd)] hover:bg-[var(--rdbg)] hover:text-[var(--rd)] h-6 w-6 p-0" onClick={() => { setDeleteTarget({ id: bu.id, name: bu.name, role: bu.role }); setDeletePassword(''); setShowDeletePw(false); }}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                              </div>
                            </div>
                          );
                        })}
                        {nonUserBens.map(ben => (
                          <div key={ben.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <BeneficiaryLeaf ben={ben} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pb-3 px-2">
                    <div className="ml-4 sm:ml-6 py-2.5 pl-4 text-xs text-[var(--t5)] italic rounded-lg" style={{ borderLeft: '4px solid rgba(139,92,246,0.15)', background: 'rgba(139,92,246,0.02)' }}>
                      No beneficiaries enrolled yet
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}

        {/* Orphan beneficiary users */}
        {orphans.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2 mt-4">
              Unlinked Beneficiaries ({orphans.length})
            </p>
            <div className="space-y-2">
              {orphans.map(u => <UserRow key={u.id} u={u} />)}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Graph view: HTML/CSS-based visual family tree per estate (matches Estate Health style)
  const renderGraphView = () => {
    const benefactors = filteredUsers.filter(u => u.role === 'benefactor' || u.is_also_benefactor);
    const beneficiaryUsers = filteredUsers.filter(u => u.role === 'beneficiary' && !u.is_also_benefactor);
    const admins = filteredUsers.filter(u => u.role === 'admin');
    const benUserByEmail = new Map();
    filteredUsers.forEach(u => {
      if (u.email && (u.role === 'beneficiary' || u.is_also_beneficiary)) {
        benUserByEmail.set(u.email.toLowerCase(), u);
      }
    });

    const estateEntries = [];
    benefactors.forEach(owner => {
      const groups = owner.estate_groups || [];
      if (groups.length > 0) {
        groups.forEach(group => {
          estateEntries.push({ key: `${owner.id}-${group.estate_id}`, owner, estateName: group.estate_name || `${owner.name}'s Estate`, bens: group.beneficiaries || [] });
        });
      } else {
        estateEntries.push({ key: owner.id, owner, estateName: `${owner.name}'s Estate`, bens: owner.linked_beneficiaries || [] });
      }
    });
    const estates = sortEstateEntries(estateEntries);

    const getInit = (n) => n?.name ? n.name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2) : '??';
    const benAge = (b) => { const a = getAge(b.date_of_birth || b.dob); return a < 999 ? a : null; };

    // Status badge overlay for beneficiary nodes
    const getBenStatusBadge = (ben) => {
      const linked = ben.email && benUserByEmail.has(ben.email.toLowerCase());
      if (linked) return { bg: statusColors.accepted.color, label: 'accepted' };
      const s = ben.invitation_status || 'draft';
      const sc = statusColors[s] || statusColors.draft;
      return { bg: sc.color, label: s };
    };

    const getBenNodeColor = (ben) => {
      const linked = ben.email && benUserByEmail.has(ben.email.toLowerCase());
      if (linked) return statusColors.accepted.color;
      const s = ben.invitation_status || 'draft';
      return (statusColors[s] || statusColors.draft).color;
    };

    // Graph node with status badge
    const GraphNode = ({ initials, color, size = 44, label, sublabel, statusBadge, extra }) => (
      <div className="flex flex-col items-center gap-0.5">
        <div className="relative">
          <div
            className="rounded-full flex items-center justify-center font-bold"
            style={{
              width: size, height: size,
              background: `${color}20`,
              fontSize: size * 0.3,
              color: color,
              border: `2px solid ${color}`,
              boxShadow: `0 0 10px ${color}30`,
            }}
          >
            {initials}
          </div>
          {statusBadge && (
            <div className="absolute -bottom-0.5 -right-0.5 px-1 py-px rounded-full text-[11px] font-black uppercase"
              style={{ background: statusBadge.bg, color: 'var(--bg)', lineHeight: '1.1' }}>
              {statusBadge.label === 'accepted' ? '✓' : statusBadge.label[0].toUpperCase()}
            </div>
          )}
        </div>
        {label && <span className="text-[11px] font-semibold text-[var(--t)] text-center leading-tight">{label}</span>}
        {sublabel && <span className="text-[11px] text-[#64748B] text-center leading-tight">{sublabel}</span>}
        {extra && <span className="text-[11px] text-center leading-tight" style={{ color: statusBadge?.bg || '#64748B' }}>{extra}</span>}
      </div>
    );

    return (
      <div className="space-y-4">
        {roleFilter === 'beneficiary' ? (() => {
          // INVERSE GRAPH: beneficiary as root, connected estates as children
          const allBenefactors = users.filter(u => u.role === 'benefactor' || u.is_also_benefactor);
          const estatesByBenEmail = new Map();
          allBenefactors.forEach(owner => {
            const groups = owner.estate_groups || [];
            if (groups.length > 0) {
              groups.forEach(group => {
                (group.beneficiaries || []).forEach(ben => {
                  if (ben.email) {
                    const email = ben.email.toLowerCase();
                    if (!estatesByBenEmail.has(email)) estatesByBenEmail.set(email, []);
                    estatesByBenEmail.get(email).push({ owner, estateName: group.estate_name || `${owner.name}'s Estate`, relation: ben.relation || '' });
                  }
                });
              });
            } else {
              (owner.linked_beneficiaries || []).forEach(ben => {
                if (ben.email) {
                  const email = ben.email.toLowerCase();
                  if (!estatesByBenEmail.has(email)) estatesByBenEmail.set(email, []);
                  estatesByBenEmail.get(email).push({ owner, estateName: `${owner.name}'s Estate`, relation: ben.relation || '' });
                }
              });
            }
          });

          return filteredUsers.map(benUser => {
            const connectedEstates = estatesByBenEmail.get(benUser.email?.toLowerCase()) || [];
            return (
              <div key={benUser.id} className="glass-card p-4 rounded-xl" data-testid={`graph-ben-${benUser.id}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
                    <Users className="w-3 h-3" style={{ color: '#B794F6' }} />
                  </div>
                  <span className="text-xs font-bold flex-1" style={{ color: '#B794F6' }}>{benUser.name || 'Beneficiary'}</span>
                  <span className="text-[11px] text-[var(--t5)]">{connectedEstates.length} estate{connectedEstates.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="flex flex-col items-center">
                  <GraphNode
                    initials={getInit(benUser)}
                    color={roleColors.beneficiary.color}
                    size={52}
                    label={benUser.name?.split(' ')[0] || 'Beneficiary'}
                  />

                  {connectedEstates.length > 0 && (() => {
                    return (
                    <div className="flex flex-col items-center w-full">
                      <div className="flex justify-center gap-5 flex-wrap pt-1">
                        {connectedEstates.map((estate, idx) => (
                          <div key={`${estate.owner.id}-${idx}`} className="flex flex-col items-center">
                            <GraphNode
                              initials={getInit(estate.owner)}
                              color="#d4af37"
                              size={40}
                              label={estate.estateName.split("'")[0] || 'Estate'}
                              sublabel={estate.relation}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  })()}

                  {connectedEstates.length === 0 && (
                    <p className="text-[11px] text-[var(--t5)] mt-2 italic">No connected estates</p>
                  )}
                </div>
              </div>
            );
          });
        })() : (<>
        {admins.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2">Administrators</p>
            <div className="space-y-2">
              {admins.map(u => <UserRow key={u.id} u={u} />)}
            </div>
          </div>
        )}

        {estates.map(({ key, owner, estateName, bens }) => {
          const sortedBens = [...bens].sort((a, b) => getAge(a.date_of_birth || a.dob) - getAge(b.date_of_birth || b.dob));
          const linked = sortedBens.filter(b => b.email && benUserByEmail.has(b.email.toLowerCase())).length;
          const invited = sortedBens.filter(b => b.invitation_status === 'sent' || b.invitation_status === 'accepted').length;

          return (
            <div key={key} className="glass-card p-4 rounded-xl" data-testid={`graph-estate-${key}`}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'rgba(var(--gold-rgb), 0.1)' }}>
                  <Users className="w-3 h-3 text-[var(--gold)]" />
                </div>
                <span className="text-xs font-bold text-[var(--gold)] flex-1">{estateName}</span>
                <span className="text-[11px] text-[var(--t5)]">{bens.length} beneficiar{bens.length === 1 ? 'y' : 'ies'}</span>
              </div>

              {/* Summary stats */}
              <div className="flex items-center gap-3 mb-3 ml-7">
                <span className="text-[11px]" style={{ color: linked === bens.length && bens.length > 0 ? '#22C993' : '#F5A623' }}>
                  {linked}/{bens.length} linked
                </span>
                <span className="text-[11px]" style={{ color: invited > 0 ? '#8B5CF6' : '#64748B' }}>
                  {invited} invited
                </span>
                {owner.subscription?.plan_id && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(var(--gold-rgb), 0.1)', color: '#d4af37' }}>
                    {owner.subscription.plan_name || owner.subscription.plan_id}
                  </span>
                )}
              </div>

              {/* Tree visualization */}
              <div className="flex flex-col items-center">
                <GraphNode
                  initials={getInit(owner)}
                  color="#d4af37"
                  size={52}
                  label={owner.name?.split(' ')[0] || 'Owner'}
                />

                {sortedBens.length > 0 && (() => {
                  return (
                  <div className="flex flex-col items-center w-full">
                    <div className="flex justify-center gap-5 flex-wrap pt-1">
                      {sortedBens.map((ben) => {
                        const color = getBenNodeColor(ben);
                        const age = benAge(ben);
                        const badge = getBenStatusBadge(ben);
                        const benInitials = ben.first_name && ben.last_name
                          ? ben.first_name[0] + ben.last_name[0]
                          : ben.name ? ben.name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2) : '??';
                        return (
                          <div key={ben.id} className="flex flex-col items-center">
                            <GraphNode
                              initials={benInitials}
                              color={color}
                              size={40}
                              label={ben.first_name || ben.name?.split(' ')[0] || ''}
                              sublabel={`${ben.relation || ''}${age !== null ? ` · ${age}` : ''}`}
                              statusBadge={badge}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })()}

                {sortedBens.length === 0 && (
                  <p className="text-[11px] text-[var(--t5)] mt-2 italic">No beneficiaries</p>
                )}
              </div>
            </div>
          );
        })}

        {/* Orphan beneficiary users (no estate link) */}
        {(() => {
          const shownBenIds = new Set();
          estates.forEach(({ bens }) => {
            bens.forEach(b => { if (b.email) { const u = benUserByEmail.get(b.email.toLowerCase()); if (u) shownBenIds.add(u.id); }});
          });
          const orphans = beneficiaryUsers.filter(u => !shownBenIds.has(u.id));
          if (orphans.length === 0) return null;
          return (
            <div>
              <p className="text-[11px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2 mt-4">Unlinked Beneficiaries ({orphans.length})</p>
              <div className="space-y-2">{orphans.map(u => <UserRow key={u.id} u={u} />)}</div>
            </div>
          );
        })()}
        </>)}
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="admin-users-tab">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
          <Search className="w-4 h-4 text-[var(--t5)]" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="flex-1 bg-transparent border-none text-[var(--t)] text-base outline-none placeholder:text-[var(--t5)]" data-testid="admin-users-search" />
        </div>
        <div className="flex gap-1.5 w-full">
          {['all', 'benefactor', 'beneficiary'].map(r => (
            <button key={r} onClick={() => {
              const mainEl = document.querySelector('.main-content');
              const savedPos = mainEl ? mainEl.scrollTop : 0;
              // Disable smooth scroll to prevent flash
              const html = document.documentElement;
              if (mainEl) { mainEl.style.scrollBehavior = 'auto'; html.style.scrollBehavior = 'auto'; }
              setRoleFilter(r);
              setViewMode('hierarchy');
              if (mainEl) {
                const force = () => { mainEl.scrollTop = savedPos; };
                mainEl.addEventListener('scroll', force);
                force();
                requestAnimationFrame(force);
                requestAnimationFrame(() => requestAnimationFrame(force));
                setTimeout(force, 0);
                setTimeout(force, 50);
                setTimeout(() => {
                  mainEl.removeEventListener('scroll', force);
                  mainEl.style.scrollBehavior = '';
                  html.style.scrollBehavior = '';
                }, 200);
              }
            }} className={`flex-1 py-2 rounded-lg text-xs font-bold whitespace-nowrap text-center ${roleFilter === r ? 'bg-[var(--gold)] text-[#0F1629]' : 'bg-[var(--s)] text-[var(--t4)]'}`} data-testid={`admin-role-filter-${r}`}>{r === 'all' ? 'All' : r === 'beneficiary' ? 'Beneficiaries' : 'Benefactors'}</button>
          ))}
          <div className="w-px bg-[var(--b)]" />
          <button
            onClick={() => {
              const mainEl = document.querySelector('.main-content');
              const savedPos = mainEl ? mainEl.scrollTop : 0;
              const html = document.documentElement;
              if (mainEl) { mainEl.style.scrollBehavior = 'auto'; html.style.scrollBehavior = 'auto'; }
              setViewMode(viewMode === 'list' ? 'hierarchy' : viewMode === 'hierarchy' ? 'tree' : 'list');
              if (mainEl) {
                const force = () => { mainEl.scrollTop = savedPos; };
                mainEl.addEventListener('scroll', force);
                force();
                requestAnimationFrame(force);
                setTimeout(force, 0);
                setTimeout(force, 50);
                setTimeout(() => {
                  mainEl.removeEventListener('scroll', force);
                  mainEl.style.scrollBehavior = '';
                  html.style.scrollBehavior = '';
                }, 200);
              }
            }}
            className="flex-1 py-2 rounded-lg text-xs font-bold whitespace-nowrap flex items-center justify-center gap-1.5 bg-[var(--s)] text-[var(--t3)] border border-[var(--b)] active:bg-[var(--gold)] active:text-[#0F1629] transition-colors"
            data-testid="toggle-tree-view"
          >
            <GitBranch className="w-3.5 h-3.5" /> {viewMode === 'list' ? 'Hierarchy' : viewMode === 'hierarchy' ? 'Tree' : 'List'}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <p className="text-xs text-[var(--t5)]">{filteredUsers.length} users</p>
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3 h-3 text-[var(--t5)]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs font-bold bg-[var(--s)] border border-[var(--b)] text-[var(--t)] rounded-md px-1.5 py-1 outline-none cursor-pointer"
              style={{ fontSize: '16px' }}
              data-testid="admin-sort-by"
            >
              <option value="default">Default</option>
              <option value="first_name">First Name</option>
              <option value="last_name">Last Name</option>
              <option value="date_created">Date Created</option>
              <option value="birthday">Birthday</option>
              <option value="most_beneficiaries">Most Beneficiaries</option>
              <option value="least_beneficiaries">Least Beneficiaries</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap" data-testid="status-key">
          {[
            { label: 'Draft', desc: 'No email', color: statusColors.draft },
            { label: 'Pending', desc: 'Has email', color: statusColors.pending },
            { label: 'Sent', desc: 'Invite sent', color: statusColors.sent },
            { label: 'Accepted', desc: 'Portal active', color: statusColors.accepted },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color.color }} />
              <span className="text-[11px] sm:text-[11px] font-semibold" style={{ color: s.color.color }}>{s.label}</span>
              <span className="text-[11px] text-[var(--t5)] hidden sm:inline">— {s.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {viewMode === 'hierarchy' ? renderTreeView() : viewMode === 'tree' ? renderGraphView() : (
        <div className="space-y-2">
          {filteredUsers.map(u => <UserRow key={u.id} u={u} />)}
        </div>
      )}

      {/* Delete Confirmation Modal — Founder only */}
      {!operatorMode && (
        <DeleteUserModal
          deleteTarget={deleteTarget}
          deletePassword={deletePassword}
          setDeletePassword={setDeletePassword}
          showDeletePw={showDeletePw}
          setShowDeletePw={setShowDeletePw}
          handleDeleteUser={handleDeleteUser}
          deleting={deleting}
          onCancel={() => { setDeleteTarget(null); setDeletePassword(''); }}
        />
      )}

      {/* Reset Trial Confirmation Modal — Founder only */}
      {!operatorMode && (
        <ResetTrialModal
          resetTarget={resetTrialTarget}
          handleResetTrial={handleResetTrial}
          resetting={resettingTrial === resetTrialTarget?.id}
          onCancel={() => setResetTrialTarget(null)}
          trialDays={trialDays}
        />
      )}
    </div>
  );
};
