import React from 'react';
import { Users, Plus } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { AIBuilderShell } from '../ai/AIBuilderShell';
import { rowStyle, inp, Head, Remove, HeardSummary, Field, ExistingBadge, chg, touch, hasWork, isNew, isUpdate, countLabel, CHANGED } from '../ai/reviewPrimitives';

const EXAMPLE = 'e.g. "Our neighbor Bill Reyes has a key to the house, his cell is 804-555-0199. Pastor Dave at Grace Church — call him, don\u2019t text. My college roommate Jenna Park in Seattle, jenna.park@gmail.com. My business partner Luis Ortega."';
const KEYTERMS = ['neighbor', 'pastor', 'rabbi', 'godparent', 'business partner', 'attorney', 'CPA'];
const BLANK = { existing_id: null, changes: [], name: '', phone: '', email: '', address: '', relationship: '', notes: '' };

const Review = ({ draft, onChange }) => {
  const upd = (i, patch) => onChange({ ...draft, contacts: draft.contacts.map((c, idx) => (idx === i ? touch(c, patch) : c)) });
  const del = (i) => onChange({ ...draft, contacts: draft.contacts.filter((_, idx) => idx !== i) });
  return (
    <div data-testid="ffn-ai-review">
      <HeardSummary summary={draft.summary} questions={draft.questions} idPrefix="ffn-ai" />
      <Head icon={Users} testId="ffn-ai-head">People to notify ({draft.contacts.length})</Head>
      <div className="space-y-2">
        {draft.contacts.map((c, i) => (
          <div key={i} className="p-3 rounded-xl space-y-2" style={rowStyle} data-testid={`ffn-ai-row-${i}`}>
            <div className="flex items-center gap-2">
              <input className={`${inp} flex-1 font-semibold ${chg(c, 'name') ? CHANGED : ''}`} value={c.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Full name" data-testid={`ffn-ai-name-${i}`} />
              {c.existing_id && <ExistingBadge changes={c.changes} testId={`ffn-ai-badge-${i}`} />}
              <Remove onClick={() => del(i)} testId={`ffn-ai-remove-${i}`} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Field label="Relationship" value={c.relationship} onChange={(v) => upd(i, { relationship: v })} placeholder="Neighbor, Pastor…" changed={chg(c, 'relationship')} testId={`ffn-ai-relationship-${i}`} />
              <Field label="Phone" value={c.phone} onChange={(v) => upd(i, { phone: v })} className={!c.phone && !c.email ? CHANGED : ''} changed={chg(c, 'phone')} testId={`ffn-ai-phone-${i}`} />
              <Field label="Email" type="email" value={c.email} onChange={(v) => upd(i, { email: v })} className={!c.phone && !c.email ? CHANGED : ''} changed={chg(c, 'email')} testId={`ffn-ai-email-${i}`} />
              <Field label="Address" value={c.address} onChange={(v) => upd(i, { address: v })} changed={chg(c, 'address')} testId={`ffn-ai-address-${i}`} />
              <Field label="Notes (how / when to reach them)" value={c.notes} onChange={(v) => upd(i, { notes: v })} className="col-span-2 sm:col-span-4" changed={chg(c, 'notes')} testId={`ffn-ai-notes-${i}`} />
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange({ ...draft, contacts: [...draft.contacts, { ...BLANK }] })} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold)] hover:underline mt-1" data-testid="ffn-ai-add"><Plus className="w-3.5 h-3.5" /> Add a person</button>
    </div>
  );
};

const body = (c) => ({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', relationship: c.relationship || '', notes: c.notes || '' });

// "Who should be told?" → review → POST /ffn/{estate} (new) or PUT /ffn/{id} (changed) — the Add Contact form's own endpoints.
export const FFNAIBuilder = ({ estateId, hasItems, getAuthHeaders, onBuilt }) => (
  <AIBuilderShell
    id="ffn-ai-builder"
    title="Describe who should be told"
    intro="Tap the mic (or type) and name the relatives, friends, neighbors, clergy and colleagues who need to hear from your family — how you know them and the best way to reach them — or tell me what changed for someone already on the list (“Bill’s new number is…”). I’ll fill in the contact form for each; you review before anyone is added or updated."
    example={EXAMPLE}
    keyterms={KEYTERMS}
    draftLabel="Draft the list"
    buildLabel="Apply these changes"
    collapsible={hasItems}
    collapsedLabel="Describe who should be told — speak or type, and I’ll draft the contact list"
    draft={async (text) => (await apiClient.post(`${API_URL}/ffn/${estateId}/ai-draft`, { description: text }, getAuthHeaders())).data.draft}
    renderReview={(draft, setDraft) => <Review draft={draft} onChange={setDraft} />}
    validate={(d) => (d.contacts.some((c) => !c.name.trim()) ? 'Every contact needs a name.' : null)}
    canBuild={(d) => hasWork(d.contacts)}
    build={async (draft) => {
      let made = 0; let updated = 0; const failures = [];
      for (const c of draft.contacts) {
        try {
          if (isNew(c)) { await apiClient.post(`${API_URL}/ffn/${estateId}`, body(c), getAuthHeaders()); made += 1; }
          else if (isUpdate(c)) { await apiClient.put(`${API_URL}/ffn/${c.existing_id}`, body(c), getAuthHeaders()); updated += 1; }
        } catch (err) { failures.push(`${c.name} (${err.response?.data?.detail || 'save failed'})`); }
      }
      onBuilt?.();
      const label = countLabel(made, updated, 'contact');
      return { made: label, failures, message: `${label.charAt(0).toUpperCase()}${label.slice(1)} on your notification list. Tap any card to fine-tune it.` };
    }}
  />
);

export default FFNAIBuilder;
