import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { User, Loader2, FileText, MessageSquare, Shield, Clock, Mail, CalendarDays, Star, X } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

export const CustomerContextPanel = ({ userId, getAuthHeaders, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const headers = getAuthHeaders()?.headers || {};

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    axios.get(`${API_URL}/ops/customer-context/${userId}`, { headers })
      .then(res => setData(res.data))
      .catch(() => toast.error('Failed to load customer context'))
      .finally(() => setLoading(false));
  }, [userId]); // eslint-disable-line

  if (loading) return (
    <Card className="glass-card">
      <CardContent className="p-6 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--t4)]" />
      </CardContent>
    </Card>
  );

  if (!data) return null;

  const { user, subscription, estates, beneficiaries, documents_count, recent_support, recent_dts, recent_activity } = data;

  return (
    <Card className="glass-card" data-testid="customer-context-panel">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--gold)]/10 border border-[var(--gold)]/30 flex items-center justify-center">
              <User className="w-5 h-5 text-[var(--gold)]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--t)]">{user.name}</p>
              <p className="text-[11px] text-[var(--t5)]">{user.email}</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 rounded-lg text-[var(--t5)] hover:text-[var(--t3)]">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-[var(--s)] text-center">
            <p className="text-lg font-bold text-[var(--t)]">{estates.length}</p>
            <p className="text-[11px] text-[var(--t5)]">Estates</p>
          </div>
          <div className="p-2 rounded-lg bg-[var(--s)] text-center">
            <p className="text-lg font-bold text-[var(--t)]">{beneficiaries.length}</p>
            <p className="text-[11px] text-[var(--t5)]">Beneficiaries</p>
          </div>
          <div className="p-2 rounded-lg bg-[var(--s)] text-center">
            <p className="text-lg font-bold text-[var(--t)]">{documents_count}</p>
            <p className="text-[11px] text-[var(--t5)]">Documents</p>
          </div>
        </div>

        {/* Account details */}
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2 text-[var(--t4)]">
            <Shield className="w-3 h-3 text-[var(--t5)]" />
            Role: <span className="font-bold capitalize">{user.role}</span>
            {user.is_beta_tester && <span className="text-[#22C993] font-bold">(Beta)</span>}
          </div>
          <div className="flex items-center gap-2 text-[var(--t4)]">
            <CalendarDays className="w-3 h-3 text-[var(--t5)]" />
            Joined: {new Date(user.created_at).toLocaleDateString()}
          </div>
          {user.last_login_at && (
            <div className="flex items-center gap-2 text-[var(--t4)]">
              <Clock className="w-3 h-3 text-[var(--t5)]" />
              Last login: {new Date(user.last_login_at).toLocaleString()}
            </div>
          )}
          {subscription && (
            <div className="flex items-center gap-2 text-[var(--t4)]">
              <Star className="w-3 h-3 text-[var(--t5)]" />
              Plan: <span className="font-bold capitalize">{subscription.plan_name || subscription.plan_id || 'None'}</span>
              ({subscription.status})
            </div>
          )}
        </div>

        {/* Estates */}
        {estates.length > 0 && (
          <div>
            <p className="text-xs font-bold text-[var(--t)] mb-1.5">Estates</p>
            {estates.map(e => (
              <div key={e.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[var(--s)] mb-1">
                <span className="text-xs text-[var(--t3)]">{e.name}</span>
                <div className="flex items-center gap-2">
                  {e.readiness_score !== undefined && (
                    <span className="text-[11px] text-[var(--t5)]">{e.readiness_score}%</span>
                  )}
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full capitalize" style={{
                    background: e.status === 'active' ? 'rgba(34,201,147,0.1)' : 'rgba(100,116,139,0.1)',
                    color: e.status === 'active' ? '#22C993' : '#64748B',
                  }}>{e.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Support */}
        {recent_support.length > 0 && (
          <div>
            <p className="text-xs font-bold text-[var(--t)] mb-1.5">Recent Support</p>
            {recent_support.map(s => (
              <div key={s.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[var(--s)] mb-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3 h-3 text-[var(--t5)]" />
                  <span className="text-xs text-[var(--t3)]">{s.subject}</span>
                </div>
                <span className="text-[11px] capitalize" style={{
                  color: s.status === 'open' ? '#F59E0B' : '#22C993'
                }}>{s.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* Recent DTS */}
        {recent_dts.length > 0 && (
          <div>
            <p className="text-xs font-bold text-[var(--t)] mb-1.5">Recent DTS</p>
            {recent_dts.map(d => (
              <div key={d.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[var(--s)] mb-1">
                <div className="flex items-center gap-2">
                  <FileText className="w-3 h-3 text-[var(--t5)]" />
                  <span className="text-xs text-[var(--t3)]">{d.title}</span>
                </div>
                <span className="text-[11px] capitalize text-[var(--t5)]">{d.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* Recent Activity */}
        {recent_activity.length > 0 && (
          <div>
            <p className="text-xs font-bold text-[var(--t)] mb-1.5">Recent Activity</p>
            {recent_activity.slice(0, 5).map((a, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1 text-[11px]">
                <span className="text-[var(--t4)] capitalize">{a.action?.replace(/_/g, ' ')}</span>
                <span className="text-[var(--t5)]">{new Date(a.timestamp).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
