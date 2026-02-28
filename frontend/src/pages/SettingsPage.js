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

const SettingsPage = () => {
  const { user, logout, subscriptionStatus, refreshSubscription } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [activePlan, setActivePlan] = useState('Premium');
  const [billing, setBilling] = useState('monthly');
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestSending, setDigestSending] = useState(false);
  const [plans, setPlans] = useState([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const [changingPlan, setChangingPlan] = useState(false);
  const [cancellingPlan, setCancellingPlan] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const currentSub = subscriptionStatus?.subscription;
  const currentPlanId = currentSub?.plan_id;
  const currentBilling = currentSub?.billing_cycle || 'monthly';
  const eligibleTiers = subscriptionStatus?.eligible_tiers || [];
  const isEligibleForPlan = (planId) => {
    if (planId === 'new_adult') return eligibleTiers.includes('new_adult');
    if (planId === 'military') return true; // requires verification, not age
    if (planId === 'hospice') return true;
    return true;
  };

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
    if (currentBilling) setBilling(currentBilling);
  }, [currentBilling]);

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

  const handleChangePlan = async (planId) => {
    if (planId === currentPlanId) return;
    setChangingPlan(true);
    try {
      const res = await axios.post(`${API_URL}/subscriptions/change-plan`, {
        plan_id: planId,
        billing_cycle: billing,
        origin_url: window.location.origin,
      }, getAuthHeaders());
      if (res.data.url) {
        window.location.href = res.data.url;
      } else if (res.data.success) {
        toast.success(res.data.message);
        if (refreshSubscription) await refreshSubscription();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to change plan');
    }
    setChangingPlan(false);
  };

  const handleChangeBilling = async (newCycle) => {
    if (!currentSub || newCycle === currentBilling) {
      setBilling(newCycle);
      return;
    }
    setBilling(newCycle);
    try {
      const res = await axios.post(`${API_URL}/subscriptions/change-billing`, {
        billing_cycle: newCycle,
      }, getAuthHeaders());
      toast.success(res.data.message);
      if (refreshSubscription) await refreshSubscription();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to change billing');
    }
  };

  const handleCancelSubscription = async () => {
    setCancellingPlan(true);
    try {
      await axios.post(`${API_URL}/subscriptions/cancel`, {}, getAuthHeaders());
      toast.success('Subscription cancelled');
      setShowCancelConfirm(false);
      if (refreshSubscription) await refreshSubscription();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to cancel');
    }
    setCancellingPlan(false);
  };

  const getPlanRank = (id) => ({ base: 1, new_adult: 2, military: 3, standard: 4, premium: 5 }[id] || 0);
  const isUpgrade = (planId) => getPlanRank(planId) > getPlanRank(currentPlanId);
  const isDowngrade = (planId) => getPlanRank(planId) < getPlanRank(currentPlanId);
  const requiresVerification = (planId) => ['military', 'hospice'].includes(planId);

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
      <Card className="glass-card overflow-hidden">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[var(--gold)]" />
            Subscription Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Subscription Status */}
          {subscriptionStatus && (
            <div className="mb-5 p-4 rounded-xl relative overflow-hidden" style={{
              background: currentSub?.status === 'active'
                ? 'linear-gradient(135deg, rgba(34,201,147,0.08) 0%, rgba(34,201,147,0.02) 100%)'
                : subscriptionStatus.trial?.trial_active
                  ? 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(212,175,55,0.02) 100%)'
                  : 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%)',
              border: `1px solid ${currentSub?.status === 'active' ? 'rgba(34,201,147,0.2)' : subscriptionStatus.trial?.trial_active ? 'rgba(212,175,55,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {currentSub?.status === 'active' ? (
                    <Zap className="w-4 h-4 text-[#22C993]" />
                  ) : (
                    <Clock className="w-4 h-4 text-[var(--gold)]" />
                  )}
                  <span className="text-sm font-semibold text-[var(--t)]">
                    {subscriptionStatus.beta_mode ? 'Beta Mode — All features free' :
                     currentSub?.status === 'active'
                      ? `${currentSub.plan_name} Plan · ${currentSub.billing_cycle || 'monthly'}`
                      : subscriptionStatus.trial?.trial_active
                        ? `Free Trial — ${subscriptionStatus.trial.days_remaining} days remaining`
                        : 'No active subscription'}
                  </span>
                </div>
                {currentSub?.status === 'active' && (
                  <button onClick={() => setShowCancelConfirm(true)} className="text-xs text-[var(--t5)] hover:text-red-400 transition-colors" data-testid="cancel-sub-btn">Cancel</button>
                )}
              </div>
            </div>
          )}

          {/* Cancel Confirmation Modal */}
          {showCancelConfirm && (
            <div className="mb-5 p-4 rounded-xl border border-red-500/20 bg-red-500/5">
              <p className="text-sm text-[var(--t3)] mb-3">Are you sure you want to cancel? You'll keep access until the end of your billing period.</p>
              <div className="flex gap-2">
                <Button onClick={handleCancelSubscription} disabled={cancellingPlan} className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 text-xs px-4 py-2" data-testid="confirm-cancel-btn">
                  {cancellingPlan ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Yes, Cancel
                </Button>
                <Button onClick={() => setShowCancelConfirm(false)} className="bg-[var(--s)] text-[var(--t4)] border border-[var(--b)] text-xs px-4 py-2">Keep Plan</Button>
              </div>
            </div>
          )}

          {/* Billing Cycle Toggle */}
          <div className="flex justify-center gap-1 mb-6 p-1 rounded-xl bg-[var(--s)] border border-[var(--b)] w-fit mx-auto" data-testid="billing-toggle">
            {['monthly', 'quarterly', 'annual'].map((b) => (
              <button
                key={b}
                onClick={() => handleChangeBilling(b)}
                className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all duration-300 capitalize relative ${
                  billing === b
                    ? 'bg-[var(--gold)] text-[#0F1629] shadow-[0_2px_12px_rgba(212,175,55,0.3)]'
                    : 'text-[var(--t5)] hover:text-[var(--t3)]'
                }`}
                data-testid={`billing-${b}`}
              >
                {b}
                {b === 'quarterly' && <span className="absolute -top-2.5 -right-1 text-[9px] bg-[#22C993] text-white px-1.5 py-0.5 rounded-full font-bold shadow-[0_2px_8px_rgba(34,201,147,0.4)]">-10%</span>}
                {b === 'annual' && <span className="absolute -top-2.5 -right-1 text-[9px] bg-[#22C993] text-white px-1.5 py-0.5 rounded-full font-bold shadow-[0_2px_8px_rgba(34,201,147,0.4)]">-20%</span>}
              </button>
            ))}
          </div>

          {/* Plan Grid — Dramatic Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="plan-grid">
            {plans.map((p, idx) => {
              const PlanIcon = PLAN_ICONS[p.id] || Shield;
              const isPremium = p.id === 'premium';
              const tc = TIER_COLORS[p.id] || TIER_COLORS.base;
              const isCurrent = currentPlanId === p.id;
              const isActive = activePlan === p.name;
              const upgrading = isUpgrade(p.id);
              const downgrading = isDowngrade(p.id);
              const eligible = isEligibleForPlan(p.id);

              return (
                <div
                  key={p.id}
                  onClick={() => eligible && setActivePlan(p.name)}
                  className={`relative rounded-2xl overflow-hidden transition-all duration-500 group ${
                    !eligible ? 'opacity-50 cursor-default' : 'cursor-pointer'
                  } ${
                    eligible && isPremium ? 'sm:scale-[1.03] hover:-translate-y-2' : eligible ? 'hover:-translate-y-1' : ''
                  }`}
                  style={{
                    background: !eligible ? 'rgba(20,28,51,0.6)' : tc.bg,
                    border: isCurrent
                      ? `2px solid ${tc.accent}`
                      : isPremium && eligible
                        ? `2px solid ${tc.accent}60`
                        : `1px solid rgba(255,255,255,0.07)`,
                    boxShadow: !eligible ? 'none' : isCurrent
                      ? `0 0 0 1px ${tc.accent}30, 0 12px 40px -8px ${tc.glow}, inset 0 1px 0 rgba(255,255,255,0.1)`
                      : isPremium
                        ? `0 12px 40px -8px ${tc.glow}, inset 0 1px 0 rgba(255,255,255,0.08)`
                        : '0 4px 16px -4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                    animationDelay: `${idx * 80}ms`,
                  }}
                  data-testid={`plan-${p.id}`}
                >
                  {/* Top shimmer line */}
                  {(isPremium || isCurrent) && (
                    <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${tc.accent}80, transparent)` }} />
                  )}

                  {/* Badges */}
                  {isPremium && !isCurrent && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[10px] font-bold px-4 py-1 rounded-b-lg z-10"
                      style={{ background: `linear-gradient(180deg, ${tc.accent}, ${tc.accent}cc)`, color: '#0F1629', boxShadow: `0 4px 16px ${tc.glow}` }}>
                      Most Popular
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[10px] font-bold px-4 py-1 rounded-b-lg z-10"
                      style={{ background: `linear-gradient(180deg, ${tc.accent}, ${tc.accent}cc)`, color: '#0F1629', boxShadow: `0 4px 16px ${tc.glow}` }}>
                      Current Plan
                    </div>
                  )}

                  <div className="p-5 pt-7">
                    {/* Icon + Name */}
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                        style={{ background: `${tc.accent}15`, border: `1px solid ${tc.accent}30`, boxShadow: `0 4px 12px ${tc.accent}15` }}>
                        <PlanIcon className="w-5 h-5" style={{ color: tc.accent }} />
                      </div>
                      <h3 className="font-bold text-lg text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>{p.name}</h3>
                    </div>

                    {/* Price */}
                    <div className="mb-1">
                      <span className="text-4xl font-bold tracking-tight" style={{ color: tc.accent, fontFamily: 'Outfit, sans-serif' }}>
                        {getBillingPrice(p)}
                      </span>
                      {p.price > 0 && <span className="text-[10px] text-[var(--t5)] ml-1.5">{getBillingLabel()}</span>}
                    </div>
                    <div className="text-[10px] text-[var(--t5)] mb-4">Beneficiary: ${p.ben_price?.toFixed(2)}/mo</div>

                    {/* Divider */}
                    <div className="h-px mb-4" style={{ background: `linear-gradient(90deg, transparent, ${tc.accent}30, transparent)` }} />

                    {/* Features */}
                    <div className="space-y-2 text-left mb-5">
                      {(p.features || []).map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-[var(--t3)]">
                          <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${tc.accent}15` }}>
                            <Check className="w-2.5 h-2.5" style={{ color: tc.accent }} />
                          </div>
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>

                    {p.note && <div className="text-xs text-[var(--t5)] italic mb-3">{p.note}</div>}

                    {/* Ineligible notice */}
                    {!eligible && (
                      <div className="w-full text-center text-xs font-medium py-3 rounded-xl text-[var(--t5)]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        Ages 18–25 only
                      </div>
                    )}

                    {/* CTA Button — context-aware */}
                    {eligible && (currentSub?.status === 'active' ? (
                      isCurrent ? (
                        <div className="w-full text-center text-xs font-bold py-3 rounded-xl" style={{ background: `${tc.accent}10`, color: tc.accent, border: `1px solid ${tc.accent}30` }}>
                          <Check className="w-3.5 h-3.5 inline mr-1" /> Your Plan
                        </div>
                      ) : (
                        <Button
                          onClick={(e) => { e.stopPropagation(); handleChangePlan(p.id); }}
                          disabled={changingPlan}
                          className="w-full text-sm font-bold py-5 transition-all duration-300"
                          style={{
                            background: requiresVerification(p.id) ? 'transparent' : upgrading ? `linear-gradient(135deg, ${tc.accent}, ${tc.accent}cc)` : 'transparent',
                            color: requiresVerification(p.id) ? tc.accent : upgrading ? '#0F1629' : tc.accent,
                            border: requiresVerification(p.id) || !upgrading ? `2px solid ${tc.accent}40` : 'none',
                            boxShadow: !requiresVerification(p.id) && upgrading ? `0 4px 20px ${tc.glow}` : 'none',
                          }}
                          data-testid={`change-plan-${p.id}`}
                        >
                          {changingPlan ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : requiresVerification(p.id) ? <Shield className="w-4 h-4 mr-1" /> : upgrading ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
                          {requiresVerification(p.id) ? 'Verify & Apply' : upgrading ? 'Upgrade' : 'Downgrade'}
                        </Button>
                      )
                    ) : (
                      <Button
                        onClick={(e) => { e.stopPropagation(); setShowPaywall(true); }}
                        className={`w-full text-sm font-bold py-5 transition-all duration-300 ${isPremium ? 'gold-button' : ''}`}
                        style={!isPremium ? { background: 'transparent', border: `2px solid ${tc.accent}40`, color: tc.accent } : { boxShadow: `0 4px 20px ${tc.glow}` }}
                        data-testid={`plan-subscribe-${p.id}`}
                      >
                        Subscribe <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {!subscriptionStatus?.beta_mode && !currentSub?.status && (
            <div className="mt-6 text-center">
              <Button onClick={() => setShowPaywall(true)} className="gold-button shadow-[0_4px_20px_rgba(212,175,55,0.3)] px-8 py-5" data-testid="settings-subscribe-btn">
                <Zap className="w-4 h-4 mr-2" /> Subscribe Now <ChevronRight className="w-4 h-4 ml-1" />
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
