import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Users,
  Bot,
  CheckSquare,
  Award,
  Settings,
  LogOut,
  Shield,
  Moon,
  Sun,
  FileKey,
  Home,
  Bell
} from 'lucide-react';
import { Switch } from '../ui/switch';
import NotificationCenter from '../estate/NotificationCenter';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [currentEstateId, setCurrentEstateId] = React.useState(() => localStorage.getItem('selected_estate_id'));

  React.useEffect(() => {
    const handleStorage = () => setCurrentEstateId(localStorage.getItem('selected_estate_id'));
    window.addEventListener('storage', handleStorage);
    const interval = setInterval(() => setCurrentEstateId(localStorage.getItem('selected_estate_id')), 1000);
    return () => { window.removeEventListener('storage', handleStorage); clearInterval(interval); };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const benefactorLinks = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/vault', icon: FileText, label: 'Document Vault' },
    { to: '/messages', icon: MessageSquare, label: 'Milestone Messages' },
    { to: '/beneficiaries', icon: Users, label: 'Beneficiaries' },
    { to: '/guardian', icon: Bot, label: 'Estate Guardian' },
    { to: '/checklist', icon: CheckSquare, label: 'Action Checklist' },
    { to: '/trustee', icon: Award, label: 'Trustee Services' },
    { to: '/transition', icon: FileKey, label: 'Estate Transition' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  const beneficiaryLinks = [
    { to: '/beneficiary', icon: Home, label: 'Estate Hub' },
    { to: '/beneficiary/vault', icon: FileText, label: 'Document Vault' },
    { to: '/beneficiary/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/beneficiary/milestone', icon: CheckSquare, label: 'Report Milestone' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  const adminLinks = [
    { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/certificates', icon: FileKey, label: 'Review Certificates' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  const getLinks = () => {
    if (user?.role === 'admin') return adminLinks;
    if (user?.role === 'beneficiary') return beneficiaryLinks;
    return benefactorLinks;
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-[var(--carryon-bg)] border-r border-white/5 flex flex-col z-40 hidden lg:flex">
      {/* Logo */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#d4af37] to-[#fcd34d] flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#0b1120]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              CarryOn™
            </h1>
            <p className="text-xs text-[#64748b] uppercase tracking-wider">
              {user?.role === 'beneficiary' ? 'Beneficiary' : user?.role === 'admin' ? 'Admin' : 'Benefactor'}
            </p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#d4af37]/20 flex items-center justify-center text-[#d4af37] font-semibold">
            {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-[#64748b] truncate">{user?.email || ''}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {getLinks().map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
            data-testid={`nav-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <link.icon className="w-5 h-5" />
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Theme Toggle & Logout */}
      <div className="p-4 border-t border-white/5 space-y-3">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2 text-[#94a3b8]">
            {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            <span className="text-sm">Dark Mode</span>
          </div>
          <Switch
            checked={theme === 'dark'}
            onCheckedChange={toggleTheme}
            data-testid="theme-toggle"
          />
        </div>
        
        <button
          onClick={handleLogout}
          className="sidebar-link w-full text-[#ef4444] hover:bg-[#ef4444]/10"
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
