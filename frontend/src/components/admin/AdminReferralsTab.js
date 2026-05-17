/**
 * AdminReferralsTab — Founder-only aggregate view of the referral program.
 *
 * Shows lifetime + windowed totals, conversion rate, and a leaderboard of
 * the top referrers. Mirrors the data layout of DownloadDiagnosticsTab and
 * ProductAnalyticsTab.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { Loader2, Trophy, Users, MousePointerClick, Sparkles } from 'lucide-react';
import { API_URL } from '../../config';

const fmt = (n) => Number(n || 0).toLocaleString();

const StatCard = ({ icon: Icon, label, value, accent }) => (
  <div
    className="rounded-xl p-4 flex items-center gap-3"
    style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
  >
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ background: `${accent}1a`, border: `1px solid ${accent}40` }}
    >
      <Icon className="w-5 h-5" style={{ color: accent }} />
    </div>
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--t4)' }}>{label}</div>
      <div className="text-xl font-semibold" style={{ color: 'var(--t)' }}>{value}</div>
    </div>
  </div>
);

export const AdminReferralsTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('carryon_token');
    if (!token) return;
    setLoading(true);
    axios
      .get(`${API_URL}/api/admin/referrals?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.detail || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8" data-testid="admin-referrals-loading">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span style={{ color: 'var(--t3)' }}>Loading referrals…</span>
      </div>
    );
  }
  if (error) {
    return <div className="p-8 text-sm" style={{ color: 'var(--err)' }} data-testid="admin-referrals-error">{error}</div>;
  }
  if (!data) return null;

  const t = data.totals || {};
  const board = data.leaderboard || [];

  return (
    <div className="space-y-5" data-testid="admin-referrals-tab">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2
            className="text-2xl font-semibold"
            style={{ color: 'var(--t)', fontFamily: 'var(--serif)' }}
          >
            Referrals
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--t3)' }}>
            Member-driven growth. Conversion = signups ÷ visits.
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value, 10))}
          className="select-themed w-36 h-9 px-3 rounded-md text-sm"
          style={{ background: 'var(--card)', border: '1px solid var(--b)', color: 'var(--t)' }}
          data-testid="admin-referrals-window-select"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Codes issued" value={fmt(t.codes_issued)} accent="#d4af37" />
        <StatCard icon={MousePointerClick} label={`Visits (${days}d)`} value={fmt(t[`visits_${days}d`])} accent="#3b82f6" />
        <StatCard icon={Sparkles} label={`Signups (${days}d)`} value={fmt(t[`signups_${days}d`])} accent="#10b981" />
        <StatCard icon={Trophy} label="Conversion rate" value={`${t.conversion_rate_pct ?? 0}%`} accent="#a855f7" />
      </div>

      {/* Leaderboard */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
      >
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--b)' }}
        >
          <h3 className="font-semibold" style={{ color: 'var(--t)' }}>Top referrers (lifetime)</h3>
          <span className="text-xs" style={{ color: 'var(--t4)' }}>{board.length} shown</span>
        </div>
        {board.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--t3)' }} data-testid="admin-referrals-empty">
            No referral signups yet. Codes are issued on first share.
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="admin-referrals-leaderboard">
            <thead style={{ background: 'var(--bg)', color: 'var(--t4)' }}>
              <tr className="text-left text-xs uppercase tracking-wider">
                <th className="px-4 py-2.5">#</th>
                <th className="px-4 py-2.5">Member</th>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5 text-right">Visits</th>
                <th className="px-4 py-2.5 text-right">Signups</th>
                <th className="px-4 py-2.5 text-right">Bonus days</th>
              </tr>
            </thead>
            <tbody>
              {board.map((row, idx) => (
                <tr
                  key={row.code}
                  style={{ borderTop: '1px solid var(--b)' }}
                  data-testid={`admin-referrals-row-${idx}`}
                >
                  <td className="px-4 py-3" style={{ color: 'var(--t4)' }}>{idx + 1}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--t)' }}>
                    <div className="font-medium">{row.user_name}</div>
                    <div className="text-xs" style={{ color: 'var(--t4)' }}>{row.user_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <code style={{ color: 'var(--gold)' }}>{row.code}</code>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--t)' }}>{fmt(row.visits)}</td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--t)' }}>{fmt(row.signups)}</td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--gold)' }}>+{fmt(row.bonus_days_granted)}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminReferralsTab;
