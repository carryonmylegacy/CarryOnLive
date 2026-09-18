import React, { useState } from 'react';
import { FileStack, Loader2, Trash2, Upload, FolderOpen, Save, CalendarClock, X } from 'lucide-react';
import { easternToIso, fmtEastern, isoToEasternInput } from './SiteCopySchedule';

const when = (iso) => { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return iso; } };
const who = (email) => (email || '').split('@')[0] || 'unknown';
const pagesOf = (draft, fieldByKey) => [...new Set(Object.keys(draft.changes).map(k => fieldByKey[k]?.page.label).filter(Boolean))];
const smallBtn = (accent) => `inline-flex items-center gap-1 flex-shrink-0 text-xs font-bold disabled:opacity-40 ${accent ? 'text-[var(--gold)] hover:underline' : 'text-[var(--t4)] hover:text-[var(--t)]'}`;
const inputClass = 'px-3 py-1.5 rounded-lg bg-[var(--s)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)]';
const nextHourInput = () => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return isoToEasternInput(d.toISOString()); };

/** "Publish at (ET)" — one draft publishes itself at a chosen time. */
const ScheduleRow = ({ draft, busy, onSchedule, index }) => {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(() => (draft.publish_at ? isoToEasternInput(draft.publish_at) : nextHourInput()));
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!when) return setError('Pick a date and time.');
    const iso = easternToIso(when);
    if (iso <= new Date().toISOString()) return setError('Pick a time in the future — or press Publish to publish now.');
    setError('');
    if (await onSchedule(draft.id, iso)) setOpen(false);
  };
  if (draft.publishing_at) return <p className="text-xs font-bold text-[#22C993] mt-1" data-testid={`site-copy-draft-publishing-${index}`}>Publishing now…</p>;
  return (
    <div className="mt-1.5">
      {draft.publish_at && !open && (
        <p className="flex items-center gap-2 text-xs flex-wrap" data-testid={`site-copy-draft-scheduled-${index}`}>
          <span className="font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}><CalendarClock className="w-3 h-3" /> Publishes {fmtEastern(draft.publish_at)}</span>
          <span className="text-[var(--t5)]">set by {who(draft.scheduled_by)}</span>
          <button type="button" disabled={busy} onClick={() => setOpen(true)} className={smallBtn(false)} data-testid={`site-copy-draft-reschedule-${index}`}>Change</button>
          <button type="button" disabled={busy} onClick={() => onSchedule(draft.id, null)} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--t4)] hover:text-[#ef4444] disabled:opacity-40" data-testid={`site-copy-draft-unschedule-${index}`}><X className="w-3 h-3" /> Cancel schedule</button>
        </p>
      )}
      {!draft.publish_at && !open && (
        <button type="button" disabled={busy} onClick={() => setOpen(true)} className={smallBtn(false)} data-testid={`site-copy-draft-schedule-${index}`}><CalendarClock className="w-3 h-3" /> Publish at (ET)…</button>
      )}
      {open && (
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2 mt-1" data-testid={`site-copy-draft-schedule-form-${index}`}>
          <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className={`${inputClass} text-base`} style={{ colorScheme: 'dark' }} data-testid={`site-copy-draft-publish-at-${index}`} />
          <span className="text-xs text-[var(--t5)]">US Eastern · you get the alert e-mail when it goes live</span>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40" style={{ background: 'var(--gold)', color: '#0F1629' }} data-testid={`site-copy-draft-schedule-submit-${index}`}>
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarClock className="w-3 h-3" />} Set
          </button>
          <button type="button" onClick={() => { setOpen(false); setError(''); }} className={smallBtn(false)} data-testid={`site-copy-draft-schedule-cancel-${index}`}>Cancel</button>
          {error && <span className="text-xs font-bold text-[#f59e0b]" data-testid={`site-copy-draft-schedule-error-${index}`}>{error}</span>}
        </form>
      )}
    </div>
  );
};

/** Save-bar panel: named sets of unsaved wording changes — save, reopen, publish in one press, delete. */
export const DraftsPanel = ({ drafts, activeId, pendingCount, fieldByKey, busy, onSaveNew, onUpdate, onOpen, onPublish, onDelete, onSchedule }) => {
  const [name, setName] = useState('');
  const active = drafts.find(d => d.id === activeId);
  const submit = (e) => { e.preventDefault(); if (name.trim()) { onSaveNew(name.trim()); setName(''); } };
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid="site-copy-drafts">
      <div className="flex items-center gap-2 mb-1">
        <FileStack className="w-4 h-4 text-[var(--gold)]" />
        <h4 className="text-sm font-bold text-[var(--t)]">Drafts</h4>
        <span className="text-xs font-bold text-[var(--t4)] ml-auto">{drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'}</span>
      </div>
      <p className="text-xs text-[var(--t4)] mb-3">A draft is a named set of wording changes that is not live yet. Open one to keep working on it — Preview and Review work on the draft — then press Publish to make every field in it live in one go, or set a time and it publishes itself (times are US Eastern). A draft can hold fields from more than one page.</p>

      {pendingCount > 0 && (
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2 mb-3 rounded-lg p-3" style={{ background: 'var(--b)', border: '1px solid rgba(212,175,55,0.4)' }} data-testid="site-copy-draft-form">
          <span className="text-xs font-bold text-[var(--t)]">{pendingCount} unsaved {pendingCount === 1 ? 'change' : 'changes'} →</span>
          {active && (
            <button type="button" disabled={busy} onClick={() => onUpdate(active.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40" style={{ background: 'var(--gold)', color: '#0F1629' }} data-testid="site-copy-draft-update">
              <Save className="w-3 h-3" /> Update “{active.name}”
            </button>
          )}
          <input type="text" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder={active ? 'or save as a new draft…' : 'Draft name — e.g. Fall pricing wording'}
            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-[var(--s)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)]" data-testid="site-copy-draft-name" />
          <button type="submit" disabled={busy || !name.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40" style={{ background: active ? 'var(--b2)' : 'var(--gold)', color: active ? 'var(--t)' : '#0F1629' }} data-testid="site-copy-draft-save">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileStack className="w-3 h-3" />} Save as draft
          </button>
        </form>
      )}
      {!pendingCount && !drafts.length && <p className="text-sm text-[var(--t4)]" data-testid="site-copy-drafts-empty">No drafts yet. Make an edit, then save it here under a name.</p>}

      <div className="divide-y divide-[var(--b)]">
        {drafts.map((d, i) => {
          const isActive = d.id === activeId;
          return (
            <div key={d.id} className="py-2.5 text-xs" data-testid={`site-copy-draft-row-${i}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-[var(--t)] truncate" data-testid={`site-copy-draft-title-${i}`}>{d.name}</span>
                  {isActive && <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--gold)' }} data-testid={`site-copy-draft-open-chip-${i}`}>Open in editor</span>}
                </p>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {!isActive && (
                    <button type="button" disabled={busy} onClick={() => onOpen(d.id)} className={smallBtn(false)} data-testid={`site-copy-draft-open-${i}`}><FolderOpen className="w-3 h-3" /> Open</button>
                  )}
                  <button type="button" disabled={busy} onClick={() => onPublish(d.id)} className={smallBtn(true)} data-testid={`site-copy-draft-publish-${i}`}><Upload className="w-3 h-3" /> Publish</button>
                  <button type="button" disabled={busy} onClick={() => onDelete(d.id)} className="inline-flex items-center gap-1 flex-shrink-0 text-xs font-bold text-[var(--t4)] hover:text-[#ef4444] disabled:opacity-40" data-testid={`site-copy-draft-delete-${i}`}><Trash2 className="w-3 h-3" /> Delete</button>
                </div>
              </div>
              <p className="text-[var(--t4)] mt-0.5">
                {d.count} {d.count === 1 ? 'field' : 'fields'} · {pagesOf(d, fieldByKey).join(', ') || '—'} · {who(d.updated_by)} {when(d.updated_at)}
                {d.created_by && d.created_by !== d.updated_by && <span> · started by {who(d.created_by)}</span>}
              </p>
              <ScheduleRow key={d.publish_at || 'none'} draft={d} busy={busy} onSchedule={onSchedule} index={i} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
