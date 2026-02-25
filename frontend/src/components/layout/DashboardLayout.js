import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';

const DashboardLayout = () => {
  return (
    <div className="app">
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
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
