import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ClipboardCheck, Loader2, RefreshCw, Mail, Download, AlertTriangle, BarChart3, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { API_URL } from '../../config';

const TIER_META = {
  searching: { label: 'Searching (<40)', color: '#f87171' },
  gaps: { label: 'Gaps (40–74)', color: '#d4af37' },
  ahead: { label: 'Ahead (75+)', color: '#10b981' },
};

const Metric = ({ label, value, color = 'text-white' }) => (
  <div className="bg-[#0f1729] border border-[#1e293b] rounded-xl p-4 text-center">
    <div className={`text-xl font-bold ${color}`}>{value}</div>
    <div className="text-[11px] text-[#94a3b8] mt-1">{label}</div>
  </div>
);

const Panel = ({ title, icon: Icon, iconColor, children, testId }) => (
  <Card className="bg-[#0f1729] border-[#1e293b]" data-testid={testId}>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm font-semibold text-white flex items-center gap-2"><Icon className={`w-4 h-4 ${iconColor}`} /> {title}</CardTitle>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const exportLeadsCsv = (leads) => {
  const rows = [['email', 'score', 'tier', 'device', 'source', 'page', 'date'], ...leads.map(l => [l.email, l.score, l.tier, l.device_type, l.utm?.utm_source || '', l.page, l.created_at])];
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `carryon-quiz-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
};

export const QuizAnalyticsTab = ({ getAuthHeaders }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resp = await axios.get(`${API_URL}/admin/quiz/analytics`, getAuthHeaders());
      setData(resp.data);
    } catch (e) {
      console.error('Failed to load quiz analytics:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-[#d4af37] animate-spin" /></div>;
  if (!data) return <div className="text-center text-[#94a3b8] py-20">Failed to load quiz analytics</div>;

  return (
    <div className="space-y-6" data-testid="quiz-analytics-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-[#d4af37]" /> Readiness Quiz</h2>
          <p className="text-xs text-[#94a3b8] mt-1">Where families feel least prepared, and who asked for their results</p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchData} className="text-[#94a3b8] hover:text-white" data-testid="quiz-analytics-refresh"><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {data.total === 0 ? (
        <p className="text-sm text-[#94a3b8] text-center py-16" data-testid="quiz-analytics-empty">No quiz results yet. They&apos;ll appear here as visitors take the 60-second quiz on the homepage.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Metric label="Quizzes Taken" value={data.total} />
            <Metric label="Last 7 Days" value={data.last_7d} color="text-blue-400" />
            <Metric label="Average Score" value={`${data.avg_score}/100`} color="text-[#d4af37]" />
            <Metric label="Emails Captured" value={data.emails_captured} color="text-green-400" />
            <Metric label="Capture Rate" value={`${data.capture_rate}%`} color="text-[#d4af37]" />
          </div>

          <Panel title="Where families feel least prepared" icon={AlertTriangle} iconColor="text-red-400" testId="quiz-gaps-panel">
            <p className="text-xs text-[#94a3b8] mb-4">Gap score = share answering &ldquo;No&rdquo; plus half of &ldquo;Partly&rdquo;. Sorted worst first.</p>
            <div className="space-y-3">
              {data.questions.map(q => (
                <div key={q.index} className="flex items-center gap-3" data-testid={`quiz-gap-row-${q.index}`}>
                  <span className="text-xs text-[#e2e8f0] w-44 truncate">{q.label}</span>
                  <div className="flex-1 h-5 bg-[#1a2744] rounded-md overflow-hidden flex">
                    <div style={{ width: `${(q.no / (q.yes + q.partly + q.no)) * 100}%`, background: 'rgba(248,113,113,0.7)' }} title={`No: ${q.no}`} />
                    <div style={{ width: `${(q.partly / (q.yes + q.partly + q.no)) * 100}%`, background: 'rgba(212,175,55,0.6)' }} title={`Partly: ${q.partly}`} />
                    <div style={{ width: `${(q.yes / (q.yes + q.partly + q.no)) * 100}%`, background: 'rgba(16,185,129,0.5)' }} title={`Yes: ${q.yes}`} />
                  </div>
                  <span className="text-xs font-bold w-12 text-right" style={{ color: q.gap_pct >= 60 ? '#f87171' : q.gap_pct >= 35 ? '#d4af37' : '#10b981' }}>{q.gap_pct}%</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-4 text-[11px] text-[#94a3b8]">
              <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: 'rgba(248,113,113,0.7)' }} />No</span>
              <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: 'rgba(212,175,55,0.6)' }} />Partly / not sure</span>
              <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: 'rgba(16,185,129,0.5)' }} />Yes</span>
            </div>
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Panel title="Score Distribution" icon={BarChart3} iconColor="text-purple-400">
              <div className="space-y-2">
                {data.histogram.map(h => (
                  <div key={h.range} className="flex items-center gap-3 text-xs">
                    <span className="text-[#94a3b8] w-12">{h.range}</span>
                    <div className="flex-1 h-4 bg-[#1a2744] rounded-full overflow-hidden"><div className="h-full bg-purple-500/40 rounded-full" style={{ width: `${(h.count / data.total) * 100}%` }} /></div>
                    <span className="text-white font-medium w-6 text-right">{h.count}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Readiness Tiers" icon={ClipboardCheck} iconColor="text-[#d4af37]">
              <div className="space-y-3">
                {Object.entries(TIER_META).map(([key, meta]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-[#94a3b8]"><span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />{meta.label}</span>
                    <span className="text-white font-medium">{data.by_tier[key] || 0} <span className="text-[#475569] text-xs">({Math.round(((data.by_tier[key] || 0) / data.total) * 100)}%)</span></span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="By Source" icon={Users} iconColor="text-cyan-400">
              <div className="space-y-2">
                {data.by_source.map(s => (
                  <div key={s.source} className="flex items-center justify-between text-sm">
                    <span className="text-[#94a3b8] truncate max-w-[120px]">{s.source}</span>
                    <span className="text-white font-medium">{s.count} <span className="text-[#475569] text-xs">avg {s.avg_score}</span></span>
                  </div>
                ))}
                <div className="pt-2 border-t border-[#1e293b] text-xs text-[#94a3b8]">
                  {Object.entries(data.by_device).map(([d, c]) => <span key={d} className="mr-3 capitalize">{d}: <span className="text-white">{c}</span></span>)}
                </div>
              </div>
            </Panel>
          </div>

          <Card className="bg-[#0f1729] border-[#1e293b]" data-testid="quiz-leads-panel">
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2"><Mail className="w-4 h-4 text-green-400" /> Leads ({data.leads.length})</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => exportLeadsCsv(data.leads)} disabled={data.leads.length === 0} className="text-[#94a3b8] hover:text-white text-xs" data-testid="quiz-leads-export"><Download className="w-3.5 h-3.5 mr-1" /> Export CSV</Button>
            </CardHeader>
            <CardContent>
              {data.leads.length === 0 ? <p className="text-xs text-[#94a3b8] text-center py-4">No one has asked for their results by email yet.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-[#94a3b8] border-b border-[#1e293b]"><th className="text-left py-2 px-2">Email</th><th className="text-left py-2 px-2">Score</th><th className="text-left py-2 px-2">Tier</th><th className="text-left py-2 px-2">Delivered</th><th className="text-left py-2 px-2">Source</th><th className="text-left py-2 px-2">Date</th></tr></thead>
                    <tbody>
                      {data.leads.map(l => (
                        <tr key={l.id} className="border-b border-[#1e293b]/50 hover:bg-white/[0.02]">
                          <td className="py-2 px-2 text-white">{l.email}</td>
                          <td className="py-2 px-2 font-bold" style={{ color: TIER_META[l.tier]?.color }}>{l.score}</td>
                          <td className="py-2 px-2 text-[#94a3b8] capitalize">{l.tier}</td>
                          <td className="py-2 px-2">{l.email_sent ? <span className="text-green-400">Sent</span> : <span className="text-red-400">Failed</span>}</td>
                          <td className="py-2 px-2 text-[#94a3b8]">{l.utm?.utm_source || '—'}</td>
                          <td className="py-2 px-2 text-[#475569]">{new Date(l.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Panel title="Recent Results" icon={Users} iconColor="text-[#94a3b8]" testId="quiz-recent-panel">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-[#94a3b8] border-b border-[#1e293b]"><th className="text-left py-2 px-2">Score</th><th className="text-left py-2 px-2">Tier</th><th className="text-left py-2 px-2">Device</th><th className="text-left py-2 px-2">Page</th><th className="text-left py-2 px-2">Email</th><th className="text-left py-2 px-2">Date</th></tr></thead>
                <tbody>
                  {data.recent.map(r => (
                    <tr key={r.id} className="border-b border-[#1e293b]/50 hover:bg-white/[0.02]">
                      <td className="py-2 px-2 font-bold" style={{ color: TIER_META[r.tier]?.color }}>{r.score}</td>
                      <td className="py-2 px-2 text-[#94a3b8] capitalize">{r.tier}</td>
                      <td className="py-2 px-2 text-[#94a3b8] capitalize">{r.device_type}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{r.page || '—'}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{r.email || '—'}</td>
                      <td className="py-2 px-2 text-[#475569]">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
};
