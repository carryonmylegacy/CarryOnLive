import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  AlertTriangle, Clock, CheckCircle, XCircle, Phone,
  Send, Loader2, Shield, FileText, Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_CONFIG = {
  pending: { color: '#f59e0b', bg: '#f59e0b20', icon: Clock, label: 'Under Review' },
  approved: { color: '#10b981', bg: '#10b98120', icon: CheckCircle, label: 'Access Granted' },
  denied: { color: '#ef4444', bg: '#ef444420', icon: XCircle, label: 'Denied' },
  more_info_needed: { color: '#3b82f6', bg: '#3b82f620', icon: Info, label: 'More Info Needed' },
};

const EmergencyAccessPanel = ({ estates }) => {
  const { user, getAuthHeaders } = useAuth();
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
        axios.get(`${API_URL}/emergency-access/my-requests`, getAuthHeaders()),
        axios.get(`${API_URL}/emergency-access/active`, getAuthHeaders()),
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
      await axios.post(`${API_URL}/emergency-access/request`, form, getAuthHeaders());
      toast.success('Emergency access request submitted. Our team will review promptly.');
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
    <Card className="border-[var(--b)] bg-[#0F1629]/80" data-testid="emergency-access-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#ef4444]" />
          Emergency Access Protocol
        </CardTitle>
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
                <span className="text-white">{a.estate_name}</span> — {a.access_level === 'full' ? 'Full Access' : 'Read-Only'} until {new Date(a.access_expires_at).toLocaleDateString()}
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
                    <p className="text-sm text-white truncate">{r.estate_name}</p>
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
              <p className="text-sm font-medium text-white">Request Emergency Access</p>
            </div>
            <p className="text-xs text-[#94a3b8]">
              This request will be reviewed by our Transition Verification Team. Emergency requests are typically processed within 2-4 hours.
            </p>

            <div className="space-y-1">
              <Label className="text-xs text-[#94a3b8]">Estate *</Label>
              <select
                value={form.estate_id}
                onChange={e => setForm(f => ({ ...f, estate_id: e.target.value }))}
                className="w-full bg-[var(--s)] border border-[var(--b)] rounded-lg px-3 py-2 text-sm text-white"
                data-testid="emergency-estate-select"
              >
                <option value="">Select estate...</option>
                {(estates || []).map(e => (
                  <option key={e.id || e.estate_id} value={e.id || e.estate_id}>{e.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-[#94a3b8]">Your Relationship *</Label>
              <Input
                value={form.relationship_to_benefactor}
                onChange={e => setForm(f => ({ ...f, relationship_to_benefactor: e.target.value }))}
                placeholder="e.g., Daughter, Spouse, Sibling"
                className="bg-[var(--s)] border-[var(--b)] text-white text-sm"
                data-testid="emergency-relationship-input"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-[#94a3b8]">Reason for Request *</Label>
              <textarea
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Please explain why you need emergency access..."
                rows={3}
                className="w-full bg-[var(--s)] border border-[var(--b)] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] resize-none"
                data-testid="emergency-reason-input"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-[#94a3b8]">Contact Phone</Label>
              <Input
                value={form.contact_phone}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                  let f = digits;
                  if (digits.length > 6) f = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
                  else if (digits.length > 3) f = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
                  else if (digits.length > 0) f = `(${digits}`;
                  setForm(prev => ({ ...prev, contact_phone: f }));
                }}
                placeholder="(123) 456-7890"
                className="bg-[var(--s)] border-[var(--b)] text-white text-sm"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSubmit} disabled={submitting} className="flex-1 bg-[#ef4444] hover:bg-[#dc2626] text-white text-sm" data-testid="emergency-submit-btn">
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

        <p className="text-[10px] text-[#64748b] leading-relaxed">
          Emergency access is for situations where the benefactor is incapacitated and cannot provide access. 
          All requests are logged and verified. Misuse may result in account termination.
        </p>
      </CardContent>
    </Card>
  );
};

export default EmergencyAccessPanel;
