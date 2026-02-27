import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Shield } from 'lucide-react';

/* ─── scroll-reveal hook ─── */
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
  const transforms = { up: 'translateY(60px)', down: 'translateY(-60px)', left: 'translateX(60px)', right: 'translateX(-60px)' };
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translate(0)' : transforms[direction],
      transition: `opacity 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
    }} {...props}>
      {children}
    </div>
  );
};

const AboutPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ background: '#080e1a' }}>

      {/* NAV BAR */}
      <nav className="fixed top-0 w-full z-50" style={{ borderBottom: '1px solid rgba(212,175,55,0.08)', background: 'rgba(8,14,26,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <a href="/login" className="flex items-center">
            <img src="/carryon-logo.jpg" alt="CarryOn" className="h-9" />
          </a>
          <div className="hidden md:flex items-center gap-8">
            <a href="/login#features" className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors">Features</a>
            <a href="/login#security" className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors">Security</a>
            <a href="/login#steps" className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors">How It Works</a>
            <span className="text-[#d4af37] text-sm font-medium">About</span>
          </div>
          <a href="/login" className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1">
            <ChevronLeft className="w-3.5 h-3.5" /> Sign In
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section className="pt-32 pb-20 lg:pt-40 lg:pb-28 relative overflow-hidden">
        <div className="absolute inset-0 z-0" style={{ opacity: 0.2 }}>
          <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(8,14,26,0.5) 0%, rgba(8,14,26,0.9) 70%, #080e1a 100%)' }} />
        <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
            We Believe Readiness Is the Greatest Gift a Family Can Give Itself.
          </h1>
          <div className="w-16 h-1 mx-auto rounded-full mb-6" style={{ background: '#d4af37' }} />
          <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed">
            CarryOn&#8482; was built because every family deserves to be organized, informed, and prepared &mdash; regardless of income, background, or circumstance.
          </p>
        </RevealSection>
      </section>

      {/* BUILT FOR EVERY FAMILY — layered */}
      <section className="relative z-10 -mt-2">
        <div className="rounded-t-[2.5rem] py-16 lg:py-24" style={{ background: 'linear-gradient(180deg, #0a1628, #080e1a)', boxShadow: '0 -20px 60px rgba(0,0,0,0.5)' }}>
          <div className="max-w-[800px] mx-auto px-6">
            <RevealSection>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white text-center mb-8" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Built for Every Family. Period.
              </h2>
            </RevealSection>
            <RevealSection delay={0.1}>
              <p className="text-[#7b879e] text-base leading-relaxed mb-6">
                You know the scenario. Someone you love is gone &mdash; and suddenly you&apos;re standing in their kitchen, opening drawers, looking for a will that might not exist, calling numbers you&apos;re not sure are right, trying to figure out what they wanted while barely holding yourself together.
              </p>
            </RevealSection>
            <RevealSection delay={0.15}>
              <p className="text-[#7b879e] text-base leading-relaxed mb-10">
                76% of American families will face exactly this. Not because they didn&apos;t care &mdash; but because no one gave them a simple, secure, affordable way to get ready.
              </p>
            </RevealSection>

            <RevealSection delay={0.2}>
              <h3 className="text-xl sm:text-2xl font-bold text-white text-center mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                That&apos;s why CarryOn exists.
              </h3>
            </RevealSection>
            <RevealSection delay={0.25}>
              <p className="text-[#7b879e] text-base leading-relaxed mb-6">
                Not only for the wealthy families who already have estate attorneys on retainer. Not only for the tech-savvy early adopters who track everything in spreadsheets. For <em className="text-white">every</em> family &mdash; the single parent working two jobs who needs a checklist their kids can follow, the young couple who just bought their first home and realized they have no plan, the grandparent who wants their voice heard at a graduation they might not make, the blended family navigating who gets what and who needs to know.
              </p>
            </RevealSection>
            <RevealSection delay={0.3}>
              <p className="text-[#7b879e] text-base leading-relaxed mb-10">
                CarryOn is the platform that meets all of them where they are &mdash; with security they can trust, simplicity they can use, and a price they can afford.
              </p>
            </RevealSection>

            {/* Quote */}
            <RevealSection delay={0.35}>
              <div className="rounded-xl p-6 lg:p-8 transition-all duration-700 hover:border-l-[#d4af37]" style={{ borderLeft: '3px solid #d4af37', background: 'rgba(212,175,55,0.04)' }}>
                <p className="text-white text-base lg:text-lg italic leading-relaxed">
                  We&apos;re not a &ldquo;death tech&rdquo; company. We don&apos;t build products for dying. We build infrastructure for living &mdash; so that when the hardest day comes, your family isn&apos;t searching. They&apos;re ready.
                </p>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* MISSION & VISION — layered */}
      <section className="relative z-20 -mt-1">
        <div className="rounded-t-[2rem] py-16 lg:py-24" style={{ background: '#080e1a', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="max-w-[900px] mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-6">
              <RevealSection delay={0} direction="left">
                <div className="rounded-xl p-6 lg:p-8 h-full transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20" style={{ background: 'rgba(15,24,42,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <h3 className="text-[#d4af37] text-lg font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Our Mission</h3>
                  <p className="text-[#7b879e] text-sm leading-relaxed">
                    Ensure every American family has the clarity, organization, and readiness they need for life&apos;s most critical transitions &mdash; reducing overwhelm through secure estate infrastructure and intelligent document analysis.
                  </p>
                </div>
              </RevealSection>
              <RevealSection delay={0.12} direction="right">
                <div className="rounded-xl p-6 lg:p-8 h-full transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20" style={{ background: 'rgba(15,24,42,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <h3 className="text-[#d4af37] text-lg font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Our Vision</h3>
                  <p className="text-[#7b879e] text-sm leading-relaxed">
                    Define the family readiness category and become the standard for families and institutions that refuse to leave their affairs to chance.
                  </p>
                </div>
              </RevealSection>
            </div>
          </div>
        </div>
      </section>

      {/* OUR VALUES — layered with staggered cards */}
      <section className="relative z-30 -mt-1">
        <div className="rounded-t-[2rem] py-16 lg:py-24 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a1628, #080e1a)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'url(/texture-family.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,22,40,0.7) 0%, rgba(8,14,26,0.95) 100%)' }} />
          <div className="max-w-[1000px] mx-auto px-6 relative z-10">
            <RevealSection>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white text-center mb-12" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Our Values
              </h2>
            </RevealSection>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
              {[
                {
                  title: 'Readiness Over Reaction.',
                  desc: 'We don\'t wait for crisis. We prepare for it.',
                },
                {
                  title: 'Security Without Compromise.',
                  desc: 'Zero-knowledge encryption. Air-gapped AI. No backdoors. No exceptions.',
                },
                {
                  title: 'Accessible to Every Family.',
                  desc: 'Not just the wealthy. Not just the tech-savvy. Not just the married, the traditional, or the conventional. Every family \u2014 however you define yours.',
                },
              ].map(({ title, desc }, i) => (
                <RevealSection key={title} delay={i * 0.1}>
                  <div className="rounded-xl p-6 h-full transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20 hover:shadow-[0_8px_40px_rgba(212,175,55,0.04)]" style={{ background: 'rgba(15,24,42,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h4 className="text-white text-base font-bold mb-3">{title}</h4>
                    <p className="text-[#7b879e] text-sm leading-relaxed">{desc}</p>
                  </div>
                </RevealSection>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-5 max-w-[670px] mx-auto">
              {[
                {
                  title: 'Lean by Design.',
                  desc: 'Every dollar earns its keep. Every feature ships because families need it \u2014 not because investors want it.',
                },
                {
                  title: 'People First. Always.',
                  desc: 'Behind every document in our vault is a person someone loves. Behind every checklist item is a task someone will face on the worst day of their life. We never forget that. Our platform is secure and automated, but our operational teams are real people \u2014 trained, empathetic, and personally invested in getting this right for your family.',
                },
              ].map(({ title, desc }, i) => (
                <RevealSection key={title} delay={0.3 + i * 0.12} direction={i === 0 ? 'left' : 'right'}>
                  <div className="rounded-xl p-6 h-full transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20 hover:shadow-[0_8px_40px_rgba(212,175,55,0.04)]" style={{ background: 'rgba(15,24,42,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h4 className="text-white text-base font-bold mb-3">{title}</h4>
                    <p className="text-[#7b879e] text-sm leading-relaxed">{desc}</p>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* WHO WE ARE — layered */}
      <section className="relative z-40 -mt-1">
        <div className="rounded-t-[2rem] py-16 lg:py-24" style={{ background: '#080e1a', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="max-w-[800px] mx-auto px-6">
            <RevealSection>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white text-center mb-8" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Who We Are
              </h2>
            </RevealSection>
            <RevealSection delay={0.1}>
              <p className="text-[#7b879e] text-base leading-relaxed mb-6">
                CarryOn is led by a small, focused team that believes this work matters. Our leadership brings deep experience across operations, legal, finance, and technology &mdash; but what unites us isn&apos;t our r&eacute;sum&eacute;s. It&apos;s the shared conviction that 76% is an unacceptable number, and that every family &mdash; regardless of who they are, where they live, or what they look like &mdash; deserves to be ready.
              </p>
            </RevealSection>
            <RevealSection delay={0.15}>
              <p className="text-[#7b879e] text-base leading-relaxed mb-10">
                Our operational workforce is a nationwide network of remote professionals working through a proprietary task assignment system. They&apos;re trained for empathy, precision, and the kind of care this work demands. Three teams. One mission.
              </p>
            </RevealSection>

            {/* Team Cards */}
            <div className="grid sm:grid-cols-3 gap-5">
              {[
                {
                  title: 'Customer Service Team (CST)',
                  desc: '24/7 platform support',
                },
                {
                  title: 'Transition Verification Team (TVT)',
                  desc: 'Death certificate verification and beneficiary activation',
                },
                {
                  title: 'Trustee Services Team (TST)',
                  desc: 'Confidential execution of Designated Trustee Services tasks',
                },
              ].map(({ title, desc }, i) => (
                <RevealSection key={title} delay={0.2 + i * 0.1}>
                  <div className="rounded-xl p-6 text-center h-full transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20" style={{ background: 'rgba(15,24,42,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h4 className="text-[#d4af37] text-sm font-bold mb-2 leading-snug">{title}</h4>
                    <p className="text-[#7b879e] text-xs leading-relaxed">{desc}</p>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA — layered */}
      <section className="relative z-50 -mt-1">
        <div className="rounded-t-[2rem] py-20 lg:py-28 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a1628, #080e1a)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.1]" style={{ backgroundImage: 'url(/texture-shield.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(212,175,55,0.04) 0%, transparent 70%)' }} />
          <RevealSection className="max-w-[600px] mx-auto px-6 text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white italic mb-8" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Your Family Deserves to Be Ready.
            </h2>
            <a href="/signup" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm transition-all hover:brightness-110 hover:scale-105 active:scale-95"
              style={{ background: '#d4af37', color: '#080e1a', transition: 'all 0.3s' }}>
              Get Started <ChevronRight className="w-4 h-4" />
            </a>
          </RevealSection>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-[60] py-10" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <a href="/login"><img src="/carryon-logo.jpg" alt="CarryOn" className="h-8 opacity-60" /></a>
            <div className="flex items-center gap-6">
              <a href="/privacy" className="text-[#3a4a63] text-xs hover:text-[#7b879e] transition-colors">Privacy Policy</a>
              <a href="/terms" className="text-[#3a4a63] text-xs hover:text-[#7b879e] transition-colors">Terms of Service</a>
              <span className="text-[#3a4a63] text-xs">Accessibility</span>
            </div>
            <div className="text-right text-[#3a4a63] text-xs leading-relaxed">
              <p>1550 Wilson Boulevard 7th Floor</p>
              <p>Arlington, VA 22209 U.S.A.</p>
              <p>(703) 884-1527</p>
            </div>
          </div>
          <p className="text-center text-[#2d3d55] text-xs mt-6">&copy; {new Date().getFullYear()} CarryOn Technologies. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default AboutPage;
