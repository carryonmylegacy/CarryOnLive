import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import { Crown, ChevronDown, Shield, Heart, Infinity, Check, Loader2 } from 'lucide-react';
import { toast } from '../utils/toast';

const INSTALLMENT_LABELS = { '1': 'Pay in Full', '3': '3 Payments', '6': '6 Payments', '12': '12 Payments' };

// Tier groups for the lazy-collapse layout. Mirrors landing page +
// main paywall — main tiers are always visible, discount/eligibility
// tiers (FC has new_adult, military, veteran; no hospice / enterprise)
// tuck behind a gold pill.
const FC_MAIN_TIERS = ['premium', 'standard', 'base'];

export default function FoundersCirclePage() {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedSchedule, setSelectedSchedule] = useState('1');
  const [purchasing, setPurchasing] = useState(null);
  const [estates, setEstates] = useState([]);
  const [selectedEstate, setSelectedEstate] = useState('');
  const [discountOpen, setDiscountOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      // Decoupled fetches — a transient failure on one endpoint must NOT
      // hide the other. Previously a Promise.all rejection (e.g. /estates
      // 401 during background-tab return) would skip setActive/setPlans
      // AND surface a 'Could not load Founders Circle plans' toast even
      // when the plans endpoint itself was healthy. A B2B-demo
      // credibility-killer flagged in iter_105.
      try {
        const plansRes = await axios.get(`${API_URL}/founders-circle/plans`);
        setActive(!!plansRes.data.active);
        setPlans(plansRes.data.plans || []);
      } catch (err) {
        // Silent: the page's `!active` empty state will render the
        // graceful "not currently available" message, no toast leak.
        console.warn('FoundersCircle: plans fetch failed', err);
      }
      try {
        const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
        const userEstates = (estatesRes.data || []).filter(e => e.owner_id === user?.id || user?.role === 'admin');
        setEstates(userEstates);
        if (userEstates.length === 1) setSelectedEstate(userEstates[0].id);
      } catch (err) {
        console.warn('FoundersCircle: estates fetch failed', err);
      }
      setLoading(false);
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheckout = async (tier) => {
    if (!selectedEstate) {
      toast.error('Please select an estate');
      return;
    }
    setPurchasing(tier);
    try {
      const res = await axios.post(`${API_URL}/founders-circle/checkout`, {
        estate_id: selectedEstate,
        tier,
        num_payments: parseInt(selectedSchedule),
        origin_url: window.location.origin,
      }, getAuthHeaders());
      if (res.data.url) {
        // replace() — keep FoundersCircle page OUT of browser history
        // before Stripe takes over. Without this, the in-app Back on
        // return bounces to Stripe instead of the user's prior page.
        window.location.replace(res.data.url);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Checkout failed');
    } finally {
      setPurchasing(null);
    }
  };

  // Always-safe Back: paywall pages must NEVER use navigate(-1).
  // After a Stripe round-trip the previous history entry is the
  // checkout.stripe.com URL, and document.referrer is unreliable
  // (cleared after browser-back from a cross-origin page). Hard-coding
  // a known route is the only loop-proof option.
  const handleBack = () => {
    navigate('/subscription', { replace: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-[var(--gold)] animate-spin" />
      </div>
    );
  }

  // Shared header — mirrors SubscriptionPage so Back placement and
  // styling are identical between the two paywalls (no jarring shift
  // in chrome when the user moves between them).
  const Header = ({ title, subtitle }) => (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="text-[var(--t4)] mt-1 text-sm sm:text-base">{subtitle}</p>
        ) : null}
      </div>
      <button
        onClick={handleBack}
        className="px-4 py-2 rounded-lg text-sm font-bold transition-transform hover:scale-105 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
        data-testid="fc-back-button"
      >
        Back
      </button>
    </div>
  );

  if (!active) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in max-w-4xl mx-auto" data-testid="founders-circle-page">
        <Header title="Founders Circle" subtitle="This exclusive program is not currently available." />
        <div className="rounded-xl p-8 flex flex-col items-center justify-center text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          <Crown className="w-12 h-12 text-[var(--t4)] mb-3" />
          <p className="text-sm text-[var(--t3)] max-w-md">Check back soon — we'll announce founding-member windows on the home page and via email.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in max-w-4xl mx-auto" data-testid="founders-circle-page">
      <Header
        title="Founders Circle"
        subtitle="Lock in lifetime access at a fraction of the cost. Limited time offer — ends after Year 1."
      />

      {/* Founding Member badge */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)' }}>
          <Crown className="w-4 h-4 text-[var(--gold)]" />
          <span className="text-xs font-bold text-[var(--gold)] tracking-wide uppercase">Founding Member — Limited Time</span>
        </div>
      </div>

      {/* Value proposition bullets */}
      <div className="grid sm:grid-cols-2 gap-3 mb-8 max-w-2xl mx-auto">
        {[
          { icon: Infinity, text: 'Lifetime access — pay once, use forever' },
          { icon: Heart, text: 'Your beneficiaries get free access — forever' },
          { icon: Shield, text: 'Upgrade your tier anytime — just pay the difference' },
          { icon: Crown, text: 'Founding Member pricing ends after Year 1' },
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
            <item.icon className="w-5 h-5 text-[var(--gold)] flex-shrink-0 mt-0.5" />
            <span className="text-sm text-[var(--t2)]">{item.text}</span>
          </div>
        ))}
      </div>

      {/* Savings example */}
      <div className="rounded-xl p-4 mb-8 text-center" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
        <p className="text-sm text-[var(--t3)]">
          <span className="font-bold text-[var(--gold)]">Example:</span> A 45-year-old Premium subscriber paying $24.99/mo would pay approximately <span className="font-bold text-[var(--t)]">$11,995 over 40 years</span>. A Founders Circle Premium membership paid in full today: <span className="font-bold text-[var(--gold)]">$424</span>. That's a savings of over <span className="font-bold text-[var(--gold)]">$11,500</span> — and your beneficiaries never pay a dime.
        </p>
      </div>

      {/* Estate selector */}
      {estates.length > 1 && (
        <div className="mb-6">
          <label className="block text-sm font-bold text-[var(--t2)] mb-2">Select Estate</label>
          <select
            value={selectedEstate}
            onChange={(e) => setSelectedEstate(e.target.value)}
            className="w-full max-w-sm px-4 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t)' }}
            data-testid="fc-estate-select"
          >
            <option value="">Choose an estate...</option>
            {estates.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      )}

      {/* Payment schedule selector */}
      <div className="flex justify-center gap-2 mb-8 flex-wrap">
        {['1', '3', '6', '12'].map(n => (
          <button
            key={n}
            onClick={() => setSelectedSchedule(n)}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: selectedSchedule === n ? 'var(--gold)' : 'var(--bg2)',
              color: selectedSchedule === n ? '#080e1a' : 'var(--t3)',
              border: `1px solid ${selectedSchedule === n ? 'var(--gold)' : 'var(--b)'}`,
            }}
            data-testid={`fc-schedule-${n}`}
          >
            {INSTALLMENT_LABELS[n]}
            {n === '1' && <span className="ml-1 text-xs opacity-75">Best Value</span>}
          </button>
        ))}
      </div>

      {/* Tier cards — main 3 (Premium / Standard / Base) visible by
          default; eligibility/discount tiers (New Adult, Military,
          Veteran) tuck behind a gold pill. Same renderer for both
          grids → zero card-render regression. */}
      {(() => {
        const mainPlans = plans.filter(p => FC_MAIN_TIERS.includes(p.tier));
        const discountPlans = plans.filter(p => !FC_MAIN_TIERS.includes(p.tier));

        const renderFcCard = (plan) => {
          const inst = plan.installments[selectedSchedule];
          if (!inst) return null;
          const isPremium = plan.tier === 'premium';
          return (
            <div
              key={plan.tier}
              className="rounded-2xl p-5 flex flex-col relative overflow-hidden"
              style={{
                background: isPremium ? 'linear-gradient(135deg, rgba(212,175,55,0.12), rgba(212,175,55,0.03))' : 'var(--bg2)',
                border: isPremium ? '2px solid rgba(212,175,55,0.4)' : '1px solid var(--b)',
              }}
              data-testid={`fc-tier-${plan.tier}`}
            >
              {isPremium && (
                <div className="absolute top-3 right-3">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.2)', color: 'var(--gold)' }}>MOST POPULAR</span>
                </div>
              )}
              <h3 className="text-lg font-bold text-[var(--t)]">{plan.name}</h3>
              <p className="text-xs text-[var(--t4)] mb-4">Lifetime access</p>

              <div className="mb-4">
                {selectedSchedule === '1' ? (
                  <div>
                    <span className="text-3xl font-bold text-[var(--gold)]">${inst.total}</span>
                    <span className="text-sm text-[var(--t4)] ml-1">one-time</span>
                    {inst.discount_percent > 0 && (
                      <p className="text-xs text-[#10b981] mt-1">{inst.discount_percent}% off — save ${plan.lifetime_price - inst.total}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <span className="text-3xl font-bold text-[var(--gold)]">${inst.per_payment}</span>
                    <span className="text-sm text-[var(--t4)] ml-1">/payment</span>
                    <p className="text-xs text-[var(--t4)] mt-1">{inst.num_payments} payments of ${inst.per_payment} = ${inst.total} total</p>
                    {inst.discount_percent > 0 && (
                      <p className="text-xs text-[#10b981]">{inst.discount_percent}% off</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 mb-4">
                <div className="flex items-center gap-2 text-xs text-[var(--t3)]">
                  <Check className="w-3.5 h-3.5 text-[#10b981] flex-shrink-0" />
                  <span>All {plan.name} features — forever</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--t3)] mt-1">
                  <Check className="w-3.5 h-3.5 text-[#10b981] flex-shrink-0" />
                  <span>Beneficiaries access free — forever</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--t3)] mt-1">
                  <Check className="w-3.5 h-3.5 text-[#10b981] flex-shrink-0" />
                  <span>Interest-free payments</span>
                </div>
              </div>

              <button
                onClick={() => handleCheckout(plan.tier)}
                disabled={!!purchasing || !selectedEstate}
                className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
                style={{
                  background: isPremium ? 'linear-gradient(135deg, #d4af37, #b8962e)' : 'var(--bg3)',
                  color: isPremium ? '#080e1a' : 'var(--t)',
                  opacity: (!selectedEstate || purchasing) ? 0.5 : 1,
                }}
                data-testid={`fc-buy-${plan.tier}`}
              >
                {purchasing === plan.tier ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  <>Get {plan.name} — ${selectedSchedule === '1' ? inst.total : `${inst.per_payment}/mo`}</>
                )}
              </button>
            </div>
          );
        };

        return (
          <>
            {/* Main 3 tiers — symmetric 3-up. */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {mainPlans.map(renderFcCard)}
            </div>

            {/* Eligibility pill + collapsible discount tiers. */}
            {discountPlans.length > 0 && (
              <div className="mb-8" data-testid="fc-discount-section">
                <div className="flex justify-center px-2">
                  <button
                    type="button"
                    onClick={() => setDiscountOpen(o => !o)}
                    aria-expanded={discountOpen}
                    aria-controls="fc-discount-tiers"
                    data-testid="fc-eligibility-button"
                    className="rounded-full px-5 py-3 sm:px-6 sm:py-3.5 text-center max-w-3xl transition-transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                    style={{
                      background: 'var(--gold)',
                      border: '2px solid #b89220',
                      boxShadow: '0 0 48px -16px rgba(212,175,55,0.45)',
                    }}
                  >
                    <span
                      className="font-semibold leading-snug inline-flex items-center justify-center gap-2"
                      style={{ color: '#0b1120', fontSize: 'clamp(13px, 1.2vw, 15px)' }}
                    >
                      Eligible for a discount? New adults (18–25), military / first responders, and veterans have dedicated lifetime tiers — {discountOpen ? 'hide' : 'see'} pricing.
                      <ChevronDown
                        className="w-4 h-4 flex-shrink-0 transition-transform"
                        style={{ transform: discountOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      />
                    </span>
                  </button>
                </div>
                <div
                  id="fc-discount-tiers"
                  className="overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out"
                  style={{ maxHeight: discountOpen ? '5000px' : '0px', opacity: discountOpen ? 1 : 0 }}
                  aria-hidden={!discountOpen}
                >
                  <p className="text-center text-[11px] uppercase tracking-[0.18em] mt-5 mb-4" style={{ color: 'var(--gold)' }}>
                    Dedicated lifetime tiers · same Founders Circle benefits · eligibility verified after subscribe
                  </p>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {discountPlans.map(renderFcCard)}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* Fine print */}
      <div className="text-center text-xs text-[var(--t4)] max-w-2xl mx-auto space-y-1">
        <p>Founders Circle is per estate. Prices shown in USD. Interest-free installments are charged monthly via Stripe.</p>
        <p>Beneficiaries linked to your estate get free lifetime access at your tier level — current and future.</p>
        <p>Upgrade your tier during the campaign by paying the difference. After Year 1, your lifetime tier becomes your permanent floor.</p>
      </div>
    </div>
  );
}
