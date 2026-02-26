import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

const DEV_ACCOUNTS = [
  { label: 'Benefactor (Pete)', email: 'pete@mitchell.com', password: 'password123', role: 'benefactor', color: '#2563eb', redirect: '/dashboard' },
  { label: 'Beneficiary (Penny)', email: 'penny@mitchell.com', password: 'password123', role: 'beneficiary', color: '#8b5cf6', redirect: '/beneficiary' },
  { label: 'Admin / God Mode', email: 'admin@carryon.com', password: 'admin123', role: 'admin', color: '#E0AD2B', redirect: '/admin' },
];

const DevSwitcher = () => {
  const { user, devLogin, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(null);

  const handleSwitch = async (account) => {
    setSwitching(account.email);
    try {
      // Clear everything first
      localStorage.removeItem('carryon_token');
      localStorage.removeItem('selected_estate_id');
      localStorage.removeItem('beneficiary_estate_id');
      
      // Call dev-login to get new token
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.email, password: account.password }),
      });
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.detail || 'Login failed');
      
      // Set new token directly in localStorage
      localStorage.setItem('carryon_token', data.access_token);
      
      // Hard navigate — forces full app reload with new token
      window.location.href = account.redirect;
    } catch (err) {
      console.error(err);
      toast.error('Switch failed: ' + err.message);
      setSwitching(null);
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 99999 }} data-testid="dev-switcher">
      {/* Toggle button */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
          background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: '#000',
          borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 13,
          boxShadow: '0 4px 20px rgba(245,158,11,0.4)', fontFamily: 'Outfit, sans-serif',
          userSelect: 'none',
        }}
      >
        DEV
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </div>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'absolute', bottom: 48, right: 0, width: 280,
          background: '#0F1629', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>
            Portal Switcher
          </div>

          {/* Current user */}
          {user && (
            <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
              Logged in as: <strong style={{ color: '#E2E8F0' }}>{user.name}</strong>
              <br />
              <span style={{ textTransform: 'capitalize', color: '#F0C95C' }}>{user.role}</span>
            </div>
          )}

          {/* Account buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DEV_ACCOUNTS.map(acc => {
              const isActive = user?.email === acc.email;
              return (
                <div
                  key={acc.email}
                  onClick={() => !isActive && handleSwitch(acc)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: isActive ? 'rgba(224,173,43,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isActive ? 'rgba(224,173,43,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 10, cursor: isActive ? 'default' : 'pointer',
                    transition: 'all .15s', opacity: switching ? 0.5 : 1,
                  }}
                  data-testid={`dev-switch-${acc.role}`}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: acc.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0,
                    border: isActive ? '2px solid #F0C95C' : '2px solid transparent',
                  }}>
                    {acc.role[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#F0C95C' : '#E2E8F0' }}>{acc.label}</div>
                    <div style={{ fontSize: 10, color: '#64748B' }}>{acc.email}</div>
                  </div>
                  {isActive && <span style={{ fontSize: 10, color: '#F0C95C' }}>Active</span>}
                  {switching === acc.email && <div className="w-4 h-4 border-2 border-[#F0C95C] border-t-transparent rounded-full animate-spin" />}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 10, fontSize: 10, color: '#525C72', textAlign: 'center' }}>
            No OTP required · Instant switch
          </div>
        </div>
      )}
    </div>
  );
};

export default DevSwitcher;
