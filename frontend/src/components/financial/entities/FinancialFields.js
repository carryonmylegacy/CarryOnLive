/**
 * FinancialFields — reusable gross assets / gross debts inputs that
 * compute and display net worth in real time.
 *
 * Props:
 *   assets, debts        : numeric strings (the wizard / detail panel manage them as state)
 *   onChange({assets, debts})
 *   compact (bool)       : if true, renders inline on a single row (used in detail panel)
 */
import React from 'react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';

const fmt = (n) => {
  if (n === '' || n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

export default function FinancialFields({ assets, debts, onChange }) {
  const a = assets === '' ? '' : Number(assets);
  const d = debts === '' ? '' : Number(debts);
  const net = (a !== '' && d !== '' && !Number.isNaN(a) && !Number.isNaN(d)) ? a - d : null;

  return (
    <div className="space-y-3" data-testid="entity-financial-fields">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] text-[var(--t4)]">Gross assets ($)</Label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            value={assets ?? ''}
            onChange={(e) => onChange({ assets: e.target.value, debts })}
            placeholder="0"
            className="input-field"
            data-testid="entity-gross-assets"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-[var(--t4)]">Gross debts ($)</Label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            value={debts ?? ''}
            onChange={(e) => onChange({ assets, debts: e.target.value })}
            placeholder="0"
            className="input-field"
            data-testid="entity-gross-debts"
          />
        </div>
      </div>
      <div
        className="rounded-lg px-3 py-2 flex items-center justify-between"
        style={{
          background: net == null ? 'var(--card)' : net >= 0 ? 'rgba(34,201,147,0.10)' : 'rgba(122,90,35,0.18)',
          border: `1px solid ${net == null ? 'var(--b)' : net >= 0 ? 'rgba(34,201,147,0.35)' : 'rgba(196,149,69,0.45)'}`,
        }}
      >
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--t4)]">Net worth</span>
        <span
          className="text-sm font-bold"
          style={{ color: net == null ? 'var(--t5)' : net >= 0 ? '#22C993' : '#C49545' }}
          data-testid="entity-net-worth"
        >
          {net == null ? '—' : fmt(net)}
        </span>
      </div>
    </div>
  );
}

export { fmt as formatCurrency };
