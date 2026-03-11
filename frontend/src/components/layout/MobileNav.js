import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../utils/haptics';
import { Switch } from '../ui/switch';
import {
  LayoutDashboard,
  FolderLock,
  MessageSquare,
  Users,
  Menu,
  X,
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
  Bell
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';
import NotificationBell from '../NotificationBell';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BASE_URL = process.env.REACT_APP_BACKEND_URL;

const MobileOtpToggle = () => {
  const [otpDisabled, setOtpDisabled] = useState(false);
  useEffect(() => {
    const token = localStorage.getItem('carryon_token');
    if (token) {
      axios.get(`${API_URL}/admin/platform-settings`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => setOtpDisabled(res.data?.otp_disabled || false)).catch(() => {});
    }
  }, []);
  const toggle = () => {
    const newVal = !otpDisabled;
    setOtpDisabled(newVal);
    const token = localStorage.getItem('carryon_token');
    axios.put(`${API_URL}/admin/platform-settings`, { otp_disabled: newVal }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }).catch(() => setOtpDisabled(!newVal));
  };
  return (
    <button onClick={toggle} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all"
      style={{ background: otpDisabled ? 'rgba(239,68,68,0.08)' : 'var(--b)', border: `1px solid ${otpDisabled ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)'}` }}>
      <ShieldCheck className="w-5 h-5" style={{ color: otpDisabled ? '#ef4444' : '#10b981' }} />
      <span className="font-medium" style={{ color: otpDisabled ? '#ef4444' : '#A0AABF' }}>OTP {otpDisabled ? 'Disabled' : 'Enabled'}</span>
    </button>
  );
};

const DebugValues = () => {
  const [vals, setVals] = React.useState({});
  React.useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const get = (prop) => cs.getPropertyValue(prop) || '0px';
    const headerEl = document.querySelector('.mobile-header');
    const headerStyle = headerEl ? getComputedStyle(headerEl) : null;
    const bottomNavEl = document.querySelector('.mobile-bottom-nav');
    const bottomNavStyle = bottomNavEl ? getComputedStyle(bottomNavEl) : null;
    setVals({
      sat: get('env(safe-area-inset-top)'),
      sab: get('env(safe-area-inset-bottom)'),
      headerPt: headerStyle?.paddingTop || 'N/A',
      headerH: headerEl?.offsetHeight || 'N/A',
      headerMb: headerStyle?.marginBottom || '0',
      bottomNavH: bottomNavEl?.offsetHeight || 'N/A',
      bottomNavPb: bottomNavStyle?.paddingBottom || 'N/A',
      dpr: window.devicePixelRatio,
      screenW: window.screen.width,
      screenH: window.screen.height,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      viewportCovers: window.innerHeight >= (window.screen.height - 10) ? 'YES' : 'NO',
      isNativeApp: document.body.classList.contains('native-app') ? 'YES' : 'NO',
      ua: navigator.userAgent.slice(0, 80),
    });
  }, []);

  // Measure safe-area-inset-top via hidden div
  const [measuredTop, setMeasuredTop] = React.useState('N/A');
  const [measuredBottom, setMeasuredBottom] = React.useState('N/A');
  React.useEffect(() => {
    const divTop = document.createElement('div');
    divTop.style.cssText = 'position:fixed;top:0;left:0;height:env(safe-area-inset-top,0px);width:1px;pointer-events:none;';
    const divBottom = document.createElement('div');
    divBottom.style.cssText = 'position:fixed;bottom:0;left:0;height:env(safe-area-inset-bottom,0px);width:1px;pointer-events:none;';
    document.body.appendChild(divTop);
    document.body.appendChild(divBottom);
    setTimeout(() => {
      setMeasuredTop(divTop.offsetHeight + 'px');
      setMeasuredBottom(divBottom.offsetHeight + 'px');
      document.body.removeChild(divTop);
      document.body.removeChild(divBottom);
    }, 100);
  }, []);

  const row = (label, value, highlight) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      <span style={{ color: '#aaa', fontSize: '12px' }}>{label}</span>
      <span style={{ color: highlight ? '#E0AD2B' : '#4ade80', fontSize: '12px', fontWeight: 'bold', maxWidth: '180px', wordBreak: 'break-all', textAlign: 'right' }}>{String(value)}</span>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: '10px', color: '#E0AD2B', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>Top Spacing</div>
      {row('safe-area-inset-top (CSS)', vals.sat)}
      {row('safe-area-inset-top (measured)', measuredTop, true)}
      {row('Header paddingTop', vals.headerPt)}
      {row('Header total height', vals.headerH + 'px')}
      <div style={{ height: 12 }} />
      <div style={{ fontSize: '10px', color: '#E0AD2B', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>Bottom Spacing</div>
      {row('safe-area-inset-bottom (CSS)', vals.sab)}
      {row('safe-area-inset-bottom (measured)', measuredBottom, true)}
      {row('Bottom Nav height', vals.bottomNavH + 'px')}
      {row('Bottom Nav paddingBottom', vals.bottomNavPb)}
      <div style={{ height: 12 }} />
      <div style={{ fontSize: '10px', color: '#E0AD2B', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>Device</div>
      {row('viewport-fit=cover?', vals.viewportCovers)}
      {row('Native app?', vals.isNativeApp)}
      {row('DPR', vals.dpr)}
      {row('Screen', `${vals.screenW}x${vals.screenH}`)}
      {row('Viewport', `${vals.innerW}x${vals.innerH}`)}
      <div style={{ marginTop: '8px', padding: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
        <span style={{ color: '#aaa', fontSize: '10px', wordBreak: 'break-all' }}>{vals.ua}</span>
      </div>
    </div>
  );
};

const MobileNav = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const longPressTimerRef = React.useRef(null);

  // Dev portal switcher (founder only)
  const [devOpen, setDevOpen] = useState(false);
  const [devConfig, setDevConfig] = useState(null);
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
          localStorage.setItem('dev_switcher_admin_session', 'true');
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
  const myLegacyItems = [
    { to: '/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/vault', icon: FolderLock, label: 'Secure Document Vault (SDV)' },
    { to: '/messages', icon: MessageSquare, label: 'Milestone Messages (MM)' },
    { to: '/checklist', icon: CheckSquare, label: 'Immediate Action Checklist (IAC)' },
    { to: '/beneficiaries', icon: Users, label: 'Beneficiaries' },
    { to: '/trustee', icon: Shield, label: 'Designated Trustee Services (DTS)' },
    { to: '/guardian', icon: Sparkles, label: 'Estate Guardian (EGA)' },
    { to: '/digital-wallet', icon: KeyRound, label: 'Digital Access Vault (DAV)' },
    { to: '/timeline', icon: Clock, label: 'Estate Plan Timeline' },
  ];

  const beneficiaryLegacyItems = [
    { to: '/beneficiary/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/beneficiary/vault', icon: FolderLock, label: 'Secure Document Vault (SDV)' },
    { to: '/beneficiary/guardian', icon: Sparkles, label: 'Estate Guardian (EGA)' },
    { to: '/beneficiary/checklist', icon: CheckSquare, label: 'Immediate Action Checklist (IAC)' },
    { to: '/beneficiary/messages', icon: MessageSquare, label: 'Milestone Messages (MM)' },
    { to: '/beneficiary/milestone', icon: Gift, label: 'Report Milestone' },
  ];

  // Staff portals — tool shortcuts in hamburger menu
  const adminMenuItems = [
    { to: '/admin/announcements', icon: Megaphone, label: 'Announcements' },
    { to: '/admin/system-health', icon: HeartPulse, label: 'System Health' },
    { to: '/admin/escalations', icon: AlertTriangle, label: 'Escalations' },
    { to: '/admin/knowledge-base', icon: BookOpen, label: 'Knowledge Base' },
  ];
  const operatorMenuItems = [
    { to: '/ops/my-activity', icon: Clock, label: 'My Activity' },
    { to: '/ops/search', icon: Search, label: 'Quick Search' },
    { to: '/ops/escalations', icon: AlertTriangle, label: 'Escalate' },
    { to: '/ops/shift-notes', icon: StickyNote, label: 'Shift Notes' },
    { to: '/ops/estate-health', icon: HeartPulse, label: 'Estate Health' },
    { to: '/ops/knowledge-base', icon: BookOpen, label: 'SOPs' },
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
  const benefactorBottomNav = [
    { to: '/vault', icon: FolderLock, label: 'Vault' },
    { to: '/guardian', icon: Sparkles, label: 'Guardian' },
    { to: '/dashboard', icon: Home, label: 'Dashboard', isCenter: true },
    { to: '/messages', icon: MessageSquare, label: 'Milestone' },
    { to: '/trustee', icon: Shield, label: 'Trustee' },
  ];

  const beneficiaryBottomNav = [
    { to: '/beneficiary/vault', icon: FolderLock, label: 'Vault' },
    { to: '/beneficiary/guardian', icon: Sparkles, label: 'Guardian' },
    { to: '/beneficiary/dashboard', icon: Home, label: 'Dashboard', isCenter: true },
    { to: '/beneficiary/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/beneficiary/checklist', icon: CheckSquare, label: 'Checklist' },
  ];

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

  const getBottomNav = () => {
    // Admin viewing ops portal should see operator bottom nav
    if (user?.role === 'admin' && window.location.pathname.startsWith('/ops')) return operatorBottomNav;
    if (user?.role === 'admin') return adminBottomNav;
    if (user?.role === 'operator') return operatorBottomNav;
    // Multi-role: beneficiary on benefactor routes
    if (user?.role === 'beneficiary' && user?.is_also_benefactor && !window.location.pathname.startsWith('/beneficiary')) return benefactorBottomNav;
    if (user?.role === 'beneficiary') return beneficiaryBottomNav;
    // Benefactor on beneficiary routes
    if (user?.role === 'benefactor' && window.location.pathname.startsWith('/beneficiary')) return beneficiaryBottomNav;
    return benefactorBottomNav;
  };

  return (
    <>
      {/* Top Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 w-full mobile-header z-50">
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
            <span className="text-[#E0AD2B] font-bold text-lg" style={{ fontFamily: 'Outfit, sans-serif', pointerEvents: 'none' }}>
              CarryOn™
            </span>
          </div>

          {/* Dev Portal Switcher — mobile, founder only */}
          {devOpen && isAdminSession && (
            <>
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 98 }}
                onClick={() => setDevOpen(false)} />
              <div style={{
                position: 'fixed', top: 56, left: 8, width: 280,
                background: '#0F1629', border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', zIndex: 100,
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
                      <div style={{ fontSize: 10, color: '#94A3B8' }}>Go to Admin → Dev Switcher to assign accounts.</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {devAccounts.map(acc => {
                      const isActive = acc.role === 'admin' ? (user?.role === 'admin' && !window.location.pathname.startsWith('/ops')) : acc.role === 'ops_view' ? (user?.role === 'admin' && window.location.pathname.startsWith('/ops')) : user?.email === acc.email;
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
                            <div style={{ fontSize: 10, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.email || (acc.role === 'admin' ? 'Restore admin session' : acc.role === 'ops_view' ? 'View as operator' : 'Not configured')}</div>
                          </div>
                          {isActive && <span style={{ fontSize: 10, color: '#F0C95C', flexShrink: 0 }}>Active</span>}
                          {devSwitching === acc.role && <div className="w-4 h-4 border-2 border-[#F0C95C] border-t-transparent rounded-full animate-spin" />}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10, color: '#525C72', textAlign: 'center' }}>No OTP required · Instant switch</div>
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
                    sectionTitle = '';
                  } else if (user?.role === 'benefactor' && isOnBeneficiary) {
                    menuItems = beneficiaryLegacyItems;
                    sectionTitle = 'ESTATE PLAN ACCESS';
                  } else {
                    menuItems = myLegacyItems;
                    sectionTitle = '';
                  }
                  return menuItems.length > 0 && (
                <div className="mb-6">
                  <h3 
                    className="text-xs font-semibold tracking-wider uppercase mb-3 px-2"
                    style={{ color: theme === 'dark' ? '#525C72' : '#64748B' }}
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
                                ? 'text-[#E0AD2B]' 
                                : theme === 'dark' ? 'text-[#D8DEE9]' : 'text-[#334155]'
                            }`
                          }
                          style={({ isActive }) => ({
                            backgroundColor: isActive 
                              ? (theme === 'dark' ? 'rgba(224,173,43,0.1)' : 'rgba(224,173,43,0.1)')
                              : 'transparent',
                            fontWeight: 700,
                            fontSize: '15px'
                          })}
                        >
                          <item.icon className="w-5 h-5" />
                          <span>{item.label}</span>
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
                    className="text-xs font-semibold tracking-wider uppercase mb-3 px-2"
                    style={{ color: theme === 'dark' ? '#525C72' : '#64748B' }}
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
                              ? 'text-[#E0AD2B]' 
                              : theme === 'dark' ? 'text-[#D8DEE9]' : 'text-[#334155]'
                          }`
                        }
                        style={({ isActive }) => ({
                          backgroundColor: isActive 
                            ? (theme === 'dark' ? 'rgba(224,173,43,0.1)' : 'rgba(224,173,43,0.1)')
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

                {/* Switch View — Portal Pills */}
                {(() => {
                  const isMultiRole = user?.is_also_benefactor || user?.is_also_beneficiary ||
                    (user?.role === 'benefactor' && user?.role !== 'admin');
                  if (!isMultiRole || user?.role === 'admin' || user?.role === 'operator') return null;
                  const isOnBeneficiary = window.location.pathname.startsWith('/beneficiary');
                  return (
                    <div className="mb-2">
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#525C72', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4 }}>
                        Switch View
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button onClick={() => {
                          setOpen(false);
                          localStorage.setItem('carryon_last_portal', 'benefactor');
                          navigate('/dashboard');
                          if (isOnBeneficiary) window.location.reload();
                        }}
                        data-testid="mobile-switch-benefactor"
                        className="w-full flex flex-col items-center px-4 py-3 rounded-xl transition-all"
                        style={{
                          border: `1px solid ${!isOnBeneficiary ? 'rgba(212,175,55,0.3)' : theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                          color: !isOnBeneficiary ? '#d4af37' : theme === 'dark' ? '#A0AABF' : '#475569',
                          backgroundColor: !isOnBeneficiary ? 'rgba(212,175,55,0.08)' : theme === 'dark' ? 'var(--b)' : 'rgba(0,0,0,0.05)',
                          gap: 2,
                        }}>
                          <span className="font-semibold text-sm">My Benefactor Portal</span>
                          <span style={{ fontSize: 11, opacity: 0.6 }}>Benefactor = Me</span>
                        </button>
                        <button onClick={() => {
                          setOpen(false);
                          localStorage.setItem('carryon_last_portal', 'beneficiary');
                          navigate('/beneficiary');
                          if (!isOnBeneficiary) window.location.reload();
                        }}
                        data-testid="mobile-switch-beneficiary"
                        className="w-full flex flex-col items-center px-4 py-3 rounded-xl transition-all"
                        style={{
                          border: `1px solid ${isOnBeneficiary ? 'rgba(212,175,55,0.3)' : theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                          color: isOnBeneficiary ? '#d4af37' : theme === 'dark' ? '#A0AABF' : '#475569',
                          backgroundColor: isOnBeneficiary ? 'rgba(212,175,55,0.08)' : theme === 'dark' ? 'var(--b)' : 'rgba(0,0,0,0.05)',
                          gap: 2,
                        }}>
                          <span className="font-semibold text-sm">My Beneficiary Portal</span>
                          <span style={{ fontSize: 11, opacity: 0.6 }}>Benefactor = {user?.name?.split(' ')[0] || 'Unknown'}</span>
                        </button>
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
      <div className="lg:hidden fixed bottom-0 left-0 w-full z-40 pointer-events-none" style={{
        height: 'calc(80px + env(safe-area-inset-bottom, 4px))',
        background: 'linear-gradient(to top, var(--bg) 0%, var(--bg) 20%, transparent 100%)',
      }} />

      {/* Bottom Navigation — floating glass pill */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full z-50" role="navigation" aria-label="Bottom navigation" style={{ paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}>
        <div className="mx-2 mb-1 mobile-bottom-nav rounded-[22px] overflow-hidden">
          <div className="flex items-end min-h-[3.5rem] px-2">
          {getBottomNav().map((item, index) => {
            const isCenter = item.isCenter;
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
                    const isActive = routeActive && !item.forceInactive;
                    return (!isActive ? { color: theme === 'dark' ? 'rgba(255,255,255,0.7)' : '#1e3a5f' } : {});
                  }}
                  data-testid={`mobile-nav-${item.label.toLowerCase()}`}
                  aria-label={item.label}
                >
                  {({ isActive: routeActive }) => {
                    const isActive = routeActive && !item.forceInactive;
                    return (
                      <>
                        <item.icon className="w-5 h-5" />
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
