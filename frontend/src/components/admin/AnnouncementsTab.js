import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Megaphone, Plus, Trash2, Users, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PRIORITY_STYLES = {
  info: { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', label: 'Info' },
  warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', label: 'Warning' },
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', label: 'Critical' },
};

const AUDIENCE_LABELS = { all: 'Everyone', benefactors: 'Benefactors', beneficiaries: 'Beneficiaries', operators: 'Operators' };

export const AnnouncementsTab = ({ getAuthHeaders }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', audience: 'all', priority: 'info' });
  const [saving, setSaving] = useState(false);

  const fetch_ = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/announcements?active_only=false`, getAuthHeaders());
      setItems(res.data);
    } catch { toast.error('Failed to load announcements'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetch_(); }, []); // eslint-disable-line

  const handleCreate = async () => {
    if (!form.title.trim() || !form.body.trim()) return toast.error('Title and body are required');
    setSaving(true);
    try {
      await axios.post(`${API_URL}/admin/announcements`, form, getAuthHeaders());
      toast.success('Announcement published');
      setShowForm(false);
      setForm({ title: '', body: '', audience: 'all', priority: 'info' });
      fetch_();
    } catch { toast.error('Failed to create announcement'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/admin/announcements/${id}`, getAuthHeaders());
      toast.success('Announcement deactivated');
      fetch_();
    } catch { toast.error('Failed to delete'); }
  };

  if (loading) return <div className="text-center py-12 text-[var(--t4)]"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4" data-testid="announcements-tab">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--t)]">Platform Announcements</h2>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--gold)] text-[#0F1629]"
          data-testid="new-announcement-btn">
          <Plus className="w-3.5 h-3.5" /> New Announcement
        </button>
      </div>

      {showForm && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Announcement title" className="w-full px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-sm" data-testid="announcement-title-input" />
            <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
              placeholder="Announcement body..." rows={3} className="w-full px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-sm resize-none" data-testid="announcement-body-input" />
            <div className="flex gap-3">
              <select value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })}
                className="px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-xs">
                {Object.entries(AUDIENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                className="px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-xs">
                {Object.entries(PRIORITY_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button onClick={handleCreate} disabled={saving}
                className="ml-auto px-4 py-2 rounded-lg bg-[var(--gold)] text-[#0F1629] text-xs font-bold" data-testid="publish-announcement-btn">
                {saving ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-8 text-center">
          <Megaphone className="w-10 h-10 mx-auto mb-3 text-[var(--t5)]" />
          <p className="text-sm text-[var(--t4)]">No announcements yet</p>
        </CardContent></Card>
      ) : (
        items.map(item => {
          const ps = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.info;
          return (
            <Card key={item.id} className="glass-card" style={{ opacity: item.is_active ? 1 : 0.5, borderLeft: `3px solid ${ps.color}` }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-[var(--t)]">{item.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: ps.bg, color: ps.color }}>{ps.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--s)] text-[var(--t5)]">{AUDIENCE_LABELS[item.audience] || item.audience}</span>
                      {!item.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--rdbg)] text-[var(--rd)]">Inactive</span>}
                    </div>
                    <p className="text-xs text-[var(--t3)] mb-2">{item.body}</p>
                    <p className="text-[10px] text-[var(--t5)]">By {item.created_by_name} · {new Date(item.created_at).toLocaleString()}</p>
                  </div>
                  {item.is_active && (
                    <button onClick={() => handleDelete(item.id)} className="p-2 rounded-lg hover:bg-[var(--rdbg)] text-[var(--t5)] hover:text-[var(--rd)] transition-colors" data-testid={`delete-announcement-${item.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};
