import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Shield, Pause, Play, Trash2, Lock, Clock, CheckCircle2, AlertTriangle, Loader2, Mail } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const STATUS_CONFIG = {
  active: { label: 'Active', color: '#F59E0B', icon: Clock },
  paused: { label: 'On Hold', color: '#3B82F6', icon: Pause },
  files_purged: { label: 'Files Purged', color: '#F97316', icon: Trash2 },
  completed: { label: 'Completed', color: '#6B7280', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: '#22C993', icon: CheckCircle2 },
};

export const GracePeriodsTab = ({ getAuthHeaders }) => {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sortByHold, setSortByHold] = useState(false);
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [mmPassword, setMmPassword] = useState('');

  const fetchPeriods = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/grace-periods?status=${filter}`, getAuthHeaders());
      setPeriods(res.data || []);
    } catch { toast.error('Failed to load grace periods'); }
    setLoading(false);
  }, [filter, getAuthHeaders]);

  useEffect(() => { fetchPeriods(); }, [fetchPeriods]);

  const daysRemaining = (expiresAt) => {
    if (!expiresAt) return null;
    const diff = (new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(diff));
  };

  const handleHold = async (gpId, holdActive) => {
    setActionLoading(true);
    try {
      await axios.post(`${API_URL}/admin/grace-periods/${gpId}/hold`,
        { hold_active: holdActive, reason: holdReason }, getAuthHeaders());
      toast.success(holdActive ? 'Hold placed — purge paused' : 'Hold removed — countdown resumed');
      setHoldReason('');
      fetchPeriods();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    setActionLoading(false);
  };

  const handleConfirm = async (gpId) => {
    setActionLoading(true);
    try {
      await axios.post(`${API_URL}/admin/grace-periods/${gpId}/confirm`, {}, getAuthHeaders());
      toast.success('Grace period confirmed — 90-day clock started');
      fetchPeriods();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    setActionLoading(false);
  };

  const handlePurgeFiles = async (gpId) => {
    if (!window.confirm('This will permanently remove all file content (not Milestone Messages). Continue?')) return;
    setActionLoading(true);
    try {
      const res = await axios.post(`${API_URL}/admin/grace-periods/${gpId}/purge`, {}, getAuthHeaders());
      toast.success(`${res.data.files_purged} file(s) purged. MM purge still pending.`);
      fetchPeriods();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    setActionLoading(false);
  };

  const handlePurgeMM = async (gpId) => {
    if (!mmPassword) { toast.error('Password required'); return; }
    if (!window.confirm('FINAL ACTION: This will permanently remove all undelivered Milestone Messages. This cannot be undone.')) return;
    setActionLoading(true);
    try {
      const res = await axios.post(`${API_URL}/admin/grace-periods/${gpId}/purge-mm`,
        { password: mmPassword }, getAuthHeaders());
      toast.success(`${res.data.messages_purged} milestone message(s) purged. Estate purge complete.`);
      setMmPassword('');
      setSelected(null);
      fetchPeriods();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    setActionLoading(false);
  };

  const sorted = [...periods].sort((a, b) => {
    if (sortByHold) {
      if (a.hold_active && !b.hold_active) return -1;
      if (!a.hold_active && b.hold_active) return 1;
    }
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const holdCount = periods.filter(p => p.hold_active).length;
  const pausedCount = periods.filter(p => p.status === 'paused').length;
  const activeCount = periods.filter(p => p.status === 'active').length;
  const filesPurgedCount = periods.filter(p => p.status === 'files_purged').length;

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--t4)]" /></div>;

  return (
    <div className="space-y-4 pt-4" data-testid="grace-periods-tab">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: 'Active', count: activeCount, color: '#F59E0B', f: 'active' },
          { label: 'On Hold', count: holdCount, color: '#3B82F6', f: 'paused' },
          { label: 'Files Purged', count: filesPurgedCount, color: '#F97316', f: 'files_purged' },
          { label: 'Completed', count: periods.filter(p => p.status === 'completed').length, color: '#6B7280', f: 'completed' },
          { label: 'All', count: periods.length, color: 'var(--t3)', f: 'all' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center cursor-pointer transition-all"
            style={{
              background: filter === s.f ? `${s.color}15` : 'var(--s)',
              border: `1px solid ${filter === s.f ? `${s.color}40` : 'var(--b)'}`,
            }}
            onClick={() => setFilter(s.f)}
            data-testid={`gp-filter-${s.f}`}>
            <div className="text-xl font-bold text-[var(--t)]">{s.count}</div>
            <div className="text-[11px] font-bold" style={{ color: s.color }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Sort Toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSortByHold(!sortByHold)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
          style={{
            background: sortByHold ? 'rgba(59,130,246,0.15)' : 'var(--s)',
            color: sortByHold ? '#3B82F6' : 'var(--t4)',
            border: `1px solid ${sortByHold ? 'rgba(59,130,246,0.3)' : 'var(--b)'}`,
          }}
          data-testid="gp-sort-hold"
        >
          <Shield className="w-3.5 h-3.5" />
          Sort by Hold
        </button>
        <span className="text-xs text-[var(--t5)]">{sorted.length} grace period{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <Card className="border-[var(--b)] bg-[var(--s)]">
          <CardContent className="p-8 text-center text-[var(--t4)] text-sm">
            No grace periods found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map(gp => {
            const cfg = STATUS_CONFIG[gp.status] || STATUS_CONFIG.active;
            const Icon = cfg.icon;
            const days = daysRemaining(gp.expires_at);
            const isSelected = selected?.id === gp.id;

            return (
              <Card key={gp.id} className="border-[var(--b)] bg-[var(--s)] cursor-pointer transition-all hover:border-[var(--gold)]/30"
                style={gp.hold_active ? { borderLeft: '3px solid #3B82F6' } : isSelected ? { borderLeft: '3px solid var(--gold)' } : {}}
                onClick={() => setSelected(isSelected ? null : gp)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--t)]">{gp.estate_name || 'Estate'}</span>
                        <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: `${cfg.color}15`, color: cfg.color }}>
                          <Icon className="w-3 h-3" /> {cfg.label}
                        </span>
                        {gp.hold_active && (
                          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                            <Shield className="w-3 h-3" /> HOLD
                          </span>
                        )}
                        {gp.is_transitioned_estate && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400">
                            Transitioned
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-[var(--t5)]">
                        <span>{gp.user_name} ({gp.user_email})</span>
                        <span>Trigger: {gp.trigger}</span>
                        {gp.status === 'active' && days !== null && (
                          <span style={{ color: days <= 5 ? '#EF4444' : days <= 15 ? '#F59E0B' : '#94A3B8' }}>
                            {days} day{days !== 1 ? 's' : ''} remaining
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isSelected && (
                    <div className="mt-4 pt-4 border-t border-[var(--b)] space-y-3" onClick={e => e.stopPropagation()}>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-[var(--t4)]">Started:</span> <span className="text-[var(--t)]">{new Date(gp.started_at).toLocaleDateString()}</span></div>
                        <div><span className="text-[var(--t4)]">Expires:</span> <span className="text-[var(--t)]">{new Date(gp.expires_at).toLocaleDateString()}</span></div>
                        <div><span className="text-[var(--t4)]">Emails notified:</span> <span className="text-[var(--t)]">{gp.all_emails?.length || 0}</span></div>
                        <div><span className="text-[var(--t4)]">Notifications sent:</span> <span className="text-[var(--t)]">{gp.notifications_sent?.length || 0}</span></div>
                      </div>

                      {gp.all_emails?.length > 0 && (
                        <div className="text-xs">
                          <span className="text-[var(--t4)] flex items-center gap-1 mb-1"><Mail className="w-3 h-3" /> Recipients:</span>
                          <div className="text-[var(--t5)]">{gp.all_emails.join(', ')}</div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-col gap-2 pt-2">
                        {/* Auto-paused confirmation */}
                        {gp.status === 'paused' && gp.paused_by === 'system' && !gp.hold_active && (
                          <Button size="sm" className="font-bold" style={{ background: '#22C993', color: '#fff' }}
                            disabled={actionLoading} onClick={() => handleConfirm(gp.id)}
                            data-testid="gp-confirm-btn">
                            {actionLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                            Confirm — Start 90-Day Clock
                          </Button>
                        )}

                        {/* Hold toggle */}
                        {gp.status !== 'completed' && gp.status !== 'cancelled' && (
                          <div className="flex gap-2 items-center">
                            <input
                              type="text" placeholder="Hold reason (optional)" value={holdReason}
                              onChange={e => setHoldReason(e.target.value)}
                              className="flex-1 px-2 py-1.5 rounded-lg text-base bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-xs"
                              style={{ fontSize: '16px' }}
                              data-testid="gp-hold-reason"
                            />
                            <Button size="sm" variant={gp.hold_active ? 'outline' : 'default'}
                              className="font-bold text-xs"
                              style={gp.hold_active ? {} : { background: '#3B82F6', color: '#fff' }}
                              disabled={actionLoading}
                              onClick={() => handleHold(gp.id, !gp.hold_active)}
                              data-testid="gp-hold-btn">
                              {gp.hold_active ? <><Play className="w-3 h-3 mr-1" /> Remove Hold</> : <><Pause className="w-3 h-3 mr-1" /> Place Hold</>}
                            </Button>
                          </div>
                        )}

                        {/* File purge */}
                        {gp.status === 'active' && !gp.hold_active && days !== null && days <= 0 && (
                          <Button size="sm" className="font-bold" style={{ background: '#F97316', color: '#fff' }}
                            disabled={actionLoading} onClick={() => handlePurgeFiles(gp.id)}
                            data-testid="gp-purge-files-btn">
                            <Trash2 className="w-3 h-3 mr-1" /> Purge Files (Keep MMs)
                          </Button>
                        )}

                        {/* MM purge — final action with password */}
                        {gp.status === 'files_purged' && gp.mm_purge_pending && (
                          <div className="p-3 rounded-lg space-y-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#EF4444]">
                              <AlertTriangle className="w-3.5 h-3.5" /> Final Purge: Undelivered Milestone Messages
                            </div>
                            <p className="text-[11px] text-[var(--t5)]">
                              This permanently removes all undelivered Milestone Messages for this estate. This action cannot be undone. Password confirmation required.
                            </p>
                            <div className="flex gap-2 items-center">
                              <input
                                type="password" placeholder="Confirm your password" value={mmPassword}
                                onChange={e => setMmPassword(e.target.value)}
                                className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)]"
                                style={{ fontSize: '16px' }}
                                data-testid="gp-mm-password"
                              />
                              <Button size="sm" className="font-bold" style={{ background: '#EF4444', color: '#fff' }}
                                disabled={actionLoading || !mmPassword}
                                onClick={() => handlePurgeMM(gp.id)}
                                data-testid="gp-mm-purge-btn">
                                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Lock className="w-3 h-3 mr-1" />}
                                Purge MMs
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
