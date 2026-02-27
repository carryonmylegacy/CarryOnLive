import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import axios from 'axios';
import {
  Moon,
  Sun,
  User,
  Bell,
  Lock,
  LogOut,
  ChevronRight,
  Shield,
  CreditCard,
  Check,
  Mail,
  Loader2,
  Clock,
  Crown,
  Star,
  Award,
  Heart
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';
import NotificationSettings from '../components/NotificationSettings';
import FamilyPlanSettings from '../components/FamilyPlanSettings';
import SubscriptionPaywall from '../components/SubscriptionPaywall';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SettingsPage = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [activePlan, setActivePlan] = useState('Premium');
  const [billing, setBilling] = useState('monthly');
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestSending, setDigestSending] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('carryon_token');
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const fetchDigestPref = async () => {
      try {
        const res = await axios.get(`${API_URL}/digest/preferences`, getAuthHeaders());
        setWeeklyDigest(res.data.weekly_digest);
      } catch (e) { /* default to true */ }
    };
    fetchDigestPref();
  }, []);

  const toggleDigest = async (val) => {
    setDigestLoading(true);
    try {
      await axios.put(`${API_URL}/digest/preferences`, { weekly_digest: val }, getAuthHeaders());
      setWeeklyDigest(val);
    } catch (e) { /* ignore */ }
    finally { setDigestLoading(false); }
  };

  const sendPreview = async () => {
    setDigestSending(true);
    try {
      await axios.post(`${API_URL}/digest/preview`, {}, getAuthHeaders());
      const { toast } = await import('sonner');
      toast.success('Preview digest sent to your email!');
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error('Could not send preview — do you have an estate?');
    }
    finally { setDigestSending(false); }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getBillingPrice = (price) => {
    if (price === 'Free') return 'Free';
    const num = parseFloat(price.replace('$', ''));
    if (billing === 'annual') return '$' + (num * 10).toFixed(2);
    if (billing === 'quarterly') return '$' + (num * 2.7).toFixed(2);
    return price;
  };

  const getBillingLabel = () => {
    if (billing === 'annual') return '/year';
    if (billing === 'quarterly') return '/quarter';
    return '/month';
  };

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in max-w-4xl mx-auto" data-testid="settings-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Settings
        </h1>
        <p className="text-[var(--t4)] mt-1 text-sm sm:text-base">
          Manage your account, subscription, and preferences
        </p>
      </div>

      {/* Profile Section */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <User className="w-5 h-5 text-[var(--gold)]" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[var(--gold)]/20 flex items-center justify-center text-[var(--gold)] text-xl font-bold">
              {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
            </div>
            <div>
              <h3 className="text-[var(--t)] font-semibold text-lg">{user?.name || 'User'}</h3>
              <p className="text-[var(--t4)] text-sm">{user?.email || ''}</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-[var(--gold)]/20 text-[var(--gold)] text-xs rounded-full capitalize">
                {user?.role || 'benefactor'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <NotificationSettings getAuthHeaders={() => getAuthHeaders()} />

      {/* Subscription Plans */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[var(--gold)]" />
            Subscription Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Billing Toggle */}
          <div className="flex justify-center gap-2 mb-6">
            {['monthly', 'quarterly', 'annual'].map((b) => (
              <button
                key={b}
                onClick={() => setBilling(b)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all capitalize ${
                  billing === b
                    ? 'bg-[var(--gold)] text-[#0F1629]'
                    : 'bg-[var(--s)] text-[var(--t4)] hover:text-[var(--t)]'
                }`}
                data-testid={`billing-${b}`}
              >
                {b}
              </button>
            ))}
          </div>

          {/* Plan Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="plan-grid">
            {plans.map((p) => (
              <div
                key={p.name}
                onClick={() => setActivePlan(p.name)}
                className={`rounded-2xl p-5 text-center cursor-pointer transition-all hover:-translate-y-1 ${
                  activePlan === p.name
                    ? 'border-2 border-[var(--gold)] bg-[var(--gold)]/5 shadow-lg'
                    : 'border border-[var(--b)] bg-[var(--s)] hover:border-[var(--gold)]/30'
                }`}
                data-testid={`plan-${p.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className="text-[var(--t)] font-bold text-lg mb-2">{p.name}</div>
                <div className="text-[var(--gold)] text-3xl font-bold" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
                  {getBillingPrice(p.price)}
                </div>
                <div className="text-[var(--t4)] text-sm mb-1">{p.price !== 'Free' ? getBillingLabel() : ''}</div>
                <div className="text-[var(--t4)] text-xs mb-4">Beneficiary: {p.benPrice}/mo</div>
                
                <div className="space-y-2 text-left mb-4">
                  {p.features.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-[var(--t3)]">
                      <Check className="w-4 h-4 text-[var(--gold)] flex-shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>

                {p.note && (
                  <div className="text-xs text-[var(--t4)] italic mb-2">{p.note}</div>
                )}
                {p.extra && (
                  <div className="text-xs text-[var(--gold)] mt-2">{p.extra}</div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Family Plan (only visible when admin enables it) */}
      <FamilyPlanSettings getAuthHeaders={() => {
        const token = localStorage.getItem('carryon_token');
        return { headers: { Authorization: `Bearer ${token}` } };
      }} />

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
              <h4 className="text-[var(--t)] font-medium">Dark Mode</h4>
              <p className="text-[var(--t5)] text-sm">Use dark theme for the interface</p>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={toggleTheme}
              data-testid="settings-theme-toggle"
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <Bell className="w-5 h-5 text-[var(--gold)]" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[var(--t)] font-medium flex items-center gap-2">
                <Mail className="w-4 h-4 text-[var(--t4)]" />
                Weekly Estate Digest
              </h4>
              <p className="text-[var(--t5)] text-sm">Monday morning readiness report with your top 3 action items</p>
            </div>
            <div className="flex items-center gap-2">
              {digestLoading && <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)]" />}
              <Switch
                checked={weeklyDigest}
                onCheckedChange={toggleDigest}
                disabled={digestLoading}
                data-testid="settings-weekly-digest-toggle"
              />
            </div>
          </div>
          {weeklyDigest && user?.role === 'benefactor' && (
            <button
              onClick={sendPreview}
              disabled={digestSending}
              className="text-xs text-[var(--gold)] hover:underline flex items-center gap-1"
              data-testid="settings-digest-preview"
            >
              {digestSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              Send me a preview now
            </button>
          )}
          <Separator className="bg-[var(--b)]" />
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[var(--t)] font-medium">Email Notifications</h4>
              <p className="text-[var(--t5)] text-sm">Receive updates via email</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator className="bg-[var(--b)]" />
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[var(--t)] font-medium">Security Alerts</h4>
              <p className="text-[var(--t5)] text-sm">Get notified of security events</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <Lock className="w-5 h-5 text-[var(--gold)]" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full border-[var(--b)] text-[var(--t)] justify-between">
            Change Password
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" className="w-full border-[var(--b)] text-[var(--t)] justify-between">
            Two-Factor Authentication
            <span className="text-[#10b981] text-sm">Enabled</span>
          </Button>
        </CardContent>
      </Card>

      {/* Sign Out */}
      <Card className="glass-card border-[#ef4444]/20">
        <CardContent className="p-4">
          <Button
            variant="outline"
            className="w-full border-[#ef4444]/50 text-[#ef4444] hover:bg-[#ef4444]/10"
            onClick={handleLogout}
            data-testid="settings-logout-button"
          >
            <LogOut className="w-5 h-5 mr-2" />
            Sign Out
          </Button>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center py-4">
        <div className="flex items-center justify-center gap-2 text-[var(--t5)] text-sm mb-2">
          <Shield className="w-4 h-4" />
          <span>AES-256 Encrypted · Zero-Knowledge · SOC 2</span>
        </div>
        <p className="text-[var(--t5)] text-xs">
          CarryOn™ v1.0.0 · © 2024 CarryOn Inc.
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
