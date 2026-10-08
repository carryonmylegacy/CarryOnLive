import React from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { AIBuilderShell } from '../ai/AIBuilderShell';
import { rowStyle, inp, Head, Remove, HeardSummary, Field } from '../ai/reviewPrimitives';

const opts = (pairs) => pairs.map(([value, label]) => ({ value, label }));
const TYPES = opts([['video', 'Video'], ['voice', 'Voice'], ['text', 'Written']]);
const TRIGGERS = opts([['immediate', 'When my estate transitions'], ['age_milestone', 'At a specific age'], ['event', 'On a life event'], ['specific_date', 'On a specific date']]);
const EVENTS = opts([['birthday', 'Birthday'], ['graduation', 'Graduation'], ['marriage', 'Marriage'], ['custom', 'Custom event']]);
const EXAMPLE = 'e.g. "A video for Emma on her wedding day — I want her to know how proud I am and what her mom would have said. For Jack when he turns 30, about the business and why I built it. A written note to both kids for the first Christmas without me. And a short one to my brother Mike, just thank you."';
const KEYTERMS = ['wedding', 'graduation', 'birthday', 'turns 18', 'turns 21', 'turns 30', 'first child', 'retirement'];
const BLANK = { title: '', recipient_ids: [], recipient_names: [], message_type: 'video', trigger_type: 'immediate', trigger_age: null, trigger_value: null, custom_event_label: null, trigger_date: null, why: '' };

const Row = ({ m, i, beneficiaries, upd, del }) => {
  const toggle = (id) => upd({ recipient_ids: m.recipient_ids.includes(id) ? m.recipient_ids.filter((x) => x !== id) : [...m.recipient_ids, id] });
  const unmatched = m.recipient_names.filter((n) => !beneficiaries.some((b) => (b.name || '').toLowerCase() === n.toLowerCase()));
  return (
    <div className="p-3 rounded-xl space-y-2" style={rowStyle} data-testid={`mm-ai-row-${i}`}>
      <div className="flex items-center gap-2">
        <input className={`${inp} flex-1 font-semibold`} value={m.title} onChange={(e) => upd({ title: e.target.value })} placeholder="Title — e.g. For Emma on her wedding day" data-testid={`mm-ai-title-${i}`} />
        <Remove onClick={del} testId={`mm-ai-remove-${i}`} />
      </div>
      <div>
        <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-1">Who receives it</span>
        <div className="flex flex-wrap gap-1.5" data-testid={`mm-ai-recipients-${i}`}>
          {beneficiaries.map((b) => {
            const id = b.user_id || b.id; const on = m.recipient_ids.includes(id);
            return (
              <button key={id} type="button" onClick={() => toggle(id)} aria-pressed={on} data-testid={`mm-ai-recipient-${i}-${b.id}`}
                className="text-xs font-bold px-2.5 py-1 rounded-full transition-colors"
                style={{ border: `1px solid ${on ? 'var(--gold)' : 'var(--b)'}`, background: on ? 'rgba(var(--gold-rgb), 0.14)' : 'transparent', color: on ? 'var(--gold)' : 'var(--t4)' }}>
                {b.name}
              </button>
            );
          })}
          {beneficiaries.length === 0 && <span className="text-xs text-[var(--t4)]">No beneficiaries yet — add them on the Beneficiaries page, then assign this message.</span>}
        </div>
        {unmatched.length > 0 && <p className="text-[11px] font-bold text-[#f59e0b] mt-1" data-testid={`mm-ai-unmatched-${i}`}>Also mentioned: {unmatched.join(', ')} — not a beneficiary yet.</p>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Field label="Format" type="select" options={TYPES} value={m.message_type} onChange={(v) => upd({ message_type: v })} testId={`mm-ai-type-${i}`} />
        <Field label="Delivered" type="select" options={TRIGGERS} value={m.trigger_type} onChange={(v) => upd({ trigger_type: v, trigger_age: null, trigger_value: v === 'event' ? 'birthday' : null, custom_event_label: null, trigger_date: null })} testId={`mm-ai-trigger-${i}`} />
        {m.trigger_type === 'age_milestone' && <Field label="At age" type="number" value={m.trigger_age} onChange={(v) => upd({ trigger_age: v })} testId={`mm-ai-age-${i}`} />}
        {m.trigger_type === 'event' && <Field label="Event" type="select" options={EVENTS} value={m.trigger_value || 'custom'} onChange={(v) => upd({ trigger_value: v })} testId={`mm-ai-event-${i}`} />}
        {m.trigger_type === 'event' && m.trigger_value === 'custom' && <Field label="Which event" value={m.custom_event_label} onChange={(v) => upd({ custom_event_label: v || null })} placeholder="First child, Retirement…" testId={`mm-ai-event-label-${i}`} />}
        {m.trigger_type === 'specific_date' && <Field label="Date" type="date" value={m.trigger_date} onChange={(v) => upd({ trigger_date: v || null })} testId={`mm-ai-date-${i}`} />}
      </div>
      <label className="block">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-0.5">What you want them to know (your notes to record from)</span>
        <textarea className="input-field text-base leading-snug resize-y" style={{ height: 'auto', minHeight: '3.5rem' }} rows={2} value={m.why} onChange={(e) => upd({ why: e.target.value })} data-testid={`mm-ai-why-${i}`} />
      </label>
    </div>
  );
};

const Review = ({ draft, onChange, beneficiaries }) => (
  <div data-testid="mm-ai-review">
    <HeardSummary summary={draft.summary} questions={draft.questions} idPrefix="mm-ai" />
    <Head icon={MessageSquare} testId="mm-ai-head">Messages to set up ({draft.messages.length})</Head>
    <div className="space-y-2">
      {draft.messages.map((m, i) => (
        <Row key={i} m={m} i={i} beneficiaries={beneficiaries}
          upd={(patch) => onChange({ ...draft, messages: draft.messages.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) })}
          del={() => onChange({ ...draft, messages: draft.messages.filter((_, idx) => idx !== i) })} />
      ))}
    </div>
    <button type="button" onClick={() => onChange({ ...draft, messages: [...draft.messages, { ...BLANK }] })} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold)] hover:underline mt-1" data-testid="mm-ai-add"><Plus className="w-3.5 h-3.5" /> Add a message</button>
    <p className="text-[12px] text-[var(--t4)] mt-3 leading-snug" data-testid="mm-ai-handoff-note">Each one is saved as a message with your notes written in — open it afterwards to record the video or voice.</p>
  </div>
);

// MM scaffolding: who / when / why → review → POST /messages per row (text scaffold, no media yet).
export const MessagesAIBuilder = ({ estateId, beneficiaries, hasItems, getAuthHeaders, onBuilt }) => (
  <AIBuilderShell
    id="mm-ai-builder"
    title="Describe the messages you want to leave"
    intro="Tap the mic (or type) and talk through who each message is for, the moment it should arrive — a wedding, a birthday, an age, or simply when your estate transitions — and what you want them to know. I’ll set each one up with your notes written in; you record the video or voice whenever you’re ready."
    example={EXAMPLE}
    keyterms={KEYTERMS}
    draftLabel="Draft the messages"
    buildLabel="Set these up"
    collapsible={hasItems}
    collapsedLabel="Describe the messages you want to leave — speak or type, and I’ll set them up"
    draft={async (text) => (await apiClient.post(`${API_URL}/messages/${estateId}/ai-draft`, { description: text }, getAuthHeaders())).data.draft}
    renderReview={(draft, setDraft) => <Review draft={draft} onChange={setDraft} beneficiaries={beneficiaries} />}
    validate={(d) => (d.messages.some((m) => !m.title.trim()) ? 'Every message needs a title.' : d.messages.some((m) => m.trigger_type === 'age_milestone' && !m.trigger_age) ? 'Enter the age for each "at a specific age" message.' : d.messages.some((m) => m.trigger_type === 'specific_date' && !m.trigger_date) ? 'Pick the date for each "on a specific date" message.' : null)}
    canBuild={(d) => d.messages.length > 0}
    build={async (draft) => {
      let made = 0; const failures = [];
      for (const m of draft.messages) {
        const body = {
          estate_id: estateId, title: m.title.trim(), content: m.why || '', message_type: m.message_type, recipients: m.recipient_ids,
          trigger_type: m.trigger_type, trigger_value: m.trigger_type === 'event' ? (m.trigger_value || 'custom') : null,
          trigger_age: m.trigger_type === 'age_milestone' ? Number(m.trigger_age) : null, trigger_date: m.trigger_type === 'specific_date' ? m.trigger_date : null,
          custom_event_label: m.trigger_type === 'event' && (m.trigger_value || 'custom') === 'custom' ? (m.custom_event_label || null) : null,
        };
        try { await apiClient.post(`${API_URL}/messages`, body, getAuthHeaders()); made += 1; }
        catch (err) { failures.push(`${m.title} (${err.response?.data?.detail || 'save failed'})`); }
      }
      onBuilt?.();
      const label = `${made} message${made === 1 ? '' : 's'}`;
      return { made: label, failures, message: `Set up ${label}. Open any card to record your video or voice.` };
    }}
  />
);

export default MessagesAIBuilder;
