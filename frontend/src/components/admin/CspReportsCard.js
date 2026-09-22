import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { Card, CardContent } from '../ui/card';

/* What the frontend's Content-Security-Policy-Report-Only header WOULD have blocked
   (browsers post violations to /api/public/csp-report). Empty for a week = safe to enforce. */
export const CspReportsCard = ({ getAuthHeaders }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    apiClient.get(`${API_URL}/admin/csp-reports`, getAuthHeaders()).then(r => setData(r.data)).catch(() => setData({ total: 0, groups: [], error: true }));
  }, [getAuthHeaders]);

  return (
    <Card className="bg-white/[0.03] border-white/10" data-testid="csp-reports-card">
      <CardContent className="p-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1"><ShieldAlert size={16} style={{ color: '#d4af37' }} /> Content-Security-Policy — report-only findings (30 days)</h3>
        <p className="text-xs text-white/50 mb-4">
          The public site ships a CSP in <em>report-only</em> mode: nothing is blocked yet, browsers only report what an enforced policy would stop.
          {' '}{data && !data.error ? `${data.total} report${data.total === 1 ? '' : 's'} received.` : ''} When this list stays empty for a week, the policy can be switched to enforcing.
        </p>
        {!data ? (
          <p className="text-xs text-white/40">Loading…</p>
        ) : data.groups.length === 0 ? (
          <p className="text-sm text-emerald-300/90" data-testid="csp-reports-empty">No violations reported — the current policy fits the site.</p>
        ) : (
          <div className="space-y-1.5" data-testid="csp-reports-list">
            {data.groups.map((g, i) => (
              <div key={i} className="flex items-start justify-between gap-3 text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="min-w-0">
                  <span className="font-mono text-[#d4af37]">{g.directive || '—'}</span>
                  <span className="text-white/70 break-all ml-2">{g.blocked_uri || '(inline)'}</span>
                  <div className="text-white/35 truncate">{g.sample_page}</div>
                </div>
                <span className="shrink-0 text-white/60">×{g.count}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
