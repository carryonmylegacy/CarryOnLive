import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import apiClient from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import {
  Shield, Users, FileKey, Loader2,
  Headphones, CreditCard, Activity, Settings,
  CheckSquare, AlertTriangle, Clock, TrendingUp, Recycle,
  Megaphone, HeartPulse, Search, StickyNote, BookOpen, Gift, Zap, Puzzle, Mail, Film, Hourglass,
  Globe, UserCog, Power, MessageSquare, BarChart3, Download, Radio,
  Calendar, GraduationCap, Bell, Sparkles, MessageSquareQuote, FileText, Briefcase
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
import { PrototypesTab } from '../components/admin/PrototypesTab';
import { PartnersTab } from '../components/admin/PartnersTab';
import { VoicesTab } from '../components/admin/VoicesTab';
import SalesBriefTab from '../components/admin/SalesBriefTab';
import AdminCommandPalette from '../components/admin/AdminCommandPalette';
import AdminHeaderIconButton from '../components/admin/AdminHeaderIconButton';

// ── Section-based tab organization ────────────────────────
// Each section has a label, scopes (which admin scopes can see it), and tabs
const FOUNDER_SECTIONS = [
  {
    section: 'Operations',
    scopes: ['founder', 'ops_manager', 'ops_team'],
    tabs: [
      { key: 'users', label: 'Users', icon: Users, path: '/admin/users' },
      { key: 'founder-invites', label: 'Invites', icon: Gift, path: '/admin/founder-invites' },
      { key: 'transition', label: 'TVT', icon: FileKey, path: '/admin/transition' },
      { key: 'dts', label: 'DTS', icon: Shield, path: '/admin/dts' },
      { key: 'support', label: 'Support', icon: Headphones, path: '/admin/support' },
      { key: 'verifications', label: 'Verify', icon: FileKey, path: '/admin/verifications' },
      { key: 'milestones', label: 'Milestones', icon: CheckSquare, path: '/admin/milestones' },
      { key: 'escalations', label: 'Escalations', icon: AlertTriangle, path: '/admin/escalations' },
      { key: 'ops-dashboard', label: 'Ops Dashboard', icon: Activity, path: '/admin/ops-dashboard' },
      { key: 'canned-responses', label: 'Templates', icon: MessageSquare, path: '/admin/canned-responses' },
      { key: 'team-chat', label: 'Team Chat', icon: MessageSquare, path: '/admin/team-chat' },
      { key: 'ops-members', label: 'Members', icon: UserCog, path: '/admin/ops-members' },
    ],
  },
  {
    section: 'Finance',
    scopes: ['founder', 'finance'],
    tabs: [
      { key: 'subscriptions', label: 'Subs', icon: CreditCard, path: '/admin/subscriptions' },
      { key: 'partners', label: 'Partners', icon: Briefcase, path: '/admin/partners' },
      { key: 'platform-rules', label: 'Rules', icon: Shield, path: '/admin/platform-rules' },
      { key: 'analytics', label: 'Revenue', icon: Activity, path: '/admin/analytics' },
      { key: 'launch', label: 'Launch', icon: TrendingUp, path: '/admin/launch' },
      { key: 'grace-periods', label: 'Grace Periods', icon: Hourglass, path: '/admin/grace-periods' },
      { key: 'trials', label: 'Trials', icon: Clock, path: '/admin/trials' },
      { key: 'finance-members', label: 'Members', icon: UserCog, path: '/admin/finance-members' },
    ],
  },
  {
    section: 'Marketing',
    scopes: ['founder', 'marketing'],
    tabs: [
      { key: 'funnel', label: 'Funnel', icon: TrendingUp, path: '/admin/funnel' },
      { key: 'sales-brief', label: 'Sales Brief', icon: FileText, path: '/admin/sales-brief' },
      { key: 'beta-testing', label: 'Beta Testing', icon: Zap, path: '/admin/beta-testing' },
      { key: 'site-content', label: 'Site Content', icon: Film, path: '/admin/site-content' },
      { key: 'founder-emails', label: 'Emails', icon: Mail, path: '/admin/founder-emails' },
      { key: 'announcements', label: 'Announcements', icon: Megaphone, path: '/admin/announcements' },
      { key: 'marketing-members', label: 'Members', icon: UserCog, path: '/admin/marketing-members' },
    ],
  },
  {
    section: 'Compliance',
    scopes: ['founder', 'compliance'],
    tabs: [
      { key: 'audit', label: 'Audit Trail', icon: Shield, path: '/admin/audit' },
      { key: 'estate-health', label: 'Estate Health', icon: HeartPulse, path: '/admin/estate-health' },
      { key: 'activity', label: 'Activity Log', icon: Activity, path: '/admin/activity' },
      { key: 'compliance-members', label: 'Members', icon: UserCog, path: '/admin/compliance-members' },
    ],
  },
  {
    section: 'Platform',
    scopes: ['founder', 'platform_health'],
    tabs: [
      { key: 'war-room', label: 'War Room', icon: Radio, path: '/admin/war-room' },
      { key: 'system-health', label: 'System Health', icon: HeartPulse, path: '/admin/system-health' },
      { key: 'operators', label: 'Operators', icon: Users, path: '/admin/operators' },
      { key: 'integrations', label: 'Integrations', icon: Puzzle, path: '/admin/integrations' },
      { key: 'download-diagnostics', label: 'Downloads', icon: Download, path: '/admin/download-diagnostics' },
      { key: 'product-analytics', label: 'Product', icon: TrendingUp, path: '/admin/product-analytics' },
      { key: 'referrals', label: 'Referrals', icon: Gift, path: '/admin/referrals' },
      { key: 'p1-settings', label: 'P1 Contact', icon: AlertTriangle, path: '/admin/p1-settings' },
      { key: 'knowledge-base', label: 'Knowledge Base', icon: BookOpen, path: '/admin/knowledge-base' },
      { key: 'performance', label: 'Performance', icon: BarChart3, path: '/admin/performance' },
      { key: 'shifts', label: 'Schedules', icon: Calendar, path: '/admin/shifts' },
      { key: 'training', label: 'Training', icon: GraduationCap, path: '/admin/training' },
      { key: 'platform-members', label: 'Members', icon: UserCog, path: '/admin/platform-members' },
    ],
  },
  {
    section: 'Admin',
    scopes: ['founder'],
    tabs: [
      { key: 'scoped-admins', label: 'Admin Accounts', icon: UserCog, path: '/admin/scoped-admins' },
      { key: 'ip-whitelist', label: 'IP Whitelist', icon: Globe, path: '/admin/ip-whitelist' },
      { key: 'session-policy', label: 'Session Policy', icon: Clock, path: '/admin/session-policy' },
      { key: 'maintenance', label: 'Maintenance', icon: Power, path: '/admin/maintenance' },
      { key: 'dev-switcher', label: 'Dev Switcher', icon: Settings, path: '/admin/dev-switcher' },
      { key: 'notification-categories', label: 'Notifications', icon: Bell, path: '/admin/notification-categories' },
      { key: 'voices', label: 'Voices', icon: MessageSquareQuote, path: '/admin/voices' },
      { key: 'prototypes', label: 'Prototypes', icon: Sparkles, path: '/admin/prototypes' },
    ],
  },
];

// Operator-mode tabs (unchanged structure)
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

const PATH_TO_TAB = {
  '/admin/transition': 'transition',
  '/admin/users': 'users',
  '/admin/dts': 'dts',
  '/admin/dev-switcher': 'dev-switcher',
  '/admin/support': 'support',
  '/admin/subscriptions': 'subscriptions',
  '/admin/partners': 'partners',
  '/admin/verifications': 'verifications',
  '/admin/analytics': 'analytics',
  '/admin/activity': 'activity',
  '/admin/operators': 'operators',
  '/admin/audit': 'audit',
  '/admin/announcements': 'announcements',
  '/admin/system-health': 'system-health',
  '/admin/war-room': 'war-room',
  '/admin/escalations': 'escalations',
  '/admin/knowledge-base': 'knowledge-base',
  '/admin/p1-settings': 'p1-settings',
  '/admin/estate-health': 'estate-health',
  '/admin/integrations': 'integrations',
  '/admin/download-diagnostics': 'download-diagnostics',
  '/admin/product-analytics': 'product-analytics',
  '/admin/referrals': 'referrals',
  '/admin/funnel': 'funnel',
  '/admin/beta-testing': 'beta-testing',
  '/admin/founder-emails': 'founder-emails',
  '/admin/founder-invites': 'founder-invites',
  '/admin/site-content': 'site-content',
  '/admin/grace-periods': 'grace-periods',
  '/admin/ops-dashboard': 'ops-dashboard',
  '/admin/milestones': 'milestones',
  '/admin/trials': 'trials',
  '/admin/scoped-admins': 'scoped-admins',
  '/admin/ip-whitelist': 'ip-whitelist',
  '/admin/maintenance': 'maintenance',
  '/admin/canned-responses': 'canned-responses',
  '/admin/performance': 'performance',
  '/admin/launch': 'launch',
  '/admin/team-chat': 'team-chat',
  '/admin/session-policy': 'session-policy',
  '/admin/shifts': 'shifts',
  '/admin/training': 'training',
  '/admin/notification-categories': 'notification-categories',
  '/admin/voices': 'voices',
  '/admin/prototypes': 'prototypes',
  '/admin/ops-members': 'ops-members',
  '/admin/finance-members': 'finance-members',
  '/admin/platform-rules': 'platform-rules',
  '/admin/marketing-members': 'marketing-members',
  '/admin/sales-brief': 'sales-brief',
  '/admin/compliance-members': 'compliance-members',
  '/admin/platform-members': 'platform-members',
  // Apr 27, 2026 — friendly URL aliases. The user-visible tab labels in
  // the bottom nav say "Invites", "Templates", "Members" but the
  // canonical internal paths are the verbose forms above. When a user
  // pastes the friendly form into the URL bar it used to fall through
  // to the `users` default tab, which made it look like the admin tabs
  // were broken. These aliases make the URL paste do the obvious thing.
  '/admin/invites': 'founder-invites',
  '/admin/templates': 'canned-responses',
  '/admin/members': 'ops-members',
  // Section-level URL aliases — when the founder pastes a deep link
  // like /admin/finance during a Zoom pitch, land them on the canonical
  // first tab inside that section instead of falling through to the
  // generic Users overview. Mirrors SCOPE_DEFAULT_TAB so the manual
  // ?scope= URL and the section-level path produce the same view.
  '/admin/finance': 'subscriptions',
  '/admin/compliance': 'audit',
  '/admin/marketing': 'funnel',
  '/admin/operations': 'ops-dashboard',
  '/admin/platform-health': 'system-health',
  '/admin/launch-war-room': 'war-room',
  // FeatureGatesCard lives inside SubscriptionsTab, so the deep link
  // lands on the same tab and scrolls the gates table into view.
  '/admin/feature-gates': 'subscriptions',
  // Operations portal paths
  '/ops/transition': 'transition',
  '/ops/dts': 'dts',
  '/ops/support': 'support',
  '/ops/verifications': 'verifications',
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
  '/ops/platform-rules': 'platform-rules',
  '/ops/system-health': 'system-health',
  '/ops/canned-responses': 'canned-responses',
  '/ops/performance': 'performance',
  '/ops/team-chat': 'team-chat',
  '/ops/shifts': 'shifts',
  '/ops/training': 'training',
};

const AdminPage = ({ operatorMode = false }) => {
  const { user, getAuthHeaders } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const scopeParam = new URLSearchParams(location.search).get('scope');
  const defaultOpsTab = user?.operator_role === 'manager' ? 'ops-dashboard' : 'transition';

  // Default tab per scope — so scoped views land on their first tab, not Operations/Users
  const SCOPE_DEFAULT_TAB = {
    finance: 'subscriptions', compliance: 'audit', marketing: 'funnel',
    platform_health: 'system-health', ops_manager: 'users', ops_team: 'users',
  };
  const defaultTab = operatorMode ? defaultOpsTab : (scopeParam ? SCOPE_DEFAULT_TAB[scopeParam] || 'users' : 'users');
  const tab = PATH_TO_TAB[location.pathname] || defaultTab;
  const effectiveTab = (!operatorMode && location.pathname === '/admin') ? defaultTab : tab;

  useScrollLock(effectiveTab);

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

  // Admin scope: founder sees all, scoped admins see only their sections
  // URL ?scope= param overrides the view (portal switching), otherwise use server scope
  const serverScope = user?.admin_scope || user?._serverScope || 'founder';
  const serverScopes = Array.isArray(serverScope) ? serverScope : (serverScope ? [serverScope] : ['founder']);
  // If URL has ?scope=finance, show only finance. If no param, show user's actual scopes.
  const adminScopes = scopeParam ? [scopeParam] : (serverScopes.length > 0 ? serverScopes : ['founder']);
  const isFounder = adminScopes.includes('founder');
  const isManager = user?.operator_role === 'manager';

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
    } catch (err) { toast.error('Cleanup failed'); }
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

  // Build visible tabs for founder/scoped admin mode
  const getVisibleFounderTabs = () => {
    const tabs = [];
    FOUNDER_SECTIONS.forEach(section => {
      if (section.scopes.some(s => adminScopes.includes(s))) {
        tabs.push({ sectionLabel: section.section });
        section.tabs.forEach(t => tabs.push(t));
      }
    });
    return tabs;
  };

  // Build visible tabs for operator mode
  const getVisibleOperatorTabs = () => {
    const tabs = [...OPERATOR_TABS];
    if (isManager || user?.role === 'admin') {
      tabs.push(...MANAGER_EXTRA_TABS);
    }
    return tabs;
  };

  const visibleTabs = operatorMode ? getVisibleOperatorTabs() : getVisibleFounderTabs();

  // Section colors for visual grouping
  const sectionColors = {
    'Operations': '#d4af37',
    'Finance': '#22C993',
    'Marketing': '#B794F6',
    'Compliance': '#3B82F6',
    'Platform': '#F59E0B',
    'Admin': '#ef4444',
  };

  // Dashboard title based on scope
  const getDashboardTitle = () => {
    if (operatorMode) return 'Operations Dashboard';
    if (isFounder) return 'Founder Dashboard';
    const labels = { finance: 'Finance', compliance: 'Compliance', marketing: 'Marketing', platform_health: 'Platform Health', ops_manager: 'Operations', ops_team: 'Operations' };
    const scopeNames = adminScopes.map(s => labels[s] || s).join(' + ');
    return `${scopeNames} Dashboard`;
  };

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in max-w-full overflow-x-hidden" data-testid="admin-dashboard">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>{getDashboardTitle()}</h1>
          <p className="text-xs sm:text-sm text-[var(--t5)]">
            {operatorMode
              ? 'Transition Verification \u00B7 Customer Service \u00B7 Trustee Services'
              : isFounder
                ? 'Operations \u00B7 Finance \u00B7 Marketing \u00B7 Compliance \u00B7 Platform'
                : `Scoped access \u2014 ${adminScopes.join(', ').replace(/_/g, ' ')}`
            }
          </p>
        </div>
        {!operatorMode && isFounder && (
        <div className="flex items-center gap-2 flex-shrink-0">
        <AdminCommandPalette tabs={visibleTabs} operatorMode={operatorMode} />
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
        {operatorMode && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <AdminCommandPalette tabs={visibleTabs} operatorMode={operatorMode} />
            <QueueAlertsPanel />
          </div>
        )}
      </div>

      {/* Revenue Analytics — founder and finance only */}
      {!operatorMode && (isFounder || adminScopes.includes('finance')) && <RevenuePanel revenue={revenue} />}

      {/* Operator Work Queue Tiles */}
      {operatorMode && <OpsWorkTiles stats={stats} dashEvents={dashEvents} />}

      {/* Manager: Team Activity Overview */}
      {operatorMode && (isManager || user?.role === 'admin') && (
        <TeamActivitySection teamTasks={teamTasks} opsDash={opsDash} />
      )}

      {/* Action Required — founder only */}
      {!operatorMode && isFounder && <ActionRequired stats={stats} navigate={navigate} />}

      {/* Platform Overview — founder and platform_health only */}
      {!operatorMode && (isFounder || adminScopes.includes('platform_health')) && stats && <PlatformOverview stats={stats} />}

      {/* Code Health — founder and platform_health only */}
      {!operatorMode && (isFounder || adminScopes.includes('platform_health')) && <CodeHealthTile getAuthHeaders={getAuthHeaders} />}

      {/* Tabs — with section labels for founder view */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide items-center" data-testid="admin-tab-bar" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {visibleTabs.map((t, i) => {
          if (t.sectionLabel) {
            return (
              <span key={`section-${t.sectionLabel}`}
                className={`text-[11px] font-bold uppercase tracking-wider whitespace-nowrap flex-shrink-0 ${i > 0 ? 'ml-2' : ''} mr-1`}
                style={{ color: sectionColors[t.sectionLabel] || 'var(--t5)' }}>
                {t.sectionLabel}
              </span>
            );
          }
          return (
            <button key={t.key} onClick={() => navigate(scopeParam ? `${t.path}?scope=${scopeParam}` : t.path)}
              className={`flex items-center gap-1.5 rounded-lg font-bold transition-all whitespace-nowrap flex-shrink-0 active:scale-[0.97] ${
                operatorMode ? 'px-3.5 py-2.5 text-sm min-h-[44px]' : 'px-3 py-2 text-xs'
              } ${
                effectiveTab === t.key ? 'gold-pill' : 'bg-[var(--s)] text-[var(--t4)]'
              }`} data-testid={`admin-tab-${t.key}`}>
              <t.icon className={operatorMode ? 'w-4 h-4' : 'w-3.5 h-3.5'} /> {t.label}
              {t.key === 'founder-invites' && pendingAccessReqs > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold leading-none" style={{ background: '#ef4444', color: '#fff' }}>{pendingAccessReqs}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{ minHeight: '100vh' }}>
        {effectiveTab === 'users' && <UsersTab users={users} setUsers={setUsers} currentUserId={user?.id} getAuthHeaders={getAuthHeaders} operatorMode={operatorMode} />}
        {effectiveTab === 'transition' && <TransitionTab getAuthHeaders={getAuthHeaders} onStatsChange={refreshStats} />}
        {effectiveTab === 'dts' && <DTSTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'support' && <SupportTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'subscriptions' && <SubscriptionsTab getAuthHeaders={getAuthHeaders} users={users} operatorMode={operatorMode} />}
        {effectiveTab === 'partners' && <PartnersTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'verifications' && <VerificationsTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'analytics' && <AnalyticsTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'launch' && <LaunchMetricsTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'activity' && <ActivityTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'operators' && <OperatorsTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'audit' && <AuditTrailTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'dev-switcher' && <DevSwitcherTab users={users} getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'announcements' && <AnnouncementsTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'system-health' && <SystemHealthTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'war-room' && <LaunchWarRoomTab />}
        {effectiveTab === 'escalations' && <EscalationsTab getAuthHeaders={getAuthHeaders} isFounder={isFounder} isManager={isManager} />}
        {effectiveTab === 'knowledge-base' && <KnowledgeBaseTab getAuthHeaders={getAuthHeaders} isFounder={true} />}
        {effectiveTab === 'p1-settings' && <P1ContactSettingsTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'estate-health' && <EstateHealthTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'integrations' && <IntegrationsTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'download-diagnostics' && <DownloadDiagnosticsTab />}
        {effectiveTab === 'product-analytics' && <ProductAnalyticsTab />}
        {effectiveTab === 'referrals' && <AdminReferralsTab />}
        {effectiveTab === 'funnel' && <FunnelAnalyticsTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'beta-testing' && <BetaTestingTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'founder-emails' && <FounderEmailsTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'founder-invites' && <FounderInvitesTab onPendingChange={setPendingAccessReqs} />}
        {effectiveTab === 'site-content' && <SiteContentTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'grace-periods' && <GracePeriodsTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'trials' && <TrialUsersTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'scoped-admins' && <ScopedAdminsTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'ip-whitelist' && <IPWhitelistTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'maintenance' && <MaintenanceModeTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'canned-responses' && <CannedResponsesTab getAuthHeaders={getAuthHeaders} isManager={isFounder || isManager} />}
        {effectiveTab === 'performance' && <PerformanceTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'team-chat' && <TeamChatTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'session-policy' && <SessionPolicyTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'shifts' && <ShiftScheduleTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'training' && <TrainingTrackerTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'notification-categories' && <NotificationCategoriesTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'voices' && <VoicesTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'prototypes' && <PrototypesTab />}
        {/* Section Members tabs */}
        {effectiveTab === 'ops-members' && <SectionMembersTab getAuthHeaders={getAuthHeaders} sectionScopes={['ops_manager', 'ops_team']} sectionLabel="Operations" />}
        {effectiveTab === 'finance-members' && <SectionMembersTab getAuthHeaders={getAuthHeaders} sectionScopes={['finance']} sectionLabel="Finance" />}
        {effectiveTab === 'platform-rules' && <PlatformRulesTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'marketing-members' && <SectionMembersTab getAuthHeaders={getAuthHeaders} sectionScopes={['marketing']} sectionLabel="Marketing" />}
        {effectiveTab === 'sales-brief' && <SalesBriefTab />}
        {effectiveTab === 'compliance-members' && <SectionMembersTab getAuthHeaders={getAuthHeaders} sectionScopes={['compliance']} sectionLabel="Compliance" />}
        {effectiveTab === 'platform-members' && <SectionMembersTab getAuthHeaders={getAuthHeaders} sectionScopes={['platform_health']} sectionLabel="Platform" />}
        {/* Operator-specific tabs */}
        {effectiveTab === 'my-activity' && operatorMode && <MyActivityTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'search' && operatorMode && <QuickSearchTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'ops-escalations' && operatorMode && <EscalationsTab getAuthHeaders={getAuthHeaders} isFounder={false} isManager={isManager} />}
        {effectiveTab === 'shift-notes' && operatorMode && <ShiftNotesTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'ops-kb' && operatorMode && <KnowledgeBaseTab getAuthHeaders={getAuthHeaders} isFounder={false} />}
        {effectiveTab === 'ops-dashboard' && <OpsDashboardTab getAuthHeaders={getAuthHeaders} />}
        {effectiveTab === 'milestones' && <MilestoneDeliveriesTab getAuthHeaders={getAuthHeaders} />}
      </div>
    </div>
  );
};

export default AdminPage;
