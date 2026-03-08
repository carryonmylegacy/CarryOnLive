import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
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
  StickyNote
} from 'lucide-react';
import { Switch } from '../ui/switch';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

  const toggleCollapsed = () => {
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
      ]
    }
  ];

  const operatorNavSections = [
    {
      title: 'TOOLS',
      items: [
        { to: '/ops/my-activity', icon: Clock, label: 'My Activity' },
        { to: '/ops/search', icon: Search, label: 'Quick Search' },
        { to: '/ops/escalations', icon: AlertTriangle, label: 'Escalate' },
        { to: '/ops/shift-notes', icon: StickyNote, label: 'Shift Notes' },
        { to: '/ops/knowledge-base', icon: BookOpen, label: 'SOPs' },
      ]
    }
  ];

  const getNavSections = () => {
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
    if (user?.role === 'admin') return 'FOUNDER PORTAL';
    if (user?.role === 'operator') return 'OPERATIONS';
    return 'BENEFACTOR PORTAL';
  };

  return (
    <aside className={`sb hidden lg:flex ${collapsed ? 'collapsed' : ''}`} data-testid="sidebar" role="navigation" aria-label="Main navigation">
      {/* Logo Section */}
      <div className="sb-logo">
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

      {/* Footer - Theme Toggle & User */}
      <div className="sb-user">
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
