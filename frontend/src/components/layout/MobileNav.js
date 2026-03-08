import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
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
  CreditCard
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';
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
    setVals({
      sat: get('env(safe-area-inset-top)'),
      sab: get('env(safe-area-inset-bottom)'),
      headerPt: headerStyle?.paddingTop || 'N/A',
      headerH: headerEl?.offsetHeight || 'N/A',
      dpr: window.devicePixelRatio,
      screenW: window.screen.width,
      screenH: window.screen.height,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      viewportCovers: window.innerHeight >= (window.screen.height - 10) ? 'YES' : 'NO',
      isNativeApp: document.body.classList.contains('native-app') ? 'YES' : 'NO',
      systemSafeArea: 'contentInset: never',
      ua: navigator.userAgent.slice(0, 80),
    });
  }, []);

  // Also measure via a hidden div trick
  const [measuredTop, setMeasuredTop] = React.useState('N/A');
  React.useEffect(() => {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:0;left:0;height:env(safe-area-inset-top,0px);width:1px;pointer-events:none;';
    document.body.appendChild(div);
    setTimeout(() => {
      setMeasuredTop(div.offsetHeight + 'px');
      document.body.removeChild(div);
    }, 100);
  }, []);

  const row = (label, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      <span style={{ color: '#aaa', fontSize: '12px' }}>{label}</span>
      <span style={{ color: '#4ade80', fontSize: '12px', fontWeight: 'bold', maxWidth: '180px', wordBreak: 'break-all', textAlign: 'right' }}>{String(value)}</span>
    </div>
  );

  return (
    <div>
      {row('safe-area-inset-top (CSS)', vals.sat)}
      {row('safe-area-inset-top (measured)', measuredTop)}
      {row('viewport-fit=cover active?', vals.viewportCovers)}
      {row('native-app class?', vals.isNativeApp)}
      {row('system-safe-area?', vals.systemSafeArea)}
      {row('safe-area-inset-bottom', vals.sab)}
      {row('Header paddingTop', vals.headerPt)}
      {row('Header offsetHeight', vals.headerH)}
      {row('Device Pixel Ratio', vals.dpr)}
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
  const [tapCount, setTapCount] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const tapTimerRef = React.useRef(null);

  // Dev portal switcher (founder only)
  const [devOpen, setDevOpen] = useState(false);
  const [devConfig, setDevConfig] = useState(null);
  const [devSwitching, setDevSwitching] = useState(null);
  const isAdminSession = user?.role === 'admin' || localStorage.getItem('dev_switcher_admin_session') === 'true';

  const fetchDevConfig = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/dev-switcher/config`);
      const data = await res.json();
      setDevConfig(data);
    } catch {}
  };

  const devAccounts = [];
  if (devConfig?.benefactor?.email) devAccounts.push({ label: 'Benefactor', email: devConfig.benefactor.email, password: devConfig.benefactor.password, role: 'benefactor', color: '#2563eb', redirect: '/dashboard' });
  if (devConfig?.beneficiary?.email) devAccounts.push({ label: 'Beneficiary', email: devConfig.beneficiary.email, password: devConfig.beneficiary.password, role: 'beneficiary', color: '#8b5cf6', redirect: '/beneficiary' });
  devAccounts.push({ label: 'Founder Portal', role: 'admin', color: '#E0AD2B', redirect: '/admin' });
  devAccounts.push({ label: 'Operations Portal', role: 'ops_view', color: '#3B82F6', redirect: '/ops' });

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
  const handleLogoTap = (e) => {
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
    // Non-admin: 5-tap debug
    const newCount = tapCount + 1;
    setTapCount(newCount);
    clearTimeout(tapTimerRef.current);
    if (newCount >= 5) {
      setShowDebug(true);
      setTapCount(0);
    } else {
      tapTimerRef.current = setTimeout(() => setTapCount(0), 2000);
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
    { to: '/timeline', icon: Clock, label: 'Legacy Timeline' },
  ];

  // Staff portals (admin/operator) — no menu items, only theme + sign out
  const adminMenuItems = [];
  const operatorMenuItems = [];

  const getAccountItems = () => {
    if (user?.role === 'admin') return [];
    if (user?.role === 'operator') return [];
    if (user?.role === 'beneficiary') {
      return [
        { to: '/beneficiary/settings', icon: Settings, label: 'Settings' },
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
    { to: '/dashboard', icon: Home, label: 'Home', isCenter: true },
    { to: '/messages', icon: MessageSquare, label: 'Milestone' },
    { to: '/trustee', icon: Shield, label: 'Trustee' },
  ];

  const beneficiaryBottomNav = [
    { to: '/beneficiary/vault', icon: FolderLock, label: 'Vault' },
    { to: '/beneficiary/guardian', icon: Sparkles, label: 'Guardian' },
    { to: '/beneficiary/dashboard', icon: Home, label: 'Home', isCenter: true },
    { to: '/beneficiary/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/beneficiary/checklist', icon: CheckSquare, label: 'Checklist' },
  ];

  const adminBottomNav = [
    { id: 'admin-tvt', to: '/admin/transition', icon: FileKey, label: 'TVT' },
    { id: 'admin-support', to: '/admin/support', icon: Headphones, label: 'Support' },
    { id: 'admin-home', to: '/admin', icon: Home, label: 'Home', isCenter: true },
    { id: 'admin-dts', to: '/admin/dts', icon: Shield, label: 'DTS' },
    { id: 'admin-verify', to: '/admin/verifications', icon: ShieldCheck, label: 'Verify' },
  ];

  const operatorBottomNav = [
    { id: 'ops-tvt', to: '/ops/transition', icon: FileKey, label: 'TVT' },
    { id: 'ops-support', to: '/ops/support', icon: Headphones, label: 'Support' },
    { id: 'ops-home', to: '/ops', icon: Home, label: 'Home', isCenter: true },
    { id: 'ops-dts', to: '/ops/dts', icon: Shield, label: 'DTS' },
    { id: 'ops-verify', to: '/ops/verifications', icon: ShieldCheck, label: 'Verify' },
  ];

  const getBottomNav = () => {
    if (user?.role === 'admin') return adminBottomNav;
    if (user?.role === 'operator') return operatorBottomNav;
    if (user?.role === 'beneficiary') return beneficiaryBottomNav;
    return benefactorBottomNav;
  };

  return (
    <>
      {/* Top Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 w-full mobile-header z-50">
        <div className="h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-3 relative" onTouchEnd={handleLogoTap} onClick={handleLogoTap} style={{ cursor: 'pointer', touchAction: 'manipulation' }}>
            <img 
              src="/carryon-app-icon.jpg" 
              alt="CarryOn" 
              className="w-10 h-10 rounded-xl object-cover"
              style={{ pointerEvents: 'none' }}
            />
            <span className="text-[#E0AD2B] font-bold text-lg" style={{ fontFamily: 'Outfit, sans-serif', pointerEvents: 'none' }}>
              CarryOn™
            </span>
            {tapCount > 0 && tapCount < 5 && !isAdminSession && (
              <span style={{ position: 'absolute', top: -4, right: -8, background: '#E0AD2B', color: '#000', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{tapCount}</span>
            )}
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
                      const isActive = acc.role === 'admin' ? (user?.role === 'admin' && !window.location.pathname.startsWith('/ops')) : acc.role === 'ops_view' ? window.location.pathname.startsWith('/ops') : user?.email === acc.email;
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

          <Sheet open={open} onOpenChange={setOpen}>
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

              {/* MY LEGACY Section */}
              <nav className="flex-1 px-4 overflow-y-auto" role="navigation" aria-label="Main menu">
                {/* Main nav items — hidden for staff (admin/operator) */}
                {(user?.role === 'admin' ? adminMenuItems : user?.role === 'operator' ? operatorMenuItems : myLegacyItems).length > 0 && (
                <div className="mb-6">
                  <h3 
                    className="text-xs font-semibold tracking-wider uppercase mb-3 px-2"
                    style={{ color: theme === 'dark' ? '#525C72' : '#64748B' }}
                  >
                    
                  </h3>
                  <div>
                    {(user?.role === 'admin' ? adminMenuItems : user?.role === 'operator' ? operatorMenuItems : myLegacyItems).map((item, idx) => {
                      const items = user?.role === 'admin' ? adminMenuItems : user?.role === 'operator' ? operatorMenuItems : myLegacyItems;
                      return (
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
                        {idx < items.length - 1 && (
                          <div className="flex justify-center">
                            <div style={{ 
                              width: '87.5%', 
                              height: '1px', 
                              background: theme === 'dark' ? '#2E3B56' : 'rgba(30,64,130,0.12)'
                            }} />
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
                )}

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

              {/* Theme Toggle Button */}
              <div className="px-4 pb-3">
                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all"
                  style={{
                    backgroundColor: theme === 'dark' ? 'var(--b)' : 'rgba(0,0,0,0.05)',
                    border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    color: theme === 'dark' ? '#A0AABF' : '#475569'
                  }}
                >
                  {theme === 'dark' ? (
                    <>
                      <Sun className="w-5 h-5" />
                      <span className="font-medium">Light Mode</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-5 h-5" />
                      <span className="font-medium">Dark Mode</span>
                    </>
                  )}
                </button>
              </div>

              {/* Sign Out */}
              <div className="px-4 pb-6">
                <button
                  onClick={() => { setOpen(false); handleLogout(); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all"
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

      {/* Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full mobile-bottom-nav z-50 pb-safe" role="navigation" aria-label="Bottom navigation">
        <div className="flex items-end h-16 px-1">
          {getBottomNav().map((item, index) => {
            const isCenter = item.isCenter;
            const showDivider = index < getBottomNav().length - 1;
            
            return (
              <React.Fragment key={item.id || item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive: routeActive }) => {
                    const isActive = routeActive && !item.forceInactive;
                    return isCenter 
                      ? `flex flex-col items-center -mt-6 flex-1`
                      : `mobile-nav-item flex flex-col items-center gap-1 py-2 flex-1 ${isActive ? 'active' : ''}`;
                  }}
                  style={({ isActive: routeActive }) => {
                    const isActive = routeActive && !item.forceInactive;
                    return (!isCenter && !isActive ? { color: theme === 'dark' ? 'rgba(255,255,255,0.7)' : '#1e3a5f' } : {});
                  }}
                  data-testid={`mobile-nav-${item.label.toLowerCase()}`}
                  aria-label={item.label}
                >
                  {({ isActive: routeActive }) => {
                    const isActive = routeActive && !item.forceInactive;
                    return (
                    isCenter ? (
                      <>
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
                          isActive 
                            ? 'bg-gradient-to-br from-[var(--gold)] to-[var(--gold2)] text-[#08090F]' 
                            : 'bg-[var(--bg3)] text-[var(--t3)] border border-[var(--b)]'
                        }`}>
                          <item.icon className="w-6 h-6" />
                        </div>
                        <span className={`text-xs mt-1 font-semibold ${isActive ? 'text-[var(--gold)]' : ''}`}
                          style={!isActive ? { color: theme === 'dark' ? 'rgba(255,255,255,0.7)' : '#1e3a5f' } : {}}>
                          {item.label}
                        </span>
                      </>
                    ) : (
                      <>
                        <item.icon className="w-5 h-5" />
                        <span className="text-xs font-semibold">{item.label}</span>
                      </>
                    )
                  );}}
                </NavLink>
                {showDivider && (
                  <div 
                    className="h-10 flex-shrink-0" 
                    style={{ alignSelf: 'center', width: '2px', backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(30,58,95,0.2)' }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default MobileNav;
