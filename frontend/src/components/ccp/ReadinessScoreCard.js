import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../utils/apiClient';
import { ChevronDown, ChevronUp, Check, Circle, ShieldAlert } from 'lucide-react';
import { API_URL } from '../../config';

/**
 * ReadinessScoreCard — the single-glance "are we ready?" tile that
 * lives at the very top of the CCP home. Mirrors CFP's completeness
 * percentage in feel. Click-to-expand reveals the line-item breakdown
 * so the user knows exactly which lever to pull next.
 */
export default function ReadinessScoreCard({ estateId, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  const fetchScore = useCallback(async () => {
    if (!estateId) return;
    try {
      const token = localStorage.getItem('carryon_token');
      const res = await apiClient.get(`${API_URL}/ccp/readiness/${estateId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data);
    } catch (_e) {
      // silent — surface only when expanded
    }
  }, [estateId]);

  useEffect(() => { fetchScore(); }, [fetchScore, refreshKey]);

  if (!data) return null;

  const pct = Math.max(0, Math.min(100, data.score || 0));
  // colour ramp: red < 40 < amber < 65 < emerald < 85 < gold
  const ringColor =
    pct >= 85 ? '#d4af37'
    : pct >= 65 ? '#22C993'
    : pct >= 40 ? '#F59E0B'
    : '#EF4444';

  return (
    <div
      className="rounded-2xl overflow-hidden"
      data-testid="ccp-readiness-card"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--gold-rgb), 0.05), rgba(var(--gold-rgb), 0.01))',
        border: `1px solid ${ringColor}55`,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full p-5 flex items-center gap-4 text-left transition-all active:scale-[0.99]"
        data-testid="ccp-readiness-toggle"
      >
        {/* SVG ring score */}
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
            <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
            <circle
              cx="32" cy="32" r="28"
              stroke={ringColor}
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 176} 176`}
              style={{ transition: 'stroke-dasharray 600ms ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-extrabold" style={{ color: ringColor, fontFamily: 'var(--sans)' }}>
              {pct}
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4" style={{ color: ringColor }} />
            <span className="text-xs font-bold tracking-wide uppercase" style={{ color: 'var(--t4)' }}>
              Family Readiness
            </span>
          </div>
          <div className="text-base font-bold truncate" style={{ color: 'var(--t)', fontFamily: 'var(--sans)' }}>
            {data.label}
          </div>
          <div className="text-xs" style={{ color: 'var(--t4)' }}>
            {data.breakdown.filter(b => b.earned > 0).length} of {data.breakdown.length} factors complete
          </div>
        </div>

        {open
          ? <ChevronUp className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--t4)' }} />
          : <ChevronDown className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--t4)' }} />}
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-2" data-testid="ccp-readiness-breakdown">
          {data.breakdown.map((b) => (
            <div
              key={b.key}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: b.earned > 0 ? 'rgba(34,201,147,0.06)' : 'rgba(255,255,255,0.03)' }}
            >
              {b.earned > 0
                ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#22C993' }} />
                : <Circle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--t5)' }} />}
              <div className="flex-1 min-w-0">
                <div className="text-sm" style={{ color: b.earned > 0 ? 'var(--t)' : 'var(--t3)' }}>
                  {b.label}
                </div>
              </div>
              <div className="text-xs font-bold tabular-nums" style={{ color: b.earned > 0 ? '#22C993' : 'var(--t5)' }}>
                {b.earned}/{b.points}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
