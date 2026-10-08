import React from 'react';
import { KeyRound, Plus, Lock, ShieldAlert } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { AIBuilderShell } from '../ai/AIBuilderShell';
import { rowStyle, inp, Head, Remove, HeardSummary, Field, ExistingBadge } from '../ai/reviewPrimitives';

const CATS = [{ value: 'crypto', label: 'Cryptocurrency' }, { value: 'banking', label: 'Banking / Financial' }, { value: 'email', label: 'Email' }, { value: 'social_media', label: 'Social Media' }, { value: 'cloud', label: 'Cloud Storage' }, { value: 'subscription', label: 'Subscription' }, { value: 'other', label: 'Other' }];
const VIS = [{ value: 'private', label: 'Private (only me)' }, { value: 'posthumous_only', label: 'Beneficiary — after I\u2019m gone' }, { value: 'show_now', label: 'Beneficiary — can see now' }];
const EXAMPLE = 'e.g. "Netflix on the family email — cancel it. Coinbase, sign-in is mark.h@gmail.com, Sarah should get that after I\u2019m gone. My personal Gmail, two-factor goes to my phone, Karen can see it now. Ring doorbell, keep paying." (Don\u2019t say passwords — you\u2019ll type those into a locked field.)';
const KEYTERMS = ['Coinbase', 'iCloud', 'Gmail', 'Netflix', 'Dropbox', 'Venmo', 'PayPal', 'two-factor', 'domain'];
const BLANK = { existing_id: null, account_name: '', login_username: '', category: 'other', assigned_beneficiary_id: null, assigned_beneficiary_name: null, beneficiary_visibility: 'private', notes: null, secret_mentioned: false, password: '' };
const leftOut = (e) => Boolean(e.secret_mentioned) && !e.existing_id;
const LeftOutFlag = ({ i }) => (
  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#f59e0b] whitespace-nowrap" data-testid={`dav-ai-left-out-flag-${i}`}><ShieldAlert className="w-3.5 h-3.5" /> Password left out</span>
);

const Review = ({ draft, onChange, beneficiaries }) => {
  const upd = (i, patch) => onChange({ ...draft, entries: draft.entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) });
  const del = (i) => onChange({ ...draft, entries: draft.entries.filter((_, idx) => idx !== i) });
  const benOpts = [{ value: '', label: 'Nobody yet' }, ...beneficiaries.map((b) => ({ value: b.id, label: b.name }))];
  return (
    <div data-testid="dav-ai-review">
      <HeardSummary summary={draft.summary} questions={draft.questions} idPrefix="dav-ai" />
      <div className="flex items-start gap-2 mt-3 text-[12px] leading-snug rounded-lg px-3 py-2" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--t)' }} data-testid="dav-ai-secret-note">
        <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[#10b981]" /> Passwords never go through the AI. Type them into the locked field below — they go straight into your encrypted vault, exactly like the Add Entry form.
      </div>
      <Head icon={KeyRound} testId="dav-ai-head">Accounts ({draft.entries.length})</Head>
      <div className="space-y-2">
        {draft.entries.map((e, i) => (
          <div key={i} className="p-3 rounded-xl space-y-2" style={rowStyle} data-testid={`dav-ai-row-${i}`}>
            <div className="flex items-center gap-2">
              <input className={`${inp} flex-1 font-semibold`} value={e.account_name} disabled={Boolean(e.existing_id)} onChange={(ev) => upd(i, { account_name: ev.target.value })} placeholder="Service / account" data-testid={`dav-ai-name-${i}`} />
              {e.existing_id && <ExistingBadge />}
              {leftOut(e) && <LeftOutFlag i={i} />}
              <Remove onClick={() => del(i)} testId={`dav-ai-remove-${i}`} />
            </div>
            {!e.existing_id && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Field label="Category" type="select" options={CATS} value={e.category} onChange={(v) => upd(i, { category: v })} testId={`dav-ai-category-${i}`} />
                <Field label="Sign-in username / email" value={e.login_username} onChange={(v) => upd(i, { login_username: v })} testId={`dav-ai-login-${i}`} />
                <label className="block min-w-0">
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-0.5 inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Password (typed, encrypted)</span>
                  <input className={`${inp} text-base`} type="password" autoComplete="new-password" value={e.password || ''} onChange={(ev) => upd(i, { password: ev.target.value })} placeholder="Optional — never dictated" data-testid={`dav-ai-password-${i}`} />
                </label>
                <Field label="Who handles it" type="select" options={benOpts} value={e.assigned_beneficiary_id || ''} onChange={(v) => upd(i, { assigned_beneficiary_id: v || null })} testId={`dav-ai-beneficiary-${i}`} />
                <Field label="Visibility" type="select" options={VIS} value={e.beneficiary_visibility} onChange={(v) => upd(i, { beneficiary_visibility: v })} className="col-span-2" testId={`dav-ai-visibility-${i}`} />
                <Field label="Notes / what to do with it" value={e.notes} onChange={(v) => upd(i, { notes: v || null })} className="col-span-2" testId={`dav-ai-notes-${i}`} />
                {e.assigned_beneficiary_name && !e.assigned_beneficiary_id && <p className="col-span-2 sm:col-span-4 text-[11px] text-[#f59e0b]">You said “{e.assigned_beneficiary_name}” — add them as a beneficiary first, then pick them here.</p>}
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange({ ...draft, entries: [...draft.entries, { ...BLANK }] })} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold)] hover:underline mt-1" data-testid="dav-ai-add"><Plus className="w-3.5 h-3.5" /> Add an account</button>
    </div>
  );
};

// Digital Wallet builder. Secrets are typed in the review (masked) and go only to POST /digital-wallet (encrypted at rest).
export const DigitalWalletAIBuilder = ({ estateId, hasItems, beneficiaries = [], getAuthHeaders, onBuilt }) => (
  <AIBuilderShell
    id="dav-ai-builder"
    title="Describe your online accounts"
    intro="Tap the mic (or type) and list the accounts, subscriptions and digital assets someone will need to handle — who should get each one and what to do with it. Leave passwords out: you’ll type those into a locked field that goes straight to your encrypted vault."
    example={EXAMPLE}
    keyterms={KEYTERMS}
    draftLabel="Draft the list"
    buildLabel="Add these accounts"
    collapsible={hasItems}
    collapsedLabel="Describe your online accounts — speak or type, and I’ll draft the entries (passwords stay typed and locked)"
    draft={async (text) => (await apiClient.post(`${API_URL}/digital-wallet/${estateId}/ai-draft`, { description: text }, getAuthHeaders())).data.draft}
    renderReview={(draft, setDraft) => <Review draft={draft} onChange={setDraft} beneficiaries={beneficiaries} />}
    validate={(d) => (d.entries.some((e) => !e.existing_id && !e.account_name.trim()) ? 'Every account needs a name.' : null)}
    canBuild={(d) => d.entries.some((e) => !e.existing_id)}
    build={async (draft) => {
      let made = 0; const failures = [];
      for (const e of draft.entries) {
        if (e.existing_id) continue;
        const body = { estate_id: estateId, account_name: e.account_name, login_username: e.login_username || '', category: e.category, beneficiary_visibility: e.beneficiary_visibility, assigned_beneficiary_id: e.assigned_beneficiary_id || null, notes: e.notes || null, password: e.password || null };
        try { await apiClient.post(`${API_URL}/digital-wallet`, body, getAuthHeaders()); made += 1; }
        catch (err) { failures.push(`${e.account_name} (${err.response?.data?.detail || 'save failed'})`); }
      }
      onBuilt?.();
      const label = `${made} account${made === 1 ? '' : 's'}`;
      return { made: label, failures, message: `Added ${label} to your Digital Wallet. Tap any card to fine-tune it.` };
    }}
  />
);

export default DigitalWalletAIBuilder;
