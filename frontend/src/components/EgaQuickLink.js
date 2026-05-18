/**
 * EgaQuickLink — bottom-RIGHT gold pill on the Readiness gauge box.
 *
 * Mirrors the EstateBinderButton on the left. Single tap → /guardian.
 * Below the icon we render a compact "Analyzed Xm" freshness stamp
 * (sourced from /api/guardian/iac-task-status → completed_at) so
 * demo prospects see at-a-glance when EGA last did real work.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';

// Compact "Xm" / "Xh" / "Xd" formatter — matches the BNDR stamp.
const fmt = (iso) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!t || isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
};

const EgaQuickLink = ({ testId = 'readiness-ega-quicklink' }) => {
  const navigate = useNavigate();
  const { getAuthHeaders } = useAuth();
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState(null);

  // One-shot hydrate. EGA tasks live in `db.ega_tasks`; the endpoint
  // returns the latest IAC generation task for the user's estate.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const headers = (getAuthHeaders() || {}).headers || {};
        const res = await fetch(`${API_URL}/guardian/iac-task-status`, { headers });
        if (!res.ok) return;
        const task = await res.json();
        // We want a successful completed run for "Analyzed X ago". A
        // running or errored task should not claim "analyzed" — show
        // nothing instead.
        if (alive && task?.status === 'completed' && task?.completed_at) {
          setLastAnalyzedAt(task.completed_at);
        }
      } catch {
        /* offline / unauthenticated — ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [getAuthHeaders]);

  return (
    <div
      className="absolute bottom-3 right-3 lg:bottom-4 lg:right-4 flex flex-col items-center"
      style={{ pointerEvents: 'none' }}
    >
      <button
        type="button"
        onClick={() => navigate('/guardian')}
        className="flex flex-col items-center justify-center gap-0.5 w-12 h-12 lg:w-14 lg:h-14 rounded-xl transition-transform duration-150 active:scale-[0.94]"
        style={{
          color: 'var(--gold)',
          background: 'rgba(var(--gold-rgb), 0.08)',
          border: '1px solid rgba(var(--gold-rgb), 0.55)',
          boxShadow:
            '0 0 12px rgba(var(--gold-rgb), 0.45), 0 0 24px rgba(var(--gold-rgb), 0.18), inset 0 0 8px rgba(var(--gold-rgb), 0.12)',
          pointerEvents: 'auto',
        }}
        title={
          lastAnalyzedAt
            ? `Open Estate Guardian AI · last analyzed ${fmt(lastAnalyzedAt)} ago`
            : 'Open Estate Guardian AI'
        }
        aria-label="Open Estate Guardian AI"
        data-testid={testId}
      >
        <Sparkles className="w-4 h-4 lg:w-5 lg:h-5" />
        <span className="text-[11px] font-bold tracking-wider leading-none">EGA</span>
      </button>
      {lastAnalyzedAt && (
        <span
          className="mt-1 text-[11px] font-medium leading-none whitespace-nowrap"
          style={{
            color: 'rgba(var(--gold-rgb), 0.85)',
            textShadow: '0 0 6px rgba(var(--gold-rgb), 0.35)',
          }}
          data-testid="readiness-ega-stamp"
        >
          {`Analyzed ${fmt(lastAnalyzedAt)}`}
        </span>
      )}
    </div>
  );
};

export default EgaQuickLink;
