import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';

const DashboardLayout = () => {
  return (
    <div className="min-h-screen bg-[var(--carryon-bg)]">
      {/* Desktop Sidebar */}
      <Sidebar />
      
      {/* Mobile Navigation */}
      <MobileNav />
      
      {/* Main Content */}
      <main className="lg:ml-64 pt-16 lg:pt-0 pb-20 lg:pb-0 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
