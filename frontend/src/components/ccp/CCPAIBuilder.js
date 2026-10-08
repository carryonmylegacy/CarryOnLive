import React from 'react';
import { Shield, MapPin, PhoneCall, Backpack, Plus } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { AIBuilderShell } from '../ai/AIBuilderShell';
import { rowStyle, sel, Head, Remove, HeardSummary, Field, ExistingBadge, chg, touch, isNew, isUpdate } from '../ai/reviewPrimitives';
import { getDisasterTemplate } from './disasterTemplates';
import { CONCERN_OPTIONS, HOUSEHOLD_OPTIONS } from './CCPWizard';

const EXAMPLE = 'e.g. "We live in Houston, two kids and a dog. Hurricanes are what worry me. If a Cat 3 warning comes we leave for my sister Karen\u2019s in Dallas — 214-555-0142 — backup is a hotel in Austin. I-45 north, never 59. Dog rides with me. Insurance papers and passports are in the fireproof folder by the door. Go-bag has three days of water, the kids\u2019 inhalers and $400 cash. My brother Mike in Denver is who everyone calls to check in."';
const KEYTERMS = ['hurricane', 'wildfire', 'earthquake', 'tornado', 'evacuate', 'go-bag', 'rendezvous', 'out-of-area'];
const GO_BAG_CATS = ['water', 'food', 'medication', 'first_aid', 'tools', 'documents', 'cash', 'clothing', 'communication', 'pet_supplies', 'comfort', 'other'].map((v) => ({ value: v, label: v.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase()) }));
const CONCERNS = CONCERN_OPTIONS.map((c) => ({ value: c.id, label: c.label }));
const RV_KEYS = ['primary_label', 'primary_address', 'primary_notes', 'secondary_label', 'secondary_address', 'secondary_notes', 'tertiary_label', 'tertiary_address', 'tertiary_notes', 'evacuation_routes'];
const OA_KEYS = ['name', 'relationship', 'phone', 'email', 'city', 'state', 'notes'];

// Every disaster's follow-up questions, so the model answers the wizard's real fields and nothing else.
const TEMPLATES = Object.fromEntries(CONCERN_OPTIONS.map((c) => [c.id, (getDisasterTemplate(c.id)?.questions || []).map(({ key, label, required, options }) => ({ key, label, required: Boolean(required), ...(options ? { options } : {}) }))]));

const nz = (v) => (v && String(v).trim() ? v : null);
const nonEmpty = (o, keys) => Object.fromEntries(keys.filter((k) => nz(o?.[k])).map((k) => [k, o[k]]));
const keep = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] != null).map((k) => [k, o[k]]));

const PlanSection = ({ plan, onChange }) => {
  const questions = getDisasterTemplate(plan.concern)?.questions || [];
  const setAnswer = (k, v) => onChange({ ...plan, follow_up_answers: { ...plan.follow_up_answers, [k]: v } });
  const toggle = (id) => onChange({ ...plan, household: plan.household.includes(id) ? plan.household.filter((h) => h !== id) : [...plan.household, id] });
  return (
    <>
      <Head icon={Shield} testId="ccp-ai-plan-head">The plan</Head>
      <div className="p-3 rounded-xl space-y-3" style={rowStyle} data-testid="ccp-ai-plan">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Disaster" type="select" options={CONCERNS} value={plan.concern} onChange={(v) => onChange({ ...plan, concern: v, follow_up_answers: {} })} testId="ccp-ai-concern" />
          <Field label="Home location" value={plan.location} onChange={(v) => onChange({ ...plan, location: v })} placeholder="Address or city, state" className={!nz(plan.location) ? 'ring-1 ring-[#f59e0b] rounded-lg' : ''} testId="ccp-ai-location" />
        </div>
        <div>
          <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-1">Household</span>
          <div className="flex flex-wrap gap-1.5" data-testid="ccp-ai-household">
            {HOUSEHOLD_OPTIONS.map((h) => {
              const on = plan.household.includes(h.id);
              return (
                <button key={h.id} type="button" onClick={() => toggle(h.id)} aria-pressed={on} data-testid={`ccp-ai-household-${h.id}`}
                  className="text-xs font-bold px-2.5 py-1 rounded-full transition-colors"
                  style={{ border: `1px solid ${on ? h.color : 'var(--b)'}`, background: on ? `${h.color}22` : 'transparent', color: on ? h.color : 'var(--t4)' }}>
                  {h.label}
                </button>
              );
            })}
          </div>
        </div>
        {questions.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="ccp-ai-answers">
            {questions.map((q) => {
              const label = q.label.replace(/\s*\*$/, '') + (q.required ? ' *' : '');
              const val = plan.follow_up_answers[q.key] || '';
              const warn = q.required && !nz(val) ? 'ring-1 ring-[#f59e0b] rounded-lg' : '';
              return q.options ? (
                <label key={q.key} className={`block min-w-0 ${warn}`}>
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-0.5">{label}</span>
                  <select className={sel} value={val} onChange={(e) => setAnswer(q.key, e.target.value)} data-testid={`ccp-ai-answer-${q.key}`}>
                    <option value="">—</option>
                    {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              ) : (
                <Field key={q.key} label={label} value={val} onChange={(v) => setAnswer(q.key, v)} placeholder={q.placeholder} className={warn} testId={`ccp-ai-answer-${q.key}`} />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

const RendezvousSection = ({ rv, onChange }) => {
  const f = (k, label, cls = '') => <Field key={k} label={label} value={rv[k]} onChange={(v) => onChange({ ...rv, [k]: nz(v) })} className={cls} testId={`ccp-ai-rv-${k}`} />;
  return (
    <>
      <Head icon={MapPin} testId="ccp-ai-rv-head">Where you would go</Head>
      <div className="p-3 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-2" style={rowStyle} data-testid="ccp-ai-rendezvous">
        {f('primary_label', 'Primary — name')}{f('primary_address', 'Primary — address')}{f('primary_notes', 'Primary — notes')}
        {f('secondary_label', 'Backup — name')}{f('secondary_address', 'Backup — address')}{f('secondary_notes', 'Backup — notes')}
        {f('evacuation_routes', 'Routes to take / avoid', 'sm:col-span-3')}
      </div>
    </>
  );
};

const OutOfAreaSection = ({ oa, onChange }) => {
  const f = (k, label, type = 'text', cls = '') => <Field key={k} label={label} type={type} value={oa[k]} onChange={(v) => onChange({ ...oa, [k]: nz(v) })} className={cls} testId={`ccp-ai-oa-${k}`} />;
  return (
    <>
      <Head icon={PhoneCall} testId="ccp-ai-oa-head">Out-of-area check-in contact</Head>
      <div className="p-3 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2" style={rowStyle} data-testid="ccp-ai-out-of-area">
        {f('name', 'Name')}{f('relationship', 'Relationship')}{f('phone', 'Phone')}{f('email', 'Email', 'email')}
        {f('city', 'City')}{f('state', 'State')}{f('notes', 'Notes', 'text', 'col-span-2')}
      </div>
    </>
  );
};

const GoBagSection = ({ items, onChange }) => {
  const upd = (i, patch) => onChange(items.map((x, idx) => (idx === i ? touch(x, patch) : x)));
  return (
    <>
      <Head icon={Backpack} testId="ccp-ai-gobag-head">Go-bag ({items.length})</Head>
      <div className="space-y-2">
        {items.map((g, i) => (
          <div key={i} className="p-2.5 rounded-xl flex flex-wrap sm:flex-nowrap items-end gap-2" style={rowStyle} data-testid={`ccp-ai-gobag-row-${i}`}>
            <Field label="Item" value={g.name} onChange={(v) => upd(i, { name: v })} className="flex-1 min-w-[40%]" changed={chg(g, 'name')} testId={`ccp-ai-gobag-name-${i}`} />
            <Field label="Category" type="select" options={GO_BAG_CATS} value={g.category} onChange={(v) => upd(i, { category: v })} className="w-36" changed={chg(g, 'category')} testId={`ccp-ai-gobag-category-${i}`} />
            <Field label="Qty" value={g.qty} onChange={(v) => upd(i, { qty: nz(v) })} className="w-24" changed={chg(g, 'qty')} testId={`ccp-ai-gobag-qty-${i}`} />
            <Field label="Notes" value={g.notes} onChange={(v) => upd(i, { notes: nz(v) })} className="flex-1 min-w-[40%]" changed={chg(g, 'notes')} testId={`ccp-ai-gobag-notes-${i}`} />
            {g.existing_id && <ExistingBadge changes={g.changes} testId={`ccp-ai-gobag-badge-${i}`} />}
            <Remove onClick={() => onChange(items.filter((_, idx) => idx !== i))} testId={`ccp-ai-gobag-remove-${i}`} />
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...items, { existing_id: null, changes: [], category: 'other', name: '', qty: null, notes: null }])} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold)] hover:underline mt-1" data-testid="ccp-ai-gobag-add"><Plus className="w-3.5 h-3.5" /> Add a go-bag item</button>
    </>
  );
};

const Review = ({ draft, onChange }) => (
  <div data-testid="ccp-ai-review">
    <HeardSummary summary={draft.summary} questions={draft.questions} idPrefix="ccp-ai" />
    <PlanSection plan={draft.plan} onChange={(plan) => onChange({ ...draft, plan })} />
    <RendezvousSection rv={draft.rendezvous} onChange={(rendezvous) => onChange({ ...draft, rendezvous })} />
    <OutOfAreaSection oa={draft.out_of_area} onChange={(out_of_area) => onChange({ ...draft, out_of_area })} />
    <GoBagSection items={draft.go_bag} onChange={(go_bag) => onChange({ ...draft, go_bag })} />
    <p className="text-[12px] text-[var(--t4)] mt-3 leading-snug" data-testid="ccp-ai-handoff-note">Next: your answers open in the plan wizard on the Details step — check them, then tap Generate. Meeting points, the check-in contact and go-bag items are saved to their panels right away.</p>
  </div>
);

// CCP builder: talk through the disaster → review → depth panels saved via their PUTs, then the wizard opens pre-filled.
export const CCPAIBuilder = ({ estateId, hasPlans, getAuthHeaders, onOpenWizard, onDepthSaved }) => (
  <AIBuilderShell
    id="ccp-ai-builder"
    title="Describe your family’s plan"
    intro="Tap the mic (or type) and talk it through: where you live, who is in the house, the disaster that worries you most, where you would go and when, who takes which pet, where the papers are, what is in the go-bag, and who everyone calls to check in — or tell me what changed (“bump the water to five days”). I’ll fill in the plan wizard for you; you review before anything is saved."
    example={EXAMPLE}
    keyterms={KEYTERMS}
    draftLabel="Draft my plan inputs"
    buildLabel="Open in the plan wizard"
    collapsible={hasPlans}
    collapsedLabel="Describe your family’s plan — speak or type, and I’ll fill in the wizard"
    draft={async (text) => (await apiClient.post(`${API_URL}/ccp/${estateId}/ai-draft`, { description: text, templates: TEMPLATES }, getAuthHeaders())).data.draft}
    renderReview={(draft, setDraft) => <Review draft={draft} onChange={setDraft} />}
    validate={(d) => (d.go_bag.some((g) => !g.name.trim()) ? 'Every go-bag item needs a name.' : null)}
    canBuild={(d) => Boolean(d.plan.concern)}
    build={async (draft) => {
      const auth = getAuthHeaders();
      const made = []; const failures = [];
      const detail = (err) => err.response?.data?.detail || 'save failed';
      const rv = nonEmpty(draft.rendezvous, RV_KEYS);
      if (Object.keys(rv).length) {
        try {
          const cur = (await apiClient.get(`${API_URL}/ccp/rendezvous/${estateId}`, auth)).data;
          await apiClient.put(`${API_URL}/ccp/rendezvous/${estateId}`, { ...keep(cur, RV_KEYS), ...rv }, auth);
          made.push('meeting points');
        } catch (err) { failures.push(`meeting points (${detail(err)})`); }
      }
      const oa = nonEmpty(draft.out_of_area, OA_KEYS);
      if (Object.keys(oa).length) {
        try {
          const cur = (await apiClient.get(`${API_URL}/ccp/out-of-area/${estateId}`, auth)).data;
          await apiClient.put(`${API_URL}/ccp/out-of-area/${estateId}`, { ...keep(cur, OA_KEYS), ...oa }, auth);
          made.push('the check-in contact');
        } catch (err) { failures.push(`check-in contact (${detail(err)})`); }
      }
      if (draft.go_bag.length) {
        try {
          const cur = (await apiClient.get(`${API_URL}/ccp/go-bag/${estateId}`, auth)).data.items || [];
          const have = new Set(cur.map((i) => (i.name || '').trim().toLowerCase()));
          let added = 0; let changed = 0;
          const next = cur.map((item) => {
            const g = draft.go_bag.find((x) => x.existing_id === item.id && isUpdate(x));
            if (!g) return item;
            changed += 1;
            return { ...item, category: g.category, name: g.name.trim(), qty: g.qty, notes: g.notes };
          });
          draft.go_bag.filter((g) => isNew(g) && !have.has(g.name.trim().toLowerCase())).forEach((g) => {
            next.push({ category: g.category, name: g.name.trim(), qty: g.qty, notes: g.notes });
            added += 1;
          });
          if (added || changed) await apiClient.put(`${API_URL}/ccp/go-bag/${estateId}`, next, auth);
          const parts = [added && `${added} go-bag item${added === 1 ? '' : 's'} added`, changed && `${changed} go-bag item${changed === 1 ? '' : 's'} updated`].filter(Boolean);
          if (parts.length) made.push(parts.join(', '));
        } catch (err) { failures.push(`go-bag (${detail(err)})`); }
      }
      try {
        sessionStorage.setItem(`ccp_wizard_draft:${estateId}`, JSON.stringify({
          step: 3, household: draft.plan.household, selectedConcern: draft.plan.concern, location: draft.plan.location || '', followUpAnswers: draft.plan.follow_up_answers || {},
        }));
      } catch { /* private mode — the wizard simply starts empty */ }
      if (made.length) onDepthSaved?.();
      onOpenWizard();
      return { made: made.join(', ') || 'your plan inputs', failures, message: `Saved ${made.length ? made.join(', ') : 'your answers'}. Check the Details step, then tap Generate.` };
    }}
  />
);

export default CCPAIBuilder;
