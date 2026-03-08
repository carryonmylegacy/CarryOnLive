import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { StickyNote, Plus, Check, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORY_STYLES = {
  general: { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', label: 'General' },
  urgent: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', label: 'Urgent' },
  followup: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', label: 'Follow-up' },
};

export const ShiftNotesTab = ({ getAuthHeaders }) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ content: '', category: 'general' });
  const [saving, setSaving] = useState(false);

  const fetch_ = async () => {
    try {
      const res = await axios.get(`${API_URL}/ops/shift-notes`, getAuthHeaders());
      setNotes(res.data);
    } catch { toast.error('Failed to load shift notes'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetch_(); }, []); // eslint-disable-line

  const handleCreate = async () => {
    if (!form.content.trim()) return toast.error('Note content is required');
    setSaving(true);
    try {
      await axios.post(`${API_URL}/ops/shift-notes`, form, getAuthHeaders());
      toast.success('Shift note added');
      setShowForm(false);
      setForm({ content: '', category: 'general' });
      fetch_();
    } catch { toast.error('Failed to create note'); }
    finally { setSaving(false); }
  };

  const handleAcknowledge = async (noteId) => {
    try {
      await axios.post(`${API_URL}/ops/shift-notes/${noteId}/acknowledge`, {}, getAuthHeaders());
      toast.success('Acknowledged');
      fetch_();
    } catch { toast.error('Failed to acknowledge'); }
  };

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--t4)]" /></div>;

  return (
    <div className="space-y-4" data-testid="shift-notes-tab">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--t)]">Shift Notes & Handoff</h2>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--gold)] text-[#0F1629]" data-testid="new-shift-note-btn">
          <Plus className="w-3.5 h-3.5" /> Add Note
        </button>
      </div>

      {showForm && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
              placeholder="Leave a note for the next operator on shift..." rows={3}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-sm resize-none" data-testid="shift-note-content" />
            <div className="flex gap-3">
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-xs">
                {Object.entries(CATEGORY_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button onClick={handleCreate} disabled={saving}
                className="ml-auto px-4 py-2 rounded-lg bg-[var(--gold)] text-[#0F1629] text-xs font-bold" data-testid="post-shift-note-btn">
                {saving ? 'Posting...' : 'Post Note'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {notes.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-8 text-center">
          <StickyNote className="w-10 h-10 mx-auto mb-3 text-[var(--t5)]" />
          <p className="text-sm text-[var(--t4)]">No shift notes yet. Start the handoff log!</p>
        </CardContent></Card>
      ) : (
        notes.map(note => {
          const cs = CATEGORY_STYLES[note.category] || CATEGORY_STYLES.general;
          const iAcknowledged = (note.acknowledged_by || []).some(a => a.user_id === user?.id);
          const ackCount = (note.acknowledged_by || []).length;
          const isOwn = note.author_id === user?.id;
          return (
            <Card key={note.id} className="glass-card" style={{ borderLeft: `3px solid ${cs.color}` }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-[var(--t)]">{note.author_name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: cs.bg, color: cs.color }}>{cs.label}</span>
                      <span className="text-[10px] text-[var(--t5)]">{new Date(note.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-[var(--t2)] whitespace-pre-wrap">{note.content}</p>
                    {ackCount > 0 && (
                      <div className="mt-2 flex items-center gap-1">
                        <Check className="w-3 h-3 text-[#22C55E]" />
                        <span className="text-[10px] text-[var(--t5)]">Acknowledged by {(note.acknowledged_by || []).map(a => a.name).join(', ')}</span>
                      </div>
                    )}
                  </div>
                  {!isOwn && !iAcknowledged && (
                    <button onClick={() => handleAcknowledge(note.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--s)] text-[var(--t4)] border border-[var(--b)] hover:border-[#22C55E] hover:text-[#22C55E] transition-colors flex-shrink-0"
                      data-testid={`ack-note-${note.id}`}>
                      <Check className="w-3 h-3" /> Acknowledge
                    </button>
                  )}
                  {iAcknowledged && (
                    <span className="text-[10px] text-[#22C55E] font-bold flex-shrink-0">Acknowledged</span>
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
