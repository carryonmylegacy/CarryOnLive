/**
 * PartnerRevShareModal — founder-facing monthly payout report for one
 * B2B partner. "Steady / non-churn" = subscription ACTIVE and in good
 * standing right now with a real paid amount (founder definition).
 */

import React, { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { X, Loader2, DollarSign, Users, TrendingUp, HandCoins } from 'lucide-react';
import { API_URL } from '../../config';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export const PartnerRevShareModal = ({ partner, authHeaders, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await apiClient.get(
          `${API_URL}/admin/partners/${partner.id}/revshare-report`,
          { headers: authHeaders() },
        );
        setReport(data);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load rev-share report');
      } finally {
        setLoading(false);
      }
    })();
  }, [partner.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tiles = report ? [
    { label: 'Members', value: report.total_members, icon: Users, color: '#8B5CF6' },
    { label: 'Steady payers', value: report.paying_subscribers, icon: TrendingUp, color: '#10b981' },
    { label: 'Monthly revenue', value: money(report.monthly_recurring_revenue), icon: DollarSign, color: '#d4af37' },
    { label: `Payout @ ${report.revshare_percent}%`, value: money(report.monthly_payout), icon: HandCoins, color: '#34d399' },
  ] : [];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" data-testid="revshare-modal"
      style={{ background: 'rgba(5,10,20,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: 'var(--bg)', border: '1px solid rgba(var(--gold-rgb),0.25)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--t)]">Rev-Share Report</h3>
            <p className="text-sm text-[var(--t4)]">{partner.company_name} · active, in-good-standing paying subscribers right now</p>
          </div>
          <button onClick={onClose} className="text-[var(--t5)] hover:text-[var(--t)]" data-testid="revshare-modal-close" aria-label="Close rev-share report">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16" data-testid="revshare-loading">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" />
          </div>
        ) : error ? (
          <p className="text-sm text-[var(--rd)] py-8 text-center" data-testid="revshare-error">{error}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {tiles.map(t => (
                <div key={t.label} className="rounded-xl p-3" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                  <t.icon className="w-4 h-4 mb-1.5" style={{ color: t.color }} />
                  <div className="text-lg font-bold text-[var(--t)]" data-testid={`revshare-tile-${t.label.split(' ')[0].toLowerCase()}`}>{t.value}</div>
                  <div className="text-[11px] text-[var(--t5)] font-semibold uppercase tracking-wider">{t.label}</div>
                </div>
              ))}
            </div>

            {report.paying_subscribers === 0 ? (
              <div className="rounded-xl p-4 text-sm text-[var(--t4)]" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid="revshare-empty">
                No qualifying paying subscribers yet.
                {report.total_members > 0 && (
                  <> {report.non_qualifying_members} member{report.non_qualifying_members === 1 ? ' is' : 's are'} attributed
                  to this partner but not currently on an active PAID plan (trial, beta, free, unclaimed, or lapsed).</>
                )}
                {' '}Note: while platform Beta Mode is ON, all subscriptions record $0 — payouts activate once billing goes live.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--b)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--b)' }}>
                      <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--t4)]">Subscriber</th>
                      <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--t4)]">Plan</th>
                      <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--t4)]">Billed</th>
                      <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--t4)]">Monthly eq.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.subscribers.map(s => (
                      <tr key={s.user_id} style={{ borderBottom: '1px solid var(--b)' }} data-testid={`revshare-sub-${s.user_id}`}>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-[var(--t)]">{s.name}</div>
                          <div className="text-[11px] text-[var(--t5)]">{s.email}</div>
                        </td>
                        <td className="px-3 py-2 text-[var(--t3)]">{s.plan_name} <span className="text-[var(--t5)] text-[11px]">({s.billing_cycle})</span></td>
                        <td className="px-3 py-2 text-right text-[var(--t3)]">{money(s.amount)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-[var(--gold)]">{money(s.monthly_equivalent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PartnerRevShareModal;
