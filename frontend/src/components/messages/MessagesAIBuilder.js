import React from 'react';
import { MessageSquare, Plus, Lock } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { AIBuilderShell } from '../ai/AIBuilderShell';
import { rowStyle, inp, Head, Remove, HeardSummary, Field, ExistingBadge, chg, touch, isNew, countLabel, CHANGED } from '../ai/reviewPrimitives';

const opts = (pairs) => pairs.map(([value, label]) => ({ value, label }));
const TYPES = opts([['video', 'Video'], ['voice', 'Voice'], ['text', 'Written']]);
const TRIGGERS = opts([['immediate', 'When my estate transitions'], ['age_milestone', 'At a specific age'], ['event', 'On a life event'], ['specific_date', 'On a specific date']]);
const EVENTS = opts([['birthday', 'Birthday'], ['graduation', 'Graduation'], ['marriage', 'Marriage'], ['custom', 'Custom event']]);
const EXAMPLE = 'e.g. "A video for Emma on her wedding day — I want her to know how proud I am and what her mom would have said. For Jack when he turns 30, about the business and why I built it. A written note to both kids for the first Christmas without me. And a short one to my brother Mike, just thank you."';
const KEYTERMS = ['wedding', 'graduation', 'birthday', 'turns 18', 'turns 21', 'turns 30', 'first child', 'retirement'];
const BLANK = { existing_id: null, changes: [], title: '', recipient_ids: [], recipient_names: [], message_type: 'video', trigger_type: 'immediate', trigger_age: null, trigger_value: null, custom_event_label: null, trigger_date: null, why: '' };
const TRIGGER_KEYS = ['trigger_type', 'trigger_age', 'trigger_value', 'custom_event_label', 'trigger_date'];

const trigChanged = (m) => TRIGGER_KEYS.some((k) => chg(m, k));
const recipChanged = (m) => chg(m, 'recipients') || chg(m, 'recipient_ids');
const noteAddition = (m) => (m.existing_id && m.include_note !== false ? (m.why || '').trim() : '');

const triggerFields = (m) => ({
  trigger_type: m.trigger_type, trigger_value: m.trigger_type === 'event' ? (m.trigger_value || 'custom') : null,
  trigger_age: m.trigger_type === 'age_milestone' ? Number(m.trigger_age) : null, trigger_date: m.trigger_type === 'specific_date' ? m.trigger_date : null,
  custom_event_label: m.trigger_type === 'event' && (m.trigger_value || 'custom') === 'custom' ? (m.custom_event_label || null) : null,
});

// Existing message → only what the speaker changed is sent. The recording, attachments and title are never touched;
// the written note is only ever ADDED to (beneath what's there), and only when the addition is kept in the review.
const updateBody = (m, currentNote) => {
  const body = {};
  if (chg(m, 'message_type')) body.message_type = m.message_type;
  if (recipChanged(m)) body.recipients = m.recipient_ids;
  if (trigChanged(m)) Object.assign(body, triggerFields(m));
  const add = noteAddition(m);
  if (add) body.content = currentNote ? `${currentNote.trimEnd()}\n\n${add}` : add;
  return Object.keys(body).length ? body : null;
};

const NoteAddition = ({ m, i, currentNote, upd }) => (
  <div className={`rounded-lg p-2.5 space-y-2 ${noteAddition(m) ? CHANGED : ''}`} style={{ background: 'var(--s)' }} data-testid={`mm-ai-note-block-${i}`}>
    <p className="text-[11px] font-bold text-[var(--t4)] inline-flex items-center gap-1" data-testid={`mm-ai-note-lock-${i}`}>
      <Lock className="w-3 h-3" /> Your recording and current note stay exactly as they are — this is only added beneath the note.
    </p>
    {currentNote ? (
      <div>
        <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-0.5">Current note (unchanged)</span>
        <p className="text-[13px] text-[var(--t3)] whitespace-pre-wrap leading-snug max-h-24 overflow-y-auto" data-testid={`mm-ai-current-note-${i}`}>{currentNote}</p>
      </div>
    ) : (
      <p className="text-[12px] text-[var(--t4)]" data-testid={`mm-ai-current-note-${i}`}>No written note on this message yet.</p>
    )}
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-0.5">What to add — edit it, or clear it to keep the note as is</span>
      <textarea className="input-field text-base leading-snug resize-y" style={{ height: 'auto', minHeight: '3.5rem' }} rows={2} value={m.why || ''} onChange={(e) => upd({ why: e.target.value })} placeholder="Nothing to add" data-testid={`mm-ai-why-${i}`} />
    </label>
    <label className="inline-flex items-center gap-2 text-[12px] font-bold text-[var(--t)] cursor-pointer">
      <input type="checkbox" className="w-4 h-4 accent-[#d4af37]" checked={m.include_note !== false} onChange={(e) => upd({ include_note: e.target.checked })} data-testid={`mm-ai-include-note-${i}`} />
      Add this beneath my note
    </label>
  </div>
);

const Row = ({ m, i, beneficiaries, currentNote, upd, del }) => {
  // A message may hold the beneficiary's record id or linked user id — treat either as "selected".
  const idsOf = (b) => [b.user_id, b.id].filter(Boolean);
  const isOn = (b) => idsOf(b).some((x) => m.recipient_ids.includes(x));
  const toggle = (b) => upd({ recipient_ids: isOn(b) ? m.recipient_ids.filter((x) => !idsOf(b).includes(x)) : [...m.recipient_ids, b.user_id || b.id] });
  const unmatched = m.recipient_names.filter((n) => !beneficiaries.some((b) => (b.name || '').toLowerCase() === n.toLowerCase()));
  const existing = Boolean(m.existing_id);
  return (
    <div className="p-3 rounded-xl space-y-2" style={rowStyle} data-testid={`mm-ai-row-${i}`}>
      <div className="flex items-center gap-2">
        {existing
          ? <span className="flex-1 text-sm font-bold text-[var(--t)] truncate" data-testid={`mm-ai-title-${i}`}>{m.title}</span>
          : <input className={`${inp} flex-1 font-semibold`} value={m.title} onChange={(e) => upd({ title: e.target.value })} placeholder="Title — e.g. For Emma on her wedding day" data-testid={`mm-ai-title-${i}`} />}
        {existing && <ExistingBadge changes={m.changes} testId={`mm-ai-badge-${i}`} />}
        <Remove onClick={del} testId={`mm-ai-remove-${i}`} />
      </div>
      <div className={recipChanged(m) ? `${CHANGED} p-1 -m-1` : ''}>
        <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-1">Who receives it</span>
        <div className="flex flex-wrap gap-1.5" data-testid={`mm-ai-recipients-${i}`}>
          {beneficiaries.map((b) => {
            const on = isOn(b);
            return (
              <button key={b.id} type="button" onClick={() => toggle(b)} aria-pressed={on} data-testid={`mm-ai-recipient-${i}-${b.id}`}
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
        <Field label="Format" type="select" options={TYPES} value={m.message_type} onChange={(v) => upd({ message_type: v })} changed={chg(m, 'message_type')} testId={`mm-ai-type-${i}`} />
        <Field label="Delivered" type="select" options={TRIGGERS} value={m.trigger_type} onChange={(v) => upd({ trigger_type: v, trigger_age: null, trigger_value: v === 'event' ? 'birthday' : null, custom_event_label: null, trigger_date: null })} changed={trigChanged(m)} testId={`mm-ai-trigger-${i}`} />
        {m.trigger_type === 'age_milestone' && <Field label="At age" type="number" value={m.trigger_age} onChange={(v) => upd({ trigger_age: v })} changed={chg(m, 'trigger_age')} testId={`mm-ai-age-${i}`} />}
        {m.trigger_type === 'event' && <Field label="Event" type="select" options={EVENTS} value={m.trigger_value || 'custom'} onChange={(v) => upd({ trigger_value: v })} changed={chg(m, 'trigger_value')} testId={`mm-ai-event-${i}`} />}
        {m.trigger_type === 'event' && m.trigger_value === 'custom' && <Field label="Which event" value={m.custom_event_label} onChange={(v) => upd({ custom_event_label: v || null })} placeholder="First child, Retirement…" changed={chg(m, 'custom_event_label')} testId={`mm-ai-event-label-${i}`} />}
        {m.trigger_type === 'specific_date' && <Field label="Date" type="date" value={m.trigger_date} onChange={(v) => upd({ trigger_date: v || null })} changed={chg(m, 'trigger_date')} testId={`mm-ai-date-${i}`} />}
      </div>
      {existing ? (
        <NoteAddition m={m} i={i} currentNote={currentNote} upd={upd} />
      ) : (
        <label className="block">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-0.5">What you want them to know (your notes to record from)</span>
          <textarea className="input-field text-base leading-snug resize-y" style={{ height: 'auto', minHeight: '3.5rem' }} rows={2} value={m.why} onChange={(e) => upd({ why: e.target.value })} data-testid={`mm-ai-why-${i}`} />
        </label>
      )}
    </div>
  );
};

const Review = ({ draft, onChange, beneficiaries, notesById }) => (
  <div data-testid="mm-ai-review">
    <HeardSummary summary={draft.summary} questions={draft.questions} idPrefix="mm-ai" />
    <Head icon={MessageSquare} testId="mm-ai-head">Messages ({draft.messages.length})</Head>
    <div className="space-y-2">
      {draft.messages.map((m, i) => (
        <Row key={i} m={m} i={i} beneficiaries={beneficiaries} currentNote={m.existing_id ? notesById[m.existing_id] || '' : ''}
          upd={(patch) => onChange({ ...draft, messages: draft.messages.map((x, idx) => (idx === i ? touch(x, patch) : x)) })}
          del={() => onChange({ ...draft, messages: draft.messages.filter((_, idx) => idx !== i) })} />
      ))}
    </div>
    <button type="button" onClick={() => onChange({ ...draft, messages: [...draft.messages, { ...BLANK }] })} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold)] hover:underline mt-1" data-testid="mm-ai-add"><Plus className="w-3.5 h-3.5" /> Add a message</button>
    <p className="text-[12px] text-[var(--t4)] mt-3 leading-snug" data-testid="mm-ai-handoff-note">New messages are saved with your notes written in — open one afterwards to record the video or voice. Messages already set up only change where you see amber; recordings are never touched.</p>
  </div>
);

// MM scaffolding: who / when / why → review → POST /messages (new) or PUT /messages/{id} (only the changed fields of an existing one).
export const MessagesAIBuilder = ({ estateId, beneficiaries, messages = [], hasItems, getAuthHeaders, onBuilt }) => {
  const notesById = Object.fromEntries(messages.map((m) => [m.id, m.content || '']));
  return (
    <AIBuilderShell
      id="mm-ai-builder"
      title="Describe the messages you want to leave"
      intro="Tap the mic (or type) and talk through who each message is for, the moment it should arrive — a wedding, a birthday, an age, or simply when your estate transitions — and what you want them to know. You can also change one that's already set up (“make Emma’s wedding message a video”, “add Jack to the Christmas note”). I’ll set each one up with your notes written in; you record the video or voice whenever you’re ready."
      example={EXAMPLE}
      keyterms={KEYTERMS}
      draftLabel="Draft the messages"
      buildLabel="Apply these changes"
      collapsible={hasItems}
      collapsedLabel="Describe the messages you want to leave — speak or type, and I’ll set them up"
      draft={async (text) => (await apiClient.post(`${API_URL}/messages/${estateId}/ai-draft`, { description: text }, getAuthHeaders())).data.draft}
      renderReview={(draft, setDraft) => <Review draft={draft} onChange={setDraft} beneficiaries={beneficiaries} notesById={notesById} />}
      validate={(d) => (d.messages.some((m) => !m.title.trim()) ? 'Every message needs a title.' : d.messages.some((m) => m.trigger_type === 'age_milestone' && !m.trigger_age) ? 'Enter the age for each "at a specific age" message.' : d.messages.some((m) => m.trigger_type === 'specific_date' && !m.trigger_date) ? 'Pick the date for each "on a specific date" message.' : null)}
      canBuild={(d) => d.messages.some((m) => isNew(m) || updateBody(m, notesById[m.existing_id]))}
      build={async (draft) => {
        let made = 0; let updated = 0; const failures = [];
        for (const m of draft.messages) {
          try {
            if (isNew(m)) {
              await apiClient.post(`${API_URL}/messages`, { estate_id: estateId, title: m.title.trim(), content: m.why || '', message_type: m.message_type, recipients: m.recipient_ids, ...triggerFields(m) }, getAuthHeaders());
              made += 1;
            } else {
              const body = updateBody(m, notesById[m.existing_id]);
              if (body) { await apiClient.put(`${API_URL}/messages/${m.existing_id}`, body, getAuthHeaders()); updated += 1; }
            }
          } catch (err) { failures.push(`${m.title} (${err.response?.data?.detail || 'save failed'})`); }
        }
        onBuilt?.();
        const label = countLabel(made, updated, 'message');
        return { made: label, failures, message: `${label.charAt(0).toUpperCase()}${label.slice(1)}.${made ? ' Open any new card to record your video or voice.' : ''}` };
      }}
    />
  );
};

export default MessagesAIBuilder;
