import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  FolderLock,
  MessageSquare,
  Users,
  Menu,
  Shield,
  Sparkles,
  CheckSquare,
  Settings,
  LogOut,
  FileKey,
  Home
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '../ui/sheet';

const MobileNav = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setOpen(false);
  };

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
    { to: '/beneficiary/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/beneficiary', icon: Home, label: 'Home', isCenter: true },
    { to: '/beneficiary/milestone', icon: CheckSquare, label: 'Milestone' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  const getBottomNav = () => {
    if (user?.role === 'beneficiary') return beneficiaryBottomNav;
    return benefactorBottomNav;
  };

  const allLinks = user?.role === 'beneficiary' ? [
    { to: '/beneficiary', icon: Home, label: 'Estate Hub' },
    { to: '/beneficiary/vault', icon: FolderLock, label: 'Document Vault' },
    { to: '/beneficiary/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/beneficiary/milestone', icon: CheckSquare, label: 'Report Milestone' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ] : [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/vault', icon: FolderLock, label: 'Document Vault' },
    { to: '/guardian', icon: Sparkles, label: 'Estate Guardian' },
    { to: '/checklist', icon: CheckSquare, label: 'Action Checklist' },
    { to: '/messages', icon: MessageSquare, label: 'Milestone Messages' },
    { to: '/beneficiaries', icon: Users, label: 'Beneficiaries' },
    { to: '/trustee', icon: Shield, label: 'Trustee Services' },
    { to: '/transition', icon: FileKey, label: 'Estate Transition' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

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

  return (
    <>
      {/* Top Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 w-full h-14 bg-[var(--bg)]/95 backdrop-blur-lg border-b border-white/5 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--gold)] flex items-center justify-center">
            <Shield className="w-4 h-4 text-[var(--bg)]" />
          </div>
          <span className="text-white font-bold text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>
            CarryOn™
          </span>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="p-2 text-white" data-testid="mobile-menu-button">
              <Menu className="w-6 h-6" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 bg-[var(--bg)] border-l border-white/10 p-0">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-4 border-b border-white/10 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--gold)] to-[var(--gold2)] flex items-center justify-center text-[var(--bg)] font-bold text-lg">
                  {getUserInitials()}
                </div>
                <div>
                  <p className="text-white font-semibold">{getUserDisplayName()}</p>
                  <p className="text-xs text-[var(--t5)] capitalize">{user?.role || 'User'}</p>
                </div>
              </div>

              {/* Links */}
              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {allLinks.map((link) => (
                  <SheetClose asChild key={link.to}>
                    <NavLink
                      to={link.to}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                          isActive 
                            ? 'bg-[var(--gold)]/15 text-[var(--gold)]' 
                            : 'text-[var(--t3)] hover:bg-white/5'
                        }`
                      }
                    >
                      <link.icon className="w-5 h-5" />
                      <span className="font-medium">{link.label}</span>
                    </NavLink>
                  </SheetClose>
                ))}
              </nav>

              {/* Logout */}
              <div className="p-4 border-t border-white/10">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-[var(--rd)] hover:bg-[var(--rd)]/10 transition-all"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Bottom Navigation - 5 items with elevated center Home */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full bg-[var(--bg2)]/95 backdrop-blur-lg border-t border-white/5 z-50 pb-safe">
        <div className="flex justify-around items-end h-16 px-2">
          {getBottomNav().map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                item.isCenter 
                  ? `flex flex-col items-center -mt-6` // Elevated center item
                  : `flex flex-col items-center gap-1 py-2 ${
                      isActive ? 'text-[var(--gold)]' : 'text-[var(--t5)]'
                    }`
              }
              data-testid={`mobile-nav-${item.label.toLowerCase()}`}
            >
              {({ isActive }) => (
                item.isCenter ? (
                  <>
                    {/* Elevated Home button */}
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
                      isActive 
                        ? 'bg-gradient-to-br from-[var(--gold)] to-[var(--gold2)] text-[var(--bg)]' 
                        : 'bg-[var(--bg3)] text-[var(--t3)] border border-white/10'
                    }`}>
                      <item.icon className="w-6 h-6" />
                    </div>
                    <span className={`text-xs mt-1 font-medium ${isActive ? 'text-[var(--gold)]' : 'text-[var(--t5)]'}`}>
                      {item.label}
                    </span>
                  </>
                ) : (
                  <>
                    <item.icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </>
                )
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
};

export default MobileNav;
