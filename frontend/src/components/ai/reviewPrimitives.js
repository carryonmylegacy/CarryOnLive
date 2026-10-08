import React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';

// Shared bits for every "Here's what I heard" review step.
export const rowStyle = { background: 'var(--card)', border: '1px solid var(--b)' };
export const sel = 'input-field select-themed text-base h-9';
export const inp = 'input-field text-base h-9';
export const CHANGED = 'ring-1 ring-[#f59e0b] rounded-lg';

// Rows that match something already on file carry `existing_id` + `changes` (the fields the speaker
// changed). These helpers keep every builder's create-vs-update logic identical.
export const chg = (item, field) => Boolean(item?.existing_id) && Array.isArray(item?.changes) && item.changes.includes(field);
export const isUpdate = (item) => Boolean(item?.existing_id) && (item?.changes?.length || 0) > 0;
export const isNew = (item) => !item?.existing_id;
export const hasWork = (rows) => rows.some((r) => isNew(r) || isUpdate(r));
// Apply an edit; on an existing row the edited keys become part of `changes` so Build knows to update it.
export const touch = (item, patch) => (item.existing_id
  ? { ...item, ...patch, changes: Array.from(new Set([...(item.changes || []), ...Object.keys(patch)])) }
  : { ...item, ...patch });
export const countLabel = (made, updated, noun, plural = `${noun}s`) => {
  const parts = [];
  if (made) parts.push(`added ${made} ${made === 1 ? noun : plural}`);
  if (updated) parts.push(`updated ${updated} ${updated === 1 ? noun : plural}`);
  return parts.join(' and ') || 'nothing';
};

export const Head = ({ icon: Icon, children, testId }) => (
  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mt-4 mb-2" data-testid={testId}>
    <Icon className="w-3.5 h-3.5" /> {children}
  </div>
);

export const Remove = ({ onClick, testId }) => (
  <button type="button" onClick={onClick} className="text-[#ef4444] hover:opacity-70 p-1" aria-label="Remove" data-testid={testId}><Trash2 className="w-3.5 h-3.5" /></button>
);

export const HeardSummary = ({ summary, questions, idPrefix }) => (
  <>
    {summary && (
      <div className="rounded-xl p-3 text-[13px] leading-snug" style={{ background: 'rgba(var(--gold-rgb), 0.08)', border: '1px solid rgba(var(--gold-rgb), 0.35)', color: 'var(--t)' }} data-testid={`${idPrefix}-summary`}>
        <span className="font-bold text-[var(--gold)]">Here&apos;s what I heard:</span> {summary}
      </div>
    )}
    {questions?.length > 0 && (
      <ul className="mt-3 space-y-1.5" data-testid={`${idPrefix}-questions`}>
        {questions.map((q, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] leading-snug rounded-lg px-3 py-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', color: 'var(--t)' }}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[#f59e0b]" /> {q}
          </li>
        ))}
      </ul>
    )}
  </>
);

// Small labelled field used inside review rows. `type` = text | number | select. `changed` rings it amber.
export const Field = ({ label, value, onChange, type = 'text', options, placeholder, className = '', testId, step, changed = false }) => (
  <label className={`block min-w-0 ${changed ? CHANGED : ''} ${className}`}>
    <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--t5)] mb-0.5">{label}</span>
    {type === 'select' ? (
      <select className={sel} value={value ?? ''} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ) : (
      <input className={inp} type={type} inputMode={type === 'number' ? 'decimal' : undefined} step={step} value={value ?? ''} placeholder={placeholder}
        onChange={(e) => onChange(type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} data-testid={testId} />
    )}
  </label>
);

// "Already on file" (nothing to change) or "Update" (amber — the speaker changed something; fields ring amber).
export const ExistingBadge = ({ changes = [], testId }) => (changes.length
  ? <span className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }} title={`Changing: ${changes.join(', ')}`} data-testid={testId}>Update</span>
  : <span className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }} data-testid={testId}>Already on file</span>);
