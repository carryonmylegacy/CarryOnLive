import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MessageSquareQuote, Loader2, RefreshCw, Check, X, Star, Trash2, BadgeCheck, Save } from 'lucide-react';
import { Button } from '../ui/button';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';

const FILTERS = ['pending', 'approved', 'rejected', 'all'];
const STATUS_COLOR = { pending: '#fbbf24', approved: '#10b981', rejected: '#f87171' };

const TestimonialRow = ({ t, onAction }) => {
  const [quote, setQuote] = useState(t.quote);
  const [name, setName] = useState(t.display_name || t.name);
  const dirty = quote !== t.quote || name !== (t.display_name || t.name);
  return (
    <div className="bg-[#0f1729] border border-[#1e293b] rounded-xl p-4 space-y-3" data-testid={`testimonial-row-${t.id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-[#94a3b8] flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded-full font-bold uppercase text-[10px]" style={{ background: `${STATUS_COLOR[t.status]}22`, color: STATUS_COLOR[t.status] }} data-testid={`testimonial-status-${t.id}`}>{t.status}</span>
          {t.verified_member ? <span className="inline-flex items-center gap-1 text-[#10b981]"><BadgeCheck className="w-3.5 h-3.5" /> Verified member</span> : <span className="text-[#f87171]">Email not found in users</span>}
          {t.featured && <span className="inline-flex items-center gap-1 text-[#d4af37]"><Star className="w-3.5 h-3.5" /> Featured</span>}
          <span>{new Date(t.created_at).toLocaleString()}</span>
        </div>
        <div className="text-xs text-[#94a3b8]">{t.email} &middot; {t.role}{t.location ? ` · ${t.location}` : ''}{t.member_since ? ` · since ${t.member_since}` : ''}</div>
      </div>
      <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-[#1a2744] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-white" data-testid={`testimonial-edit-name-${t.id}`} />
      <textarea value={quote} onChange={e => setQuote(e.target.value)} rows={3} className="w-full bg-[#1a2744] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-white leading-relaxed" data-testid={`testimonial-edit-quote-${t.id}`} />
      <div className="flex items-center gap-2 flex-wrap">
        {t.status !== 'approved' && <Button size="sm" onClick={() => onAction(t.id, { status: 'approved' })} className="bg-green-600 hover:bg-green-700 text-white text-xs" data-testid={`testimonial-approve-${t.id}`}><Check className="w-3.5 h-3.5 mr-1" /> Approve</Button>}
        {t.status !== 'rejected' && <Button size="sm" variant="ghost" onClick={() => onAction(t.id, { status: 'rejected' })} className="text-red-400 hover:text-red-300 text-xs" data-testid={`testimonial-reject-${t.id}`}><X className="w-3.5 h-3.5 mr-1" /> Reject</Button>}
        <Button size="sm" variant="ghost" onClick={() => onAction(t.id, { featured: !t.featured })} className="text-[#d4af37] text-xs" data-testid={`testimonial-feature-${t.id}`}><Star className="w-3.5 h-3.5 mr-1" /> {t.featured ? 'Unfeature' : 'Feature'}</Button>
        {dirty && <Button size="sm" variant="ghost" onClick={() => onAction(t.id, { display_name: name, quote })} className="text-blue-400 text-xs" data-testid={`testimonial-save-${t.id}`}><Save className="w-3.5 h-3.5 mr-1" /> Save edits</Button>}
        <Button size="sm" variant="ghost" onClick={() => { if (window.confirm('Delete this submission permanently?')) onAction(t.id, null); }} className="text-[#64748b] hover:text-red-400 text-xs ml-auto" data-testid={`testimonial-delete-${t.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
};

export const TestimonialsTab = ({ getAuthHeaders }) => {
  const [filter, setFilter] = useState('pending');
  const [data, setData] = useState({ items: [], counts: {} });
  const [loading, setLoading] = useState(true);

  const fetchData = async (f = filter) => {
    setLoading(true);
    try {
      const resp = await axios.get(`${API_URL}/admin/testimonials`, { ...getAuthHeaders(), params: f === 'all' ? {} : { status: f } });
      setData(resp.data);
    } catch (e) { console.error('Failed to load testimonials:', e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(filter); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (id, patch) => {
    try {
      if (patch === null) await axios.delete(`${API_URL}/admin/testimonials/${id}`, getAuthHeaders());
      else await axios.patch(`${API_URL}/admin/testimonials/${id}`, patch, getAuthHeaders());
      toast.success(patch === null ? 'Deleted' : patch.status ? `Marked ${patch.status}` : 'Saved');
      fetchData(filter);
    } catch (e) { toast.error(e.response?.data?.detail || 'Action failed'); }
  };

  return (
    <div className="space-y-5" data-testid="testimonials-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><MessageSquareQuote className="w-5 h-5 text-[#d4af37]" /> Member Testimonials</h2>
          <p className="text-xs text-[#94a3b8] mt-1">Nothing appears on the website until you approve it here. Approved stories show on the homepage trust block and /customers.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => fetchData(filter)} className="text-[#94a3b8] hover:text-white" data-testid="testimonials-refresh"><RefreshCw className="w-4 h-4" /></Button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} data-testid={`testimonials-filter-${f}`}
            className="px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors"
            style={filter === f ? { background: 'rgba(212,175,55,0.16)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.4)' } : { color: '#94a3b8', border: '1px solid #1e293b' }}>
            {f} {f !== 'all' && <span className="opacity-70">({data.counts?.[f] || 0})</span>}
          </button>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-[#d4af37] animate-spin" /></div>
        : data.items.length === 0 ? <p className="text-sm text-[#94a3b8] text-center py-16" data-testid="testimonials-empty">No {filter === 'all' ? '' : filter} submissions yet. Members can share their story at carryon.us/customers.</p>
        : <div className="space-y-3">{data.items.map(t => <TestimonialRow key={t.id} t={t} onAction={act} />)}</div>}
    </div>
  );
};
