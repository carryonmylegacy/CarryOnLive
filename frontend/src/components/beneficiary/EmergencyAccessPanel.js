import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import {
  AlertTriangle, Clock, CheckCircle, XCircle,
  Send, Loader2, Shield, Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';
import { formatPhoneUS } from '../../utils/phoneFormat';

const STATUS_CONFIG = {
  pending: { color: '#f59e0b', bg: '#f59e0b20', icon: Clock, label: 'Under Review' },
  approved: { color: '#10b981', bg: '#10b98120', icon: CheckCircle, label: 'Access Granted' },
  denied: { color: '#ef4444', bg: '#ef444420', icon: XCircle, label: 'Denied' },
  more_info_needed: { color: '#3b82f6', bg: '#3b82f620', icon: Info, label: 'More Info Needed' },
};

const EmergencyAccessPanel = ({ estates }) => {
  const { getAuthHeaders } = useAuth();
  const [requests, setRequests] = useState([]);
  const [activeAccess, setActiveAccess] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    estate_id: '',
    reason: '',
    relationship_to_benefactor: '',
    urgency: 'high',
    contact_phone: '',
    supporting_details: '',
  });

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const [reqRes, activeRes] = await Promise.all([
        apiClient.get(`${API_URL}/emergency-access/my-requests`, getAuthHeaders()),
        apiClient.get(`${API_URL}/emergency-access/active`, getAuthHeaders()),
      ]);
      setRequests(reqRes.data);
      setActiveAccess(activeRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!form.estate_id || !form.reason || !form.relationship_to_benefactor) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`${API_URL}/emergency-access/request`, form, getAuthHeaders());
      // toast removed
      setShowForm(false);
      setForm({ estate_id: '', reason: '', relationship_to_benefactor: '', urgency: 'high', contact_phone: '', supporting_details: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  const hasPending = requests.some(r => r.status === 'pending');

  return (
    <Card className="border-[var(--b)] bg-[var(--bg2)]" data-testid="emergency-access-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-[var(--t)] text-base flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#ef4444]" />
          Report a Loved One's Passing
        </CardTitle>
        <p className="text-xs text-[var(--t4)] mt-1 leading-relaxed">
          We're here to help your family through this transition. This process verifies your identity and begins unlocking the estate plan your loved one prepared for you.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active access grants */}
        {activeAccess.length > 0 && (
          <div className="p-4 rounded-lg bg-[#10b981]/10 border border-[#10b981]/30">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-[#10b981]" />
              <p className="text-sm font-medium text-[#10b981]">Active Emergency Access</p>
            </div>
            {activeAccess.map(a => (
              <div key={a.id} className="text-xs text-[#94a3b8] mt-1">
                <span className="text-[var(--t)]">{a.estate_name}</span> — {a.access_level === 'full' ? 'Full Access' : 'Read-Only'} until {new Date(a.access_expires_at).toLocaleDateString()}
              </div>
            ))}
          </div>
        )}

        {/* Existing requests */}
        {requests.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-[#64748b] uppercase font-medium">Your Requests</p>
            {requests.slice(0, 3).map(r => {
              const config = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
              const Icon = config.icon;
              return (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--s)]">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: config.bg }}>
                    <Icon className="w-4 h-4" style={{ color: config.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--t)] truncate">{r.estate_name}</p>
                    <p className="text-xs text-[#64748b]">{config.label} {r.reviewed_at ? `- ${new Date(r.reviewed_at).toLocaleDateString()}` : ''}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Request form */}
        {showForm ? (
          <div className="space-y-3 p-4 rounded-lg bg-[var(--s)] border border-[var(--b)]">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-[#f59e0b]" />
              <p className="text-sm font-medium text-[var(--t)]">Request Emergency Access</p>
            </div>
            <p className="text-xs text-[#94a3b8]">
              This request will be reviewed by our Transition Verification Team. Emergency requests are typically processed within 2-4 hours.
            </p>

            <div className="space-y-1">
              <Label className="text-xs text-[#94a3b8]">Estate <span className="text-red-400">*</span></Label>
              <select
                value={form.estate_id}
                onChange={e => setForm(f => ({ ...f, estate_id: e.target.value }))}
                className="w-full bg-[var(--s)] border border-[var(--b)] rounded-lg px-3 py-2 text-sm text-[var(--t)]"
                data-testid="emergency-estate-select"
              >
                <option value="">Select estate...</option>
                {(estates || []).map(e => (
                  <option key={e.id || e.estate_id} value={e.id || e.estate_id}>{e.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-[#94a3b8]">Your relationship to the estate holder <span className="text-red-400">*</span></Label>
              <Input
                value={form.relationship_to_benefactor}
                onChange={e => setForm(f => ({ ...f, relationship_to_benefactor: e.target.value }))}
                placeholder="e.g., Daughter, Spouse, Sibling"
                className="bg-[var(--s)] border-[var(--b)] text-[var(--t)] text-sm"
                data-testid="emergency-relationship-input"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-[#94a3b8]">Please describe the circumstances <span className="text-red-400">*</span></Label>
              <textarea
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Share what has happened so we can assist your family..."
                rows={3}
                className="w-full bg-[var(--s)] border border-[var(--b)] rounded-lg px-3 py-2 text-sm text-[var(--t)] placeholder-[#64748b] resize-none"
                data-testid="emergency-reason-input"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-[#94a3b8]">Contact Phone</Label>
              <Input
                value={form.contact_phone}
                onChange={e => setForm(prev => ({ ...prev, contact_phone: formatPhoneUS(e.target.value) }))}
                placeholder="(123) 456-7890"
                className="bg-[var(--s)] border-[var(--b)] text-[var(--t)] text-sm"
              />
            </div>

            <p className="text-[11px] text-[var(--t4)] leading-relaxed bg-[var(--bg2)] p-3 rounded-lg border border-[var(--b)]">
              <strong className="text-[var(--t3)]">What happens next:</strong> CarryOn will verify your identity, notify the estate administrator, and begin the transition process. You'll receive updates at each step.
            </p>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSubmit} disabled={submitting} className="flex-1 bg-[#ef4444] hover:bg-[#dc2626] text-[var(--t)] text-sm" data-testid="emergency-submit-btn">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Submit Request
              </Button>
              <Button onClick={() => setShowForm(false)} variant="outline" className="border-[var(--b)] text-[#94a3b8] text-sm">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setShowForm(true)}
            disabled={hasPending}
            variant="outline"
            className="w-full border-[#ef4444]/30 text-[#ef4444] hover:bg-[#ef4444]/10 text-sm"
            data-testid="emergency-request-btn"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            {hasPending ? 'Request Pending Review' : 'Request Emergency Access'}
          </Button>
        )}

        <p className="text-[11px] text-[#64748b] leading-relaxed">
          This feature is for situations where a loved one has passed or is unable to manage their estate.
          All requests are handled with care and verified by our team. Your privacy is protected throughout this process.
        </p>
      </CardContent>
    </Card>
  );
};

export default EmergencyAccessPanel;
