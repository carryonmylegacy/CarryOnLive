import React, { useEffect, useMemo, useState } from 'react';
import { Type, Search, Save, Loader2, ExternalLink, Undo2 } from 'lucide-react';
import apiClient from '../../../utils/apiClient';
import { API_URL } from '../../../config';
import { toast } from '../../../utils/toast';
import { PAGES, COPY_FIELD_COUNT } from '../../../copy/siteCopy';
import { useCopy } from '../../../copy/CopyContext';
import { SiteCopySection } from './SiteCopySection';

const ALL_FIELDS = PAGES.flatMap(p => p.sections.flatMap(s => s.fields.map(f => ({ ...f, page: p, section: s }))));
const FIELD_BY_KEY = Object.fromEntries(ALL_FIELDS.map(f => [f.k, f]));

/** Admin → Marketing → Site Copy: edit every public-site string; saves overrides to /api/admin/site-copy. */
export const SiteCopyTab = ({ getAuthHeaders }) => {
  const { applyOverrides } = useCopy();
  const [saved, setSaved] = useState({});
  const [draft, setDraft] = useState({});
  const [pageKey, setPageKey] = useState(PAGES[0].key);
  const [query, setQuery] = useState('');
  const [openSections, setOpenSections] = useState({ [`${PAGES[0].key}:${PAGES[0].sections[0].key}`]: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get(`${API_URL}/public/site-copy`).then(r => setSaved(r.data?.overrides || {})).catch(() => toast.error('Could not load site copy')).finally(() => setLoading(false));
  }, []);

  const savedOf = (k) => saved[k] || '';
  const valueOf = (k) => (k in draft ? draft[k] : (saved[k] || FIELD_BY_KEY[k]?.d || ''));
  const onChange = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  // key → value|null for everything that differs from what is saved (null = back to default)
  const changes = useMemo(() => {
    const out = {};
    for (const [k, raw] of Object.entries(draft)) {
      const f = FIELD_BY_KEY[k];
      if (!f || f.locked) continue;
      const v = raw.trim();
      const next = v === '' || v === f.d ? null : raw;
      if ((next ?? '') !== (saved[k] || '')) out[k] = next;
    }
    return out;
  }, [draft, saved]);
  const pendingCount = Object.keys(changes).length;

  const handleSave = async () => {
    if (!pendingCount) return;
    setSaving(true);
    try {
      const r = await apiClient.put(`${API_URL}/admin/site-copy`, { changes }, getAuthHeaders());
      const next = r.data?.overrides || {};
      setSaved(next);
      setDraft({});
      applyOverrides(next);
      toast.success(`Site copy saved — ${pendingCount} ${pendingCount === 1 ? 'change' : 'changes'} live`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save site copy');
    }
    setSaving(false);
  };

  const q = query.trim().toLowerCase();
  const matches = (f) => !q || [f.label, f.k, f.d, valueOf(f.k)].some(s => String(s).toLowerCase().includes(q));
  const visiblePages = q ? PAGES : PAGES.filter(p => p.key === pageKey);
  const editedTotal = Object.keys(saved).filter(k => FIELD_BY_KEY[k]).length;

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--t4)]" /></div>;

  return (
    <div className="space-y-4 pt-4" data-testid="site-copy-tab">
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-[var(--gold)]" />
          <h3 className="text-base font-bold text-[var(--t)]">Site Copy</h3>
          <span className="text-xs font-bold text-[var(--t4)] ml-auto" data-testid="site-copy-stats">{COPY_FIELD_COUNT} fields · {editedTotal} edited</span>
        </div>
        <p className="text-sm text-[var(--t4)]">
          Every sentence on the public site, page by page. Change the text, press <strong className="text-[var(--t)]">Save</strong>, and it is live for visitors immediately — no code change or redeploy.
          Plain text only: line breaks are kept, and <span className="font-mono text-[var(--t3)]">**two stars**</span> around a phrase makes it bold. The 12 official tool names and the four pillar names are locked.
        </p>
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--t5)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search all pages — a word on the site, a label, or a key…"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)]" data-testid="site-copy-search" />
        </div>
        {!q && (
          <div className="flex flex-wrap gap-2" data-testid="site-copy-pages">
            {PAGES.map(p => {
              const active = p.key === pageKey;
              const edited = p.sections.flatMap(s => s.fields).filter(f => saved[f.k]).length;
              return (
                <button key={p.key} type="button" onClick={() => setPageKey(p.key)}
                  className="px-3.5 py-2 rounded-lg text-sm font-bold transition-all"
                  style={active ? { background: 'var(--gold)', color: '#0F1629' } : { background: 'var(--b)', color: 'var(--t4)', border: '1px solid var(--b2)' }}
                  data-testid={`site-copy-page-${p.key}`}>
                  {p.label}{edited > 0 && <span className="ml-1.5 opacity-80">({edited})</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="sticky z-20 flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ top: 'calc(0.5rem + env(safe-area-inset-top, 0px))', background: 'var(--s)', border: `1px solid ${pendingCount ? 'rgba(212,175,55,0.5)' : 'var(--b)'}`, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }} data-testid="site-copy-savebar">
        <p className="text-sm font-bold text-[var(--t)]" data-testid="site-copy-pending">
          {pendingCount ? `${pendingCount} unsaved ${pendingCount === 1 ? 'change' : 'changes'}` : 'All changes saved'}
        </p>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button type="button" onClick={() => setDraft({})} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold text-[var(--t4)] hover:text-[var(--t)] transition-colors" data-testid="site-copy-discard">
              <Undo2 className="w-4 h-4" /> Discard
            </button>
          )}
          <button type="button" onClick={handleSave} disabled={saving || !pendingCount}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: pendingCount ? 'var(--gold)' : 'var(--b2)', color: pendingCount ? '#0F1629' : 'var(--t4)' }} data-testid="site-copy-save">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>

      {visiblePages.map(p => {
        const sections = p.sections.map(s => ({ s, fields: s.fields.filter(matches) })).filter(x => x.fields.length);
        if (!sections.length) return null;
        return (
          <div key={p.key} className="space-y-3" data-testid={`site-copy-page-panel-${p.key}`}>
            <div className="flex items-center justify-between gap-3 px-1">
              <h4 className="text-sm font-bold text-[var(--t)]">{p.label}</h4>
              <a href={p.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--t4)] hover:text-[var(--gold)] transition-colors" data-testid={`site-copy-view-${p.key}`}>
                <ExternalLink className="w-3 h-3" /> View {p.path}
              </a>
            </div>
            {sections.map(({ s, fields }) => {
              const id = `${p.key}:${s.key}`;
              return (
                <SiteCopySection key={id} section={s} fields={fields} open={!!openSections[id]} forceOpen={!!q}
                  onToggle={() => setOpenSections(o => ({ ...o, [id]: !o[id] }))}
                  valueOf={valueOf} savedOf={savedOf} onChange={onChange} />
              );
            })}
          </div>
        );
      })}
      {q && !ALL_FIELDS.some(matches) && (
        <p className="text-sm text-[var(--t4)] text-center py-8" data-testid="site-copy-no-results">No text matches “{query}”.</p>
      )}
    </div>
  );
};

export default SiteCopyTab;
