import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../utils/haptics';
import { clearCache } from '../../utils/apiCache';
import axios from 'axios';
import {
  LayoutDashboard,
  FolderLock,
  MessageSquare,
  Users,
  Sparkles,
  CheckSquare,
  Shield,
  Settings,
  LogOut,
  Moon,
  Sun,
  Home,
  Headphones,
  ShieldCheck,
  CloudOff,
  KeyRound,
  Clock,
  CreditCard,
  PanelLeftClose,
  PanelLeftOpen,
  Megaphone,
  HeartPulse,
  AlertTriangle,
  BookOpen,
  Search,
  StickyNote,
  Gift,
  Plus,
  Heart,
  Star,
  Check,
  MessageCircle,
  DollarSign
} from 'lucide-react';
import { Switch } from '../ui/switch';
import { toast } from '../../utils/toast';
import NotificationBell from '../NotificationBell';
import { API_URL } from '../../config';
import { filterNavByFeatures } from '../../utils/featureGates';

const BASE_URL = process.env.REACT_APP_BACKEND_URL;

const OtpToggle = ({ collapsed }) => {
  const [otpDisabled, setOtpDisabled] = useState(false);
  useEffect(() => {
    const token = localStorage.getItem('carryon_token');
    if (token) {
      axios.get(`${API_URL}/admin/platform-settings`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => setOtpDisabled(res.data?.otp_disabled || false))
        .catch(() => {});
    }
  }, []);
  const toggle = async () => {
    const newVal = !otpDisabled;
    setOtpDisabled(newVal);
    const token = localStorage.getItem('carryon_token');
    axios.put(`${API_URL}/admin/platform-settings`, { otp_disabled: newVal }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }).catch(() => setOtpDisabled(!newVal));
  };
  if (collapsed) {
    return (
      <div className="mx-1 my-2 flex items-center justify-center px-2 py-2 rounded-lg cursor-pointer" onClick={toggle} title={`OTP ${otpDisabled ? 'Disabled' : 'Enabled'}`} style={{ background: otpDisabled ? 'rgba(239,68,68,0.06)' : 'var(--s)', border: `1px solid ${otpDisabled ? 'rgba(239,68,68,0.2)' : 'var(--b)'}` }}>
        <ShieldCheck className="w-5 h-5" style={{ color: otpDisabled ? '#ef4444' : '#10b981' }} />
      </div>
    );
  }
  return (
    <div className="mx-3 my-2 flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: otpDisabled ? 'rgba(239,68,68,0.06)' : 'var(--s)', border: `1px solid ${otpDisabled ? 'rgba(239,68,68,0.2)' : 'var(--b)'}` }}>
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" style={{ color: otpDisabled ? '#ef4444' : '#10b981' }} />
        <span className="text-xs font-bold text-[var(--t)]">OTP</span>
      </div>
      <Switch checked={!otpDisabled} onCheckedChange={toggle} />
    </div>
  );
};

/**
 * OfflineModeToggle — founder-only switch to flip the platform-wide offline
 * feature on/off. Single source of truth lives in `localStorage.carryon_offline_v1`.
 * When ON, every offline feature engages: IndexedDB sync, outbox + drain,
 * pending chunked uploads, AES-GCM at-rest encryption, conflict resolver.
 *
 * Styled to sit directly below the OTP toggle in the admin sidebar so founders
 * have one-tap control over both platform kill-switches from any page.
 */
const OfflineModeToggle = ({ collapsed }) => {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem('carryon_offline_v1') === 'on'; }
    catch { return false; }
  });
  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      if (next) localStorage.setItem('carryon_offline_v1', 'on');
      else localStorage.setItem('carryon_offline_v1', 'off');
    } catch {}
    // Broadcast so any listening components update without a reload.
    try { window.dispatchEvent(new CustomEvent('carryon:offline-flag-changed', { detail: { mode: next ? 'on' : 'off' } })); } catch {}
    // Reload so repos, service worker, and crypto session key reinitialize cleanly.
    // Use a short delay so React state flush completes first.
    setTimeout(() => { try { window.location.reload(); } catch {} }, 150);
  };
  if (collapsed) {
    return (
      <div
        className="mx-1 my-2 flex items-center justify-center px-2 py-2 rounded-lg cursor-pointer"
        onClick={toggle}
        title={`Offline mode ${on ? 'On' : 'Off'}`}
        style={{ background: on ? 'rgba(212,175,55,0.10)' : 'var(--s)', border: `1px solid ${on ? 'rgba(212,175,55,0.35)' : 'var(--b)'}` }}
        data-testid="sidebar-offline-toggle-collapsed"
      >
        <CloudOff className="w-5 h-5" style={{ color: on ? '#d4af37' : 'var(--t3)' }} />
      </div>
    );
  }
  return (
    <div
      className="mx-3 my-2 flex items-center justify-between px-3 py-2 rounded-lg"
      style={{ background: on ? 'rgba(212,175,55,0.10)' : 'var(--s)', border: `1px solid ${on ? 'rgba(212,175,55,0.35)' : 'var(--b)'}` }}
      data-testid="sidebar-offline-toggle"
    >
      <div className="flex items-center gap-2">
        <CloudOff className="w-4 h-4" style={{ color: on ? '#d4af37' : 'var(--t3)' }} />
        <span className="text-xs font-bold text-[var(--t)]">Offline</span>
      </div>
      <Switch checked={on} onCheckedChange={toggle} data-testid="sidebar-offline-switch" />
    </div>
  );
};

// Normalize admin_scope to an array regardless of input format
const scopeArr = (raw) => Array.isArray(raw) ? raw : (raw ? [raw] : []);
const hasScope = (raw, target) => scopeArr(raw).includes(target);

const ADMIN_PORTALS = [
  { scope: 'founder', label: 'Founder Portal', color: '#d4af37' },
  { scope: 'ops_manager', label: 'Operations Portal', color: '#E87040', altScope: 'ops_team' },
  { scope: 'finance', label: 'Finance Portal', color: '#22C993' },
  { scope: 'compliance', label: 'Compliance Portal', color: '#3B82F6' },
  { scope: 'marketing', label: 'Marketing Portal', color: '#B794F6' },
  { scope: 'platform_health', label: 'Platform Portal', color: '#F59E0B' },
];

const Sidebar = () => {
  const { user, logout, refreshUser, enabledFeatures, setUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [benEstates, setBenEstates] = useState([]);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('carryon_sidebar_collapsed') === 'true');
  const [estatePickerOpen, setEstatePickerOpen] = useState(false);
  const [ectUnread, setEctUnread] = useState(0);
  // Dev portal switcher (founder only)
  const [devOpen, setDevOpen] = useState(false);
  const [devConfig, setDevConfig] = useState(() => {
    try {
      const cached = sessionStorage.getItem('dev_switcher_config');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [devSwitching, setDevSwitching] = useState(null);

  const isAdminSession = user?.role === 'admin' || localStorage.getItem('dev_switcher_admin_session') === 'true';

  const fetchDevConfig = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/dev-switcher/config`);
      const data = await res.json();
      // Fetch operator accounts using the admin token (not current session)
      const adminToken = localStorage.getItem('dev_switcher_admin_token') || localStorage.getItem('carryon_token');
      if (adminToken) {
        try {
          const opsRes = await fetch(`${BASE_URL}/api/founder/operators`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          });
          if (opsRes.ok) {
            data.operators = await opsRes.json();
          }
        } catch {}
      }
      setDevConfig(data);
      try { sessionStorage.setItem('dev_switcher_config', JSON.stringify(data)); } catch {}
    } catch {}
  };

  useEffect(() => {
    if (isAdminSession) fetchDevConfig();
  }, [isAdminSession]); // eslint-disable-line

  const devAccounts = [];
  if (devConfig?.benefactor?.email) devAccounts.push({ label: 'Benefactor', email: devConfig.benefactor.email, password: devConfig.benefactor.password, role: 'benefactor', color: '#2563eb', redirect: '/dashboard' });
  if (devConfig?.beneficiary?.email) devAccounts.push({ label: 'Beneficiary', email: devConfig.beneficiary.email, password: devConfig.beneficiary.password, role: 'beneficiary', color: '#8b5cf6', redirect: '/beneficiary' });
  devAccounts.push({ label: 'Founder Portal', role: 'admin', color: '#E0AD2B', redirect: '/admin' });
  devAccounts.push({ label: 'Operations Portal', role: 'ops_view', color: '#3B82F6', redirect: '/ops' });
  // Add operator accounts from the operators list
  if (devConfig?.operators) {
    devConfig.operators.forEach(op => {
      const isManager = op.operator_role === 'manager';
      devAccounts.push({
        label: `${op.name} (${isManager ? 'Manager' : 'Team Member'})`,
        email: op.email,
        role: `operator_${op.id}`,
        color: isManager ? '#F59E0B' : '#06B6D4',
        redirect: '/ops',
        isOperator: true,
      });
    });
  }

  const SCOPE_PREVIEWS = [
    { scope: 'finance', label: 'Finance Admin', desc: 'Revenue, Subs, Grace Periods', color: '#22C993' },
    { scope: 'compliance', label: 'Compliance Admin', desc: 'Audit, Security, Estate Health', color: '#3B82F6' },
    { scope: 'marketing', label: 'Marketing Admin', desc: 'Funnel, Beta, Site Content, Emails', color: '#B794F6' },
    { scope: 'platform_health', label: 'Platform Health', desc: 'System, Operators, Integrations', color: '#F59E0B' },
  ];

  // Check portal visibility from dev config (default: visible)
  const pv = devConfig?.portal_visibility || {};
  const isPortalOn = (key) => pv[key] !== false;

  const visibleScopePreviews = SCOPE_PREVIEWS.filter(sp => isPortalOn(sp.scope));

  const handleScopePreview = (scope) => {
    setDevOpen(false);
    toast.success(`Viewing as: ${SCOPE_PREVIEWS.find(s => s.scope === scope)?.label || scope}`);
    navigate(`/admin?scope=${scope}`);
  };

  const handleRestoreFounder = () => {
    setDevOpen(false);
    toast.success('Restored Founder view');
    navigate('/admin');
  };

  const handleDevSwitch = async (account) => {
    setDevSwitching(account.role);
    try {
      const currentToken = localStorage.getItem('carryon_token');
      if (user?.role === 'admin' && currentToken) {
        localStorage.setItem('dev_switcher_admin_token', currentToken);
      }
      if (account.role === 'admin' || account.role === 'ops_view') {
        const adminToken = localStorage.getItem('dev_switcher_admin_token');
        if (adminToken) {
          localStorage.setItem('carryon_token', adminToken);
          localStorage.removeItem('selected_estate_id');
          localStorage.removeItem('beneficiary_estate_id');
          localStorage.removeItem('beneficiary_feature_access');
          localStorage.setItem('dev_switcher_admin_session', 'true');
          localStorage.setItem('dev_switcher_active_role', account.role);
          window.location.href = account.redirect;
          return;
        }
        throw new Error('No admin session found.');
      }
      // Operator accounts — use admin impersonation via dev-login
      if (account.isOperator) {
        const adminToken = localStorage.getItem('dev_switcher_admin_token') || currentToken;
        if (!adminToken) throw new Error('No admin session found.');
        // Fetch the operator's password from the backend (admin-only endpoint)
        const loginRes = await fetch(`${BASE_URL}/api/founder/operator-dev-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
          body: JSON.stringify({ operator_email: account.email }),
        });
        let loginData;
        try { loginData = await loginRes.json(); } catch { loginData = { detail: `Server returned ${loginRes.status}` }; }
        if (!loginRes.ok) throw new Error(loginData.detail || 'Login failed');
        localStorage.removeItem('selected_estate_id');
        localStorage.removeItem('beneficiary_estate_id');
        localStorage.setItem('dev_switcher_admin_session', 'true');
        localStorage.setItem('dev_switcher_active_role', account.role);
        localStorage.setItem('carryon_token', loginData.access_token);
        window.location.href = account.redirect;
        return;
      }
      const switchToken = localStorage.getItem('dev_switcher_admin_token') || currentToken;
      if (!switchToken) throw new Error('No active session.');
      const response = await fetch(`${BASE_URL}/api/auth/dev-switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${switchToken}` },
        body: JSON.stringify({ email: account.email }),
      });
      let data;
      try { data = await response.json(); } catch { data = { detail: `Server returned ${response.status}` }; }
      if (!response.ok) throw new Error(data.detail || 'Login failed');
      localStorage.removeItem('selected_estate_id');
      localStorage.removeItem('beneficiary_estate_id');
      localStorage.setItem('dev_switcher_admin_session', 'true');
      localStorage.setItem('dev_switcher_active_role', account.role);
      localStorage.setItem('carryon_token', data.access_token);
      window.location.href = account.redirect;
    } catch (err) {
      toast.error('Switch failed: ' + err.message);
      setDevSwitching(null);
    }
  };

  const toggleCollapsed = () => {
    haptics.light();
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('carryon_sidebar_collapsed', String(next));
    window.dispatchEvent(new Event('sidebar-toggle'));
  };

  // Fetch estates for sidebar switcher (beneficiary view + multi-role users)
  useEffect(() => {
    if (user?.role === 'beneficiary' || user?.is_also_beneficiary || user?.is_also_benefactor) {
      
      const token = localStorage.getItem('carryon_token');
      if (token) {
        axios.get(`${API_URL}/estates`, { headers: { Authorization: `Bearer ${token}` } })
          .then(res => setBenEstates(res.data))
          .catch(() => {});
      }
    }
  }, [user]);

  // Poll ECT unread count for badge
  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'operator') return;
    const fetchUnread = () => {
      const tk = localStorage.getItem('carryon_token');
      if (!tk) return;
      fetch(`${BASE_URL}/api/estate-chat/unread-total`, { headers: { Authorization: `Bearer ${tk}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setEctUnread(d.total || 0); })
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Navigation structure matching prototype
  const benefactorNavSections = [
    {
      title: 'ESTATE PLAN ACCESS',
      items: filterNavByFeatures([
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/beneficiaries', icon: Users, label: 'Beneficiaries' },
        { to: '/messages', icon: MessageSquare, label: 'Milestone Messages (MM)' },
        { to: '/checklist', icon: CheckSquare, label: 'Immediate Action Checklist (IAC)' },
        { to: '/vault', icon: FolderLock, label: 'Secure Document Vault (SDV)' },
        { to: '/guardian', icon: Sparkles, label: 'Estate Guardian AI (EGA)' },
        { to: '/ffn', icon: Heart, label: 'Family & Friends Notification (FFN)' },
        { to: '/digital-wallet', icon: KeyRound, label: 'Digital Access Vault (DAV)' },
        { to: '/financial', icon: DollarSign, label: 'Financial Picture' },
        { to: '/trustee', icon: Shield, label: 'Designated Trustee Services (DTS)' },
        { to: '/timeline', icon: Clock, label: 'Estate Plan Timeline' },
        { to: '/estate-chat', icon: MessageCircle, label: 'Estate Comms (ECT)', badge: ectUnread },
        { to: '/connected-protocol', icon: Shield, label: 'CarryOn Contingency Protocols (CCP)' },
      ], enabledFeatures)
    },
    {
      title: 'ACCOUNT',
      items: [
        { to: '/settings', icon: Settings, label: 'Settings' },
        { to: '/subscription', icon: CreditCard, label: 'Subscription' },
        { to: '/security-settings', icon: ShieldCheck, label: 'Security Settings' },
        { to: '/support', icon: Headphones, label: 'Customer Support' },
      ]
    }
  ];

  // Get feature access flags from localStorage (set by TransitionGate/Dashboard)
  const featureAccess = (() => {
    try { return JSON.parse(localStorage.getItem('beneficiary_feature_access') || '{}'); }
    catch { return {}; }
  })();

  // Map nav routes to feature access flags
  const NAV_FEATURE_MAP = {
    '/beneficiary/vault': 'sdv_access',
    '/beneficiary/guardian': 'ega_access',
    '/beneficiary/checklist': 'iac_access',
    '/beneficiary/messages': 'mm_access',
    '/beneficiary/financial': 'cfp_access',
  };

  const filterByFeatureAccess = (items) =>
    items.filter(item => {
      const flag = NAV_FEATURE_MAP[item.to];
      return !flag || featureAccess[flag] !== false;
    });

  const beneficiaryNavSections = [
    {
      title: 'ESTATE PLAN ACCESS',
      items: filterNavByFeatures(filterByFeatureAccess([
        { to: '/beneficiary', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/beneficiary/vault', icon: FolderLock, label: 'Secure Document Vault (SDV)' },
        { to: '/beneficiary/guardian', icon: Sparkles, label: 'Estate Guardian (EGA)' },
        { to: '/beneficiary/checklist', icon: CheckSquare, label: 'Immediate Action Checklist (IAC)' },
        { to: '/beneficiary/messages', icon: MessageSquare, label: 'Milestone Messages (MM)' },
        { to: '/beneficiary/milestone', icon: Home, label: 'Report Milestone' },
        { to: '/beneficiary/estate-chat', icon: MessageCircle, label: 'Estate Comms (ECT)', badge: ectUnread },
        { to: '/beneficiary/connected-protocol', icon: Shield, label: 'CarryOn Contingency Protocols (CCP)' },
        { to: '/beneficiary/financial', icon: DollarSign, label: 'Financial Picture' },
      ]), enabledFeatures)
    },
    {
      title: 'ACCOUNT',
      items: [
        { to: '/beneficiary/settings', icon: Settings, label: 'Settings' },
        { to: '/beneficiary/subscription', icon: CreditCard, label: 'Subscription' },
        { to: '/support', icon: Headphones, label: 'Customer Support' },
      ]
    }
  ];

  const adminNavSections = [
    {
      title: 'TOOLS',
      items: [
        { to: '/admin/announcements', icon: Megaphone, label: 'Announcements' },
        { to: '/admin/system-health', icon: HeartPulse, label: 'System Health' },
        { to: '/admin/escalations', icon: AlertTriangle, label: 'Escalations' },
        { to: '/admin/knowledge-base', icon: BookOpen, label: 'Knowledge Base' },
        { to: '/admin/p1-settings', icon: Shield, label: 'P1 Contact Settings' },
        { to: '/settings', icon: Settings, label: 'Settings' },
      ]
    }
  ];

  const operatorNavSections = [
    {
      title: 'TOOLS',
      items: [
        // Managers get dashboard first
        ...(user?.operator_role === 'manager' ? [
          { to: '/ops/dashboard', icon: LayoutDashboard, label: 'Ops Dashboard' },
          { to: '/ops/operators', icon: Users, label: 'Team' },
        ] : []),
        { to: '/ops/my-activity', icon: Clock, label: 'My Activity' },
        { to: '/ops/search', icon: Search, label: 'Quick Search' },
        { to: '/ops/escalations', icon: AlertTriangle, label: 'Escalate' },
        { to: '/ops/shift-notes', icon: StickyNote, label: 'Shift Notes' },
        { to: '/ops/milestones', icon: Gift, label: 'Milestones' },
        { to: '/ops/users', icon: Users, label: 'Users' },
        ...(user?.operator_role === 'manager' ? [
          { to: '/ops/subscriptions', icon: CreditCard, label: 'Subs' },
        ] : []),
        { to: '/ops/system-health', icon: HeartPulse, label: 'System Health' },
        { to: '/ops/estate-health', icon: HeartPulse, label: 'Estate Health' },
        { to: '/ops/knowledge-base', icon: BookOpen, label: 'SOPs' },
        { to: '/settings', icon: Settings, label: 'Settings' },
      ]
    }
  ];

  // Determine if the user is currently viewing in a "benefactor context"
  // (a beneficiary who also owns an estate, viewing their estate dashboard)
  const isBenefactorContext = (() => {
    const path = window.location.pathname;
    // If user is a beneficiary with is_also_benefactor, check current path context
    if (user?.role === 'beneficiary' && user?.is_also_benefactor) {
      // On benefactor routes = benefactor context
      return !path.startsWith('/beneficiary');
    }
    return false;
  })();

  const getNavSections = () => {
    // Admin viewing ops portal should see operator nav
    if (user?.role === 'admin' && window.location.pathname.startsWith('/ops')) return operatorNavSections;
    if (user?.role === 'admin') return adminNavSections;
    if (user?.role === 'operator') return operatorNavSections;
    // Multi-role: beneficiary who is also a benefactor
    if (user?.role === 'beneficiary' && isBenefactorContext) return benefactorNavSections;
    if (user?.role === 'beneficiary') return beneficiaryNavSections;
    // Benefactor who is also a beneficiary — check path
    if (user?.role === 'benefactor' && window.location.pathname.startsWith('/beneficiary')) return beneficiaryNavSections;
    return benefactorNavSections;
  };

  const getRoleLabel = () => {
    if (user?.role === 'beneficiary' && isBenefactorContext) return 'BENEFACTOR PORTAL';
    if (user?.role === 'beneficiary') return 'BENEFICIARY PORTAL';
    if (user?.role === 'admin' && window.location.pathname.startsWith('/ops')) return 'OPERATIONS';
    if (user?.role === 'admin') {
      const raw = user?.admin_scope || 'founder';
      const scopes = Array.isArray(raw) ? raw : [raw];
      if (scopes.includes('founder')) return 'FOUNDER PORTAL';
      const labels = { finance: 'FINANCE', compliance: 'COMPLIANCE', marketing: 'MARKETING', platform_health: 'PLATFORM' };
      return scopes.map(s => labels[s] || s.toUpperCase()).join(' + ') + ' ADMIN';
    }
    if (user?.role === 'operator' && user?.operator_role === 'manager') return 'OPS MANAGER';
    if (user?.role === 'operator') return 'OPERATIONS';
    if (user?.role === 'benefactor' && window.location.pathname.startsWith('/beneficiary')) return 'BENEFICIARY PORTAL';
    return 'BENEFACTOR PORTAL';
  };

  return (
    <aside className={`sb hidden lg:flex ${collapsed ? 'collapsed' : ''}`} data-testid="sidebar" role="navigation" aria-label="Main navigation">
      {/* Logo Section — clickable for founder portal switcher */}
      <div className="sb-logo" style={{ cursor: 'pointer' }}
        onClick={() => { if (isAdminSession) { setDevOpen(!devOpen); if (!devOpen) fetchDevConfig(); } else { navigate(window.location.pathname.startsWith('/beneficiary') ? '/beneficiary' : '/dashboard'); } }}
        data-testid="sidebar-logo">
        <div className="sb-logo-top">
          <img 
            src="/carryon-app-icon.jpg" 
            alt="CarryOn™" 
            className="sb-logo-img"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          <div 
            className="sb-avatar" 
            style={{ display: 'none', width: '42px', height: '42px', borderRadius: '10px' }}
          >
            <Shield className="w-5 h-5" />
          </div>
          {!collapsed && <span className="sb-logo-title">CarryOn™</span>}
        </div>
        {!collapsed && <span className="sb-logo-subtitle" data-testid="sidebar-portal-label">{getRoleLabel()}</span>}
      </div>

      {/* Dev Portal Switcher Panel — founder only, floating overlay */}
      {devOpen && isAdminSession && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
            onClick={() => setDevOpen(false)} />
          <div style={{
            position: 'fixed', top: 70, left: 8, width: 280, maxHeight: 'calc(100vh - 100px)',
            background: '#0F1629', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', zIndex: 100,
            overflowY: 'auto',
          }}>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
                Portal Switcher
              </div>
              {user && (
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                  Logged in as: <strong style={{ color: '#E2E8F0' }}>{user.name || user.email}</strong>
                  <br /><span style={{ textTransform: 'capitalize', color: '#F0C95C' }}>{user.role}</span>
                </div>
              )}
              {!devConfig?.benefactor?.email && !devConfig?.beneficiary?.email && (
                <div style={{ padding: 10, background: 'rgba(245,158,11,0.1)', borderRadius: 8, marginBottom: 8, border: '1px dashed rgba(245,158,11,0.3)' }}>
                  <div style={{ fontSize: 11, color: '#F59E0B', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Settings className="w-3 h-3" /> Not Configured
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>
                    Go to Admin → Dev Switcher to assign accounts for quick switching.
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {devAccounts.filter(a => !a.isOperator && (a.role === 'admin' || a.role === 'ops_view' ? isPortalOn(a.role === 'ops_view' ? 'operations' : 'founder') : isPortalOn(a.role))).map(acc => {
                  const devActiveRole = localStorage.getItem('dev_switcher_active_role');
                  const isActive = acc.role === 'admin'
                    ? user?.role === 'admin' && (!devActiveRole || devActiveRole === 'admin')
                    : acc.role === 'ops_view'
                      ? devActiveRole === 'ops_view'
                      : devActiveRole
                        ? acc.role === devActiveRole && user?.email === acc.email
                        : acc.role === user?.role && user?.email === acc.email;
                  return (
                    <div key={acc.role}
                      onClick={(e) => { e.stopPropagation(); if (!isActive && !devSwitching) handleDevSwitch(acc); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        background: isActive ? 'rgba(224,173,43,0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isActive ? 'rgba(224,173,43,0.3)' : 'rgba(255,255,255,0.06)'}`,
                        borderRadius: 10, cursor: isActive || devSwitching ? 'default' : 'pointer',
                        transition: 'all .15s', opacity: devSwitching ? 0.5 : 1,
                      }}
                      data-testid={`dev-switch-${acc.role}`}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', background: acc.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0,
                        border: isActive ? '2px solid #F0C95C' : '2px solid transparent',
                      }}>
                        {acc.role[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#F0C95C' : '#E2E8F0' }}>{acc.label}</div>
                        <div style={{ fontSize: 11, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.email || (acc.role === 'admin' ? 'Restore admin session' : acc.role === 'ops_view' ? 'View as operator' : 'Not configured')}</div>
                      </div>
                      {isActive && <span style={{ fontSize: 11, color: '#F0C95C', flexShrink: 0 }}>Active</span>}
                      {devSwitching === acc.role && <div className="w-4 h-4 border-2 border-[#F0C95C] border-t-transparent rounded-full animate-spin" />}
                    </div>
                  );
                })}
              </div>
              {/* Scope Preview — admin only, shown right after main portals */}
              {user?.role === 'admin' && visibleScopePreviews.length > 0 && (
                <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6, paddingLeft: 2 }}>
                    Admin Scope Preview
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {new URLSearchParams(window.location.search).get('scope') && (
                      <div
                        onClick={(e) => { e.stopPropagation(); handleRestoreFounder(); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                          background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)',
                          borderRadius: 8, cursor: 'pointer', transition: 'all .15s',
                        }}
                        data-testid="scope-restore-founder"
                      >
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#0F1629' }}>F</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#d4af37' }}>Restore Founder View</div>
                      </div>
                    )}
                    {visibleScopePreviews.map(sp => {
                      const activeScopeParam = new URLSearchParams(window.location.search).get('scope');
                      const isActive = activeScopeParam === sp.scope;
                      return (
                        <div key={sp.scope}
                          onClick={(e) => { e.stopPropagation(); if (!isActive) handleScopePreview(sp.scope); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                            background: isActive ? `${sp.color}12` : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${isActive ? `${sp.color}40` : 'rgba(255,255,255,0.04)'}`,
                            borderRadius: 8, cursor: isActive ? 'default' : 'pointer', transition: 'all .15s',
                          }}
                          data-testid={`scope-${sp.scope}`}
                        >
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: sp.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>{sp.label[0]}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: isActive ? sp.color : '#CBD5E1' }}>{sp.label}</div>
                            <div style={{ fontSize: 11, color: '#525C72' }}>{sp.desc}</div>
                          </div>
                          {isActive && <span style={{ fontSize: 11, color: sp.color, flexShrink: 0 }}>Active</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Operator accounts — at the bottom */}
              {devAccounts.filter(a => a.isOperator).length > 0 && (
                <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6, paddingLeft: 2 }}>
                    Operator Accounts
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {devAccounts.filter(a => a.isOperator).map(acc => {
                      const devActiveRole = localStorage.getItem('dev_switcher_active_role');
                      const isActive = devActiveRole ? acc.role === devActiveRole && user?.email === acc.email : false;
                      return (
                        <div key={acc.role}
                          onClick={(e) => { e.stopPropagation(); if (!isActive && !devSwitching) handleDevSwitch(acc); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                            background: isActive ? 'rgba(224,173,43,0.1)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${isActive ? 'rgba(224,173,43,0.3)' : 'rgba(255,255,255,0.04)'}`,
                            borderRadius: 8, cursor: isActive || devSwitching ? 'default' : 'pointer',
                            transition: 'all .15s', opacity: devSwitching ? 0.5 : 1,
                          }}
                          data-testid={`dev-switch-${acc.role}`}>
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', background: acc.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0,
                          }}>
                            {acc.label[0]}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#F0C95C' : '#CBD5E1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.label}</div>
                          </div>
                          {devSwitching === acc.role && <div className="w-3 h-3 border-2 border-[#F0C95C] border-t-transparent rounded-full animate-spin" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 8, fontSize: 11, color: '#525C72', textAlign: 'center' }}>No OTP required · Instant switch</div>
            </div>
          </div>
        </>
      )}

      {/* Admin OTP Toggle — Founder only, not operators */}
      {user?.role === 'admin' && !window.location.pathname.startsWith('/ops') && (
        <>
          <OtpToggle collapsed={collapsed} />
          {/* Offline mode master switch — founder-only. Placed directly
              below the OTP toggle per PM request. Single knob engages
              IndexedDB sync, outbox drain, pending uploads, and at-rest
              encryption together. */}
          <OfflineModeToggle collapsed={collapsed} />
        </>
      )}

      {/* Beta Banner — only shows when beta_mode is active */}
      <BetaBanner collapsed={collapsed} />

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-4" style={{ overscrollBehavior: 'contain' }}>
        {getNavSections().map((section, idx) => {
          const isAccountSection = section.title === 'ACCOUNT';
          return (
          <div key={idx} className="nav-section">
            {section.title && !collapsed && <div className="nav-section-title">{section.title}</div>}
            {section.items.map((item, itemIdx) => (
              <React.Fragment key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => `${isAccountSection ? 'nav-item-sm' : 'nav-item'} ${isActive ? 'active' : ''}`}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon />
                  {!collapsed && <span>{item.label}</span>}
                  {item.badge > 0 && (
                    <span className="ml-auto min-w-[20px] h-5 rounded-full flex items-center justify-center text-[11px] font-bold px-1.5" style={{ background: '#d4af37', color: '#080e1a' }} data-testid={`ect-unread-badge`}>
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </NavLink>
                {itemIdx < section.items.length - 1 && (
                  <div className="nav-divider" />
                )}
              </React.Fragment>
            ))}
          </div>
          );
        })}
      </nav>

      {/* Bottom Pinned Section */}
      <div className="sb-user">
        {/* Notifications */}
        <NotificationBell collapsed={collapsed} />

        {/* Light/Dark Mode — pill button */}
        <button
          onClick={toggleTheme}
          className={`sb-pill w-full ${collapsed ? 'justify-center' : ''}`}
          data-testid="theme-toggle"
          title={collapsed ? (theme === 'dark' ? 'Light Mode' : 'Dark Mode') : undefined}
        >
          {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          {!collapsed && <span>{theme === 'dark' ? 'Light' : 'Dark'} Mode</span>}
        </button>

        {/* Collapse — pill button */}
        <button
          onClick={toggleCollapsed}
          className={`sb-pill w-full ${collapsed ? 'justify-center' : ''}`}
          data-testid="sidebar-collapse-toggle"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
          {!collapsed && <span>Collapse</span>}
        </button>

        {/* ── Separator ── */}
        <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.08)', margin: '2px 0' }} />

        {/* Admin Portal Buttons — stacked above Sign Out */}
        {user?.role === 'admin' && (() => {
          const scopes = scopeArr(user?.admin_scope);
          const isFounder = scopes.includes('founder');
          const visiblePortals = isFounder
            ? ADMIN_PORTALS
            : ADMIN_PORTALS.filter(p => scopes.includes(p.scope) || (p.altScope && scopes.includes(p.altScope)));
          if (visiblePortals.length < 1) return null;
          const currentPath = window.location.pathname;
          const activeViewScope = scopes;
          return (
            <>
              {!collapsed && (
                <div style={{ fontSize: 14, fontWeight: 700, color: '#8895A7', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6, paddingLeft: 4 }}>
                  {visiblePortals.length > 1 ? 'Switch Portal' : 'My Portal'}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {visiblePortals.map(portal => {
                  const scopeParam = new URLSearchParams(window.location.search).get('scope');
                  const isActive = portal.scope === 'founder'
                    ? !scopeParam && !currentPath.startsWith('/ops')
                    : scopeParam === portal.scope || (portal.altScope && scopeParam === portal.altScope);
                  return (
                    <button
                      key={portal.scope}
                      onClick={() => {
                        if (portal.scope === 'founder') {
                          navigate('/admin');
                        } else {
                          navigate(`/admin?scope=${portal.scope}`);
                        }
                      }}
                      data-testid={`portal-btn-${portal.scope}`}
                      className={`sb-pill w-full ${collapsed ? 'justify-center' : ''}`}
                      style={{
                        background: isActive
                          ? `${portal.color}15`
                          : undefined,
                        borderColor: isActive ? `${portal.color}40` : undefined,
                        color: isActive ? portal.color : undefined,
                        fontWeight: isActive ? 700 : undefined,
                        padding: collapsed ? undefined : '10px 16px',
                        flexDirection: collapsed ? undefined : 'column',
                        alignItems: collapsed ? undefined : 'center',
                        gap: collapsed ? undefined : 2,
                      }}
                    >
                      {collapsed ? (
                        <Shield className="w-[18px] h-[18px]" style={{ color: isActive ? portal.color : undefined }} />
                      ) : (
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{portal.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* Switch View — Portal Pills (Benefactor/Beneficiary) */}
        {(() => {
          const ownedEstates = benEstates.filter(e => e.user_role_in_estate === 'owner');
          const beneficiaryEstates = benEstates.filter(e => e.user_role_in_estate === 'beneficiary' || e.is_beneficiary_estate);
          const showSwitch = ownedEstates.length > 0 || beneficiaryEstates.length > 0;
          if (!showSwitch) return null;
          const isBenActive = window.location.pathname.startsWith('/beneficiary');
          const isBenefactorActive = !isBenActive && ownedEstates.length > 0;
          // Determine which estate is currently active
          const currentEstateId = localStorage.getItem('selected_estate_id')
            || user?.primary_estate_id
            || (ownedEstates.length > 0 ? ownedEstates[0].id : null);
          return (
            <>
              {!collapsed && (
                <div style={{ fontSize: 14, fontWeight: 700, color: '#8895A7', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6, paddingLeft: 4 }}>
                  Switch View
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
                {/* Benefactor Portal — always opens picker with estates + create new */}
                {ownedEstates.length > 0 && (
                  <button onClick={() => setEstatePickerOpen(!estatePickerOpen)}
                  data-testid="switch-benefactor-portal"
                  className={`sb-pill w-full ${collapsed ? 'justify-center' : ''}`}
                  style={{
                    background: isBenefactorActive
                      ? theme === 'light' ? 'rgba(212,175,55,0.15)' : 'rgba(212,175,55,0.1)'
                      : undefined,
                    borderColor: isBenefactorActive ? 'rgba(212,175,55,0.4)' : undefined,
                    color: isBenefactorActive
                      ? theme === 'light' ? '#1a2744' : '#d4af37'
                      : undefined,
                    fontWeight: isBenefactorActive ? 700 : undefined,
                    padding: collapsed ? undefined : '10px 16px',
                    flexDirection: collapsed ? undefined : 'column',
                    alignItems: collapsed ? undefined : 'center',
                    gap: collapsed ? undefined : 2,
                  }}>
                    {collapsed ? (
                      <Shield className="w-[18px] h-[18px]" style={{ color: isBenefactorActive ? (theme === 'light' ? '#1a2744' : '#d4af37') : undefined }} />
                    ) : (
                      <>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>My Benefactor Portal</span>
                        <span style={{ fontSize: 11, opacity: 0.5 }}>{ownedEstates.length} estate{ownedEstates.length !== 1 ? 's' : ''}</span>
                      </>
                    )}
                  </button>
                )}

                {/* Estate Picker — always shows estates + create new */}
                {estatePickerOpen && ownedEstates.length > 0 && (
                  <>
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
                      onClick={() => setEstatePickerOpen(false)} />
                    <div style={{
                      position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
                      background: 'var(--bg2)', border: '1px solid var(--b2)',
                      borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 100,
                      padding: 8,
                    }} data-testid="estate-picker">
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t5)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6, paddingLeft: 4 }}>
                        Select Estate
                      </div>
                      {[...ownedEstates].sort((a, b) => {
                        const pid = user?.primary_estate_id;
                        if (a.id === pid) return -1;
                        if (b.id === pid) return 1;
                        return 0;
                      }).map(estate => {
                        const isCurrent = currentEstateId === estate.id;
                        const isPrimary = user?.primary_estate_id === estate.id;
                        return (
                        <div key={estate.id} className="flex items-center gap-1 mb-1">
                          <button
                            onClick={() => {
                              localStorage.setItem('selected_estate_id', estate.id);
                              localStorage.removeItem('beneficiary_estate_id');
          localStorage.removeItem('beneficiary_feature_access');
                              localStorage.setItem('carryon_last_portal', 'benefactor');
                              setEstatePickerOpen(false);
                              clearCache();
                              navigate('/dashboard');
                              window.location.reload();
                            }}
                            data-testid={`pick-estate-${estate.id}`}
                            className="flex-1 flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm transition-colors"
                            style={{
                              color: isCurrent ? '#d4af37' : 'var(--t)',
                              background: isCurrent ? 'rgba(212,175,55,0.15)' : 'transparent',
                              border: isCurrent ? '2px solid rgba(212,175,55,0.5)' : '1px solid transparent',
                              fontWeight: isCurrent ? 700 : 500,
                            }}
                          >
                            {isCurrent && <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#d4af37' }} />}
                            <span>{estate.name || 'Estate'}{isPrimary ? ' ★' : ''}</span>
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await axios.put(`${API_URL}/estates/set-primary/${estate.id}`, {}, { headers: { Authorization: `Bearer ${localStorage.getItem('carryon_token')}` } });
                                clearCache();
                                await refreshUser();
                              } catch {}
                            }}
                            title={isPrimary ? 'Primary estate' : 'Set as primary'}
                            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                            style={{ color: isPrimary ? '#d4af37' : 'var(--t5)' }}
                          >
                            <Star className="w-3.5 h-3.5" style={{ fill: isPrimary ? '#d4af37' : 'none', transition: 'fill 0.2s' }} />
                          </button>
                        </div>
                        );
                      })}
                      <div style={{ height: 1, background: 'var(--b2)', margin: '6px 4px' }} />
                      <button
                        onClick={() => {
                          setEstatePickerOpen(false);
                          navigate('/create-estate');
                        }}
                        data-testid="create-new-estate-btn"
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                        style={{ color: '#d4af37' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <Plus className="w-4 h-4" /> Create New Estate
                      </button>
                    </div>
                  </>
                )}

                {/* Beneficiary Portal — single pill, always goes to hub */}
                {beneficiaryEstates.length > 0 && (
                  <button onClick={() => {
                    localStorage.removeItem('selected_estate_id');
                    localStorage.removeItem('beneficiary_estate_id');
          localStorage.removeItem('beneficiary_feature_access');
                    localStorage.setItem('carryon_last_portal', 'beneficiary');
                    clearCache();
                    navigate('/beneficiary');
                    window.location.reload();
                  }}
                  data-testid="switch-beneficiary-portal"
                  className={`sb-pill w-full ${collapsed ? 'justify-center' : ''}`}
                  style={{
                    background: isBenActive
                      ? theme === 'light' ? 'rgba(212,175,55,0.15)' : 'rgba(212,175,55,0.1)'
                      : undefined,
                    borderColor: isBenActive ? 'rgba(212,175,55,0.4)' : undefined,
                    color: isBenActive
                      ? theme === 'light' ? '#1a2744' : '#d4af37'
                      : undefined,
                    fontWeight: isBenActive ? 700 : undefined,
                    padding: collapsed ? undefined : '10px 16px',
                    flexDirection: collapsed ? undefined : 'column',
                    alignItems: collapsed ? undefined : 'center',
                    gap: collapsed ? undefined : 2,
                  }}>
                    {collapsed ? (
                      <Users className="w-[18px] h-[18px]" style={{ color: isBenActive ? (theme === 'light' ? '#1a2744' : '#d4af37') : undefined }} />
                    ) : (
                      <>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>My Beneficiary Portal</span>
                        {beneficiaryEstates.length > 1 && <span style={{ fontSize: 11, opacity: 0.5 }}>{beneficiaryEstates.length} estates</span>}
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          );
        })()}

        {/* ── Separator ── */}
        <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.08)', margin: '2px 0' }} />

        {/* Sign Out — pill button, danger style */}
        <button
          onClick={handleLogout}
          className={`sb-pill danger w-full ${collapsed ? 'justify-center' : ''}`}
          data-testid="logout-button"
          title={collapsed ? 'Sign Out' : undefined}
        >
          <LogOut className="w-[18px] h-[18px]" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;

// Beta Banner Component
const BetaBanner = ({ collapsed }) => {
  const [isBeta, setIsBeta] = useState(null);
  
  useEffect(() => {
    const check = async () => {
      try {
        const res = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/subscriptions/plans`);
        setIsBeta(res.data.beta_mode);
      } catch { setIsBeta(null); }
    };
    check();
    // Poll every 15s so toggling beta in Founder tab reflects immediately
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!isBeta) return null;

  if (collapsed) {
    return (
      <div className="mx-auto my-2 w-9 h-9 rounded-lg flex items-center justify-center" 
        style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
        title="BETA = FREE">
        <span className="text-base font-bold text-[var(--gn2)]" style={{ fontFamily: 'serif' }}>&beta;</span>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-lg text-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }} data-testid="beta-banner">
      <span className="text-[11px] font-bold text-[var(--gn2)] tracking-wider">BETA = FREE</span>
    </div>
  );
};
