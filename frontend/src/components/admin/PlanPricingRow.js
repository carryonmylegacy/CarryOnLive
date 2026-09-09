import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { PlanDetailsEditor } from './PlanDetailsEditor';
import { verificationBadge } from '../../utils/planRules';

const pct = (v) => Number(v ?? 0);

// One founder-editable pricing row: monthly price + quarterly / annual discount percents.
// Cycle prices are derived server-side; 0 / 0 means flat rate (one price on every cycle).
export const PlanPricingRow = ({ plan, accent, testIdPrefix, onSave, benefactorPlans, onMove }) => {
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(false);
  const [form, setForm] = useState({});
  const flat = pct(plan.quarterly_discount_percent) === 0 && pct(plan.annual_discount_percent) === 0;

  const startEdit = () => {
    setForm({
      price: plan.price?.toString() ?? '',
      quarterly_discount_percent: pct(plan.quarterly_discount_percent).toString(),
      annual_discount_percent: pct(plan.annual_discount_percent).toString(),
    });
    setEditing(true);
  };

  const save = async () => {
    const payload = {
      price: parseFloat(form.price),
      quarterly_discount_percent: parseFloat(form.quarterly_discount_percent),
      annual_discount_percent: parseFloat(form.annual_discount_percent),
    };
    if (Object.values(payload).some((v) => Number.isNaN(v) || v < 0)) return;
    if (await onSave(plan.id, payload)) setEditing(false);
  };

  const field = (key, label, step, testId) => (
    <label className="flex items-center gap-1 text-xs text-[var(--t4)]">
      {label}
      <Input type="number" step={step} min="0" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="input-field w-20 text-base" data-testid={`${testIdPrefix}-${plan.id}-${testId}`} />
    </label>
  );

  const badge = verificationBadge(plan);
  return (
    <div className="p-3 rounded-xl bg-[var(--s)]" data-testid={`${testIdPrefix}-row-${plan.id}`}>
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        {onMove && (
          <span className="flex flex-col">
            <button type="button" onClick={() => onMove(plan.id, -1)} className="text-[var(--t5)] hover:text-[var(--t)]" aria-label="Move up" data-testid={`${testIdPrefix}-${plan.id}-up`}><ChevronUp className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => onMove(plan.id, 1)} className="text-[var(--t5)] hover:text-[var(--t)]" aria-label="Move down" data-testid={`${testIdPrefix}-${plan.id}-down`}><ChevronDown className="w-3.5 h-3.5" /></button>
          </span>
        )}
        <span className="font-bold text-[var(--t)] text-sm" data-testid={`${testIdPrefix}-${plan.id}-name`}>{plan.name}</span>
        {badge && <span className="text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--gold)]/15 text-[var(--gold)]">{badge}</span>}
        {plan.note && <span className="text-xs text-[var(--t5)] ml-1">({plan.note})</span>}
      </div>
      {editing ? (
        <div className="flex items-center gap-3 flex-wrap">
          {field('price', '$', '0.01', 'price-input')}
          {field('quarterly_discount_percent', 'Quarterly −%', '0.5', 'quarterly-input')}
          {field('annual_discount_percent', 'Annual −%', '0.5', 'annual-input')}
          <Button size="sm" className="gold-button text-xs" onClick={save} data-testid={`${testIdPrefix}-${plan.id}-save`}>Save</Button>
          <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-bold text-lg" style={{ color: accent }} data-testid={`${testIdPrefix}-${plan.id}-price`}>${plan.price?.toFixed(2)}</span>
          <span className="text-xs text-[var(--t5)]">/mo</span>
          <span className="text-xs text-[var(--t4)]" data-testid={`${testIdPrefix}-${plan.id}-cycles`}>
            {flat
              ? 'Flat rate — same price every cycle'
              : `Quarterly −${pct(plan.quarterly_discount_percent)}% → $${plan.quarterly_price?.toFixed(2)}/mo · Annual −${pct(plan.annual_discount_percent)}% → $${plan.annual_price?.toFixed(2)}/mo`}
          </span>
          <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--t4)]" onClick={startEdit} data-testid={`${testIdPrefix}-${plan.id}-edit`}>Edit pricing</Button>
          <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--t4)]" onClick={() => setDetails((d) => !d)} data-testid={`${testIdPrefix}-${plan.id}-details-toggle`}>{details ? 'Hide details' : 'Details'}</Button>
        </div>
      )}
    </div>
    {details && (
      <PlanDetailsEditor plan={plan} benefactorPlans={benefactorPlans} testIdPrefix={testIdPrefix} onSave={onSave} onClose={() => setDetails(false)} />
    )}
    </div>
  );
};
