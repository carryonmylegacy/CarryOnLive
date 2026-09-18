import React, { useState } from 'react';
import { CalendarClock, Trash2, Loader2, Mail } from 'lucide-react';

/* All schedule times are entered and shown in US Eastern (founder directive); stored as UTC ISO. */
export const ET_ZONE = 'America/New_York';
const partsAt = (ms) => {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: ET_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  return Object.fromEntries(dtf.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
};
const offsetAt = (ms) => {
  const p = partsAt(ms);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(ms / 60000) * 60000;
};
/** 'YYYY-MM-DDTHH:mm' typed as US Eastern → ISO-8601 UTC (DST-aware). */
export const easternToIso = (local) => {
  const [y, mo, d, h, mi] = local.split(/[-T:]/).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return new Date(guess - offsetAt(guess - offsetAt(guess))).toISOString();
};
/** ISO UTC → 'YYYY-MM-DDTHH:mm' in US Eastern (for datetime-local inputs). */
export const isoToEasternInput = (iso) => {
  const p = partsAt(new Date(iso).getTime());
  return `${p.year}-${p.month}-${p.day}T${String(+p.hour % 24).padStart(2, '0')}:${p.minute}`;
};
export const fmtEastern = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: ET_ZONE, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const nextHourInput = () => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return isoToEasternInput(d.toISOString()); };

const STATUS = {
  upcoming: { label: 'Upcoming', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  active: { label: 'Live now', color: '#22C993', bg: 'rgba(34,201,147,0.15)' },
  ended: { label: 'Ended', color: 'var(--t4)', bg: 'var(--b2)' },
};
export const StatusChip = ({ status, k }) => {
  const s = STATUS[status] || STATUS.upcoming;
  return <span className="text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: s.bg, color: s.color }} data-testid={`copy-schedule-status-${k}`}>{s.label}</span>;
};
const inputClass = 'w-full px-3 py-2 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)]';
const windowText = (s) => `${fmtEastern(s.start_at)} → ${s.end_at ? fmtEastern(s.end_at) : 'until removed'}`;

/** "Schedule this text" form under a field: text, go-live, optional revert, note — all US Eastern. */
export const ScheduleForm = ({ field, initialText, onSubmit, onCancel, busy }) => {
  const [text, setText] = useState(initialText);
  const [start, setStart] = useState(nextHourInput);
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!start) return setError('Pick a go-live date and time.');
    if (end && end <= start) return setError('The revert time must be after the go-live time.');
    setError('');
    onSubmit({ key: field.k, value: text, start_at: easternToIso(start), end_at: end ? easternToIso(end) : null, note });
  };
  return (
    <form onSubmit={submit} className="mt-2 rounded-lg p-3 space-y-2.5" style={{ background: 'var(--b)', border: '1px solid rgba(212,175,55,0.4)' }} data-testid={`copy-schedule-form-${field.k}`}>
      <p className="text-xs font-bold text-[var(--gold)] inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Schedule this text · times are US Eastern</p>
      <div>
        <label className="text-xs font-bold text-[var(--t4)]">Text to show during the window</label>
        <textarea value={text} rows={Math.min(6, Math.max(2, Math.ceil(text.length / 90)))} onChange={e => setText(e.target.value)} className={`${inputClass} text-base resize-y mt-1`} data-testid={`copy-schedule-text-${field.k}`} />
        <p className="text-xs text-[var(--t5)] mt-0.5">Leave empty to show the built-in default during the window. The saved text comes back automatically when the window ends.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <div>
          <label className="text-xs font-bold text-[var(--t4)]">Go live (ET)</label>
          <input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} className={`${inputClass} mt-1`} style={{ colorScheme: 'dark' }} data-testid={`copy-schedule-start-${field.k}`} />
        </div>
        <div>
          <label className="text-xs font-bold text-[var(--t4)]">Revert (ET, optional)</label>
          <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className={`${inputClass} mt-1`} style={{ colorScheme: 'dark' }} data-testid={`copy-schedule-end-${field.k}`} />
        </div>
      </div>
      <input type="text" value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="Note (optional) — e.g. Memorial Day wording" className={`${inputClass} text-base`} data-testid={`copy-schedule-note-${field.k}`} />
      {error && <p className="text-xs font-bold text-[#f59e0b]" data-testid={`copy-schedule-error-${field.k}`}>{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--t4)] hover:text-[var(--t)]" data-testid={`copy-schedule-cancel-${field.k}`}>Cancel</button>
        <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40" style={{ background: 'var(--gold)', color: '#0F1629' }} data-testid={`copy-schedule-submit-${field.k}`}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarClock className="w-3 h-3" />} Schedule
        </button>
      </div>
    </form>
  );
};

/** Existing schedules for one field (chips under the input). */
export const FieldSchedules = ({ schedules, onDelete, busy, k }) => (
  <div className="mt-2 space-y-1.5" data-testid={`copy-schedules-${k}`}>
    {schedules.map(s => (
      <div key={s.id} className="flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--b)', border: '1px solid var(--b2)' }} data-testid={`copy-schedule-row-${s.id}`}>
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusChip status={s.status} k={s.id} />
            <span className="font-bold text-[var(--t4)]">{windowText(s)}</span>
            {s.note && <span className="text-[var(--t5)] italic">— {s.note}</span>}
          </div>
          <p className="text-[var(--t3)] whitespace-pre-wrap break-words leading-snug">{s.value || <span className="italic opacity-70">(built-in default)</span>}</p>
        </div>
        <button type="button" disabled={busy} onClick={() => onDelete(s.id)} className="inline-flex items-center gap-1 flex-shrink-0 font-bold text-[var(--t4)] hover:text-[#ef4444] disabled:opacity-40" data-testid={`copy-schedule-remove-${s.id}`}>
          <Trash2 className="w-3 h-3" /> Remove
        </button>
      </div>
    ))}
  </div>
);

/** Save-bar panel: every scheduled wording change across the site. */
export const SchedulesPanel = ({ schedules, fieldByKey, onDelete, onJump, busy, alertsEnabled, onToggleAlerts }) => (
  <div className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid="site-copy-schedules">
    <div className="flex items-center gap-2 mb-1">
      <CalendarClock className="w-4 h-4 text-[var(--gold)]" />
      <h4 className="text-sm font-bold text-[var(--t)]">Scheduled copy</h4>
      <span className="text-xs font-bold text-[var(--t4)] ml-auto">{schedules.length} {schedules.length === 1 ? 'schedule' : 'schedules'}</span>
    </div>
    <p className="text-xs text-[var(--t4)] mb-3">Text goes live at the start time and the saved text returns at the end time — automatically, no redeploy. Times are US Eastern. To add one, use the calendar icon on any field.</p>
    <label className="flex items-start gap-3 rounded-lg px-3 py-2.5 mb-3 cursor-pointer" style={{ background: 'var(--b)', border: '1px solid var(--b2)' }} data-testid="site-copy-alerts-row">
      <input type="checkbox" checked={!!alertsEnabled} onChange={onToggleAlerts} className="mt-0.5 w-4 h-4 accent-[var(--gold)]" data-testid="site-copy-alerts-toggle" />
      <span className="text-xs text-[var(--t4)] leading-snug">
        <span className="font-bold text-[var(--t)] inline-flex items-center gap-1"><Mail className="w-3 h-3 text-[var(--gold)]" /> E-mail me when a schedule goes live or reverts</span><br />
        Every founder account gets the before/after text and a link to the live page, within a minute of the change.
      </span>
    </label>
    {!schedules.length && <p className="text-sm text-[var(--t4)]" data-testid="site-copy-schedules-empty">Nothing scheduled.</p>}
    <div className="divide-y divide-[var(--b)]">
      {schedules.map((s, i) => {
        const field = fieldByKey[s.key];
        return (
          <div key={s.id} className="py-2.5 text-xs" data-testid={`site-copy-schedule-row-${i}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <StatusChip status={s.status} k={`panel-${i}`} />
                <button type="button" onClick={() => onJump(s.key)} className="font-bold text-[var(--t)] hover:text-[var(--gold)] underline-offset-2 hover:underline truncate" data-testid={`site-copy-schedule-jump-${i}`}>
                  {field ? `${field.page.label} › ${field.section.label} › ${field.label}` : s.key}
                </button>
              </div>
              <button type="button" disabled={busy} onClick={() => onDelete(s.id)} className="inline-flex items-center gap-1 flex-shrink-0 font-bold text-[var(--t4)] hover:text-[#ef4444] disabled:opacity-40" data-testid={`site-copy-schedule-remove-${i}`}>
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </div>
            <p className="font-bold text-[var(--t4)] mt-0.5">{windowText(s)}{s.note && <span className="text-[var(--t5)] italic font-normal"> — {s.note}</span>}</p>
            <p className="text-[var(--t3)] break-words">{s.value || <span className="italic opacity-70">(built-in default)</span>}</p>
          </div>
        );
      })}
    </div>
  </div>
);
