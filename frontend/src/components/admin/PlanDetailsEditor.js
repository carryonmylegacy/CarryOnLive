import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';

const lines = (arr) => (arr || []).join('\n');
const splitLines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);

// Founder-editable plan details: name, note, feature bullets, verification requirement + documents,
// and (benefactor plans only) the age window that auto-qualifies a subscriber and where they land
// when they age out. Saves through PUT /admin/plans/{id}.
export const PlanDetailsEditor = ({ plan, benefactorPlans, testIdPrefix, onSave, onClose }) => {
  const isBen = plan.id.startsWith('ben_');
  const [form, setForm] = useState({
    name: plan.name || '',
    note: plan.note || '',
    features: lines(plan.features),
    requires_verification: !!plan.requires_verification,
    verification_docs: lines(plan.verification_docs),
    age_min: plan.age_min ?? '',
    age_max: plan.age_max ?? '',
    age_out_plan_id: plan.age_out_plan_id ?? '',
  });
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const tid = (k) => `${testIdPrefix}-${plan.id}-${k}`;

  const save = async () => {
    const payload = {
      name: form.name.trim(),
      note: form.note.trim(),
      features: splitLines(form.features),
      requires_verification: form.requires_verification,
      verification_docs: splitLines(form.verification_docs),
    };
    if (!isBen) {
      const hasWindow = form.age_min !== '' || form.age_max !== '';
      if (hasWindow) {
        if (form.age_min !== '') payload.age_min = parseInt(form.age_min, 10);
        if (form.age_max !== '') payload.age_max = parseInt(form.age_max, 10);
        if (form.age_out_plan_id) payload.age_out_plan_id = form.age_out_plan_id;
      } else {
        payload.clear_age_window = true;
      }
    }
    if (await onSave(plan.id, payload)) onClose();
  };

  return (
    <div className="mt-3 p-4 rounded-xl border border-[var(--b)] bg-[var(--s2,transparent)] space-y-3" data-testid={tid('details')}>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs text-[var(--t4)] space-y-1"><span>Name</span>
          <Input value={form.name} onChange={(e) => set('name')(e.target.value)} className="input-field text-base" data-testid={tid('name')} /></label>
        <label className="text-xs text-[var(--t4)] space-y-1"><span>Note (shown under the card title)</span>
          <Input value={form.note} onChange={(e) => set('note')(e.target.value)} className="input-field text-base" data-testid={tid('note')} /></label>
      </div>
      <label className="block text-xs text-[var(--t4)] space-y-1"><span>Feature bullets — one per line</span>
        <Textarea rows={4} value={form.features} onChange={(e) => set('features')(e.target.value)} className="input-field text-sm" data-testid={tid('features')} /></label>
      <div className="flex items-center gap-3 text-xs text-[var(--t4)]">
        <Switch checked={form.requires_verification} onCheckedChange={set('requires_verification')} data-testid={tid('requires-verification')} />
        <span>Requires eligibility verification (shown as a discount tier)</span>
      </div>
      {form.requires_verification && (
        <label className="block text-xs text-[var(--t4)] space-y-1"><span>Accepted documents — one per line</span>
          <Textarea rows={3} value={form.verification_docs} onChange={(e) => set('verification_docs')(e.target.value)} className="input-field text-sm" data-testid={tid('verification-docs')} /></label>
      )}
      {!isBen && (
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-xs text-[var(--t4)] space-y-1"><span>Age from (blank = none)</span>
            <Input type="number" min="0" max="130" value={form.age_min} onChange={(e) => set('age_min')(e.target.value)} className="input-field text-base" data-testid={tid('age-min')} /></label>
          <label className="text-xs text-[var(--t4)] space-y-1"><span>Age to (blank = open-ended)</span>
            <Input type="number" min="0" max="130" value={form.age_max} onChange={(e) => set('age_max')(e.target.value)} className="input-field text-base" data-testid={tid('age-max')} /></label>
          <label className="text-xs text-[var(--t4)] space-y-1"><span>After aging out, move to</span>
            <select value={form.age_out_plan_id} onChange={(e) => set('age_out_plan_id')(e.target.value)} className="input-field text-base w-full" data-testid={tid('age-out-plan')}>
              <option value="">— no automatic move —</option>
              {(benefactorPlans || []).filter((p) => p.id !== plan.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={onClose}>Cancel</Button>
        <Button size="sm" className="gold-button text-xs" onClick={save} data-testid={tid('details-save')}>Save details</Button>
      </div>
    </div>
  );
};
