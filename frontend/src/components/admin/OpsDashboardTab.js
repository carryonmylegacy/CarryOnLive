import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  CheckCircle2, AlertTriangle,
  MessageSquare, Shield, FileKey, Loader2, Crown, Wrench,
  StickyNote
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StatusDot = ({ online }) => (
  <div
    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
    style={{
      background: online ? '#22C993' : '#475569',
      boxShadow: online ? '0 0 8px rgba(34,201,147,0.5)' : 'none',
    }}
    title={online ? 'Online (active in last hour)' : 'Offline'}
    data-testid={`status-dot-${online ? 'online' : 'offline'}`}
  />
);

const QueueCard = ({ icon: Icon, label, count, color, sub }) => (
  <div
    className="rounded-xl p-3 text-center"
    style={{
      background: count > 0 ? `${color}08` : 'var(--s)',
      border: `1px solid ${count > 0 ? `${color}25` : 'var(--b)'}`,
    }}
    data-testid={`queue-${label.toLowerCase().replace(/\s+/g, '-')}`}
  >
    <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: count > 0 ? color : 'var(--t5)' }} />
    <div className="text-xl font-bold text-[var(--t)]">{count}</div>
    <div className="text-[10px] text-[var(--t4)] font-bold">{label}</div>
    {sub && <div className="text-[9px] text-[var(--t5)]">{sub}</div>}
  </div>
);

export const OpsDashboardTab = ({ getAuthHeaders }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    try {
      const res = await axios.get(`${API_URL}/ops/dashboard`, getAuthHeaders());
      setData(res.data);
    } catch (err) {
      toast.error('Failed to load dashboard');
    }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" />
      </div>
    );
  }

  if (!data) return null;

  const { operators, queues, recent_shift_notes } = data;

  return (
    <div className="space-y-5" data-testid="ops-dashboard">
      {/* Queue Overview */}
      <div>
        <h3 className="text-xs font-bold text-[var(--t5)] uppercase tracking-wider mb-2">
          Work Queues
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <QueueCard icon={Shield} label="DTS Total" count={queues.dts_total} color="#8B5CF6"
            sub={`${queues.dts_unassigned} unassigned`} />
          <QueueCard icon={MessageSquare} label="Support" count={queues.support_open} color="#F43F5E"
            sub={`${queues.support_unanswered} unanswered`} />
          <QueueCard icon={FileKey} label="TVT Pending" count={queues.tvt_pending} color="#F59E0B" />
          <QueueCard icon={FileKey} label="TVT Review" count={queues.tvt_reviewing} color="#FBBF24" />
          <QueueCard icon={CheckCircle2} label="Verifications" count={queues.verifications_pending} color="#F97316" />
          <QueueCard icon={AlertTriangle} label="Escalations" count={queues.escalations_open} color="#EF4444" />
          <QueueCard icon={Shield} label="Unassigned" count={queues.dts_unassigned} color="#6366F1" />
        </div>
      </div>

      {/* Team Overview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-[var(--t5)] uppercase tracking-wider">
            Team Activity
          </h3>
          <span className="text-[10px] text-[var(--t5)]">
            {operators.filter(o => o.is_online).length}/{operators.length} online
          </span>
        </div>
        <div className="space-y-2">
          {operators.map(op => (
            <Card key={op.id} className="glass-card" data-testid={`operator-profile-${op.id}`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: op.operator_role === 'manager'
                        ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)',
                      border: `1px solid ${op.operator_role === 'manager'
                        ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)'}`,
                    }}>
                    {op.operator_role === 'manager'
                      ? <Crown className="w-5 h-5 text-[#F59E0B]" />
                      : <Wrench className="w-5 h-5 text-[#3B82F6]" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusDot online={op.is_online} />
                      <span className="text-sm font-bold text-[var(--t)] truncate">{op.name}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                        style={{
                          background: op.operator_role === 'manager' ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)',
                          color: op.operator_role === 'manager' ? '#F59E0B' : '#3B82F6',
                        }}>
                        {op.operator_role === 'manager' ? 'Manager' : 'Team Member'}
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--t5)] truncate">
                      @{op.username}{op.title ? ` · ${op.title}` : ''}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="flex gap-3 flex-shrink-0">
                    <div className="text-center" title="Tasks Assigned">
                      <div className="text-sm font-bold text-[var(--t)]">{op.tasks_assigned}</div>
                      <div className="text-[9px] text-[var(--t5)]">Tasks</div>
                    </div>
                    <div className="text-center" title="Active Tasks">
                      <div className="text-sm font-bold" style={{ color: op.tasks_active > 0 ? '#F59E0B' : 'var(--t5)' }}>
                        {op.tasks_active}
                      </div>
                      <div className="text-[9px] text-[var(--t5)]">Active</div>
                    </div>
                    <div className="text-center" title="Completion Rate">
                      <div className="text-sm font-bold" style={{
                        color: op.completion_rate >= 80 ? '#22C993' : op.completion_rate >= 50 ? '#F59E0B' : 'var(--t5)'
                      }}>
                        {op.completion_rate}%
                      </div>
                      <div className="text-[9px] text-[var(--t5)]">Done</div>
                    </div>
                    <div className="text-center" title="Actions in last 24h">
                      <div className="text-sm font-bold text-[var(--t)]">{op.actions_24h}</div>
                      <div className="text-[9px] text-[var(--t5)]">24h</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Shift Notes */}
      {recent_shift_notes && recent_shift_notes.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-[var(--t5)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5" /> Recent Shift Notes
          </h3>
          <div className="space-y-1.5">
            {recent_shift_notes.map(note => (
              <div
                key={note.id}
                className="rounded-lg px-3 py-2 text-xs"
                style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-[var(--t)]">{note.author_name}</span>
                  <span className="text-[var(--t5)]">
                    {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-[var(--t4)]">{note.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
