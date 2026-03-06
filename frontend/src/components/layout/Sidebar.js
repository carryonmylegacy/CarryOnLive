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
  Clock
} from 'lucide-react';
import { Switch } from '../ui/switch';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const OtpToggle = () => {
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
        { to: '/support', icon: Headphones, label: 'Customer Support' },
      ]
    }
  ];

  const adminNavSections = [
    {
      title: 'ADMINISTRATION',
      items: [
        { to: '/admin', icon: LayoutDashboard, label: 'Dashboard & Users' },
      ]
    },
    {
      title: 'VERIFICATION',
      items: [
        { to: '/admin/transition', icon: FileKey, label: 'Transition Verification' },
      ]
    },
    {
      title: 'DTS',
      items: [
        { to: '/admin/dts', icon: Shield, label: 'DTS Management' },
      ]
    },
    {
      title: 'ACCOUNT',
      items: [
        { to: '/settings', icon: Settings, label: 'Settings' },
        { to: '/security-settings', icon: ShieldCheck, label: 'Security Settings' },
      ]
    }
  ];

  const getNavSections = () => {
    if (user?.role === 'admin') return adminNavSections;
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
    if (user?.role === 'admin') return 'ADMINISTRATOR';
    return 'BENEFACTOR PORTAL';
  };

  return (
    <aside className="sb hidden lg:flex" data-testid="sidebar" role="navigation" aria-label="Main navigation">
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
        <div className="sb-logo-text">
          <span className="sb-logo-title">CarryOn™</span>
          <span className="sb-logo-subtitle">{getRoleLabel()}</span>
        </div>
      </div>

      {/* Admin OTP Toggle */}
      {user?.role === 'admin' && (
        <OtpToggle />
      )}

      {/* Beta Banner */}
      <BetaBanner />

      {/* Beneficiary Estate Switcher */}
      {user?.role === 'beneficiary' && benEstates.length > 0 && (
        <div className="px-3 mb-1 relative">
          <div
            onClick={() => setSwitcherOpen(!switcherOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all"
            style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
            data-testid="estate-switcher"
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: activeEstate?.status === 'transitioned' ? 'linear-gradient(135deg, #6D28D9, #A855F7)' : 'linear-gradient(135deg, #1E40AF, #3B82F6)' }}>
              {activeEstate?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-bold text-[var(--t)] truncate">{activeEstate?.name || 'Select Estate'}'s Estate</div>
            </div>
            <span className="text-xs text-[var(--t5)]" style={{ transform: switcherOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▼</span>
          </div>
          {switcherOpen && (
            <div className="absolute left-3 right-3 top-full mt-1 rounded-lg overflow-hidden z-50" style={{ background: 'var(--bg3)', border: '1px solid var(--b)', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
              {benEstates.map(est => (
                <div key={est.id} onClick={() => switchEstate(est)}
                  className="flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-all hover:bg-[var(--s)]"
                  style={{ background: activeEstateId === est.id ? 'rgba(224,173,43,0.08)' : 'transparent', borderBottom: '1px solid var(--b)' }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ background: est.status === 'transitioned' ? 'linear-gradient(135deg, #6D28D9, #A855F7)' : 'linear-gradient(135deg, #1E40AF, #3B82F6)' }}>
                    {est.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold" style={{ color: activeEstateId === est.id ? 'var(--gold2)' : 'var(--t2)' }}>{est.name}</div>
                  </div>
                  {activeEstateId === est.id && <span className="text-xs text-[var(--gold2)]">✓</span>}
                </div>
              ))}
              <div onClick={() => { setSwitcherOpen(false); navigate('/beneficiary'); }}
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-[var(--s)]">
                <Users className="w-4 h-4 text-[#60A5FA]" />
                <span className="text-xs font-bold text-[#60A5FA]">View All Estates</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-4">
        {getNavSections().map((section, idx) => (
          <div key={idx} className="nav-section">
            {section.title && <div className="nav-section-title">{section.title}</div>}
            {section.items.map((item, itemIdx) => (
              <React.Fragment key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <item.icon />
                  <span>{item.label}</span>
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

        {/* User Info */}
        <div className="sb-user-info">
          <div className="sb-avatar">
            {getUserInitials()}
          </div>
          <div className="sb-user-details">
            <div className="sb-user-name">{getUserDisplayName()}</div>
            <div className="sb-user-email">{user?.email || ''}</div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="nav-item w-full mt-3 text-[var(--rd)] hover:bg-[var(--rdbg)]"
          data-testid="logout-button"
        >
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
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
