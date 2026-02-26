import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
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
  FileKey
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';

const MobileNav = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

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
    { to: '/vault', icon: FolderLock, label: 'Secure Document Vault' },
    { to: '/messages', icon: MessageSquare, label: 'Milestone Messages' },
    { to: '/checklist', icon: CheckSquare, label: 'Immediate Action Checklist' },
    { to: '/beneficiaries', icon: Users, label: 'Beneficiaries' },
    { to: '/trustee', icon: Shield, label: 'Designated Trustee Services' },
    { to: '/guardian', icon: Sparkles, label: 'Estate Guardian' },
  ];

  const accountItems = [
    { to: user?.role === 'beneficiary' ? '/beneficiary/settings' : '/settings', icon: Settings, label: 'Settings' },
  ];

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
    { to: '/admin', icon: Users, label: 'Users' },
    { to: '/admin/transition', icon: FileKey, label: 'TVT' },
    { to: '/admin', icon: Home, label: 'Home', isCenter: true },
    { to: '/admin/dts', icon: Shield, label: 'DTS' },
    { to: '/admin/dev-switcher', icon: Settings, label: 'Dev' },
  ];

  const getBottomNav = () => {
    if (user?.role === 'admin') return adminBottomNav;
    if (user?.role === 'beneficiary') return beneficiaryBottomNav;
    return benefactorBottomNav;
  };

  return (
    <>
      {/* Top Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 w-full h-14 mobile-header z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <img 
            src="/carryon-app-icon.jpg" 
            alt="CarryOn" 
            className="w-10 h-10 rounded-xl object-cover"
          />
          <span className="text-[#E0AD2B] font-bold text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>
            CarryOn™
          </span>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="p-2 text-[var(--t)]" data-testid="mobile-menu-button">
              <Menu className="w-6 h-6" />
            </button>
          </SheetTrigger>
          <SheetContent 
            side="right" 
            className="w-72 p-0 border-l"
            style={{ 
              background: theme === 'dark' ? '#141C33' : '#DBEAFE',
              borderColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
            }}
          >
            <div className="flex flex-col h-full">
              {/* Spacer for built-in close button */}
              <div className="h-12" />

              {/* MY LEGACY Section */}
              <nav className="flex-1 px-4 overflow-y-auto">
                <div className="mb-6">
                  <h3 
                    className="text-xs font-semibold tracking-wider uppercase mb-3 px-2"
                    style={{ color: theme === 'dark' ? '#525C72' : '#64748B' }}
                  >
                    MY LEGACY
                  </h3>
                  <div>
                    {myLegacyItems.map((item, idx) => (
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
                        {idx < myLegacyItems.length - 1 && (
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

                {/* ACCOUNT Section */}
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
              </nav>

              {/* Theme Toggle Button - Matching prototype style */}
              <div className="px-4 pb-6">
                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
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
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full mobile-bottom-nav z-50 pb-safe">
        <div className="flex items-end h-16 px-1">
          {getBottomNav().map((item, index) => {
            const isCenter = item.isCenter;
            const showDivider = index < getBottomNav().length - 1;
            
            return (
              <React.Fragment key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    isCenter 
                      ? `flex flex-col items-center -mt-6 flex-1`
                      : `mobile-nav-item flex flex-col items-center gap-1 py-2 flex-1 ${isActive ? 'active' : ''}`
                  }
                  style={({ isActive }) => (!isCenter && !isActive ? { color: 'rgba(255,255,255,0.7)' } : {})}
                  data-testid={`mobile-nav-${item.label.toLowerCase()}`}
                >
                  {({ isActive }) => (
                    isCenter ? (
                      <>
                        {/* Elevated Home button */}
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
                          isActive 
                            ? 'bg-gradient-to-br from-[var(--gold)] to-[var(--gold2)] text-[#08090F]' 
                            : 'bg-[var(--bg3)] text-[var(--t3)] border border-[var(--b)]'
                        }`}>
                          <item.icon className="w-6 h-6" />
                        </div>
                        <span className={`text-xs mt-1 font-medium ${isActive ? 'text-[var(--gold)]' : 'text-white/70'}`}>
                          {item.label}
                        </span>
                      </>
                    ) : (
                      <>
                        <item.icon className="w-5 h-5" />
                        <span className="text-xs font-medium">{item.label}</span>
                      </>
                    )
                  )}
                </NavLink>
                {/* Vertical divider between all buttons */}
                {showDivider && (
                  <div 
                    className="h-10 flex-shrink-0" 
                    style={{ alignSelf: 'center', width: '2px', backgroundColor: 'rgba(255,255,255,0.35)' }}
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
