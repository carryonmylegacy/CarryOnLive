import React from 'react';
import { CheckSquare, Plus } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { AIBuilderShell } from '../ai/AIBuilderShell';
import { rowStyle, inp, Head, Remove, HeardSummary, Field, ExistingBadge, chg, touch, hasWork, isNew, isUpdate, countLabel, CHANGED } from '../ai/reviewPrimitives';

const opts = (pairs) => pairs.map(([value, label]) => ({ value, label }));
const CATS = opts([['legal', 'Legal'], ['financial', 'Financial'], ['insurance', 'Insurance'], ['property', 'Property'], ['medical', 'Medical'], ['personal', 'Personal'], ['government', 'Government'], ['general', 'General']]);
const PRIS = opts([['critical', 'Critical — do immediately'], ['high', 'High — first week'], ['medium', 'Medium — first 2 weeks'], ['low', 'Low — first month']]);
const ACTS = opts([['call', 'Make a phone call'], ['email', 'Send an email'], ['visit', 'Visit a location'], ['file_paperwork', 'File paperwork'], ['notify', 'Notify someone'], ['custom', 'Custom action']]);
const WHEN = opts([['immediate', 'Immediately'], ['first_week', 'Within first week'], ['two_weeks', 'Within two weeks'], ['first_month', 'Within first month'], ['no_rush', 'No rush']]);
const EXAMPLE = 'e.g. "First call my brother Tom at 804-555-0123 — he knows where everything is. Sarah takes care of the dog. Call Dominion to move the power bill into Karen\u2019s name. File the life-insurance claim with Northwestern Mutual — the policy is in the fireproof box. Cancel my gym membership, no rush."';
const KEYTERMS = ['executor', 'death certificate', 'Social Security', 'VA', 'pension', 'life insurance', 'probate', 'funeral home'];
const BLANK = { existing_id: null, changes: [], title: '', description: '', category: 'general', priority: 'medium', action_type: 'custom', due_timeframe: 'first_week', contact_name: null, contact_phone: null, contact_email: null, contact_address: null, notes: null };
const FIELDS = ['title', 'description', 'category', 'priority', 'action_type', 'due_timeframe', 'contact_name', 'contact_phone', 'contact_email', 'contact_address', 'notes'];

const Review = ({ draft, onChange }) => {
  const upd = (i, patch) => onChange({ ...draft, items: draft.items.map((x, idx) => (idx === i ? touch(x, patch) : x)) });
  const del = (i) => onChange({ ...draft, items: draft.items.filter((_, idx) => idx !== i) });
  const nz = (v) => v || null;
  return (
    <div data-testid="iac-ai-review">
      <HeardSummary summary={draft.summary} questions={draft.questions} idPrefix="iac-ai" />
      <Head icon={CheckSquare} testId="iac-ai-head">Checklist items ({draft.items.length})</Head>
      <div className="space-y-2">
        {draft.items.map((it, i) => (
          <div key={i} className="p-3 rounded-xl space-y-2" style={rowStyle} data-testid={`iac-ai-row-${i}`}>
            <div className="flex items-center gap-2">
              <input className={`${inp} flex-1 font-semibold ${chg(it, 'title') ? CHANGED : ''}`} value={it.title} onChange={(e) => upd(i, { title: e.target.value })} placeholder="What needs to be done" data-testid={`iac-ai-title-${i}`} />
              {it.existing_id && <ExistingBadge changes={it.changes} testId={`iac-ai-badge-${i}`} />}
              <Remove onClick={() => del(i)} testId={`iac-ai-remove-${i}`} />
            </div>
            <input className={`${inp} w-full ${chg(it, 'description') ? CHANGED : ''}`} value={it.description} onChange={(e) => upd(i, { description: e.target.value })} placeholder="Details — what, why, how" data-testid={`iac-ai-description-${i}`} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Field label="Category" type="select" options={CATS} value={it.category} onChange={(v) => upd(i, { category: v })} changed={chg(it, 'category')} testId={`iac-ai-category-${i}`} />
              <Field label="Priority" type="select" options={PRIS} value={it.priority} onChange={(v) => upd(i, { priority: v })} changed={chg(it, 'priority')} testId={`iac-ai-priority-${i}`} />
              <Field label="Action" type="select" options={ACTS} value={it.action_type} onChange={(v) => upd(i, { action_type: v })} changed={chg(it, 'action_type')} testId={`iac-ai-action-${i}`} />
              <Field label="When" type="select" options={WHEN} value={it.due_timeframe} onChange={(v) => upd(i, { due_timeframe: v })} changed={chg(it, 'due_timeframe')} testId={`iac-ai-when-${i}`} />
              <Field label="Contact name" value={it.contact_name} onChange={(v) => upd(i, { contact_name: nz(v) })} changed={chg(it, 'contact_name')} testId={`iac-ai-contact-${i}`} />
              <Field label="Contact phone" value={it.contact_phone} onChange={(v) => upd(i, { contact_phone: nz(v) })} changed={chg(it, 'contact_phone')} testId={`iac-ai-phone-${i}`} />
              <Field label="Contact email" type="email" value={it.contact_email} onChange={(v) => upd(i, { contact_email: nz(v) })} changed={chg(it, 'contact_email')} testId={`iac-ai-email-${i}`} />
              <Field label="Notes" value={it.notes} onChange={(v) => upd(i, { notes: nz(v) })} changed={chg(it, 'notes')} testId={`iac-ai-notes-${i}`} />
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange({ ...draft, items: [...draft.items, { ...BLANK }] })} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold)] hover:underline mt-1" data-testid="iac-ai-add"><Plus className="w-3.5 h-3.5" /> Add an item</button>
    </div>
  );
};

const body = (it, extra = {}) => Object.fromEntries(Object.entries({ ...extra, ...Object.fromEntries(FIELDS.map((f) => [f, it[f]])) }).filter(([, v]) => v !== null && v !== undefined));

// IAC builder: dictate the first-days to-do list → review → POST /checklists (new) or PUT /checklists/{id} (changed).
export const ChecklistAIBuilder = ({ estateId, hasItems, getAuthHeaders, onBuilt }) => (
  <AIBuilderShell
    id="iac-ai-builder"
    title="Describe what your family should do first"
    intro="Tap the mic (or type) and talk through the first calls, filings and hand-offs — who to reach, what to cancel, where things are — or tell me what changed on an item already here (“Tom’s number is now…”). I’ll turn each one into a checklist item with a priority and timeframe; you review before anything is added or updated."
    example={EXAMPLE}
    keyterms={KEYTERMS}
    draftLabel="Draft the checklist"
    buildLabel="Apply these changes"
    collapsible={hasItems}
    collapsedLabel="Describe what your family should do first — speak or type, and I’ll draft the checklist"
    draft={async (text) => (await apiClient.post(`${API_URL}/checklists/${estateId}/ai-draft`, { description: text }, getAuthHeaders())).data.draft}
    renderReview={(draft, setDraft) => <Review draft={draft} onChange={setDraft} />}
    validate={(d) => (d.items.some((x) => !x.title.trim()) ? 'Every item needs a title.' : null)}
    canBuild={(d) => hasWork(d.items)}
    build={async (draft) => {
      let made = 0; let updated = 0; let onFile = 0; const failures = [];
      for (const it of draft.items) {
        try {
          if (isNew(it)) { await apiClient.post(`${API_URL}/checklists`, body(it, { estate_id: estateId }), getAuthHeaders()); made += 1; }
          else if (isUpdate(it)) { await apiClient.put(`${API_URL}/checklists/${it.existing_id}`, body(it), getAuthHeaders()); updated += 1; }
          else onFile += 1;
        } catch (err) { failures.push(`${it.title} (${err.response?.data?.detail || 'save failed'})`); }
      }
      onBuilt?.();
      const label = countLabel(made, updated, 'checklist item');
      return { made: label, failures, message: `${label.charAt(0).toUpperCase()}${label.slice(1)}${onFile ? `; ${onFile} ${onFile === 1 ? 'was' : 'were'} already on file` : ''}. Tap any item to fine-tune it.` };
    }}
  />
);

export default ChecklistAIBuilder;
