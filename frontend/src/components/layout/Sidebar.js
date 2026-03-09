import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../utils/haptics';
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
  FileKey,
  Home,
  Headphones,
  ShieldCheck,
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
  Gift
} from 'lucide-react';
import { Switch } from '../ui/switch';
import { toast } from '../../utils/toast';
import NotificationBell from '../NotificationBell';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;
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

const Sidebar = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [benEstates, setBenEstates] = useState([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('carryon_sidebar_collapsed') === 'true');
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
          localStorage.setItem('dev_switcher_admin_session', 'true');
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

  const toggleCollapsed = () => {
    haptics.light();
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('carryon_sidebar_collapsed', String(next));
    window.dispatchEvent(new Event('sidebar-toggle'));
  };

  // Fetch estates for beneficiary sidebar switcher
  useEffect(() => {
    if (user?.role === 'beneficiary') {
      const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;
      const token = localStorage.getItem('carryon_token');
      if (token) {
        axios.get(`${API_URL}/estates`, { headers: { Authorization: `Bearer ${token}` } })
          .then(res => setBenEstates(res.data))
          .catch(() => {});
      }
    }
  }, [user]);

  const activeEstateId = localStorage.getItem('beneficiary_estate_id');
  const activeEstate = benEstates.find(e => e.id === activeEstateId);

  const switchEstate = (estate) => {
    localStorage.setItem('beneficiary_estate_id', estate.id);
    setSwitcherOpen(false);
    if (estate.status === 'transitioned') {
      navigate('/beneficiary/dashboard');
    } else {
      navigate('/beneficiary/pre');
    }
    window.location.reload();
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Navigation structure matching prototype
  const benefactorNavSections = [
    {
      title: '',
      items: [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/messages', icon: MessageSquare, label: 'Milestone Messages (MM)' },
        { to: '/vault', icon: FolderLock, label: 'Secure Document Vault (SDV)' },
        { to: '/checklist', icon: CheckSquare, label: 'Immediate Action Checklist (IAC)' },
        { to: '/digital-wallet', icon: KeyRound, label: 'Digital Access Vault (DAV)' },
        { to: '/guardian', icon: Sparkles, label: 'Estate Guardian (EGA)' },
        { to: '/trustee', icon: Shield, label: 'Designated Trustee Services (DTS)' },
        { to: '/beneficiaries', icon: Users, label: 'Beneficiaries' },
        { to: '/timeline', icon: Clock, label: 'Legacy Timeline' },
      ]
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

  const beneficiaryNavSections = [
    {
      title: 'LEGACY ACCESS',
      items: [
        { to: '/beneficiary/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/beneficiary/vault', icon: FolderLock, label: 'Secure Document Vault (SDV)' },
        { to: '/beneficiary/guardian', icon: Sparkles, label: 'Estate Guardian (EGA)' },
        { to: '/beneficiary/checklist', icon: CheckSquare, label: 'Immediate Action Checklist (IAC)' },
        { to: '/beneficiary/messages', icon: MessageSquare, label: 'Milestone Messages (MM)' },
        { to: '/beneficiary/milestone', icon: Home, label: 'Report Milestone' },
      ]
    },
    {
      title: 'ESTATES',
      items: [
        { to: '/beneficiary', icon: Users, label: 'All Estates' },
      ]
    },
    {
      title: 'ACCOUNT',
      items: [
        { to: '/beneficiary/settings', icon: Settings, label: 'Settings' },
        { to: '/subscription', icon: CreditCard, label: 'Subscription' },
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
        { to: '/ops/knowledge-base', icon: BookOpen, label: 'SOPs' },
      ]
    }
  ];

  const getNavSections = () => {
    // Admin viewing ops portal should see operator nav
    if (user?.role === 'admin' && window.location.pathname.startsWith('/ops')) return operatorNavSections;
    if (user?.role === 'admin') return adminNavSections;
    if (user?.role === 'operator') return operatorNavSections;
    if (user?.role === 'beneficiary') return beneficiaryNavSections;
    return benefactorNavSections;
  };

  const getUserInitials = () => {
    if (user?.first_name && user?.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    }
    if (user?.name) {
      return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return 'U';
  };

  const getUserDisplayName = () => {
    if (user?.first_name && user?.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    return user?.name || 'User';
  };

  const getRoleLabel = () => {
    if (user?.role === 'beneficiary') return 'BENEFICIARY';
    if (user?.role === 'admin' && window.location.pathname.startsWith('/ops')) return 'OPERATIONS';
    if (user?.role === 'admin') return 'FOUNDER PORTAL';
    if (user?.role === 'operator' && user?.operator_role === 'manager') return 'OPS MANAGER';
    if (user?.role === 'operator') return 'OPERATIONS';
    return 'BENEFACTOR PORTAL';
  };

  return (
    <aside className={`sb hidden lg:flex ${collapsed ? 'collapsed' : ''}`} data-testid="sidebar" role="navigation" aria-label="Main navigation">
      {/* Logo Section — clickable for founder portal switcher */}
      <div className="sb-logo" style={{ cursor: isAdminSession ? 'pointer' : 'default' }}
        onClick={() => { if (isAdminSession) { setDevOpen(!devOpen); if (!devOpen) fetchDevConfig(); } }}
        data-testid="sidebar-logo">
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
        {!collapsed && (
          <div className="sb-logo-text">
            <span className="sb-logo-title">CarryOn™</span>
            <span className="sb-logo-subtitle">{getRoleLabel()}</span>
          </div>
        )}
      </div>

      {/* Dev Portal Switcher Panel — founder only, floating overlay */}
      {devOpen && isAdminSession && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
            onClick={() => setDevOpen(false)} />
          <div style={{
            position: 'fixed', top: 70, left: 8, width: 280,
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
                  <div style={{ fontSize: 11, color: '#F59E0B', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Settings className="w-3 h-3" /> Not Configured
                  </div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>
                    Go to Admin → Dev Switcher to assign accounts for quick switching.
                  </div>
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

      {/* Admin OTP Toggle — Founder only, not operators */}
      {user?.role === 'admin' && !window.location.pathname.startsWith('/ops') && (
        <OtpToggle collapsed={collapsed} />
      )}

      {/* Beta Banner */}
      {collapsed ? (
        <div className="mx-auto my-2 w-9 h-9 rounded-lg flex items-center justify-center" 
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
          title="BETA = FREE">
          <span className="text-base font-bold text-[var(--gn2)]" style={{ fontFamily: 'serif' }}>&beta;</span>
        </div>
      ) : (
        <BetaBanner />
      )}

      {/* Beneficiary Estate Switcher — removed from sidebar, now in page header */}

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-4">
        {getNavSections().map((section, idx) => (
          <div key={idx} className="nav-section">
            {section.title && !collapsed && <div className="nav-section-title">{section.title}</div>}
            {section.items.map((item, itemIdx) => (
              <React.Fragment key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
                {itemIdx < section.items.length - 1 && (
                  <div className="nav-divider" />
                )}
              </React.Fragment>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer - Notifications, Theme Toggle & User */}
      <div className="sb-user">
        {/* Notification Bell */}
        <NotificationBell collapsed={collapsed} />

        {/* Theme Toggle */}
        {collapsed ? (
          <button
            onClick={toggleTheme}
            className="nav-item w-full justify-center mb-3"
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
        ) : (
          <div className="theme-toggle mb-4" data-testid="theme-toggle">
            <div className="theme-toggle-label" onClick={toggleTheme}>
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              <span>{theme === 'dark' ? 'Dark' : 'Light'} Mode</span>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={toggleTheme}
            />
          </div>
        )}

        {/* User Info */}
        {collapsed ? (
          <div className="sb-user-info justify-center" title={getUserDisplayName()}>
            <div className="sb-avatar">
              {getUserInitials()}
            </div>
          </div>
        ) : (
          <div className="sb-user-info">
            <div className="sb-avatar">
              {getUserInitials()}
            </div>
            <div className="sb-user-details">
              <div className="sb-user-name">{getUserDisplayName()}</div>
              <div className="sb-user-email">{user?.email || ''}</div>
            </div>
          </div>
        )}

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className={`nav-item w-full mt-3 text-[var(--rd)] hover:bg-[var(--rdbg)] ${collapsed ? 'justify-center' : ''}`}
          data-testid="logout-button"
          title={collapsed ? 'Sign Out' : undefined}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span>Sign Out</span>}
        </button>

        {/* Collapse Toggle */}
        <button
          onClick={toggleCollapsed}
          className={`nav-item w-full mt-2 ${collapsed ? 'justify-center' : ''}`}
          data-testid="sidebar-collapse-toggle"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;

// Beta Banner Component
const BetaBanner = () => {
  const [isBeta, setIsBeta] = useState(null);
  
  useEffect(() => {
    const check = async () => {
      try {
        const res = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/subscriptions/plans`);
        setIsBeta(res.data.beta_mode);
      } catch { setIsBeta(null); }
    };
    check();
  }, []);

  if (!isBeta) return null;

  return (
    <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-lg text-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }} data-testid="beta-banner">
      <span className="text-[10px] font-bold text-[var(--gn2)] tracking-wider">BETA = FREE</span>
    </div>
  );
};
