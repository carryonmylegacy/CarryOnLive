import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
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
  Home
} from 'lucide-react';
import { Switch } from '../ui/switch';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Navigation structure matching prototype
  const benefactorNavSections = [
    {
      title: 'MY LEGACY',
      items: [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/vault', icon: FolderLock, label: 'Secure Document Vault' },
        { to: '/guardian', icon: Sparkles, label: 'Estate Guardian' },
        { to: '/checklist', icon: CheckSquare, label: 'Immediate Action Checklist' },
        { to: '/messages', icon: MessageSquare, label: 'Milestone Messages' },
        { to: '/beneficiaries', icon: Users, label: 'Beneficiaries' },
        { to: '/trustee', icon: Shield, label: 'Designated Trustee Services' },
      ]
    },
    {
      title: 'ACCOUNT',
      items: [
        { to: '/settings', icon: Settings, label: 'Settings' },
      ]
    }
  ];

  const beneficiaryNavSections = [
    {
      title: 'LEGACY ACCESS',
      items: [
        { to: '/beneficiary/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/beneficiary/vault', icon: FolderLock, label: 'Secure Document Vault' },
        { to: '/beneficiary/guardian', icon: Sparkles, label: 'Estate Guardian' },
        { to: '/beneficiary/checklist', icon: CheckSquare, label: 'Immediate Action Checklist' },
        { to: '/beneficiary/messages', icon: MessageSquare, label: 'Milestone Messages' },
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
        { to: '/settings', icon: Settings, label: 'Settings' },
      ]
    }
  ];

  const adminNavSections = [
    {
      title: 'ADMINISTRATION',
      items: [
        { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/admin/certificates', icon: FileKey, label: 'Review Certificates' },
      ]
    },
    {
      title: 'ACCOUNT',
      items: [
        { to: '/settings', icon: Settings, label: 'Settings' },
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
    <aside className="sb hidden lg:flex" data-testid="sidebar">
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

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-4">
        {getNavSections().map((section, idx) => (
          <div key={idx} className="nav-section">
            <div className="nav-section-title">{section.title}</div>
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
