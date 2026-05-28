import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/apiClient';
import { Shield, Plus, Loader2, Trash2, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

export const IPWhitelistTab = ({ getAuthHeaders }) => {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [newIPs, setNewIPs] = useState({});

  const headers = getAuthHeaders()?.headers || {};

  const fetch_ = async () => {
    try {
      const res = await apiClient.get(`${API_URL}/admin/ip-whitelist`, { headers });
      setConfigs(res.data);
    } catch { toast.error('Failed to load IP whitelist'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []); // eslint-disable-line

  const toggleEnabled = async (accountType, currentEnabled, currentIPs, currentNotes) => {
    setSaving(accountType);
    try {
      await apiClient.put(`${API_URL}/admin/ip-whitelist`, {
        account_type: accountType,
        enabled: !currentEnabled,
        allowed_ips: currentIPs,
        notes: currentNotes,
      }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      fetch_();
    } catch { toast.error('Failed to update'); }
    finally { setSaving(null); }
  };

  const addIP = async (accountType) => {
    const ip = (newIPs[accountType] || '').trim();
    if (!ip) return;
    const config = configs.find(c => c.account_type === accountType);
    const updatedIPs = [...(config?.allowed_ips || []), ip];
    setSaving(accountType);
    try {
      await apiClient.put(`${API_URL}/admin/ip-whitelist`, {
        account_type: accountType,
        enabled: config?.enabled || false,
        allowed_ips: updatedIPs,
        notes: config?.notes || '',
      }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      setNewIPs(prev => ({ ...prev, [accountType]: '' }));
      fetch_();
    } catch { toast.error('Failed to add IP'); }
    finally { setSaving(null); }
  };

  const removeIP = async (accountType, ipToRemove) => {
    const config = configs.find(c => c.account_type === accountType);
    const updatedIPs = (config?.allowed_ips || []).filter(ip => ip !== ipToRemove);
    setSaving(accountType);
    try {
      await apiClient.put(`${API_URL}/admin/ip-whitelist`, {
        account_type: accountType,
        enabled: config?.enabled || false,
        allowed_ips: updatedIPs,
        notes: config?.notes || '',
      }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      fetch_();
    } catch { toast.error('Failed to remove IP'); }
    finally { setSaving(null); }
  };

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--t4)]" /></div>;

  return (
    <div className="space-y-4" data-testid="ip-whitelist-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--t)]">IP Whitelist</h2>
          <p className="text-xs text-[var(--t5)]">Restrict login access by IP address per account type</p>
        </div>
      </div>

      <div className="p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
        <p className="text-xs text-[#F59E0B]">
          <Shield className="w-3 h-3 inline mr-1" />
          When enabled, only whitelisted IPs can log in for that account type. Leave disabled for unrestricted access.
        </p>
      </div>

      {configs.map(config => {
        const isExpanded = expanded === config.account_type;
        return (
          <Card key={config.account_type} className="glass-card" data-testid={`ip-whitelist-${config.account_type}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : config.account_type)}>
                  <ChevronDown className={`w-4 h-4 text-[var(--t5)] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  <div>
                    <p className="text-sm font-bold text-[var(--t)]">{config.label}</p>
                    <p className="text-[11px] text-[var(--t5)]">
                      {config.allowed_ips.length} IP{config.allowed_ips.length !== 1 ? 's' : ''} whitelisted
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {saving === config.account_type && <Loader2 className="w-3 h-3 animate-spin text-[var(--t5)]" />}
                  <Switch
                    checked={config.enabled}
                    onCheckedChange={() => toggleEnabled(config.account_type, config.enabled, config.allowed_ips, config.notes)}
                    data-testid={`ip-toggle-${config.account_type}`}
                  />
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 space-y-3 pl-7">
                  {config.allowed_ips.length > 0 && (
                    <div className="space-y-1.5">
                      {config.allowed_ips.map((ip, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                          <code className="text-xs text-[var(--t3)] font-mono">{ip}</code>
                          <button onClick={() => removeIP(config.account_type, ip)} aria-label="Remove IP" className="text-[var(--t5)] hover:text-red-400 transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={newIPs[config.account_type] || ''}
                      onChange={e => setNewIPs(prev => ({ ...prev, [config.account_type]: e.target.value }))}
                      placeholder="Enter IP address (e.g., 192.168.1.100)"
                      className="flex-1 text-xs"
                      onKeyDown={e => e.key === 'Enter' && addIP(config.account_type)}
                      data-testid={`ip-input-${config.account_type}`}
                    />
                    <Button
                      onClick={() => addIP(config.account_type)}
                      size="sm"
                      className="gold-button text-xs"
                      data-testid={`ip-add-${config.account_type}`}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
