/**
 * LandingPricing — live pricing block for the public marketing landing.
 *
 * Pulls plan data from the same endpoints the in-app paywall uses:
 *   GET /api/subscriptions/plans         (tiered monthly/quarterly/annual)
 *   GET /api/founders-circle/plans       (lifetime + installments)
 *
 * Whatever you adjust in the Founder Admin → Subscriptions tab is reflected
 * here immediately. No more hardcoded marketing prices that drift from the
 * source of truth.
 *
 * Public visitors can't checkout (Stripe needs an account), so every CTA
 * routes to /signup. Once signed in, the in-app SubscriptionPaywall takes
 * over with the same data + Stripe / Apple-IAP rails.
 */
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Check, Loader2, Crown, Star, Shield, Award, Heart, Sparkles, Sun, ChevronDown } from 'lucide-react';
import { API_URL } from '../../config';
import { recordFunnelEvent } from '../../utils/funnelTelemetry';

const TIER_ICON = {
  premium: Crown,
  standard: Star,
  base: Shield,
  new_adult: Award,
  military: Shield,
  veteran: Shield,
  seniors: Sun,
  hospice: Heart,
};

const TIER_ACCENT = {
  premium: '#d4af37',
  standard: '#60A5FA',
  base: '#22C993',
  new_adult: '#B794F6',
  military: '#F59E0B',
  veteran: '#F59E0B',
  seniors: '#FBBF24',
  hospice: '#ec4899',
};

// Tiers we show on the public landing page. Eligibility-gated tiers
// (new_adult age-verified, military, hospice, veteran) live behind their
// own qualification flow inside the paywall, so we keep the public
// landing focused on the three any-visitor tiers + Founders Circle.
const PUBLIC_TIERS = ['premium', 'standard', 'base'];

// Eligibility-gated discount tiers, revealed when the visitor opens the
// "Eligible for a discount?" button. Pricing and features come from the
// same /api/subscriptions/plans response the in-app paywall uses.
const ELIGIBILITY_TIERS = ['military', 'veteran', 'hospice', 'seniors', 'new_adult'];

const ELIGIBILITY_BLURB = {
  new_adult: 'Ages 18–25 — government ID verified at signup.',
  seniors: 'Ages 65+ — government ID verified at signup.',
  military: 'Active military / first responders — verified at signup.',
  veteran: 'Veterans — verified at signup.',
  hospice: 'Hospice patients & immediate family — verified at signup.',
};

const fmt = (n) => {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  return v % 1 === 0 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`;
};

export default function LandingPricing() {
  const [plans, setPlans] = useState([]);
  const [eligibilityPlans, setEligibilityPlans] = useState([]);
  const [tierFeatures, setTierFeatures] = useState({});
  const [fc, setFc] = useState(null);
  const [billing, setBilling] = useState('annual'); // monthly | quarterly | annual
  const [loading, setLoading] = useState(true);
  const [discountOpen, setDiscountOpen] = useState(false);
  const discountRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      axios.get(`${API_URL}/subscriptions/plans`),
      axios.get(`${API_URL}/founders-circle/plans`).catch(() => ({ data: { active: false, plans: [] } })),
    ])
      .then(([plansRes, fcRes]) => {
        if (cancelled) return;
        const all = plansRes.data.plans || [];
        const visible = all.filter((p) => PUBLIC_TIERS.includes(p.id));
        // Canonical order: premium → standard → base (high-to-low) so
        // the user's eye lands on the most-recommended tier first.
        visible.sort((a, b) => PUBLIC_TIERS.indexOf(a.id) - PUBLIC_TIERS.indexOf(b.id));
        setPlans(visible);
        const eligible = all.filter((p) => ELIGIBILITY_TIERS.includes(p.id));
        eligible.sort((a, b) => ELIGIBILITY_TIERS.indexOf(a.id) - ELIGIBILITY_TIERS.indexOf(b.id));
        setEligibilityPlans(eligible);
        setTierFeatures(plansRes.data.tier_features || {});
        setFc(fcRes.data?.active ? fcRes.data : null);
      })
      .catch(() => { /* show fallback empty state */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Safari's automatic "scroll anchoring" sometimes misfires when the
  // discount section's max-height transitions from 0 → 4000px, snapping
  // the page to the top instead of leaving the user where they clicked.
  // We disable scroll-anchoring on the container (CSS rule below) and
  // only nudge the viewport AFTER the height transition completes, AND
  // only if the section's bottom is below the fold AND its top is on-
  // screen. The `block: 'nearest'` keeps the move minimal.
  useEffect(() => {
    if (!discountOpen || !discountRef.current) return;
    const t = setTimeout(() => {
      const el = discountRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewH = window.innerHeight || 0;
      // Only scroll if the section opens BELOW the fold AND its top is
      // already visible. If the user clicked the button while it was
      // anywhere in their current viewport, we leave their scroll alone.
      const offBottom = rect.bottom > viewH;
      const topVisible = rect.top >= 0 && rect.top < viewH;
      if (offBottom && topVisible) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 540); // a hair after the 500ms max-height transition completes
    return () => clearTimeout(t);
  }, [discountOpen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="landing-pricing-loading">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--gold)' }} />
        <span className="ml-3 text-sm" style={{ color: 'var(--t4)' }}>Loading current pricing…</span>
      </div>
    );
  }

  if (!plans.length) {
    return (
      <div className="text-center py-16 text-sm" style={{ color: 'var(--t4)' }} data-testid="landing-pricing-empty">
        Pricing temporarily unavailable. Please <Link to="/signup" className="underline" style={{ color: 'var(--gold)' }}>create your account</Link> and we'll show full plan details inside.
      </div>
    );
  }

  const billingPriceField = {
    monthly: 'price',
    quarterly: 'quarterly_price',
    annual: 'annual_price',
  }[billing];
  const billingCadenceLabel = {
    monthly: '/ mo',
    quarterly: '/ mo · billed quarterly',
    annual: '/ mo · billed annually',
  }[billing];

  const fcPremium = fc?.plans?.find((p) => p.tier === 'premium');

  // Renders a single tier card (used by both the main 3 public tiers and
  // the 4 eligibility-gated discount tiers). Pulls features straight from
  // the founder admin's per-tier feature_gates config so prices AND the
  // checked-feature list stay in sync with the in-app paywall.
  const renderTierCard = (p, opts = {}) => {
    const { highlightId = 'premium', source = 'pricing', showBilling = true } = opts;
    const Icon = TIER_ICON[p.id] || Shield;
    const accent = TIER_ACCENT[p.id] || 'var(--gold)';
    const highlighted = p.id === highlightId;
    const price = p[billingPriceField] ?? p.price;
    const features = (tierFeatures[p.id] || []).filter((f) => f.enabled).slice(0, 7);
    const fallbackFeatures = p.features || [];
    const blurb = ELIGIBILITY_BLURB[p.id];

    return (
      <div
        key={p.id}
        className="rounded-2xl p-6 flex flex-col"
        style={{
          background: highlighted
            ? 'linear-gradient(180deg, rgba(212,175,55,0.08), var(--card))'
            : 'var(--card)',
          border: highlighted ? '1.5px solid rgba(212,175,55,0.4)' : '1px solid var(--b)',
          boxShadow: highlighted ? '0 0 32px -16px rgba(212,175,55,0.3)' : 'none',
        }}
        data-testid={`landing-tier-${p.id}`}
      >
        {highlighted && (
          <div className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--gold)' }}>
            Most popular
          </div>
        )}
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4" style={{ color: accent }} />
          <h3 className="text-white font-semibold text-lg" style={{ fontFamily: 'var(--sans)' }}>{p.name}</h3>
        </div>
        <div className="mb-3 flex items-baseline gap-1">
          <span className="text-3xl font-bold text-white" style={{ fontFamily: 'var(--serif)' }}>
            {fmt(price)}
          </span>
          {showBilling && (
            <span className="text-sm" style={{ color: 'var(--t5)' }}>{billingCadenceLabel}</span>
          )}
        </div>
        {blurb && (
          <p className="text-sm mb-3" style={{ color: 'var(--t5)' }}>{blurb}</p>
        )}
        {p.note && !blurb && (
          <p className="text-sm mb-3 italic" style={{ color: 'var(--t5)' }}>{p.note}</p>
        )}
        <ul className="space-y-2.5 mb-6 flex-1" data-testid={`landing-tier-${p.id}-features`}>
          {(features.length ? features.map((f) => f.label) : fallbackFeatures).map((label) => (
            <li key={label} className="flex items-start gap-2 text-sm" style={{ color: 'var(--t3)' }}>
              <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: accent }} /> {label}
            </li>
          ))}
        </ul>
        <Link
          to="/signup"
          onClick={() => recordFunnelEvent({ event: 'landing_cta_click', meta: { source: `${source}-${p.id}`, billing } })}
          className={
            highlighted
              ? 'w-full py-3 text-sm font-semibold rounded-xl btn-gold-cta text-center'
              : 'w-full py-3 text-sm font-semibold rounded-xl text-center transition-colors'
          }
          style={highlighted ? {} : { background: 'transparent', border: '1px solid var(--b)', color: 'var(--t2)', display: 'block' }}
          data-testid={`landing-tier-${p.id}-cta`}
        >
          Start 30-day free trial
        </Link>
      </div>
    );
  };

  return (
    <div data-testid="landing-pricing-live">
      {/* Billing cadence toggle */}
      <div className="flex justify-center mb-10">
        <div
          className="inline-flex p-1 rounded-full"
          style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
          role="tablist"
          aria-label="Billing cadence"
        >
          {['monthly', 'quarterly', 'annual'].map((opt) => (
            <button
              key={opt}
              onClick={() => setBilling(opt)}
              className="px-4 sm:px-5 py-1.5 rounded-full text-sm font-semibold capitalize transition-colors"
              style={{
                background: billing === opt ? 'var(--gold)' : 'transparent',
                color: billing === opt ? '#0b1120' : 'var(--t3)',
              }}
              data-testid={`landing-billing-${opt}`}
            >
              {opt}
              {opt === 'annual' && <span className="ml-1 text-[22px] opacity-80">save</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Tier cards (live data) */}
      <div className="grid sm:grid-cols-3 gap-4">
        {plans.map((p) => renderTierCard(p, { source: 'pricing' }))}
      </div>

      {/* Eligibility discount button — clickable; slides down 4 dedicated tier cards */}
      <div className="flex justify-center mt-10 mb-2 px-2">
        <button
          type="button"
          onClick={() => {
            const next = !discountOpen;
            setDiscountOpen(next);
            recordFunnelEvent({
              event: next ? 'landing_discount_open' : 'landing_discount_close',
              meta: { source: 'eligibility-pill' },
            });
          }}
          aria-expanded={discountOpen}
          aria-controls="landing-discount-tiers"
          data-testid="landing-eligibility-button"
          className="rounded-full px-5 py-3 sm:px-6 sm:py-3.5 text-center max-w-3xl transition-transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          style={{
            background: 'var(--gold)',
            border: '2px solid #b89220',
            boxShadow: '0 0 48px -16px rgba(212,175,55,0.45)',
          }}
        >
          <span
            className="font-semibold leading-snug inline-flex items-center justify-center gap-2"
            style={{
              color: '#0b1120',
              fontSize: 'clamp(14px, 1.3vw, 16px)',
              fontFamily: 'var(--serif)',
            }}
          >
            Eligible for a discount? Military / First Responders, Veterans, Hospice patients, Seniors (65+), and New adults (18–25) have dedicated tiers — {discountOpen ? 'hide' : 'see'} pricing.
            <ChevronDown
              className="w-4 h-4 flex-shrink-0 transition-transform"
              style={{ transform: discountOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </span>
        </button>
      </div>

      {/* Discount tiers — collapsible, smooth height transition.
          `overflow-anchor: none` disables Safari/Chrome scroll anchoring
          on this container so growing from 0 → 4000px never snaps the
          viewport to the top of the page. */}
      <div
        id="landing-discount-tiers"
        ref={discountRef}
        data-testid="landing-discount-tiers"
        className="overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out"
        style={{
          maxHeight: discountOpen ? '4000px' : '0px',
          opacity: discountOpen ? 1 : 0,
          overflowAnchor: 'none',
        }}
        aria-hidden={!discountOpen}
      >
        <div className="pt-8 pb-2">
          {eligibilityPlans.length === 0 ? (
            <p className="text-center text-sm" style={{ color: 'var(--t5)' }} data-testid="landing-discount-empty">
              Discount tiers temporarily unavailable. Please <Link to="/signup" className="underline" style={{ color: 'var(--gold)' }}>create your account</Link> — eligibility is verified inside the app.
            </p>
          ) : (
            <>
              <p className="text-center text-sm uppercase tracking-[0.18em] mb-4" style={{ color: 'var(--gold)' }}>
                Dedicated tiers · same pricing engine · same features
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {eligibilityPlans.map((p) => renderTierCard(p, { source: 'discount', highlightId: null }))}
              </div>
              <p className="text-center text-[22px] italic mt-5 max-w-2xl mx-auto" style={{ color: 'var(--t5)' }}>
                Eligibility is verified after signup (DOD ID, hospice attestation, government ID).
                You'll see the matching discounted plan automatically.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Founders Circle — Lifetime */}
      {fc && fcPremium && (
        <div className="mt-14" data-testid="landing-founders-circle">
          <div
            className="rounded-3xl p-7 sm:p-10 relative overflow-hidden"
            style={{
              background:
                'radial-gradient(ellipse at top left, rgba(212,175,55,0.18), transparent 60%), radial-gradient(ellipse at bottom right, rgba(96,165,250,0.10), transparent 60%), var(--card)',
              border: '1.5px solid rgba(212,175,55,0.35)',
              boxShadow: '0 0 64px -32px rgba(212,175,55,0.4)',
            }}
          >
            <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8 items-center relative">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm mb-4" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', color: 'var(--gold)' }}>
                  <Sparkles className="w-3 h-3" /> Founders Circle · Lifetime
                </div>
                <h3 className="text-2xl sm:text-3xl font-semibold leading-tight mb-3 text-white" style={{ fontFamily: 'var(--serif)' }}>
                  Pay once. Carry on <span className="italic" style={{ color: 'var(--gold)' }}>forever</span>.
                </h3>
                <p className="text-sm mb-5 max-w-md" style={{ color: 'var(--t3)' }}>
                  A small thank-you to the families who join us at the start. Lifetime Premium access, every feature we ever ship, no recurring fees ever. Limited campaign — when the seats run out, the door closes.
                </p>
                <ul className="space-y-2 mb-6 text-sm" style={{ color: 'var(--t3)' }}>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} /> Lifetime access to Premium — every current + future feature.</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} /> Pay in full or split into installments. Discounts for shorter terms.</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} /> Listed in our Founders Circle — your name carried with the platform.</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} /> If you pass during an active installment plan, the lifetime is honored.</li>
                </ul>
              </div>

              <div
                className="rounded-2xl p-6"
                style={{ background: 'rgba(11,18,32,0.6)', border: '1px solid rgba(212,175,55,0.25)', backdropFilter: 'blur(12px)' }}
              >
                <p className="text-sm uppercase tracking-wider mb-2" style={{ color: 'var(--gold)' }}>Premium · One-time</p>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl font-bold text-white" style={{ fontFamily: 'var(--serif)' }}>
                    {fmt(fcPremium.installments?.['1']?.total ?? fcPremium.lifetime_price)}
                  </span>
                  <span className="text-sm line-through" style={{ color: 'var(--t5)' }}>
                    {fmt(fcPremium.lifetime_price)}
                  </span>
                </div>
                <p className="text-sm mb-4" style={{ color: 'var(--t4)' }}>
                  {fcPremium.installments?.['1']?.discount_percent
                    ? `Pay-in-full saves ${fcPremium.installments['1'].discount_percent}%.`
                    : 'Pay-in-full.'}
                </p>
                <div className="space-y-1 text-sm mb-5" style={{ color: 'var(--t3)' }}>
                  {[3, 6, 12].map((n) => {
                    const inst = fcPremium.installments?.[String(n)];
                    if (!inst) return null;
                    return (
                      <div key={n} className="flex items-center justify-between" data-testid={`fc-installment-${n}`}>
                        <span>{n} payments</span>
                        <span style={{ color: 'var(--t)' }}>
                          <strong>{fmt(inst.per_payment)}</strong>
                          <span className="text-sm ml-1" style={{ color: 'var(--t5)' }}>/ mo</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <Link
                  to="/signup"
                  onClick={() => recordFunnelEvent({ event: 'landing_cta_click', meta: { source: 'founders-circle' } })}
                  className="block w-full py-3 text-sm font-semibold rounded-xl btn-gold-cta text-center"
                  data-testid="landing-fc-cta"
                >
                  Claim my Founders Circle seat
                </Link>
                <p className="text-[22px] text-center mt-3" style={{ color: 'var(--t5)' }}>
                  Activated after account creation. Visible inside Subscriptions.
                </p>
              </div>
            </div>
          </div>

          {/* Other tiers' lifetime prices, compact */}
          {fc.plans.length > 1 && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm" style={{ color: 'var(--t4)' }}>
              <span style={{ color: 'var(--t5)' }}>Founders Circle also available for:</span>
              {fc.plans
                .filter((p) => p.tier !== 'premium')
                .map((p) => (
                  <span key={p.tier} data-testid={`fc-other-${p.tier}`}>
                    <span style={{ color: 'var(--t3)' }}>{p.name}</span>{' '}
                    <span style={{ color: 'var(--gold)' }}>{fmt(p.lifetime_price)}</span>
                  </span>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
