import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { SEO } from '../components/SEO';
import { API_URL } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { useCopy } from '../copy/CopyContext';
import { recordFunnelEvent } from '../utils/funnelTelemetry';
import { startPlanCheckout } from '../utils/stripeRedirect';
import { ProductPreview } from '../components/landing/ProductPreview';
import { BenefactorNav, BenefactorHero, BenefactorProblem } from '../components/benefactor/BenefactorHero';
import { BenefactorPayoff, BenefactorMessages, BenefactorTrust } from '../components/benefactor/BenefactorStory';
import { BenefactorPrice } from '../components/benefactor/BenefactorPrice';
import { BenefactorFaq, BenefactorFinal, BenefactorFooter } from '../components/benefactor/BenefactorClose';

/* Paid-traffic landing page. One job: turn a cold visitor into a benefactor. Not linked from the site
 * navigation and not indexed — send ads here. `?v=all` shows all three plans instead of Premium only. */
export default function BenefactorPage() {
  const { t } = useCopy();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const variant = searchParams.get('v') === 'all' ? 'all' : 'single';
  const [plans, setPlans] = useState([]);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Attribution: same stash /start uses, so the signup payload carries the ad's UTM parameters.
    const utm = {};
    for (const [k, v] of searchParams.entries()) if (k.startsWith('utm_') || k === 'ref') utm[k] = v;
    if (Object.keys(utm).length) sessionStorage.setItem('carryon_utm', JSON.stringify(utm));
    recordFunnelEvent({ event: 'landing_view', meta: { page: 'benefactor', variant } });
    axios.get(`${API_URL}/subscriptions/plans`).then(r => setPlans((r.data?.plans || []).filter(p => p.price > 0))).catch(() => {});
    axios.get(`${API_URL}/public/site-content`).then(r => { if (r.data?.trial_days) setDays(r.data.trial_days); }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const utmQuery = () => {
    const q = new URLSearchParams();
    for (const [k, v] of searchParams.entries()) if (k.startsWith('utm_') || k === 'ref') q.set(k, v);
    return q.toString();
  };

  const go = async (planId, location) => {
    recordFunnelEvent({ event: 'landing_cta_click', meta: { page: 'benefactor', variant, location, plan: planId } });
    if (user) {
      if (location === 'hero' || location === 'final') { navigate('/dashboard'); return; }
      setBusy(true);
      try {
        const plan = plans.find(p => p.id === planId);
        const result = await startPlanCheckout({ planId, cycle: 'monthly', planName: plan?.name });
        if (result.free) navigate('/dashboard');
      } catch (err) {
        toast.error(err.response?.data?.detail || 'We couldn\u2019t start checkout. Please try again.');
      }
      setBusy(false);
      return;
    }
    // "Free" promise = the no-card door (account first, plan when the exploration period ends).
    // The plan they saw is stashed so signup tags the account and the paywall preselects it later.
    // Picking a specific plan (?v=all, or "subscribe today") lands on /start with that plan preselected.
    sessionStorage.setItem('carryon_signup_intent', JSON.stringify({ preferred_plan: planId, landing_page: 'benefactor' }));
    const utm = utmQuery();
    if (location === 'paynow' || variant === 'all') { navigate(`/start?plan=${planId}&cycle=monthly${utm ? `&${utm}` : ''}`); return; }
    navigate(`/signup${utm ? `?${utm}` : ''}`);
  };

  return (
    <div className="min-h-screen" style={{ background: '#0B1221', opacity: busy ? 0.7 : 1 }} data-testid="benefactor-page" data-variant={variant}>
      <SEO title={t('benefactor.seo.title')} description={t('benefactor.seo.description')} path="/benefactor" noindex />
      <BenefactorNav onSignIn={() => navigate('/login')} />
      <BenefactorHero days={days} onCta={(loc) => go('premium', loc)} />
      <BenefactorProblem />
      <ProductPreview testIdSuffix="-benefactor" />
      <BenefactorPayoff />
      <BenefactorMessages />
      <BenefactorTrust />
      <BenefactorPrice plans={plans} variant={variant} days={days} onSelect={(id, loc = 'price') => go(id, loc)} />
      <BenefactorFaq days={days} />
      <BenefactorFinal onCta={(loc) => go('premium', loc)} />
      <BenefactorFooter />
    </div>
  );
}
