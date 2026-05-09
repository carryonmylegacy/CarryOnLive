/**
 * FinancialFields — reusable gross assets / gross debts inputs that
 * compute and display net worth in real time.
 *
 * Props:
 *   assets, debts        : numeric strings (the wizard / detail panel manage them as state)
 *   onChange({assets, debts})
 *   compact (bool)       : if true, renders inline on a single row (used in detail panel)
 *
 * Currency UX (added 2026-02-09):
 *   • Inputs accept any raw number ("1500", "1500.5") while focused so
 *     typing is never disrupted (no comma/$ formatting fights with
 *     the caret).
 *   • The moment the input loses focus, the value re-renders as
 *     formatted USD with dollars and cents — e.g. "$1,500.50".
 *   • Internally stored value remains a plain numeric string so the
 *     parent's `Number(value)` conversion at save time keeps working.
 */
import React from 'react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';

const fmt = (n) => {
  if (n === '' || n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

const fmtCents = (n) => {
  if (n === '' || n === null || n === undefined || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * Controlled currency input. Shows the user's raw typed value while
 * focused, then renders the value as USD with dollars-and-cents on blur.
 */
function CurrencyInput({ value, onChange, ...rest }) {
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const display = focused
    ? draft
    : (value === '' || value === null || value === undefined ? '' : fmtCents(value));

  const handleChange = (e) => {
    // Allow digits and a single decimal point only.
    let raw = e.target.value.replace(/[^0-9.]/g, '');
    const firstDot = raw.indexOf('.');
    if (firstDot !== -1) {
      raw =
        raw.slice(0, firstDot + 1) +
        raw.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
    }
    setDraft(raw);
    onChange(raw);
  };

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={display}
      onFocus={(e) => {
        setFocused(true);
        setDraft(value === '' || value === null || value === undefined ? '' : String(value));
        // Defer caret-to-end until React paints the raw value.
        const el = e.currentTarget;
        requestAnimationFrame(() => {
          try {
            const len = (el.value || '').length;
            el.setSelectionRange(len, len);
          } catch (_) { /* select unsupported on some types */ }
        });
      }}
      onBlur={() => {
        setFocused(false);
        if (draft === '' || draft === '.') onChange('');
      }}
      onChange={handleChange}
    />
  );
}

export default function FinancialFields({ assets, debts, onChange }) {
  const a = assets === '' ? '' : Number(assets);
  const d = debts === '' ? '' : Number(debts);
  const net = (a !== '' && d !== '' && !Number.isNaN(a) && !Number.isNaN(d)) ? a - d : null;

  return (
    <div className="space-y-3" data-testid="entity-financial-fields">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] text-[var(--t4)]">Gross assets ($)</Label>
          <CurrencyInput
            value={assets}
            onChange={(v) => onChange({ assets: v, debts })}
            placeholder="$0.00"
            className="input-field"
            data-testid="entity-gross-assets"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-[var(--t4)]">Gross debts ($)</Label>
          <CurrencyInput
            value={debts}
            onChange={(v) => onChange({ assets, debts: v })}
            placeholder="$0.00"
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
