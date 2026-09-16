import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, Check, Users, ChevronRight, CreditCard, Heart,
} from 'lucide-react';
import { API_URL } from '../config';
import { TrustBadges } from '../components/landing/TrustBadges';

const CYCLE_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' };
const CYCLE_SAVINGS = { monthly: null, quarterly: 'Save 10%', annual: 'Save 20%' };

const PricingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [familyDiscount, setFamilyDiscount] = useState(0);
  const [checkoutLoading, setCheckoutLoading] = useState(null);

  useEffect(() => { fetchPlans(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPlans = async () => {
    try {
      const res = await axios.get(`${API_URL}/subscriptions/plans`);
      setPlans((res.data.plans || []).filter(p => p.price > 0 && p.id !== 'enterprise'));
      setFamilyDiscount(res.data.family_benefactor_discount_percent || 0);
    } catch { /* silent */ }
    setLoading(false);
  };

  const getPrice = (plan, cycle) => {
    if (cycle === 'quarterly') return plan.quarterly_price || (plan.price * 0.9).toFixed(2);
    if (cycle === 'annual') return plan.annual_price || (plan.price * 0.8).toFixed(2);
    return plan.price;
  };

  const getTotalLabel = (plan, cycle) => {
    const mp = parseFloat(getPrice(plan, cycle));
    if (cycle === 'quarterly') return `$${(mp * 3).toFixed(2)} billed every 3 months`;
    if (cycle === 'annual') return `$${(mp * 12).toFixed(2)} billed annually`;
    return 'Billed monthly';
  };

  const handleSelect = async (planId) => {
    if (!user) { navigate(`/start`); return; }
    setCheckoutLoading(planId);
    try {
      const token = localStorage.getItem('carryon_token');
      const res = await axios.post(`${API_URL}/subscriptions/create-checkout`, {
        plan_id: planId, billing_cycle: selectedCycle, origin_url: window.location.origin,
      }, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data.url) window.location.href = res.data.url;
    } catch { /* silent */ }
    setCheckoutLoading(null);
  };

  const mainTiers = plans.filter(p => ['premium', 'standard', 'base'].includes(p.id));
  const specialTiers = plans.filter(p => !['premium', 'standard', 'base', 'hospice', 'enterprise'].includes(p.id));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const lowestPrice = mainTiers.length > 0 ? Math.min(...mainTiers.map(p => p.price)).toFixed(2) : '7.99';
  const pricingJsonLd = plans.length > 0 ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "CarryOn Pricing",
    "description": "Simple, transparent pricing for family preparedness. Base, Standard, and Premium plans with special pricing for military, veterans, and hospice.",
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
            "priceSpecification": {
              "@type": "UnitPriceSpecification",
              "price": p.price,
              "priceCurrency": "USD",
              "unitText": "MONTH"
            },
            "availability": "https://schema.org/InStock"
          } : {
            "@type": "Offer",
            "price": 0,
            "priceCurrency": "USD",
            "availability": "https://schema.org/InStock",
            "description": "Free with verification"
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
    <div className="min-h-screen" style={{ background: 'var(--bg)' }} data-testid="pricing-page">
      <Helmet>
        <title>Pricing - CarryOn Family Preparedness Platform</title>
        <meta name="description" content={`Simple, transparent pricing for family preparedness. Plans from $${lowestPrice} to $${mainTiers.length > 0 ? Math.max(...mainTiers.map(p => p.price)).toFixed(2) : '24.99'} per month with free hospice access and military discounts. Cancel anytime.`} />
        <link rel="canonical" href="https://carryon.us/pricing" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="CarryOn Pricing - Simple, Transparent Plans" />
        <meta property="og:description" content="Choose from Base, Standard, or Premium plans. Special pricing for military, veterans, and young adults. Cancel anytime." />
        <meta property="og:url" content="https://carryon.us/pricing" />
        <meta property="og:site_name" content="CarryOn" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="CarryOn Pricing - Family Preparedness Plans" />
        <meta name="twitter:description" content={`Plans from $${lowestPrice}/mo. Secure your family's future.`} />
      </Helmet>
      {pricingJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: pricingJsonLd }} />
      )}
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-4" style={{ borderBottom: '1px solid var(--b)' }}>
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <Shield className="w-6 h-6 text-[#d4af37]" />
          <span className="text-lg font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>CarryOn</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/start')} className="text-sm text-[#d4af37] font-medium hover:underline">Get Started</button>
          <button onClick={() => navigate('/login')} className="text-sm text-[var(--t4)] hover:text-[var(--t)]">Sign In</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 sm:py-20">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--t)] mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Simple, transparent pricing
          </h1>
          <p className="text-base sm:text-lg text-[var(--t4)] max-w-lg mx-auto mb-4">
            Explore first with no card. Cancel anytime. Your data is yours alone.
          </p>
          <TrustBadges tone="app" testIdSuffix="-pricing" className="mb-6" />
          {/* Value anchor (D4.3) */}
          <div className="max-w-2xl mx-auto rounded-xl p-4" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}>
            <p className="text-sm text-[var(--t3)] leading-relaxed">
              Less than the cost of one hour with an estate attorney &mdash; and your family stays ready every month, not just once.
              <span className="block text-xs text-[var(--t5)] mt-1">Settling an estate without organized records takes an average of 570 hours. CarryOn starts at ${lowestPrice}/month.</span>
            </p>
          </div>
        </div>

        {/* Billing cycle toggle */}
        <div className="flex items-center justify-center gap-1 mb-10 p-1.5 rounded-xl mx-auto w-fit" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
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
                <span className="absolute -top-2.5 -right-2 text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-[#10b981] text-white whitespace-nowrap">
                  {CYCLE_SAVINGS[cycle]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Main plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {mainTiers.map(plan => {
            const price = getPrice(plan, selectedCycle);
            const isPopular = plan.id === 'standard' || plan.id === 'premium';
            return (
              <div key={plan.id} className="rounded-2xl p-6 relative overflow-hidden transition-all hover:scale-[1.02]"
                style={{
                  background: isPopular ? 'rgba(212,175,55,0.04)' : 'var(--s)',
                  border: `2px solid ${isPopular ? 'rgba(212,175,55,0.3)' : 'var(--b)'}`,
                }}
                data-testid={`pricing-plan-${plan.id}`}>
                {isPopular && plan.id === 'premium' && (
                  <div className="absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[10px] font-bold" style={{ background: '#d4af37', color: '#080e1a' }}>
                    Most Popular
                  </div>
                )}
                <h3 className="text-xl font-bold text-[var(--t)] mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-bold text-[var(--t)]">${parseFloat(price).toFixed(2)}</span>
                  <span className="text-sm text-[var(--t5)]">/mo</span>
                </div>
                <p className="text-xs text-[var(--t5)] mb-5">{getTotalLabel(plan, selectedCycle)}</p>
                <ul className="space-y-2 mb-6">
                  {(plan.features || []).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--t3)]">
                      <Check className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                  <li className="flex items-start gap-2 text-sm text-[var(--t3)]">
                    <Users className="w-4 h-4 text-[#3b82f6] flex-shrink-0 mt-0.5" />
                    Beneficiaries: ${plan.ben_price}/mo each
                  </li>
                </ul>
                <button onClick={() => handleSelect(plan.id)} disabled={checkoutLoading === plan.id}
                  className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                  style={{
                    background: 'linear-gradient(135deg, #d4af37, #F0C95C)',
                    color: '#080e1a',
                    border: '1px solid transparent',
                  }}
                  data-testid={`pricing-select-${plan.id}`}>
                  <CreditCard className="w-4 h-4 inline mr-1.5" />
                  {checkoutLoading === plan.id ? 'Loading...' : 'Choose Plan'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Special pricing */}
        {specialTiers.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xl font-bold text-[var(--t)] mb-4 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Special Pricing
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {specialTiers.map(plan => {
                const price = getPrice(plan, selectedCycle);
                return (
                  <div key={plan.id} className="rounded-xl p-5 flex flex-col" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                    <h3 className="text-base font-bold text-[var(--t)] mb-1">{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mb-3">
                      <span className="text-2xl font-bold text-[var(--t)]">${parseFloat(price).toFixed(2)}</span>
                      <span className="text-xs text-[var(--t5)]">/mo</span>
                    </div>
                    <p className="text-xs text-[var(--t4)] mb-4 flex-1">{getTotalLabel(plan, selectedCycle)}</p>
                    <button onClick={() => handleSelect(plan.id)}
                      className="w-full py-2.5 rounded-lg text-xs font-bold"
                      style={{ background: 'rgba(212,175,55,0.1)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.25)' }}>
                      Select Plan
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Comparison table (D4.2) */}
        {mainTiers.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xl font-bold text-[var(--t)] mb-6 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Compare Plans
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
                  {[
                    { label: 'Secure Document Vault', tiers: { base: 'Basic', standard: 'Expanded', premium: 'Unlimited' } },
                    { label: 'Immediate Action Checklist', tiers: { base: true, standard: true, premium: true } },
                    { label: 'Milestone Messages', tiers: { base: false, standard: true, premium: true } },
                    { label: 'Estate Guardian AI Analysis', tiers: { base: false, standard: true, premium: true } },
                    { label: 'Contingency Protocols', tiers: { base: false, standard: true, premium: true } },
                    { label: 'Estate Communications Tool', tiers: { base: false, standard: true, premium: true } },
                    { label: 'Digital Access Vault', tiers: { base: true, standard: true, premium: true } },
                    { label: 'Financial Portal', tiers: { base: true, standard: true, premium: true } },
                    { label: 'Beneficiary Limit', tiers: { base: 'Up to 3', standard: 'Up to 5', premium: 'Unlimited' } },
                    { label: 'Priority Support', tiers: { base: false, standard: false, premium: true } },
                  ].map((row, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--b)' }}>
                      <td className="p-3 text-[var(--t3)]">{row.label}</td>
                      {mainTiers.map(p => {
                        const val = row.tiers[p.id];
                        return (
                          <td key={p.id} className="p-3 text-center">
                            {val === true ? <Check className="w-4 h-4 text-[#10b981] mx-auto" /> :
                             val === false ? <span className="text-[var(--t5)]">&mdash;</span> :
                             <span className="text-xs text-[var(--t3)] font-medium">{val}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid var(--b)', background: 'var(--s)' }}>
                    <td className="p-3 text-[var(--t)] font-bold">Per beneficiary add-on</td>
                    {mainTiers.map(p => (
                      <td key={p.id} className="p-3 text-center text-xs font-bold text-[var(--t)]">${p.ben_price}/mo</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Decision helper */}
            <div className="mt-6 rounded-xl p-5 text-center" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              <p className="text-sm font-bold text-[var(--t)] mb-2">Which plan is right for you?</p>
              <p className="text-xs text-[var(--t4)] leading-relaxed">
                <strong>New adult or student?</strong> Start at the New Adult rate.{' '}
                <strong>Single family household?</strong> Base has the essentials.{' '}
                <strong>Want AI analysis and messages?</strong> Standard unlocks the full platform.{' '}
                <strong>Blended family or multi-estate?</strong> Premium gives unlimited beneficiaries and priority support.
              </p>
            </div>
          </div>
        )}

        {/* Family plan callout */}
        <div className="rounded-2xl p-6 text-center mb-8" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.12)' }}>
          <Users className="w-8 h-8 mx-auto mb-2 text-[#3b82f6]" />
          <h3 className="text-lg font-bold text-[var(--t)] mb-1">Family Plans</h3>
          <p className="text-sm text-[var(--t4)] max-w-md mx-auto">
            Add family members as beneficiaries at reduced per-person rates. Quarterly and annual billing offers additional savings.
            {familyDiscount > 0 && ` Family members save an additional ${familyDiscount}%.`}
          </p>
        </div>

        {/* Hospice */}
        <div className="text-center mb-12">
          <button onClick={() => navigate('/get-started?plan=hospice')} className="text-sm text-[var(--t5)] hover:text-[var(--t4)] underline">
            <Heart className="w-3.5 h-3.5 inline mr-1" />
            Enrolled in certified hospice care? Full access at no cost.
          </button>
        </div>

        {/* Trust footer */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-[var(--t5)] py-8" style={{ borderTop: '1px solid var(--b)' }}>
          <span><Shield className="w-4 h-4 inline mr-1" />AES-256 Encryption</span>
          <span><Check className="w-4 h-4 inline mr-1" />Cancel Anytime</span>
          <span>Your Data Is Yours Alone</span>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
