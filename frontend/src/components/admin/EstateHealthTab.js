import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users, Shield, Link2, FileCheck, UserCheck, AlertTriangle,
  Loader2, Heart, ChevronDown, ChevronUp, CheckCircle, Clock, Mail,
  Ghost, Trash2, Eye, EyeOff
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusConfig = {
  healthy: { color: '#22C993', bg: 'rgba(34,201,147,0.08)', border: 'rgba(34,201,147,0.25)', label: 'Healthy' },
  attention: { color: '#F5A623', bg: 'rgba(245,166,35,0.08)', border: 'rgba(245,166,35,0.25)', label: 'Needs Attention' },
  critical: { color: '#F05252', bg: 'rgba(240,82,82,0.08)', border: 'rgba(240,82,82,0.25)', label: 'Critical' },
};

const getAge = (dob) => {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
};

const getInitials = (name, firstName, lastName) => {
  if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase();
  if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return '??';
};

// Score ring - circular progress indicator
const ScoreRing = ({ score, size = 44, strokeWidth = 3 }) => {
  const radius = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const cfg = score >= 80 ? statusConfig.healthy : score >= 50 ? statusConfig.attention : statusConfig.critical;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={cfg.color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color: cfg.color }}>
        {score}
      </span>
    </div>
  );
};

// Tree node component
const TreeNode = ({ initials, color, size = 44, label, sublabel, badge, glowColor }) => (
  <div className="flex flex-col items-center gap-0.5">
    <div className="relative">
      <div
        className="rounded-full flex items-center justify-center font-bold"
        style={{
          width: size, height: size,
          background: color,
          fontSize: size * 0.3,
          color: '#080e1a',
          border: `2px solid ${glowColor || color}`,
          boxShadow: `0 0 10px ${(glowColor || color)}40`,
        }}
      >
        {initials}
      </div>
      {badge && (
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: badge.bg, border: `1px solid ${badge.border}` }}>
          {badge.icon}
        </div>
      )}
    </div>
    {label && <span className="text-[9px] font-semibold text-[var(--t)] text-center leading-tight max-w-[60px] truncate">{label}</span>}
    {sublabel && <span className="text-[7px] text-[#64748B] text-center leading-tight">{sublabel}</span>}
  </div>
);

// Individual estate health card with mini family tree
const EstateHealthCard = ({ estate }) => {
  const [expanded, setExpanded] = useState(false);
  const { metrics, owner, beneficiaries } = estate;
  const cfg = statusConfig[metrics.health_status];
  const sortedBens = [...beneficiaries].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    const ageA = getAge(a.date_of_birth) || 999;
    const ageB = getAge(b.date_of_birth) || 999;
    return ageA - ageB;
  });

  const getBenBadge = (ben) => {
    if (ben.is_linked) return { bg: '#22C993', border: '#22C99350', icon: <CheckCircle className="w-2.5 h-2.5 text-white" /> };
    if (ben.invitation_status === 'sent') return { bg: '#3B82F6', border: '#3B82F650', icon: <Mail className="w-2.5 h-2.5 text-white" /> };
    if (ben.is_stub) return { bg: '#F05252', border: '#F0525250', icon: <AlertTriangle className="w-2.5 h-2.5 text-white" /> };
    return { bg: '#F5A623', border: '#F5A62350', icon: <Clock className="w-2.5 h-2.5 text-white" /> };
  };

  const getBenColor = (ben) => {
    if (ben.is_primary) return '#d4af37';
    if (ben.is_linked) return '#22C993';
    if (ben.is_stub) return 'rgba(240,82,82,0.3)';
    return ben.avatar_color || '#60A5FA';
  };

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{ border: `1px solid ${cfg.border}`, background: cfg.bg }}
      data-testid={`estate-health-${estate.estate_id}`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
        data-testid={`estate-health-toggle-${estate.estate_id}`}
      >
        <ScoreRing score={metrics.health_score} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[var(--t)] truncate">{estate.estate_name}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-[var(--t5)]">{metrics.total} beneficiar{metrics.total === 1 ? 'y' : 'ies'}</span>
            <span className="text-[10px]" style={{ color: metrics.linked === metrics.total && metrics.total > 0 ? '#22C993' : '#F5A623' }}>
              {metrics.linked}/{metrics.total} linked
            </span>
            {!metrics.has_primary && metrics.total > 0 && (
              <span className="text-[10px] text-[#F05252] font-bold">No Primary</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4 text-[var(--t5)]" /> : <ChevronDown className="w-4 h-4 text-[var(--t5)]" />}
        </div>
      </button>

      {/* Expanded: Mini family tree + metrics */}
      {expanded && (
        <div className="px-4 pb-4 pt-1" style={{ borderTop: `1px solid ${cfg.border}` }}>
          {/* Mini family tree */}
          <div className="flex flex-col items-center py-3">
            {/* Owner node */}
            <TreeNode
              initials={getInitials(owner.name, owner.first_name, owner.last_name)}
              color="#d4af37"
              size={48}
              label={owner.first_name || owner.name?.split(' ')[0] || 'Owner'}
              sublabel="Benefactor"
              glowColor={cfg.color}
            />

            {sortedBens.length > 0 && (
              <div className="flex flex-col items-center">
                <div style={{ width: 2, height: 16, background: cfg.color, opacity: 0.4 }} />
                {sortedBens.length > 1 ? (
                  <div className="relative w-full flex justify-center" style={{ minWidth: sortedBens.length * 72 }}>
                    <div className="absolute top-0 left-[10%] right-[10%]" style={{ height: 2, background: cfg.color, opacity: 0.2 }} />
                    <div className="flex gap-2 justify-center pt-1 flex-wrap">
                      {sortedBens.map(ben => {
                        const age = getAge(ben.date_of_birth);
                        return (
                          <div key={ben.id} className="flex flex-col items-center">
                            <div style={{ width: 2, height: 10, background: getBenColor(ben), opacity: 0.4 }} />
                            <TreeNode
                              initials={getInitials(ben.name, ben.first_name, ben.last_name)}
                              color={getBenColor(ben)}
                              size={36}
                              label={ben.first_name || ben.name?.split(' ')[0] || ''}
                              sublabel={`${ben.relation || ''}${age ? ` · ${age}` : ''}`}
                              badge={getBenBadge(ben)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  sortedBens.map(ben => {
                    const age = getAge(ben.date_of_birth);
                    return (
                      <div key={ben.id} className="flex flex-col items-center">
                        <div style={{ width: 2, height: 10, background: getBenColor(ben), opacity: 0.4 }} />
                        <TreeNode
                          initials={getInitials(ben.name, ben.first_name, ben.last_name)}
                          color={getBenColor(ben)}
                          size={36}
                          label={ben.first_name || ben.name?.split(' ')[0] || ''}
                          sublabel={`${ben.relation || ''}${age ? ` · ${age}` : ''}`}
                          badge={getBenBadge(ben)}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {sortedBens.length === 0 && (
              <p className="text-[10px] text-[var(--t5)] mt-2 italic">No beneficiaries enrolled</p>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-3 mt-2 mb-3">
            {[
              { icon: <CheckCircle className="w-3 h-3" />, color: '#22C993', label: 'Linked' },
              { icon: <Mail className="w-3 h-3" />, color: '#3B82F6', label: 'Invited' },
              { icon: <Clock className="w-3 h-3" />, color: '#F5A623', label: 'Pending' },
              { icon: <AlertTriangle className="w-3 h-3" />, color: '#F05252', label: 'Incomplete' },
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1 text-[8px]" style={{ color: l.color }}>
                {l.icon} {l.label}
              </span>
            ))}
          </div>

          {/* Metric bars */}
          <div className="space-y-2">
            {[
              { label: 'Profile Completion', value: metrics.complete, total: metrics.total, color: '#22C993' },
              { label: 'Account Linked', value: metrics.linked, total: metrics.total, color: '#3B82F6' },
              { label: 'Invitation Sent', value: metrics.invited, total: metrics.total, color: '#F5A623' },
            ].map(m => (
              <div key={m.label}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] text-[var(--t4)]">{m.label}</span>
                  <span className="text-[9px] font-bold" style={{ color: m.color }}>{m.value}/{m.total}</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{
                    width: m.total > 0 ? `${(m.value / m.total) * 100}%` : '0%',
                    background: m.color,
                    opacity: 0.7,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Ghost estate alert with one-click cleanup
const GhostEstateAlert = ({ ghostEstates, getAuthHeaders, onCleanupDone }) => {
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [selected, setSelected] = useState(new Set(ghostEstates.map(g => g.estate_id)));

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === ghostEstates.length) setSelected(new Set());
    else setSelected(new Set(ghostEstates.map(g => g.estate_id)));
  };

  const handleCleanup = async () => {
    if (!password.trim() || selected.size === 0) return;
    setCleaning(true);
    try {
      const res = await axios.post(`${API_URL}/admin/cleanup-ghost-estates`, {
        estate_ids: [...selected],
        admin_password: password,
      }, getAuthHeaders());
      toast.success(res.data.message);
      setPassword('');
      onCleanupDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Cleanup failed');
    }
    setCleaning(false);
  };

  if (ghostEstates.length === 0) return null;

  const formatDate = (iso) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return ''; }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(240,82,82,0.3)', background: 'rgba(240,82,82,0.05)' }} data-testid="ghost-estate-alert">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        data-testid="ghost-estate-toggle"
      >
        <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(240,82,82,0.15)' }}>
          <Ghost className="w-4 h-4 text-[#F05252]" />
        </div>
        <div className="flex-1">
          <span className="text-sm font-bold text-[#F05252]">{ghostEstates.length} Ghost Estate{ghostEstates.length > 1 ? 's' : ''} Detected</span>
          <p className="text-[10px] text-[var(--t5)] mt-0.5">Orphaned or incomplete estates blocking user workflows</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-[var(--t5)]" /> : <ChevronDown className="w-4 h-4 text-[var(--t5)]" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid rgba(240,82,82,0.15)' }}>
          {/* Select all toggle */}
          <div className="flex items-center justify-between pt-2">
            <button onClick={toggleAll} className="text-[10px] font-bold text-[var(--t4)] hover:text-[var(--t)]" data-testid="ghost-select-all">
              {selected.size === ghostEstates.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-[10px] text-[var(--t5)]">{selected.size} selected</span>
          </div>

          {/* Ghost estate list */}
          {ghostEstates.map(g => (
            <label
              key={g.estate_id}
              className="flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-colors"
              style={{ background: selected.has(g.estate_id) ? 'rgba(240,82,82,0.08)' : 'transparent', border: `1px solid ${selected.has(g.estate_id) ? 'rgba(240,82,82,0.2)' : 'rgba(255,255,255,0.04)'}` }}
              data-testid={`ghost-estate-${g.estate_id}`}
            >
              <input
                type="checkbox"
                checked={selected.has(g.estate_id)}
                onChange={() => toggleSelect(g.estate_id)}
                className="mt-0.5 accent-[#F05252]"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--t)] truncate">{g.estate_name}</span>
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(240,82,82,0.12)', color: '#F05252' }}>Ghost</span>
                </div>
                <p className="text-[10px] text-[var(--t5)] mt-0.5">{g.owner_name} ({g.owner_email || 'no email'})</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[9px] text-[var(--t5)]">{formatDate(g.created_at)}</span>
                  <span className="text-[9px] text-[#F05252]">{g.reason}</span>
                </div>
              </div>
            </label>
          ))}

          {/* Cleanup action */}
          <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="relative flex-1">
              <Input
                type={showPw ? 'text' : 'password'}
                placeholder="Admin password to confirm"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="text-xs pr-8"
                data-testid="ghost-cleanup-password"
              />
              <button onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <Button
              onClick={handleCleanup}
              disabled={cleaning || !password.trim() || selected.size === 0}
              className="text-xs font-bold gap-1.5 px-4"
              style={{ background: '#F05252', color: '#fff' }}
              data-testid="ghost-cleanup-button"
            >
              {cleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Clean Up {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export const EstateHealthTab = ({ getAuthHeaders }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, critical, attention, healthy

  useEffect(() => { fetchHealth(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchHealth = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/estate-health`, getAuthHeaders());
      setData(res.data);
    } catch (err) {
      toast.error('Failed to load estate health data');
    }
    setLoading(false);
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-[var(--gold)]" /></div>;
  if (!data) return null;

  const { summary, estates, ghost_estates: ghostEstates } = data;
  const filtered = filter === 'all' ? estates : estates.filter(e => e.metrics.health_status === filter);

  return (
    <div className="space-y-5" data-testid="estate-health-tab">
      {/* Ghost Estate Alert */}
      {ghostEstates && ghostEstates.length > 0 && (
        <GhostEstateAlert ghostEstates={ghostEstates} getAuthHeaders={getAuthHeaders} onCleanupDone={fetchHealth} />
      )}

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Estates', value: summary.total_estates, icon: Users, color: '#60A5FA' },
          { label: 'Linking Rate', value: `${summary.linking_rate}%`, icon: Link2, color: summary.linking_rate >= 50 ? '#22C993' : '#F5A623' },
          { label: 'Completion', value: `${summary.completion_rate}%`, icon: FileCheck, color: summary.completion_rate >= 70 ? '#22C993' : '#F5A623' },
          { label: 'Primary Set', value: `${summary.primary_designated_rate}%`, icon: Shield, color: summary.primary_designated_rate >= 50 ? '#22C993' : '#F05252' },
          { label: 'Invite Rate', value: `${summary.invitation_rate}%`, icon: Mail, color: summary.invitation_rate >= 50 ? '#22C993' : '#F5A623' },
          { label: 'Total Bens', value: summary.total_beneficiaries, icon: UserCheck, color: '#B794F6' },
        ].map((kpi) => (
          <Card key={kpi.label} className="glass-card" data-testid={`health-kpi-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${kpi.color}15` }}>
                  <kpi.icon className="w-3 h-3" style={{ color: kpi.color }} />
                </div>
                <span className="text-[9px] text-[var(--t5)] font-bold uppercase tracking-wider">{kpi.label}</span>
              </div>
              <p className="text-xl font-bold text-[var(--t)]">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Health Distribution Bar */}
      <div className="glass-card p-4 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-[var(--t)] flex items-center gap-2">
            <Heart className="w-3.5 h-3.5 text-[var(--gold)]" />
            Estate Health Distribution
          </h3>
          <span className="text-[10px] text-[var(--t5)]">{summary.total_estates} estates</span>
        </div>
        <div className="flex gap-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {summary.healthy_estates > 0 && (
            <div style={{ width: `${(summary.healthy_estates / summary.total_estates) * 100}%`, background: '#22C993' }} className="rounded-full transition-all duration-500" />
          )}
          {summary.attention_estates > 0 && (
            <div style={{ width: `${(summary.attention_estates / summary.total_estates) * 100}%`, background: '#F5A623' }} className="rounded-full transition-all duration-500" />
          )}
          {summary.critical_estates > 0 && (
            <div style={{ width: `${(summary.critical_estates / summary.total_estates) * 100}%`, background: '#F05252' }} className="rounded-full transition-all duration-500" />
          )}
        </div>
        <div className="flex justify-between mt-2">
          {[
            { label: 'Healthy', count: summary.healthy_estates, color: '#22C993' },
            { label: 'Attention', count: summary.attention_estates, color: '#F5A623' },
            { label: 'Critical', count: summary.critical_estates, color: '#F05252' },
          ].map(s => (
            <span key={s.label} className="text-[10px] font-bold flex items-center gap-1" style={{ color: s.color }}>
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              {s.count} {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5">
        {[
          { key: 'all', label: 'All Estates' },
          { key: 'critical', label: 'Critical', color: '#F05252' },
          { key: 'attention', label: 'Attention', color: '#F5A623' },
          { key: 'healthy', label: 'Healthy', color: '#22C993' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === f.key ? 'text-[#0F1629]' : 'text-[var(--t4)]'}`}
            style={filter === f.key
              ? { background: f.color || 'var(--gold)' }
              : { background: 'var(--s)' }
            }
            data-testid={`health-filter-${f.key}`}
          >
            {f.label} {f.key !== 'all' && `(${f.key === 'critical' ? summary.critical_estates : f.key === 'attention' ? summary.attention_estates : summary.healthy_estates})`}
          </button>
        ))}
      </div>

      {/* Estate Cards */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <Heart className="w-10 h-10 mx-auto text-[var(--t5)] mb-3" />
            <p className="text-sm text-[var(--t4)]">No estates match this filter</p>
          </div>
        ) : (
          filtered.map(estate => (
            <EstateHealthCard key={estate.estate_id} estate={estate} />
          ))
        )}
      </div>
    </div>
  );
};
