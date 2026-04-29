import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Lock, Shield, ArrowRight, Check, Heart, Users, FileText, Sparkles,
  MessageCircle, Calendar, KeyRound, ChevronDown, HeartHandshake,
} from 'lucide-react';
import { recordFunnelEvent } from '../utils/funnelTelemetry';
import { API_URL } from '../config';
import LandingPricing from '../components/landing/LandingPricing';

const TRUST_BADGES = [
  { label: 'AES-256 Encrypted' },
  { label: 'Zero-Knowledge' },
  { label: '2FA Protected' },
  { label: 'SOC 2 In Progress' },
];

const FEATURES = [
  {
    icon: HeartHandshake,
    title: 'Estate Guardian Assistant',
    body: 'A private AI companion who walks your family through every decision, document, and difficult question — at their pace, in their words.',
  },
  {
    icon: FileText,
    title: 'Important Account Checklist',
    body: 'A living list of every account, password, subscription, and obligation your loved ones will need — guided, generated, and updated for them.',
  },
  {
    icon: MessageCircle,
    title: 'Milestone Messages',
    body: 'Record video and voice notes today that arrive on the birthdays, weddings, and quiet Tuesdays your family will need them most.',
  },
  {
    icon: Lock,
    title: 'Secure Document Vault',
    body: 'AES-256 encrypted storage for wills, deeds, insurance, medical directives. Time-locked release to the right people, only when it matters.',
  },
  {
    icon: Calendar,
    title: 'Estate Plan Timeline',
    body: 'A clear chronology of what you\'ve completed, what\'s pending, and what your beneficiaries should expect — from first signature to final hand-off.',
  },
  {
    icon: Heart,
    title: 'Family Forever Network',
    body: 'A private space for everyone you love to gather, message, and remember — the digital living room your family keeps long after you\'re gone.',
  },
  {
    icon: KeyRound,
    title: 'Digital Access Vault',
    body: 'Password-protected handoff for online accounts, subscriptions, two-factor codes, and recovery phrases your beneficiaries will otherwise lose forever.',
  },
  {
    icon: Sparkles,
    title: 'Connected Care + Financial Portals',
    body: 'Real-time visibility for your designated trustee into open bills, recurring obligations, and care decisions — when they need it, not before.',
  },
];

const FAQS = [
  {
    q: 'What happens to my data if CarryOn shuts down?',
    a: 'Your data is yours. At any time you can export every document, message, and note in their original formats — encrypted vaults stay decryptable with your master key. We publish a wind-down promise: 90 days minimum notice, full export tooling, and an open-source decryption utility.',
  },
  {
    q: 'How is this different from a will or LegalZoom?',
    a: 'A will tells lawyers what to do with your estate. CarryOn tells your family how to actually live the days after — the passwords, the recurring bills, the family stories, the final messages, the medical wishes. We complement legal documents; we don\'t replace them.',
  },
  {
    q: 'When do my beneficiaries actually see anything?',
    a: 'Nothing transitions until you choose. You can release specific documents on specific dates, on specific milestones (a birthday, a graduation), or on verified estate transition. You\'re in full control while you\'re here, and your family is in full control after.',
  },
  {
    q: 'Is my data really encrypted?',
    a: 'Yes. AES-256-GCM at rest, TLS 1.3 in transit, zero-knowledge architecture for vault contents — meaning even our engineers cannot read your stored documents. Your master key never leaves your device unencrypted.',
  },
  {
    q: 'What\'s included in the free trial?',
    a: 'Full Premium tier for 30 days. No credit card required. If you don\'t love it, your account quietly downgrades to Base at the end. No surprise charges, ever.',
  },
];

const LandingPage = () => {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    recordFunnelEvent({ event: 'landing_view' });
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });

    // Capture ?ref=CODE referral attribution. Stored in localStorage so it
    // survives the bounce through /signup and is consumed by SignupPage on
    // successful registration.
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = (params.get('ref') || '').trim();
      if (ref && /^[A-Za-z0-9-]{4,24}$/.test(ref)) {
        const upper = ref.toUpperCase();
        localStorage.setItem('carryon_referral_code', upper);
        recordFunnelEvent({ event: 'referral_share', meta: { code: upper, source: 'landing_visit' } });
        // Fire-and-forget visit attribution
        const anon = localStorage.getItem('carryon_anon_session_id') || null;
        import('axios').then(({ default: axios }) => {
          axios
            .post(`${API_URL}/referrals/track-visit`, {
              code: upper,
              anon_session_id: anon,
              path: window.location.pathname,
            })
            .catch(() => {});
        });
      }
    } catch {}

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleCTA = (location) => {
    recordFunnelEvent({ event: 'landing_cta_click', meta: { location } });
    navigate('/signup');
  };

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: 'var(--bg)', color: 'var(--t)' }}>
      {/* Top nav */}
      <header
        className="fixed top-0 inset-x-0 z-40 transition-all duration-200"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: scrolled ? 'rgba(11,18,32,0.85)' : 'transparent',
          backdropFilter: scrolled ? 'blur(16px) saturate(140%)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        }}
        data-testid="landing-header"
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="landing-logo">
            <img src="/carryon-logo.png" alt="CarryOn" className="w-7 h-7 rounded-md" />
            <span className="text-white font-semibold tracking-tight" style={{ fontFamily: 'var(--sans)' }}>CarryOn</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm" style={{ color: 'var(--t3)' }}>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center px-4 py-2 text-sm rounded-lg transition-colors hover:bg-[var(--s)]"
              style={{ color: 'var(--t3)' }}
              data-testid="landing-signin-link"
            >
              Sign in
            </Link>
            <button
              onClick={() => handleCTA('header')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg btn-gold-cta"
              data-testid="landing-cta-header"
            >
              Start Free <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 px-5 sm:px-8" data-testid="landing-hero">
        <div className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(ellipse 1100px 700px at 50% 0%, rgba(212,175,55,0.10), transparent 60%)' }} />
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs mb-7"
            style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: 'var(--gold)' }}>
            <Sparkles className="w-3 h-3" /> Now in beta · Free trial, no card
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.1] tracking-tight mb-6 text-white"
              style={{ fontFamily: 'var(--serif)' }}>
            Your family's hardest conversation,{' '}
            <span className="italic" style={{ color: 'var(--gold)' }}>finally captured</span>.
          </h1>
          <p className="text-base sm:text-lg max-w-2xl mx-auto mb-9 leading-relaxed" style={{ color: 'var(--t4)' }}>
            CarryOn is the digital legacy platform that turns your wishes, your wisdom, and the practical
            details of your estate into a clear, encrypted, lovingly-organised hand-off — for the people
            you love, on the day they need it most.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
            <button
              onClick={() => handleCTA('hero')}
              className="inline-flex items-center justify-center gap-2 px-7 py-4 text-base font-semibold rounded-xl btn-gold-cta"
              data-testid="landing-cta-hero"
            >
              Start Your Free 30-Day Trial <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 px-7 py-4 text-base font-semibold rounded-xl transition-colors"
              style={{ background: 'transparent', border: '1px solid var(--b)', color: 'var(--t2)' }}
              data-testid="landing-secondary-cta"
            >
              See what's included
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs" style={{ color: 'var(--t5)' }}>
            {TRUST_BADGES.map(b => (
              <div key={b.label} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> {b.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why CarryOn — emotional anchor */}
      <section className="py-16 sm:py-24 px-5 sm:px-8" style={{ background: 'rgba(255,255,255,0.015)', borderTop: '1px solid var(--b)', borderBottom: '1px solid var(--b)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.18em] mb-4" style={{ color: 'var(--gold)' }}>Why CarryOn exists</p>
          <h2 className="text-2xl sm:text-3xl font-semibold leading-tight mb-6 text-white" style={{ fontFamily: 'var(--serif)' }}>
            On the worst day of their lives, your family will spend their grief hunting for passwords.
          </h2>
          <p className="text-base sm:text-lg leading-relaxed" style={{ color: 'var(--t4)' }}>
            Every estate planning tool helps you tell <em>lawyers</em> what to do. None of them help you tell
            your <em>family</em> what they need to know. CarryOn is the missing layer: the practical,
            emotional, password-and-video-and-bill-paying handoff, organized while you're well, delivered
            when they need it. So they can actually grieve — instead of guessing.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 sm:py-28 px-5 sm:px-8" data-testid="landing-features">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-14">
            <p className="text-xs uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--gold)' }}>What's inside</p>
            <h2 className="text-3xl sm:text-4xl font-semibold leading-tight mb-4 text-white" style={{ fontFamily: 'var(--serif)' }}>
              Eight surfaces that <span className="italic" style={{ color: 'var(--gold)' }}>actually</span> hold a family together.
            </h2>
            <p className="text-base" style={{ color: 'var(--t4)' }}>
              Most estate tools stop at the legal documents. CarryOn keeps going — into the practical,
              the emotional, and the everyday.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-2xl p-5 transition-transform hover:-translate-y-0.5"
                  style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
                  data-testid={`landing-feature-${i}`}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                    style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)' }}
                  >
                    <Icon className="w-5 h-5" style={{ color: 'var(--gold)' }} />
                  </div>
                  <h3 className="text-white font-semibold text-base mb-2" style={{ fontFamily: 'var(--sans)' }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--t4)' }}>{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 sm:py-28 px-5 sm:px-8" style={{ background: 'rgba(255,255,255,0.015)', borderTop: '1px solid var(--b)', borderBottom: '1px solid var(--b)' }} data-testid="landing-pricing">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--gold)' }}>Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-semibold leading-tight mb-3 text-white" style={{ fontFamily: 'var(--serif)' }}>
              Plans that <span className="italic" style={{ color: 'var(--gold)' }}>scale with your family</span>.
            </h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: 'var(--t4)' }}>
              30-day free trial on every paid plan. No credit card up-front. Cancel anytime — your data is always yours.
            </p>
          </div>

          <LandingPricing />
        </div>
      </section>

      {/* Trust band */}
      <section className="py-16 px-5 sm:px-8" data-testid="landing-trust">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--gold)' }}>Built for what matters most</p>
          <h2 className="text-2xl sm:text-3xl font-semibold leading-tight mb-10 text-white" style={{ fontFamily: 'var(--serif)' }}>
            Bank-grade encryption. <span className="italic" style={{ color: 'var(--gold)' }}>Family-grade care</span>.
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { icon: Lock, label: 'AES-256-GCM', sub: 'Encryption at rest' },
              { icon: Shield, label: 'Zero-Knowledge', sub: 'We can\'t read your vault' },
              { icon: KeyRound, label: '2FA + Master Key', sub: 'Layered access control' },
              { icon: Users, label: 'SOC 2 In Progress', sub: 'Compliance-first' },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.label}>
                  <div className="w-10 h-10 mx-auto mb-3 rounded-lg flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.18)' }}>
                    <Icon className="w-5 h-5" style={{ color: 'var(--gold)' }} />
                  </div>
                  <div className="text-sm font-semibold text-white mb-1">{t.label}</div>
                  <div className="text-xs" style={{ color: 'var(--t5)' }}>{t.sub}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 sm:py-28 px-5 sm:px-8" style={{ borderTop: '1px solid var(--b)' }} data-testid="landing-faq">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--gold)' }}>Frequently asked</p>
            <h2 className="text-3xl sm:text-4xl font-semibold leading-tight text-white" style={{ fontFamily: 'var(--serif)' }}>
              The <span className="italic" style={{ color: 'var(--gold)' }}>honest</span> answers.
            </h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((f, i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden"
                style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
                data-testid={`landing-faq-${i}`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                  data-testid={`landing-faq-toggle-${i}`}
                >
                  <span className="text-white font-medium text-sm sm:text-base">{f.q}</span>
                  <ChevronDown
                    className="w-5 h-5 flex-shrink-0 transition-transform"
                    style={{ color: 'var(--t5)', transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0)' }}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-sm leading-relaxed" style={{ color: 'var(--t4)' }}>
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 sm:py-32 px-5 sm:px-8" data-testid="landing-final-cta">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold leading-tight mb-5 text-white" style={{ fontFamily: 'var(--serif)' }}>
            Start the hand-off your family <span className="italic" style={{ color: 'var(--gold)' }}>actually deserves</span>.
          </h2>
          <p className="text-base sm:text-lg mb-9 max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--t4)' }}>
            30 days free. No credit card. Encrypt your first document in under 4 minutes.
          </p>
          <button
            onClick={() => handleCTA('final')}
            className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold rounded-xl btn-gold-cta"
            data-testid="landing-cta-final"
          >
            Start Your Free Trial <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-xs mt-5" style={{ color: 'var(--t5)' }}>
            Already have an account?{' '}
            <Link to="/login" className="underline hover:text-white transition-colors" data-testid="landing-final-signin">Sign in</Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-5 sm:px-8 border-t" style={{ borderColor: 'var(--b)' }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs" style={{ color: 'var(--t5)' }}>
          <div className="flex items-center gap-2">
            <img src="/carryon-logo.png" alt="CarryOn" className="w-5 h-5 rounded-sm opacity-80" />
            <span>© {new Date().getFullYear()} CarryOn. All rights reserved.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link to="/security" className="hover:text-white transition-colors">Security</Link>
            <Link to="/wind-down-promise" className="hover:text-white transition-colors">Wind-Down Promise</Link>
            <a href="mailto:hello@carryon.us" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
