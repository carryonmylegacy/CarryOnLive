import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, ChevronRight, ChevronDown, Lock as LockIcon, Sparkles, FileCheck, UserCheck, Trash2, ClipboardCheck, MessageSquare, Key, Layers, Smartphone, MapPin, ShieldAlert, ArrowUpDown, SlidersHorizontal } from 'lucide-react';

/* scroll-reveal hook */
const useReveal = (threshold = 0.15) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, visible];
};

const RevealSection = ({ children, className = '', delay = 0, direction = 'up', ...props }) => {
  const [ref, visible] = useReveal(0.12);
  const transforms = { up: 'translate3d(0,20px,0)', down: 'translate3d(0,-20px,0)', left: 'translate3d(20px,0,0)', right: 'translate3d(-20px,0,0)' };
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translate3d(0,0,0)' : transforms[direction],
      transition: `opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      backfaceVisibility: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
    }} {...props}>
      {children}
    </div>
  );
};

const HomePage = () => {
  const navigate = useNavigate();
  const [flagOpacity, setFlagOpacity] = useState(1);
  const [exiting, setExiting] = useState(false);

  const navigateWithFade = (path) => {
    setExiting(true);
    setTimeout(() => navigate(path), 500);
  };

  useEffect(() => {
    const handleScroll = () => {
      const fade = Math.max(0, 1 - window.scrollY / 600);
      setFlagOpacity(fade);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen" style={{
      background: '#0E1829',
      opacity: exiting ? 0 : 1,
      ...(exiting ? { transform: 'scale(0.98)' } : {}),
      transition: 'opacity 0.45s ease, transform 0.45s ease',
    }}>

      {/* NAV BAR */}
      <nav className="fixed top-0 w-full z-50" style={{ borderBottom: '1px solid rgba(14,165,233,0.06)', background: 'rgba(11,18,33,0.97)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <img src="/carryon-logo.png" alt="CarryOn" className="h-12" />
          <div className="hidden md:flex items-center gap-8">
            {[
              { label: 'Features', href: '#features' },
              { label: 'Security', href: '#security' },
              { label: 'How It Works', href: '#steps' },
            ].map(item => (
              <a key={item.label} href={item.href} className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors duration-300">{item.label}</a>
            ))}
          </div>
          <button onClick={() => navigateWithFade('/login')} className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1" data-testid="home-sign-in-nav">
            Sign In <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="min-h-screen flex items-center relative overflow-hidden" style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top, 0px))' }}>
        <div className="absolute inset-0 z-0" style={{ opacity: flagOpacity * 0.85 }}>
          <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(1.3) contrast(1.05) saturate(1.1)' }} />
        </div>
        <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.0) 0%, rgba(11,18,33,0.05) 50%, rgba(14,24,41,0.25) 100%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 90% 80% at 20% 80%, rgba(255,255,255,0.12) 0%, transparent 60%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 60% at 10% 50%, rgba(255,255,255,0.08) 0%, transparent 50%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 70% at 85% 85%, rgba(255,255,255,0.14) 0%, transparent 55%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 70% 50% at 35% 50%, rgba(212,175,55,0.04) 0%, transparent 70%)' }} />

        <div className="max-w-[900px] mx-auto px-6 w-full relative z-10 text-center">
          <RevealSection delay={0.1}>
            <img src="/carryon-logo.png" alt="CarryOn" className="w-[200px] lg:w-[260px] h-auto mx-auto mb-6" />
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-4" style={{ fontFamily: 'Outfit, sans-serif', textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}>
              Every American Family.
              <span className="block text-[#d4af37] mt-1" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}>Ready.</span>
            </h1>
            <p className="text-white/80 text-base lg:text-lg max-w-lg mx-auto leading-relaxed mb-8" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
              Secure your estate plan with AI-powered estate planning. Protect what matters, guide who you love.
            </p>
            <div className="flex items-center gap-4 justify-center flex-wrap mb-8">
              <button onClick={() => navigateWithFade('/signup')} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base transition-transform duration-150 active:scale-95" data-testid="home-get-started-hero"
                style={{ background: '#d4af37', color: '#0B1221' }}>
                Get Started <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => navigateWithFade('/login')} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm transition-all active:scale-95" data-testid="home-sign-in-hero"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)' }}>
                Sign In
              </button>
            </div>
            <div className="flex items-center gap-5 justify-center mb-6">
              {['AES-256 Encrypted', 'Per-Estate Keys', '2FA Protected'].map(badge => (
                <div key={badge} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                  <span className="text-white/70 text-sm font-medium" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{badge}</span>
                </div>
              ))}
            </div>
          </RevealSection>
          <RevealSection delay={0.4}>
            <a href="#about" className="inline-flex flex-col items-center gap-1 mt-4 px-6 py-3 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
              <span className="text-white/70 text-lg font-bold group-hover:text-[#d4af37] transition-colors" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>Scroll to explore</span>
              <ChevronDown className="w-6 h-6 text-white/50 animate-bounce group-hover:text-[#d4af37]" />
            </a>
          </RevealSection>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="relative z-10 -mt-2">
        <div className="rounded-t-[2.5rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -20px 60px rgba(0,0,0,0.5)' }}>
          <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-roots.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(212,175,55,0.03) 0%, transparent 60%), linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.85) 100%)' }} />
          <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Your Family.<br />Ready for Anything.
            </h2>
            <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-8">
              CarryOn&#8482; is the first platform designed to ensure family readiness for all American families &mdash; an affordable, secure digital infrastructure that organizes your estate documents, automates critical checklists, delivers milestone messages, and provides AI-powered document intelligence so your family is prepared, not searching.
            </p>
            <button onClick={() => navigateWithFade('/signup')} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm transition-transform duration-150 active:scale-95"
              style={{ background: '#d4af37', color: '#0B1221' }}>
              Get Started <ChevronRight className="w-4 h-4" />
            </button>
            <RevealSection delay={0.2}>
              <p className="mt-10 text-[#d4af37] text-sm lg:text-base italic font-medium">
                76% of American families have no estate plan. CarryOn ensures yours isn&apos;t one of them.
              </p>
            </RevealSection>
          </RevealSection>
        </div>
      </section>

      {/* REFRAME */}
      <section className="relative z-20 -mt-1">
        <div className="rounded-t-[2rem] py-20 lg:py-28 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.3]" style={{ backgroundImage: 'url(/texture-warmth.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.45) 0%, rgba(14,24,41,0.85) 100%)' }} />
          <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Family Readiness Isn&apos;t Planning for Death.<br />
              <span className="text-[#d4af37]">It&apos;s Planning for Your Family.</span>
            </h2>
            <p className="text-[#7b879e] text-base leading-relaxed mb-8">
              Every family faces transitions &mdash; some expected, some sudden. Family readiness means your documents are organized, your wishes are clear, your checklists are built, and your loved ones know exactly what to do and where to look. CarryOn&#8482; is the secure digital infrastructure that makes all of this possible &mdash; in one place, on one platform, protected by AES-256 per-estate encryption.
            </p>
            <RevealSection delay={0.15}>
              <p className="text-white text-base lg:text-lg font-semibold italic leading-relaxed">
                You don&apos;t buy life insurance because you plan to die. You buy it because you plan to take care of your family. CarryOn works the same way.
              </p>
            </RevealSection>
          </RevealSection>
        </div>
      </section>

      {/* CORE FEATURES */}
      <section id="features" className="relative z-30 -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.16]" style={{ backgroundImage: 'url(/texture-circuit.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.4) 0%, rgba(14,24,41,0.8) 100%)' }} />
          <div className="max-w-[1100px] mx-auto px-6 relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Core Features.
              </h2>
              <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#d4af37] text-center mb-14" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Total Family Readiness.
              </h3>
            </RevealSection>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: LockIcon, title: 'Secure Document Vault (SDV)', bold: 'Every will, trust, policy, and deed \u2014 encrypted, organized, and instantly accessible to the right people.', desc: 'Upload and store your most critical estate documents in a per-estate encrypted vault with AES-256 encryption at rest. Triple Lock protection with PIN, password, and security question. Your beneficiaries access exactly what you authorize \u2014 nothing more.' },
                { icon: Sparkles, title: 'Estate Guardian\u2122 AI (EGA)', bold: 'An AI analyst powered by U.S. estate law across all 50 states \u2014 working inside your encrypted vault.', desc: 'EGA analyzes your estate documents for contradictions, gaps, outdated provisions, and missing pieces. The AI reviews your documents within the platform and auto-populates your Immediate Action Checklist (IAC) with critical details like claim phone numbers, executor contacts, and filing deadlines. No team reads them. No human touches them.' },
                { icon: ClipboardCheck, title: 'Immediate Action Checklist (IAC)', bold: 'A step-by-step guide your family can follow on the hardest day of their lives.', desc: 'Partially auto-populated by EGA and fully customizable by you. When the time comes, your family opens the IAC and knows exactly what to do, who to call, where to find every document, and what deadlines matter. No guessing. No searching. No overwhelm. Just clarity.' },
                { icon: MessageSquare, title: 'Milestone Messages (MM)', bold: 'Your words at their wedding. Your message at their graduation. Your love \u2014 delivered exactly when it matters.', desc: 'Record written, voice, or video messages for the milestones you want to be part of \u2014 even if you can\'t be there. Weddings, births, graduations, birthdays, first homes, or any moment you choose. Messages are securely stored and delivered when your beneficiary reports the milestone.' },
                { icon: Users, title: 'Family & Friends Notification (FFN)', bold: 'The people who matter most should never hear the news through the grapevine.', desc: 'Build a personalized notification list of family, friends, colleagues, and anyone your beneficiaries should contact after your transition. Names, phone numbers, relationships, and special notes \u2014 all organized and ready when your family needs it.' },
                { icon: UserCheck, title: 'Designated Trustee Services (DTS)', bold: 'Some things shouldn\'t follow you. Let a trusted team handle what you can\'t.', desc: 'Accounts to close. Subscriptions to cancel. Sensitive content to destroy. Financial transfers to execute. CarryOn\'s DTS lets you authorize specific, line-item tasks to be carried out confidentially after your verified transition. Each task is quoted, approved by you, and executed by our DTS Team.' },
              ].map(({ icon: Icon, title, bold, desc }, i) => (
                <RevealSection key={title} delay={i * 0.12} direction={i % 2 === 0 ? 'left' : 'right'}>
                  <div className="rounded-xl p-6 lg:p-8 h-full transition-transform duration-150 active:scale-[0.98] feature-card"
                    style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.15)' }}>
                      <Icon className="w-5 h-5 text-[#d4af37]" />
                    </div>
                    <h4 className="text-white text-lg font-semibold mb-2">{title}</h4>
                    <p className="text-[#d4af37] text-sm font-medium mb-3 leading-relaxed">{bold}</p>
                    <p className="text-[#6b7a90] text-sm leading-relaxed">{desc}</p>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PLATFORM FEATURES */}
      <section className="relative z-[35] -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.2]" style={{ backgroundImage: 'url(/texture-warmth.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.45) 0%, rgba(14,24,41,0.82) 100%)' }} />
          <div className="max-w-[1100px] mx-auto px-6 relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Everything Your Family Needs.
              </h2>
              <p className="text-[#7b879e] text-base text-center max-w-[650px] mx-auto mb-14 leading-relaxed">
                Beyond the four pillars, CarryOn&#8482; gives your family a complete readiness infrastructure &mdash; purpose-built for modern families.
              </p>
            </RevealSection>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { icon: Key, title: 'Digital Access Vault (DAV)', desc: 'Store passwords, crypto keys, and access credentials &mdash; encrypted and assigned to specific beneficiaries.' },
                { icon: ArrowUpDown, title: 'Succession Hierarchy', desc: 'Ranked beneficiary succession with automatic promotion when a primary can no longer serve.' },
                { icon: Layers, title: 'Multi-Estate Support', desc: 'Manage multiple estates under one account &mdash; built for blended, extended, and modern families.' },
                { icon: Users, title: 'Family Connections Map', desc: 'Interactive orbit visualization of every family member, their role, and their relationship to your estate.' },
                { icon: ShieldAlert, title: 'Emergency Access', desc: 'Verified protocol for beneficiaries to request vault access when a benefactor is incapacitated.' },
                { icon: SlidersHorizontal, title: 'Section Permissions', desc: 'Control exactly what each beneficiary can see &mdash; vault, messages, checklist, digital wallet, and more.' },
                { icon: Smartphone, title: 'Native Mobile App', desc: 'iOS and Android with biometric login, push notifications, and full platform access on the go.' },
                { icon: MapPin, title: '50-State Legal AI', desc: 'Estate Guardian calibrates every analysis to your declared state of residence and its specific estate laws.' },
              ].map(({ icon: Icon, title, desc }, i) => (
                <RevealSection key={title} delay={i * 0.06}>
                  <div className="rounded-xl p-5 h-full transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20"
                    style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.12)' }}>
                      <Icon className="w-4 h-4 text-[#d4af37]" />
                    </div>
                    <h4 className="text-white text-sm font-semibold mb-1.5">{title}</h4>
                    <p className="text-[#6b7a90] text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: desc }} />
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* THREE STEPS */}
      <section id="steps" className="relative z-40 -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-pathway.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 30%, rgba(212,175,55,0.03) 0%, transparent 70%)' }} />
          <div className="max-w-[800px] mx-auto px-6 text-center relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-14" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Readiness in Three Steps.
              </h2>
            </RevealSection>
            <div className="space-y-8 text-left">
              {[
                { step: '1', title: 'Build Your Vault', desc: 'Upload your estate documents and let Estate Guardian\u2122 (EGA) analyze your plan for gaps, contradictions, and missing information. Your IAC begins auto-populating immediately.' },
                { step: '2', title: 'Prepare Your Family', desc: 'Invite your beneficiaries, record Milestone Messages (MM), customize your IAC, and set permissions for who can access what \u2014 and when.' },
                { step: '3', title: 'Live Your Life', desc: 'Your family\'s readiness infrastructure is built. Update it whenever you want. When the time comes \u2014 whether that\'s decades from now or tomorrow \u2014 your family will never be left searching.' },
              ].map(({ step, title, desc }, i) => (
                <RevealSection key={step} delay={i * 0.15}>
                  <div className="flex gap-5 group">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-base" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.25)' }}>
                      {step}
                    </div>
                    <div>
                      <p className="text-white text-base leading-relaxed">
                        <span className="font-bold">Step {step} &mdash; {title}.</span>{' '}
                        <span className="text-[#7b879e]">{desc}</span>
                      </p>
                    </div>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECURITY */}
      <section id="security" className="relative z-50 -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.35]" style={{ backgroundImage: 'url(/texture-family.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.75) 100%)' }} />
          <div className="max-w-[1100px] mx-auto px-6 text-center relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Security That Doesn&apos;t Compromise. Ever.
              </h2>
              <p className="text-[#7b879e] text-base max-w-[700px] mx-auto mb-14 leading-relaxed">
                CarryOn&#8482; is not &ldquo;death tech.&rdquo; We&apos;re a family readiness platform &mdash; built for the living, used by the living, valued by the living. Our security architecture reflects that: your data is yours alone.
              </p>
            </RevealSection>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                { icon: LockIcon, text: 'AES-256 per-estate encryption \u2014 your data is never accessed by our team' },
                { icon: Sparkles, text: 'Estate Guardian\u2122 AI \u2014 analyzes documents within your encrypted vault' },
                { icon: Shield, text: 'Two-factor authentication on every login \u2014 with daily trust option' },
                { icon: Users, text: 'Transition verification by human team \u2014 not algorithms, not AI' },
                { icon: Trash2, text: 'Post-execution record destruction \u2014 DTS records are permanently eliminated' },
                { icon: FileCheck, text: 'SOC 2 & GDPR compliance pending' },
              ].map(({ icon: Icon, text }, i) => (
                <RevealSection key={i} delay={i * 0.08}>
                  <div className="rounded-xl p-6 text-center h-full"
                    style={{ background: 'rgba(15,26,46,0.45)', border: '1px solid rgba(14,165,233,0.06)' }}>
                    <Icon className="w-6 h-6 text-[#7b879e] mx-auto mb-4" />
                    <p className="text-[#94a3b8] text-sm leading-relaxed">{text}</p>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOSPICE */}
      <section className="relative z-[60] -mt-1">
        <div className="rounded-t-[2rem] py-20 lg:py-24 relative overflow-hidden" style={{ background: '#111F34', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.3]" style={{ backgroundImage: 'url(/texture-pulse.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(17,31,52,0.4) 0%, rgba(17,31,52,0.75) 60%, #111F34 100%)' }} />
          <RevealSection className="max-w-[800px] mx-auto px-6 relative z-10">
            <div className="rounded-2xl p-8 lg:p-12 text-center transition-all duration-700 hover:border-[#d4af37]/40" style={{ border: '1px solid rgba(212,175,55,0.25)', background: 'rgba(212,175,55,0.03)' }}>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#d4af37] mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Free for Every American in Hospice Care.
              </h2>
              <p className="text-[#7b879e] text-base leading-relaxed mb-6">
                At any given time, over 300,000 Americans are in hospice &mdash; and the vast majority have no estate plan. CarryOn&#8482; is offered at no cost to all U.S. citizens and resident aliens enrolled in certified hospice care. Full platform access. No exceptions.
              </p>
              <p className="text-white text-base font-semibold italic leading-relaxed">
                No one approaching the end of life should be denied the ability to organize their affairs and prepare their family &mdash; simply because they can&apos;t afford to.
              </p>
            </div>
          </RevealSection>
          <RevealSection delay={0.2} className="max-w-[800px] mx-auto px-6 relative z-10 mt-6">
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="rounded-xl p-6 text-center transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20" style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
                <h4 className="text-white text-base font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Military &amp; Veteran Families</h4>
                <p className="text-[#7b879e] text-sm leading-relaxed">
                  Reduced pricing for active-duty service members, veterans, and their families. Your service prepared you for everything &mdash; let CarryOn help prepare your family.
                </p>
              </div>
              <div className="rounded-xl p-6 text-center transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20" style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
                <h4 className="text-white text-base font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>New Adult Tier (18&ndash;25)</h4>
                <p className="text-[#7b879e] text-sm leading-relaxed">
                  A dedicated tier for young Americans just starting out. Because readiness shouldn&apos;t wait until you think you need it &mdash; it should start the day you&apos;re responsible for yourself.
                </p>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative z-[70] -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32" style={{ background: '#0E1829', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <RevealSection className="max-w-[600px] mx-auto px-6 text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Readiness Starts Today.
            </h2>
            <p className="text-[#7b879e] text-base mb-8">
              Join CarryOn and be among the first families to achieve total readiness.
            </p>
            <button onClick={() => navigateWithFade('/signup')} className="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-semibold text-base transition-transform duration-150 active:scale-95"
              style={{ background: '#d4af37', color: '#0B1221' }}>
              Start Your Free Trial <ChevronRight className="w-4 h-4" />
            </button>
          </RevealSection>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-[80] py-10" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <img src="/carryon-logo.png" alt="CarryOn" className="h-8 opacity-60" />
            <div className="flex items-center gap-6">
              <a href="/privacy" className="text-[#334155] text-xs hover:text-[#7b879e] transition-colors">Privacy Policy</a>
              <a href="/terms" className="text-[#334155] text-xs hover:text-[#7b879e] transition-colors">Terms of Service</a>
              <span className="text-[#334155] text-xs">Accessibility</span>
            </div>
            <div className="text-right text-[#334155] text-xs leading-relaxed">
              <p>1550 Wilson Boulevard 7th Floor</p>
              <p>Arlington, VA 22209 U.S.A.</p>
              <p>(703) 884-1527</p>
            </div>
          </div>
          <p className="text-center text-[#2A3C55] text-xs mt-6">&copy; {new Date().getFullYear()} CarryOn Technologies LLC. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
