import React, { useState, useEffect } from 'react';
import { SEO } from '../components/SEO';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, Check, Users, ChevronRight, ChevronDown, CreditCard, Heart, UserPlus, Clock, HelpCircle, Lock, ListChecks,
} from 'lucide-react';
import { API_URL } from '../config';
import { TrustBadges, StripeNote } from '../components/landing/TrustBadges';
import { startPlanCheckout } from '../utils/stripeRedirect';
import { toast } from 'sonner';
import { useCopy, renderCopy } from '../copy/CopyContext';

const CYCLE_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' };
const CYCLE_SAVINGS = { monthly: null, quarterly: 'Save 10%', annual: 'Save 20%' };
const ATTORNEY_HOUR_LOW = 250;
const SPECIAL_ORDER = ['seniors', 'military', 'veteran', 'new_adult'];
const money = (n) => `$${Number(n).toFixed(2)}`;

// Comparison-table rows, in plain language. Which tier gets what comes from the
// Founder Portal feature gates (`tier_features` in /subscriptions/plans) — never hardcoded.
const FEATURE_ROWS = [
  { key: 'sdv', label: 'Secure Document Vault' },
  { key: 'iac', label: 'What-to-do-first checklist' },
  { key: 'mm', label: 'Milestone Messages' },
  { key: 'ega', label: 'Estate Guardian\u2122 AI review' },
  { key: 'dav', label: 'Passwords & accounts vault' },
  { key: 'ffn', label: 'Who-to-notify list' },
  { key: 'cfp', label: 'Financial picture' },
  { key: 'ccp', label: 'Emergency plans (Contingency Protocols)' },
  { key: 'ect', label: 'Private family messaging' },
  { key: 'ces', label: 'Trusts, LLCs & entity map' },
  { key: 'bec', label: 'AI concierge for your beneficiaries' },
  { key: 'tma', label: 'Trustee access on your behalf' },
];

const PricingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useCopy();
  const [plans, setPlans] = useState([]);
  const [tierFeatures, setTierFeatures] = useState({});
  const [selectedCycle, setSelectedCycle] = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [familyDiscount, setFamilyDiscount] = useState(0);
  const [trialDays, setTrialDays] = useState(30);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [showSpecial, setShowSpecial] = useState(typeof window !== 'undefined' && window.location.hash === '#reduced');

  useEffect(() => { fetchPlans(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPlans = async () => {
    try {
      const res = await axios.get(`${API_URL}/subscriptions/plans`);
      setPlans((res.data.plans || []).filter(p => p.price > 0 && p.id !== 'enterprise'));
      setTierFeatures(res.data.tier_features || {});
      setFamilyDiscount(res.data.family_benefactor_discount_percent || 0);
      if (res.data.trial_duration_days) setTrialDays(res.data.trial_duration_days);
    } catch { /* silent */ }
    setLoading(false);
  };

  const isEnabled = (tierId, featureKey) =>
    (tierFeatures[tierId] || []).some(f => f.key === featureKey && f.enabled);

  const getPrice = (plan, cycle) => {
    if (cycle === 'quarterly') return plan.quarterly_price || (plan.price * 0.9).toFixed(2);
    if (cycle === 'annual') return plan.annual_price || (plan.price * 0.8).toFixed(2);
    return plan.price;
  };

  const getTotalLabel = (plan, cycle) => {
    const mp = parseFloat(getPrice(plan, cycle));
    if (cycle === 'quarterly') return `${money(mp * 3)} billed every 3 months`;
    if (cycle === 'annual') return `${money(mp * 12)} billed annually`;
    return 'Billed monthly';
  };

  const perDay = (plan, cycle) => (parseFloat(getPrice(plan, cycle)) * 12 / 365).toFixed(2);
  const perYear = (plan, cycle) => parseFloat(getPrice(plan, cycle)) * 12;

  const handleSelect = async (planId) => {
    if (!user) { navigate(`/start?plan=${planId}&cycle=${selectedCycle}`); return; }
    setCheckoutLoading(planId);
    try {
      const plan = plans.find(p => p.id === planId);
      const result = await startPlanCheckout({ planId, cycle: selectedCycle, planName: plan?.name });
      if (result.free) navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'We couldn\u2019t start checkout. Please try again.');
    }
    setCheckoutLoading(null);
  };

  const mainTiers = plans.filter(p => ['premium', 'standard', 'base'].includes(p.id));
  const specialTiers = plans
    .filter(p => !['premium', 'standard', 'base', 'hospice', 'enterprise'].includes(p.id))
    .sort((a, b) => SPECIAL_ORDER.indexOf(a.id) - SPECIAL_ORDER.indexOf(b.id));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const lowestPrice = mainTiers.length > 0 ? Math.min(...mainTiers.map(p => p.price)).toFixed(2) : '7.99';
  const highestPrice = mainTiers.length > 0 ? Math.max(...mainTiers.map(p => p.price)).toFixed(2) : '24.99';
  const maxAnnualTotal = mainTiers.length > 0 ? Math.max(...mainTiers.map(p => perYear(p, 'annual'))) : 0;
  const attorneyHours = Math.max(1, Math.ceil(maxAnnualTotal / ATTORNEY_HOUR_LOW));
  const benRange = mainTiers.length > 0 ? [Math.min(...mainTiers.map(p => p.ben_price)), Math.max(...mainTiers.map(p => p.ben_price))] : null;
  const standard = mainTiers.find(p => p.id === 'standard') || mainTiers[0];

  const pricingJsonLd = plans.length > 0 ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "CarryOn Pricing",
    "description": "One plan for you. The people you invite pay nothing while you're alive. Base, Standard, and Premium plans with reduced pricing for seniors, military, veterans, young adults, and free access for hospice families.",
    "url": "https://carryon.us/pricing",
    "mainEntity": {
      "@type": "ItemList",
      "name": "CarryOn Subscription Plans",
      "numberOfItems": plans.length,
      "itemListElement": plans.map((p, i) => ({
        "@type": "ListItem",
        "position": i + 1,
        "item": {
          "@type": "Product",
          "name": `CarryOn ${p.name} Plan`,
          "description": (p.features || []).join('. '),
          "brand": { "@type": "Brand", "name": "CarryOn" },
          "offers": p.price > 0 ? {
            "@type": "Offer",
            "price": p.price,
            "priceCurrency": "USD",
            "priceSpecification": { "@type": "UnitPriceSpecification", "price": p.price, "priceCurrency": "USD", "unitText": "MONTH" },
            "availability": "https://schema.org/InStock"
          } : {
            "@type": "Offer", "price": 0, "priceCurrency": "USD", "availability": "https://schema.org/InStock", "description": "Free with verification"
          }
        }
      }))
    },
    "provider": { "@type": "Organization", "name": "CarryOn Technologies", "url": "https://carryon.us" }
  }) : null;

  const card = { background: 'var(--s)', border: '1px solid var(--b)' };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }} data-testid="pricing-page">
      <SEO title={t('pricing.seo.title')} description={`One plan for you, from $${lowestPrice} to $${highestPrice} per month. The people you invite pay nothing while you're alive. Explore first for ${trialDays} days with no card. Reduced pricing for seniors, military, veterans and young adults; free for hospice families.`} path="/pricing" />
      {pricingJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: pricingJsonLd }} />}

      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-8 pb-4" style={{ borderBottom: '1px solid var(--b)', paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <Shield className="w-6 h-6 text-[#d4af37]" />
          <span className="text-lg font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>CarryOn</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/start')} className="text-sm text-[#d4af37] font-medium hover:underline" data-testid="pricing-nav-start">{t('nav.start')}</button>
          <button onClick={() => navigate('/login')} className="text-sm text-[var(--t4)] hover:text-[var(--t)]">{t('nav.signin')}</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 sm:py-20">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--t)] mb-3" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="pricing-h1">
            {t('pricing.hero.h1a')} <span className="text-[#d4af37]">{t('pricing.hero.h1b')}</span>
          </h1>
          <p className="text-base sm:text-lg text-[var(--t4)] max-w-xl mx-auto mb-4" data-testid="pricing-subhead">
            Explore first for {trialDays} days with no card. Your spouse, kids, and attorney pay nothing while you&apos;re alive. Cancel anytime.
          </p>
          <TrustBadges tone="app" testIdSuffix="-pricing" className="mb-2" />
        </div>

        {/* How pricing works */}
        <div className="grid sm:grid-cols-3 gap-4 mb-12" data-testid="pricing-how-it-works">
          {[
            { icon: CreditCard, step: '1', title: t('pricing.steps.1.title'), desc: `Base, Standard, or Premium. Monthly by default; quarterly saves 10%, annual saves 20%. Your first ${trialDays} days are free to explore, no card.` },
            { icon: UserPlus, step: '2', title: t('pricing.steps.2.title'), desc: 'Spouse, kids, siblings, your attorney. They see what you share and pay nothing while you\u2019re here. There is no per-person fee on your bill.' },
            { icon: Clock, step: '3', title: t('pricing.steps.3.title'), desc: benRange ? `Each person can keep their own access for ${money(benRange[0])}\u2013${money(benRange[1])}/mo (30-day grace period first), or export everything and leave.` : 'Each person can keep their own access for a small monthly rate, or export everything and leave.' },
          ].map(({ icon: Icon, step, title, desc }) => (
            <div key={step} className="rounded-xl p-5" style={card}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(212,175,55,0.14)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)' }}>{step}</span>
                <Icon className="w-4 h-4 text-[#d4af37]" />
              </div>
              <p className="text-sm font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</p>
              <p className="text-xs text-[var(--t4)] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Billing cycle toggle */}
        <div className="flex items-center justify-center gap-1 mb-8 p-1.5 rounded-xl mx-auto w-fit" style={card}>
          {['monthly', 'quarterly', 'annual'].map(cycle => (
            <button key={cycle} onClick={() => setSelectedCycle(cycle)}
              className="px-5 sm:px-8 py-2.5 rounded-lg text-sm font-bold transition-all relative"
              style={{
                background: selectedCycle === cycle ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'transparent',
                color: selectedCycle === cycle ? '#080e1a' : 'var(--t4)',
              }}
              data-testid={`pricing-cycle-${cycle}`}>
              {CYCLE_LABELS[cycle]}
              {CYCLE_SAVINGS[cycle] && (
                <span className="absolute -top-2.5 -right-2 text-[11px] px-1.5 py-0.5 rounded-full font-bold bg-[#10b981] text-white whitespace-nowrap">
                  {CYCLE_SAVINGS[cycle]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Main plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          {mainTiers.map(plan => {
            const price = getPrice(plan, selectedCycle);
            const isPopular = plan.id === 'standard' || plan.id === 'premium';
            return (
              <div key={plan.id} className="rounded-2xl p-6 relative overflow-hidden transition-all hover:scale-[1.02] flex flex-col"
                style={{
                  background: isPopular ? 'rgba(212,175,55,0.04)' : 'var(--s)',
                  border: `2px solid ${isPopular ? 'rgba(212,175,55,0.3)' : 'var(--b)'}`,
                }}
                data-testid={`pricing-plan-${plan.id}`}>
                {plan.id === 'premium' && (
                  <div className="absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-xs font-bold" style={{ background: '#d4af37', color: '#080e1a' }}>
                    {t('pricing.popular')}
                  </div>
                )}
                <h3 className="text-xl font-bold text-[var(--t)] mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-bold text-[var(--t)]">{money(price)}</span>
                  <span className="text-sm text-[var(--t5)]">/mo</span>
                </div>
                <p className="text-xs text-[var(--t5)] mb-1">{getTotalLabel(plan, selectedCycle)}</p>
                <p className="text-xs font-medium mb-5" style={{ color: '#d4af37' }} data-testid={`pricing-anchor-${plan.id}`}>
                  &asymp; {money(perDay(plan, selectedCycle))} a day &middot; {money(perYear(plan, selectedCycle))} a year
                </p>
                <ul className="space-y-2 mb-6 flex-1">
                  {(plan.features || []).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--t3)]">
                      <Check className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                  <li className="flex items-start gap-2 text-sm text-[var(--t3)]" data-testid={`pricing-invited-${plan.id}`}>
                    <Users className="w-4 h-4 text-[#3b82f6] flex-shrink-0 mt-0.5" />
                    <span>People you invite: <strong className="text-[var(--t)]">free</strong> while you&apos;re alive <span className="text-[var(--t5)]">&middot; {money(plan.ben_price)}/mo each to keep access after</span></span>
                  </li>
                </ul>
                <button onClick={() => handleSelect(plan.id)} disabled={checkoutLoading === plan.id}
                  className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                  style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a', border: '1px solid transparent' }}
                  data-testid={`pricing-select-${plan.id}`}>
                  <CreditCard className="w-4 h-4 inline mr-1.5" />
                  {checkoutLoading === plan.id ? 'Loading...' : user ? 'Choose Plan' : 'Start Now'}
                </button>
                <StripeNote className="w-full mt-3" testId={`pricing-stripe-note-${plan.id}`} />
              </div>
            );
          })}
        </div>

        {/* How paying works — the visible checkout path */}
        <div className="rounded-2xl p-5 sm:p-6 mb-6" style={card} data-testid="pricing-how-paying-works">
          <p className="text-sm font-bold text-[var(--t)] mb-4 flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
            <Lock className="w-4 h-4 text-[#10b981]" /> {t('pricing.paying.title')}
          </p>
          <ol className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: ListChecks, title: t('pricing.paying.1.title'), desc: t('pricing.paying.1.desc') },
              { icon: UserPlus, title: t('pricing.paying.2.title'), desc: t('pricing.paying.2.desc') },
              { icon: CreditCard, title: t('pricing.paying.3.title'), desc: t('pricing.paying.3.desc') },
            ].map(({ icon: Icon, title, desc }, i) => (
              <li key={title} className="flex items-start gap-3" data-testid={`pricing-paying-step-${i + 1}`}>
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>{i + 1}</span>
                <div>
                  <p className="text-sm font-bold text-[var(--t)] flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-[#d4af37]" /> {title}</p>
                  <p className="text-[13px] text-[var(--t4)] leading-relaxed">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Value anchor integrated with the price grid (D4.3) */}
        <div className="rounded-xl p-4 mb-12 text-center" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }} data-testid="pricing-value-anchor">
          <p className="text-sm text-[var(--t3)] leading-relaxed">
            For comparison: one hour with an estate attorney typically runs $250&ndash;$500. On annual billing, <strong className="text-[var(--t)]">a full year of any plan above costs less than {attorneyHours === 1 ? 'one hour' : `${attorneyHours} hours`}</strong> &mdash; and your family stays ready every month, not just once.
            <span className="block text-xs text-[var(--t5)] mt-1">{t('pricing.anchor')}</span>
          </p>
        </div>

        {/* Reduced pricing (special tiers) */}
        {specialTiers.length > 0 && (
          <div className="mb-12" id="reduced" data-testid="pricing-special-section">
            <button onClick={() => setShowSpecial(s => !s)} aria-expanded={showSpecial} data-testid="pricing-special-toggle"
              className="w-full rounded-xl p-5 flex items-center justify-between gap-4 text-left transition-colors hover:border-[#d4af37]/40" style={card}>
              <div>
                <p className="text-base font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('pricing.reduced.q')}</p>
                <p className="text-xs text-[var(--t4)] mt-1">
                  {specialTiers.map(p => p.name).join(' \u00b7 ')} &middot; Hospice families: free. Same full platform, verified once.
                </p>
              </div>
              <ChevronDown className={`w-5 h-5 text-[#d4af37] flex-shrink-0 transition-transform ${showSpecial ? 'rotate-180' : ''}`} />
            </button>
            {showSpecial && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4" data-testid="pricing-special-grid">
                {specialTiers.map(plan => {
                  const price = getPrice(plan, selectedCycle);
                  return (
                    <div key={plan.id} className="rounded-xl p-5 flex flex-col" style={card} data-testid={`pricing-plan-${plan.id}`}>
                      <h3 className="text-base font-bold text-[var(--t)] mb-1">{plan.name}</h3>
                      {plan.note && <p className="text-xs text-[var(--t5)] mb-2">{plan.note}</p>}
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="text-2xl font-bold text-[var(--t)]">{money(price)}</span>
                        <span className="text-xs text-[var(--t5)]">/mo</span>
                      </div>
                      <p className="text-xs mb-1" style={{ color: '#d4af37' }}>&asymp; {money(perDay(plan, selectedCycle))} a day</p>
                      <p className="text-xs text-[var(--t4)] mb-4 flex-1">{getTotalLabel(plan, selectedCycle)}{plan.requires_verification ? ' \u00b7 verified once, usually within 24 hours' : ''}</p>
                      <button onClick={() => handleSelect(plan.id)}
                        className="w-full py-2.5 rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(212,175,55,0.1)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.25)' }}
                        data-testid={`pricing-select-${plan.id}`}>
                        {user ? 'Select Plan' : 'Start Now'}
                      </button>
                      <StripeNote className="w-full mt-2.5" testId={`pricing-stripe-note-${plan.id}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Comparison table (D4.2) */}
        {mainTiers.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-bold text-[var(--t)] mb-6 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {t('pricing.compare.title')}
            </h2>
            <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--b)' }}>
              <table className="w-full text-sm" data-testid="pricing-comparison-table">
                <thead>
                  <tr style={{ background: 'var(--s)' }}>
                    <th className="text-left p-3 text-[var(--t4)] font-medium">Feature</th>
                    {mainTiers.map(p => (
                      <th key={p.id} className="p-3 text-center text-[var(--t)] font-bold">{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_ROWS
                    .filter(row => mainTiers.some(p => isEnabled(p.id, row.key)))
                    .map((row) => (
                    <tr key={row.key} style={{ borderTop: '1px solid var(--b)' }} data-testid={`pricing-row-${row.key}`}>
                      <td className="p-3 text-[var(--t3)]">{row.label}</td>
                      {mainTiers.map(p => (
                        <td key={p.id} className="p-3 text-center">
                          {isEnabled(p.id, row.key)
                            ? <Check className="w-4 h-4 text-[#10b981] mx-auto" />
                            : <span className="text-[var(--t5)]">&mdash;</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid var(--b)', background: 'var(--s)' }}>
                    <td className="p-3 text-[var(--t)] font-bold">Invited people while you&apos;re alive</td>
                    {mainTiers.map(p => (
                      <td key={p.id} className="p-3 text-center text-xs font-bold text-[#10b981]">Free</td>
                    ))}
                  </tr>
                  <tr style={{ borderTop: '1px solid var(--b)', background: 'var(--s)' }}>
                    <td className="p-3 text-[var(--t)] font-bold">Invited people after your passing (optional, per person)</td>
                    {mainTiers.map(p => (
                      <td key={p.id} className="p-3 text-center text-xs font-bold text-[var(--t)]">{money(p.ben_price)}/mo</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Decision helper */}
            <div className="mt-6 rounded-xl p-5 text-center" style={card}>
              <p className="text-sm font-bold text-[var(--t)] mb-2">{t('pricing.which.title')}</p>
              <p className="text-xs text-[var(--t4)] leading-relaxed">
                <strong>18&ndash;25?</strong> Start at the New Adult rate.{' '}
                <strong>One household, a few documents?</strong> Base has the essentials.{' '}
                <strong>Want the AI review on your paperwork?</strong> Standard adds Estate Guardian&trade; AI.{' '}
                <strong>Want everything?</strong> Premium unlocks every tool above, including emergency plans and private family messaging.
              </p>
            </div>
          </div>
        )}

        {/* Why this model (D4.4) + effective-price example */}
        <div className="grid lg:grid-cols-[1fr_360px] gap-5 mb-12">
          <div className="rounded-2xl p-6" style={card} data-testid="pricing-why">
            <h2 className="text-lg font-bold text-[var(--t)] mb-3 flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}><HelpCircle className="w-5 h-5 text-[#d4af37]" /> {t('pricing.why.title')}</h2>
            <div className="space-y-3 text-sm text-[var(--t4)] leading-relaxed">
              <p>{renderCopy(t('pricing.why.p1'))}</p>
              <ul className="space-y-2">
                <li className="flex gap-2"><Check className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" /><span><strong className="text-[var(--t)]">Monthly by default.</strong> You never pay for a year of something you&apos;re still exploring. Switch to annual whenever you like and save 20%.</span></li>
                <li className="flex gap-2"><Check className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" /><span><strong className="text-[var(--t)]">Priced by circumstance.</strong> Seniors, military and first responders, veterans, and young adults pay less. Families in hospice pay nothing. Readiness shouldn&apos;t depend on income.</span></li>
                <li className="flex gap-2"><Check className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" /><span><strong className="text-[var(--t)]">No per-person fees while you&apos;re alive.</strong> Invite everyone who should know. Your bill doesn&apos;t change.</span></li>
              </ul>
              <p>{renderCopy(t('pricing.why.p2'))}</p>
            </div>
          </div>
          {standard && (
            <div className="rounded-2xl p-6" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }} data-testid="pricing-example">
              <p className="text-xs font-bold uppercase tracking-wider text-[#3b82f6] mb-3">{t('pricing.example.label')}</p>
              <p className="text-sm text-[var(--t)] font-semibold mb-2">{standard.name} plan, annual billing, spouse + two kids + your attorney invited</p>
              <div className="space-y-1.5 text-sm text-[var(--t4)]">
                <div className="flex justify-between"><span>Your plan ({money(getPrice(standard, 'annual'))}/mo &times; 12)</span><span className="text-[var(--t)] font-medium">{money(perYear(standard, 'annual'))}</span></div>
                <div className="flex justify-between"><span>4 people invited</span><span className="text-[#10b981] font-medium">$0.00</span></div>
                <div className="flex justify-between pt-2 mt-1 font-bold text-[var(--t)]" style={{ borderTop: '1px solid var(--b)' }}><span>Total for the year</span><span data-testid="pricing-example-total">{money(perYear(standard, 'annual'))}</span></div>
              </div>
              <p className="text-xs text-[var(--t5)] mt-3">That&apos;s the whole bill. Nobody else pays anything while you&apos;re here.</p>
            </div>
          )}
        </div>

        {/* Family plan callout */}
        <div className="rounded-2xl p-6 text-center mb-8" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.12)' }}>
          <Users className="w-8 h-8 mx-auto mb-2 text-[#3b82f6]" />
          <h3 className="text-lg font-bold text-[var(--t)] mb-1">{t('pricing.household.title')}</h3>
          <p className="text-sm text-[var(--t4)] max-w-md mx-auto">
            Family Plans let a parent, an adult child, and a sibling each run their own estate under one roof. Set it up from Settings after you subscribe.
            {familyDiscount > 0 && ` Additional account owners save ${familyDiscount}%.`}
          </p>
        </div>

        {/* Hospice */}
        <div className="text-center mb-12">
          <button onClick={() => navigate('/get-started?plan=hospice')} className="text-sm text-[var(--t5)] hover:text-[var(--t4)] underline" data-testid="pricing-hospice-link">
            <Heart className="w-3.5 h-3.5 inline mr-1" />
            Enrolled in certified hospice care? Full access at no cost.
          </button>
        </div>

        {/* Trust footer */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-[var(--t5)] py-8" style={{ borderTop: '1px solid var(--b)' }}>
          <span><Shield className="w-4 h-4 inline mr-1" />{t('pricing.badge1')}</span>
          <span><Check className="w-4 h-4 inline mr-1" />{t('pricing.badge2')}</span>
          <span>{t('pricing.badge3')}</span>
          <a href="/" className="hover:text-[var(--t4)] inline-flex items-center gap-1">Back to homepage <ChevronRight className="w-3 h-3" /></a>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
