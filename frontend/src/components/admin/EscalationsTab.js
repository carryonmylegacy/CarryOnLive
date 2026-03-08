import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, Plus, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PRIORITY_STYLES = {
  low: { color: '#64748B', bg: 'rgba(100,116,139,0.1)', label: 'Low' },
  normal: { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', label: 'Normal' },
  high: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', label: 'High' },
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', label: 'Critical' },
};

export const EscalationsTab = ({ getAuthHeaders, isFounder = false }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'normal', related_type: '', related_id: '' });
  const [saving, setSaving] = useState(false);
  const [resolveId, setResolveId] = useState(null);
  const [resolveNote, setResolveNote] = useState('');
  const [filter, setFilter] = useState('');

  const fetch_ = async () => {
    try {
      const url = filter ? `${API_URL}/ops/escalations?status=${filter}` : `${API_URL}/ops/escalations`;
      const res = await axios.get(url, getAuthHeaders());
      setItems(res.data);
    } catch { toast.error('Failed to load escalations'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetch_(); }, [filter]); // eslint-disable-line

  const handleCreate = async () => {
    if (!form.subject.trim() || !form.description.trim()) return toast.error('Subject and description required');
    setSaving(true);
    try {
      await axios.post(`${API_URL}/ops/escalations`, form, getAuthHeaders());
      toast.success('Escalation submitted');
      setShowForm(false);
      setForm({ subject: '', description: '', priority: 'normal', related_type: '', related_id: '' });
      fetch_();
    } catch { toast.error('Failed to create escalation'); }
    finally { setSaving(false); }
  };

  const handleResolve = async () => {
    if (!resolveNote.trim()) return toast.error('Resolution note required');
    try {
      await axios.put(`${API_URL}/ops/escalations/${resolveId}/resolve`, { resolution_note: resolveNote }, getAuthHeaders());
      toast.success('Escalation resolved');
      setResolveId(null);
      setResolveNote('');
      fetch_();
    } catch { toast.error('Failed to resolve'); }
  };

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--t4)]" /></div>;

  return (
    <div className="space-y-4" data-testid="escalations-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-[var(--t)]">{isFounder ? 'Escalations from Operators' : 'My Escalations'}</h2>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-xs">
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
          {!isFounder && (
            <button onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--gold)] text-[#0F1629]" data-testid="new-escalation-btn">
              <Plus className="w-3.5 h-3.5" /> Escalate
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
              placeholder="Subject" className="w-full px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-sm" data-testid="escalation-subject" />
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Describe the issue that requires founder attention..." rows={3} className="w-full px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-sm resize-none" data-testid="escalation-description" />
            <div className="flex gap-3">
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                className="px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-xs">
                {Object.entries(PRIORITY_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={form.related_type} onChange={e => setForm({ ...form, related_type: e.target.value })}
                className="px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-xs">
                <option value="">Related to...</option>
                <option value="support">Support</option>
                <option value="dts">DTS</option>
                <option value="verification">Verification</option>
                <option value="tvt">TVT</option>
              </select>
              <button onClick={handleCreate} disabled={saving}
                className="ml-auto px-4 py-2 rounded-lg bg-[var(--gold)] text-[#0F1629] text-xs font-bold" data-testid="submit-escalation-btn">
                {saving ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-8 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-[var(--t5)]" />
          <p className="text-sm text-[var(--t4)]">No escalations</p>
        </CardContent></Card>
      ) : (
        items.map(item => {
          const ps = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.normal;
          const isOpen = item.status === 'open';
          return (
            <Card key={item.id} className="glass-card" style={{ borderLeft: `3px solid ${isOpen ? ps.color : '#22C55E'}` }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-bold text-[var(--t)]">{item.subject}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: ps.bg, color: ps.color }}>{ps.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: isOpen ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)', color: isOpen ? '#F59E0B' : '#22C55E' }}>
                        {isOpen ? 'Open' : 'Resolved'}
                      </span>
                      {item.related_type && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--s)] text-[var(--t5)] capitalize">{item.related_type}</span>}
                    </div>
                    <p className="text-xs text-[var(--t3)] mb-2">{item.description}</p>
                    <p className="text-[10px] text-[var(--t5)]">By {item.created_by_name} · {new Date(item.created_at).toLocaleString()}</p>
                    {item.resolution_note && (
                      <div className="mt-2 p-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                        <p className="text-[10px] font-bold text-[#22C55E] mb-0.5">Resolution:</p>
                        <p className="text-xs text-[var(--t3)]">{item.resolution_note}</p>
                        <p className="text-[10px] text-[var(--t5)] mt-1">By {item.resolved_by_name} · {new Date(item.resolved_at).toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                  {isFounder && isOpen && (
                    <button onClick={() => setResolveId(resolveId === item.id ? null : item.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#22C55E] text-white flex-shrink-0" data-testid={`resolve-escalation-${item.id}`}>
                      Resolve
                    </button>
                  )}
                </div>
                {resolveId === item.id && (
                  <div className="mt-3 flex gap-2">
                    <input value={resolveNote} onChange={e => setResolveNote(e.target.value)}
                      placeholder="Resolution note..." className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-xs" data-testid="resolve-note-input" />
                    <button onClick={handleResolve} className="px-3 py-2 rounded-lg bg-[#22C55E] text-white text-xs font-bold" data-testid="confirm-resolve-btn">Confirm</button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};
