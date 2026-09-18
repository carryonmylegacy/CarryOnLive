import React from 'react';
import { SpellCheck, Loader2, X, Wand2, AlertTriangle, RefreshCw } from 'lucide-react';

const TYPE = {
  typo: { label: 'Typo', color: '#ef4444' },
  spacing: { label: 'Spacing', color: '#f59e0b' },
  punctuation: { label: 'Punctuation', color: '#f59e0b' },
  markup: { label: 'Markup', color: '#f59e0b' },
  placeholder: { label: 'Placeholder', color: '#ef4444' },
  seo: { label: 'Search length', color: '#f59e0b' },
  legal: { label: 'Advice tone', color: '#f97316' },
  empty: { label: 'Empty', color: 'var(--t4)' },
  llm: { label: 'Notice', color: 'var(--t4)' },
};
const TypeChip = ({ type }) => {
  const t = TYPE[type] || TYPE.llm;
  return <span className="text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: t.color, background: 'var(--b2)' }}>{t.label}</span>;
};
const FixButton = ({ issue, onApplyFix, testId }) => (
  <button type="button" onClick={() => onApplyFix(issue)} className="inline-flex items-center gap-1 flex-shrink-0 text-xs font-bold text-[var(--gold)] hover:underline" data-testid={testId}>
    <Wand2 className="w-3 h-3" /> Apply fix
  </button>
);

/** Amber marker + per-issue rows under a field that the last review flagged. */
export const FieldIssues = ({ issues, onApplyFix, k }) => (
  <div className="mt-2 space-y-1" data-testid={`copy-issues-${k}`}>
    {issues.map((issue, i) => (
      <div key={i} className="flex items-start justify-between gap-3 rounded-lg px-3 py-1.5 text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)' }} data-testid={`copy-issue-${k}-${i}`}>
        <p className="min-w-0 text-[var(--t3)] leading-snug inline-flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-[#f59e0b] flex-shrink-0 mt-px" /> <span><TypeChip type={issue.type} /> {issue.message}{issue.rewrite && <span className="block text-[var(--t4)] mt-0.5">Suggested: <span className="text-[#22C993]">{issue.rewrite}</span></span>}</span></p>
        {issue.fix !== undefined && <FixButton issue={issue} onApplyFix={onApplyFix} testId={`copy-issue-fix-${k}-${i}`} />}
      </div>
    ))}
  </div>
);

/** Save-bar panel: results of the one-click review (typos, spacing, markup, placeholders, SEO length). */
export const ReviewPanel = ({ review, running, fieldByKey, onJump, onApplyFix, onRerun, onClose, legal, onToggleLegal }) => {
  const issues = review?.issues || [];
  const notices = issues.filter(i => !i.key);
  const flagged = issues.filter(i => i.key);
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid="site-copy-review">
      <div className="flex items-center gap-2 mb-1">
        <SpellCheck className="w-4 h-4 text-[var(--gold)]" />
        <h4 className="text-sm font-bold text-[var(--t)]">Review</h4>
        {review && !running && (
          <button type="button" onClick={onRerun} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--t4)] hover:text-[var(--gold)] ml-2" data-testid="site-copy-review-rerun"><RefreshCw className="w-3 h-3" /> Run again</button>
        )}
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-[var(--t4)] cursor-pointer" title="Quote sentences that read as legal, tax or medical advice and suggest a softer rewrite">
          <input type="checkbox" checked={!!legal} disabled={running} onChange={onToggleLegal} className="w-3.5 h-3.5 accent-[var(--gold)]" data-testid="site-copy-review-legal" /> Flag legal-advice wording
        </label>
        <button type="button" onClick={onClose} className="text-[var(--t4)] hover:text-[var(--t)]" aria-label="Close review" data-testid="site-copy-review-close"><X className="w-4 h-4" /></button>
      </div>
      {running && (
        <p className="text-sm text-[var(--t4)] inline-flex items-center gap-2 py-2" data-testid="site-copy-review-running"><Loader2 className="w-4 h-4 animate-spin" /> Checking {review?.reviewed || ''} fields for typos, double spaces, stray markup and overlong page titles{legal ? ', plus any sentence that reads as legal, tax or medical advice' : ''}…</p>
      )}
      {!running && review && (
        <>
          <p className="text-xs text-[var(--t4)] mb-3" data-testid="site-copy-review-summary">
            {review.scope === 'edits' ? 'Your unsaved edits' : `Every field on ${review.label}`} — {review.reviewed} {review.reviewed === 1 ? 'field' : 'fields'} checked · <strong className="text-[var(--t)]">{flagged.length} {flagged.length === 1 ? 'issue' : 'issues'}</strong>
            {review.llm_used ? ' · AI typo pass included' : ' · automatic checks only'}{review.legal ? ' · legal-advice wording checked' : ''}. Fixes are placed in the editor as unsaved edits — nothing changes until you press Save.
          </p>
          {notices.map((n, i) => <p key={i} className="text-xs font-bold text-[#f59e0b] mb-2" data-testid={`site-copy-review-notice-${i}`}>{n.message}</p>)}
          {!flagged.length && <p className="text-sm font-bold text-[#22C993]" data-testid="site-copy-review-clean">No issues found.</p>}
          <div className="divide-y divide-[var(--b)]">
            {flagged.map((issue, i) => {
              const field = fieldByKey[issue.key];
              return (
                <div key={i} className="py-2 text-xs flex items-start justify-between gap-3" data-testid={`site-copy-review-row-${i}`}>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 flex-wrap">
                      <TypeChip type={issue.type} />
                      <button type="button" onClick={() => onJump(issue.key)} className="font-bold text-[var(--t)] hover:text-[var(--gold)] underline-offset-2 hover:underline truncate" data-testid={`site-copy-review-jump-${i}`}>
                        {field ? `${field.page.label} › ${field.section.label} › ${field.label}` : issue.key}
                      </button>
                    </p>
                    <p className="text-[var(--t3)] mt-0.5 break-words">{issue.message}</p>
                    {issue.rewrite && <p className="text-[var(--t4)] mt-0.5 break-words">Suggested: <span className="text-[#22C993]">{issue.rewrite}</span></p>}
                  </div>
                  {issue.fix !== undefined && <FixButton issue={issue} onApplyFix={onApplyFix} testId={`site-copy-review-fix-${i}`} />}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
