import React, { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../PullToRefreshIndicator';
import { haptics } from '../../utils/haptics';

const DashboardLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('carryon_sidebar_collapsed') === 'true');

  useEffect(() => {
    const onStorage = () => setSidebarCollapsed(localStorage.getItem('carryon_sidebar_collapsed') === 'true');
    window.addEventListener('storage', onStorage);
    // Also listen for custom event from same tab
    window.addEventListener('sidebar-toggle', onStorage);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('sidebar-toggle', onStorage); };
  }, []);

  const handleRefresh = useCallback(async () => {
    haptics.medium();
    // Dispatch a custom event so page components can react
    window.dispatchEvent(new CustomEvent('carryon-pull-refresh'));
    // Small delay so users feel the refresh
    await new Promise(r => setTimeout(r, 600));
    haptics.success();
  }, []);

  const { pullProgress, refreshing } = usePullToRefresh(handleRefresh);

  // iOS PWA: scroll focused input into view when virtual keyboard opens
  useEffect(() => {
    if (!window.visualViewport) return;
    const onResize = () => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100);
      }
    };
    window.visualViewport.addEventListener('resize', onResize);
    return () => window.visualViewport.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="app">
      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator pullProgress={pullProgress} refreshing={refreshing} />

      {/* Background decorations */}
      <div 
        className="floating-orb" 
        style={{
          top: '10%',
          left: '60%',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(59,123,247,0.06), transparent 70%)'
        }}
      />
      <div 
        className="floating-orb" 
        style={{
          top: '50%',
          right: '10%',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(224,173,43,0.04), transparent 70%)',
          animationDelay: '-10s'
        }}
      />
      
      {/* Desktop Sidebar */}
      <Sidebar />
      
      {/* Mobile Navigation */}
      <MobileNav />
      
      {/* Main Content */}
      <main id="main-content" className={`main-content ${sidebarCollapsed ? 'sb-collapsed' : ''}`} role="main" aria-label="Main content">
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
