import React, { useState, useRef, useEffect } from 'react';
import { ArrowDownAZ, ChevronDown, Check } from 'lucide-react';

/**
 * SortControl — small dropdown button rendered in the upper-right of
 * data lists across the platform (Beneficiaries, Milestone Messages,
 * DTS tasks, Go-Bag, CFP entities/accounts/bills, etc).
 *
 * Single source of truth for the sort affordance — same icon, same
 * positioning, same selected-tick style on every surface so the user
 * doesn't have to re-learn the UI per page.
 *
 * Usage:
 *   <SortControl
 *     value={sortKey}                 // 'name_asc'
 *     onChange={setSortKey}
 *     options={[
 *       { value: 'name_asc',  label: 'Name (A→Z)'    },
 *       { value: 'name_desc', label: 'Name (Z→A)'    },
 *       { value: 'created_desc', label: 'Newest first' },
 *       { value: 'created_asc',  label: 'Oldest first' },
 *       { value: 'modified_desc',label: 'Recently modified' },
 *     ]}
 *   />
 */
export default function SortControl({ value, onChange, options, label = 'Sort', testId = 'sort-control' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={wrapRef} className="relative" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
        style={{
          background: open ? 'var(--s)' : 'transparent',
          border: '1px solid var(--b)',
          color: 'var(--t3)',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={`${testId}-button`}
      >
        <ArrowDownAZ className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} />
        <span className="hidden sm:inline">{label}:</span>
        <span style={{ color: 'var(--t)' }}>{selected?.label || 'Default'}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 z-50 rounded-xl py-1 min-w-[200px] shadow-2xl"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
          data-testid={`${testId}-menu`}
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-[var(--s)]"
              style={{ color: value === opt.value ? 'var(--gold)' : 'var(--t)' }}
              data-testid={`${testId}-option-${opt.value}`}
            >
              <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                {value === opt.value && <Check className="w-3.5 h-3.5" />}
              </span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Common sort comparator factory — keeps the comparator logic in one
 * place so every list applies the same rules (e.g., null dates sort
 * last, names use locale-aware compare).
 */
export function makeSorter(sortKey, fieldMap = {}) {
  const {
    name = (x) => x.name || x.title || '',
    createdAt = (x) => x.created_at || x.created || '',
    updatedAt = (x) => x.updated_at || x.modified_at || x.last_modified || '',
  } = fieldMap;

  const cmpStr = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
  const cmpDate = (a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return new Date(a).getTime() - new Date(b).getTime();
  };

  return (a, b) => {
    switch (sortKey) {
      case 'name_desc':     return -cmpStr(name(a), name(b));
      case 'created_asc':   return cmpDate(createdAt(a), createdAt(b));
      case 'created_desc':  return -cmpDate(createdAt(a), createdAt(b));
      case 'modified_desc': return -cmpDate(updatedAt(a), updatedAt(b));
      case 'modified_asc':  return cmpDate(updatedAt(a), updatedAt(b));
      case 'name_asc':
      default:              return cmpStr(name(a), name(b));
    }
  };
}
