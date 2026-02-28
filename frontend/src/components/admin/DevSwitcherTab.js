import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Settings, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Skeleton } from '../ui/skeleton';
import { toast } from 'sonner';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const DevSwitcherTab = ({ users, getAuthHeaders }) => {
  const [config, setConfig] = useState({
    benefactor_email: '',
    benefactor_password: '',
    beneficiary_email: '',
    beneficiary_password: '',
    enabled: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchConfig = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/dev-switcher`, getAuthHeaders());
      setConfig(prev => ({
        ...prev,
        benefactor_email: res.data.benefactor_email || '',
        beneficiary_email: res.data.beneficiary_email || '',
        enabled: res.data.enabled
      }));
    } catch (err) {
      console.error('Failed to fetch config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/admin/dev-switcher`, config, getAuthHeaders());
      toast.success('Dev switcher config saved! The dev panel will now use these accounts.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const benefactors = users.filter(u => u.role === 'benefactor');
  const beneficiaries = users.filter(u => u.role === 'beneficiary');

  if (loading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-6" data-testid="admin-dev-switcher-tab">
      <div className="flex items-center gap-3 mb-2">
        <Settings className="w-6 h-6 text-[var(--gold)]" />
        <div>
          <h2 className="text-xl font-bold text-[var(--t)]">Dev Switcher Configuration</h2>
          <p className="text-sm text-[var(--t5)]">Configure which accounts appear in the DEV portal switcher</p>
        </div>
      </div>

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
              className={`w-12 h-6 rounded-full transition-colors relative ${config.enabled ? 'bg-[var(--gold)]' : 'bg-[var(--s2)]'}`}
              data-testid="dev-switcher-toggle"
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${config.enabled ? 'left-7' : 'left-1'}`} />
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
