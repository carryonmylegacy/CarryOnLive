import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Users,
  Menu,
  X,
  Shield,
  Bot,
  CheckSquare,
  Award,
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

  const benefactorBottomNav = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
    { to: '/vault', icon: FileText, label: 'Vault' },
    { to: '/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/beneficiaries', icon: Users, label: 'Family' },
  ];

  const beneficiaryBottomNav = [
    { to: '/beneficiary', icon: Home, label: 'Estates' },
    { to: '/beneficiary/vault', icon: FileText, label: 'Vault' },
    { to: '/beneficiary/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/beneficiary/milestone', icon: CheckSquare, label: 'Report' },
  ];

  const getBottomNav = () => {
    if (user?.role === 'beneficiary') return beneficiaryBottomNav;
    return benefactorBottomNav;
  };

  const allLinks = user?.role === 'beneficiary' ? [
    { to: '/beneficiary', icon: Home, label: 'Estate Hub' },
    { to: '/beneficiary/vault', icon: FileText, label: 'Document Vault' },
    { to: '/beneficiary/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/beneficiary/milestone', icon: CheckSquare, label: 'Report Milestone' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ] : [
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

  return (
    <>
      {/* Top Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 w-full h-16 bg-[var(--carryon-bg)]/90 backdrop-blur-lg border-b border-white/5 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#d4af37] to-[#fcd34d] flex items-center justify-center">
            <Shield className="w-4 h-4 text-[#0b1120]" />
          </div>
          <span className="text-white font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
            CarryOn™
          </span>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="p-2 text-white" data-testid="mobile-menu-button">
              <Menu className="w-6 h-6" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 bg-[var(--carryon-bg)] border-l border-white/5 p-0">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#d4af37]/20 flex items-center justify-center text-[#d4af37] font-semibold">
                    {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="text-white font-medium">{user?.name || 'User'}</p>
                    <p className="text-xs text-[#64748b]">{user?.role}</p>
                  </div>
                </div>
              </div>

              {/* Links */}
              <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {allLinks.map((link) => (
                  <SheetClose asChild key={link.to}>
                    <NavLink
                      to={link.to}
                      className={({ isActive }) =>
                        `sidebar-link ${isActive ? 'active' : ''}`
                      }
                    >
                      <link.icon className="w-5 h-5" />
                      <span>{link.label}</span>
                    </NavLink>
                  </SheetClose>
                ))}
              </nav>

              {/* Logout */}
              <div className="p-4 border-t border-white/5">
                <button
                  onClick={handleLogout}
                  className="sidebar-link w-full text-[#ef4444] hover:bg-[#ef4444]/10"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full h-16 bg-[var(--carryon-bg)]/90 backdrop-blur-lg border-t border-white/5 z-50 flex justify-around items-center mobile-nav">
        {getBottomNav().map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-4 py-2 ${
                isActive ? 'text-[#d4af37]' : 'text-[#64748b]'
              }`
            }
            data-testid={`mobile-nav-${item.label.toLowerCase()}`}
          >
            <item.icon className="w-5 h-5" />
            <span className="text-xs">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
};

export default MobileNav;
