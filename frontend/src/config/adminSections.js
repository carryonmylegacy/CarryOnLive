// ── Admin section registry (single source of truth) ──────────────
// Used by AdminPage (to render the per-section layout + tab content)
// and by Sidebar/MobileNav (to render the expandable section menu).
//
// Each section has:
//   key       — URL slug ( `/admin/${key}` is the section landing page )
//   label     — visible name shown in the menu and on the header
//   icon      — Lucide icon for the menu row + the gradient header tile
//   color     — accent color used for the gradient header + chevron
//   scopes    — admin scopes allowed to see this section
//   tabs      — child tabs (existing canonical paths preserved)
//
// (Created May 21 2026 — Admin Portal restructure)

import {
  Briefcase, CreditCard, Megaphone, ShieldCheck, HeartPulse, UserCog,
  Users, FileKey, Shield, Headphones, CheckSquare, AlertTriangle, Clock,
  TrendingUp, Activity, MessageSquare, BarChart3, Download, Radio,
  BookOpen, Gift, Zap, Puzzle, Mail, Film, Hourglass, Globe, Power, Settings,
  Calendar, GraduationCap, Bell, Sparkles, MessageSquareQuote, FileText, HeartPulse as _HP,
} from 'lucide-react';

export const ADMIN_SECTIONS = [
  {
    key: 'operations',
    label: 'Operations',
    icon: Briefcase,
    color: '#d4af37',
    // Pill thematics — mirrors the .gold-pill rule per-section.
    pill: {
      // Light mode: opaque pale tinted bg + dark saturated text + accent border
      bgLight: 'rgba(254, 249, 231, 0.95)',
      bgLightHover: 'rgba(252, 243, 202, 1)',
      textLight: '#7a5c00',
      // Dark mode: solid accent gradient bg + near-black text (matches gold-pill base)
      bgDark: 'linear-gradient(135deg, #d4af37, #b8962e)',
      bgDarkHover: 'linear-gradient(135deg, #e0bd47, #c9a338)',
      textDark: '#080e1a',
    },
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
    key: 'finance',
    label: 'Finance',
    icon: CreditCard,
    color: '#22C993',
    pill: {
      bgLight: 'rgba(220, 252, 231, 0.95)',
      bgLightHover: 'rgba(187, 247, 208, 1)',
      textLight: '#0a614a',
      bgDark: 'linear-gradient(135deg, #22C993, #1ba87d)',
      bgDarkHover: 'linear-gradient(135deg, #2dd4a4, #1fc491)',
      textDark: '#062318',
    },
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
    key: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    color: '#B794F6',
    pill: {
      bgLight: 'rgba(243, 232, 255, 0.95)',
      bgLightHover: 'rgba(233, 213, 255, 1)',
      textLight: '#4b25a0',
      bgDark: 'linear-gradient(135deg, #B794F6, #9a72e0)',
      bgDarkHover: 'linear-gradient(135deg, #c4a4ff, #ab85ee)',
      textDark: '#1a0f30',
    },
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
    key: 'compliance',
    label: 'Compliance',
    icon: ShieldCheck,
    color: '#3B82F6',
    pill: {
      bgLight: 'rgba(219, 234, 254, 0.95)',
      bgLightHover: 'rgba(191, 219, 254, 1)',
      textLight: '#1d4fa8',
      bgDark: 'linear-gradient(135deg, #3B82F6, #2d6ad6)',
      bgDarkHover: 'linear-gradient(135deg, #5097ff, #3f7ee8)',
      textDark: '#06162e',
    },
    scopes: ['founder', 'compliance'],
    tabs: [
      { key: 'audit', label: 'Audit Trail', icon: Shield, path: '/admin/audit' },
      { key: 'estate-health', label: 'Estate Health', icon: HeartPulse, path: '/admin/estate-health' },
      { key: 'activity', label: 'Activity Log', icon: Activity, path: '/admin/activity' },
      { key: 'compliance-members', label: 'Members', icon: UserCog, path: '/admin/compliance-members' },
    ],
  },
  {
    key: 'platform',
    label: 'Platform',
    icon: HeartPulse,
    color: '#F59E0B',
    pill: {
      bgLight: 'rgba(255, 247, 220, 0.95)',
      bgLightHover: 'rgba(254, 240, 195, 1)',
      textLight: '#7a4f00',
      bgDark: 'linear-gradient(135deg, #F59E0B, #d68708)',
      bgDarkHover: 'linear-gradient(135deg, #ffac20, #e9970f)',
      textDark: '#2e1d00',
    },
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
    key: 'admin',
    label: 'Admin',
    icon: UserCog,
    color: '#ef4444',
    pill: {
      bgLight: 'rgba(254, 226, 226, 0.95)',
      bgLightHover: 'rgba(254, 202, 202, 1)',
      textLight: '#9b1c1c',
      bgDark: 'linear-gradient(135deg, #ef4444, #d63333)',
      bgDarkHover: 'linear-gradient(135deg, #ff5757, #e84444)',
      textDark: '#2e0606',
    },
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

// Map every tab key → section key (so we can resolve which gradient
// header + tab bar to render when the URL points at a leaf tab path).
export const TAB_TO_SECTION = (() => {
  const m = {};
  ADMIN_SECTIONS.forEach(s => s.tabs.forEach(t => { m[t.key] = s.key; }));
  return m;
})();

// Hex → "r,g,b" so we can build rgba() strings against CSS variables
// without depending on Chrome's hex serialization.
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
};

export const sectionRgb = (color) => hexToRgb(color);

// Visible sections for a given set of admin scopes (founder sees all).
export const visibleAdminSections = (adminScopes) =>
  ADMIN_SECTIONS.filter(s => s.scopes.some(sc => adminScopes.includes(sc)));

// Resolve `effectiveTab` → the section it belongs to (fallback to first
// visible section for the user when nothing matches).
export const sectionForTab = (tabKey, fallbackSectionKey) => {
  if (tabKey && TAB_TO_SECTION[tabKey]) return TAB_TO_SECTION[tabKey];
  return fallbackSectionKey || 'operations';
};
