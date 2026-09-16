/**
 * RosterMappingEditor — shows how spreadsheet columns were matched
 * (remembered / detected / AI-suggested) and lets the partner correct it.
 */

import React, { useState } from 'react';
import { Loader2, Sparkles, Wand2, BookmarkCheck, HelpCircle } from 'lucide-react';
import { Button } from '../ui/button';

const SOURCE_LABEL = {
  remembered: { icon: BookmarkCheck, text: 'Same layout as your last upload — matched automatically', color: '#10b981' },
  detected: { icon: Wand2, text: 'Columns matched from their headings', color: 'var(--gold)' },
  ai: { icon: Sparkles, text: 'Columns suggested by Guardian AI (from headings and masked samples) — please confirm', color: '#a78bfa' },
  manual: { icon: HelpCircle, text: 'We could not tell which columns are which — pick them below', color: '#F59E0B' },
};

const FIELDS = [
  { key: 'email', label: 'Email (required)' },
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'full_name', label: 'Full name (one column)' },
];

export const RosterMappingEditor = ({ plan, busy, onRemap }) => {
  const [draft, setDraft] = useState(plan.mapping);
  const src = SOURCE_LABEL[plan.mapping_source] || SOURCE_LABEL.detected;
  const dirty = FIELDS.some(f => (draft[f.key] || null) !== (plan.mapping[f.key] || null));
  const complete = draft.email && ((draft.first_name && draft.last_name) || draft.full_name);

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid="roster-mapping-editor">
      <div className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: src.color }} data-testid={`roster-mapping-source-${plan.mapping_source}`}>
        <src.icon className="w-4 h-4" /> {src.text}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {FIELDS.map(f => (
          <label key={f.key} className="block">
            <span className="text-[11px] font-bold text-[var(--t4)] uppercase tracking-wider block mb-1">{f.label}</span>
            <select
              value={draft[f.key] || ''}
              onChange={e => setDraft({ ...draft, [f.key]: e.target.value || null })}
              className="w-full rounded-lg px-3 py-2.5 text-base"
              style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--t)' }}
              data-testid={`roster-map-${f.key}`}
            >
              <option value="">— not in this file —</option>
              {plan.headers.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
        <p className="text-xs text-[var(--t5)]">
          {plan.row_count} data row{plan.row_count === 1 ? '' : 's'} in <span className="text-[var(--t3)]">{plan.filename}</span>.
          Use First + Last name, or a single Full name column.
        </p>
        <Button size="sm" className="gold-button text-xs" disabled={!dirty || !complete || busy === 'remap'} onClick={() => onRemap(draft)} data-testid="roster-remap-btn">
          {busy === 'remap' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply columns'}
        </Button>
      </div>
    </div>
  );
};
