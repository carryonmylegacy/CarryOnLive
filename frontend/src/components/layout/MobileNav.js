import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../utils/haptics';
import { clearCache } from '../../utils/apiCache';
import {
  FolderLock,
  MessageSquare,
  Users,
  Menu,
  Shield,
  Sparkles,
  CheckSquare,
  Settings,
  LogOut,
  Home,
  Moon,
  Sun,
  FileKey,
  Headphones,
  ShieldCheck,
  KeyRound,
  Clock,
  CreditCard,
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
  DollarSign,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';
import NotificationBell from '../NotificationBell';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';
import { filterNavByFeatures } from '../../utils/featureGates';
import { DOCK_REGISTRY, ADMIN_PORTALS, scopeArr, hasScope } from './navConfig';
import MobileOtpToggle from './MobileOtpToggle';
import DebugValues from './DebugValues';

export { DOCK_REGISTRY }; // re-export so existing consumers don't break

const BASE_URL = process.env.REACT_APP_BACKEND_URL;

const MobileNav = () => {
  const { user, logout, refreshUser, enabledFeatures, setUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const longPressTimerRef = React.useRef(null);
  const [mobileEstates, setMobileEstates] = useState([]);
  const [mobileEstatePicker, setMobileEstatePicker] = useState(false);
  const [ectUnread, setEctUnread] = useState(0);
  const [customDockItems, setCustomDockItems] = useState(null); // null = not loaded yet

  // Fetch estates for portal switching
  React.useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'operator') {
      const token = localStorage.getItem('carryon_token');
      if (token) {
        import('axios').then(({ default: ax }) => {
          ax.get(`${BASE_URL}/api/estates`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => setMobileEstates(res.data || []))
            .catch(() => {});
        });
      }
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll ECT unread count for badge
  React.useEffect(() => {
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
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute role key for dock preferences
  const dockRole = React.useMemo(() => {
    const path = location.pathname;
    if (user?.role === 'admin' && path.startsWith('/ops')) return 'operator';
    if (user?.role === 'admin') return 'admin';
    if (user?.role === 'operator') return 'operator';
    if (user?.role === 'beneficiary' && user?.is_also_benefactor && !path.startsWith('/beneficiary')) return 'benefactor';
    if (user?.role === 'beneficiary') return 'beneficiary';
    if (user?.role === 'benefactor' && path.startsWith('/beneficiary')) return 'beneficiary';
    return 'benefactor';
  }, [user, location.pathname]);

  // Fetch custom dock preferences
  React.useEffect(() => {
    setCustomDockItems(null); // Reset immediately on role change to avoid stale items
    const tk = localStorage.getItem('carryon_token');
    if (!tk) return;
    fetch(`${BASE_URL}/api/user-preferences/dock?role=${dockRole}`, { headers: { Authorization: `Bearer ${tk}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.items && d.items.length > 0) {
          const availRoutes = new Set((DOCK_REGISTRY[dockRole] || []).map(i => i.to));
          const valid = d.items.filter(route => availRoutes.has(route));
          if (valid.length > 0) setCustomDockItems(valid);
        }
      })
      .catch(() => {});
  }, [user, dockRole]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const mobilePv = devConfig?.portal_visibility || {};
  const isMobilePortalOn = (key) => mobilePv[key] !== false;
  const mobileVisibleScopes = SCOPE_PREVIEWS.filter(sp => isMobilePortalOn(sp.scope));

  const handleMobileScopePreview = (scope) => {
    setDevOpen(false);
    toast.success(`Viewing as: ${SCOPE_PREVIEWS.find(s => s.scope === scope)?.label || scope}`);
    navigate(`/admin?scope=${scope}`);
  };

  const handleMobileRestoreFounder = () => {
    setDevOpen(false);
    toast.success('Restored Founder view');
    navigate('/admin');
  };

  const handleDevSwitch = async (account) => {
    setDevSwitching(account.role);
    try {
      const currentToken = localStorage.getItem('carryon_token');
      if (user?.role === 'admin' && currentToken) localStorage.setItem('dev_switcher_admin_token', currentToken);
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
      // Operator accounts — use admin impersonation
      if (account.isOperator) {
        const adminToken = localStorage.getItem('dev_switcher_admin_token') || currentToken;
        if (!adminToken) throw new Error('No admin session found.');
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

  const lastTapRef = React.useRef(0);
  const longPressTriggered = React.useRef(false);

  // Long press (800ms) on logo → spacing debug overlay (works for ALL users including admin)
  const handleLogoTouchStart = () => {
    longPressTriggered.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggered.current = true;
      setShowDebug(true);
      try { navigator.vibrate && navigator.vibrate([50, 30, 50]); } catch {}
    }, 800);
  };
  const handleLogoTouchEnd = () => {
    clearTimeout(longPressTimerRef.current);
  };

  const handleLogoTap = (e) => {
    // If long press just triggered, don't fire tap
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < 100) return;
    lastTapRef.current = now;
    e.preventDefault();
    e.stopPropagation();
    // Admin: single tap opens portal switcher
    if (isAdminSession) {
      setDevOpen(!devOpen);
      if (!devOpen) fetchDevConfig();
      return;
    }
    // Non-admin: tap logo goes to dashboard of current portal
    navigate(window.location.pathname.startsWith('/beneficiary') ? '/beneficiary' : '/dashboard');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    setOpen(false);
  };

  const handleNavClick = () => {
    setOpen(false);
  };

  // Navigation structure matching prototype - with sections
  const myLegacyItems = filterNavByFeatures([
    { to: '/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/beneficiaries', icon: Users, label: 'Beneficiaries' },
    { to: '/messages', icon: MessageSquare, label: 'Milestone Messages (MM)' },
    { to: '/checklist', icon: CheckSquare, label: 'Immediate Action Checklist (IAC)' },
    { to: '/vault', icon: FolderLock, label: 'Secure Document Vault (SDV)' },
    { to: '/guardian', icon: Sparkles, label: 'Estate Guardian AI (EGA)' },
    { to: '/ffn', icon: Heart, label: 'Family & Friends Notification (FFN)' },
    { to: '/digital-wallet', icon: KeyRound, label: 'Digital Access Vault (DAV)' },
    { to: '/trustee', icon: Shield, label: 'Designated Trustee Services (DTS)' },
    { to: '/timeline', icon: Clock, label: 'Estate Plan Timeline' },
    { to: '/estate-chat', icon: MessageCircle, label: 'Estate Comms (ECT)', badge: ectUnread },
    { to: '/connected-protocol', icon: Shield, label: 'CarryOn Contingency Protocols (CCP)' },
  ], enabledFeatures);

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
  };

  const filterByFeatureAccess = (items) =>
    items.filter(item => {
      const flag = NAV_FEATURE_MAP[item.to];
      return !flag || featureAccess[flag] !== false;
    });

  const beneficiaryLegacyItems = filterNavByFeatures(filterByFeatureAccess([
    { to: '/beneficiary', icon: Home, label: 'Dashboard' },
    { to: '/beneficiary/vault', icon: FolderLock, label: 'Secure Document Vault (SDV)' },
    { to: '/beneficiary/guardian', icon: Sparkles, label: 'Estate Guardian (EGA)' },
    { to: '/beneficiary/checklist', icon: CheckSquare, label: 'Immediate Action Checklist (IAC)' },
    { to: '/beneficiary/messages', icon: MessageSquare, label: 'Milestone Messages (MM)' },
    { to: '/beneficiary/milestone', icon: Gift, label: 'Report Milestone' },
    { to: '/beneficiary/estate-chat', icon: MessageCircle, label: 'Estate Comms (ECT)', badge: ectUnread },
    { to: '/beneficiary/connected-protocol', icon: Shield, label: 'CarryOn Contingency Protocols (CCP)' },
  ]), enabledFeatures);

  // Staff portals — tool shortcuts in hamburger menu
  const adminMenuItems = [
    { to: '/admin/announcements', icon: Megaphone, label: 'Announcements' },
    { to: '/admin/system-health', icon: HeartPulse, label: 'System Health' },
    { to: '/admin/escalations', icon: AlertTriangle, label: 'Escalations' },
    { to: '/admin/knowledge-base', icon: BookOpen, label: 'Knowledge Base' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];
  const operatorMenuItems = [
    { to: '/ops/my-activity', icon: Clock, label: 'My Activity' },
    { to: '/ops/search', icon: Search, label: 'Quick Search' },
    { to: '/ops/escalations', icon: AlertTriangle, label: 'Escalate' },
    { to: '/ops/shift-notes', icon: StickyNote, label: 'Shift Notes' },
    ...(user?.operator_role === 'manager' ? [
      { to: '/ops/subscriptions', icon: CreditCard, label: 'Subs' },
    ] : []),
    { to: '/ops/system-health', icon: HeartPulse, label: 'System Health' },
    { to: '/ops/estate-health', icon: HeartPulse, label: 'Estate Health' },
    { to: '/ops/knowledge-base', icon: BookOpen, label: 'SOPs' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  const getAccountItems = () => {
    if (user?.role === 'admin') return [];
    if (user?.role === 'operator') return [];
    // If user is on beneficiary routes, show beneficiary account items
    const isOnBeneficiary = window.location.pathname.startsWith('/beneficiary');
    if (user?.role === 'beneficiary' && !isOnBeneficiary && user?.is_also_benefactor) {
      // Beneficiary viewing their own estate (benefactor context)
      return [
        { to: '/settings', icon: Settings, label: 'Settings' },
        { to: '/subscription', icon: CreditCard, label: 'Subscription' },
        { to: '/security-settings', icon: ShieldCheck, label: 'Security Settings' },
        { to: '/support', icon: Headphones, label: 'Customer Support' },
      ];
    }
    if (user?.role === 'beneficiary' || isOnBeneficiary) {
      return [
        { to: '/beneficiary/settings', icon: Settings, label: 'Settings' },
        { to: '/beneficiary/subscription', icon: CreditCard, label: 'Subscription' },
        { to: '/support', icon: Headphones, label: 'Customer Support' },
      ];
    }
    // Benefactor
    return [
      { to: '/settings', icon: Settings, label: 'Settings' },
      { to: '/subscription', icon: CreditCard, label: 'Subscription' },
      { to: '/security-settings', icon: ShieldCheck, label: 'Security Settings' },
      { to: '/support', icon: Headphones, label: 'Customer Support' },
    ];
  };

  const accountItems = getAccountItems();

  // Bottom nav for benefactor - 5 items with Home in center
  const benefactorBottomNav = filterNavByFeatures([
    { to: '/beneficiaries', icon: Users, label: 'Benefic.' },
    { to: '/messages', icon: MessageSquare, label: 'Milestone' },
    { to: '/dashboard', icon: Home, label: 'Dashboard', isCenter: true },
    { to: '/guardian', icon: Sparkles, label: 'Guardian' },
    { to: '/financial', icon: DollarSign, label: 'Financial' },
  ], enabledFeatures);

  const beneficiaryBottomNav = filterByFeatureAccess([
    { to: '/beneficiary/vault', icon: FolderLock, label: 'Vault' },
    { to: '/beneficiary', icon: Home, label: 'Dashboard', isCenter: true },
    { to: '/beneficiary/connected-protocol', icon: Shield, label: 'CCP' },
    { to: '/beneficiary/estate-chat', icon: MessageCircle, label: 'Chat' },
    { to: '/beneficiary/financial', icon: DollarSign, label: 'Financial' },
  ]);

  const adminBottomNav = [
    { id: 'admin-tvt', to: '/admin/transition', icon: FileKey, label: 'TVT' },
    { id: 'admin-support', to: '/admin/support', icon: Headphones, label: 'Support' },
    { id: 'admin-home', to: '/admin', icon: Home, label: 'Dashboard', isCenter: true },
    { id: 'admin-dts', to: '/admin/dts', icon: Shield, label: 'DTS' },
    { id: 'admin-verify', to: '/admin/verifications', icon: ShieldCheck, label: 'Verify' },
  ];

  const operatorBottomNav = [
    { id: 'ops-tvt', to: '/ops/transition', icon: FileKey, label: 'TVT' },
    { id: 'ops-support', to: '/ops/support', icon: Headphones, label: 'Support' },
    { id: 'ops-home', to: '/ops', icon: Home, label: 'Dashboard', isCenter: true },
    { id: 'ops-dts', to: '/ops/dts', icon: Shield, label: 'DTS' },
    { id: 'ops-verify', to: '/ops/verifications', icon: ShieldCheck, label: 'Verify' },
  ];

  const getDockRoleKey = () => {
    const path = location.pathname;
    if (user?.role === 'admin' && path.startsWith('/ops')) return 'operator';
    if (user?.role === 'admin') return 'admin';
    if (user?.role === 'operator') return 'operator';
    if (user?.role === 'beneficiary' && user?.is_also_benefactor && !path.startsWith('/beneficiary')) return 'benefactor';
    if (user?.role === 'beneficiary') return 'beneficiary';
    if (user?.role === 'benefactor' && path.startsWith('/beneficiary')) return 'beneficiary';
    return 'benefactor';
  };

  // Dashboard routes per role — used to position Dashboard first on even-count docks
  const DASHBOARD_ROUTES = {
    benefactor: '/dashboard',
    beneficiary: '/beneficiary',
    admin: '/admin',
    operator: '/ops',
  };

  const getBottomNav = () => {
    const roleKey = getDockRoleKey();
    const defaultNavs = {
      benefactor: benefactorBottomNav,
      beneficiary: beneficiaryBottomNav,
      admin: adminBottomNav,
      operator: operatorBottomNav,
    };

    let items;

    // If user has custom dock items, resolve them from the registry
    if (customDockItems && customDockItems.length > 0) {
      const registry = DOCK_REGISTRY[roleKey] || [];
      const resolved = customDockItems
        .map(route => registry.find(r => r.to === route))
        .filter(Boolean)
        .slice(0, 5);
      // Only use custom items if we resolved at least 3 valid entries
      items = resolved.length >= 3 ? resolved : (defaultNavs[roleKey] || benefactorBottomNav);
    } else {
      items = defaultNavs[roleKey] || benefactorBottomNav;
    }

    // Even-count rule: move Dashboard to the first (leftmost) position
    if (items.length % 2 === 0) {
      const dashRoute = DASHBOARD_ROUTES[roleKey];
      const dashIdx = items.findIndex(i => i.to === dashRoute);
      if (dashIdx > 0) {
        const dashItem = items[dashIdx];
        items = [dashItem, ...items.slice(0, dashIdx), ...items.slice(dashIdx + 1)];
      }
    }

    // Inject badges for dock items
    items = items.map(item => {
      if (item.to === '/estate-chat' || item.to === '/beneficiary/estate-chat') {
        return { ...item, badge: ectUnread };
      }
      return item;
    });

    return items;
  };

  return (
    <>
      {/* Top Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 w-full mobile-header z-50" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="min-h-[3rem] flex items-center justify-between px-4 py-1">
          <div className="flex items-center gap-3 relative"
            onTouchStart={handleLogoTouchStart}
            onTouchEnd={handleLogoTouchEnd}
            onTouchCancel={handleLogoTouchEnd}
            onClick={handleLogoTap}
            style={{ cursor: 'pointer', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none' }}>
            <img 
              src="/carryon-app-icon.jpg" 
              alt="CarryOn" 
              className="w-10 h-10 rounded-xl object-cover"
              style={{ pointerEvents: 'none' }}
            />
            <span className="text-[#E0AD2B] font-bold text-lg" style={{ fontFamily: 'var(--sans)', pointerEvents: 'none' }}>
              CarryOn™
            </span>
          </div>

          {/* Dev Portal Switcher — mobile, founder only */}
          {devOpen && isAdminSession && (
            <>
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 98 }}
                onClick={() => setDevOpen(false)} />
              <div style={{
                position: 'fixed', top: 56, left: 8, width: 280, maxHeight: 'calc(100vh - 80px)',
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
                      <div style={{ fontSize: 11, color: '#F59E0B', marginBottom: 4 }}>Not Configured</div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>Go to Admin → Dev Switcher to assign accounts.</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {devAccounts.filter(a => !a.isOperator).map(acc => {
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
                          data-testid={`mobile-dev-switch-${acc.role}`}>
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
                  {/* Admin Scope Preview — mobile */}
                  {user?.role === 'admin' && mobileVisibleScopes.length > 0 && (
                    <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6, paddingLeft: 2 }}>
                        Admin Scope Preview
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {new URLSearchParams(window.location.search).get('scope') && (
                          <div
                            onClick={(e) => { e.stopPropagation(); handleMobileRestoreFounder(); }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                              background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)',
                              borderRadius: 8, cursor: 'pointer',
                            }}
                            data-testid="mobile-scope-restore-founder"
                          >
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#0F1629' }}>F</div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#d4af37' }}>Restore Founder View</div>
                          </div>
                        )}
                        {mobileVisibleScopes.map(sp => {
                          const activeScopeParam = new URLSearchParams(window.location.search).get('scope');
                          const isActive = activeScopeParam === sp.scope;
                          return (
                            <div key={sp.scope}
                              onClick={(e) => { e.stopPropagation(); if (!isActive) handleMobileScopePreview(sp.scope); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                background: isActive ? `${sp.color}12` : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${isActive ? `${sp.color}40` : 'rgba(255,255,255,0.04)'}`,
                                borderRadius: 8, cursor: isActive ? 'default' : 'pointer',
                              }}
                              data-testid={`mobile-scope-${sp.scope}`}
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
                  {/* Operator accounts — at bottom */}
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
                                opacity: devSwitching ? 0.5 : 1,
                              }}
                              data-testid={`mobile-dev-switch-${acc.role}`}>
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: acc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>{acc.label[0]}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#F0C95C' : '#CBD5E1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.label}</div>
                              </div>
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

          <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (v) haptics.light(); }}>
            <SheetTrigger asChild>
              <button className="p-2 text-[var(--t)]" data-testid="mobile-menu-button" aria-label="Open navigation menu">
                <Menu className="w-6 h-6" />
              </button>
            </SheetTrigger>
          <SheetContent 
            side="right" 
            className="w-72 p-0 border-l"
            style={{ 
              background: theme === 'dark' ? '#141C33' : '#DBEAFE',
              borderColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              paddingTop: 'env(safe-area-inset-top, 0px)'
            }}
          >
            <div className="flex flex-col h-full">
              {/* Spacer for built-in close button */}
              <div className="h-12" />

              {/* MY ESTATE PLAN Section */}
              <nav className="flex-1 px-4 overflow-y-auto" role="navigation" aria-label="Main menu">
                {/* Main nav items — path-aware for admin viewing ops */}
                {(() => {
                  const isOpsView = user?.role === 'admin' && window.location.pathname.startsWith('/ops');
                  const isOnBeneficiary = window.location.pathname.startsWith('/beneficiary');
                  // Determine the right menu items based on role and current path context
                  let menuItems;
                  let sectionTitle;
                  if (isOpsView) {
                    menuItems = operatorMenuItems;
                    sectionTitle = 'TOOLS';
                  } else if (user?.role === 'admin') {
                    menuItems = adminMenuItems;
                    sectionTitle = 'TOOLS';
                  } else if (user?.role === 'operator') {
                    menuItems = operatorMenuItems;
                    sectionTitle = 'TOOLS';
                  } else if (isOnBeneficiary || (user?.role === 'beneficiary' && !user?.is_also_benefactor)) {
                    menuItems = beneficiaryLegacyItems;
                    sectionTitle = 'ESTATE PLAN ACCESS';
                  } else if (user?.role === 'beneficiary' && user?.is_also_benefactor && !isOnBeneficiary) {
                    menuItems = myLegacyItems;
                    sectionTitle = 'ESTATE PLAN ACCESS';
                  } else if (user?.role === 'benefactor' && isOnBeneficiary) {
                    menuItems = beneficiaryLegacyItems;
                    sectionTitle = 'ESTATE PLAN ACCESS';
                  } else {
                    menuItems = myLegacyItems;
                    sectionTitle = 'ESTATE PLAN ACCESS';
                  }
                  return menuItems.length > 0 && (
                <div className="mb-6">
                  <h3 
                    className="text-sm font-bold tracking-wider uppercase mb-3 px-2"
                    style={{ color: theme === 'dark' ? '#8895A7' : '#475569' }}
                  >
                    {sectionTitle}
                  </h3>
                  <div>
                    {menuItems.map((item, idx) => (
                      <div key={item.to}>
                        <NavLink
                          to={item.to}
                          onClick={handleNavClick}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-3.5 rounded-xl transition-all ${
                              isActive 
                                ? (theme === 'light' ? 'text-[#1a2744] font-extrabold' : 'text-[#E0AD2B]')
                                : theme === 'dark' ? 'text-[#D8DEE9]' : 'text-[#334155]'
                            }`
                          }
                          style={({ isActive }) => ({
                            backgroundColor: isActive 
                              ? (theme === 'dark' ? 'rgba(224,173,43,0.1)' : 'rgba(224,173,43,0.15)')
                              : 'transparent',
                            fontWeight: 700,
                            fontSize: '15px'
                          })}
                        >
                          <item.icon className="w-5 h-5" />
                          <span>{item.label}</span>
                          {item.badge > 0 && (
                            <span className="ml-auto min-w-[20px] h-5 rounded-full flex items-center justify-center text-[11px] font-bold px-1.5" style={{ background: '#d4af37', color: '#080e1a' }} data-testid="ect-unread-badge-mobile">
                              {item.badge > 99 ? '99+' : item.badge}
                            </span>
                          )}
                        </NavLink>
                        {idx < menuItems.length - 1 && (
                          <div className="flex justify-center">
                            <div style={{ 
                              width: '87.5%', 
                              height: '1px', 
                              background: theme === 'dark' ? '#2E3B56' : 'rgba(30,64,130,0.12)'
                            }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                  );
                })()}

                {/* ACCOUNT Section — hidden for staff (admin/operator) */}
                {accountItems.length > 0 && (
                <div className="mb-6">
                  <h3 
                    className="text-sm font-bold tracking-wider uppercase mb-3 px-2"
                    style={{ color: theme === 'dark' ? '#8895A7' : '#475569' }}
                  >
                    ACCOUNT
                  </h3>
                  <div>
                    {accountItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={handleNavClick}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-3.5 rounded-xl transition-all ${
                            isActive 
                              ? (theme === 'light' ? 'text-[#1a2744] font-extrabold' : 'text-[#E0AD2B]')
                              : theme === 'dark' ? 'text-[#D8DEE9]' : 'text-[#334155]'
                          }`
                        }
                        style={({ isActive }) => ({
                          backgroundColor: isActive 
                            ? (theme === 'dark' ? 'rgba(224,173,43,0.1)' : 'rgba(224,173,43,0.15)')
                            : 'transparent',
                          fontWeight: 700,
                          fontSize: '15px'
                        })}
                      >
                        <item.icon className="w-5 h-5" />
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
                )}
              </nav>

              {/* Admin OTP Toggle — Founder only */}
              {user?.role === 'admin' && !window.location.pathname.startsWith('/ops') && (
                <div className="px-4 pb-2">
                  <MobileOtpToggle />
                </div>
              )}

              {/* ═══ Bottom Pinned Section ═══ */}
              <div className="px-4 pt-4" style={{ borderTop: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, marginTop: 8 }}>
                {/* Notifications — pill */}
                <div className="mb-2">
                  <NotificationBell collapsed={false} />
                </div>

                {/* Light/Dark Mode — pill */}
                <button
                  onClick={toggleTheme}
                  data-testid="mobile-theme-toggle"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all mb-2"
                  style={{
                    backgroundColor: theme === 'dark' ? 'var(--b)' : 'rgba(0,0,0,0.05)',
                    border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    color: theme === 'dark' ? '#A0AABF' : '#475569'
                  }}
                >
                  {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  <span className="font-medium">{theme === 'dark' ? 'Light' : 'Dark'} Mode</span>
                </button>

                {/* ── Separator ── */}
                <div style={{ width: '100%', height: 1, background: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', margin: '8px 0' }} />

                {/* Admin Portal Buttons — stacked above Sign Out */}
                {(user?.role === 'admin' || user?.role === 'operator') && (() => {
                  const scopes = scopeArr(user?.admin_scope);
                  const isFounder = scopes.includes('founder');
                  const visiblePortals = isFounder
                    ? ADMIN_PORTALS
                    : ADMIN_PORTALS.filter(p => scopes.includes(p.scope) || (p.altScope && scopes.includes(p.altScope)));
                  if (visiblePortals.length < 1) return null;
                  const currentPath = window.location.pathname;
                  const activeViewScope = scopes;
                  return (
                    <div className="mb-2">
                      <div style={{ fontSize: 14, fontWeight: 700, color: theme === 'dark' ? '#8895A7' : '#475569', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4 }}>
                        {visiblePortals.length > 1 ? 'Switch Portal' : 'My Portal'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {visiblePortals.map(portal => {
                          const isActive = portal.scope === 'founder'
                            ? !new URLSearchParams(window.location.search).get('scope') && !currentPath.startsWith('/ops')
                            : new URLSearchParams(window.location.search).get('scope') === portal.scope || (portal.altScope && new URLSearchParams(window.location.search).get('scope') === portal.altScope);
                          return (
                            <button
                              key={portal.scope}
                              onClick={() => {
                                setOpen(false);
                                if (portal.scope === 'founder') {
                                  navigate('/admin');
                                } else {
                                  navigate(`/admin?scope=${portal.scope}`);
                                }
                              }}
                              data-testid={`mobile-portal-btn-${portal.scope}`}
                              className="w-full flex flex-col items-center px-4 py-3 rounded-xl transition-all"
                              style={{
                                border: `1px solid ${isActive ? `${portal.color}40` : theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                                color: isActive ? portal.color : theme === 'dark' ? '#A0AABF' : '#475569',
                                backgroundColor: isActive ? `${portal.color}15` : theme === 'dark' ? 'var(--b)' : 'rgba(0,0,0,0.05)',
                                fontWeight: isActive ? 700 : undefined,
                                gap: 2,
                              }}
                            >
                              <span className="font-semibold text-sm">{portal.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Switch View — Portal Pills (Benefactor/Beneficiary) */}
                {(() => {
                  const ownedEstates = mobileEstates.filter(e => e.user_role_in_estate === 'owner');
                  const beneficiaryEstates = mobileEstates.filter(e => e.user_role_in_estate === 'beneficiary' || e.is_beneficiary_estate);
                  const showSwitch = ownedEstates.length > 0 || beneficiaryEstates.length > 0;
                  if (!showSwitch || user?.role === 'admin' || user?.role === 'operator') return null;
                  const isOnBeneficiary = window.location.pathname.startsWith('/beneficiary');
                  const isBenefactorActive = !isOnBeneficiary && ownedEstates.length > 0;
                  const currentEstateId = localStorage.getItem('selected_estate_id')
                    || user?.primary_estate_id
                    || (ownedEstates.length > 0 ? ownedEstates[0].id : null);
                  return (
                    <div className="mb-2">
                      <div style={{ fontSize: 14, fontWeight: 700, color: theme === 'dark' ? '#8895A7' : '#475569', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4 }}>
                        Switch View
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {/* Benefactor Portal — always opens picker */}
                        {ownedEstates.length > 0 && (
                          <>
                            <button onClick={() => setMobileEstatePicker(!mobileEstatePicker)}
                            data-testid="mobile-switch-benefactor"
                            className="w-full flex flex-col items-center px-4 py-3 rounded-xl transition-all"
                            style={{
                              border: `1px solid ${isBenefactorActive ? 'rgba(212,175,55,0.4)' : theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                              color: isBenefactorActive ? (theme === 'light' ? '#1a2744' : '#d4af37') : theme === 'dark' ? '#A0AABF' : '#475569',
                              backgroundColor: isBenefactorActive ? (theme === 'light' ? 'rgba(212,175,55,0.15)' : 'rgba(212,175,55,0.08)') : theme === 'dark' ? 'var(--b)' : 'rgba(0,0,0,0.05)',
                              fontWeight: isBenefactorActive ? 700 : undefined,
                              gap: 2,
                            }}>
                              <span className="font-semibold text-sm">My Benefactor Portal</span>
                              <span style={{ fontSize: 11, opacity: 0.5 }}>{ownedEstates.length} estate{ownedEstates.length !== 1 ? 's' : ''}</span>
                            </button>
                            {/* Estate picker — estates + create new */}
                            {mobileEstatePicker && (
                              <div style={{ padding: 8, borderRadius: 10, background: theme === 'dark' ? 'var(--bg2)' : 'white', border: '1px solid var(--b2)' }}
                                data-testid="mobile-estate-picker">
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
                                        setOpen(false);
                                        setMobileEstatePicker(false);
                                        localStorage.setItem('selected_estate_id', estate.id);
                                        localStorage.removeItem('beneficiary_estate_id');
          localStorage.removeItem('beneficiary_feature_access');
                                        localStorage.setItem('carryon_last_portal', 'benefactor');
                                        clearCache();
                                        navigate('/dashboard');
                                        window.location.reload();
                                      }}
                                      data-testid={`mobile-pick-estate-${estate.id}`}
                                      className="flex-1 flex items-center gap-2 text-left px-3 py-3 rounded-lg text-sm"
                                      style={{
                                        color: isCurrent ? '#d4af37' : 'var(--t)',
                                        background: isCurrent ? 'rgba(212,175,55,0.15)' : 'transparent',
                                        border: isCurrent ? '2px solid rgba(212,175,55,0.5)' : '1px solid transparent',
                                        fontWeight: isCurrent ? 700 : 500,
                                      }}>
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
                                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md"
                                      style={{ color: isPrimary ? '#d4af37' : 'var(--t5)' }}
                                    >
                                      <Star className="w-4 h-4" style={{ fill: isPrimary ? '#d4af37' : 'none', transition: 'fill 0.2s' }} />
                                    </button>
                                  </div>
                                  );
                                })}
                                <div style={{ height: 1, background: 'var(--b2)', margin: '4px 4px' }} />
                                <button
                                  onClick={() => {
                                    setOpen(false);
                                    setMobileEstatePicker(false);
                                    navigate('/create-estate');
                                  }}
                                  data-testid="mobile-create-new-estate-btn"
                                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold"
                                  style={{ color: '#d4af37' }}>
                                  <Plus className="w-4 h-4" /> Create New Estate
                                </button>
                              </div>
                            )}
                          </>
                        )}
                        {/* Beneficiary Portal — single button to hub */}
                        {beneficiaryEstates.length > 0 && (
                          <button onClick={() => {
                            setOpen(false);
                            localStorage.removeItem('selected_estate_id');
                            localStorage.removeItem('beneficiary_estate_id');
          localStorage.removeItem('beneficiary_feature_access');
                            localStorage.setItem('carryon_last_portal', 'beneficiary');
                            clearCache();
                            navigate('/beneficiary');
                            if (!isOnBeneficiary) window.location.reload();
                          }}
                          data-testid="mobile-switch-beneficiary"
                          className="w-full flex flex-col items-center px-4 py-3 rounded-xl transition-all"
                          style={{
                            border: `1px solid ${isOnBeneficiary ? 'rgba(212,175,55,0.4)' : theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                            color: isOnBeneficiary ? (theme === 'light' ? '#1a2744' : '#d4af37') : theme === 'dark' ? '#A0AABF' : '#475569',
                            backgroundColor: isOnBeneficiary ? (theme === 'light' ? 'rgba(212,175,55,0.15)' : 'rgba(212,175,55,0.08)') : theme === 'dark' ? 'var(--b)' : 'rgba(0,0,0,0.05)',
                            fontWeight: isOnBeneficiary ? 700 : undefined,
                            gap: 2,
                          }}>
                            <span className="font-semibold text-sm">My Beneficiary Portal</span>
                            {beneficiaryEstates.length > 1 && <span style={{ fontSize: 11, opacity: 0.5 }}>{beneficiaryEstates.length} estates</span>}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Separator ── */}
                <div style={{ width: '100%', height: 1, background: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', margin: '8px 0' }} />

                {/* Sign Out — pill, danger style */}
                <button
                  onClick={() => { setOpen(false); handleLogout(); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all mb-6"
                  style={{
                    border: '1px solid rgba(244,63,94,0.25)',
                    color: '#F43F5E',
                    backgroundColor: 'rgba(244,63,94,0.06)',
                  }}
                  data-testid="mobile-logout-btn"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Debug Safe Area Overlay */}
      {showDebug && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', zIndex: 99999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '20px', color: '#fff', fontFamily: 'monospace'
        }}>
          <div style={{ background: '#1a1a2e', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '340px' }}>
            <h3 style={{ color: '#E0AD2B', fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', textAlign: 'center' }}>Safe Area Debug</h3>
            <DebugValues />
            <button
              onClick={() => setShowDebug(false)}
              style={{
                marginTop: '16px', width: '100%', padding: '12px',
                background: '#E0AD2B', color: '#000', fontWeight: 'bold',
                borderRadius: '8px', border: 'none', fontSize: '14px', cursor: 'pointer'
              }}
            >Close</button>
          </div>
        </div>
      )}

      {/* Bottom fade zone — frosted gradient behind nav area */}
      <div className="nav-fade-zone lg:hidden fixed bottom-0 left-0 w-full z-40 pointer-events-none" style={{
        height: 'calc(80px + env(safe-area-inset-bottom, 4px))',
        background: 'linear-gradient(to top, var(--bg) 0%, var(--bg) 20%, transparent 100%)',
      }} />

      {/* Bottom Navigation — floating glass pill */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full z-50" role="navigation" aria-label="Bottom navigation" style={{ paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}>
        <div className="mx-2 mb-1 mobile-bottom-nav rounded-[22px] overflow-hidden">
          <div className="flex items-end min-h-[3.5rem] px-2">
          {getBottomNav().map((item, index) => {
            const showDivider = index < getBottomNav().length - 1;
            
            return (
              <React.Fragment key={item.id || item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive: routeActive }) => {
                    const isActive = routeActive && !item.forceInactive;
                    return `mobile-nav-item flex flex-col items-center gap-1 py-2 flex-1 ${isActive ? 'active' : ''}`;
                  }}
                  style={({ isActive: routeActive }) => {
                    return (!(routeActive && !item.forceInactive) ? { color: theme === 'dark' ? 'rgba(255,255,255,0.7)' : '#1e3a5f' } : {});
                  }}
                  data-testid={`mobile-nav-${item.label.toLowerCase()}`}
                  aria-label={item.label}
                >
                  {({ isActive: routeActive }) => {
                    return (
                      <>
                        <div className="relative">
                          <item.icon className="w-5 h-5" />
                          {item.badge > 0 && (
                            <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[11px] font-bold px-1"
                              style={{ background: '#d4af37', color: '#080e1a' }}
                              data-testid={`dock-badge-${item.label.toLowerCase()}`}
                            >{item.badge > 99 ? '99+' : item.badge}</span>
                          )}
                        </div>
                        <span className="text-xs font-semibold">{item.label}</span>
                      </>
                  );}}
                </NavLink>
                {showDivider && (
                  <div 
                    className="h-10 flex-shrink-0" 
                    style={{ alignSelf: 'center', width: '1px', backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(30,58,95,0.12)' }}
                  />
                )}
              </React.Fragment>
            );
          })}
          </div>
        </div>
      </nav>
    </>
  );
};

export default MobileNav;
