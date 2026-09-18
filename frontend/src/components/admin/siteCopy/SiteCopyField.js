import React, { useState } from 'react';
import { Lock, RotateCcw, History, CalendarClock, AlertTriangle } from 'lucide-react';
import { FieldHistory } from './SiteCopyHistory';
import { ScheduleForm, FieldSchedules, StatusChip } from './SiteCopySchedule';
import { FieldIssues } from './SiteCopyReview';

const SEO_LIMITS = { title: 60, description: 160 };
const inputClass = 'w-full px-3 py-2 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base leading-relaxed focus:outline-none focus:border-[var(--gold)]';
const hintFor = (field) => (field.list ? 'One item per line.' : field.blocks ? 'One paragraph per line; start a line with "- " for a bullet.' : null);
const iconBtn = (on) => `inline-flex items-center gap-1 text-xs font-bold transition-colors ${on ? 'text-[var(--gold)]' : 'text-[var(--t4)] hover:text-[var(--gold)]'}`;

/** One editable copy field: label, current text, edited/locked state, reset, history, schedules, review flags. */
export const SiteCopyField = ({ field, value, savedValue, onChange, history = [], onRestore, restoring, schedules = [], onSchedule, onDeleteSchedule, issues = [], onApplyFix }) => {
  const [showHistory, setShowHistory] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const isDefault = value === field.d;
  const isEdited = !!savedValue && savedValue !== field.d;
  const isDirty = value !== (savedValue || field.d);
  const live = schedules.find(s => s.status === 'active');
  const seoKind = field.k.includes('.seo.') ? (field.k.endsWith('.title') ? 'title' : 'description') : null;
  const limit = seoKind ? SEO_LIMITS[seoKind] : null;
  const rows = Math.min(field.blocks ? 14 : 8, Math.max(2, Math.ceil(value.length / 90) + (value.split('\n').length - 1)));
  const hint = hintFor(field);
  const submitSchedule = async (payload) => { if (await onSchedule(payload)) setShowSchedule(false); };

  return (
    <div className="py-3 border-t border-[var(--b)] first:border-t-0" id={`copy-field-${field.k}`} data-testid={`copy-field-${field.k}`}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <label className="text-xs font-bold text-[var(--t4)] leading-snug">{field.label}</label>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          {field.locked && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--t5)]" title="Official name — platform law" data-testid={`copy-locked-${field.k}`}>
              <Lock className="w-3 h-3" /> Locked
            </span>
          )}
          {issues.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-[#f59e0b]" title={issues.map(i => i.message).join('\n')} data-testid={`copy-issue-marker-${field.k}`}>
              <AlertTriangle className="w-3 h-3" /> {issues.length}
            </span>
          )}
          {live && <StatusChip status="active" k={field.k} />}
          {!field.locked && isDirty && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--gold)' }} data-testid={`copy-dirty-${field.k}`}>Unsaved</span>
          )}
          {!field.locked && !isDirty && isEdited && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,201,147,0.15)', color: '#22C993' }} data-testid={`copy-edited-${field.k}`}>Edited</span>
          )}
          {history.length > 0 && (
            <button type="button" onClick={() => setShowHistory(s => !s)} className={iconBtn(showHistory)} title="Change history" data-testid={`copy-history-toggle-${field.k}`}>
              <History className="w-3 h-3" /> {history.length}
            </button>
          )}
          {!field.locked && (
            <button type="button" onClick={() => setShowSchedule(s => !s)} className={iconBtn(showSchedule || schedules.length > 0)} title="Schedule a wording change" data-testid={`copy-schedule-toggle-${field.k}`}>
              <CalendarClock className="w-3 h-3" /> {schedules.length > 0 ? schedules.length : ''}
            </button>
          )}
          {!field.locked && !isDefault && (
            <button type="button" onClick={() => onChange(field.d)} className={iconBtn(false)} data-testid={`copy-reset-${field.k}`}>
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
        <div className="min-w-0">
          {hint && !field.locked && <p className="text-xs text-[var(--t5)]">{hint}</p>}
          {!field.locked && !isDefault && (
            <p className="text-xs text-[var(--t5)] leading-snug break-words whitespace-pre-wrap">Default: <span className="italic">{field.d}</span></p>
          )}
          {live && <p className="text-xs font-bold text-[#22C993]" data-testid={`copy-live-note-${field.k}`}>Visitors currently see the scheduled text below, not this saved text.</p>}
        </div>
        {limit && (
          <span className={`text-xs font-bold flex-shrink-0 ${value.length > limit ? 'text-[#f59e0b]' : 'text-[var(--t5)]'}`} data-testid={`copy-count-${field.k}`}>
            {value.length}/{limit}
          </span>
        )}
      </div>
      {issues.length > 0 && <FieldIssues issues={issues} onApplyFix={onApplyFix} k={field.k} />}
      {showHistory && <FieldHistory entries={history} current={savedValue} onRestore={onRestore} restoring={restoring} k={field.k} />}
      {showSchedule && <ScheduleForm field={field} initialText={value} onSubmit={submitSchedule} onCancel={() => setShowSchedule(false)} busy={restoring} />}
      {schedules.length > 0 && <FieldSchedules schedules={schedules} onDelete={onDeleteSchedule} busy={restoring} k={field.k} />}
    </div>
  );
};
