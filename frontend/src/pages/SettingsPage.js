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
  Heart,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';
import { toast } from 'sonner';
import NotificationSettings from '../components/NotificationSettings';
import FamilyPlanSettings from '../components/FamilyPlanSettings';
import SubscriptionPaywall from '../components/SubscriptionPaywall';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIER_COLORS = {
  premium: { accent: '#d4af37', glow: 'rgba(212,175,55,0.4)', bg: 'linear-gradient(135deg, rgba(212,175,55,0.18) 0%, rgba(20,28,51,0.95) 100%)' },
  standard: { accent: '#60A5FA', glow: 'rgba(96,165,250,0.35)', bg: 'linear-gradient(135deg, rgba(96,165,250,0.12) 0%, rgba(20,28,51,0.95) 100%)' },
  base: { accent: '#22C993', glow: 'rgba(34,201,147,0.35)', bg: 'linear-gradient(135deg, rgba(34,201,147,0.12) 0%, rgba(20,28,51,0.95) 100%)' },
  new_adult: { accent: '#B794F6', glow: 'rgba(183,148,246,0.35)', bg: 'linear-gradient(135deg, rgba(183,148,246,0.12) 0%, rgba(20,28,51,0.95) 100%)' },
  military: { accent: '#F59E0B', glow: 'rgba(245,158,11,0.35)', bg: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(20,28,51,0.95) 100%)' },
  hospice: { accent: '#ec4899', glow: 'rgba(236,72,153,0.35)', bg: 'linear-gradient(135deg, rgba(236,72,153,0.12) 0%, rgba(20,28,51,0.95) 100%)' },
};

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SettingsPage = () => {
  const { user, logout, subscriptionStatus } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [activePlan, setActivePlan] = useState('Premium');
  const [billing, setBilling] = useState('monthly');
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestSending, setDigestSending] = useState(false);
  const [plans, setPlans] = useState([]);
  const [showPaywall, setShowPaywall] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('carryon_token');
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await axios.get(`${API_URL}/subscriptions/plans`);
        setPlans(res.data.plans || []);
      } catch (e) { /* fallback to empty */ }
    };
    fetchPlans();
  }, []);

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

  const getBillingPrice = (plan) => {
    if (plan.price === 0) return 'Free';
    if (billing === 'quarterly') return '$' + (plan.quarterly_price || (plan.price * 0.9)).toFixed(2);
    if (billing === 'annual') return '$' + (plan.annual_price || (plan.price * 0.8)).toFixed(2);
    return '$' + plan.price.toFixed(2);
  };

  const getBillingLabel = () => {
    if (billing === 'annual') return '/mo (annual)';
    if (billing === 'quarterly') return '/mo (quarterly)';
    return '/month';
  };

  const PLAN_ICONS = { premium: Crown, standard: Star, base: Shield, new_adult: Award, military: Shield, hospice: Heart };

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
          {/* Subscription Status */}
          {subscriptionStatus && (
            <div className="mb-4 p-3 rounded-xl" style={{
              background: subscriptionStatus.trial?.trial_active ? 'rgba(212,175,55,0.06)' : 
                subscriptionStatus.subscription?.status === 'active' ? 'rgba(34,201,147,0.06)' : 'rgba(239,68,68,0.06)',
              border: `1px solid ${subscriptionStatus.trial?.trial_active ? 'rgba(212,175,55,0.15)' : 
                subscriptionStatus.subscription?.status === 'active' ? 'rgba(34,201,147,0.15)' : 'rgba(239,68,68,0.15)'}`
            }}>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--gold)]" />
                <span className="text-sm font-medium text-[var(--t)]">
                  {subscriptionStatus.beta_mode ? 'Beta Mode — All features free' :
                   subscriptionStatus.subscription?.status === 'active' 
                    ? `Active: ${subscriptionStatus.subscription.plan_name} plan`
                    : subscriptionStatus.trial?.trial_active 
                      ? `Free Trial — ${subscriptionStatus.trial.days_remaining} days remaining`
                      : 'No active subscription'}
                </span>
              </div>
            </div>
          )}

          {/* Billing Toggle */}
          <div className="flex justify-center gap-2 mb-6">
            {['monthly', 'quarterly', 'annual'].map((b) => (
              <button
                key={b}
                onClick={() => setBilling(b)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all capitalize relative ${
                  billing === b
                    ? 'bg-[var(--gold)] text-[#0F1629]'
                    : 'bg-[var(--s)] text-[var(--t4)] hover:text-[var(--t)]'
                }`}
                data-testid={`billing-${b}`}
              >
                {b}
                {b === 'quarterly' && billing === b && <span className="absolute -top-2 -right-2 text-[9px] bg-[#22C993] text-white px-1 py-0.5 rounded-full">10% off</span>}
                {b === 'annual' && billing === b && <span className="absolute -top-2 -right-2 text-[9px] bg-[#22C993] text-white px-1 py-0.5 rounded-full">20% off</span>}
              </button>
            ))}
          </div>

          {/* Plan Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="plan-grid">
            {plans.map((p) => {
              const PlanIcon = PLAN_ICONS[p.id] || Shield;
              const isPremium = p.id === 'premium';
              const tierColors = {
                premium: { accent: '#d4af37', bg: 'rgba(212,175,55,0.12)' },
                standard: { accent: '#60A5FA', bg: 'rgba(96,165,250,0.08)' },
                base: { accent: '#22C993', bg: 'rgba(34,201,147,0.08)' },
                new_adult: { accent: '#B794F6', bg: 'rgba(183,148,246,0.08)' },
                military: { accent: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
                hospice: { accent: '#ec4899', bg: 'rgba(236,72,153,0.08)' },
              };
              const tc = tierColors[p.id] || tierColors.base;
              const isActive = activePlan === p.name;
              return (
                <div
                  key={p.id}
                  onClick={() => setActivePlan(p.name)}
                  className={`relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 ${
                    isPremium ? 'sm:scale-[1.02]' : ''
                  }`}
                  style={{
                    background: isPremium
                      ? 'linear-gradient(168deg, rgba(212,175,55,0.1) 0%, rgba(26,32,53,0.95) 40%, var(--s) 100%)'
                      : isActive 
                        ? `linear-gradient(168deg, ${tc.bg} 0%, var(--s) 100%)` 
                        : 'var(--s)',
                    border: isPremium 
                      ? '2px solid rgba(212,175,55,0.35)' 
                      : isActive 
                        ? `2px solid ${tc.accent}50` 
                        : '1px solid var(--b)',
                    boxShadow: isPremium 
                      ? '0 8px 32px -6px rgba(212,175,55,0.25), inset 0 1px 0 rgba(255,255,255,0.08)' 
                      : isActive 
                        ? `0 6px 24px -4px ${tc.accent}33, inset 0 1px 0 rgba(255,255,255,0.04)` 
                        : '0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.03)',
                  }}
                  data-testid={`plan-${p.id}`}
                >
                  {isPremium && (
                    <>
                      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent)' }} />
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-b-lg"
                        style={{ background: 'linear-gradient(180deg, #d4af37, #b8962e)', color: '#0F1629' }}>
                        Most Popular
                      </div>
                    </>
                  )}

                  <div className="p-5 pt-6 text-center">
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${tc.accent}15`, border: `1px solid ${tc.accent}25` }}>
                        <PlanIcon className="w-4 h-4" style={{ color: tc.accent }} />
                      </div>
                      <span className="text-[var(--t)] font-bold text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>{p.name}</span>
                    </div>
                    <div className="text-4xl font-bold mb-0.5" style={{ color: tc.accent, fontFamily: 'Outfit, sans-serif' }}>
                      {getBillingPrice(p)}
                    </div>
                    <div className="text-[var(--t5)] text-xs mb-0.5">{p.price > 0 ? getBillingLabel() : ''}</div>
                    <div className="text-[var(--t5)] text-xs mb-4">Beneficiary: ${p.ben_price?.toFixed(2)}/mo</div>
                    
                    <div className="h-px mb-4" style={{ background: `linear-gradient(90deg, transparent, ${tc.accent}25, transparent)` }} />

                    <div className="space-y-2 text-left mb-4">
                      {(p.features || []).map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-[var(--t3)]">
                          <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${tc.accent}12` }}>
                            <Check className="w-2.5 h-2.5" style={{ color: tc.accent }} />
                          </div>
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>

                    {p.note && (
                      <div className="text-xs text-[var(--t5)] italic mb-2">{p.note}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!subscriptionStatus?.beta_mode && !subscriptionStatus?.subscription?.status && (
            <div className="mt-4 text-center">
              <Button onClick={() => setShowPaywall(true)} className="gold-button" data-testid="settings-subscribe-btn">
                Subscribe Now <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
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

      {/* Paywall Modal */}
      {showPaywall && (
        <SubscriptionPaywall onDismiss={() => setShowPaywall(false)} />
      )}
    </div>
  );
};

export default SettingsPage;
