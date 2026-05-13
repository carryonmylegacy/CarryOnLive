/**
 * PartnerPortalPage — Public co-branded landing page at `/p/:slug`.
 *
 * Mirrors LoginPage's hero exactly (flag bg, gradients, login card on
 * the right) but swaps in the partner's logo + tagline on the left.
 * When a visitor lands here, we stash the partner's code + slug in
 * localStorage so the onboarding flow can prefill the Enterprise Code
 * step at the end of signup.
 *
 * On wrong/missing slug, renders a polite branded error tile that
 * surfaces the company name (if the slug exists but partner is
 * inactive) or a friendly "ask your partner for the right link"
 * fallback (if the slug doesn't exist).
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { Mail, Lock, Eye, EyeOff, Loader2, Shield, ChevronRight, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../utils/toast';
import { haptics } from '../utils/haptics';
import { API_URL } from '../config';

const PARTNER_CODE_KEY = 'cy_partner_code';
const PARTNER_SLUG_KEY = 'cy_partner_slug';

const PartnerPortalPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { login, logout, isAuthenticated, user } = useAuth();

  // Friendly Create-Account handler. If the visitor is already
  // signed in (common when an admin or partner-rep clicks the link
  // to preview their own landing page), the global `<PublicRoute>`
  // guard would silently bounce them back to their portal —
  // breaking the "click → wizard" expectation. Detect that case,
  // confirm with the user, sign them out, THEN navigate to /signup
  // so the wizard actually opens.
  const handleCreateAccount = async () => {
    if (isAuthenticated) {
      const who = user?.name || user?.email || 'this account';
      const ok = window.confirm(
        `You're currently signed in as ${who}. Sign out and create a new ${partner?.company_name || 'CarryOn'} account?`,
      );
      if (!ok) return;
      try { await logout(); } catch { /* proceed even if server logout fails */ }
    }
    navigate('/signup');
  };

  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState(null);
  const [error, setError] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  // Cache-bust the logo URL with the partner's `updated_at` so a
  // logo re-upload by the admin shows up instantly. Hoisted above
  // the early returns and uses optional chaining so it's safe even
  // while `partner` is still loading.
  const logoUrl = partner?.has_logo
    ? `${API_URL}/public/partners/${partner.slug}/logo?v=${encodeURIComponent(partner.updated_at || '')}`
    : null;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/public/partners/${slug}`);
        if (!alive) return;
        setPartner(data);
        // Stash the partner context so the signup → onboarding flow
        // can prefill the Enterprise Code step. We DON'T have the
        // code itself client-side (it's not in the public payload),
        // so we stash the slug and let the onboarding step resolve
        // the code by re-fetching partner info post-signup OR by
        // letting the user paste the code their partner shared.
        try {
          localStorage.setItem(PARTNER_SLUG_KEY, data.slug);
          // Clear any stale code from a prior partner landing.
          localStorage.removeItem(PARTNER_CODE_KEY);
        } catch { /* private mode → ignore */ }
      } catch (err) {
        if (!alive) return;
        setError(err.response?.status === 404 ? 'not_found' : 'load_failed');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  const handleLogin = async (e) => {
    e?.preventDefault?.();
    setSigningIn(true);
    try {
      const result = await login(email, password, 'email', null, false);
      if (result.direct) {
        haptics.success();
        const dest =
          result.user?.role === 'admin' ? '/admin'
            : result.user?.role === 'operator' ? '/ops'
              : result.user?.role === 'beneficiary' && !result.user?.is_also_benefactor ? '/beneficiary/dashboard'
                : '/dashboard';
        navigate(dest);
      } else {
        // OTP flow — punt to /login which has the full OTP modal
        // wired up. Email is preserved via query param.
        navigate(`/login?email=${encodeURIComponent(email)}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid credentials');
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }} data-testid="partner-portal-loading">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--gold)]" />
      </div>
    );
  }

  if (error) {
    return <PartnerNotFoundTile slug={slug} reason={error} />;
  }

  const enabledLabels = (partner?.enabled_pillars || []).map(p => p.label);
  let heroSubtitle;
  if (partner?.tagline) {
    heroSubtitle = partner.tagline;
  } else if (enabledLabels.length === 0) {
    heroSubtitle = `${partner?.company_name} members get the CarryOn family preparedness platform.`;
  } else if (enabledLabels.length === 1) {
    heroSubtitle = `${partner?.company_name} members get ${enabledLabels[0]} from CarryOn.`;
  } else {
    const head = enabledLabels.slice(0, -1).join(', ');
    const tail = enabledLabels[enabledLabels.length - 1];
    heroSubtitle = `${partner?.company_name} members get ${head}, and ${tail} from CarryOn.`;
  }

  // Cache-bust the logo URL with the partner's `updated_at` so a
  // logo re-upload by the admin shows up instantly (would otherwise
  // be held in the browser cache for 24h per the backend's
  // Cache-Control header on successful responses).
  // (Hoisted above the early returns — see top of component.)

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--bg)' }} data-testid="partner-portal-page">
      {/* Flag bg — identical to LoginPage hero */}
      <div className="absolute inset-0 z-0">
        <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(1.25) contrast(1.05) saturate(1.1)' }} />
      </div>
      <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.10) 0%, rgba(11,18,33,0.35) 50%, rgba(14,24,41,0.65) 100%)' }} />
      <div className="absolute inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 90% 80% at 20% 80%, rgba(255,255,255,0.10) 0%, transparent 60%)' }} />
      <div className="absolute inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 70% 50% at 35% 50%, rgba(212,175,55,0.04) 0%, transparent 70%)' }} />

      {/* Top-right "Sign up" link */}
      <div className="absolute top-0 right-0 z-20 px-6 lg:px-10 py-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
        <button onClick={handleCreateAccount} className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1" data-testid="partner-portal-signup-top">
          Create Account <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* HERO */}
      <section className="min-h-screen flex flex-col items-center justify-center relative">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 w-full relative z-10 py-12">
          <div className="grid lg:grid-cols-[1fr_420px] gap-10 lg:gap-14 items-center">

            {/* LEFT: Partner logo + tagline */}
            <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
              {logoUrl ? (
                <img key={logoUrl} src={logoUrl} alt={`${partner.company_name} logo`}
                  className="max-w-[260px] max-h-[160px] w-auto h-auto object-contain mb-6 rounded-xl bg-white/95 p-4"
                  style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.35)' }}
                  data-testid="partner-portal-logo" />
              ) : (
                <div
                  data-testid="partner-portal-logo-placeholder"
                  className="w-[260px] h-[160px] rounded-xl mb-6 flex flex-col items-center justify-center"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '2px dashed rgba(212,175,55,0.45)',
                    boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
                  }}>
                  <span className="text-[#d4af37] text-base font-bold tracking-widest uppercase">Your Logo</span>
                  <span className="text-white/60 text-xs mt-1">Goes Here</span>
                </div>
              )}
              <h1 className="text-3xl sm:text-4xl xl:text-5xl font-semibold text-white leading-[1.08] mb-4 tracking-tight"
                style={{ fontFamily: 'var(--serif)', textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}
                data-testid="partner-portal-headline">
                Welcome,
                <span className="block text-[#d4af37] mt-1 italic">{partner.company_name} family.</span>
              </h1>
              <p className="text-white/85 text-base xl:text-lg max-w-xl leading-relaxed mb-5"
                style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}
                data-testid="partner-portal-tagline">
                {heroSubtitle}
              </p>
              {!!partner.enabled_pillars?.length && (
                <div className="flex flex-wrap gap-2 justify-center lg:justify-start" data-testid="partner-portal-pillars">
                  {partner.enabled_pillars.map(p => (
                    <span key={p.key} className="px-3 py-1 rounded-full text-xs font-semibold"
                      style={{ background: 'rgba(212,175,55,0.14)', border: '1px solid rgba(212,175,55,0.32)', color: '#fcd34d' }}>
                      {p.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT: Login card (mirrors LoginPage desktop card) */}
            <div className="flex justify-center lg:justify-end">
              <div className="w-full max-w-md rounded-2xl p-7 relative" style={{
                background: 'linear-gradient(160deg, rgba(17,27,48,0.97), rgba(13,22,40,0.99))',
                border: '1px solid rgba(212,175,55,0.12)',
                boxShadow: '0 8px 80px rgba(0,0,0,0.5)',
              }}>
                <div className="absolute top-0 left-7 right-7 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #d4af37, transparent)' }} />
                <h2 className="text-white text-xl font-semibold mb-1" style={{ fontFamily: 'var(--sans)' }}>Sign In</h2>
                <p className="text-white/70 text-sm font-semibold mb-5">
                  Access your {partner.company_name} · CarryOn account
                </p>
                <form onSubmit={handleLogin} className="space-y-3.5">
                  <div>
                    <label className="text-white/80 text-sm font-bold mb-1.5 block">Username or Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                      <Input type="text" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="Username or Email" required autoComplete="username" name="email"
                        className="h-11 pl-10 bg-[#0B1627] border-[#1A2D48] text-white placeholder:text-[#2A3C55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg"
                        data-testid="partner-portal-email" />
                    </div>
                  </div>
                  <div>
                    <label className="text-white/80 text-sm font-bold mb-1.5 block">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                      <Input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="Enter password" required autoComplete="current-password" name="password"
                        className="h-11 pl-10 pr-10 bg-[#0B1627] border-[#1A2D48] text-white placeholder:text-[#2A3C55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg"
                        data-testid="partner-portal-password" />
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#334155] hover:text-[#7b879e] transition-colors">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" disabled={signingIn || !email || !password}
                    className="w-full h-12 rounded-lg font-bold text-base mt-1"
                    style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0B1221' }}
                    data-testid="partner-portal-submit">
                    {signingIn ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing In...</> : 'Sign In'}
                  </Button>
                </form>
                <div className="mt-4 flex items-center justify-between">
                  <button onClick={handleCreateAccount} className="text-[#d4af37] text-sm font-bold hover:text-[#fcd34d] transition-colors"
                    data-testid="partner-portal-create-account">Create Account</button>
                  <button onClick={() => navigate('/login')} className="text-[#94A3B8] text-sm font-bold hover:text-[#d4af37] transition-colors">
                    Need help signing in?
                  </button>
                </div>
                <div className="mt-5 pt-4 border-t flex items-center justify-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <Shield className="w-3.5 h-3.5 text-[#10b981]" />
                  <span className="text-white/80 text-xs font-bold">Bank-grade security &middot; 256-bit SSL</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Powered by CarryOn footer */}
        <div className="relative z-10 w-full px-6 lg:px-10 pb-8 pt-4">
          <div className="max-w-[1400px] mx-auto border-t pt-5 flex flex-col sm:flex-row items-center justify-center gap-3"
            style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
            <img src="/carryon-logo.png" alt="CarryOn" className="h-7 w-auto opacity-90" />
            <div className="hidden sm:block w-px h-5" style={{ background: 'rgba(255,255,255,0.15)' }} />
            <span className="text-white/70 text-xs font-semibold tracking-wide flex items-center gap-1.5"
              data-testid="partner-portal-powered-by">
              <Sparkles className="w-3 h-3 text-[#d4af37]" />
              Powered by CarryOn Enterprises Inc.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};

function PartnerNotFoundTile({ slug, reason }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center" style={{ background: 'var(--bg)' }} data-testid="partner-portal-error">
      <div className="absolute inset-0 z-0">
        <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.55) contrast(1.05)' }} />
      </div>
      <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.55) 0%, rgba(11,18,33,0.85) 100%)' }} />
      <div className="relative z-10 max-w-lg w-full mx-6 rounded-2xl p-8 text-center" style={{
        background: 'linear-gradient(160deg, rgba(17,27,48,0.97), rgba(13,22,40,0.99))',
        border: '1px solid rgba(212,175,55,0.18)',
        boxShadow: '0 8px 80px rgba(0,0,0,0.5)',
      }}>
        <div className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)' }}>
          <AlertCircle className="w-7 h-7 text-[#fca5a5]" />
        </div>
        <h2 className="text-white text-xl font-semibold mb-2" style={{ fontFamily: 'var(--serif)' }}>
          We couldn&apos;t find that partner page.
        </h2>
        <p className="text-white/75 text-sm leading-relaxed mb-5">
          The link <span className="font-mono text-[#d4af37]">/p/{slug}</span> {reason === 'not_found' ? 'doesn\u2019t match any active CarryOn partnership.' : 'isn\u2019t available right now.'} Please double-check the URL your B2B partner shared with you, or sign in directly below.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => navigate('/login')} className="gold-button" data-testid="partner-portal-error-login">Go to Sign In</Button>
          <Button onClick={() => navigate('/signup')} variant="outline" className="border-[#d4af37]/40 text-[#d4af37] hover:bg-[#d4af37]/10" data-testid="partner-portal-error-signup">
            Create Account
          </Button>
        </div>
        <div className="mt-6 pt-5 border-t flex items-center justify-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <img src="/carryon-logo.png" alt="CarryOn" className="h-6 w-auto opacity-80" />
          <span className="text-white/70 text-xs font-semibold">Powered by CarryOn Enterprises Inc.</span>
        </div>
      </div>
    </div>
  );
}

export default PartnerPortalPage;
