import React, { useState, useEffect, useRef } from 'react';
import { SEO } from '../components/SEO';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, ChevronRight, Check, Users, Clock, Zap,
  CreditCard, ArrowRight, Heart
} from 'lucide-react';
import { API_URL } from '../config';
import { TrustBadges, StripeNote } from '../components/landing/TrustBadges';
import { startPlanCheckout } from '../utils/stripeRedirect';
import { toast } from 'sonner';

const CYCLE_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' };
const CYCLE_SAVINGS = { monthly: null, quarterly: '10% off', annual: '20% off' };
const CYCLES = Object.keys(CYCLE_LABELS);
const INTENT_KEY = 'carryon_checkout_intent';

const readIntent = () => {
  try { return JSON.parse(sessionStorage.getItem(INTENT_KEY) || 'null'); } catch { return null; }
};

const StartPage = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState([]);
  const [trialDays, setTrialDays] = useState(30);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const requestedPlan = searchParams.get('plan');
  const requestedCycle = searchParams.get('cycle');
  const [selectedCycle, setSelectedCycle] = useState(CYCLES.includes(requestedCycle) ? requestedCycle : 'monthly');
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [familyDiscount, setFamilyDiscount] = useState(0);
  // Signup hands back here with ?resume=checkout once the account exists.
  const [resuming, setResuming] = useState(searchParams.get('resume') === 'checkout' && !!readIntent());
  const resumedRef = useRef(false);

  useEffect(() => {
    // Track funnel event + capture UTM and partner params
    const utm = {};
    for (const [k, v] of searchParams.entries()) {
      if (k.startsWith('utm_') || k === 'ref' || k === 'code' || k === 'partner') utm[k] = v;
    }
    if (Object.keys(utm).length > 0) {
      sessionStorage.setItem('carryon_utm', JSON.stringify(utm));
    }
    // Preserve partner/B2B code for signup flow
    const partnerCode = searchParams.get('code') || searchParams.get('partner');
    if (partnerCode) {
      sessionStorage.setItem('carryon_partner_code', partnerCode);
    }
    fetchPlans();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPlans = async () => {
    try {
      const res = await axios.get(`${API_URL}/subscriptions/plans`);
      const data = res.data;
      const allPlans = data.plans || [];
      const mainPlans = allPlans.filter(p => p.price > 0 && !['enterprise'].includes(p.id));
      setPlans(mainPlans);
      setTrialDays(data.trial_duration_days || 30);
      setFamilyDiscount(data.family_benefactor_discount_percent || 0);
      const defaultPlan = mainPlans.find(p => p.id === requestedPlan)
        || mainPlans.find(p => p.is_default) || mainPlans.find(p => p.id === 'standard') || mainPlans[0];
      if (defaultPlan) setSelectedPlan(defaultPlan.id);
    } catch { /* silent */ }
    setLoading(false);
  };

  // /pricing → /start?plan=… : land the visitor on the preselected plan card.
  useEffect(() => {
    if (loading || !requestedPlan || resuming) return;
    const t = setTimeout(() => document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' }), 150);
    return () => clearTimeout(t);
  }, [loading, requestedPlan, resuming]);

  // Post-signup hand-off: the account now exists, finish the plan the visitor picked.
  useEffect(() => {
    if (!resuming || resumedRef.current) return;
    if (!user) { if (!authLoading) setResuming(false); return; }
    resumedRef.current = true;
    const intent = readIntent();
    sessionStorage.removeItem(INTENT_KEY);
    if (!intent?.planId) { setResuming(false); return; }
    const cycle = CYCLES.includes(intent.cycle) ? intent.cycle : 'monthly';
    setSelectedPlan(intent.planId);
    setSelectedCycle(cycle);
    handleCheckout(intent.planId, cycle).then((ok) => { if (!ok) setResuming(false); });
  }, [resuming, user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const getPrice = (plan, cycle) => {
    if (cycle === 'quarterly') return plan.quarterly_price || (plan.price * 0.9).toFixed(2);
    if (cycle === 'annual') return plan.annual_price || (plan.price * 0.8).toFixed(2);
    return plan.price;
  };

  const getTotalPrice = (plan, cycle) => {
    const monthly = parseFloat(getPrice(plan, cycle));
    if (cycle === 'quarterly') return (monthly * 3).toFixed(2);
    if (cycle === 'annual') return (monthly * 12).toFixed(2);
    return monthly.toFixed(2);
  };

  const handleCheckout = async (planId, cycle = selectedCycle) => {
    if (!user) {
      // Store intent and redirect to signup; SignupPage returns to /start?resume=checkout.
      sessionStorage.setItem(INTENT_KEY, JSON.stringify({ planId, cycle }));
      const partnerCode = sessionStorage.getItem('carryon_partner_code');
      const signupUrl = partnerCode ? `/signup?redirect=start&code=${partnerCode}` : '/signup?redirect=start';
      navigate(signupUrl);
      return false;
    }
    setCheckoutLoading(true);
    let ok = false;
    try {
      const plan = plans.find(p => p.id === planId);
      const result = await startPlanCheckout({ planId, cycle, planName: plan?.name });
      ok = true;
      if (result.free) navigate('/dashboard');
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error(err.response?.data?.detail || 'We couldn\u2019t start checkout. Please try again.');
    }
    setCheckoutLoading(false);
    return ok;
  };

  const specialTiers = plans.filter(p => ['military', 'veteran', 'new_adult'].includes(p.id));
  const mainTiers = plans.filter(p => !['military', 'veteran', 'new_adult'].includes(p.id));

  if (loading || resuming) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--bg)' }} data-testid={resuming ? 'start-resume-checkout' : 'start-loading'}>
        <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
        {resuming && (
          <>
            <p className="text-base font-semibold text-[var(--t)]">Your account is ready. Taking you to secure checkout&hellip;</p>
            <StripeNote testId="start-resume-stripe-note" />
          </>
        )}
      </div>
    );
  }

  const startPageJsonLd = plans.length > 0 ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Get Started with CarryOn",
    "description": "Choose how to begin protecting your family with CarryOn. Start with a paid subscription or explore the platform free.",
    "url": "https://carryon.us/start",
    "mainEntity": {
      "@type": "ItemList",
      "name": "CarryOn Subscription Plans",
      "itemListElement": plans.filter(p => p.price > 0).map((p, i) => ({
        "@type": "ListItem",
        "position": i + 1,
        "item": {
          "@type": "Product",
          "name": `CarryOn ${p.name} Plan`,
          "description": (p.features || []).join('. '),
          "offers": {
            "@type": "Offer",
            "price": p.price,
            "priceCurrency": "USD",
            "priceSpecification": {
              "@type": "UnitPriceSpecification",
              "price": p.price,
              "priceCurrency": "USD",
              "unitText": "MONTH",
              "billingDuration": "P1M"
            },
            "availability": "https://schema.org/InStock"
          }
        }
      }))
    },
    "provider": {
      "@type": "Organization",
      "name": "CarryOn Technologies",
      "url": "https://carryon.us"
    }
  }) : null;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }} data-testid="start-page">
      <SEO title="Get Started with CarryOn - Family Preparedness Platform" description={`Choose how to begin: pick a plan, or explore CarryOn first for ${trialDays} days with no card. One secure place for documents, passwords, who to call first and what to do next.`} path="/start" />
      {startPageJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: startPageJsonLd }} />
      )}
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-4" style={{ borderBottom: '1px solid var(--b)' }}>
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <Shield className="w-6 h-6 text-[#d4af37]" />
          <span className="text-lg font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>CarryOn</span>
        </div>
        <button onClick={() => navigate('/login')} className="text-sm text-[var(--t4)] hover:text-[var(--t)]">
          Sign In
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-10 sm:mb-16">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--t)] mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Protect what matters most
          </h1>
          <p className="text-base sm:text-lg text-[var(--t4)] max-w-2xl mx-auto">
            Choose how you'd like to get started with CarryOn
          </p>
        </div>

        {/* Two Doors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          {/* Door 1 — Start Today */}
          <div className="rounded-2xl p-6 sm:p-8 relative overflow-hidden" style={{
            background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(212,175,55,0.02))',
            border: '2px solid rgba(212,175,55,0.3)',
          }} data-testid="door-paid">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-[#d4af37]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[#d4af37]">Recommended</span>
            </div>
            <h2 className="text-2xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Start today
            </h2>
            <p className="text-sm text-[var(--t4)] mb-6">
              Full access. Your plan is live in minutes. Cancel anytime.
            </p>
            <ul className="space-y-2 mb-6">
              {['Secure document vault', 'Estate Guardian AI review', 'Milestone Messages for loved ones', 'What-to-do-first checklist', 'Reminders on your phone'].map(feat => (
                <li key={feat} className="flex items-start gap-2 text-sm text-[var(--t3)]">
                  <Check className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" />
                  {feat}
                </li>
              ))}
            </ul>
            <button
              onClick={() => document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full py-3.5 rounded-xl text-base font-bold transition-all active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}
              data-testid="door-paid-cta">
              Choose a Plan <ArrowRight className="w-5 h-5 inline ml-1" />
            </button>
          </div>

          {/* Door 2 — Explore First */}
          <div className="rounded-2xl p-6 sm:p-8" style={{
            background: 'var(--s)',
            border: '1px solid var(--b)',
          }} data-testid="door-explore">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-[var(--t4)]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--t4)]">No card needed</span>
            </div>
            <h2 className="text-2xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Explore first
            </h2>
            <p className="text-sm text-[var(--t4)] mb-6">
              Not ready to pay? Build your family's plan first. No card needed. You'll be asked to subscribe when your {trialDays}-day exploration period ends.
            </p>
            <ul className="space-y-2 mb-6">
              {['Full platform access during exploration', 'Add beneficiaries & upload documents', 'See your Estate Readiness Score build', 'Your data is yours alone'].map(feat => (
                <li key={feat} className="flex items-start gap-2 text-sm text-[var(--t3)]">
                  <Check className="w-4 h-4 text-[var(--t4)] flex-shrink-0 mt-0.5" />
                  {feat}
                </li>
              ))}
            </ul>
            <button
              onClick={() => {
                const partnerCode = sessionStorage.getItem('carryon_partner_code');
                navigate(partnerCode ? `/signup?code=${partnerCode}` : '/signup');
              }}
              className="w-full py-3.5 rounded-xl text-base font-bold transition-all active:scale-[0.97]"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--b)', color: 'var(--t)' }}
              data-testid="door-explore-cta">
              Create Account <ChevronRight className="w-5 h-5 inline ml-1" />
            </button>
          </div>
        </div>

        {/* Pricing Section */}
        <div id="pricing-section" className="scroll-mt-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Simple, transparent pricing
            </h2>
            <p className="text-sm text-[var(--t4)] mb-3">Cancel anytime. Your data is yours alone.</p>
            <TrustBadges tone="app" testIdSuffix="-start" />
          </div>

          {/* Billing cycle toggle */}
          <div className="flex items-center justify-center gap-2 mb-8 p-1 rounded-xl mx-auto w-fit" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            {['monthly', 'quarterly', 'annual'].map(cycle => (
              <button key={cycle} onClick={() => setSelectedCycle(cycle)}
                className="px-4 sm:px-6 py-2 rounded-lg text-sm font-bold transition-all relative"
                style={{
                  background: selectedCycle === cycle ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'transparent',
                  color: selectedCycle === cycle ? '#080e1a' : 'var(--t4)',
                }}
                data-testid={`cycle-${cycle}`}>
                {CYCLE_LABELS[cycle]}
                {CYCLE_SAVINGS[cycle] && (
                  <span className="absolute -top-2.5 -right-1 text-[11px] px-1.5 py-0.5 rounded-full font-bold bg-[#10b981] text-white">
                    {CYCLE_SAVINGS[cycle]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {mainTiers.map(plan => {
              const isSelected = selectedPlan === plan.id;
              const price = getPrice(plan, selectedCycle);
              const total = getTotalPrice(plan, selectedCycle);
              return (
                <div key={plan.id} className="rounded-2xl p-5 sm:p-6 transition-all cursor-pointer"
                  onClick={() => setSelectedPlan(plan.id)}
                  style={{
                    background: isSelected ? 'rgba(212,175,55,0.06)' : 'var(--s)',
                    border: `2px solid ${isSelected ? 'rgba(212,175,55,0.4)' : 'var(--b)'}`,
                    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                  }}
                  data-testid={`plan-${plan.id}`}>
                  <h3 className="text-lg font-bold text-[var(--t)] mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl font-bold text-[var(--t)]">${parseFloat(price).toFixed(2)}</span>
                    <span className="text-sm text-[var(--t5)]">/mo</span>
                  </div>
                  {selectedCycle !== 'monthly' && (
                    <div className="text-xs text-[var(--t5)] mb-3">
                      Billed ${total} {selectedCycle === 'quarterly' ? 'every 3 months' : 'annually'}
                    </div>
                  )}
                  <ul className="space-y-1.5 mb-5">
                    {(plan.features || []).slice(0, 4).map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[var(--t3)]">
                        <Check className="w-3.5 h-3.5 text-[#10b981] flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                    <li className="flex items-start gap-2 text-xs text-[var(--t3)]" data-testid={`start-invited-${plan.id}`}>
                      <Users className="w-3.5 h-3.5 text-[#3b82f6] flex-shrink-0 mt-0.5" />
                      <span>People you invite: <strong className="text-[var(--t)]">free</strong> while you&apos;re alive</span>
                    </li>
                  </ul>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCheckout(plan.id); }}
                    disabled={checkoutLoading}
                    className="w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                    style={{
                      background: isSelected ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(255,255,255,0.06)',
                      color: isSelected ? '#080e1a' : 'var(--t3)',
                      border: `1px solid ${isSelected ? 'transparent' : 'var(--b)'}`,
                    }}
                    data-testid={`checkout-${plan.id}`}>
                    <CreditCard className="w-4 h-4 inline mr-1" />
                    {checkoutLoading ? 'Loading...' : (user ? 'Continue to secure checkout' : 'Subscribe')}
                  </button>
                  <StripeNote className="w-full mt-2.5" testId={`start-stripe-note-${plan.id}`} />
                </div>
              );
            })}
          </div>

          {/* Special tiers */}
          {specialTiers.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-bold text-[var(--t)] mb-4 text-center">Special Pricing</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {specialTiers.map(plan => {
                  const price = getPrice(plan, selectedCycle);
                  return (
                    <div key={plan.id} className="rounded-xl p-4 flex items-center justify-between"
                      style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                      data-testid={`special-${plan.id}`}>
                      <div>
                        <div className="text-sm font-bold text-[var(--t)]">{plan.name}</div>
                        <div className="text-xs text-[var(--t5)]">${parseFloat(price).toFixed(2)}/mo</div>
                      </div>
                      <button onClick={() => { setSelectedPlan(plan.id); handleCheckout(plan.id); }}
                        className="px-4 py-2 rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(212,175,55,0.12)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)' }}
                        data-testid={`checkout-${plan.id}`}>
                        Select
                      </button>
                    </div>
                  );
                })}
              </div>
              <StripeNote className="w-full mt-3" testId="start-stripe-note-special" />
            </div>
          )}

          {/* Family pricing callout */}
          <div className="rounded-2xl p-5 sm:p-6 mb-8 text-center" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
            <Users className="w-8 h-8 mx-auto mb-2 text-[#3b82f6]" />
            <h3 className="text-lg font-bold text-[var(--t)] mb-1">One plan. Nobody you invite pays.</h3>
            <p className="text-sm text-[var(--t4)] max-w-md mx-auto">
              Your spouse, kids, and attorney see what you share at no charge while you&apos;re alive. Quarterly and annual billing saves you even more.
              {familyDiscount > 0 && ` Family plan members save an additional ${familyDiscount}%.`}
            </p>
          </div>

          {/* Hospice link */}
          <div className="text-center mb-8">
            <button onClick={() => navigate('/get-started?plan=hospice')} className="text-sm text-[var(--t5)] hover:text-[var(--t4)] transition-colors underline"
              data-testid="hospice-link">
              <Heart className="w-3.5 h-3.5 inline mr-1" />
              Enrolled in certified hospice care? Full access at no cost.
            </button>
          </div>
        </div>

        {/* Trust signals */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-[var(--t5)] py-8" style={{ borderTop: '1px solid var(--b)' }}>
          <span><Shield className="w-4 h-4 inline mr-1" />Scrambled before it&rsquo;s stored</span>
          <span><Check className="w-4 h-4 inline mr-1" />Cancel Anytime</span>
          <span>Your Data Is Yours Alone</span>
        </div>
      </div>
    </div>
  );
};

export default StartPage;
