import React from 'react';
import { ChevronDown } from 'lucide-react';
import { SiteCopyField } from './SiteCopyField';

/** Collapsible group of fields (one page section). Always open while searching. */
export const SiteCopySection = ({ section, fields, open, onToggle, forceOpen, valueOf, savedOf, onChange }) => {
  const editedCount = fields.filter(f => !f.locked && savedOf(f.k)).length;
  const dirtyCount = fields.filter(f => !f.locked && valueOf(f.k) !== (savedOf(f.k) || f.d)).length;
  const isOpen = forceOpen || open;
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid={`copy-section-${section.key}`}>
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={isOpen} data-testid={`copy-section-toggle-${section.key}`}>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--t)] truncate">{section.label}</p>
          <p className="text-xs text-[var(--t4)]">
            {fields.length} {fields.length === 1 ? 'field' : 'fields'}
            {editedCount > 0 && <span className="text-[#22C993] font-bold"> · {editedCount} edited</span>}
            {dirtyCount > 0 && <span className="text-[var(--gold)] font-bold"> · {dirtyCount} unsaved</span>}
          </p>
        </div>
        {!forceOpen && <ChevronDown className={`w-4 h-4 text-[var(--gold)] flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
      </button>
      {isOpen && (
        <div className="px-4 pb-3" style={{ borderTop: '1px solid var(--b)' }}>
          {fields.map(f => (
            <SiteCopyField key={f.k} field={f} value={valueOf(f.k)} savedValue={savedOf(f.k)} onChange={v => onChange(f.k, v)} />
          ))}
        </div>
      )}
    </div>
  );
};
