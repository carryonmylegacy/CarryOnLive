import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { Shield, Download, FileText, AlertTriangle, Trash2, ChevronRight, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const PrivacyCard = () => {
  const { user, getAuthHeaders, logout } = useAuth();

  const [consent, setConsent] = useState(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [retentionPolicy, setRetentionPolicy] = useState(null);
  const [showRetention, setShowRetention] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    axios.get(`${API_URL}/compliance/consent`, getAuthHeaders())
      .then(res => setConsent(res.data))
      .catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const PREF_LABELS = {
    marketing_emails: 'Marketing Emails',
    analytics_tracking: 'Analytics Tracking',
    third_party_sharing: 'Third-Party Data Sharing',
  };

  const updateConsent = useCallback(async (key, value) => {
    setConsentLoading(true);
    try {
      const updated = { ...consent, [key]: value };
      await axios.put(`${API_URL}/compliance/consent`, { [key]: value }, getAuthHeaders());
      setConsent(updated);
      const label = PREF_LABELS[key] || 'Preference';
      toast.success(`${label} ${value ? 'enabled' : 'disabled'} — saved.`);
    } catch { toast.error('Failed to update preference'); }
    finally { setConsentLoading(false); }
  }, [consent, getAuthHeaders]);

  const handleDataExport = useCallback(async () => {
    setExportLoading(true);
    try {
      const res = await axios.get(`${API_URL}/compliance/export`, getAuthHeaders());
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `carryon-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Data exported successfully');
    } catch { toast.error('Failed to export data'); }
    finally { setExportLoading(false); }
  }, [getAuthHeaders]);

  const fetchRetentionPolicy = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/compliance/retention-policy`, getAuthHeaders());
      setRetentionPolicy(res.data);
      setShowRetention(true);
    } catch { toast.error('Failed to load retention policy'); }
  }, [getAuthHeaders]);

  const handleDeleteRequest = useCallback(async () => {
    setDeleteLoading(true);
    try {
      await axios.post(`${API_URL}/compliance/delete-request`, { reason: deleteReason }, getAuthHeaders());
      toast.success('Account deletion requested. You will receive a confirmation email.');
      setShowDeleteConfirm(false);
      setTimeout(() => logout(), 3000);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to submit deletion request'); }
    finally { setDeleteLoading(false); }
  }, [deleteReason, getAuthHeaders, logout]);

  return (
    <>
      <Card className="glass-card" data-testid="gdpr-settings">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--gold)]" />
            Privacy & Data Rights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Consent Toggles */}
          <div>
            <h4 className="text-[var(--t)] font-medium text-sm mb-3">Data Consent Preferences</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[var(--t)] font-medium text-sm">Essential Services</h4>
                  <p className="text-[var(--t5)] text-xs">Required for core platform functionality</p>
                </div>
                <Switch checked disabled data-testid="consent-essential" />
              </div>
              <Separator className="bg-[var(--b)]" />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[var(--t)] font-medium text-sm">Marketing Emails</h4>
                  <p className="text-[var(--t5)] text-xs">Product updates, tips, and promotions</p>
                </div>
                <Switch
                  checked={consent?.marketing_emails || false}
                  onCheckedChange={(v) => updateConsent('marketing_emails', v)}
                  disabled={consentLoading}
                  data-testid="consent-marketing"
                />
              </div>
              <Separator className="bg-[var(--b)]" />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[var(--t)] font-medium text-sm">Analytics Tracking</h4>
                  <p className="text-[var(--t5)] text-xs">Anonymous usage data to improve the platform</p>
                </div>
                <Switch
                  checked={consent?.analytics_tracking || false}
                  onCheckedChange={(v) => updateConsent('analytics_tracking', v)}
                  disabled={consentLoading}
                  data-testid="consent-analytics"
                />
              </div>
              <Separator className="bg-[var(--b)]" />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[var(--t)] font-medium text-sm">Third-Party Data Sharing</h4>
                  <p className="text-[var(--t5)] text-xs">Share data with trusted partners for service enhancement</p>
                </div>
                <Switch
                  checked={consent?.third_party_sharing || false}
                  onCheckedChange={(v) => updateConsent('third_party_sharing', v)}
                  disabled={consentLoading}
                  data-testid="consent-third-party"
                />
              </div>
            </div>
            {consent?.updated_at && (
              <p className="text-[var(--t5)] text-[11px] mt-2">
                Last updated: {new Date(consent.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>

          <Separator className="bg-[var(--b)]" />

          {/* Data Rights Actions */}
          <div>
            <h4 className="text-[var(--t)] font-medium text-sm mb-3">Your Data Rights</h4>
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full border-[var(--b)] text-[var(--t)] justify-between"
                onClick={handleDataExport}
                disabled={exportLoading}
                data-testid="gdpr-export-data"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-[var(--bl3)]" />
                  Download My Data
                </span>
                {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
              <p className="text-[var(--t5)] text-[11px] pl-1">GDPR Article 15/20 — Export all your personal data as JSON</p>

              <Button
                variant="outline"
                className="w-full border-[var(--b)] text-[var(--t)] justify-between"
                onClick={fetchRetentionPolicy}
                data-testid="gdpr-retention-policy"
              >
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--gold)]" />
                  Data Retention Policy
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                className="w-full border-[#ef4444]/30 text-[#ef4444] justify-between hover:bg-[#ef4444]/5"
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="gdpr-delete-account"
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Request Account Deletion
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <p className="text-[var(--t5)] text-[11px] pl-1">GDPR Article 17 — Permanently delete your account and all data</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Retention Policy Modal */}
      {showRetention && retentionPolicy && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[5vh] px-4 overflow-y-auto" onClick={() => setShowRetention(false)}>
          <div className="glass-card p-6 max-w-lg w-full border border-[var(--b2)] mb-8" onClick={e => e.stopPropagation()} data-testid="retention-policy-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2">
                <FileText className="w-5 h-5 text-[var(--gold)]" />
                Data Retention Policy
              </h3>
              <button onClick={() => setShowRetention(false)} className="text-[var(--t5)] hover:text-[var(--t)]">
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>
            <p className="text-[var(--t4)] text-xs mb-4">Version {retentionPolicy.policy_version} · Updated {retentionPolicy.last_updated}</p>
            <div className="space-y-3">
              {retentionPolicy.categories.map((cat, i) => (
                <div key={i} className="rounded-lg p-3" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-[var(--t)] font-medium text-sm">{cat.data_type}</h4>
                      <p className="text-[var(--t4)] text-xs mt-0.5">{cat.retention}</p>
                    </div>
                  </div>
                  <p className="text-[var(--t5)] text-[11px] mt-1">Legal basis: {cat.legal_basis}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[5vh] px-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="glass-card p-6 max-w-md w-full border border-[#ef4444]/20" onClick={e => e.stopPropagation()} data-testid="delete-account-modal">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#ef4444]/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#ef4444]">Delete Account</h3>
                <p className="text-[var(--t4)] text-xs">This action cannot be undone</p>
              </div>
            </div>
            <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <p className="text-[var(--t3)] text-xs leading-relaxed">
                Your account and all associated data (estates, documents, messages, beneficiaries) will be permanently deleted within 30 days. This complies with GDPR Article 17.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[var(--t4)] text-xs block mb-1">Type your email to confirm</label>
                <input
                  value={deleteEmail}
                  onChange={e => setDeleteEmail(e.target.value)}
                  placeholder={user?.email}
                  className="w-full px-3 py-2 bg-[var(--s)] border border-[var(--b)] rounded-lg text-[var(--t)] text-sm outline-none focus:border-[#ef4444]/50"
                  data-testid="delete-confirm-email"
                />
              </div>
              <div>
                <label className="text-[var(--t4)] text-xs block mb-1">Reason (optional)</label>
                <input
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  placeholder="Why are you leaving?"
                  className="w-full px-3 py-2 bg-[var(--s)] border border-[var(--b)] rounded-lg text-[var(--t)] text-sm outline-none focus:border-[var(--b2)]"
                  data-testid="delete-reason"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 border-[var(--b)] text-[var(--t)]"
                  onClick={() => setShowDeleteConfirm(false)}
                  data-testid="delete-cancel"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-[#ef4444] hover:bg-[#dc2626] text-white"
                  disabled={deleteEmail !== user?.email || deleteLoading}
                  onClick={handleDeleteRequest}
                  data-testid="delete-confirm"
                >
                  {deleteLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete My Account
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PrivacyCard;
