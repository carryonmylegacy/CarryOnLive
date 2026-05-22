import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Lock, Shield, ArrowRight, Check, Users, FileText, Sparkles,
  MessageCircle, KeyRound, ChevronDown, DollarSign, BookOpen, Network, Landmark,
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

// Source-of-truth feature catalog. These are the canonical "Four Pillars
// of Total Estate Readiness" — each pillar bundles a small set of
// focused functions. Copied verbatim from /app/frontend/src/components/
// landing/LandingContent.js (HomePage). Do NOT rename, paraphrase, or
// invent alternative blurbs. If a description needs to change, change
// it in LandingContent.js first and mirror here.
const FEATURES = [
  {
    num: '01', icon: Landmark, title: 'Legacy', abbr: 'People & plan',
    bold: 'The people who matter, the plan you leave them, and the audit trail of every change you make.',
    body: 'Beneficiaries (designate who matters, who sees what, when). Milestone Messages (MM — video/audio/written messages delivered at specific future moments). Friends & Family Notification (FFN — coordinated call-list when something happens). Designated Trustee Services (DTS — let an advisor act on your behalf, fully audited). Estate Plan Timeline (EPT — a living record of every change).',
  },
  {
    num: '02', icon: Lock, title: 'Vault', abbr: 'Documents & credentials',
    bold: 'Every document and credential your family will actually need — encrypted and surfaced by an AI that finds what you missed.',
    body: 'Secure Document Vault (SDV — AES-256 encrypted, released only to who you choose). Digital Access Vault (DAV — passwords, logins, crypto keys, assigned to the right people). Estate Guardian\u2122 AI (EGA — an AI estate-law analyst that reads inside your vault and flags gaps, contradictions, and deadlines).',
  },
  {
    num: '03', icon: DollarSign, title: 'Financial', abbr: 'Money & structure',
    bold: 'The complete money picture and a visual map of every trust, entity, and structure that holds it together.',
    body: 'CarryOn Financial Picture (CFP — a complete, encrypted view of accounts, investments, policies, bills, debts, and properties). CarryOn Entities & Structures (CES — a visual, pan-and-zoom org chart of every trust, LLC, partnership, charitable entity, and the people connected to each).',
  },
  {
    num: '04', icon: Shield, title: 'Preparedness', abbr: 'Crisis playbook',
    bold: 'The playbook your family follows on the hardest days — step-by-step actions, pre-built protocols, and a private channel to coordinate.',
    body: 'Immediate Action Checklist (IAC — auto-built from your vault, fully customizable, ready for the first hours, days, and weeks). CarryOn Contingency Protocols (CCP — pre-authored response plans for medical, disaster, incapacity, transition). Estate Communications Tool (ECT — phone-number-free family messaging that works from any device).',
  },
];

const FAQS = [
  {
    q: 'What happens to my data if CarryOn shuts down?',
    a: 'Your data is yours. At any time you can export every document, message, and note in their original formats — encrypted vaults stay decryptable with your master key. We publish a wind-down promise: 90 days minimum notice, full export tooling, and an open-source decryption utility.',
  },
  {
    q: 'How is this different from a will or LegalZoom?',
    a: 'A will is a document for lawyers, after you\'re gone. CarryOn is a living platform for your family, every day you\'re alive and every day after. The passwords, the recurring bills, the milestone messages, the medical wishes, the "who knows where the safe deposit box is" — organized once, accessible whenever it actually matters.',
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
  const [openFaq, setOpenFaq] = useState(-1);
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
            <Link to="/voices" className="hover:text-white transition-colors" data-testid="landing-voices-link">Voices</Link>
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
        <div className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(ellipse 1100px 700px at 50% 0%, rgba(var(--gold-rgb), 0.10), transparent 60%)' }} />
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight mb-6 text-white"
              style={{ fontFamily: 'var(--serif)' }}>
            Every American family.{' '}
            <span className="italic" style={{ color: 'var(--gold)' }}>Ready</span>.
          </h1>
          <p className="text-base sm:text-lg max-w-2xl mx-auto mb-9 leading-relaxed" style={{ color: 'var(--t4)' }}>
            CarryOn is the family preparedness platform that ensures your family is ready for whatever
            comes its way, from the next hurricane, to an extended period of absence of a key bread
            winner, to the final day of a loved one. Wishes, passwords, recurring bills, beneficiary
            contacts, video messages — organized while you're well, available the moment your family
            needs them. Today. Tomorrow. Whenever.
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

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm" style={{ color: 'var(--t5)' }}>
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
          <p className="text-sm uppercase tracking-[0.18em] mb-4" style={{ color: 'var(--gold)' }}>Why CarryOn exists</p>
          <h2 className="text-2xl sm:text-3xl font-semibold leading-tight mb-6 text-white" style={{ fontFamily: 'var(--serif)' }}>
            Your family shouldn't need a crisis to realize they don't know how the household runs.
          </h2>
          <p className="text-base sm:text-lg leading-relaxed" style={{ color: 'var(--t4)' }}>
            Most "estate planning" tools wake up only after someone dies. CarryOn is the layer
            underpinning the lawyer paperwork — the practical, password-and-bill-paying,
            where-are-the-medical-records, who-feeds-the-dog layer your family needs every ordinary
            week, not just the worst one. Ready when you're on a Eurotrip. Ready when you're in the
            hospital. Ready when you're gone. Same platform. Same family.{' '}
            <Link
              to="/signup"
              className="underline-offset-4 hover:underline transition-colors"
              style={{ color: 'var(--gold)' }}
              data-testid="landing-one-click-cta"
            >
              One click changes who can see what.
            </Link>
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 sm:py-28 px-5 sm:px-8" data-testid="landing-features">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-14">
            <p className="text-sm uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--gold)' }}>Total Estate Readiness</p>
            <h2 className="text-3xl sm:text-4xl font-semibold leading-tight mb-4 text-white" style={{ fontFamily: 'var(--serif)' }}>
              Four pillars. <span className="italic" style={{ color: 'var(--gold)' }}>One family</span>. Ready for any week of the year.
            </h2>
            <p className="text-base" style={{ color: 'var(--t4)' }}>
              Most estate tools stop at the legal documents and only matter once. CarryOn matters every
              week — every trip, every hospital visit, every house-sitting weekend, every transition,
              especially the final one. Four pillars hold up everything, each bundling a small set of
              focused functions.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-2xl p-5 transition-transform hover:-translate-y-0.5 flex flex-col"
                  style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
                  data-testid={`landing-feature-${i}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(var(--gold-rgb), 0.1)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}
                    >
                      <Icon className="w-5 h-5" style={{ color: 'var(--gold)' }} />
                    </div>
                    <span className="text-[22px] font-mono tracking-wider" style={{ color: 'var(--t5)' }}>
                      {f.num}
                    </span>
                  </div>
                  <h3 className="text-white font-semibold text-base mb-1" style={{ fontFamily: 'var(--sans)' }}>
                    {f.title}{' '}
                    <span className="text-sm font-mono" style={{ color: 'var(--gold)' }}>({f.abbr})</span>
                  </h3>
                  <p className="text-sm italic leading-snug mb-2" style={{ color: 'var(--t2)', fontFamily: 'var(--serif)' }}>
                    {f.bold}
                  </p>
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
            <p className="text-sm uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--gold)' }}>Pricing</p>
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
          <p className="text-sm uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--gold)' }}>Built for what matters most</p>
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
                  <div className="w-10 h-10 mx-auto mb-3 rounded-lg flex items-center justify-center" style={{ background: 'rgba(var(--gold-rgb), 0.08)', border: '1px solid rgba(var(--gold-rgb), 0.18)' }}>
                    <Icon className="w-5 h-5" style={{ color: 'var(--gold)' }} />
                  </div>
                  <div className="text-sm font-semibold text-white mb-1">{t.label}</div>
                  <div className="text-sm" style={{ color: 'var(--t5)' }}>{t.sub}</div>
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
            <p className="text-sm uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--gold)' }}>Frequently asked</p>
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
          <p className="text-sm sm:text-base italic mb-4 max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--gold)', fontFamily: 'var(--serif)' }}>
            "The one platform your family needs every week — and the one week they'll need it most."
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold leading-tight mb-5 text-white" style={{ fontFamily: 'var(--serif)' }}>
            Relied on while you're <span className="italic" style={{ color: 'var(--gold)' }}>living</span>. Ready when you're gone.
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
          <p className="text-sm mt-5" style={{ color: 'var(--t5)' }}>
            Already have an account?{' '}
            <Link to="/login" className="underline hover:text-white transition-colors" data-testid="landing-final-signin">Sign in</Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-5 sm:px-8 border-t" style={{ borderColor: 'var(--b)' }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm" style={{ color: 'var(--t5)' }}>
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
