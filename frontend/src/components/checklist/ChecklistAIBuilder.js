import React from 'react';
import { CheckSquare, Plus } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { AIBuilderShell } from '../ai/AIBuilderShell';
import { rowStyle, inp, Head, Remove, HeardSummary, Field, ExistingBadge } from '../ai/reviewPrimitives';

const opts = (pairs) => pairs.map(([value, label]) => ({ value, label }));
const CATS = opts([['legal', 'Legal'], ['financial', 'Financial'], ['insurance', 'Insurance'], ['property', 'Property'], ['medical', 'Medical'], ['personal', 'Personal'], ['government', 'Government'], ['general', 'General']]);
const PRIS = opts([['critical', 'Critical — do immediately'], ['high', 'High — first week'], ['medium', 'Medium — first 2 weeks'], ['low', 'Low — first month']]);
const ACTS = opts([['call', 'Make a phone call'], ['email', 'Send an email'], ['visit', 'Visit a location'], ['file_paperwork', 'File paperwork'], ['notify', 'Notify someone'], ['custom', 'Custom action']]);
const WHEN = opts([['immediate', 'Immediately'], ['first_week', 'Within first week'], ['two_weeks', 'Within two weeks'], ['first_month', 'Within first month'], ['no_rush', 'No rush']]);
const EXAMPLE = 'e.g. "First call my brother Tom at 804-555-0123 — he knows where everything is. Sarah takes care of the dog. Call Dominion to move the power bill into Karen\u2019s name. File the life-insurance claim with Northwestern Mutual — the policy is in the fireproof box. Cancel my gym membership, no rush."';
const KEYTERMS = ['executor', 'death certificate', 'Social Security', 'VA', 'pension', 'life insurance', 'probate', 'funeral home'];
const BLANK = { existing_id: null, title: '', description: '', category: 'general', priority: 'medium', action_type: 'custom', due_timeframe: 'first_week', contact_name: null, contact_phone: null, contact_email: null, contact_address: null, notes: null };

const Review = ({ draft, onChange }) => {
  const upd = (i, patch) => onChange({ ...draft, items: draft.items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
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
              <input className={`${inp} flex-1 font-semibold`} value={it.title} disabled={Boolean(it.existing_id)} onChange={(e) => upd(i, { title: e.target.value })} placeholder="What needs to be done" data-testid={`iac-ai-title-${i}`} />
              {it.existing_id && <ExistingBadge />}
              <Remove onClick={() => del(i)} testId={`iac-ai-remove-${i}`} />
            </div>
            {!it.existing_id && (
              <>
                <input className={`${inp} w-full`} value={it.description} onChange={(e) => upd(i, { description: e.target.value })} placeholder="Details — what, why, how" data-testid={`iac-ai-description-${i}`} />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Field label="Category" type="select" options={CATS} value={it.category} onChange={(v) => upd(i, { category: v })} testId={`iac-ai-category-${i}`} />
                  <Field label="Priority" type="select" options={PRIS} value={it.priority} onChange={(v) => upd(i, { priority: v })} testId={`iac-ai-priority-${i}`} />
                  <Field label="Action" type="select" options={ACTS} value={it.action_type} onChange={(v) => upd(i, { action_type: v })} testId={`iac-ai-action-${i}`} />
                  <Field label="When" type="select" options={WHEN} value={it.due_timeframe} onChange={(v) => upd(i, { due_timeframe: v })} testId={`iac-ai-when-${i}`} />
                  <Field label="Contact name" value={it.contact_name} onChange={(v) => upd(i, { contact_name: nz(v) })} testId={`iac-ai-contact-${i}`} />
                  <Field label="Contact phone" value={it.contact_phone} onChange={(v) => upd(i, { contact_phone: nz(v) })} testId={`iac-ai-phone-${i}`} />
                  <Field label="Contact email" type="email" value={it.contact_email} onChange={(v) => upd(i, { contact_email: nz(v) })} testId={`iac-ai-email-${i}`} />
                  <Field label="Notes" value={it.notes} onChange={(v) => upd(i, { notes: nz(v) })} testId={`iac-ai-notes-${i}`} />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange({ ...draft, items: [...draft.items, { ...BLANK }] })} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold)] hover:underline mt-1" data-testid="iac-ai-add"><Plus className="w-3.5 h-3.5" /> Add an item</button>
    </div>
  );
};

// IAC builder: dictate the first-days to-do list → review → POST /checklists per item (the Add Item endpoint).
export const ChecklistAIBuilder = ({ estateId, hasItems, getAuthHeaders, onBuilt }) => (
  <AIBuilderShell
    id="iac-ai-builder"
    title="Describe what your family should do first"
    intro="Tap the mic (or type) and talk through the first calls, filings and hand-offs — who to reach, what to cancel, where things are. I’ll turn each one into a checklist item with a priority and timeframe; you review before anything is added."
    example={EXAMPLE}
    keyterms={KEYTERMS}
    draftLabel="Draft the checklist"
    buildLabel="Add these items"
    collapsible={hasItems}
    collapsedLabel="Describe what your family should do first — speak or type, and I’ll draft the checklist"
    draft={async (text) => (await apiClient.post(`${API_URL}/checklists/${estateId}/ai-draft`, { description: text }, getAuthHeaders())).data.draft}
    renderReview={(draft, setDraft) => <Review draft={draft} onChange={setDraft} />}
    validate={(d) => (d.items.some((x) => !x.existing_id && !x.title.trim()) ? 'Every item needs a title.' : null)}
    canBuild={(d) => d.items.some((x) => !x.existing_id)}
    build={async (draft) => {
      let made = 0; let onFile = 0; const failures = [];
      for (const it of draft.items) {
        if (it.existing_id) { onFile += 1; continue; }
        const { existing_id: _e, ...rest } = it;
        const body = Object.fromEntries(Object.entries({ estate_id: estateId, ...rest }).filter(([, v]) => v !== null));
        try { await apiClient.post(`${API_URL}/checklists`, body, getAuthHeaders()); made += 1; }
        catch (err) { failures.push(`${it.title} (${err.response?.data?.detail || 'save failed'})`); }
      }
      onBuilt?.();
      const label = `${made} checklist item${made === 1 ? '' : 's'}`;
      return { made: label, failures, message: `Added ${label}${onFile ? `; ${onFile} ${onFile === 1 ? 'was' : 'were'} already on file` : ''}. Tap any item to fine-tune it.` };
    }}
  />
);

export default ChecklistAIBuilder;
