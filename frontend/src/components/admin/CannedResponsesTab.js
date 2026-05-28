import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/apiClient';
import { MessageSquare, Plus, Loader2, Pencil, Trash2, Copy, Check } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const CATEGORIES = [
  { value: 'general', label: 'General', color: '#64748B' },
  { value: 'billing', label: 'Billing', color: '#22C993' },
  { value: 'technical', label: 'Technical', color: '#3B82F6' },
  { value: 'onboarding', label: 'Onboarding', color: '#B794F6' },
  { value: 'transition', label: 'Transition', color: '#F59E0B' },
];

export const CannedResponsesTab = ({ getAuthHeaders, isManager = false }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ title: '', body: '', category: 'general', tags: [] });

  const headers = getAuthHeaders()?.headers || {};

  const fetch_ = async () => {
    try {
      const res = await apiClient.get(`${API_URL}/ops/canned-responses`, { headers });
      setItems(res.data);
    } catch { toast.error('Failed to load templates'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, []); // eslint-disable-line

  const handleCreate = async () => {
    if (!form.title.trim() || !form.body.trim()) return toast.error('Title and body required');
    setSaving(true);
    try {
      await apiClient.post(`${API_URL}/ops/canned-responses`, form, {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
      toast.success('Template created');
      setShowCreate(false);
      setForm({ title: '', body: '', category: 'general', tags: [] });
      fetch_();
    } catch { toast.error('Failed to create'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id) => {
    setSaving(true);
    try {
      await apiClient.put(`${API_URL}/ops/canned-responses/${id}`, form, {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
      toast.success('Updated');
      setEditId(null);
      fetch_();
    } catch { toast.error('Failed to update'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await apiClient.delete(`${API_URL}/ops/canned-responses/${id}`, { headers });
      fetch_();
    } catch { toast.error('Failed to delete'); }
  };

  const copyBody = async (item) => {
    await navigator.clipboard.writeText(item.body);
    setCopied(item.id);
    setTimeout(() => setCopied(null), 2000);
    // Track usage
    apiClient.post(`${API_URL}/ops/canned-responses/${item.id}/use`, {}, { headers }).catch(() => {});
  };

  const filtered = filter ? items.filter(i => i.category === filter) : items;

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--t4)]" /></div>;

  return (
    <div className="space-y-4" data-testid="canned-responses-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-[var(--t)]">Response Templates</h2>
          <p className="text-xs text-[var(--t5)]">Reusable responses for common support scenarios</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-xs">
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {isManager && (
            <Button onClick={() => { setShowCreate(!showCreate); setEditId(null); }} size="sm" className="gold-button text-xs" data-testid="create-template-btn">
              <Plus className="w-3 h-3 mr-1" /> New
            </Button>
          )}
        </div>
      </div>

      {showCreate && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
              placeholder="Template title" className="text-sm" data-testid="template-title" />
            <textarea value={form.body} onChange={e => setForm({...form, body: e.target.value})}
              placeholder="Response body..." rows={4}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-base resize-none"
              data-testid="template-body" />
            <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
              className="px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-xs">
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <Button onClick={() => setShowCreate(false)} variant="ghost" size="sm" className="text-xs">Cancel</Button>
              <Button onClick={handleCreate} disabled={saving} size="sm" className="gold-button text-xs" data-testid="save-template-btn">
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-8 text-center">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 text-[var(--t5)]" />
          <p className="text-sm text-[var(--t4)]">No templates yet</p>
        </CardContent></Card>
      ) : (
        filtered.map(item => {
          const cat = CATEGORIES.find(c => c.value === item.category) || CATEGORIES[0];
          const isEditing = editId === item.id;
          return (
            <Card key={item.id} className="glass-card" data-testid={`template-${item.id}`}>
              <CardContent className="p-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Title" className="text-sm" />
                    <textarea value={form.body} onChange={e => setForm({...form, body: e.target.value})} rows={3}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-base resize-none" />
                    <div className="flex gap-2 justify-end">
                      <Button onClick={() => setEditId(null)} variant="ghost" size="sm" className="text-xs">Cancel</Button>
                      <Button onClick={() => handleUpdate(item.id)} disabled={saving} size="sm" className="gold-button text-xs">Save</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-[var(--t)]">{item.title}</span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${cat.color}15`, color: cat.color }}>{cat.label}</span>
                          {item.use_count > 0 && <span className="text-[11px] text-[var(--t5)]">Used {item.use_count}x</span>}
                        </div>
                        <p className="text-xs text-[var(--t3)] whitespace-pre-wrap">{item.body}</p>
                        <p className="text-[11px] text-[var(--t5)] mt-2">By {item.created_by_name}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => copyBody(item)}
                          className="p-1.5 rounded-lg text-[var(--t5)] hover:text-[#22C993] transition-colors" title="Copy to clipboard">
                          {copied === item.id ? <Check className="w-3.5 h-3.5 text-[#22C993]" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        {isManager && (
                          <>
                            <button onClick={() => { setEditId(item.id); setForm({ title: item.title, body: item.body, category: item.category, tags: item.tags || [] }); setShowCreate(false); }}
                              className="p-1.5 rounded-lg text-[var(--t5)] hover:text-[var(--t3)] transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(item.id)}
                              className="p-1.5 rounded-lg text-[var(--t5)] hover:text-red-400 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};
