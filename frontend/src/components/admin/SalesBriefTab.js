import React, { useState, useEffect, useMemo, useCallback } from 'react';
import apiClient from '../../utils/apiClient';
import { Copy, ExternalLink, Mail, Check, FileText, Edit3, Save, RotateCcw, ChevronDown, ChevronRight, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';

/**
 * SalesBriefTab — Admin → Marketing → Sales Brief.
 *
 * Surfaces the public, shareable Partner Brief URL AND a full-content
 * editor so the founder (or a marketing-scoped admin) can change every
 * character of verbiage on the public brief without a redeploy.
 *
 * Content flow:
 *   GET  /api/partner-brief         loads the live document (or defaults)
 *   PUT  /api/partner-brief         saves edits (founder + marketing scope)
 *   POST /api/partner-brief/reset   restores the seed defaults
 *
 * Critical pathway — see AGENT_RULES.md → Rule -3.
 */
export default function SalesBriefTab() {
  const { getAuthHeaders } = useAuth();
  const [copied, setCopied] = useState(null);
  const [content, setContent] = useState(null);      // server's last-known
  const [draft, setDraft] = useState(null);          // local edits (null = view mode)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [isCustomized, setIsCustomized] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const briefUrl = useMemo(() => (typeof window !== 'undefined' ? `${window.location.origin}/partner-brief` : '/partner-brief'), []);

  const loadBrief = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get(`${API_URL}/partner-brief`);
      setContent(r.data?.content || null);
      setIsCustomized(!!r.data?.is_customized);
    } catch (e) {
      toast.error(`Could not load brief: ${e?.message || 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBrief(); }, [loadBrief]);

  const enterEdit = () => {
    setDraft(JSON.parse(JSON.stringify(content)));
    setEditing(true);
  };
  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
  };
  const saveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await apiClient.put(`${API_URL}/partner-brief`, { content: draft }, getAuthHeaders());
      setContent(r.data?.content || draft);
      setIsCustomized(true);
      setDraft(null);
      setEditing(false);
      toast.success('Brief saved. Live page is updated.');
    } catch (e) {
      toast.error(`Save failed: ${e?.response?.data?.detail || e?.message || 'unknown'}`);
    } finally {
      setSaving(false);
    }
  };
  const resetToDefaults = async () => {
    setSaving(true);
    try {
      const r = await apiClient.post(`${API_URL}/partner-brief/reset`, {}, getAuthHeaders());
      setContent(r.data?.content || null);
      setIsCustomized(false);
      setDraft(null);
      setEditing(false);
      setConfirmReset(false);
      toast.success('Restored the default brief.');
    } catch (e) {
      toast.error(`Reset failed: ${e?.response?.data?.detail || e?.message || 'unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* clipboard blocked */ }
  };

  const emailSubject = encodeURIComponent('CarryOn — Partner Brief');
  const emailBody = encodeURIComponent(
    `Hi,\n\nThanks for your interest in a CarryOn partnership. Here is a brief overview of the platform and how it tends to map to partners in your space:\n\n${briefUrl}\n\nWhen you've had a chance to read it, my team will set up a short discovery call so I can walk you through it on the live platform.\n\nBest,\n`
  );

  // Helper: update a deep path in the draft.
  const upd = useCallback((path, value) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) {
        if (cur[path[i]] === undefined || cur[path[i]] === null) cur[path[i]] = (typeof path[i + 1] === 'number') ? [] : {};
        cur = cur[path[i]];
      }
      cur[path[path.length - 1]] = value;
      return next;
    });
  }, []);

  // Helper: list mutators.
  const listAdd = (path, item) => {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let cur = next;
      for (const k of path) cur = cur[k];
      cur.push(item);
      return next;
    });
  };
  const listRemove = (path, idx) => {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let cur = next;
      for (const k of path) cur = cur[k];
      cur.splice(idx, 1);
      return next;
    });
  };

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="sales-brief-tab">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'var(--sans)' }}>
            Sales Brief
          </h1>
          <p className="text-sm text-[var(--t4)] leading-relaxed max-w-3xl">
            A public, shareable overview of CarryOn for B2B partners — built for your assistant to use as a screening reference and for you to forward to anyone who reaches out about partnerships.
            The link is public; anyone with it can read the brief. No login required.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isCustomized
            ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold" style={{ background: 'rgba(34,197,94,0.12)', color: '#86EFAC', border: '1px solid rgba(34,197,94,0.35)' }} data-testid="brief-status-customized">Customized</span>
            : <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold" style={{ background: 'rgba(148,163,184,0.10)', color: '#94A3B8', border: '1px solid rgba(148,163,184,0.30)' }} data-testid="brief-status-defaults">Using defaults</span>}
        </div>
      </div>

      {/* Primary card — copy link */}
      <div className="glass-card p-5 lg:p-6" style={{ borderLeft: '3px solid var(--gold)' }}>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-5 h-5 text-[var(--gold)]" />
          <h2 className="text-lg font-bold text-[var(--t)]">Shareable link</h2>
        </div>
        <p className="text-xs text-[var(--t5)] mb-3">
          Paste this URL into an email, DM, or calendar invite. It opens a clean, branded page anyone can read on phone or desktop.
        </p>

        <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
          <code className="flex-1 text-xs lg:text-sm font-mono text-[var(--t2)] truncate" data-testid="sales-brief-url">{briefUrl}</code>
          <button onClick={() => copy(briefUrl, 'url')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0"
            style={{
              background: copied === 'url' ? 'rgba(34,197,94,0.18)' : 'linear-gradient(135deg,#d4af37,#b8962e)',
              color: copied === 'url' ? '#86efac' : '#080e1a',
              border: copied === 'url' ? '1px solid rgba(34,197,94,0.4)' : 'none',
            }}
            data-testid="sales-brief-copy-link">
            {copied === 'url' ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy link</>}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <a href={briefUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
            style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.35)', color: '#60A5FA' }} data-testid="sales-brief-open">
            <ExternalLink className="w-3.5 h-3.5" /> Open brief
          </a>
          <a href={`mailto:?subject=${emailSubject}&body=${emailBody}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
            style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.35)', color: '#A78BFA' }} data-testid="sales-brief-email">
            <Mail className="w-3.5 h-3.5" /> Compose email
          </a>
          <button onClick={() => copy(decodeURIComponent(emailBody), 'body')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
            style={{ background: 'var(--s)', border: '1px solid var(--b2)', color: 'var(--t3)' }} data-testid="sales-brief-copy-body">
            {copied === 'body' ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy email body</>}
          </button>
        </div>
      </div>

      {/* Editor card */}
      <div className="glass-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-[var(--gold)]" />
            <h2 className="text-lg font-bold text-[var(--t)]">Brief content</h2>
          </div>
          {!editing ? (
            <div className="flex gap-2">
              <button onClick={enterEdit} disabled={loading || !content} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#d4af37,#b8962e)', color: '#080e1a' }} data-testid="brief-edit-btn">
                <Edit3 className="w-3.5 h-3.5" /> Edit content
              </button>
              {isCustomized && (
                <button onClick={() => setConfirmReset(true)} disabled={loading} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#F87171' }} data-testid="brief-reset-btn">
                  <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={cancelEdit} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all"
                style={{ background: 'var(--s)', border: '1px solid var(--b2)', color: 'var(--t3)' }} data-testid="brief-cancel-btn">
                Cancel
              </button>
              <button onClick={saveDraft} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff' }} data-testid="brief-save-btn">
                <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </div>

        {confirmReset && (
          <div className="mb-4 rounded-xl p-3 flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.30)' }}>
            <AlertTriangle className="w-4 h-4 text-[#F87171] mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-[#F87171] mb-1">Reset every word to the defaults?</p>
              <p className="text-xs text-[var(--t4)] mb-2">This deletes every customization you've made. The original founder-approved copy returns immediately on the live page.</p>
              <div className="flex gap-2">
                <button onClick={resetToDefaults} disabled={saving} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: '#EF4444', color: '#fff' }} data-testid="brief-reset-confirm">
                  Yes, reset everything
                </button>
                <button onClick={() => setConfirmReset(false)} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'var(--s)', color: 'var(--t3)', border: '1px solid var(--b2)' }} data-testid="brief-reset-cancel">
                  Keep my edits
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && <p className="text-sm text-[var(--t4)]">Loading…</p>}

        {!loading && editing && draft && (
          <BriefEditor draft={draft} upd={upd} listAdd={listAdd} listRemove={listRemove} />
        )}

        {!loading && !editing && content && (
          <BriefSummary content={content} />
        )}
      </div>

      {/* Source-of-truth note */}
      <div className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
        <p className="text-xs text-[var(--t5)] leading-relaxed">
          <strong className="text-[var(--t3)]">Source of truth:</strong> the official pillar names are stored in
          <code className="text-[var(--gold)] mx-1">memory/AGENT_RULES.md</code>. Live brief content is stored in MongoDB
          (<code className="text-[var(--gold)] mx-1">partner_brief_content</code>) and can always be reset to the seed defaults
          shipped in <code className="text-[var(--gold)] mx-1">backend/routes/partner_brief.py</code>. The page is a critical
          pathway — do not delete the route or component without explicit confirmation.
        </p>
      </div>
    </div>
  );
}

// ── Read-only summary shown when not editing ───────────────────────────
function BriefSummary({ content }) {
  const c = content || {};
  return (
    <div className="space-y-3" data-testid="brief-summary">
      <SummaryRow label="Header eyebrow" value={c.header?.eyebrow} />
      <SummaryRow label="Header title" value={c.header?.title} />
      <SummaryRow label="Header intro" value={c.header?.intro} />
      <SummaryRow label="One-breath quote" value={c.one_breath?.quote} />
      <SummaryRow label="QuickStart paragraph" value={c.quickstart?.paragraph} />
      <SummaryRow label="QuickStart bullets" value={`${(c.quickstart?.bullets || []).length} bullets`} />
      <SummaryRow label="Pillars" value={`${(c.pillars?.items || []).length} pillars`} />
      <SummaryRow label="Capabilities" value={`${(c.capabilities?.items || []).length} capabilities`} />
      <SummaryRow label="Industries" value={`${(c.verticals?.items || []).length} industries: ${(c.verticals?.items || []).map(v => v.title?.split(' ').slice(1).join(' ').replace('/', '/').slice(0, 22)).join(', ')}`} />
      <SummaryRow label="Other industries" value={`${(c.adjacent?.items || []).length} entries`} />
      <SummaryRow label="Short answers" value={`${(c.elevator?.items || []).length} entries`} />
      <p className="text-xs text-[var(--t5)] mt-3 italic">Click <strong>Edit content</strong> above to change any character of the public brief.</p>
    </div>
  );
}
function SummaryRow({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 text-xs">
      <span className="font-bold text-[var(--t4)] sm:w-44 shrink-0 uppercase tracking-wider">{label}</span>
      <span className="text-[var(--t3)] flex-1 line-clamp-2">{value || <em className="text-[var(--t5)]">(empty)</em>}</span>
    </div>
  );
}

// ── The big editor ─────────────────────────────────────────────────────
function BriefEditor({ draft, upd, listAdd, listRemove }) {
  return (
    <div className="space-y-3" data-testid="brief-editor">
      <p className="text-xs text-[var(--t4)] italic">Every text field below is rendered verbatim on the public brief. Use plain text — formatting (italics, the gold accents, the orbit etc.) is preserved automatically.</p>

      <Accordion title="Page header" testid="acc-header" defaultOpen>
        <Field label="Eyebrow (small caps line above title)" value={draft.header?.eyebrow || ''} onChange={(v) => upd(['header', 'eyebrow'], v)} testid="f-header-eyebrow" />
        <Field label="Title" value={draft.header?.title || ''} onChange={(v) => upd(['header', 'title'], v)} testid="f-header-title" />
        <Field label="Intro paragraph" value={draft.header?.intro || ''} onChange={(v) => upd(['header', 'intro'], v)} multiline rows={4} testid="f-header-intro" />
      </Accordion>

      <Accordion title="1. The platform in one breath" testid="acc-onebreath">
        <Field label="Section title" value={draft.one_breath?.title || ''} onChange={(v) => upd(['one_breath', 'title'], v)} testid="f-ob-title" />
        <Field label="Pull-quote (italicized, gold left border)" value={draft.one_breath?.quote || ''} onChange={(v) => upd(['one_breath', 'quote'], v)} multiline rows={4} testid="f-ob-quote" />
        <Field label="Body paragraph" value={draft.one_breath?.paragraph || ''} onChange={(v) => upd(['one_breath', 'paragraph'], v)} multiline rows={5} testid="f-ob-paragraph" />
      </Accordion>

      <Accordion title="1.5 QuickStart Guide (CTA + sample-PDF link)" testid="acc-quickstart">
        <Field label="Section title" value={draft.quickstart?.title || ''} onChange={(v) => upd(['quickstart', 'title'], v)} testid="f-qs-title" />
        <Field label="Body paragraph" value={draft.quickstart?.paragraph || ''} onChange={(v) => upd(['quickstart', 'paragraph'], v)} multiline rows={5} testid="f-qs-paragraph" />
        <Field label="Sample-PDF button label" value={draft.quickstart?.sample_label || ''} onChange={(v) => upd(['quickstart', 'sample_label'], v)} testid="f-qs-sample-label" />
        <Field label="Sample-PDF endpoint URL" value={draft.quickstart?.sample_pdf_url || ''} onChange={(v) => upd(['quickstart', 'sample_pdf_url'], v)} testid="f-qs-sample-url" />
        <Field label="Sample-PDF caption (under the button)" value={draft.quickstart?.sample_caption || ''} onChange={(v) => upd(['quickstart', 'sample_caption'], v)} multiline rows={2} testid="f-qs-sample-caption" />
        <div className="mt-4 mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--gold)]">Bullet points (talking points under the paragraph)</span>
          <button onClick={() => listAdd(['quickstart', 'bullets'], '')} className="text-xs px-2 py-1 rounded-md inline-flex items-center gap-1" style={{ background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.30)', color: 'var(--gold)' }} data-testid="add-qs-bullet">
            <Plus className="w-3 h-3" /> Add bullet
          </button>
        </div>
        {(draft.quickstart?.bullets || []).map((b, i) => (
          <ItemCard key={i} title={`Bullet ${i + 1}`} onRemove={() => listRemove(['quickstart', 'bullets'], i)} testid={`qs-bullet-${i}`}>
            <Field label="Text" value={b || ''} onChange={(v) => upd(['quickstart', 'bullets', i], v)} multiline rows={2} testid={`f-qs-bullet-${i}`} />
          </ItemCard>
        ))}
      </Accordion>

      <Accordion title="2. The Four Pillars" testid="acc-pillars">
        <Field label="Section title" value={draft.pillars?.title || ''} onChange={(v) => upd(['pillars', 'title'], v)} testid="f-p-title" />
        <Field label="Section intro" value={draft.pillars?.intro || ''} onChange={(v) => upd(['pillars', 'intro'], v)} multiline rows={2} testid="f-p-intro" />
        <Field label="Foundational note (under the pillar list)" value={draft.pillars?.foundational || ''} onChange={(v) => upd(['pillars', 'foundational'], v)} multiline rows={3} testid="f-p-foundational" />

        <div className="mt-4 mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--gold)]">Pillar items</span>
          <button onClick={() => listAdd(['pillars', 'items'], { n: '', name: '', abbr: '', desc: '' })} className="text-xs px-2 py-1 rounded-md inline-flex items-center gap-1" style={{ background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.30)', color: 'var(--gold)' }} data-testid="add-pillar">
            <Plus className="w-3 h-3" /> Add pillar
          </button>
        </div>
        {(draft.pillars?.items || []).map((p, i) => (
          <ItemCard key={i} title={`Pillar ${i + 1}`} onRemove={() => listRemove(['pillars', 'items'], i)} testid={`pillar-${i}`}>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Number" value={p.n || ''} onChange={(v) => upd(['pillars', 'items', i, 'n'], v)} testid={`f-pillar-${i}-n`} />
              <Field label="Abbreviation" value={p.abbr || ''} onChange={(v) => upd(['pillars', 'items', i, 'abbr'], v)} testid={`f-pillar-${i}-abbr`} />
              <Field label="Name" value={p.name || ''} onChange={(v) => upd(['pillars', 'items', i, 'name'], v)} testid={`f-pillar-${i}-name`} />
            </div>
            <Field label="Description" value={p.desc || ''} onChange={(v) => upd(['pillars', 'items', i, 'desc'], v)} multiline rows={3} testid={`f-pillar-${i}-desc`} />
          </ItemCard>
        ))}
      </Accordion>

      <Accordion title="2.5 Platform-wide capabilities" testid="acc-capabilities">
        <Field label="Section title" value={draft.capabilities?.title || ''} onChange={(v) => upd(['capabilities', 'title'], v)} testid="f-cap-title" />
        <Field label="Section intro" value={draft.capabilities?.intro || ''} onChange={(v) => upd(['capabilities', 'intro'], v)} multiline rows={3} testid="f-cap-intro" />
        <div className="mt-4 mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--gold)]">Capability items</span>
          <button onClick={() => listAdd(['capabilities', 'items'], { name: '', desc: '' })} className="text-xs px-2 py-1 rounded-md inline-flex items-center gap-1" style={{ background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.30)', color: 'var(--gold)' }} data-testid="add-capability">
            <Plus className="w-3 h-3" /> Add capability
          </button>
        </div>
        {(draft.capabilities?.items || []).map((cap, i) => (
          <ItemCard key={i} title={`Capability ${i + 1}`} onRemove={() => listRemove(['capabilities', 'items'], i)} testid={`capability-${i}`}>
            <Field label="Name" value={cap.name || ''} onChange={(v) => upd(['capabilities', 'items', i, 'name'], v)} testid={`f-cap-${i}-name`} />
            <Field label="Description" value={cap.desc || ''} onChange={(v) => upd(['capabilities', 'items', i, 'desc'], v)} multiline rows={3} testid={`f-cap-${i}-desc`} />
          </ItemCard>
        ))}
      </Accordion>

      <Accordion title="3. Industries (life insurance, financial planners, etc.)" testid="acc-verticals">
        <Field label="Section title" value={draft.verticals?.title || ''} onChange={(v) => upd(['verticals', 'title'], v)} testid="f-v-title" />
        <Field label="Section intro" value={draft.verticals?.intro || ''} onChange={(v) => upd(['verticals', 'intro'], v)} multiline rows={2} testid="f-v-intro" />

        <div className="mt-4 mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--gold)]">Industry entries</span>
          <button onClick={() => listAdd(['verticals', 'items'], { id: `v-${Date.now()}`, title: 'New industry', cares: [''], pillars: '', questions: [''], disqualify: '' })} className="text-xs px-2 py-1 rounded-md inline-flex items-center gap-1" style={{ background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.30)', color: 'var(--gold)' }} data-testid="add-vertical">
            <Plus className="w-3 h-3" /> Add industry
          </button>
        </div>
        {(draft.verticals?.items || []).map((v, i) => (
          <ItemCard key={i} title={v.title || `Vertical ${i + 1}`} onRemove={() => listRemove(['verticals', 'items'], i)} testid={`vertical-${i}`}>
            <Field label="Title" value={v.title || ''} onChange={(x) => upd(['verticals', 'items', i, 'title'], x)} testid={`f-vert-${i}-title`} />
            <StringList label="What they care about" items={v.cares || []} onAdd={() => listAdd(['verticals', 'items', i, 'cares'], '')} onRemove={(j) => listRemove(['verticals', 'items', i, 'cares'], j)} onChange={(j, x) => upd(['verticals', 'items', i, 'cares', j], x)} testid={`cares-${i}`} />
            <Field label="Pillars that resonate first" value={v.pillars || ''} onChange={(x) => upd(['verticals', 'items', i, 'pillars'], x)} multiline rows={3} testid={`f-vert-${i}-pillars`} />
            <StringList label="Qualifying questions" items={v.questions || []} onAdd={() => listAdd(['verticals', 'items', i, 'questions'], '')} onRemove={(j) => listRemove(['verticals', 'items', i, 'questions'], j)} onChange={(j, x) => upd(['verticals', 'items', i, 'questions', j], x)} testid={`questions-${i}`} />
            <Field label="Disqualify (optional italic note at the end)" value={v.disqualify || ''} onChange={(x) => upd(['verticals', 'items', i, 'disqualify'], x)} multiline rows={2} testid={`f-vert-${i}-disqualify`} />
          </ItemCard>
        ))}
      </Accordion>

      <Accordion title="4. Other related industries" testid="acc-adjacent">
        <Field label="Section title" value={draft.adjacent?.title || ''} onChange={(v) => upd(['adjacent', 'title'], v)} testid="f-a-title" />
        <div className="mt-3 mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--gold)]">Entries</span>
          <button onClick={() => listAdd(['adjacent', 'items'], { name: '', frame: '' })} className="text-xs px-2 py-1 rounded-md inline-flex items-center gap-1" style={{ background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.30)', color: 'var(--gold)' }} data-testid="add-adjacent">
            <Plus className="w-3 h-3" /> Add entry
          </button>
        </div>
        {(draft.adjacent?.items || []).map((a, i) => (
          <ItemCard key={i} title={a.name || `Entry ${i + 1}`} onRemove={() => listRemove(['adjacent', 'items'], i)} testid={`adj-${i}`}>
            <Field label="Name" value={a.name || ''} onChange={(x) => upd(['adjacent', 'items', i, 'name'], x)} testid={`f-adj-${i}-name`} />
            <Field label="Frame" value={a.frame || ''} onChange={(x) => upd(['adjacent', 'items', i, 'frame'], x)} multiline rows={3} testid={`f-adj-${i}-frame`} />
          </ItemCard>
        ))}
      </Accordion>

      <Accordion title="5. How to run the call" testid="acc-screening">
        <Field label="Section title" value={draft.screening?.title || ''} onChange={(v) => upd(['screening', 'title'], v)} testid="f-s-title" />
        <Field label="Section intro" value={draft.screening?.intro || ''} onChange={(v) => upd(['screening', 'intro'], v)} multiline rows={2} testid="f-s-intro" />
        <Field label='"Send to founder" subhead' value={draft.screening?.escalated_label || ''} onChange={(v) => upd(['screening', 'escalated_label'], v)} testid="f-s-esclabel" />
        <StringList label="Send-to-founder items" items={draft.screening?.escalated || []} onAdd={() => listAdd(['screening', 'escalated'], '')} onRemove={(j) => listRemove(['screening', 'escalated'], j)} onChange={(j, x) => upd(['screening', 'escalated', j], x)} testid="esc" />
        <Field label='"Captured" subhead' value={draft.screening?.captured_label || ''} onChange={(v) => upd(['screening', 'captured_label'], v)} testid="f-s-caplabel" />
        <StringList label="Captured items" items={draft.screening?.captured || []} onAdd={() => listAdd(['screening', 'captured'], '')} onRemove={(j) => listRemove(['screening', 'captured'], j)} onChange={(j, x) => upd(['screening', 'captured', j], x)} testid="cap" />
      </Accordion>

      <Accordion title="6. Quick reference — short answers" testid="acc-elevator">
        <Field label="Section title" value={draft.elevator?.title || ''} onChange={(v) => upd(['elevator', 'title'], v)} testid="f-e-title" />
        <Field label="Section intro" value={draft.elevator?.intro || ''} onChange={(v) => upd(['elevator', 'intro'], v)} multiline rows={2} testid="f-e-intro" />
        <div className="mt-3 mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--gold)]">Lines</span>
          <button onClick={() => listAdd(['elevator', 'items'], { abbr: '', line: '' })} className="text-xs px-2 py-1 rounded-md inline-flex items-center gap-1" style={{ background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.30)', color: 'var(--gold)' }} data-testid="add-elevator">
            <Plus className="w-3 h-3" /> Add line
          </button>
        </div>
        {(draft.elevator?.items || []).map((e, i) => (
          <ItemCard key={i} title={`${e.abbr || '—'}`} onRemove={() => listRemove(['elevator', 'items'], i)} testid={`elev-${i}`}>
            <div className="grid grid-cols-[80px_1fr] gap-2 items-start">
              <Field label="Abbr" value={e.abbr || ''} onChange={(x) => upd(['elevator', 'items', i, 'abbr'], x)} testid={`f-elev-${i}-abbr`} />
              <Field label="Line" value={e.line || ''} onChange={(x) => upd(['elevator', 'items', i, 'line'], x)} multiline rows={2} testid={`f-elev-${i}-line`} />
            </div>
          </ItemCard>
        ))}
      </Accordion>

      <Accordion title="Footer" testid="acc-footer">
        <Field label="Footer line 1" value={draft.footer?.line1 || ''} onChange={(v) => upd(['footer', 'line1'], v)} multiline rows={2} testid="f-foot-1" />
        <Field label="Footer line 2" value={draft.footer?.line2 || ''} onChange={(v) => upd(['footer', 'line2'], v)} multiline rows={2} testid="f-foot-2" />
      </Accordion>
    </div>
  );
}

// ── Editor primitives ──────────────────────────────────────────────────
function Accordion({ title, defaultOpen = false, children, testid }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid={testid}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3 text-left" data-testid={`${testid}-toggle`}>
        <span className="text-sm font-bold text-[var(--t)]">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-[var(--t4)]" /> : <ChevronRight className="w-4 h-4 text-[var(--t4)]" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3 border-t border-[var(--b)]">{children}</div>}
    </div>
  );
}

function Field({ label, value, onChange, multiline, rows = 2, testid }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--t4)]">{label}</label>
      <Tag
        type={multiline ? undefined : 'text'}
        rows={multiline ? rows : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-base text-[var(--t)] outline-none focus:ring-1 focus:ring-[var(--gold)]"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b2)', resize: multiline ? 'vertical' : 'none', fontSize: '16px' }}
        data-testid={testid}
      />
    </div>
  );
}

function StringList({ label, items, onAdd, onRemove, onChange, testid }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--t4)]">{label}</span>
        <button onClick={onAdd} className="text-[11px] px-2 py-0.5 rounded inline-flex items-center gap-1" style={{ background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.30)', color: 'var(--gold)' }} data-testid={`${testid}-add`}>
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      {(items || []).map((it, i) => (
        <div key={i} className="flex gap-2 items-start">
          <textarea rows={2} value={it} onChange={(e) => onChange(i, e.target.value)} className="flex-1 px-3 py-2 rounded-lg text-base text-[var(--t)] outline-none focus:ring-1 focus:ring-[var(--gold)]"
            style={{ background: 'var(--bg2)', border: '1px solid var(--b2)', resize: 'vertical', fontSize: '16px' }} data-testid={`${testid}-${i}`} />
          <button onClick={() => onRemove(i)} className="p-2 rounded-lg shrink-0" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }} data-testid={`${testid}-${i}-remove`}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ItemCard({ title, onRemove, testid, children }) {
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--bg)', border: '1px solid var(--b)' }} data-testid={testid}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[var(--t3)]">{title}</span>
        <button onClick={onRemove} className="text-[11px] px-2 py-0.5 rounded inline-flex items-center gap-1" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }} data-testid={`${testid}-remove`}>
          <Trash2 className="w-3 h-3" /> Remove
        </button>
      </div>
      {children}
    </div>
  );
}
