import React, { useState, useEffect } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import {
  BarChart3, TrendingUp, Users, Smartphone, Monitor, Tablet,
  ArrowRight, Globe, MapPin, Heart, Loader2, RefreshCw, Send
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { API_URL } from '../../config';

const STEP_LABELS = { 1: 'Interests', 2: 'Family', 3: 'Plan', 4: 'CTA', 5: 'Referral' };
const DEVICE_ICONS = { mobile: Smartphone, desktop: Monitor, tablet: Tablet };

export const FunnelAnalyticsTab = ({ getAuthHeaders }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resp = await apiClient.get(`${API_URL}/admin/funnel/analytics`, getAuthHeaders());
      setData(resp.data);
    } catch (e) {
      console.error('Failed to load funnel analytics:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-[#d4af37] animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center text-[#94a3b8] py-20">Failed to load funnel analytics</div>;
  }

  const { total_sessions, completed, converted, completion_rate, conversion_rate, drop_offs, by_source, by_campaign, by_device, by_state, by_interest, referrals_sent, recent_sessions } = data;

  return (
    <div className="space-y-6" data-testid="funnel-analytics-tab">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#d4af37]" />
            Acquisition Funnel
          </h2>
          <p className="text-xs text-[#94a3b8] mt-1">Campaign attribution & conversion tracking</p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchData} className="text-[#94a3b8] hover:text-white">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Sessions', value: total_sessions, color: 'text-white' },
          { label: 'Completed Funnel', value: completed, color: 'text-blue-400' },
          { label: 'Converted (Signup)', value: converted, color: 'text-green-400' },
          { label: 'Completion Rate', value: `${completion_rate}%`, color: 'text-[#d4af37]' },
          { label: 'Conversion Rate', value: `${conversion_rate}%`, color: 'text-[#d4af37]' },
        ].map(m => (
          <div key={m.label} className="bg-[#0f1729] border border-[#1e293b] rounded-xl p-4 text-center">
            <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
            <div className="text-[11px] text-[#94a3b8] mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Drop-off waterfall */}
      <Card className="bg-[#0f1729] border-[#1e293b]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#d4af37]" />
            Funnel Drop-off
          </CardTitle>
        </CardHeader>
        <CardContent>
          {total_sessions === 0 ? (
            <p className="text-sm text-[#94a3b8] text-center py-4">No funnel sessions yet. Data will appear once campaigns drive traffic to /get-started.</p>
          ) : (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(s => {
                const dropCount = drop_offs[String(s)] || 0;
                const pct = total_sessions > 0 ? Math.round((dropCount / total_sessions) * 100) : 0;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <span className="text-xs text-[#94a3b8] w-20 text-right">{STEP_LABELS[s]}</span>
                    <div className="flex-1 h-6 bg-[#1a2744] rounded-lg overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-red-500/60 to-red-400/40 rounded-lg transition-all"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs text-white/80 font-medium">
                        {dropCount} dropped ({pct}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By Source */}
        <Card className="bg-[#0f1729] border-[#1e293b]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" />
              By Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            {by_source.length === 0 ? (
              <p className="text-xs text-[#94a3b8]">No campaign data yet</p>
            ) : (
              <div className="space-y-2">
                {by_source.map(s => (
                  <div key={s.source} className="flex items-center justify-between text-sm">
                    <span className="text-[#94a3b8]">{s.source}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-white font-medium">{s.total}</span>
                      <ArrowRight className="w-3 h-3 text-[#475569]" />
                      <span className="text-green-400 font-medium">{s.converted}</span>
                      <span className="text-xs text-[#475569]">({s.total > 0 ? Math.round(s.converted / s.total * 100) : 0}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By Campaign */}
        <Card className="bg-[#0f1729] border-[#1e293b]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-400" />
              By Campaign
            </CardTitle>
          </CardHeader>
          <CardContent>
            {by_campaign.length === 0 ? (
              <p className="text-xs text-[#94a3b8]">No campaign data yet</p>
            ) : (
              <div className="space-y-2">
                {by_campaign.map(c => (
                  <div key={c.campaign} className="flex items-center justify-between text-sm">
                    <span className="text-[#94a3b8] truncate max-w-[150px]">{c.campaign}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-white font-medium">{c.total}</span>
                      <ArrowRight className="w-3 h-3 text-[#475569]" />
                      <span className="text-green-400 font-medium">{c.converted}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By Device */}
        <Card className="bg-[#0f1729] border-[#1e293b]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              By Device
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(by_device).length === 0 ? (
              <p className="text-xs text-[#94a3b8]">No data yet</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(by_device).map(([type, count]) => {
                  const Icon = DEVICE_ICONS[type] || Monitor;
                  const pct = total_sessions > 0 ? Math.round((count / total_sessions) * 100) : 0;
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-[#94a3b8]" />
                      <span className="text-sm text-[#94a3b8] capitalize w-16">{type}</span>
                      <div className="flex-1 h-4 bg-[#1a2744] rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500/40 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-white font-medium w-12 text-right">{count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By State */}
        <Card className="bg-[#0f1729] border-[#1e293b]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-400" />
              Top States
            </CardTitle>
          </CardHeader>
          <CardContent>
            {by_state.length === 0 ? (
              <p className="text-xs text-[#94a3b8]">No geo data yet</p>
            ) : (
              <div className="space-y-2">
                {by_state.map(g => (
                  <div key={g.state} className="flex items-center justify-between text-sm">
                    <span className="text-[#94a3b8]">{g.state}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{g.total}</span>
                      <span className="text-xs text-[#475569]">({g.total > 0 ? Math.round(g.converted / g.total * 100) : 0}% conv)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Interests + Referrals row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Interest clustering */}
        <Card className="bg-[#0f1729] border-[#1e293b]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Heart className="w-4 h-4 text-pink-400" />
              Interest Selections
            </CardTitle>
          </CardHeader>
          <CardContent>
            {by_interest.length === 0 ? (
              <p className="text-xs text-[#94a3b8]">No data yet</p>
            ) : (
              <div className="space-y-2">
                {by_interest.map(i => {
                  const maxCount = by_interest[0]?.count || 1;
                  const pct = Math.round((i.count / maxCount) * 100);
                  return (
                    <div key={i.interest} className="flex items-center gap-3">
                      <span className="text-xs text-[#94a3b8] w-40 truncate">{i.interest.replace(/_/g, ' ')}</span>
                      <div className="flex-1 h-4 bg-[#1a2744] rounded-full overflow-hidden">
                        <div className="h-full bg-pink-500/40 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-white font-medium w-8 text-right">{i.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Referral stats */}
        <Card className="bg-[#0f1729] border-[#1e293b]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-[#d4af37]" />
              Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <div className="text-3xl font-bold text-[#d4af37]">{referrals_sent}</div>
              <div className="text-xs text-[#94a3b8] mt-1">Referral invites sent from funnel</div>
              <div className="text-xs text-[#475569] mt-3">Each referral = +7 days trial for both parties</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent sessions */}
      <Card className="bg-[#0f1729] border-[#1e293b]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-[#94a3b8]" />
            Recent Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recent_sessions.length === 0 ? (
            <p className="text-xs text-[#94a3b8] text-center py-4">No sessions yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#94a3b8] border-b border-[#1e293b]">
                    <th className="text-left py-2 px-2">Source</th>
                    <th className="text-left py-2 px-2">Campaign</th>
                    <th className="text-left py-2 px-2">Device</th>
                    <th className="text-left py-2 px-2">Location</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Drop-off</th>
                    <th className="text-left py-2 px-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recent_sessions.map(s => (
                    <tr key={s.session_id} className="border-b border-[#1e293b]/50 hover:bg-white/[0.02]">
                      <td className="py-2 px-2 text-white">{s.utm_source || '—'}</td>
                      <td className="py-2 px-2 text-[#94a3b8] truncate max-w-[120px]">{s.utm_campaign || '—'}</td>
                      <td className="py-2 px-2 text-[#94a3b8] capitalize">{s.device_type || '—'}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">
                        {s.demographics?.state ? `${s.demographics.city || ''}, ${s.demographics.state}` : '—'}
                      </td>
                      <td className="py-2 px-2">
                        {s.converted ? (
                          <span className="text-green-400 font-medium">Converted</span>
                        ) : s.completed ? (
                          <span className="text-blue-400">Completed</span>
                        ) : (
                          <span className="text-[#475569]">In Progress</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-[#94a3b8]">
                        {s.drop_off_step ? STEP_LABELS[s.drop_off_step] || `Step ${s.drop_off_step}` : '—'}
                      </td>
                      <td className="py-2 px-2 text-[#475569]">
                        {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
