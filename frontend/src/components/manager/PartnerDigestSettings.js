/**
 * PartnerDigestSettings — email notification preferences for the partner:
 * weekly digest + instant new-client alerts, plus the delivery email.
 */

import React, { useEffect, useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import apiClient from '../../utils/apiClient';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const mgrHeaders = () => {
  const t = window.localStorage.getItem('carryon_manager_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const ToggleRow = ({ title, desc, checked, disabled, onChange, testId }) => (
  <div className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid var(--b)' }}>
    <div className="flex-1 min-w-0">
      <p className="text-[13px] font-bold text-[var(--t)]">{title}</p>
      <p className="text-[11px] text-[var(--t4)]">{desc}</p>
    </div>
    <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} data-testid={testId} />
  </div>
);

export const PartnerDigestSettings = () => {
  const [loaded, setLoaded] = useState(false);
  const [optOut, setOptOut] = useState(false);
  const [alertsOptOut, setAlertsOptOut] = useState(false);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await apiClient.get(`${API_URL}/manager/me`, { headers: mgrHeaders() });
        setOptOut(!!data.digest_opt_out);
        setAlertsOptOut(!!data.alerts_opt_out);
        setEmail(data.email || '');
      } catch { /* auth handled upstream */ }
      setLoaded(true);
    })();
  }, []);

  const save = async (payload, msg) => {
    setSaving(true);
    try {
      const { data } = await apiClient.post(`${API_URL}/manager/digest-settings`,
        { opt_out: optOut, alerts_opt_out: alertsOptOut, email: email.trim(), ...payload },
        { headers: { ...mgrHeaders(), 'Content-Type': 'application/json' } });
      setOptOut(!!data.digest_opt_out);
      setAlertsOptOut(!!data.alerts_opt_out);
      toast.success(msg);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save notification settings');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="glass-card p-4 mt-5" data-testid="digest-settings-card">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[var(--t)] flex items-center gap-2">
            <MailCheck className="w-4 h-4 text-[var(--gold)]" /> Email Notifications
          </p>
          <p className="text-[12px] text-[var(--t4)] mt-0.5">Where and what we email you about your roster.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Notification email"
            className="input-field text-sm w-56" data-testid="digest-email-input" />
          <Button size="sm" variant="outline" disabled={saving} onClick={() => save({}, 'Notification email saved')}
            className="text-xs border-[var(--b)] text-[var(--t3)]" data-testid="digest-save-btn">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </div>
      <ToggleRow
        title="Weekly activity digest"
        desc="A Monday recap of client signups, subscriptions, and beneficiary progress."
        checked={!optOut}
        disabled={saving}
        onChange={(on) => save({ opt_out: !on }, on ? 'Weekly digest turned on' : 'Weekly digest turned off')}
        testId="digest-toggle"
      />
      <ToggleRow
        title="Instant new-client alerts"
        desc="An email the moment someone joins your roster through your landing page."
        checked={!alertsOptOut}
        disabled={saving}
        onChange={(on) => save({ alerts_opt_out: !on }, on ? 'New-client alerts turned on' : 'New-client alerts turned off')}
        testId="alerts-toggle"
      />
    </div>
  );
};

export default PartnerDigestSettings;
