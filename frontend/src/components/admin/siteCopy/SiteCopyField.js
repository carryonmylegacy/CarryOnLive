import React from 'react';
import { Lock, RotateCcw } from 'lucide-react';

const SEO_LIMITS = { title: 60, description: 160 };
const inputClass = 'w-full px-3 py-2 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base leading-relaxed focus:outline-none focus:border-[var(--gold)]';

/** One editable copy field: label, current text, edited/locked state, reset-to-default. */
export const SiteCopyField = ({ field, value, savedValue, onChange }) => {
  const isDefault = value === field.d;
  const isEdited = !!savedValue && savedValue !== field.d;
  const isDirty = value !== (savedValue || field.d);
  const seoKind = field.k.includes('.seo.') ? (field.k.endsWith('.title') ? 'title' : 'description') : null;
  const limit = seoKind ? SEO_LIMITS[seoKind] : null;
  const rows = Math.min(8, Math.max(2, Math.ceil(value.length / 90) + (value.split('\n').length - 1)));

  return (
    <div className="py-3 border-t border-[var(--b)] first:border-t-0" data-testid={`copy-field-${field.k}`}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <label className="text-xs font-bold text-[var(--t4)] leading-snug">{field.label}</label>
        <div className="flex items-center gap-2 flex-shrink-0">
          {field.locked && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--t5)]" title="Official name — platform law" data-testid={`copy-locked-${field.k}`}>
              <Lock className="w-3 h-3" /> Locked
            </span>
          )}
          {!field.locked && isDirty && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--gold)' }} data-testid={`copy-dirty-${field.k}`}>Unsaved</span>
          )}
          {!field.locked && !isDirty && isEdited && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,201,147,0.15)', color: '#22C993' }} data-testid={`copy-edited-${field.k}`}>Edited</span>
          )}
          {!field.locked && !isDefault && (
            <button type="button" onClick={() => onChange(field.d)} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--t4)] hover:text-[var(--gold)] transition-colors" data-testid={`copy-reset-${field.k}`}>
              <RotateCcw className="w-3 h-3" /> Reset to default
            </button>
          )}
        </div>
      </div>
      {field.locked ? (
        <div className="px-3 py-2 rounded-lg text-base text-[var(--t4)]" style={{ background: 'var(--b)', border: '1px dashed var(--b2)' }}>{field.d}</div>
      ) : field.multiline ? (
        <textarea value={value} rows={rows} onChange={e => onChange(e.target.value)} className={`${inputClass} resize-y`} data-testid={`copy-input-${field.k}`} />
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className={inputClass} data-testid={`copy-input-${field.k}`} />
      )}
      <div className="flex items-start justify-between gap-3 mt-1">
        {!field.locked && !isDefault ? (
          <p className="text-xs text-[var(--t5)] leading-snug break-words">Default: <span className="italic">{field.d}</span></p>
        ) : <span />}
        {limit && (
          <span className={`text-xs font-bold flex-shrink-0 ${value.length > limit ? 'text-[#f59e0b]' : 'text-[var(--t5)]'}`} data-testid={`copy-count-${field.k}`}>
            {value.length}/{limit}
          </span>
        )}
      </div>
    </div>
  );
};
