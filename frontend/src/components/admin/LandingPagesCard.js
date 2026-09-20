import React, { useEffect, useState } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

const LABELS = { home: 'Homepage', benefactor: '/benefactor', ready: '/ready', moments: '/moments', untagged: 'Untagged (older accounts)' };
const COLS = [
  ['visitors', 'Visitors'], ['cta_clicks', 'CTA clicks'], ['signups', 'Signups'], ['activated', 'Activated'], ['paid', 'Paid'],
  ['visitor_to_signup', 'Visit→Signup'], ['signup_to_activated', 'Signup→Active'], ['activated_to_paid', 'Active→Paid'],
];
const isRate = (k) => k.includes('_to_');

// Which entry page turns strangers into activated, paying families — the read-out for the paid-traffic test.
export const LandingPagesCard = ({ getAuthHeaders }) => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient.get(`${API_URL}/admin/funnel-analytics/landing-pages?days=${days}`, getAuthHeaders())
      .then(r => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="bg-[#0f1729] border-[#1e293b]" data-testid="landing-pages-card">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2"><Flag className="w-4 h-4 text-[#d4af37]" /> By Landing Page</CardTitle>
          <p className="text-[11px] text-[#94a3b8] mt-1">Visitors → signups → activated → paid, by the page a family came in on. Activated = {data?.activation_rule || '1+ document or 1+ message'}.</p>
        </div>
        <div className="flex gap-1" data-testid="landing-pages-days">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`px-2.5 py-1 rounded text-xs font-semibold ${days === d ? 'bg-[#d4af37] text-[#0B1221]' : 'text-[#94a3b8] hover:text-white'}`} data-testid={`landing-pages-days-${d}`}>{d}d</button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-[#d4af37] animate-spin" /></div>
          : !data?.rows?.length ? <p className="text-xs text-[#94a3b8] text-center py-4" data-testid="landing-pages-empty">No landing-page traffic in this window yet. Send an ad to /benefactor, /ready or /moments and the rows appear here.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="landing-pages-table">
                <thead>
                  <tr className="text-[#94a3b8] border-b border-[#1e293b]">
                    <th className="text-left py-2 px-2">Page</th>
                    {COLS.map(([k, label]) => <th key={k} className="text-right py-2 px-2 whitespace-nowrap">{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.page} className="border-b border-[#1e293b]/50 hover:bg-white/[0.02]" data-testid={`landing-pages-row-${r.page}`}>
                      <td className="py-2 px-2 text-white font-medium">{LABELS[r.page] || r.page}</td>
                      {COLS.map(([k]) => (
                        <td key={k} className={`py-2 px-2 text-right ${isRate(k) ? 'text-[#d4af37]' : 'text-[#e2e8f0]'}`}>{isRate(k) ? `${r[k]}%` : r[k]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </CardContent>
    </Card>
  );
};

export default LandingPagesCard;
