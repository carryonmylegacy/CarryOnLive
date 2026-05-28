import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/apiClient';
import { Clock, Shield, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const TIMEOUT_OPTIONS = [
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 480, label: '8 hours' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '24 hours' },
];

const ROLE_COLORS = {
  admin: '#d4af37',
  manager: '#3B82F6',
  worker: '#22C993',
  benefactor: '#B794F6',
  beneficiary: '#F59E0B',
};

export const SessionPolicyTab = ({ getAuthHeaders }) => {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const fetchPolicies = async () => {
    try {
      const res = await apiClient.get(`${API_URL}/admin/session-policy`, getAuthHeaders());
      setPolicies(res.data);
    } catch {
      toast.error('Failed to load session policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []); // eslint-disable-line

  const handleToggle = async (roleType, currentEnabled) => {
    const policy = policies.find(p => p.role_type === roleType);
    if (!policy) return;

    setSaving(roleType);
    try {
      await apiClient.put(
        `${API_URL}/admin/session-policy`,
        {
          role_type: roleType,
          timeout_minutes: policy.timeout_minutes || 30,
          enabled: !currentEnabled,
        },
        getAuthHeaders()
      );
      toast.success(`${policy.label} timeout ${!currentEnabled ? 'enabled' : 'disabled'}`);
      fetchPolicies();
    } catch {
      toast.error('Failed to update policy');
    } finally {
      setSaving(null);
    }
  };

  const handleTimeoutChange = async (roleType, minutes) => {
    const policy = policies.find(p => p.role_type === roleType);
    if (!policy) return;

    setSaving(roleType);
    try {
      await apiClient.put(
        `${API_URL}/admin/session-policy`,
        {
          role_type: roleType,
          timeout_minutes: parseInt(minutes),
          enabled: policy.enabled,
        },
        getAuthHeaders()
      );
      toast.success(`${policy.label} timeout updated`);
      fetchPolicies();
    } catch {
      toast.error('Failed to update timeout');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--t5)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="session-policy-tab">
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-[var(--t)]">
            <Clock className="w-5 h-5 text-[#d4af37]" />
            Session Inactivity Timeout Policy
          </CardTitle>
          <p className="text-sm text-[var(--t5)]">
            Configure maximum session duration per role. When enabled, sessions will auto-expire
            after the specified period of inactivity. This overrides individual user preferences.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {policies.map(policy => (
            <div
              key={policy.role_type}
              className="flex items-center justify-between p-4 rounded-lg"
              style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
              data-testid={`session-policy-${policy.role_type}`}
            >
              <div className="flex items-center gap-3 flex-1">
                <div
                  className="w-2 h-8 rounded-full"
                  style={{ background: ROLE_COLORS[policy.role_type] || '#888' }}
                />
                <div>
                  <span className="text-sm font-bold text-[var(--t)]">{policy.label}</span>
                  <p className="text-xs text-[var(--t5)]">
                    {policy.enabled
                      ? `Auto-logout after ${policy.timeout_minutes} min of inactivity`
                      : 'No enforced timeout'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {policy.enabled && (
                  <select
                    value={policy.timeout_minutes}
                    onChange={e => handleTimeoutChange(policy.role_type, e.target.value)}
                    className="px-2 py-1.5 rounded text-sm bg-[var(--bg)] text-[var(--t)] border border-[var(--b)]"
                    style={{ fontSize: '16px' }}
                    data-testid={`timeout-select-${policy.role_type}`}
                  >
                    {TIMEOUT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  onClick={() => handleToggle(policy.role_type, policy.enabled)}
                  disabled={saving === policy.role_type}
                  className="flex items-center"
                  data-testid={`toggle-${policy.role_type}`}
                >
                  {saving === policy.role_type ? (
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--t5)]" />
                  ) : policy.enabled ? (
                    <ToggleRight className="w-8 h-8 text-[#22C993]" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-[var(--t5)]" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-[#3B82F6] mt-0.5 flex-shrink-0" />
            <p className="text-xs text-[var(--t5)]">
              <span className="font-bold text-[var(--t4)]">How it works:</span> When a session
              policy is enabled, the user&apos;s browser will automatically log them out after the
              specified period of inactivity (no clicks, scrolls, or keystrokes). This policy
              overrides any individual auto-logout settings. The Founder can exempt themselves by
              leaving the Admin/Founder timeout disabled.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
