/**
 * RosterPreviewTable — the plan: what this upload will add, rename, or skip,
 * plus roster members that weren't in the file (never touched).
 */

import React, { useState } from 'react';
import { UserPlus, Pencil, Check, MinusCircle, AlertTriangle } from 'lucide-react';

const CHIP = {
  add: { icon: UserPlus, text: 'Will add', color: '#10b981' },
  update_name: { icon: Pencil, text: 'Rename', color: '#a78bfa' },
  skip: { icon: MinusCircle, text: 'Skip', color: 'var(--t5)' },
};
const PROBLEM_REASONS = new Set(['needs_email', 'invalid_email', 'needs_name', 'no_seat', 'existing_account']);

const Chip = ({ action, reason }) => {
  const c = CHIP[action] || CHIP.skip;
  const problem = action === 'skip' && PROBLEM_REASONS.has(reason);
  const Icon = problem ? AlertTriangle : c.icon;
  const color = problem ? '#F59E0B' : c.color;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
      style={{ color, border: `1px solid ${color}`, background: 'transparent' }} data-testid={`roster-row-chip-${action}`}>
      <Icon className="w-3 h-3" /> {problem ? 'Needs attention' : c.text}
    </span>
  );
};

const SummaryTile = ({ label, value, color, testId }) => (
  <div className="rounded-lg px-3 py-2" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
    <div className="text-xl font-bold" style={{ color }} data-testid={testId}>{value}</div>
    <div className="text-[11px] text-[var(--t5)] font-semibold uppercase tracking-wider">{label}</div>
  </div>
);

export const RosterSummary = ({ summary }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4" data-testid="roster-summary">
    <SummaryTile label="Will add" value={summary.add} color="#10b981" testId="roster-summary-add" />
    <SummaryTile label="Name updates" value={summary.update_name} color="#a78bfa" testId="roster-summary-update" />
    <SummaryTile label="Already clients" value={summary.already_client} color="var(--t3)" testId="roster-summary-already" />
    <SummaryTile label="Need attention" value={summary.needs_email + summary.needs_name + summary.no_seat + summary.existing_account} color="#F59E0B" testId="roster-summary-attention" />
    <SummaryTile label="Duplicates in file" value={summary.duplicate_in_file} color="var(--t5)" testId="roster-summary-dupes" />
    <SummaryTile label="Not in this upload" value={summary.not_in_upload} color="var(--t5)" testId="roster-summary-not-in-upload" />
  </div>
);

export const RosterPreviewTable = ({ rows, notInUpload }) => {
  const [problemsOnly, setProblemsOnly] = useState(false);
  const visible = problemsOnly ? rows.filter(r => r.action !== 'skip' || PROBLEM_REASONS.has(r.reason)) : rows;
  return (
    <div className="mb-4" data-testid="roster-preview">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <p className="text-sm font-bold text-[var(--t)]">Row by row</p>
        <label className="flex items-center gap-2 text-xs text-[var(--t4)] cursor-pointer">
          <input type="checkbox" checked={problemsOnly} onChange={e => setProblemsOnly(e.target.checked)} className="w-4 h-4 accent-[var(--gold)]" data-testid="roster-problems-only" />
          Hide rows that are already clients
        </label>
      </div>
      <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--b)', maxHeight: 420, overflowY: 'auto' }}>
        <table className="w-full text-sm" data-testid="roster-preview-table">
          <thead className="sticky top-0" style={{ background: 'var(--s)' }}>
            <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--t5)]">
              <th className="px-3 py-2 font-semibold">Row</th>
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Email</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">Why</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.row} style={{ borderTop: '1px solid var(--b)' }} data-testid={`roster-row-${r.row}`}>
                <td className="px-3 py-2 text-[var(--t5)] text-xs">{r.row}</td>
                <td className="px-3 py-2 text-[var(--t)]">
                  {`${r.first_name} ${r.last_name}`.trim() || <span className="text-[var(--t5)]">—</span>}
                  {r.action === 'update_name' && r.current_name && (
                    <span className="block text-[11px] text-[var(--t5)]">was “{r.current_name}”</span>
                  )}
                </td>
                <td className="px-3 py-2 text-[var(--t3)] break-all">{r.email || <span className="text-[var(--t5)]">—</span>}</td>
                <td className="px-3 py-2"><Chip action={r.action} reason={r.reason} /></td>
                <td className="px-3 py-2 text-xs text-[var(--t4)]">{r.detail}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-[var(--t5)]">Nothing to show.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {notInUpload?.length > 0 && (
        <details className="mt-3 text-sm" data-testid="roster-not-in-upload">
          <summary className="cursor-pointer text-[var(--t4)] font-semibold">
            {notInUpload.length} client{notInUpload.length === 1 ? '' : 's'} on your roster {notInUpload.length === 1 ? 'is' : 'are'} not in this file — nothing happens to them
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-[var(--t4)]">
            {notInUpload.map(u => (
              <li key={u.email} className="flex items-center gap-2"><Check className="w-3 h-3 text-[var(--t5)]" /> {u.name} · {u.email} · {u.status === 'pending_claim' ? 'awaiting claim' : 'claimed'}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};
