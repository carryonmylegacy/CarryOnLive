import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, Users, FileKey, Loader2,
  Headphones, CreditCard, Activity, Settings,
  MessageSquare, CheckSquare, AlertTriangle, Clock, TrendingUp, Trash2,
  Megaphone, HeartPulse, Search, StickyNote, BookOpen, Gift, Zap, ImageIcon
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { toast } from '../utils/toast';
import { Skeleton } from '../components/ui/skeleton';
import { useScrollLock } from '../hooks/useScrollLock';
import { RevenuePanel } from '../components/admin/RevenuePanel';
import { OpsWorkTiles } from '../components/admin/OpsWorkTiles';
import { TeamActivitySection } from '../components/admin/TeamActivitySection';
import { ActionRequired, PlatformOverview } from '../components/admin/PlatformOverview';
import { CodeHealthTile } from '../components/admin/CodeHealthTile';


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
  { key: 'users', label: 'Users', icon: Users, path: '/admin/users' },
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
  '/admin/users': 'users',
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
  '/ops/estate-health': 'estate-health',
  '/ops/subscriptions': 'subscriptions',
  '/ops/system-health': 'system-health',
};

const AdminPage = ({ operatorMode = false }) => {
  const { user, getAuthHeaders } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const defaultOpsTab = user?.operator_role === 'manager' ? 'ops-dashboard' : 'transition';
  const tab = PATH_TO_TAB[location.pathname] || (operatorMode ? defaultOpsTab : 'users');
  // If founder lands on /admin with no specific tab, default to users
  const effectiveTab = (!operatorMode && location.pathname === '/admin') ? 'users' : tab;

  useScrollLock(effectiveTab);

  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [opsDash, setOpsDash] = useState(null);
  const [dashEvents, setDashEvents] = useState(null);
  const [teamTasks, setTeamTasks] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, setOtpDisabled] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [migrating, setMigrating] = useState(false);

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

  const handleMigratePhotos = async () => {
    setMigrating(true);
    try {
      const res = await axios.post(`${API_URL}/admin/migrate-photos`, {}, getAuthHeaders());
      const d = res.data;
      if (d.migrated > 0) {
        const parts = [];
        if (d.breakdown.users) parts.push(`${d.breakdown.users} user`);
        if (d.breakdown.beneficiaries) parts.push(`${d.breakdown.beneficiaries} beneficiary`);
        if (d.breakdown.estates) parts.push(`${d.breakdown.estates} estate`);
        if (d.breakdown.display_overrides) parts.push(`${d.breakdown.display_overrides} override`);
        toast.success(`Migrated ${d.migrated} photos to S3: ${parts.join(', ')}`);
      } else {
        toast.success('All photos already on S3 — nothing to migrate');
      }
      if (d.errors?.length > 0) {
        toast(`${d.errors.length} photo(s) skipped (invalid data)`);
      }
    } catch (err) { toast.error('Migration failed'); }
    finally { setMigrating(false); }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (operatorMode) {
          // Operators need stats + users (for Users tab) + dashboard events
          const fetches = [
            axios.get(`${API_URL}/admin/stats`, getAuthHeaders()),
            axios.get(`${API_URL}/admin/users`, getAuthHeaders()),
            axios.get(`${API_URL}/ops/dashboard-events`, getAuthHeaders()).catch(() => ({ data: null })),
          ];
          // Manager also gets ops dashboard + team tasks
          if (user?.operator_role === 'manager') {
            fetches.push(axios.get(`${API_URL}/ops/dashboard`, getAuthHeaders()).catch(() => ({ data: null })));
            fetches.push(axios.get(`${API_URL}/ops/team-tasks`, getAuthHeaders()).catch(() => ({ data: null })));
          }
          const results = await Promise.all(fetches);
          setStats(results[0].data);
          setUsers(results[1].data);
          if (results[2]?.data) setDashEvents(results[2].data);
          if (results[3]?.data) setOpsDash(results[3].data);
          if (results[4]?.data) setTeamTasks(results[4].data);
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

  // Poll stats every 30s so new requests "pop in" for operators
  useEffect(() => {
    if (!operatorMode) return;
    const poll = setInterval(async () => {
      try {
        const [statsRes, eventsRes] = await Promise.all([
          axios.get(`${API_URL}/admin/stats`, getAuthHeaders()),
          axios.get(`${API_URL}/ops/dashboard-events`, getAuthHeaders()).catch(() => null),
        ]);
        setStats(statsRes.data);
        if (eventsRes?.data) setDashEvents(eventsRes.data);
        if (user?.operator_role === 'manager') {
          const [dashRes, tasksRes] = await Promise.all([
            axios.get(`${API_URL}/ops/dashboard`, getAuthHeaders()).catch(() => null),
            axios.get(`${API_URL}/ops/team-tasks`, getAuthHeaders()).catch(() => null),
          ]);
          if (dashRes?.data) setOpsDash(dashRes.data);
          if (tasksRes?.data) setTeamTasks(tasksRes.data);
        }
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
        <div className="flex items-center gap-2">
          <button
            onClick={handleMigratePhotos}
            disabled={migrating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-[var(--t5)] hover:text-[var(--t3)] transition-colors"
            style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
            title="Migrate remaining base64 photos to S3"
            data-testid="admin-migrate-photos-btn"
          >
            {migrating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
            Migrate Photos
          </button>
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
        </div>
        )}
      </div>

      {/* Revenue Analytics — founder only */}
      {!operatorMode && <RevenuePanel revenue={revenue} />}

      {/* Operator Work Queue Tiles */}
      {operatorMode && <OpsWorkTiles stats={stats} dashEvents={dashEvents} />}

      {/* Manager: Team Activity Overview */}
      {operatorMode && user?.operator_role === 'manager' && (
        <TeamActivitySection teamTasks={teamTasks} opsDash={opsDash} />
      )}

      {/* Action Required — Founder only */}
      {!operatorMode && <ActionRequired stats={stats} navigate={navigate} />}

      {/* Platform Overview — founder only */}
      {!operatorMode && stats && <PlatformOverview stats={stats} />}

      {/* Code Health — founder only */}
      {!operatorMode && <CodeHealthTile getAuthHeaders={getAuthHeaders} />}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" data-testid="admin-tab-bar" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {TAB_CONFIG.filter(t => {
          if (operatorMode) {
            // Operators: work queues + operator tools
            const opsTabs = ['transition', 'dts', 'support', 'verifications', 'milestones', 'users', 'trials', 'system-health', 'estate-health', 'my-activity', 'search', 'ops-escalations', 'shift-notes', 'ops-kb'];
            // Managers and Founders also get team management + dashboard + subscriptions
            if (user?.operator_role === 'manager' || user?.role === 'admin') opsTabs.push('operators', 'ops-dashboard', 'subscriptions');
            return opsTabs.includes(t.key);
          }
          // Founder: all except operator-specific tabs
          return !['my-activity', 'search', 'ops-escalations', 'shift-notes', 'ops-kb'].includes(t.key);
        }).map(t => (
          <button key={t.key} onClick={() => navigate(operatorMode ? t.path.replace('/admin', '/ops') : t.path)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 ${
              effectiveTab === t.key ? 'bg-[var(--gold)] text-[#0F1629]' : 'bg-[var(--s)] text-[var(--t4)]'
            }`} data-testid={`admin-tab-${t.key}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content — min-height ensures scroll position is preserved when switching tabs */}
      <div style={{ minHeight: '100vh' }}>
      {effectiveTab === 'users' && <UsersTab users={users} setUsers={setUsers} currentUserId={user?.id} getAuthHeaders={getAuthHeaders} operatorMode={operatorMode} />}
      {effectiveTab === 'transition' && <TransitionTab getAuthHeaders={getAuthHeaders} onStatsChange={refreshStats} />}
      {effectiveTab === 'dts' && <DTSTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'support' && <SupportTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'subscriptions' && <SubscriptionsTab getAuthHeaders={getAuthHeaders} users={users} operatorMode={operatorMode} />}
      {effectiveTab === 'verifications' && <VerificationsTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'analytics' && <AnalyticsTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'launch' && <LaunchMetricsTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'activity' && <ActivityTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'operators' && (!operatorMode || user?.operator_role === 'manager') && <OperatorsTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'audit' && !operatorMode && <AuditTrailTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'dev-switcher' && !operatorMode && <DevSwitcherTab users={users} getAuthHeaders={getAuthHeaders} />}
      {/* New Founder features */}
      {effectiveTab === 'announcements' && !operatorMode && <AnnouncementsTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'system-health' && <SystemHealthTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'escalations' && !operatorMode && <EscalationsTab getAuthHeaders={getAuthHeaders} isFounder={true} />}
      {effectiveTab === 'knowledge-base' && !operatorMode && <KnowledgeBaseTab getAuthHeaders={getAuthHeaders} isFounder={true} />}
      {effectiveTab === 'p1-settings' && !operatorMode && <P1ContactSettingsTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'estate-health' && <EstateHealthTab getAuthHeaders={getAuthHeaders} />}
      {/* New Operator features */}
      {effectiveTab === 'my-activity' && operatorMode && <MyActivityTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'search' && operatorMode && <QuickSearchTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'ops-escalations' && operatorMode && <EscalationsTab getAuthHeaders={getAuthHeaders} isFounder={false} />}
      {effectiveTab === 'shift-notes' && operatorMode && <ShiftNotesTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'ops-kb' && operatorMode && <KnowledgeBaseTab getAuthHeaders={getAuthHeaders} isFounder={false} />}
      {effectiveTab === 'ops-dashboard' && <OpsDashboardTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'milestones' && <MilestoneDeliveriesTab getAuthHeaders={getAuthHeaders} />}
      {effectiveTab === 'trials' && <TrialUsersTab getAuthHeaders={getAuthHeaders} />}
      </div>
    </div>
  );
};

export default AdminPage;
