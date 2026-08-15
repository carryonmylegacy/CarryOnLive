/**
 * PartnerDigestSettings — weekly digest opt-in/out + contact email,
 * shown at the bottom of the Partner Portal.
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

export const PartnerDigestSettings = () => {
  const [loaded, setLoaded] = useState(false);
  const [optOut, setOptOut] = useState(false);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await apiClient.get(`${API_URL}/manager/me`, { headers: mgrHeaders() });
        setOptOut(!!data.digest_opt_out);
        setEmail(data.email || '');
      } catch { /* auth handled upstream */ }
      setLoaded(true);
    })();
  }, []);

  const save = async (nextOptOut, msg) => {
    setSaving(true);
    try {
      const { data } = await apiClient.post(`${API_URL}/manager/digest-settings`,
        { opt_out: nextOptOut, email: email.trim() },
        { headers: { ...mgrHeaders(), 'Content-Type': 'application/json' } });
      setOptOut(!!data.digest_opt_out);
      toast.success(msg);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save digest settings');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="glass-card p-4 mt-5 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="digest-settings-card">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[var(--t)] flex items-center gap-2">
          <MailCheck className="w-4 h-4 text-[var(--gold)]" /> Weekly Activity Digest
        </p>
        <p className="text-[12px] text-[var(--t4)] mt-0.5">
          A Monday email recap of client signups, subscriptions, and beneficiary progress.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Digest email"
          className="input-field text-sm w-56" data-testid="digest-email-input" />
        <Button size="sm" variant="outline" disabled={saving} onClick={() => save(optOut, 'Digest email saved')}
          className="text-xs border-[var(--b)] text-[var(--t3)]" data-testid="digest-save-btn">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
        </Button>
        <Switch checked={!optOut} disabled={saving}
          onCheckedChange={(on) => save(!on, on ? 'Weekly digest turned on' : 'Weekly digest turned off')}
          data-testid="digest-toggle" />
      </div>
    </div>
  );
};

export default PartnerDigestSettings;
