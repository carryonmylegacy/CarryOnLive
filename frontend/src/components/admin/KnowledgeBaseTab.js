import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BookOpen, Plus, Edit2, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'general', label: 'General' },
  { value: 'support', label: 'Support' },
  { value: 'verification', label: 'Verification' },
  { value: 'dts', label: 'DTS' },
  { value: 'tvt', label: 'TVT' },
];

const CAT_COLORS = {
  general: '#3B82F6',
  support: '#F43F5E',
  verification: '#F97316',
  dts: '#8B5CF6',
  tvt: '#F59E0B',
};

export const KnowledgeBaseTab = ({ getAuthHeaders, isFounder = false }) => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ title: '', content: '', category: 'general', tags: [] });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const fetch_ = async () => {
    try {
      const url = filter ? `${API_URL}/admin/knowledge-base?category=${filter}` : `${API_URL}/admin/knowledge-base`;
      const res = await axios.get(url, getAuthHeaders());
      setArticles(res.data);
    } catch { toast.error('Failed to load knowledge base'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetch_(); }, [filter]); // eslint-disable-line

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return toast.error('Title and content required');
    setSaving(true);
    try {
      if (editId) {
        await axios.put(`${API_URL}/admin/knowledge-base/${editId}`, form, getAuthHeaders());
        toast.success('Article updated');
      } else {
        await axios.post(`${API_URL}/admin/knowledge-base`, form, getAuthHeaders());
        toast.success('Article created');
      }
      setShowForm(false);
      setEditId(null);
      setForm({ title: '', content: '', category: 'general', tags: [] });
      fetch_();
    } catch { toast.error('Failed to save article'); }
    finally { setSaving(false); }
  };

  const handleEdit = (article) => {
    setForm({ title: article.title, content: article.content, category: article.category, tags: article.tags || [] });
    setEditId(article.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/admin/knowledge-base/${id}`, getAuthHeaders());
      toast.success('Article deleted');
      fetch_();
    } catch { toast.error('Failed to delete'); }
  };

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--t4)]" /></div>;

  return (
    <div className="space-y-4" data-testid="knowledge-base-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-[var(--t)]">Knowledge Base & SOPs</h2>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-xs">
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {isFounder && (
            <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ title: '', content: '', category: 'general', tags: [] }); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--gold)] text-[#0F1629]" data-testid="new-kb-article-btn">
              <Plus className="w-3.5 h-3.5" /> New Article
            </button>
          )}
        </div>
      </div>

      {showForm && isFounder && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Article title" className="w-full px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-sm" data-testid="kb-title-input" />
            <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
              placeholder="Write the SOP or procedure..." rows={8}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-sm resize-none font-mono" data-testid="kb-content-input" />
            <div className="flex gap-3">
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-xs">
                {CATEGORIES.filter(c => c.value).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <button onClick={handleSave} disabled={saving}
                className="ml-auto px-4 py-2 rounded-lg bg-[var(--gold)] text-[#0F1629] text-xs font-bold" data-testid="save-kb-article-btn">
                {saving ? 'Saving...' : editId ? 'Update' : 'Publish'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {articles.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-8 text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-[var(--t5)]" />
          <p className="text-sm text-[var(--t4)]">{isFounder ? 'No articles yet. Create your first SOP!' : 'No articles available yet.'}</p>
        </CardContent></Card>
      ) : (
        articles.map(article => {
          const catColor = CAT_COLORS[article.category] || '#3B82F6';
          const isExpanded = expandedId === article.id;
          return (
            <Card key={article.id} className="glass-card" style={{ borderLeft: `3px solid ${catColor}` }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : article.id)}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-[var(--t)]">{article.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold capitalize" style={{ background: `${catColor}15`, color: catColor }}>{article.category}</span>
                    </div>
                    <p className="text-[10px] text-[var(--t5)]">By {article.author_name} · Updated {new Date(article.updated_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isFounder && (
                      <>
                        <button onClick={e => { e.stopPropagation(); handleEdit(article); }} className="p-1.5 rounded hover:bg-[var(--s)] text-[var(--t5)]" data-testid={`edit-kb-${article.id}`}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); handleDelete(article.id); }} className="p-1.5 rounded hover:bg-[var(--rdbg)] text-[var(--t5)] hover:text-[var(--rd)]" data-testid={`delete-kb-${article.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[var(--t5)]" /> : <ChevronDown className="w-4 h-4 text-[var(--t5)]" />}
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--b)' }}>
                    <div className="text-sm text-[var(--t2)] whitespace-pre-wrap leading-relaxed">{article.content}</div>
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
