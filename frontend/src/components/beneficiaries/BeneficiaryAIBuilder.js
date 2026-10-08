import React from 'react';
import { Users, Plus, Mail } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { AIBuilderShell } from '../ai/AIBuilderShell';
import { rowStyle, inp, Head, Remove, HeardSummary, Field, ExistingBadge } from '../ai/reviewPrimitives';
import { RELATIONSHIPS } from '../../config/relationships';

const REL_OPTS = RELATIONSHIPS.map((r) => ({ value: r, label: r }));
const EXAMPLE = 'e.g. "My wife Karen, karen@example.com, 555-201-3344. Our daughter Sarah, born March 3rd 1998, lives in Richmond. Our son Mark, mark@example.com. And my brother Tom Harris as a backup — he\u2019s a nurse."';
const KEYTERMS = ['beneficiary', 'spouse', 'stepdaughter', 'stepson', 'godchild', 'trustee', 'charity'];
const BLANK = { existing_id: null, first_name: '', middle_name: null, last_name: '', suffix: null, relation: 'Other', email: '', phone: null, date_of_birth: null, address_street: null, address_city: null, address_state: null, address_zip: null, notes: null };
const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const Review = ({ draft, onChange }) => {
  const upd = (i, patch) => onChange({ ...draft, beneficiaries: draft.beneficiaries.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });
  const del = (i) => onChange({ ...draft, beneficiaries: draft.beneficiaries.filter((_, idx) => idx !== i) });
  const nz = (v) => v || null;
  return (
    <div data-testid="ben-ai-review">
      <HeardSummary summary={draft.summary} questions={draft.questions} idPrefix="ben-ai" />
      <div className="flex items-start gap-2 mt-3 text-[12px] leading-snug rounded-lg px-3 py-2" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--t)' }} data-testid="ben-ai-invite-note">
        <Mail className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[#3b82f6]" /> Each new beneficiary receives CarryOn&apos;s invitation email the moment you add them — exactly as the Add Beneficiary form does. Remove anyone you&apos;re not ready to invite.
      </div>
      <Head icon={Users} testId="ben-ai-head">Beneficiaries ({draft.beneficiaries.length})</Head>
      <div className="space-y-2">
        {draft.beneficiaries.map((b, i) => (
          <div key={i} className="p-3 rounded-xl space-y-2" style={rowStyle} data-testid={`ben-ai-row-${i}`}>
            <div className="flex items-center gap-2">
              <input className={`${inp} flex-1 font-semibold`} value={b.first_name} disabled={Boolean(b.existing_id)} onChange={(e) => upd(i, { first_name: e.target.value })} placeholder="First name" data-testid={`ben-ai-first-${i}`} />
              <input className={`${inp} flex-1 font-semibold`} value={b.last_name} disabled={Boolean(b.existing_id)} onChange={(e) => upd(i, { last_name: e.target.value })} placeholder="Last name" data-testid={`ben-ai-last-${i}`} />
              {b.existing_id && <ExistingBadge />}
              <Remove onClick={() => del(i)} testId={`ben-ai-remove-${i}`} />
            </div>
            {!b.existing_id && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Field label="Relationship" type="select" options={REL_OPTS} value={b.relation} onChange={(v) => upd(i, { relation: v })} testId={`ben-ai-relation-${i}`} />
                <Field label="Email (required)" type="email" value={b.email} onChange={(v) => upd(i, { email: v })} placeholder="name@example.com" className={!EMAIL_OK.test(b.email || '') ? 'ring-1 ring-[#f59e0b] rounded-lg' : ''} testId={`ben-ai-email-${i}`} />
                <Field label="Phone" value={b.phone} onChange={(v) => upd(i, { phone: nz(v) })} testId={`ben-ai-phone-${i}`} />
                <Field label="Birthday" type="date" value={b.date_of_birth} onChange={(v) => upd(i, { date_of_birth: nz(v) })} testId={`ben-ai-dob-${i}`} />
                <Field label="Street" value={b.address_street} onChange={(v) => upd(i, { address_street: nz(v) })} className="col-span-2" testId={`ben-ai-street-${i}`} />
                <Field label="City" value={b.address_city} onChange={(v) => upd(i, { address_city: nz(v) })} testId={`ben-ai-city-${i}`} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="State" value={b.address_state} onChange={(v) => upd(i, { address_state: nz(v.toUpperCase().slice(0, 2)) })} testId={`ben-ai-state-${i}`} />
                  <Field label="ZIP" value={b.address_zip} onChange={(v) => upd(i, { address_zip: nz(v) })} testId={`ben-ai-zip-${i}`} />
                </div>
                <Field label="Notes" value={b.notes} onChange={(v) => upd(i, { notes: nz(v) })} className="col-span-2 sm:col-span-4" testId={`ben-ai-notes-${i}`} />
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange({ ...draft, beneficiaries: [...draft.beneficiaries, { ...BLANK }] })} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold)] hover:underline mt-1" data-testid="ben-ai-add"><Plus className="w-3.5 h-3.5" /> Add a person</button>
    </div>
  );
};

// "Describe the people you're providing for" → review → POST /beneficiaries for each (same endpoint as the form).
export const BeneficiaryAIBuilder = ({ estateId, hasItems, getAuthHeaders, onBuilt }) => (
  <AIBuilderShell
    id="ben-ai-builder"
    title="Describe the people you’re providing for"
    intro="Tap the mic (or type) and name each person — how they’re related, their email, and anything else you know. I’ll fill in the Add Beneficiary form for each; you review before anyone is added or invited."
    example={EXAMPLE}
    keyterms={KEYTERMS}
    draftLabel="Draft the list"
    buildLabel="Add these beneficiaries"
    collapsible={hasItems}
    collapsedLabel="Describe the people you’re providing for — speak or type, and I’ll draft the list"
    draft={async (text) => (await apiClient.post(`${API_URL}/beneficiaries/${estateId}/ai-draft`, { description: text }, getAuthHeaders())).data.draft}
    renderReview={(draft, setDraft) => <Review draft={draft} onChange={setDraft} />}
    validate={(d) => {
      const fresh = d.beneficiaries.filter((b) => !b.existing_id);
      if (fresh.some((b) => !b.first_name.trim() || !b.last_name.trim())) return 'Every person needs a first and last name.';
      if (fresh.some((b) => !EMAIL_OK.test(b.email || ''))) return 'Every beneficiary needs an email address — that\u2019s where their invitation goes.';
      return null;
    }}
    canBuild={(d) => d.beneficiaries.some((b) => !b.existing_id)}
    build={async (draft) => {
      let made = 0; const failures = [];
      for (const b of draft.beneficiaries) {
        if (b.existing_id) continue;
        const { existing_id: _e, existing_name: _n, ...rest } = b;
        const payload = Object.fromEntries(Object.entries({ estate_id: estateId, ...rest }).filter(([, v]) => v !== null && v !== ''));
        try { await apiClient.post(`${API_URL}/beneficiaries`, payload, getAuthHeaders()); made += 1; }
        catch (err) { failures.push(`${b.first_name} ${b.last_name} (${err.response?.data?.detail || 'save failed'})`); }
      }
      onBuilt?.();
      const label = `${made} beneficiar${made === 1 ? 'y' : 'ies'}`;
      return { made: label, failures, message: `Added ${label} and sent their invitations. Tap any card to fine-tune it.` };
    }}
  />
);

export default BeneficiaryAIBuilder;
