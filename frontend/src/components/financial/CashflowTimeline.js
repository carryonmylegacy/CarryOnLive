import React, { useEffect, useState } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { Calendar, TrendingDown, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config';

/**
 * 30-Day Cashflow Timeline.
 *
 * Forward-looking view of bills + minimum debt payments grouped by day.
 * Designed for the Beneficiary view so heirs can see what's due before
 * the next paycheck. Collapses to "next 7 days" by default to keep the
 * fold focused on what's imminent.
 */
const CashflowTimeline = ({ estateId }) => {
  const { getAuthHeaders } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiClient.get(`${API_URL}/financial/cashflow/${estateId}`, getAuthHeaders());
        if (alive) setData(res.data);
      } catch (e) {
        if (alive) setData(null);
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [estateId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Card className="glass-card" data-testid="cashflow-timeline-loading">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-[var(--t5)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading 30-day timeline…
        </CardContent>
      </Card>
    );
  }
  if (!data || !data.timeline) return null;

  const visibleDays = expanded ? data.timeline : data.timeline.slice(0, 7);
  const grand = data.grand_total_30d || 0;

  return (
    <Card className="glass-card" data-testid="cashflow-timeline">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--gold)]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--t3)]">
              Next {expanded ? 30 : 7} days
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <TrendingDown className="w-3 h-3 text-[#ef4444]" />
            <span className="text-[var(--t4)]">30-day outflow:</span>
            <span className="font-bold text-[var(--t)]" data-testid="cashflow-grand-total">
              ${grand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          {visibleDays.map((d) => (
            <div
              key={d.date}
              className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm"
              style={{
                background: d.items.length ? 'rgba(var(--gold-rgb), 0.05)' : 'transparent',
                borderLeft: d.items.length ? '2px solid rgba(var(--gold-rgb), 0.4)' : '2px solid transparent',
              }}
              data-testid={`cashflow-day-${d.date}`}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-[var(--t3)]">{d.day_label}</span>
                {d.items.length > 0 && (
                  <span className="text-[11px] text-[var(--t5)] truncate">
                    {d.items.map((i) => i.name).join(', ')}
                  </span>
                )}
              </div>
              <span className="text-sm font-bold ml-2" style={{ color: d.total ? 'var(--t)' : 'var(--t5)' }}>
                {d.total ? `$${d.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full text-xs text-[var(--t4)] hover:text-[var(--t)] flex items-center justify-center gap-1 py-1.5 rounded-lg hover:bg-[var(--s)] transition-colors"
          data-testid="cashflow-expand-btn"
        >
          {expanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Show all 30 days</>}
        </button>
      </CardContent>
    </Card>
  );
};

export default CashflowTimeline;
