import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, Users, FileKey, FolderLock, Loader2,
  Headphones, CreditCard, Activity, Settings,
  MessageSquare, CheckSquare, AlertTriangle, Clock, ShieldCheck, TrendingUp, Trash2,
  Megaphone, HeartPulse, Search, StickyNote, BookOpen
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { toast } from '../utils/toast';
import { Skeleton } from '../components/ui/skeleton';


import { UsersTab } from '../components/admin/UsersTab';
import { TransitionTab } from '../components/admin/TransitionTab';
import { DTSTab } from '../components/admin/DTSTab';
import { SupportTab } from '../components/admin/SupportTab';
import { SubscriptionsTab } from '../components/admin/SubscriptionsTab';
import { VerificationsTab } from '../components/admin/VerificationsTab';
import { AnalyticsTab } from '../components/admin/AnalyticsTab';
import { ActivityTab } from '../components/admin/ActivityTab';
import { LaunchMetricsTab } from '../components/admin/LaunchMetricsTab';
import { DevSwitcherTab } from '../components/admin/DevSwitcherTab';
import { OperatorsTab } from '../components/admin/OperatorsTab';
import { AuditTrailTab } from '../components/admin/AuditTrailTab';
import { AnnouncementsTab } from '../components/admin/AnnouncementsTab';
import { SystemHealthTab } from '../components/admin/SystemHealthTab';
import { MyActivityTab } from '../components/admin/MyActivityTab';
import { QuickSearchTab } from '../components/admin/QuickSearchTab';
import { EscalationsTab } from '../components/admin/EscalationsTab';
import { ShiftNotesTab } from '../components/admin/ShiftNotesTab';
import { KnowledgeBaseTab } from '../components/admin/KnowledgeBaseTab';
import { P1ContactSettingsTab } from '../components/admin/P1ContactSettingsTab';
import { OpsDashboardTab } from '../components/admin/OpsDashboardTab';
import { MilestoneDeliveriesTab } from '../components/admin/MilestoneDeliveriesTab';
import { TrialUsersTab } from '../components/admin/TrialUsersTab';
import { EstateHealthTab } from '../components/admin/EstateHealthTab';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TAB_CONFIG = [
  { key: 'users', label: 'Users', icon: Users, path: '/admin' },
  { key: 'transition', label: 'TVT', icon: FileKey, path: '/admin/transition' },
  { key: 'dts', label: 'DTS', icon: Shield, path: '/admin/dts' },
  { key: 'support', label: 'Support', icon: Headphones, path: '/admin/support' },
  { key: 'subscriptions', label: 'Subs', icon: CreditCard, path: '/admin/subscriptions' },
  { key: 'verifications', label: 'Verify', icon: FileKey, path: '/admin/verifications' },
  { key: 'analytics', label: 'Analytics', icon: Activity, path: '/admin/analytics' },
  { key: 'launch', label: 'Launch', icon: TrendingUp, path: '/admin/launch' },
  { key: 'activity', label: 'Activity', icon: Activity, path: '/admin/activity' },
  { key: 'operators', label: 'Operators', icon: Users, path: '/admin/operators' },
  { key: 'audit', label: 'Audit Trail', icon: Shield, path: '/admin/audit' },
  { key: 'dev-switcher', label: 'Dev', icon: Settings, path: '/admin/dev-switcher' },
  // Founder-only sidebar features
  { key: 'announcements', label: 'Announcements', icon: Megaphone, path: '/admin/announcements' },
  { key: 'system-health', label: 'System Health', icon: HeartPulse, path: '/admin/system-health' },
  { key: 'escalations', label: 'Escalations', icon: AlertTriangle, path: '/admin/escalations' },
  { key: 'knowledge-base', label: 'Knowledge Base', icon: BookOpen, path: '/admin/knowledge-base' },
  { key: 'estate-health', label: 'Estate Health', icon: HeartPulse, path: '/admin/estate-health' },
  { key: 'p1-settings', label: 'P1 Contact', icon: AlertTriangle, path: '/admin/p1-settings' },
  { key: 'ops-dashboard', label: 'Ops Dashboard', icon: Activity, path: '/admin/ops-dashboard' },
  { key: 'milestones', label: 'Milestones', icon: CheckSquare, path: '/admin/milestones' },
  // Operator sidebar features
  { key: 'my-activity', label: 'My Activity', icon: Clock, path: '/ops/my-activity' },
  { key: 'search', label: 'Search', icon: Search, path: '/ops/search' },
  { key: 'ops-escalations', label: 'Escalate', icon: AlertTriangle, path: '/ops/escalations' },
  { key: 'shift-notes', label: 'Shift Notes', icon: StickyNote, path: '/ops/shift-notes' },
  { key: 'ops-kb', label: 'SOPs', icon: BookOpen, path: '/ops/knowledge-base' },
];

const PATH_TO_TAB = {
  '/admin/transition': 'transition',
  '/admin/dts': 'dts',
  '/admin/dev-switcher': 'dev-switcher',
  '/admin/support': 'support',
  '/admin/subscriptions': 'subscriptions',
  '/admin/verifications': 'verifications',
  '/admin/analytics': 'analytics',
  '/admin/activity': 'activity',
  '/admin/operators': 'operators',
  '/admin/audit': 'audit',
  // Operations portal paths map to the same tabs
  '/ops/transition': 'transition',
  '/ops/dts': 'dts',
  '/ops/support': 'support',
  '/ops/verifications': 'verifications',
  // New sidebar features
  '/admin/announcements': 'announcements',
  '/admin/system-health': 'system-health',
  '/admin/escalations': 'escalations',
  '/admin/knowledge-base': 'knowledge-base',
  '/admin/p1-settings': 'p1-settings',
  '/admin/estate-health': 'estate-health',
  '/admin/ops-dashboard': 'ops-dashboard',
  '/admin/milestones': 'milestones',
  '/admin/trials': 'trials',
  '/ops/my-activity': 'my-activity',
  '/ops/search': 'search',
  '/ops/escalations': 'ops-escalations',
  '/ops/shift-notes': 'shift-notes',
  '/ops/knowledge-base': 'ops-kb',
  '/ops/operators': 'operators',
  '/ops/dashboard': 'ops-dashboard',
  '/ops/ops-dashboard': 'ops-dashboard',
  '/ops/milestones': 'milestones',
  '/ops/users': 'users',
  '/ops/trials': 'trials',
};

const AdminPage = ({ operatorMode = false }) => {
  const { user, getAuthHeaders } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const defaultOpsTab = user?.operator_role === 'manager' ? 'ops-dashboard' : 'transition';
  const tab = PATH_TO_TAB[location.pathname] || (operatorMode ? defaultOpsTab : 'users');

  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [otpDisabled, setOtpDisabled] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const res = await axios.post(`${API_URL}/admin/cleanup-orphans`, {}, getAuthHeaders());
      const d = res.data.deleted;
      const total = Object.values(d).reduce((a, b) => a + b, 0);
      if (total > 0) {
        toast.success(`Cleaned up ${total} orphaned record(s)`);
        // Refresh stats
        const [statsRes, usersRes] = await Promise.all([
          axios.get(`${API_URL}/admin/stats`, getAuthHeaders()),
          axios.get(`${API_URL}/admin/users`, getAuthHeaders()),
        ]);
        setStats(statsRes.data);
        setUsers(usersRes.data);
      } else {
        toast.success('No orphaned records found');
      }
    } catch (err) { toast.error('Cleanup failed'); }
    finally { setCleaning(false); }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (operatorMode) {
          // Operators only need stats for the work queue tiles
          const statsRes = await axios.get(`${API_URL}/admin/stats`, getAuthHeaders());
          setStats(statsRes.data);
        } else {
          const [usersRes, statsRes, settingsRes, revenueRes] = await Promise.all([
            axios.get(`${API_URL}/admin/users`, getAuthHeaders()),
            axios.get(`${API_URL}/admin/stats`, getAuthHeaders()),
            axios.get(`${API_URL}/admin/platform-settings`, getAuthHeaders()).catch(() => ({ data: {} })),
            axios.get(`${API_URL}/admin/revenue-metrics`, getAuthHeaders()).catch(() => ({ data: null })),
          ]);
          setUsers(usersRes.data);
          setStats(statsRes.data);
          setOtpDisabled(settingsRes.data?.otp_disabled || false);
          setRevenue(revenueRes.data);
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshStats = async () => {
    try {
      const statsRes = await axios.get(`${API_URL}/admin/stats`, getAuthHeaders());
      setStats(statsRes.data);
    } catch {}
  };

  const toggleOtp = async () => {
    const newVal = !otpDisabled;
    setOtpDisabled(newVal);
    try {
      await axios.put(`${API_URL}/admin/platform-settings`, { otp_disabled: newVal }, getAuthHeaders());
    } catch { setOtpDisabled(!newVal); }
  };

  // Poll stats every 30s so new requests "pop in" for operators
  useEffect(() => {
    if (!operatorMode) return;
    const poll = setInterval(async () => {
      try {
        const res = await axios.get(`${API_URL}/admin/stats`, getAuthHeaders());
        setStats(res.data);
      } catch { /* silent */ }
    }, 30000);
    return () => clearInterval(poll);
  }, [operatorMode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user?.role !== 'admin' && user?.role !== 'operator') {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 animate-fade-in">
        <Card className="glass-card"><CardContent className="p-12 text-center">
          <Shield className="w-16 h-16 mx-auto text-[#ef4444] mb-4" />
          <h3 className="text-xl font-bold text-[var(--t)] mb-2">Access Denied</h3>
        </CardContent></Card>
      </div>
    );
  }

  if (loading) return <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6"><Skeleton className="h-12 w-64 bg-[var(--s)]" /></div>;

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in max-w-full overflow-x-hidden" data-testid="admin-dashboard">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>{operatorMode ? 'Operations Dashboard' : 'Founder Dashboard'}</h1>
          <p className="text-xs sm:text-sm text-[var(--t5)]">{operatorMode ? 'Transition Verification · Customer Service · Trustee Services' : 'Platform Management · Transition Verification · Trustee Services'}</p>
        </div>
        {!operatorMode && (
        <button
          onClick={handleCleanup}
          disabled={cleaning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-[var(--t5)] hover:text-[var(--t3)] transition-colors"
          style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
          title="Remove orphaned records from deleted users"
          data-testid="admin-cleanup-btn"
        >
          {cleaning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          Clean Up
        </button>
        )}
      </div>

      {/* Revenue Analytics — founder only */}
      {!operatorMode && revenue && (
        <div className="mb-4">
          <p className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2">Revenue</p>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="glass-card p-3 text-center">
              <div className="text-xl font-bold text-[#22C993]">${revenue.mrr.toLocaleString()}</div>
              <div className="text-[10px] text-[var(--t4)] font-bold">MRR</div>
              <div className="text-[9px] text-[var(--t5)]">${revenue.arr.toLocaleString()}/yr ARR</div>
            </div>
            <div className="glass-card p-3 text-center">
              <div className="text-xl font-bold text-[#d4af37]">${revenue.total_revenue.toLocaleString()}</div>
              <div className="text-[10px] text-[var(--t4)] font-bold">Total Revenue</div>
              <div className="text-[9px] text-[var(--t5)]">${revenue.revenue_this_month.toLocaleString()} this month</div>
            </div>
            <div className="glass-card p-3 text-center">
              <div className="text-xl font-bold" style={{ color: revenue.mom_growth >= 0 ? '#22C993' : '#EF4444' }}>
                {revenue.mom_growth >= 0 ? '+' : ''}{revenue.mom_growth}%
              </div>
              <div className="text-[10px] text-[var(--t4)] font-bold">MoM Growth</div>
              <div className="text-[9px] text-[var(--t5)]">${revenue.revenue_last_month.toLocaleString()} last month</div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="glass-card p-2.5 text-center">
              <div className="text-lg font-bold text-[var(--t)]">{revenue.paying_subscribers}</div>
              <div className="text-[9px] text-[var(--t5)]">Paying</div>
            </div>
            <div className="glass-card p-2.5 text-center">
              <div className="text-lg font-bold text-[#3B82F6]">${revenue.arpu_monthly}</div>
              <div className="text-[9px] text-[var(--t5)]">ARPU/mo</div>
            </div>
            <div className="glass-card p-2.5 text-center">
              <div className="text-lg font-bold" style={{ color: revenue.churn_rate > 5 ? '#EF4444' : '#22C993' }}>{revenue.churn_rate}%</div>
              <div className="text-[9px] text-[var(--t5)]">Churn</div>
            </div>
            <div className="glass-card p-2.5 text-center">
              <div className="text-lg font-bold text-[#d4af37]">${revenue.ltv}</div>
              <div className="text-[9px] text-[var(--t5)]">LTV</div>
            </div>
          </div>
        </div>
      )}

      {/* Operator Work Queue Tiles — always visible, highlight when there's pending work */}
      {operatorMode && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="ops-work-tiles">
          {[
            {
              key: 'tvt',
              label: 'Transition Verification',
              sub: 'Death certificates to review',
              icon: FileKey,
              count: (stats.pending_certificates || 0) + (stats.reviewing_certificates || 0),
              color: '#F59E0B',
              path: '/ops/transition',
            },
            {
              key: 'dts',
              label: 'Trustee Services',
              sub: 'DTS requests to process',
              icon: Shield,
              count: stats.pending_dts || 0,
              color: '#8B5CF6',
              path: '/ops/dts',
            },
            {
              key: 'support',
              label: 'Customer Support',
              sub: 'Messages awaiting reply',
              icon: MessageSquare,
              count: stats.unanswered_support || 0,
              color: '#F43F5E',
              path: '/ops/support',
            },
            {
              key: 'verify',
              label: 'Tier Verifications',
              sub: 'Discount verifications pending',
              icon: ShieldCheck,
              count: stats.pending_verifications || 0,
              color: '#F97316',
              path: '/ops/verifications',
            },
          ].map(tile => {
            const hasWork = tile.count > 0;
            return (
              <div
                key={tile.key}
                onClick={() => navigate(tile.path)}
                className="rounded-xl p-4 cursor-pointer active:scale-[0.97] transition-all"
                style={{
                  background: hasWork ? `${tile.color}12` : 'var(--s)',
                  border: `2px solid ${hasWork ? `${tile.color}40` : 'var(--b)'}`,
                  boxShadow: hasWork ? `0 0 20px ${tile.color}15` : 'none',
                }}
                data-testid={`ops-tile-${tile.key}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      background: hasWork ? `${tile.color}20` : 'var(--bg2)',
                      border: `1px solid ${hasWork ? `${tile.color}30` : 'var(--b)'}`,
                    }}
                  >
                    <tile.icon className="w-5 h-5" style={{ color: hasWork ? tile.color : 'var(--t5)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--t)] truncate">{tile.label}</span>
                      {hasWork && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 animate-pulse"
                          style={{ background: `${tile.color}25`, color: tile.color }}
                        >
                          {tile.count}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--t5)] truncate mt-0.5">
                      {hasWork ? `${tile.count} ${tile.sub}` : 'All clear'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action Required — Founder only (items needing admin attention) */}
      {!operatorMode && stats && (stats.unanswered_support > 0 || stats.pending_certificates > 0 || stats.reviewing_certificates > 0 || stats.pending_verifications > 0 || stats.pending_dts > 0 || stats.pending_family_requests > 0 || stats.pending_deletions > 0) && (
        <div className="glass-card p-4" style={{ borderLeft: '3px solid #F43F5E' }}>
          <h3 className="text-sm font-bold text-[#F43F5E] mb-3 uppercase tracking-wider">Needs Your Attention</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {[
              stats.unanswered_support > 0 && { v: stats.unanswered_support, l: 'Unanswered Messages', icon: MessageSquare, color: '#F43F5E', path: '/admin/support' },
              stats.pending_certificates > 0 && { v: stats.pending_certificates, l: 'Pending Transitions', icon: FileKey, color: '#F59E0B', path: '/admin/transition' },
              stats.reviewing_certificates > 0 && { v: stats.reviewing_certificates, l: 'Reviewing Certs', icon: FileKey, color: '#FBBF24', path: '/admin/transition' },
              stats.pending_verifications > 0 && { v: stats.pending_verifications, l: 'Pending Verifications', icon: ShieldCheck, color: '#F97316', path: '/admin/verifications' },
              stats.pending_dts > 0 && { v: stats.pending_dts, l: 'Pending DTS Tasks', icon: CheckSquare, color: '#8B5CF6', path: '/admin/dts' },
              stats.pending_family_requests > 0 && { v: stats.pending_family_requests, l: 'Family Plan Requests', icon: Users, color: '#0EA5E9', path: '/admin/subscriptions' },
              stats.pending_deletions > 0 && { v: stats.pending_deletions, l: 'Deletion Requests', icon: AlertTriangle, color: '#EF4444', path: '/admin/activity' },
            ].filter(Boolean).map(s => (
              <div key={s.l} className="rounded-xl p-3 text-center cursor-pointer active:scale-[0.96] transition-transform"
                style={{ background: `${s.color}10`, border: `1px solid ${s.color}20` }}
                onClick={() => navigate(s.path)}>
                <s.icon className="w-4 h-4 mx-auto mb-1" style={{ color: s.color }} />
                <div className="text-2xl font-bold text-[var(--t)]">{s.v}</div>
                <div className="text-xs text-[var(--t4)]">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Platform Overview — founder only */}
      {!operatorMode && stats && (
        <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            { v: stats.users.total, l: 'Total Users', sub: `${stats.users.benefactors} benefactors · ${stats.users.beneficiaries} beneficiaries`, icon: Users, color: '#60A5FA', path: '/admin' },
            { v: stats.active_subscriptions, l: 'Active Subscriptions', icon: CreditCard, color: '#22C993', path: '/admin/subscriptions' },
            { v: stats.estates.active, l: 'Active Estates', sub: `${stats.estates.transitioned} transitioned`, icon: FolderLock, color: '#0EA5E9', path: '/admin/transition' },
            { v: stats.grace_periods, l: 'Trial Periods', icon: Clock, color: '#F59E0B', path: '/admin/trials' },
          ].map(s => (
            <div key={s.l} className="glass-card p-3 text-center cursor-pointer active:scale-[0.96] transition-transform"
              onClick={() => navigate(s.path)}>
              <s.icon className="w-4 h-4 mx-auto mb-1" style={{ color: s.color }} />
              <div className="text-2xl font-bold text-[var(--t)]">{s.v}</div>
              <div className="text-xs text-[var(--t4)]">{s.l}</div>
              {s.sub && <div className="text-[10px] text-[var(--t5)] mt-0.5">{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Viral Growth Metrics */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="glass-card p-3 text-center">
            <Users className="w-4 h-4 mx-auto mb-1 text-[#d4af37]" />
            <div className="text-2xl font-bold text-[var(--t)]">{stats.avg_beneficiaries_per_benefactor || 0}</div>
            <div className="text-xs text-[var(--t4)]">Avg Beneficiaries / Benefactor</div>
          </div>
          <div className="glass-card p-3 text-center cursor-pointer active:scale-[0.96] transition-transform" onClick={() => navigate('/admin')}>
            <TrendingUp className="w-4 h-4 mx-auto mb-1 text-[#22C993]" />
            <div className="text-2xl font-bold text-[var(--t)]">{stats.beneficiaries_converted || 0}</div>
            <div className="text-xs text-[var(--t4)]">Beneficiaries → Benefactors</div>
          </div>
        </div>
        </>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {TAB_CONFIG.filter(t => {
          if (operatorMode) {
            // Operators: work queues + operator tools
            const opsTabs = ['transition', 'dts', 'support', 'verifications', 'milestones', 'users', 'trials', 'my-activity', 'search', 'ops-escalations', 'shift-notes', 'ops-kb'];
            // Managers also get team management + dashboard
            if (user?.operator_role === 'manager') opsTabs.push('operators', 'ops-dashboard');
            return opsTabs.includes(t.key);
          }
          // Founder: all except operator-specific tabs
          return !['my-activity', 'search', 'ops-escalations', 'shift-notes', 'ops-kb'].includes(t.key);
        }).map(t => (
          <button key={t.key} onClick={() => navigate(operatorMode ? t.path.replace('/admin', '/ops') : t.path)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 ${
              tab === t.key ? 'bg-[var(--gold)] text-[#0F1629]' : 'bg-[var(--s)] text-[var(--t4)]'
            }`} data-testid={`admin-tab-${t.key}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'users' && <UsersTab users={users} setUsers={setUsers} currentUserId={user?.id} getAuthHeaders={getAuthHeaders} operatorMode={operatorMode} />}
      {tab === 'transition' && <TransitionTab getAuthHeaders={getAuthHeaders} onStatsChange={refreshStats} />}
      {tab === 'dts' && <DTSTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'support' && <SupportTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'subscriptions' && <SubscriptionsTab getAuthHeaders={getAuthHeaders} users={users} />}
      {tab === 'verifications' && <VerificationsTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'analytics' && <AnalyticsTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'launch' && <LaunchMetricsTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'activity' && <ActivityTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'operators' && (!operatorMode || user?.operator_role === 'manager') && <OperatorsTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'audit' && !operatorMode && <AuditTrailTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'dev-switcher' && !operatorMode && <DevSwitcherTab users={users} getAuthHeaders={getAuthHeaders} />}
      {/* New Founder features */}
      {tab === 'announcements' && !operatorMode && <AnnouncementsTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'system-health' && !operatorMode && <SystemHealthTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'escalations' && !operatorMode && <EscalationsTab getAuthHeaders={getAuthHeaders} isFounder={true} />}
      {tab === 'knowledge-base' && !operatorMode && <KnowledgeBaseTab getAuthHeaders={getAuthHeaders} isFounder={true} />}
      {tab === 'p1-settings' && !operatorMode && <P1ContactSettingsTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'estate-health' && !operatorMode && <EstateHealthTab getAuthHeaders={getAuthHeaders} />}
      {/* New Operator features */}
      {tab === 'my-activity' && operatorMode && <MyActivityTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'search' && operatorMode && <QuickSearchTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'ops-escalations' && operatorMode && <EscalationsTab getAuthHeaders={getAuthHeaders} isFounder={false} />}
      {tab === 'shift-notes' && operatorMode && <ShiftNotesTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'ops-kb' && operatorMode && <KnowledgeBaseTab getAuthHeaders={getAuthHeaders} isFounder={false} />}
      {tab === 'ops-dashboard' && <OpsDashboardTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'milestones' && <MilestoneDeliveriesTab getAuthHeaders={getAuthHeaders} />}
      {tab === 'trials' && <TrialUsersTab getAuthHeaders={getAuthHeaders} />}
    </div>
  );
};

export default AdminPage;
