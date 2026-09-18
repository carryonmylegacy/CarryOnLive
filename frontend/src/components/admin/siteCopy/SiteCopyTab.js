import React, { useEffect, useMemo, useState } from 'react';
import { Type, Search, Save, Loader2, ExternalLink, Undo2, Eye, History, CalendarClock, SpellCheck } from 'lucide-react';
import apiClient from '../../../utils/apiClient';
import { API_URL } from '../../../config';
import { toast } from '../../../utils/toast';
import { PAGES, COPY_FIELD_COUNT } from '../../../copy/siteCopy';
import { useCopy } from '../../../copy/CopyContext';
import { SiteCopySection } from './SiteCopySection';
import { SiteCopyPreview } from './SiteCopyPreview';
import { RecentChanges } from './SiteCopyHistory';
import { SchedulesPanel } from './SiteCopySchedule';
import { ReviewPanel } from './SiteCopyReview';

const ALL_FIELDS = PAGES.flatMap(p => p.sections.flatMap(s => s.fields.map(f => ({ ...f, page: p, section: s }))));
const FIELD_BY_KEY = Object.fromEntries(ALL_FIELDS.map(f => [f.k, f]));
const REVIEW_BATCH = 200;
const varsOf = (d) => [...String(d).matchAll(/\{(\w+)\}/g)].map(m => m[1]);
const barBtn = (on) => `inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${on ? 'text-[var(--gold)]' : 'text-[var(--t4)] hover:text-[var(--t)]'}`;

/** Admin → Marketing → Site Copy: edit every public-site + in-app string; saves overrides to /api/admin/site-copy. */
export const SiteCopyTab = ({ getAuthHeaders }) => {
  const { applyOverrides } = useCopy();
  const [saved, setSaved] = useState({});
  const [draft, setDraft] = useState({});
  const [history, setHistory] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [review, setReview] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [pageKey, setPageKey] = useState(PAGES[0].key);
  const [query, setQuery] = useState('');
  const [openSections, setOpenSections] = useState({ [`${PAGES[0].key}:${PAGES[0].sections[0].key}`]: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState(null); // 'recent' | 'schedules' | 'review'
  const [showPreview, setShowPreview] = useState(false);

  const loadHistory = () => apiClient.get(`${API_URL}/admin/site-copy/history?limit=500`, getAuthHeaders()).then(r => setHistory(r.data?.items || [])).catch(() => {});
  const syncPublic = () => apiClient.get(`${API_URL}/public/site-copy`).then(r => applyOverrides(r.data?.overrides || {})).catch(() => {});

  useEffect(() => {
    apiClient.get(`${API_URL}/admin/site-copy/state`, getAuthHeaders())
      .then(r => { setSaved(r.data?.overrides || {}); setSchedules(r.data?.schedules || []); })
      .catch(() => toast.error('Could not load site copy')).finally(() => setLoading(false));
    loadHistory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const savedOf = (k) => saved[k] || '';
  const valueOf = (k) => (k in draft ? draft[k] : (saved[k] || FIELD_BY_KEY[k]?.d || ''));
  const onChange = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const historyByKey = useMemo(() => history.reduce((acc, e) => { (acc[e.key] = acc[e.key] || []).push(e); return acc; }, {}), [history]);
  const historyOf = (k) => historyByKey[k] || [];
  const schedulesOf = (k) => schedules.filter(s => s.key === k);
  const issuesByKey = useMemo(() => (review?.issues || []).reduce((acc, i) => { if (i.key) (acc[i.key] = acc[i.key] || []).push(i); return acc; }, {}), [review]);
  const issuesOf = (k) => issuesByKey[k] || [];

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

  // What the public site would show if you saved now (saved + unsaved edits, with live schedules on top)
  const previewOverrides = useMemo(() => {
    const out = { ...saved };
    for (const [k, next] of Object.entries(changes)) { if (next === null) delete out[k]; else out[k] = next; }
    for (const s of schedules) { if (s.status !== 'active') continue; if (s.value) out[s.key] = s.value; else delete out[s.key]; }
    return out;
  }, [saved, changes, schedules]);

  const persist = async (payload, successMsg) => {
    setSaving(true);
    try {
      const r = await apiClient.put(`${API_URL}/admin/site-copy`, { changes: payload }, getAuthHeaders());
      setSaved(r.data?.overrides || {});
      setDraft(d => Object.fromEntries(Object.entries(d).filter(([k]) => !(k in payload))));
      applyOverrides(r.data?.effective || {});
      toast.success(successMsg);
      loadHistory();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save site copy');
    }
    setSaving(false);
  };
  const handleSave = () => pendingCount && persist(changes, `Site copy saved — ${pendingCount} ${pendingCount === 1 ? 'change' : 'changes'} live`);
  const handleRestore = (k, text) => persist({ [k]: text || null }, `Restored: ${FIELD_BY_KEY[k]?.label || k}`);

  const createSchedule = async (payload) => {
    setSaving(true);
    let ok = false;
    try {
      const r = await apiClient.post(`${API_URL}/admin/site-copy/schedules`, payload, getAuthHeaders());
      setSchedules(r.data?.items || []);
      toast.success(`Scheduled: ${FIELD_BY_KEY[payload.key]?.label || payload.key}`);
      syncPublic();
      ok = true;
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not schedule that change');
    }
    setSaving(false);
    return ok;
  };
  const deleteSchedule = async (id) => {
    setSaving(true);
    try {
      const r = await apiClient.delete(`${API_URL}/admin/site-copy/schedules/${id}`, getAuthHeaders());
      setSchedules(r.data?.items || []);
      toast.success('Schedule removed');
      syncPublic();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not remove that schedule');
    }
    setSaving(false);
  };

  const jumpTo = (k) => {
    const f = FIELD_BY_KEY[k];
    if (!f) return;
    setQuery('');
    setPageKey(f.page.key);
    setOpenSections(o => ({ ...o, [`${f.page.key}:${f.section.key}`]: true }));
    setTimeout(() => document.getElementById(`copy-field-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const q = query.trim().toLowerCase();
  const matches = (f) => !q || [f.label, f.k, f.d, valueOf(f.k)].some(s => String(s).toLowerCase().includes(q));
  const visiblePages = q ? PAGES : PAGES.filter(p => p.key === pageKey);
  const currentPage = PAGES.find(p => p.key === pageKey) || PAGES[0];
  const editedTotal = Object.keys(saved).filter(k => FIELD_BY_KEY[k]).length;

  // Review: your unsaved edits if there are any, otherwise every field on the current page (or the search results)
  const runReview = async () => {
    const scope = pendingCount ? 'edits' : 'page';
    const pool = pendingCount ? Object.keys(changes).map(k => FIELD_BY_KEY[k]) : (q ? ALL_FIELDS.filter(matches) : currentPage.sections.flatMap(s => s.fields));
    const fields = pool.filter(f => f && !f.locked).map(f => ({ key: f.k, label: f.label, text: valueOf(f.k), required_vars: varsOf(f.d) }));
    setPanel('review');
    setReviewing(true);
    setReview({ issues: [], reviewed: fields.length, scope, label: q ? `“${query.trim()}”` : currentPage.label });
    try {
      const issues = [];
      let llmUsed = false;
      for (let i = 0; i < fields.length; i += REVIEW_BATCH) {
        const r = await apiClient.post(`${API_URL}/admin/site-copy/review`, { fields: fields.slice(i, i + REVIEW_BATCH) }, getAuthHeaders());
        issues.push(...(r.data?.issues || []));
        llmUsed = llmUsed || !!r.data?.llm_used;
      }
      setReview({ issues, reviewed: fields.length, llm_used: llmUsed, scope, label: q ? `“${query.trim()}”` : currentPage.label });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Review failed');
      setReview(null);
      setPanel(null);
    }
    setReviewing(false);
  };
  const applyFix = (issue) => {
    onChange(issue.key, issue.fix);
    setReview(r => (r ? { ...r, issues: r.issues.filter(i => i !== issue) } : r));
  };
  const closeReview = () => { setReview(null); setPanel(null); };
  const togglePanel = (name) => setPanel(p => (p === name ? null : name));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--t4)]" /></div>;

  return (
    <div className={`space-y-4 pt-4 ${showPreview ? 'lg:pr-[58vw] xl:pr-[52vw]' : ''}`} data-testid="site-copy-tab">
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-[var(--gold)]" />
          <h3 className="text-base font-bold text-[var(--t)]">Site Copy</h3>
          <span className="text-xs font-bold text-[var(--t4)] ml-auto" data-testid="site-copy-stats">{COPY_FIELD_COUNT} fields · {editedTotal} edited</span>
        </div>
        <p className="text-sm text-[var(--t4)]">
          Every sentence on the public site and the sign-up, paywall and onboarding screens, page by page. Change the text, check it in <strong className="text-[var(--t)]">Preview</strong>, run <strong className="text-[var(--t)]">Review</strong> for typos, press <strong className="text-[var(--t)]">Save</strong>, and it is live immediately — no code change or redeploy.
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

      <div className="sticky z-20 flex items-center justify-between gap-3 rounded-xl px-4 py-3 flex-wrap" style={{ top: 'calc(0.5rem + env(safe-area-inset-top, 0px))', background: 'var(--s)', border: `1px solid ${pendingCount ? 'rgba(212,175,55,0.5)' : 'var(--b)'}`, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }} data-testid="site-copy-savebar">
        <p className="text-sm font-bold text-[var(--t)]" data-testid="site-copy-pending">
          {pendingCount ? `${pendingCount} unsaved ${pendingCount === 1 ? 'change' : 'changes'}` : 'All changes saved'}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button type="button" onClick={runReview} disabled={reviewing} className={barBtn(panel === 'review')} title={pendingCount ? 'Check your unsaved edits' : 'Check every field on this page'} data-testid="site-copy-review-toggle">
            {reviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <SpellCheck className="w-4 h-4" />} Review
          </button>
          <button type="button" onClick={() => togglePanel('schedules')} className={barBtn(panel === 'schedules')} data-testid="site-copy-schedules-toggle">
            <CalendarClock className="w-4 h-4" /> Schedules{schedules.length > 0 && <span className="text-xs opacity-80">({schedules.length})</span>}
          </button>
          <button type="button" onClick={() => togglePanel('recent')} className={barBtn(panel === 'recent')} data-testid="site-copy-history-toggle">
            <History className="w-4 h-4" /> History
          </button>
          <button type="button" onClick={() => setShowPreview(s => !s)} className={barBtn(showPreview)} data-testid="site-copy-preview-toggle">
            <Eye className="w-4 h-4" /> Preview
          </button>
          {pendingCount > 0 && (
            <button type="button" onClick={() => setDraft({})} disabled={saving} className={barBtn(false)} data-testid="site-copy-discard">
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

      {panel === 'recent' && (
        <RecentChanges entries={history.slice(0, 50)} fieldByKey={FIELD_BY_KEY} currentOf={savedOf} onRestore={handleRestore} restoring={saving} onJump={jumpTo} />
      )}
      {panel === 'schedules' && (
        <SchedulesPanel schedules={schedules} fieldByKey={FIELD_BY_KEY} onDelete={deleteSchedule} onJump={jumpTo} busy={saving} />
      )}
      {panel === 'review' && (
        <ReviewPanel review={review} running={reviewing} fieldByKey={FIELD_BY_KEY} onJump={jumpTo} onApplyFix={applyFix} onRerun={runReview} onClose={closeReview} />
      )}

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
                  valueOf={valueOf} savedOf={savedOf} onChange={onChange}
                  historyOf={historyOf} onRestore={handleRestore} restoring={saving}
                  schedulesOf={schedulesOf} onSchedule={createSchedule} onDeleteSchedule={deleteSchedule}
                  issuesOf={issuesOf} onApplyFix={applyFix} />
              );
            })}
          </div>
        );
      })}
      {q && !ALL_FIELDS.some(matches) && (
        <p className="text-sm text-[var(--t4)] text-center py-8" data-testid="site-copy-no-results">No text matches “{query}”.</p>
      )}

      {showPreview && <SiteCopyPreview page={currentPage} overrides={previewOverrides} onClose={() => setShowPreview(false)} />}
    </div>
  );
};

export default SiteCopyTab;
