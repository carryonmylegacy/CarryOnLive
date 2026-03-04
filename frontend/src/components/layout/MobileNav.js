import React, { useState, useRef } from 'react';
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
  FileKey,
  Headphones,
  ShieldCheck,
  KeyRound,
  Clock
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
    { to: '/vault', icon: FolderLock, label: 'Secure Document Vault (SDV)' },
    { to: '/messages', icon: MessageSquare, label: 'Milestone Messages (MM)' },
    { to: '/checklist', icon: CheckSquare, label: 'Immediate Action Checklist (IAC)' },
    { to: '/beneficiaries', icon: Users, label: 'Beneficiaries' },
    { to: '/trustee', icon: Shield, label: 'Designated Trustee Services (DTS)' },
    { to: '/guardian', icon: Sparkles, label: 'Estate Guardian (EGA)' },
    { to: '/digital-wallet', icon: KeyRound, label: 'Digital Access Vault (DAV)' },
    { to: '/timeline', icon: Clock, label: 'Legacy Timeline' },
  ];

  // Admin menu items — admin should NOT see user content
  const adminMenuItems = [
    { to: '/admin', icon: Home, label: 'Admin Dashboard' },
    { to: '/admin/transition', icon: FileKey, label: 'Transition Verification (TVT)' },
    { to: '/admin/dts', icon: Shield, label: 'Designated Trustee Services' },
    { to: '/admin/support', icon: Headphones, label: 'Customer Support' },
    { to: '/admin/subscriptions', icon: Users, label: 'Subscriptions' },
    { to: '/admin/verifications', icon: ShieldCheck, label: 'Tier Verifications' },
    { to: '/admin/analytics', icon: Settings, label: 'Analytics' },
    { to: '/admin/activity', icon: Clock, label: 'Activity Log' },
  ];

  const accountItems = user?.role === 'admin' ? [
    { to: '/settings', icon: Settings, label: 'Settings' },
    { to: '/admin/dev-switcher', icon: Settings, label: 'Dev Switcher' },
  ] : [
    { to: user?.role === 'beneficiary' ? '/beneficiary/settings' : '/settings', icon: Settings, label: 'Settings' },
    { to: '/security-settings', icon: ShieldCheck, label: 'Security Settings' },
    { to: '/support', icon: Headphones, label: 'Customer Support' },
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
    { id: 'admin-users', to: '/admin', icon: Users, label: 'Users' },
    { id: 'admin-tvt', to: '/admin/transition', icon: FileKey, label: 'TVT' },
    { id: 'admin-home', to: '/admin', icon: Home, label: 'Home', isCenter: true },
    { id: 'admin-dts', to: '/admin/dts', icon: Shield, label: 'DTS' },
    { id: 'admin-dev', to: '/admin/dev-switcher', icon: Settings, label: 'Dev' },
  ];

  const getBottomNav = () => {
    if (user?.role === 'admin') return adminBottomNav;
    if (user?.role === 'beneficiary') return beneficiaryBottomNav;
    return benefactorBottomNav;
  };

  const [showDebug, setShowDebug] = useState(false);
  const debugTapCount = useRef(0);
  const debugTapTimer = useRef(null);

  const handleDebugTap = () => {
    debugTapCount.current++;
    clearTimeout(debugTapTimer.current);
    if (debugTapCount.current >= 5) {
      setShowDebug(prev => !prev);
      debugTapCount.current = 0;
    } else {
      debugTapTimer.current = setTimeout(() => { debugTapCount.current = 0; }, 1000);
    }
  };

  return (
    <>
      {/* Debug overlay */}
      {showDebug && (
        <div className="fixed top-0 left-0 right-0 z-[9999] p-2 text-[10px] font-mono text-green-400" style={{ background: 'rgba(0,0,0,0.9)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div id="debug-info" ref={(el) => {
            if (!el) return;
            const mc = document.querySelector('.main-content');
            const mh = document.querySelector('.mobile-header');
            const cs = (e, p) => e ? window.getComputedStyle(e)[p] : 'N/A';
            el.textContent = [
              `safe-area-top: ${getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-top)') || 'unknown'}`,
              `body.native-app: ${document.body.classList.contains('native-app')}`,
              `header.paddingTop: ${cs(mh, 'paddingTop')}`,
              `header.height: ${mh?.offsetHeight}px`,
              `main.paddingTop: ${cs(mc, 'paddingTop')}`,
              `main.offsetTop: ${mc?.offsetTop}px`,
              `viewport: ${window.innerWidth}x${window.innerHeight}`,
              `devicePixelRatio: ${window.devicePixelRatio}`,
            ].join(' | ');
          }} />
        </div>
      )}

      {/* Top Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 w-full mobile-header z-50">
        <div className="h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-3" onClick={handleDebugTap}>
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
              <button className="p-2 text-[var(--t)]" data-testid="mobile-menu-button" aria-label="Open navigation menu">
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
                    
                  </h3>
                  <div>
                    {(user?.role === 'admin' ? adminMenuItems : myLegacyItems).map((item, idx) => {
                      const items = user?.role === 'admin' ? adminMenuItems : myLegacyItems;
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

      {/* Bottom Navigation — compact like PayPal */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full mobile-bottom-nav z-50 pb-safe">
        <div className="flex items-end h-14 px-2">
          {getBottomNav().map((item) => {
            const isCenter = item.isCenter;
            
            return (
              <NavLink
                key={item.id || item.to}
                to={item.to}
                className={({ isActive }) =>
                  isCenter 
                    ? `flex flex-col items-center -mt-5 flex-1`
                    : `flex flex-col items-center gap-0.5 py-1.5 flex-1 ${isActive ? 'text-[var(--gold)]' : ''}`
                }
                style={({ isActive }) => (!isCenter && !isActive ? { color: 'rgba(255,255,255,0.5)' } : {})}
                data-testid={`mobile-nav-${item.label.toLowerCase()}`}
              >
                {({ isActive }) => (
                  isCenter ? (
                    <>
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
                        isActive 
                          ? 'bg-gradient-to-br from-[var(--gold)] to-[var(--gold2)] text-[#08090F]' 
                          : 'bg-[var(--bg3)] text-[var(--t3)] border border-[var(--b)]'
                      }`}>
                        <item.icon className="w-5 h-5" />
                      </div>
                      <span className={`text-[10px] mt-0.5 font-bold ${isActive ? 'text-[var(--gold)]' : 'text-white/50'}`}>
                        {item.label}
                      </span>
                    </>
                  ) : (
                    <>
                      <item.icon className="w-4 h-4" />
                      <span className="text-[10px] font-bold">{item.label}</span>
                    </>
                  )
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default MobileNav;
