import React, { useState, useEffect } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { Settings, AlertTriangle, Loader2, Eye, UserCog, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Skeleton } from '../ui/skeleton';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';
import { useAuth } from '../../contexts/AuthContext';

const PORTAL_SCOPES = [
  { value: 'founder', label: 'Founder Admin', desc: 'Full access — all sections visible', color: '#d4af37' },
  { value: 'finance', label: 'Finance Admin', desc: 'Revenue, Subscriptions, Grace Periods, Analytics', color: '#22C993' },
  { value: 'compliance', label: 'Compliance Admin', desc: 'Audit Trail, Security, Estate Health', color: '#3B82F6' },
  { value: 'marketing', label: 'Marketing Admin', desc: 'Funnel, Beta Testing, Site Content, Emails, Invites', color: '#B794F6' },
  { value: 'platform_health', label: 'Platform Health Admin', desc: 'System Health, Operators, Integrations', color: '#F59E0B' },
  { value: 'operator_manager', label: 'Ops Manager', desc: 'Team management + work queues', color: '#ef4444' },
  { value: 'operator_worker', label: 'Ops Worker', desc: 'Work queues only', color: '#64748B' },
];

// Portals that can appear in the logo portal switcher
const SWITCHABLE_PORTALS = [
  { key: 'benefactor', label: 'Benefactor Portal', desc: 'View as a benefactor user', color: '#2563eb' },
  { key: 'beneficiary', label: 'Beneficiary Portal', desc: 'View as a beneficiary user', color: '#8b5cf6' },
  { key: 'founder', label: 'Founder Portal', desc: 'Full admin access (always on)', color: '#d4af37', locked: true },
  { key: 'operations', label: 'Operations Portal', desc: 'View as operator', color: '#3B82F6' },
  { key: 'finance', label: 'Finance Admin', desc: 'Scoped to revenue & subscriptions', color: '#22C993' },
  { key: 'compliance', label: 'Compliance Admin', desc: 'Scoped to audit & estate health', color: '#3B82F6' },
  { key: 'marketing', label: 'Marketing Admin', desc: 'Scoped to funnel & content', color: '#B794F6' },
  { key: 'platform_health', label: 'Platform Health', desc: 'Scoped to system & operators', color: '#F59E0B' },
];

export const DevSwitcherTab = ({ users, getAuthHeaders }) => {
  const { user, setUser } = useAuth();
  const [config, setConfig] = useState({
    benefactor_email: '',
    benefactor_password: '',
    beneficiary_email: '',
    beneficiary_password: '',
    enabled: true
  });
  const [portalVisibility, setPortalVisibility] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [currentScope, setCurrentScope] = useState(user?.admin_scope || 'founder');

  useEffect(() => {
    fetchConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchConfig = async () => {
    try {
      const res = await apiClient.get(`${API_URL}/admin/dev-switcher`, getAuthHeaders());
      setConfig(prev => ({
        ...prev,
        benefactor_email: res.data.benefactor_email || '',
        beneficiary_email: res.data.beneficiary_email || '',
        enabled: res.data.enabled
      }));
      setPortalVisibility(res.data.portal_visibility || {});
    } catch (err) {
      console.error('Failed to fetch config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(`${API_URL}/admin/dev-switcher`, config, getAuthHeaders());
      toast.success('Dev Switcher config saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const handleScopePreview = (scope) => {
    if (scope === currentScope) return;
    setCurrentScope(scope);

    if (scope === 'operator_manager' || scope === 'operator_worker') {
      // Navigate to ops portal to preview operator views
      const opRole = scope === 'operator_manager' ? 'manager' : 'worker';
      setUser(prev => ({ ...prev, admin_scope: 'founder', _preview_role: 'operator', _preview_operator_role: opRole }));
      toast.success(`Previewing as: ${scope === 'operator_manager' ? 'Ops Manager' : 'Ops Worker'}. Navigate to /ops to see their view.`);
      window.location.href = '/ops/transition';
    } else {
      // Preview as scoped admin
      setUser(prev => ({ ...prev, admin_scope: scope, _preview_role: null }));
      toast.success(`Viewing portal as: ${PORTAL_SCOPES.find(s => s.value === scope)?.label || scope}`);
    }
  };

  const resetToFounder = () => {
    setCurrentScope('founder');
    setUser(prev => ({ ...prev, admin_scope: 'founder', _preview_role: null, _preview_operator_role: null }));
    toast.success('Restored to Founder Admin view');
    if (window.location.pathname.startsWith('/ops')) {
      window.location.href = '/admin';
    }
  };

  const handleVisibilityToggle = async (portalKey) => {
    const updated = { ...portalVisibility, [portalKey]: !isPortalVisible(portalKey) };
    setPortalVisibility(updated);
    setSavingVisibility(true);
    try {
      await apiClient.put(`${API_URL}/admin/dev-switcher/portal-visibility`, { portal_visibility: updated }, getAuthHeaders());
      toast.success(`${SWITCHABLE_PORTALS.find(p => p.key === portalKey)?.label || portalKey} ${updated[portalKey] ? 'shown' : 'hidden'} in switcher`);
    } catch {
      toast.error('Failed to update visibility');
      setPortalVisibility(prev => ({ ...prev, [portalKey]: !updated[portalKey] }));
    } finally {
      setSavingVisibility(false);
    }
  };

  const isPortalVisible = (key) => {
    if (key === 'founder') return true; // Founder always visible
    return portalVisibility[key] !== false; // Default to visible
  };

  const benefactors = users.filter(u => u.role === 'benefactor' || u.is_also_benefactor);
  const beneficiaries = users.filter(u => u.role === 'beneficiary' || u.is_also_beneficiary);

  if (loading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-6" data-testid="admin-dev-switcher-tab">
      <div className="flex items-center gap-3 mb-2">
        <Settings className="w-6 h-6 text-[var(--gold)]" />
        <div>
          <h2 className="text-xl font-bold text-[var(--t)]">Dev Switcher Configuration</h2>
          <p className="text-sm text-[var(--t5)]">Configure portal switching + preview different admin views</p>
        </div>
      </div>

      {/* ── Portal Preview ── */}
      <Card className="glass-card" style={{ border: '2px solid rgba(212,175,55,0.2)' }}>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-[var(--gold)]" />
              <h3 className="font-bold text-[var(--t)]">View Portal As</h3>
            </div>
            {currentScope !== 'founder' && (
              <button onClick={resetToFounder}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--gold)] text-[#0F1629]"
                data-testid="restore-founder-view">
                Restore Founder View
              </button>
            )}
          </div>
          <p className="text-xs text-[var(--t5)]">
            Preview how each admin scope sees the portal. Only affects your current view — no database changes.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PORTAL_SCOPES.map(s => (
              <button key={s.value}
                onClick={() => handleScopePreview(s.value)}
                className={`p-3 rounded-xl text-left transition-all text-xs border ${
                  currentScope === s.value
                    ? 'border-2'
                    : 'bg-[var(--s)] border-[var(--b)] hover:border-[var(--t5)]'
                }`}
                style={currentScope === s.value ? { borderColor: s.color, background: `${s.color}10` } : {}}
                data-testid={`preview-scope-${s.value}`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="font-bold text-[var(--t)]">{s.label}</span>
                  {currentScope === s.value && <span className="text-[11px] ml-auto font-bold" style={{ color: s.color }}>ACTIVE</span>}
                </div>
                <p className="text-[var(--t5)] text-[11px]">{s.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Portal Switcher Visibility ── */}
      <Card className="glass-card" style={{ border: '2px solid rgba(59,130,246,0.2)' }}>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-[#3B82F6]" />
            <h3 className="font-bold text-[var(--t)]">Portal Switcher Visibility</h3>
          </div>
          <p className="text-xs text-[var(--t5)]">
            Toggle which portals appear when you click the logo. Founder Portal is always visible.
          </p>
          <div className="space-y-2">
            {SWITCHABLE_PORTALS.map(portal => (
              <div
                key={portal.key}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                data-testid={`visibility-${portal.key}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-8 rounded-full" style={{ background: portal.color }} />
                  <div>
                    <span className="text-sm font-bold text-[var(--t)]">{portal.label}</span>
                    <p className="text-[11px] text-[var(--t5)]">{portal.desc}</p>
                  </div>
                </div>
                <button
                  onClick={() => !portal.locked && handleVisibilityToggle(portal.key)}
                  disabled={portal.locked || savingVisibility}
                  className="flex items-center"
                  data-testid={`visibility-toggle-${portal.key}`}
                >
                  {portal.locked ? (
                    <ToggleRight className="w-8 h-8 text-[#d4af37] opacity-50" />
                  ) : isPortalVisible(portal.key) ? (
                    <ToggleRight className="w-8 h-8 text-[#22C993]" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-[var(--t5)]" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Dev Account Switching ── */}
      <Card className="glass-card">
        <CardContent className="p-6 space-y-6">
          {/* Benefactor Selection */}
          <div className="space-y-3">
            <Label className="text-[var(--t3)] font-semibold flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              Benefactor Account
            </Label>
            {benefactors.length === 0 ? (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-400">
                No benefactor accounts found. Create a benefactor account first via /signup.
                {config.benefactor_email && (
                  <div className="mt-2 text-xs text-[var(--t5)]">
                    Previously configured: {config.benefactor_email}
                  </div>
                )}
              </div>
            ) : (
              <select
                value={config.benefactor_email}
                onChange={(e) => setConfig(prev => ({ ...prev, benefactor_email: e.target.value, benefactor_password: '' }))}
                className="w-full p-3 rounded-lg bg-[var(--s)] border border-[var(--b)] text-[var(--t)] text-sm"
                data-testid="dev-switcher-benefactor-select"
              >
                <option value="">Select a benefactor...</option>
                {benefactors.map(u => (
                  <option key={u.id} value={u.email}>{u.name} ({u.email})</option>
                ))}
              </select>
            )}
            {config.benefactor_email && benefactors.length > 0 && (
              <div className="space-y-2">
                <Label className="text-[var(--t5)] text-sm">Password for {config.benefactor_email}</Label>
                <Input
                  type="password"
                  value={config.benefactor_password}
                  onChange={(e) => setConfig(prev => ({ ...prev, benefactor_password: e.target.value }))}
                  placeholder="Enter password for quick switch"
                  className="input-field"
                  data-testid="dev-switcher-benefactor-password"
                />
              </div>
            )}
          </div>

          {/* Beneficiary Selection */}
          <div className="space-y-3">
            <Label className="text-[var(--t3)] font-semibold flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              Beneficiary Account
            </Label>
            {beneficiaries.length === 0 ? (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-400">
                No beneficiary accounts found. Invite a beneficiary from the Beneficiaries page.
                {config.beneficiary_email && (
                  <div className="mt-2 text-xs text-[var(--t5)]">
                    Previously configured: {config.beneficiary_email}
                  </div>
                )}
              </div>
            ) : (
              <>
                <select
                  value={config.beneficiary_email}
                  onChange={(e) => setConfig(prev => ({ ...prev, beneficiary_email: e.target.value, beneficiary_password: '' }))}
                  className="w-full p-3 rounded-lg bg-[var(--s)] border border-[var(--b)] text-[var(--t)] text-sm"
                  data-testid="dev-switcher-beneficiary-select"
                >
                  <option value="">Select a beneficiary...</option>
                  {beneficiaries.map(u => (
                    <option key={u.id} value={u.email}>{u.name} ({u.email})</option>
                  ))}
                </select>
                {config.beneficiary_email && (
                  <div className="space-y-2">
                    <Label className="text-[var(--t5)] text-sm">Password for {config.beneficiary_email}</Label>
                    <Input
                      type="password"
                      value={config.beneficiary_password}
                      onChange={(e) => setConfig(prev => ({ ...prev, beneficiary_password: e.target.value }))}
                      placeholder="Enter password for quick switch"
                      className="input-field"
                      data-testid="dev-switcher-beneficiary-password"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--s)]">
            <div>
              <p className="font-semibold text-[var(--t)]">Enable Dev Switcher</p>
              <p className="text-sm text-[var(--t5)]">Show the DEV button for quick portal switching</p>
            </div>
            <button
              onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={`w-12 h-7 rounded-full transition-colors relative flex-shrink-0 ${config.enabled ? 'bg-[var(--gold)]' : 'bg-[var(--s2)]'}`}
              data-testid="dev-switcher-toggle"
            >
              <div className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${config.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Info Box */}
          <div className="p-4 rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/5">
            <p className="text-sm text-[var(--t3)]">
              <strong className="text-[var(--gold)]">Note:</strong> The passwords you enter here are stored securely and used only for the dev switcher to bypass OTP during testing. 
              The Admin account is always available in the switcher by default.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="gold-button w-full" data-testid="dev-switcher-save">
            {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Settings className="w-5 h-5 mr-2" />}
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      {/* No Accounts Warning */}
      {benefactors.length === 0 && beneficiaries.length === 0 && (
        <Card className="glass-card border-yellow-500/30">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
            <h3 className="font-bold text-[var(--t)] mb-2">No Accounts Available</h3>
            <p className="text-sm text-[var(--t5)]">
              Register some benefactor and beneficiary accounts first, then return here to configure the dev switcher.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
