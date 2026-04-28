import React from 'react';
import { Clock, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '../ui/button';

export const ResetTrialModal = ({
  resetTarget,
  handleResetTrial,
  resetting,
  onCancel,
}) => {
  if (!resetTarget) return null;

  let prevTrialLabel = null;
  if (resetTarget.trial_ends_at) {
    try {
      const d = new Date(resetTarget.trial_ends_at);
      prevTrialLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      prevTrialLabel = null;
    }
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-4 animate-fade-in"
        style={{
          background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(15,22,41,0.98) 40%)',
          border: '1.5px solid rgba(212,175,55,0.3)',
          boxShadow: '0 0 40px rgba(212,175,55,0.08)',
        }}
        data-testid="reset-trial-modal"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)' }}>
            <Clock className="w-5 h-5 text-[var(--gold)]" />
          </div>
          <div>
            <h3 className="text-white font-bold text-base" style={{ fontFamily: 'var(--sans)' }}>Reset Free Trial</h3>
            <p className="text-[var(--t5)] text-[11px]">Logged to activity for audit</p>
          </div>
        </div>

        <div className="p-3 rounded-xl" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.12)' }}>
          <p className="text-sm text-[var(--t3)]">
            Restart the 30-day free trial for <strong className="text-white">{resetTarget.name}</strong> ({resetTarget.role})?
          </p>
          <div className="mt-2 space-y-1 text-[11px] text-[var(--t5)]">
            {prevTrialLabel && (
              <div className="flex items-center justify-between">
                <span>Current trial ends</span>
                <span className="text-[var(--t4)] font-medium">{prevTrialLabel}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span>New trial ends</span>
              <span className="text-[var(--gold)] font-medium">
                {(() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 30);
                  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                })()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Subscription status</span>
              <span className="text-[var(--t4)] font-medium">→ trialing</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="ghost"
            className="flex-1 text-[var(--t4)] hover:bg-[var(--s)] hover:text-current"
            onClick={onCancel}
            disabled={resetting}
            data-testid="reset-trial-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            className="flex-1 font-bold btn-gold-cta"
            onClick={handleResetTrial}
            disabled={resetting}
            data-testid="reset-trial-confirm-btn"
          >
            {resetting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
            Reset 30-Day Trial
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ResetTrialModal;
