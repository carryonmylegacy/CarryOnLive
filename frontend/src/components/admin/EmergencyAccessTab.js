import React, { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { toast } from '../../utils/toast';
import { AlertTriangle, Check, Clock, Shield } from 'lucide-react';

const SCOPE_LABELS = {
  documents: 'Documents',
  messages: 'Messages',
  digital_wallet: 'Digital Vault',
  financial_portal: 'Financial Portal',
  connected_protocol: 'Emergency Plans',
};

export const EmergencyAccessTab = ({ getAuthHeaders }) => {
  const [policy, setPolicy] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      const [policyRes, reqRes] = await Promise.all([
        apiClient.get(`${API_URL}/admin/emergency-access-policy`, getAuthHeaders()),
        apiClient.get(`${API_URL}/admin/emergency-access`, getAuthHeaders()),
      ]);
      setPolicy(policyRes.data);
      setRequests(reqRes.data || []);
    } catch {
      toast.error('Failed to load emergency access');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const savePolicy = async (nextPolicy) => {
    setPolicy(nextPolicy);
    setSaving(true);
    try {
      const res = await apiClient.put(`${API_URL}/admin/emergency-access-policy`, nextPolicy, getAuthHeaders());
      setPolicy(res.data);
      toast.success('Emergency policy updated');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save policy');
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const review = async (request, action) => {
    const scopes = Object.entries(policy?.allowed_scopes || {})
      .filter(([, enabled]) => enabled)
      .map(([scope]) => scope);
    try {
      await apiClient.post(
        `${API_URL}/admin/emergency-access/${request.id}/review`,
        {
          action,
          access_level: 'read_only',
          access_duration_hours: policy?.default_duration_hours || 72,
          granted_scopes: scopes,
        },
        getAuthHeaders(),
      );
      toast.success(action === 'approve' ? 'Emergency access approved' : 'Request updated');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Review failed');
    }
  };

  if (loading) return <div className="p-8 text-center text-[var(--t4)]">Loading...</div>;

  const pending = requests.filter(r => r.status === 'pending');
  const reviewed = requests.filter(r => r.status !== 'pending').slice(0, 20);

  return (
    <div className="space-y-5" data-testid="emergency-access-admin">
      <Card className="glass-card">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-[var(--gold)]" />
              <div>
                <h2 className="text-lg font-bold text-[var(--t)]">Emergency Access</h2>
                <p className="text-xs text-[var(--t4)]">Founder-controlled request scope and expiration.</p>
              </div>
            </div>
            <Switch
              checked={!!policy?.enabled}
              onCheckedChange={(enabled) => savePolicy({ ...policy, enabled })}
              disabled={saving}
              data-testid="emergency-access-enabled"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-[var(--t4)]">Default Hours</Label>
              <Input
                type="number"
                min="1"
                value={policy?.default_duration_hours || 72}
                onChange={(e) => setPolicy(p => ({ ...p, default_duration_hours: Number(e.target.value) }))}
                onBlur={() => savePolicy(policy)}
                className="input-field mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-[var(--t4)]">Max Hours</Label>
              <Input
                type="number"
                min="1"
                value={policy?.max_duration_hours || 168}
                onChange={(e) => setPolicy(p => ({ ...p, max_duration_hours: Number(e.target.value) }))}
                onBlur={() => savePolicy(policy)}
                className="input-field mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.entries(SCOPE_LABELS).map(([scope, label]) => (
              <div key={scope} className="flex items-center justify-between p-3 rounded-lg bg-[var(--s)]">
                <span className="text-sm font-semibold text-[var(--t2)]">{label}</span>
                <Switch
                  checked={!!policy?.allowed_scopes?.[scope]}
                  onCheckedChange={(enabled) => savePolicy({
                    ...policy,
                    allowed_scopes: { ...(policy?.allowed_scopes || {}), [scope]: enabled },
                  })}
                  disabled={saving}
                  data-testid={`emergency-scope-${scope}`}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--t)] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#ef4444]" /> Pending Requests
        </h3>
        {pending.length === 0 ? (
          <div className="p-5 rounded-xl bg-[var(--s)] text-sm text-[var(--t4)]">No pending emergency requests.</div>
        ) : pending.map(req => (
          <Card key={req.id} className="glass-card">
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[var(--t)]">{req.requester_name || req.requester_email}</div>
                <div className="text-xs text-[var(--t5)]">{req.estate_name} · {req.urgency}</div>
                <p className="text-sm text-[var(--t3)] mt-2">{req.reason}</p>
              </div>
              <div className="flex gap-2">
                <Button className="gold-button text-xs" onClick={() => review(req, 'approve')}>
                  <Check className="w-3 h-3 mr-1" /> Approve
                </Button>
                <Button variant="outline" className="text-xs border-[var(--b)]" onClick={() => review(req, 'request_more_info')}>
                  More Info
                </Button>
                <Button variant="destructive" className="text-xs" onClick={() => review(req, 'deny')}>
                  Deny
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-[var(--t)] flex items-center gap-2">
          <Clock className="w-4 h-4 text-[var(--t4)]" /> Recent Decisions
        </h3>
        {reviewed.length === 0 ? (
          <div className="p-5 rounded-xl bg-[var(--s)] text-sm text-[var(--t4)]">No reviewed requests yet.</div>
        ) : reviewed.map(req => (
          <div key={req.id} className="p-3 rounded-lg bg-[var(--s)] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--t2)] truncate">{req.requester_name || req.requester_email}</div>
              <div className="text-xs text-[var(--t5)] truncate">{req.estate_name}</div>
            </div>
            <span className="text-xs font-bold text-[var(--t4)]">{req.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmergencyAccessTab;
