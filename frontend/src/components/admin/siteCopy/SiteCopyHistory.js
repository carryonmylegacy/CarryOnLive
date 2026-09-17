import React from 'react';
import { RotateCcw, Clock } from 'lucide-react';

const when = (iso) => {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return iso; }
};
const who = (email) => (email || '').split('@')[0] || 'unknown';
const show = (text) => (text ? text : <span className="italic opacity-70">(default text)</span>);

/** Timeline for one field: every saved version, newest first, with one-click restore. */
export const FieldHistory = ({ entries, current, onRestore, restoring, k }) => {
  if (!entries.length) return null;
  const versions = entries.map(e => ({ id: e.id, at: e.at, actor: e.actor_email, text: e.next }));
  const oldest = entries[entries.length - 1];
  versions.push({ id: `${oldest.id}-before`, at: oldest.at, actor: '', text: oldest.previous, before: true });
  return (
    <div className="mt-2 rounded-lg p-3 space-y-2" style={{ background: 'var(--b)', border: '1px solid var(--b2)' }} data-testid={`copy-history-${k}`}>
      {versions.map((v, i) => {
        const isCurrent = (v.text || '') === (current || '');
        return (
          <div key={v.id} className="flex items-start justify-between gap-3 text-xs" data-testid={`copy-history-row-${k}-${i}`}>
            <div className="min-w-0">
              <p className="font-bold text-[var(--t4)]">
                {v.before ? 'Before the first change' : `${when(v.at)} · ${who(v.actor)}`}
                {isCurrent && <span className="ml-2 px-1.5 py-0.5 rounded text-[#22C993]" style={{ background: 'rgba(34,201,147,0.15)' }}>Current</span>}
              </p>
              <p className="text-[var(--t3)] whitespace-pre-wrap break-words leading-snug mt-0.5">{show(v.text)}</p>
            </div>
            {!isCurrent && (
              <button type="button" disabled={restoring} onClick={() => onRestore(k, v.text)}
                className="inline-flex items-center gap-1 flex-shrink-0 font-bold text-[var(--gold)] hover:underline disabled:opacity-40" data-testid={`copy-history-restore-${k}-${i}`}>
                <RotateCcw className="w-3 h-3" /> Restore
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** Recent changes across every page (save-bar panel). */
export const RecentChanges = ({ entries, fieldByKey, currentOf, onRestore, restoring, onJump }) => (
  <div className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid="site-copy-recent">
    <div className="flex items-center gap-2 mb-3">
      <Clock className="w-4 h-4 text-[var(--gold)]" />
      <h4 className="text-sm font-bold text-[var(--t)]">Recent changes</h4>
      <span className="text-xs font-bold text-[var(--t4)] ml-auto">{entries.length} shown</span>
    </div>
    {!entries.length && <p className="text-sm text-[var(--t4)]">No changes saved yet.</p>}
    <div className="divide-y divide-[var(--b)]">
      {entries.map((e, i) => {
        const field = fieldByKey[e.key];
        const canRestore = (e.previous || '') !== (currentOf(e.key) || '');
        return (
          <div key={e.id} className="py-2.5 text-xs" data-testid={`site-copy-recent-row-${i}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold text-[var(--t4)] truncate">
                {when(e.at)} · {who(e.actor_email)} ·{' '}
                <button type="button" onClick={() => onJump(e.key)} className="text-[var(--t)] hover:text-[var(--gold)] underline-offset-2 hover:underline" data-testid={`site-copy-recent-jump-${i}`}>
                  {field ? `${field.page.label} › ${field.section.label} › ${field.label}` : e.key}
                </button>
              </p>
              {canRestore && (
                <button type="button" disabled={restoring} onClick={() => onRestore(e.key, e.previous)}
                  className="inline-flex items-center gap-1 flex-shrink-0 font-bold text-[var(--gold)] hover:underline disabled:opacity-40" data-testid={`site-copy-recent-restore-${i}`}>
                  <RotateCcw className="w-3 h-3" /> Restore previous
                </button>
              )}
            </div>
            <p className="text-[var(--t5)] line-through break-words mt-0.5">{show(e.previous)}</p>
            <p className="text-[var(--t3)] break-words">{show(e.next)}</p>
          </div>
        );
      })}
    </div>
  </div>
);
