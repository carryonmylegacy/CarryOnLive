import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../utils/apiClient';
import { toast } from '../../utils/toast';
import { Mail, Shield, TrendingUp, AlertTriangle, Loader2, Trash2, Send, Eye } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { API_URL } from '../../config';

export const FounderEmailsTab = ({ getAuthHeaders }) => {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingAnalytics, setSendingAnalytics] = useState(false);
  const [sendingAudit, setSendingAudit] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewType, setPreviewType] = useState('');
  const [newRecipient, setNewRecipient] = useState('');

  const fetchPrefs = useCallback(async () => {
    try {
      const res = await apiClient.get(`${API_URL}/admin/email-preferences`, getAuthHeaders());
      setPrefs(res.data);
    } catch { toast.error('Failed to load email preferences'); }
    finally { setLoading(false); }
  }, [getAuthHeaders]);

  useEffect(() => { fetchPrefs(); }, [fetchPrefs]);

  const updatePref = async (updates) => {
    setSaving(true);
    try {
      await apiClient.put(`${API_URL}/admin/email-preferences`, updates, getAuthHeaders());
      setPrefs(p => ({ ...p, ...updates }));
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const addRecipient = async () => {
    const email = newRecipient.trim();
    if (!email || (prefs?.audit_digest_recipients || []).includes(email)) return;
    const updated = [...(prefs?.audit_digest_recipients || []), email];
    await updatePref({ audit_digest_recipients: updated });
    setNewRecipient('');
  };

  const removeRecipient = async (email) => {
    const updated = (prefs?.audit_digest_recipients || []).filter(e => e !== email);
    await updatePref({ audit_digest_recipients: updated });
  };

  const sendNow = async (type) => {
    const setter = type === 'analytics' ? setSendingAnalytics : setSendingAudit;
    const url = type === 'analytics' ? '/admin/analytics-digest/send' : '/admin/audit-digest/send';
    setter(true);
    try {
      await apiClient.post(`${API_URL}${url}`, {}, getAuthHeaders());
      toast.success(`${type === 'analytics' ? 'Analytics' : 'Audit'} digest sent`);
    } catch { toast.error('Failed to send'); }
    finally { setter(false); }
  };

  const preview = async (type) => {
    const url = type === 'analytics' ? '/admin/analytics-digest/preview' : '/admin/audit-digest/preview';
    try {
      const res = await apiClient.get(`${API_URL}${url}`, getAuthHeaders());
      setPreviewHtml(res.data.html);
      setPreviewType(type);
    } catch { toast.error('Failed to load preview'); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>;

  return (
    <div className="space-y-6">
      {/* Analytics Digest */}
      <Card className="glass-card">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--gold)]/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-[var(--gold)]" />
              </div>
              <div>
                <h3 className="text-[var(--t)] font-bold text-sm">Weekly Analytics Digest</h3>
                <p className="text-[var(--t5)] text-xs">MRR, signups, conversions, churn, tier breakdown</p>
              </div>
            </div>
            <Switch
              checked={prefs?.analytics_digest_enabled ?? true}
              onCheckedChange={(v) => updatePref({ analytics_digest_enabled: v })}
              disabled={saving}
              data-testid="founder-analytics-digest-toggle"
            />
          </div>

          {prefs?.analytics_digest_enabled !== false && (
            <>
              <Separator className="bg-[var(--b)]" />
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={() => sendNow('analytics')} disabled={sendingAnalytics}
                  className="bg-[var(--gold)] text-[#0b1120] hover:bg-[var(--gold)]/90 text-xs font-bold" data-testid="send-analytics-now">
                  {sendingAnalytics ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                  Send Now
                </Button>
                <Button size="sm" variant="outline" onClick={() => preview('analytics')}
                  className="border-[var(--b)] text-[var(--t)] text-xs" data-testid="preview-analytics">
                  <Eye className="w-3 h-3 mr-1" /> Preview
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* SOC 2 Audit Digest */}
      <Card className="glass-card">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-[var(--t)] font-bold text-sm">SOC 2 Audit Digest</h3>
                <p className="text-[var(--t5)] text-xs">Failed logins, critical events, data access patterns, top IPs</p>
              </div>
            </div>
            <Switch
              checked={prefs?.audit_digest_enabled ?? true}
              onCheckedChange={(v) => updatePref({ audit_digest_enabled: v })}
              disabled={saving}
              data-testid="founder-audit-digest-toggle"
            />
          </div>

          {prefs?.audit_digest_enabled !== false && (
            <>
              <Separator className="bg-[var(--b)]" />

              {/* Additional Recipients */}
              <div>
                <label className="text-[var(--t)] text-xs font-bold mb-2 block uppercase tracking-wider">Additional Recipients</label>
                <div className="space-y-2">
                  {(prefs?.audit_digest_recipients || []).map((email, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--b)]">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-[var(--t4)]" />
                        <span className="text-[var(--t)] text-sm">{email}</span>
                      </div>
                      <button onClick={() => removeRecipient(email)} disabled={saving}
                        className="text-red-400 hover:text-red-300 p-1" data-testid={`remove-audit-recipient-${i}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Input type="email" placeholder="auditor@example.com" value={newRecipient}
                      onChange={(e) => setNewRecipient(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
                      className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm flex-1"
                      data-testid="audit-recipient-input" />
                    <Button onClick={addRecipient} disabled={saving || !newRecipient.trim()}
                      variant="outline" size="sm"
                      className="border-[var(--gold)] text-[var(--gold)] hover:bg-[var(--gold)] hover:text-[#0b1120] whitespace-nowrap"
                      data-testid="audit-add-recipient-btn">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : '+ Add'}
                    </Button>
                  </div>
                </div>
              </div>

              <Separator className="bg-[var(--b)]" />

              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={() => sendNow('audit')} disabled={sendingAudit}
                  className="bg-blue-600 text-white hover:bg-blue-500 text-xs font-bold" data-testid="send-audit-now">
                  {sendingAudit ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                  Send Now
                </Button>
                <Button size="sm" variant="outline" onClick={() => preview('audit')}
                  className="border-[var(--b)] text-[var(--t)] text-xs" data-testid="preview-audit">
                  <Eye className="w-3 h-3 mr-1" /> Preview
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Security Alerts */}
      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-[var(--t)] font-bold text-sm">Security Alerts</h3>
                <p className="text-[var(--t5)] text-xs">Immediate email on critical events (account lockouts, data breaches)</p>
              </div>
            </div>
            <Switch
              checked={prefs?.security_alerts_enabled ?? true}
              onCheckedChange={(v) => updatePref({ security_alerts_enabled: v })}
              disabled={saving}
              data-testid="founder-security-alerts-toggle"
            />
          </div>
        </CardContent>
      </Card>

      {/* Email Preview Modal */}
      {previewHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => { setPreviewHtml(''); setPreviewType(''); }}>
          <div className="rounded-xl border border-[var(--b)] w-full max-w-2xl max-h-[85vh] overflow-auto"
            style={{ background: 'var(--bg)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--b)] sticky top-0 z-10" style={{ background: 'var(--bg)' }}>
              <h3 className="text-white font-bold text-sm uppercase tracking-wider">
                {previewType === 'analytics' ? 'Analytics Digest Preview' : 'Audit Digest Preview'}
              </h3>
              <Button size="sm" variant="outline" onClick={() => { setPreviewHtml(''); setPreviewType(''); }}
                className="border-[var(--b)] text-white hover:bg-white/10 font-bold" data-testid="close-email-preview">Close</Button>
            </div>
            <div className="p-2 overflow-x-auto">
              <iframe srcDoc={previewHtml} title="Email Preview" className="w-full border-0 rounded-lg" style={{ minWidth: '320px', height: '600px' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
