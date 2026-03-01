import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ChevronUp, ChevronDown, Settings } from 'lucide-react';
import { toast } from '../../utils/toast';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const DevSwitcher = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/api/dev-switcher/config`);
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      console.error('Failed to fetch dev switcher config:', err);
    } finally {
      setLoading(false);
    }
  };

  // Build accounts array from config
  const accounts = [];
  
  if (config?.benefactor?.email) {
    accounts.push({
      label: 'Benefactor',
      email: config.benefactor.email,
      password: config.benefactor.password,
      role: 'benefactor',
      color: '#2563eb',
      redirect: '/dashboard'
    });
  }
  
  if (config?.beneficiary?.email) {
    accounts.push({
      label: 'Beneficiary',
      email: config.beneficiary.email,
      password: config.beneficiary.password,
      role: 'beneficiary',
      color: '#8b5cf6',
      redirect: '/beneficiary'
    });
  }
  
  // Always include admin option - admin can configure it
  accounts.push({
    label: 'Admin Portal',
    role: 'admin',
    color: '#E0AD2B',
    redirect: '/admin'
  });

  const handleSwitch = async (account) => {
    setSwitching(account.role);
    try {
      // Persist admin token across all switches so any-to-any works
      const currentToken = localStorage.getItem('carryon_token');
      const savedAdminToken = localStorage.getItem('dev_switcher_admin_token');
      
      // If current user is admin, save their token for future switches
      if (user?.role === 'admin' && currentToken) {
        localStorage.setItem('dev_switcher_admin_token', currentToken);
      }
      
      // Use the persisted admin token (or current if we just saved it)
      const adminToken = localStorage.getItem('dev_switcher_admin_token') || currentToken;
      
      localStorage.removeItem('carryon_token');
      localStorage.removeItem('selected_estate_id');
      localStorage.removeItem('beneficiary_estate_id');
      
      // Mark that this session was initiated by an admin via DEV switcher
      localStorage.setItem('dev_switcher_admin_session', 'true');

      if (account.role === 'admin') {
        // Restore the saved admin token — no credentials needed
        if (adminToken) {
          localStorage.setItem('carryon_token', adminToken);
          window.location.href = account.redirect;
          return;
        }
        throw new Error('No admin session found. Please log in as admin first.');
      }

      // Benefactor/Beneficiary use dev-switch (server looks up stored password)
      const headers = { 'Content-Type': 'application/json' };
      if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;

      const response = await fetch(`${API_URL}/api/auth/dev-switch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: account.email }),
      });
      
      let data;
      try {
        const text = await response.clone().text();
        data = JSON.parse(text);
      } catch {
        data = { detail: `Server returned ${response.status}: ${response.statusText}` };
      }
      
      if (!response.ok) throw new Error(data.detail || 'Login failed');
      
      localStorage.setItem('carryon_token', data.access_token);
      window.location.href = account.redirect;
    } catch (err) {
      console.error(err);
      toast.error('Switch failed: ' + err.message);
      setSwitching(null);
    }
  };

  // Only show for admin users OR when navigated here via admin's DEV switcher
  if (loading) return null;
  const isAdminSession = localStorage.getItem('dev_switcher_admin_session') === 'true';
  if (!user) return null;
  if (user.role !== 'admin' && !isAdminSession) return null;

  const hasConfiguredAccounts = config?.benefactor?.email || config?.beneficiary?.email;

  return (
    <div style={{ position: 'fixed', bottom: 70, right: 16, zIndex: 99999 }} data-testid="dev-switcher">
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

          {/* No accounts configured message */}
          {!hasConfiguredAccounts && (
            <div style={{ 
              padding: '12px', 
              background: 'rgba(245,158,11,0.1)', 
              borderRadius: 8, 
              marginBottom: 10,
              border: '1px dashed rgba(245,158,11,0.3)'
            }}>
              <div style={{ fontSize: 11, color: '#F59E0B', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Settings className="w-3 h-3" />
                Not Configured
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8' }}>
                Go to Admin → Dev Switcher to assign benefactor/beneficiary accounts for quick switching.
              </div>
            </div>
          )}

          {/* Account buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {accounts.map(acc => {
              const isActive = acc.role === 'admin' ? user?.role === 'admin' : user?.email === acc.email;
              
              return (
                <div
                  key={acc.role}
                  onClick={() => !isActive && !switching && handleSwitch(acc)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: isActive ? 'rgba(224,173,43,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isActive ? 'rgba(224,173,43,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 10, 
                    cursor: isActive || switching ? 'default' : 'pointer',
                    transition: 'all .15s', 
                    opacity: switching ? 0.5 : 1,
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
                    <div style={{ fontSize: 10, color: '#64748B' }}>{acc.email || (acc.role === 'admin' ? 'Restore admin session' : 'Not configured')}</div>
                  </div>
                  {isActive && <span style={{ fontSize: 10, color: '#F0C95C' }}>Active</span>}
                  {switching === acc.role && <div className="w-4 h-4 border-2 border-[#F0C95C] border-t-transparent rounded-full animate-spin" />}
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
