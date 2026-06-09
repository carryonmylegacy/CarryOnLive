import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import {
  Shield, Loader2, Recycle,
  FileKey, Headphones, Users, CheckSquare, Activity,
  Clock, HeartPulse, MessageSquare, BarChart3, Search, AlertTriangle,
  StickyNote, BookOpen, Calendar, GraduationCap, CreditCard,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { toast } from '../utils/toast';
import { Skeleton } from '../components/ui/skeleton';
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
import { LaunchWarRoomTab } from '../components/admin/LaunchWarRoomTab';
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
import { Soc2ReadinessTab } from '../components/admin/Soc2ReadinessTab';
import { IntegrationsTab } from '../components/admin/IntegrationsTab';
import { DownloadDiagnosticsTab } from '../components/admin/DownloadDiagnosticsTab';
import { ProductAnalyticsTab } from '../components/admin/ProductAnalyticsTab';
import { AdminReferralsTab } from '../components/admin/AdminReferralsTab';
import { FunnelAnalyticsTab } from '../components/admin/FunnelAnalyticsTab';
import { BetaTestingTab } from '../components/admin/BetaTestingTab';
import { FounderEmailsTab } from '../components/admin/FounderEmailsTab';
import { FounderInvitesTab } from '../components/admin/FounderInvitesTab';
import { SiteContentTab } from '../components/admin/SiteContentTab';
import { GracePeriodsTab } from '../components/admin/GracePeriodsTab';
import { IPWhitelistTab } from '../components/admin/IPWhitelistTab';
import { ScopedAdminsTab } from '../components/admin/ScopedAdminsTab';
import { MaintenanceModeTab } from '../components/admin/MaintenanceModeTab';
import { CannedResponsesTab } from '../components/admin/CannedResponsesTab';
import { PerformanceTab } from '../components/admin/PerformanceTab';
import { SessionPolicyTab } from '../components/admin/SessionPolicyTab';
import { TeamChatTab } from '../components/admin/TeamChatTab';
import { QueueAlertsPanel } from '../components/admin/QueueAlertsPanel';
import { ShiftScheduleTab } from '../components/admin/ShiftScheduleTab';
import { TrainingTrackerTab } from '../components/admin/TrainingTrackerTab';
import { SectionMembersTab } from '../components/admin/SectionMembersTab';
import { NotificationCategoriesTab } from '../components/admin/NotificationCategoriesTab';
import { PlatformRulesTab } from '../components/admin/PlatformRulesTab';
import { EmergencyAccessTab } from '../components/admin/EmergencyAccessTab';
import { PrototypesTab } from '../components/admin/PrototypesTab';
import { PartnersTab } from '../components/admin/PartnersTab';
import { VoicesTab } from '../components/admin/VoicesTab';
import SalesBriefTab from '../components/admin/SalesBriefTab';
import AdminCommandPalette from '../components/admin/AdminCommandPalette';
import AdminHeaderIconButton from '../components/admin/AdminHeaderIconButton';
import AdminSectionLayout from '../components/admin/AdminSectionLayout';
import {
  ADMIN_SECTIONS,
  TAB_TO_SECTION,
  visibleAdminSections,
} from '../config/adminSections';

// Operator-mode tabs (unchanged structure — operator portal keeps the
// flat tab strip; the Section→Tab IA refactor only applies to the
// founder/scoped-admin Admin Portal).
const OPERATOR_TABS = [
  { key: 'transition', label: 'TVT', icon: FileKey, path: '/ops/transition' },
  { key: 'dts', label: 'DTS', icon: Shield, path: '/ops/dts' },
  { key: 'support', label: 'Support', icon: Headphones, path: '/ops/support' },
  { key: 'verifications', label: 'Verify', icon: FileKey, path: '/ops/verifications' },
  { key: 'milestones', label: 'Milestones', icon: CheckSquare, path: '/ops/milestones' },
  { key: 'users', label: 'Users', icon: Users, path: '/ops/users' },
  { key: 'trials', label: 'Trials', icon: Clock, path: '/ops/trials' },
  { key: 'estate-health', label: 'Estate Health', icon: HeartPulse, path: '/ops/estate-health' },
  { key: 'system-health', label: 'System', icon: HeartPulse, path: '/ops/system-health' },
  { key: 'canned-responses', label: 'Templates', icon: MessageSquare, path: '/ops/canned-responses' },
  { key: 'my-activity', label: 'My Activity', icon: Clock, path: '/ops/my-activity' },
  { key: 'performance', label: 'My Stats', icon: BarChart3, path: '/ops/performance' },
  { key: 'search', label: 'Search', icon: Search, path: '/ops/search' },
  { key: 'ops-escalations', label: 'Escalate', icon: AlertTriangle, path: '/ops/escalations' },
  { key: 'shift-notes', label: 'Shift Notes', icon: StickyNote, path: '/ops/shift-notes' },
  { key: 'ops-kb', label: 'SOPs', icon: BookOpen, path: '/ops/knowledge-base' },
  { key: 'team-chat', label: 'Team Chat', icon: MessageSquare, path: '/ops/team-chat' },
  { key: 'shifts', label: 'Schedules', icon: Calendar, path: '/ops/shifts' },
  { key: 'training', label: 'Training', icon: GraduationCap, path: '/ops/training' },
];

const MANAGER_EXTRA_TABS = [
  { key: 'operators', label: 'Team', icon: Users, path: '/ops/operators' },
  { key: 'ops-dashboard', label: 'Dashboard', icon: Activity, path: '/ops/ops-dashboard' },
  { key: 'subscriptions', label: 'Subs', icon: CreditCard, path: '/ops/subscriptions' },
  { key: 'platform-rules', label: 'Rules', icon: Shield, path: '/ops/platform-rules' },
];

// Path → tab key. Built from ADMIN_SECTIONS + section landings + ops
// portal + the friendly aliases we already supported (Apr 27 2026).
const PATH_TO_TAB = (() => {
  const m = {};
  ADMIN_SECTIONS.forEach(s => s.tabs.forEach(t => { m[t.path] = t.key; }));
  // Operator-mode paths
  OPERATOR_TABS.forEach(t => { m[t.path] = t.key; });
  MANAGER_EXTRA_TABS.forEach(t => { m[t.path] = t.key; });
  // Friendly aliases (kept so existing bookmarks and pasted URLs work).
  Object.assign(m, {
    '/admin/invites': 'founder-invites',
    '/admin/templates': 'canned-responses',
    '/admin/members': 'ops-members',
    '/admin/platform-health': 'system-health',
    '/admin/launch-war-room': 'war-room',
    '/admin/feature-gates': 'subscriptions',
    '/ops/dashboard': 'ops-dashboard',
  });
  return m;
})();

// Section landings (no tab — render the first tab's content).
const SECTION_LANDING_PATHS = new Set(ADMIN_SECTIONS.map(s => `/admin/${s.key}`));

const AdminPage = ({ operatorMode = false }) => {
  const { user, getAuthHeaders } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const scopeParam = new URLSearchParams(location.search).get('scope');
  const defaultOpsTab = user?.operator_role === 'manager' ? 'ops-dashboard' : 'transition';

  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [opsDash, setOpsDash] = useState(null);
  const [dashEvents, setDashEvents] = useState(null);
  const [teamTasks, setTeamTasks] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [pendingAccessReqs, setPendingAccessReqs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [, setOtpDisabled] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  // Admin scope: founder sees all, scoped admins see only their sections.
  const serverScope = user?.admin_scope || user?._serverScope || 'founder';
  const serverScopes = Array.isArray(serverScope) ? serverScope : (serverScope ? [serverScope] : ['founder']);
  const adminScopes = scopeParam ? [scopeParam] : (serverScopes.length > 0 ? serverScopes : ['founder']);
  const isFounder = adminScopes.includes('founder');
  const isManager = user?.operator_role === 'manager';

  // Sections visible to this admin (scope-filtered).
  const sections = visibleAdminSections(adminScopes);

  // Resolve current view based on URL:
  //   /admin               → Founder Dashboard (revenue + code health only)
  //   /admin/<section>     → Section landing (first tab active)
  //   /admin/<tab-path>    → Section + that tab active
  //   /ops/*               → Operator portal (legacy flat tab strip)
  const pathname = location.pathname;
  const isFounderDashboard = !operatorMode && pathname === '/admin';

  let currentSectionKey = null;
  let currentTabKey = null;

  if (operatorMode) {
    currentTabKey = PATH_TO_TAB[pathname] || defaultOpsTab;
  } else if (!isFounderDashboard) {
    // Section landing?
    const landingMatch = pathname.match(/^\/admin\/([a-z-]+)$/);
    if (landingMatch && SECTION_LANDING_PATHS.has(`/admin/${landingMatch[1]}`)) {
      currentSectionKey = landingMatch[1];
    } else {
      // Tab path → resolve section
      currentTabKey = PATH_TO_TAB[pathname];
      if (currentTabKey) {
        currentSectionKey = TAB_TO_SECTION[currentTabKey];
      }
      // Unknown admin path → fall back to founder dashboard
      if (!currentSectionKey) {
        // Final fallback: send to founder dashboard (or first visible section
        // for scoped admins).
        if (isFounder) {
          // Render founder dashboard view
        } else if (sections.length > 0) {
          currentSectionKey = sections[0].key;
        }
      }
    }
  }

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const res = await apiClient.post(`${API_URL}/admin/cleanup-orphans`, {}, getAuthHeaders());
      const d = res.data.deleted;
      const total = Object.values(d).reduce((a, b) => a + b, 0);
      if (total > 0) {
        toast.success(`Cleaned up ${total} orphaned record(s)`);
        const [statsRes, usersRes] = await Promise.all([
          apiClient.get(`${API_URL}/admin/stats`, getAuthHeaders()),
          apiClient.get(`${API_URL}/admin/users`, getAuthHeaders()),
        ]);
        setStats(statsRes.data);
        setUsers(usersRes.data);
      } else {
        toast.success('No orphaned records found');
      }
    } catch (_err) { toast.error('Cleanup failed'); }
    finally { setCleaning(false); }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (operatorMode) {
          const fetches = [
            apiClient.get(`${API_URL}/admin/stats`, getAuthHeaders()),
            apiClient.get(`${API_URL}/admin/users`, getAuthHeaders()),
            apiClient.get(`${API_URL}/ops/dashboard-events`, getAuthHeaders()).catch(() => ({ data: null })),
          ];
          if (user?.operator_role === 'manager') {
            fetches.push(apiClient.get(`${API_URL}/ops/dashboard`, getAuthHeaders()).catch(() => ({ data: null })));
            fetches.push(apiClient.get(`${API_URL}/ops/team-tasks`, getAuthHeaders()).catch(() => ({ data: null })));
          }
          const results = await Promise.all(fetches);
          setStats(results[0].data);
          setUsers(results[1].data);
          if (results[2]?.data) setDashEvents(results[2].data);
          if (results[3]?.data) setOpsDash(results[3].data);
          if (results[4]?.data) setTeamTasks(results[4].data);
        } else {
          const [usersRes, statsRes, settingsRes, revenueRes, accessReqsRes] = await Promise.all([
            apiClient.get(`${API_URL}/admin/users`, getAuthHeaders()),
            apiClient.get(`${API_URL}/admin/stats`, getAuthHeaders()),
            apiClient.get(`${API_URL}/admin/platform-settings`, getAuthHeaders()).catch(() => ({ data: {} })),
            apiClient.get(`${API_URL}/admin/revenue-metrics`, getAuthHeaders()).catch(() => ({ data: null })),
            apiClient.get(`${API_URL}/founder/requests`, getAuthHeaders()).catch(() => ({ data: [] })),
          ]);
          setUsers(usersRes.data);
          setStats(statsRes.data);
          setOtpDisabled(settingsRes.data?.otp_disabled || false);
          setRevenue(revenueRes.data);
          const pending = Array.isArray(accessReqsRes.data) ? accessReqsRes.data.filter(r => r.status === 'pending').length : 0;
          setPendingAccessReqs(pending);
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshStats = async () => {
    try {
      const statsRes = await apiClient.get(`${API_URL}/admin/stats`, getAuthHeaders());
      setStats(statsRes.data);
    } catch {}
  };

  useEffect(() => {
    if (!operatorMode) return;
    const poll = setInterval(async () => {
      try {
        const [statsRes, eventsRes] = await Promise.all([
          apiClient.get(`${API_URL}/admin/stats`, getAuthHeaders()),
          apiClient.get(`${API_URL}/ops/dashboard-events`, getAuthHeaders()).catch(() => null),
        ]);
        setStats(statsRes.data);
        if (eventsRes?.data) setDashEvents(eventsRes.data);
        if (user?.operator_role === 'manager') {
          const [dashRes, tasksRes] = await Promise.all([
            apiClient.get(`${API_URL}/ops/dashboard`, getAuthHeaders()).catch(() => null),
            apiClient.get(`${API_URL}/ops/team-tasks`, getAuthHeaders()).catch(() => null),
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

  // ── Render the actual tab content for a given tab key ─────────
  const renderTabContent = (tabKey) => {
    switch (tabKey) {
      case 'users': return <UsersTab users={users} setUsers={setUsers} currentUserId={user?.id} getAuthHeaders={getAuthHeaders} operatorMode={operatorMode} />;
      case 'transition': return <TransitionTab getAuthHeaders={getAuthHeaders} onStatsChange={refreshStats} />;
      case 'dts': return <DTSTab getAuthHeaders={getAuthHeaders} />;
      case 'support': return <SupportTab getAuthHeaders={getAuthHeaders} />;
      case 'subscriptions': return <SubscriptionsTab getAuthHeaders={getAuthHeaders} users={users} operatorMode={operatorMode} />;
      case 'partners': return <PartnersTab getAuthHeaders={getAuthHeaders} />;
      case 'verifications': return <VerificationsTab getAuthHeaders={getAuthHeaders} />;
      case 'analytics': return <AnalyticsTab getAuthHeaders={getAuthHeaders} />;
      case 'launch': return <LaunchMetricsTab getAuthHeaders={getAuthHeaders} />;
      case 'activity': return <ActivityTab getAuthHeaders={getAuthHeaders} />;
      case 'operators': return <OperatorsTab getAuthHeaders={getAuthHeaders} />;
      case 'audit': return <AuditTrailTab getAuthHeaders={getAuthHeaders} />;
      case 'soc2-readiness': return <Soc2ReadinessTab getAuthHeaders={getAuthHeaders} />;
      case 'dev-switcher': return <DevSwitcherTab users={users} getAuthHeaders={getAuthHeaders} />;
      case 'announcements': return <AnnouncementsTab getAuthHeaders={getAuthHeaders} />;
      case 'system-health': return <SystemHealthTab getAuthHeaders={getAuthHeaders} />;
      case 'war-room': return <LaunchWarRoomTab />;
      case 'escalations': return <EscalationsTab getAuthHeaders={getAuthHeaders} isFounder={isFounder} isManager={isManager} />;
      case 'knowledge-base': return <KnowledgeBaseTab getAuthHeaders={getAuthHeaders} isFounder={true} />;
      case 'p1-settings': return <P1ContactSettingsTab getAuthHeaders={getAuthHeaders} />;
      case 'estate-health': return <EstateHealthTab getAuthHeaders={getAuthHeaders} />;
      case 'integrations': return <IntegrationsTab getAuthHeaders={getAuthHeaders} />;
      case 'download-diagnostics': return <DownloadDiagnosticsTab />;
      case 'product-analytics': return <ProductAnalyticsTab />;
      case 'referrals': return <AdminReferralsTab />;
      case 'funnel': return <FunnelAnalyticsTab getAuthHeaders={getAuthHeaders} />;
      case 'beta-testing': return <BetaTestingTab getAuthHeaders={getAuthHeaders} />;
      case 'founder-emails': return <FounderEmailsTab getAuthHeaders={getAuthHeaders} />;
      case 'founder-invites': return <FounderInvitesTab onPendingChange={setPendingAccessReqs} />;
      case 'site-content': return <SiteContentTab getAuthHeaders={getAuthHeaders} />;
      case 'grace-periods': return <GracePeriodsTab getAuthHeaders={getAuthHeaders} />;
      case 'trials': return <TrialUsersTab getAuthHeaders={getAuthHeaders} />;
      case 'scoped-admins': return <ScopedAdminsTab getAuthHeaders={getAuthHeaders} />;
      case 'ip-whitelist': return <IPWhitelistTab getAuthHeaders={getAuthHeaders} />;
      case 'maintenance': return <MaintenanceModeTab getAuthHeaders={getAuthHeaders} />;
      case 'canned-responses': return <CannedResponsesTab getAuthHeaders={getAuthHeaders} isManager={isFounder || isManager} />;
      case 'performance': return <PerformanceTab getAuthHeaders={getAuthHeaders} />;
      case 'team-chat': return <TeamChatTab getAuthHeaders={getAuthHeaders} />;
      case 'session-policy': return <SessionPolicyTab getAuthHeaders={getAuthHeaders} />;
      case 'shifts': return <ShiftScheduleTab getAuthHeaders={getAuthHeaders} />;
      case 'training': return <TrainingTrackerTab getAuthHeaders={getAuthHeaders} />;
      case 'notification-categories': return <NotificationCategoriesTab getAuthHeaders={getAuthHeaders} />;
      case 'voices': return <VoicesTab getAuthHeaders={getAuthHeaders} />;
      case 'prototypes': return <PrototypesTab />;
      case 'ops-members': return <SectionMembersTab getAuthHeaders={getAuthHeaders} sectionScopes={['ops_manager', 'ops_team']} sectionLabel="Operations" />;
      case 'finance-members': return <SectionMembersTab getAuthHeaders={getAuthHeaders} sectionScopes={['finance']} sectionLabel="Finance" />;
      case 'platform-rules': return <PlatformRulesTab getAuthHeaders={getAuthHeaders} />;
      case 'marketing-members': return <SectionMembersTab getAuthHeaders={getAuthHeaders} sectionScopes={['marketing']} sectionLabel="Marketing" />;
      case 'sales-brief': return <SalesBriefTab />;
      case 'compliance-members': return <SectionMembersTab getAuthHeaders={getAuthHeaders} sectionScopes={['compliance']} sectionLabel="Compliance" />;
      case 'platform-members': return <SectionMembersTab getAuthHeaders={getAuthHeaders} sectionScopes={['platform_health']} sectionLabel="Platform" />;
      case 'my-activity': return operatorMode ? <MyActivityTab getAuthHeaders={getAuthHeaders} /> : null;
      case 'search': return operatorMode ? <QuickSearchTab getAuthHeaders={getAuthHeaders} /> : null;
      case 'ops-escalations': return operatorMode ? <EscalationsTab getAuthHeaders={getAuthHeaders} isFounder={false} isManager={isManager} /> : null;
      case 'shift-notes': return operatorMode ? <ShiftNotesTab getAuthHeaders={getAuthHeaders} /> : null;
      case 'ops-kb': return operatorMode ? <KnowledgeBaseTab getAuthHeaders={getAuthHeaders} isFounder={false} /> : null;
      case 'ops-dashboard': return <OpsDashboardTab getAuthHeaders={getAuthHeaders} />;
      case 'milestones': return <MilestoneDeliveriesTab getAuthHeaders={getAuthHeaders} />;
      case 'emergency-access': return <EmergencyAccessTab getAuthHeaders={getAuthHeaders} />;
      default: return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  //  OPERATOR PORTAL — legacy flat tab strip (unchanged behavior)
  // ═══════════════════════════════════════════════════════════════════
  if (operatorMode) {
    const opsTabs = [...OPERATOR_TABS, ...((isManager || user?.role === 'admin') ? MANAGER_EXTRA_TABS : [])];
    const effectiveTab = currentTabKey || defaultOpsTab;
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in max-w-full overflow-x-hidden" data-testid="admin-dashboard">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>Operations Dashboard</h1>
            <p className="text-xs sm:text-sm text-[var(--t5)]">Transition Verification · Customer Service · Trustee Services</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <AdminCommandPalette tabs={opsTabs} operatorMode={true} />
            <QueueAlertsPanel />
          </div>
        </div>
        <OpsWorkTiles stats={stats} dashEvents={dashEvents} />
        {(isManager || user?.role === 'admin') && (
          <TeamActivitySection teamTasks={teamTasks} opsDash={opsDash} />
        )}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide items-center" data-testid="admin-tab-bar" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {opsTabs.map(t => (
            <button key={t.key} onClick={() => navigate(t.path)}
              className={`flex items-center gap-1.5 rounded-lg font-bold transition-all whitespace-nowrap flex-shrink-0 active:scale-[0.97] px-3.5 py-2.5 text-sm min-h-[44px] ${
                effectiveTab === t.key ? 'gold-pill' : 'bg-[var(--s)] text-[var(--t4)]'
              }`} data-testid={`admin-tab-${t.key}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
        <div style={{ minHeight: '100vh' }}>{renderTabContent(effectiveTab)}</div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  FOUNDER DASHBOARD — `/admin` exactly. Revenue + Code Health only.
  // ═══════════════════════════════════════════════════════════════════
  if (isFounderDashboard) {
    const getDashboardTitle = () => {
      if (isFounder) return 'Founder Dashboard';
      const labels = { finance: 'Finance', compliance: 'Compliance', marketing: 'Marketing', platform_health: 'Platform Health', ops_manager: 'Operations', ops_team: 'Operations' };
      const scopeNames = adminScopes.map(s => labels[s] || s).join(' + ');
      return `${scopeNames} Dashboard`;
    };
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in max-w-full overflow-x-hidden" data-testid="admin-dashboard">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>{getDashboardTitle()}</h1>
            <p className="text-xs sm:text-sm text-[var(--t5)]">
              {isFounder
                ? 'Operations \u00B7 Finance \u00B7 Marketing \u00B7 Compliance \u00B7 Platform'
                : `Scoped access \u2014 ${adminScopes.join(', ').replace(/_/g, ' ')}`
              }
            </p>
          </div>
          {isFounder && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <AdminCommandPalette tabs={sections.flatMap(s => s.tabs)} operatorMode={false} />
              <QueueAlertsPanel />
              <AdminHeaderIconButton
                onClick={handleCleanup}
                disabled={cleaning}
                title="Remove orphaned records from deleted users"
                data-testid="admin-cleanup-btn"
              >
                {cleaning ? <Loader2 className="animate-spin" /> : <Recycle />}
              </AdminHeaderIconButton>
            </div>
          )}
        </div>
        {(isFounder || adminScopes.includes('finance')) && <RevenuePanel revenue={revenue} />}
        {isFounder && <ActionRequired stats={stats} navigate={navigate} />}
        {(isFounder || adminScopes.includes('platform_health')) && stats && <PlatformOverview stats={stats} />}
        {(isFounder || adminScopes.includes('platform_health')) && <CodeHealthTile getAuthHeaders={getAuthHeaders} />}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SECTION / TAB PAGES — `/admin/<section>` or `/admin/<tabpath>`
  // ═══════════════════════════════════════════════════════════════════
  if (currentSectionKey) {
    // Scope guard — if the section isn't allowed for this admin's scopes,
    // bounce them to their founder dashboard / first allowed section.
    const allowed = sections.find(s => s.key === currentSectionKey);
    if (!allowed) {
      // Redirect inline by navigating
      setTimeout(() => navigate(isFounder ? '/admin' : (sections[0] ? `/admin/${sections[0].key}` : '/admin')), 0);
      return <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6"><Skeleton className="h-12 w-64 bg-[var(--s)]" /></div>;
    }
    return (
      <AdminSectionLayout
        sectionKey={currentSectionKey}
        activeTabKey={currentTabKey}
        scopeParam={scopeParam}
        pendingAccessReqs={pendingAccessReqs}
      >
        {renderTabContent(currentTabKey || allowed.tabs[0]?.key)}
      </AdminSectionLayout>
    );
  }

  // Fallback — unknown admin path. Send to founder dashboard.
  return null;
};

export default AdminPage;
