import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, ChevronRight, ChevronDown, Lock as LockIcon, Sparkles, FileCheck, UserCheck, Trash2, ClipboardCheck, MessageSquare, Key, Layers, Smartphone, MapPin, ShieldAlert, ArrowUpDown, SlidersHorizontal, Radio, MessageCircle } from 'lucide-react';

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
          <img src="/carryon-logo.png" alt="CarryOn" className="h-12 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} data-testid="home-logo" />
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
              The digital family preparedness platform that brings together every aspect of your life &mdash; so your loved ones can CarryOn through anything.
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

      {/* ABOUT — THE NEW CATEGORY */}
      <section id="about" className="relative z-10 -mt-2">
        <div className="rounded-t-[2.5rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -20px 60px rgba(0,0,0,0.5)' }}>
          <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-roots.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(212,175,55,0.03) 0%, transparent 60%), linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.85) 100%)' }} />
          <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              More Than Estate Planning.<br />
              <span className="text-[#d4af37]">Total Family Preparedness.</span>
            </h2>
            <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-6">
              Life doesn&apos;t wait for the perfect moment to throw a challenge your way. A sudden illness. A natural disaster. An unexpected loss. The families that get through it aren&apos;t the ones who saw it coming &mdash; they&apos;re the ones who were prepared.
            </p>
            <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-8">
              CarryOn&#8482; is the first holistic digital family preparedness platform &mdash; a secure place to organize your documents, leave messages for the people you love, build action plans for any scenario, and ensure that no matter what happens, your family has everything they need to maintain continuity, stay connected, and move forward together.
            </p>
            <button onClick={() => navigateWithFade('/signup')} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm transition-transform duration-150 active:scale-95"
              style={{ background: '#d4af37', color: '#0B1221' }}>
              Get Started <ChevronRight className="w-4 h-4" />
            </button>
            <RevealSection delay={0.2}>
              <p className="mt-10 text-[#d4af37] text-sm lg:text-base italic font-medium">
                We can&apos;t fill your pantry with sardine cans. But we can give your family the one tool that brings it all together &mdash; so they can CarryOn.
              </p>
            </RevealSection>
          </RevealSection>
        </div>
      </section>

      {/* REFRAME — WHY NOW */}
      <section className="relative z-20 -mt-1">
        <div className="rounded-t-[2rem] py-20 lg:py-28 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.3]" style={{ backgroundImage: 'url(/texture-warmth.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.45) 0%, rgba(14,24,41,0.85) 100%)' }} />
          <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Valuable Right Now.<br />
              <span className="text-[#d4af37]">Essential When It Matters Most.</span>
            </h2>
            <p className="text-[#7b879e] text-base leading-relaxed mb-8">
              Family preparedness isn&apos;t something you do once and forget. It&apos;s a living system that grows with your family. Every document you upload, every message you record, every plan you build &mdash; it all becomes part of a readiness infrastructure your family can rely on through any of life&apos;s biggest challenges. A job loss. A health crisis. A move across the country. The passing of someone you love. CarryOn&#8482; ensures your family never has to wonder where to look, who to call, or what to do next.
            </p>
            <RevealSection delay={0.15}>
              <p className="text-white text-base lg:text-lg font-semibold italic leading-relaxed">
                You don&apos;t buy life insurance because you plan to die. You buy it because you plan to take care of your family. CarryOn works the same way &mdash; it&apos;s just as valuable today as it is decades from now.
              </p>
            </RevealSection>
          </RevealSection>
        </div>
      </section>

      {/* CORE FEATURES — 8 features in priority order */}
      <section id="features" className="relative z-30 -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.16]" style={{ backgroundImage: 'url(/texture-circuit.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.4) 0%, rgba(14,24,41,0.8) 100%)' }} />
          <div className="max-w-[1100px] mx-auto px-6 relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Eight Pillars of Family Readiness.
              </h2>
              <p className="text-[#7b879e] text-base text-center max-w-[700px] mx-auto mb-16 leading-relaxed">
                Each pillar builds on the last &mdash; creating a complete family preparedness architecture, one step at a time.
              </p>
            </RevealSection>
            <div className="max-w-[720px] mx-auto">
              {[
                {
                  num: '01',
                  icon: MessageSquare,
                  title: 'Milestone Messages',
                  abbr: 'MM',
                  bold: 'Your words at their wedding. Your voice on their birthday. Your love \u2014 delivered exactly when it matters.',
                  desc: 'Record written, audio, or video messages for the milestones you want to be part of \u2014 even if you can\'t be there. Graduations, births, first homes, or any moment you choose. Create them infinitely over time, and they\'re delivered exactly as you envision.',
                  bridge: 'Your messages start the journey. But your family also needs access to the documents behind your wishes.',
                },
                {
                  num: '02',
                  icon: LockIcon,
                  title: 'Secure Document Vault',
                  abbr: 'SDV',
                  bold: 'Every will, trust, policy, and deed \u2014 encrypted, organized, and accessible to the right people at the right time.',
                  desc: 'Upload your most critical family documents into a per-estate encrypted vault with AES-256 encryption and Triple Lock protection. Your beneficiaries access exactly what you authorize \u2014 and your documents become the foundation that powers everything else.',
                  bridge: 'Once your documents are uploaded, the platform can start working for you automatically.',
                },
                {
                  num: '03',
                  icon: Sparkles,
                  title: 'Estate Guardian\u2122 AI',
                  abbr: 'EGA',
                  bold: 'An AI analyst trained on U.S. law across all 50 states \u2014 working inside your encrypted vault to find what you missed.',
                  desc: 'EGA analyzes your uploaded documents for contradictions, gaps, outdated provisions, and missing pieces. It identifies critical details \u2014 claim phone numbers, executor contacts, filing deadlines \u2014 and auto-populates the beginnings of your personalized action plan. No team reads your documents. The AI works entirely within your encryption.',
                  bridge: 'What EGA finds feeds directly into a clear, actionable plan your family can follow.',
                },
                {
                  num: '04',
                  icon: ClipboardCheck,
                  title: 'Immediate Action Checklist',
                  abbr: 'IAC',
                  bold: 'A step-by-step guide your family can follow on the hardest days of their lives.',
                  desc: 'Partially auto-created by EGA from your documents and fully customizable by you. When a crisis hits, your family opens the IAC and knows exactly what to do, who to call, where to find every document, and what deadlines matter. No guessing. No searching. No overwhelm.',
                  bridge: 'Your checklist handles the immediate steps. Contingency Protocols handle the bigger scenarios.',
                },
                {
                  num: '05',
                  icon: Radio,
                  title: 'Contingency Protocols',
                  abbr: 'CCP',
                  bold: 'Pre-built response plans for the scenarios your family might face \u2014 ready to activate at a moment\u2019s notice.',
                  desc: 'Build contingency protocols for any situation: medical emergencies, natural disasters, financial disruptions, or the passing of a family member. Each protocol connects your people, your documents, your checklists, and your communication channels into one coordinated plan your family can execute together.',
                  bridge: 'Every protocol needs a secure, private channel for your family to coordinate through.',
                },
                {
                  num: '06',
                  icon: MessageCircle,
                  title: 'Estate Communications Tool',
                  abbr: 'ECT',
                  bold: 'Secure, encrypted family messaging that powers your protocols and keeps your family connected when it counts.',
                  desc: 'ECT is the communication backbone of your family\'s readiness infrastructure. End-to-end encrypted conversations between benefactors and beneficiaries, purpose-built for sensitive family coordination. When a contingency protocol activates, ECT is how your family stays in sync \u2014 privately and securely.',
                  bridge: 'With your plans and communication secured, the last step is organizing your digital life.',
                },
                {
                  num: '07',
                  icon: Key,
                  title: 'Digital Access Vault',
                  abbr: 'DAV',
                  bold: 'Passwords, accounts, crypto keys, and digital credentials \u2014 saved, encrypted, and assigned to the right people.',
                  desc: 'The modern family has dozens of digital accounts, subscriptions, financial platforms, and access credentials that need to be passed down and organized. DAV stores them all in your encrypted vault, assigned to specific beneficiaries, so nothing is lost and nothing is forgotten.',
                  bridge: 'Finally, make sure the right people know how to reach the right people.',
                },
                {
                  num: '08',
                  icon: Users,
                  title: 'Family & Friends Notification',
                  abbr: 'FFN',
                  bold: 'The people who matter most should never hear important news through the grapevine.',
                  desc: 'Build a personalized notification list of family, friends, colleagues, and anyone your beneficiaries should contact during a transition or emergency. Names, phone numbers, relationships, and special notes \u2014 all organized and ready so your family can coordinate outreach without scrambling.',
                  bridge: null,
                },
              ].map(({ num, icon: Icon, title, abbr, bold, desc, bridge }, i) => (
                <div key={num}>
                  <RevealSection delay={i * 0.06}>
                    <div className="rounded-xl p-6 lg:p-8 relative"
                      style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
                      {/* Number badge */}
                      <div className="absolute -top-4 -left-2 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: '#d4af37', color: '#0B1221', boxShadow: '0 4px 16px rgba(212,175,55,0.3)' }}>
                        {num}
                      </div>
                      <div className="flex items-center gap-3 mb-4 ml-6">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.15)' }}>
                          <Icon className="w-5 h-5 text-[#d4af37]" />
                        </div>
                        <div>
                          <h4 className="text-white text-lg font-semibold leading-tight">{title}</h4>
                          <span className="text-[#6b7a90] text-xs font-mono">{abbr}</span>
                        </div>
                      </div>
                      <p className="text-[#d4af37] text-sm font-medium mb-3 leading-relaxed">{bold}</p>
                      <p className="text-[#6b7a90] text-sm leading-relaxed">{desc}</p>
                    </div>
                  </RevealSection>
                  {/* Bridge connector — the organic link to the next feature */}
                  {bridge && (
                    <RevealSection delay={i * 0.06 + 0.04}>
                      <div className="flex items-stretch gap-0 py-4 pl-4">
                        <div className="w-px flex-shrink-0" style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.3), rgba(212,175,55,0.08))' }} />
                        <p className="text-[#7b879e] text-xs italic pl-5 leading-relaxed">{bridge}</p>
                      </div>
                    </RevealSection>
                  )}
                </div>
              ))}

              {/* Completion statement */}
              <RevealSection delay={0.6}>
                <div className="mt-8 text-center rounded-xl p-6" style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.15)' }}>
                  <p className="text-[#d4af37] text-base font-semibold italic leading-relaxed">
                    Together, these eight pillars create a complete family readiness architecture &mdash; one that grows with your family, protects what matters most, and ensures your loved ones can CarryOn through anything.
                  </p>
                </div>
              </RevealSection>
            </div>
          </div>
        </div>
      </section>

      {/* PLATFORM CAPABILITIES */}
      <section className="relative z-[35] -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.2]" style={{ backgroundImage: 'url(/texture-warmth.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.45) 0%, rgba(14,24,41,0.82) 100%)' }} />
          <div className="max-w-[1100px] mx-auto px-6 relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Built for Real Families.
              </h2>
              <p className="text-[#7b879e] text-base text-center max-w-[650px] mx-auto mb-14 leading-relaxed">
                Beyond the core pillars, CarryOn&#8482; gives your family a complete readiness infrastructure with tools designed for how modern families actually live.
              </p>
            </RevealSection>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { icon: UserCheck, title: 'Benefactor & Beneficiary System', desc: 'Enroll the people who matter most. Control what each person can see, access, and manage within your family\'s readiness plan.' },
                { icon: ArrowUpDown, title: 'Succession Hierarchy', desc: 'Ranked beneficiary succession with automatic promotion when a primary can no longer serve. Your chain of responsibility never breaks.' },
                { icon: Layers, title: 'Multi-Estate Support', desc: 'Manage multiple estates under one account &mdash; built for blended, extended, and modern families with complex structures.' },
                { icon: Users, title: 'Family Plan Savings', desc: 'Bundle your household for percentage-based discounts on every tier. The more family members you prepare, the more you save.' },
                { icon: ShieldAlert, title: 'Emergency Access', desc: 'Verified protocol for beneficiaries to request vault access when a benefactor is incapacitated. Built for real emergencies.' },
                { icon: SlidersHorizontal, title: 'Section Permissions', desc: 'Control exactly what each beneficiary can see &mdash; vault, messages, checklists, protocols, and more. Granular, per-person access.' },
                { icon: Smartphone, title: 'Native Mobile App', desc: 'iOS and Android with biometric login, push notifications, and full platform access. Your family\'s readiness goes wherever you go.' },
                { icon: MapPin, title: '50-State Legal Intelligence', desc: 'Estate Guardian calibrates every analysis to your declared state of residence and its specific laws. Personalized, not generic.' },
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

      {/* HOW IT WORKS */}
      <section id="steps" className="relative z-40 -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-pathway.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 30%, rgba(212,175,55,0.03) 0%, transparent 70%)' }} />
          <div className="max-w-[800px] mx-auto px-6 text-center relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Family Readiness in Five Steps.
              </h2>
              <p className="text-[#7b879e] text-base max-w-[600px] mx-auto mb-14 leading-relaxed">
                You don&apos;t need to do it all at once. Start with what matters most and build your family&apos;s readiness over time.
              </p>
            </RevealSection>
            <div className="space-y-8 text-left">
              {[
                { step: '1', title: 'Enroll Your Family', desc: 'Invite your beneficiaries \u2014 the people who matter most. Set their roles, permissions, and access levels. Your family\'s readiness starts with the people in it.' },
                { step: '2', title: 'Leave Your Messages', desc: 'Record Milestone Messages for the moments you want to be part of \u2014 graduations, weddings, birthdays, or just a Tuesday. Create them over time, as many as you want, delivered exactly as you envision.' },
                { step: '3', title: 'Upload & Analyze', desc: 'Upload your documents into the Secure Document Vault. Estate Guardian\u2122 AI analyzes everything and auto-creates the beginnings of your personalized Immediate Action Checklist \u2014 so your family has a clear plan from day one.' },
                { step: '4', title: 'Build Your Protocols', desc: 'Create Contingency Protocols for the scenarios that matter to your family. Connect your documents, checklists, and communication channels into coordinated response plans. Use the Estate Communications Tool to keep everyone in sync.' },
                { step: '5', title: 'Live Your Life', desc: 'Your family\'s readiness infrastructure is built. Save credentials in the Digital Access Vault, organize contacts in Family & Friends Notification, and update your plan whenever life changes. When any challenge comes \u2014 your family will never be left searching.' },
              ].map(({ step, title, desc }, i) => (
                <RevealSection key={step} delay={i * 0.12}>
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

      {/* SECURITY — woven into the family narrative */}
      <section id="security" className="relative z-50 -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.35]" style={{ backgroundImage: 'url(/texture-family.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.75) 100%)' }} />
          <div className="max-w-[1100px] mx-auto px-6 text-center relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Your Family&apos;s Privacy Is Non-Negotiable.
              </h2>
              <p className="text-[#7b879e] text-base max-w-[700px] mx-auto mb-14 leading-relaxed">
                The most important things your family will ever share live on this platform. That&apos;s why every layer of CarryOn&#8482; is built with the same security standards that protect financial institutions and government systems &mdash; because your family deserves nothing less.
              </p>
            </RevealSection>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                { icon: LockIcon, text: 'AES-256 per-estate encryption \u2014 your family\'s data is never accessed by our team' },
                { icon: Sparkles, text: 'Estate Guardian\u2122 AI operates entirely within your encrypted vault \u2014 no data ever leaves' },
                { icon: Shield, text: 'Two-factor authentication on every login with device trust options for your family' },
                { icon: Users, text: 'Transition verification by a human team \u2014 not algorithms, not AI. Real people confirming real events.' },
                { icon: Trash2, text: 'Post-execution record destruction \u2014 sensitive records are permanently eliminated after tasks complete' },
                { icon: FileCheck, text: 'SOC 2 compliance architecture with full audit trail and GDPR data rights built in' },
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

      {/* HOSPICE & MILITARY */}
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
                At any given time, over 300,000 Americans are in hospice &mdash; and the vast majority have no plan in place for their families. CarryOn&#8482; is offered at no cost to all U.S. citizens and resident aliens enrolled in certified hospice care. Full platform access. No exceptions. No fine print.
              </p>
              <p className="text-white text-base font-semibold italic leading-relaxed">
                No one should be denied the ability to organize their affairs and prepare their family &mdash; simply because of their circumstances.
              </p>
            </div>
          </RevealSection>
          <RevealSection delay={0.2} className="max-w-[800px] mx-auto px-6 relative z-10 mt-6">
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="rounded-xl p-6 text-center transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20" style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
                <h4 className="text-white text-base font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Military &amp; Veteran Families</h4>
                <p className="text-[#7b879e] text-sm leading-relaxed">
                  Reduced pricing for active-duty service members, veterans, and their families. Your service prepared you for everything &mdash; let CarryOn help prepare your family for anything else.
                </p>
              </div>
              <div className="rounded-xl p-6 text-center transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20" style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
                <h4 className="text-white text-base font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>New Adult Tier (18&ndash;25)</h4>
                <p className="text-[#7b879e] text-sm leading-relaxed">
                  A dedicated tier for young Americans just starting out. Because family preparedness shouldn&apos;t start when you think you need it &mdash; it should start the day you&apos;re responsible for yourself.
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
              Your Family&apos;s Readiness<br />Starts Today.
            </h2>
            <p className="text-[#7b879e] text-base mb-8">
              Join the families who are choosing preparedness over uncertainty. Whatever comes next &mdash; your family will be ready.
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
