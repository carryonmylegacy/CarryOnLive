import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * VisibilityTimingPills — top-of-form widget that shows the benefactor
 * exactly when the beneficiary will see this record.
 *
 * Mission: today the visibility timing flags (`pre`, `post`) silently
 * default to `{pre:false, post:true}` deep inside the BeneficiaryDesignator.
 * The benefactor never confirms it. This component surfaces those flags
 * at the TOP of every form so there's no ambiguity about who-sees-what-when.
 *
 * Props:
 *   timing : { pre?: bool, post?: bool }
 *   onChange : (newTiming) => void
 *   recordKind : 'bill' | 'debt' | 'account' | 'asset'  (just for copy)
 */
export const VisibilityTimingPills = ({ timing = {}, onChange, recordKind = 'bill' }) => {
  const pre = timing.pre === true;
  const post = timing.post !== false;  // default true

  const toggle = (key) => {
    const next = { ...timing, [key]: !timing[key] };
    // If user disables both, snap back to "post-only" — at least one must
    // be on or this record is invisible to all beneficiaries forever.
    if (next.pre === false && next.post === false) next.post = true;
    onChange(next);
  };

  const pillClass = (active) =>
    `flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
      active
        ? 'border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]'
        : 'border-[var(--b)] bg-transparent text-[var(--t4)]'
    }`;

  return (
    <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(var(--gold-rgb), 0.04)', border: '1px solid rgba(var(--gold-rgb), 0.18)' }}>
      <div className="text-[11px] font-bold text-[var(--t)] uppercase tracking-wider mb-2">
        Who sees this {recordKind}, and when?
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => toggle('pre')}
          className={pillClass(pre)}
          data-testid="visibility-pre-toggle"
          aria-pressed={pre}
        >
          {pre ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          Beneficiary sees NOW (pre-transition)
        </button>
        <button
          type="button"
          onClick={() => toggle('post')}
          className={pillClass(post)}
          data-testid="visibility-post-toggle"
          aria-pressed={post}
        >
          {post ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          Beneficiary sees AFTER transition
        </button>
      </div>
      {!pre && post && (
        <p className="text-[11px] text-[var(--t4)] mt-2 leading-snug">
          Hidden from beneficiaries until the estate transitions. They'll see it then.
        </p>
      )}
      {pre && post && (
        <p className="text-[11px] text-[var(--t4)] mt-2 leading-snug">
          Visible to designated beneficiaries immediately and after transition.
        </p>
      )}
      {pre && !post && (
        <p className="text-[11px] text-[var(--t4)] mt-2 leading-snug">
          Shared now but hidden after transition (rare — typically a temporary share).
        </p>
      )}
    </div>
  );
};

export default VisibilityTimingPills;
