import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { User, Lock, LogOut, Shield, Moon, Sun, Check, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Separator } from '../../components/ui/separator';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BeneficiarySettingsPage = () => {
  const { user, logout, getAuthHeaders } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [estate, setEstate] = useState(null);
  const [billingTab, setBillingTab] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const benefactorFirst = estate?.name?.split(' ')[0] || 'Your benefactor';
  const billingOptions = ['Monthly $2.99/mo', 'Quarterly $8.07/qtr', 'Annual $28.70/yr'];
  const features = ['Full vault access', 'Estate Guardian AI', 'Immediate Action Checklist', 'Milestone message delivery', 'Life Milestone declarations', 'Priority support'];

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
              ['Primary Benefactor', estate?.name || 'Loading...'],
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

      {/* Subscription */}
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-[var(--t)] flex items-center gap-2"><CreditCard className="w-5 h-5 text-[var(--gold)]" /> Your Subscription</CardTitle></CardHeader>
        <CardContent>
          {/* Info box */}
          <div className="rounded-xl p-4 mb-5" style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.1)' }}>
            <p className="text-xs text-[var(--bl3)] leading-relaxed">
              Your beneficiary tier was set by {benefactorFirst} based on the tier held for more than 50% of total subscription duration. All tiers include full platform access. Beneficiary pricing does not begin until a verified transition event occurs. Minor beneficiaries (under 18) are free — charges begin automatically on their 18th birthday.
            </p>
          </div>

          {/* Plan card */}
          <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <div className="text-sm font-bold text-[var(--gold2)] uppercase tracking-wider mb-3">Premium Beneficiary</div>

            {/* Billing toggle */}
            <div className="flex gap-1 mb-4 rounded-lg p-1" style={{ background: 'var(--s)' }}>
              {billingOptions.map((l, i) => (
                <button
                  key={i}
                  onClick={() => setBillingTab(i)}
                  className="flex-1 py-2 px-1 rounded-md text-xs font-bold transition-all"
                  style={{
                    background: billingTab === i ? 'rgba(224,173,43,0.15)' : 'transparent',
                    color: billingTab === i ? 'var(--gold2)' : 'var(--t4)',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>

            <p className="text-sm text-[var(--t3)] mb-4">
              {benefactorFirst} maintained the Premium tier, locking in the lowest beneficiary cost for you.
            </p>

            <div className="space-y-1.5 text-left">
              {features.map(f => (
                <div key={f} className="flex items-center gap-2 text-sm text-[var(--t3)]">
                  <Check className="w-4 h-4 text-[var(--gn2)] flex-shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

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
