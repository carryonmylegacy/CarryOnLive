import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { User, Lock, LogOut, Shield, Moon, Sun, Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Separator } from '../../components/ui/separator';
import { SubscriptionManagement } from '../../components/settings/SubscriptionManagement';
import NotificationSettings from '../../components/NotificationSettings';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BeneficiarySettingsPage = () => {
  const { user, logout, getAuthHeaders, subscriptionStatus, refreshSubscription } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [estate, setEstate] = useState(null);

  useEffect(() => {
    const fetchEstate = async () => {
      const eid = localStorage.getItem('beneficiary_estate_id');
      if (eid) {
        try {
          const res = await axios.get(`${API_URL}/estates/${eid}`, getAuthHeaders());
          setEstate(res.data);
        } catch (e) { console.error(e); }
      }
    };
    fetchEstate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in max-w-2xl mx-auto" data-testid="beneficiary-settings">
      <div>
        <h1 className="text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Settings</h1>
        <p className="text-sm text-[var(--t4)]">Account and subscription</p>
      </div>

      {/* Account */}
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-[var(--t)] flex items-center gap-2"><User className="w-5 h-5 text-[var(--gold)]" /> Account</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-0">
            {[
              ['Email', user?.email || ''],
              ['Name', user?.name || ''],
              ['Role', 'Beneficiary'],
              ['Primary Benefactor', estate?.name || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2.5 text-sm" style={{ borderBottom: '1px solid var(--b)' }}>
                <span className="text-[var(--t3)]">{k}</span>
                <span className="text-[var(--t)] font-bold">{v}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-[var(--t)] flex items-center gap-2"><Lock className="w-5 h-5 text-[var(--gold)]" /> Security</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-[var(--t)]">Two-Factor Authentication</div>
              <div className="text-xs text-[var(--t4)]">Email-based 2FA enabled</div>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator className="bg-[var(--b)]" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-[var(--t)]">Password</div>
              <div className="text-xs text-[var(--t4)]">Last changed 30 days ago</div>
            </div>
            <Button variant="outline" size="sm" className="border-[var(--b)] text-[var(--t3)] text-xs">Change</Button>
          </div>
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <NotificationSettings getAuthHeaders={() => getAuthHeaders()} />

      {/* Subscription — uses the shared SubscriptionManagement component */}
      <SubscriptionManagement
        subscriptionStatus={subscriptionStatus}
        refreshSubscription={refreshSubscription}
        getAuthHeaders={() => getAuthHeaders()}
        onShowPaywall={() => {}}
      />

      {/* Appearance */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            {theme === 'dark' ? <Moon className="w-5 h-5 text-[var(--gold)]" /> : <Sun className="w-5 h-5 text-[var(--gold)]" />}
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-[var(--t)]">Dark Mode</div>
              <div className="text-xs text-[var(--t5)]">Use dark theme</div>
            </div>
            <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
          </div>
        </CardContent>
      </Card>

      {/* Sign Out */}
      <Button variant="outline" className="w-full border-[#ef4444]/30 text-[#ef4444] hover:bg-[#ef4444]/10" onClick={handleLogout} data-testid="ben-settings-logout">
        <LogOut className="w-4 h-4 mr-2" /> Sign Out
      </Button>

      <div className="text-center py-3">
        <div className="flex items-center justify-center gap-2 text-[var(--t5)] text-xs mb-1">
          <Shield className="w-3 h-3" />
          <span>AES-256 Encrypted · Zero-Knowledge · 2FA Protected</span>
        </div>
        <p className="text-[var(--t5)] text-[10px]">CarryOn™ v1.0.0 · © 2024 CarryOn Inc.</p>
      </div>
    </div>
  );
};

export default BeneficiarySettingsPage;
