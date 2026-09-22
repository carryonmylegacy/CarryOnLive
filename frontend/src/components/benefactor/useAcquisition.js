import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { recordFunnelEvent } from '../../utils/funnelTelemetry';
import { getPublic } from '../../utils/publicCache';

/* Shared plumbing for the paid-traffic landing pages (/ready, /moments): stash the ad's UTM params,
 * record the landing view, read the live trial length, and route every CTA to the no-card door with
 * the page tag so the Marketing Funnel tab can compare pages. */
export const useAcquisition = (page) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [days, setDays] = useState(null); // null until the live trial length arrives — never flash a stale number

  useEffect(() => {
    const utm = {};
    for (const [k, v] of searchParams.entries()) if (k.startsWith('utm_') || k === 'ref') utm[k] = v;
    if (Object.keys(utm).length) sessionStorage.setItem('carryon_utm', JSON.stringify(utm));
    recordFunnelEvent({ event: 'landing_view', meta: { page } });
    getPublic('/public/site-content').then(d => { if (d?.trial_days) setDays(d.trial_days); }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (location, extraMeta = {}) => {
    recordFunnelEvent({ event: 'landing_cta_click', meta: { page, location, ...extraMeta } });
    if (user) { navigate('/dashboard'); return; }
    sessionStorage.setItem('carryon_signup_intent', JSON.stringify({ preferred_plan: 'premium', landing_page: page }));
    const q = new URLSearchParams();
    for (const [k, v] of searchParams.entries()) if (k.startsWith('utm_') || k === 'ref') q.set(k, v);
    const utm = q.toString();
    navigate(`/signup${utm ? `?${utm}` : ''}`);
  };

  return { user, days, go, navigate };
};
