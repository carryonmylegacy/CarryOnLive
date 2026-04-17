import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import { Crown, ChevronLeft, ChevronRight, Shield, Heart, Infinity, Check, Loader2 } from 'lucide-react';
import { toast } from '../utils/toast';

const INSTALLMENT_LABELS = { '1': 'Pay in Full', '3': '3 Payments', '6': '6 Payments', '12': '12 Payments' };

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

  useEffect(() => {
    const load = async () => {
      try {
        const [plansRes, estatesRes] = await Promise.all([
          axios.get(`${API_URL}/founders-circle/plans`),
          axios.get(`${API_URL}/estates`, getAuthHeaders()),
        ]);
        setActive(plansRes.data.active);
        setPlans(plansRes.data.plans || []);
        const userEstates = (estatesRes.data || []).filter(e => e.owner_id === user?.id || user?.role === 'admin');
        setEstates(userEstates);
        if (userEstates.length === 1) setSelectedEstate(userEstates[0].id);
      } catch {
        toast.error('Could not load Founders Circle plans');
      } finally {
        setLoading(false);
      }
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
        window.location.href = res.data.url;
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Checkout failed');
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-[var(--gold)] animate-spin" />
      </div>
    );
  }

  if (!active) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <Crown className="w-12 h-12 text-[var(--t4)] mb-4" />
        <h1 className="text-2xl font-bold text-[var(--t)]">Founders Circle</h1>
        <p className="text-[var(--t4)] mt-2">This exclusive program is not currently available.</p>
        <button onClick={() => navigate(-1)} className="mt-6 px-6 py-2 rounded-lg text-sm font-bold" style={{ background: 'var(--bg3)', color: 'var(--t)' }}>Go Back</button>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 pb-24 lg:pb-8 max-w-5xl mx-auto animate-fade-in" data-testid="founders-circle-page">
      {/* Back button */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-[var(--t4)] mb-6 hover:text-[var(--t)]">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      {/* Hero */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)' }}>
          <Crown className="w-4 h-4 text-[var(--gold)]" />
          <span className="text-xs font-bold text-[var(--gold)] tracking-wide uppercase">Founding Member — Limited Time</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
          Founders Circle
        </h1>
        <p className="text-[var(--t4)] mt-2 text-base max-w-2xl mx-auto">
          Lock in lifetime access to CarryOn at a fraction of the cost. This exclusive offer disappears after our first year.
        </p>
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

      {/* Tier cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {plans.map(plan => {
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
        })}
      </div>

      {/* Fine print */}
      <div className="text-center text-xs text-[var(--t4)] max-w-2xl mx-auto space-y-1">
        <p>Founders Circle is per estate. Prices shown in USD. Interest-free installments are charged monthly via Stripe.</p>
        <p>Beneficiaries linked to your estate get free lifetime access at your tier level — current and future.</p>
        <p>Upgrade your tier during the campaign by paying the difference. After Year 1, your lifetime tier becomes your permanent floor.</p>
      </div>
    </div>
  );
}
