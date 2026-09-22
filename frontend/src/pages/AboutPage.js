import React, { useState, useEffect, useRef } from 'react';
import { SEO } from '../components/SEO';
import { ChevronRight, ChevronLeft, Linkedin, ArrowRight } from 'lucide-react';
import { MobileNav, STANDALONE_LINKS } from '../components/landing/MobileNav';
import { founderPhotoUrl, FOUNDER_LINKEDIN_DEFAULT } from '../components/landing/FounderCard';
import { useCopy, renderCopy } from '../copy/CopyContext';
import { SourceRef } from '../components/landing/SourceRef';
import { COMPANY } from '../config/company';
import { getPublic } from '../utils/publicCache';

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
  const { t, flags } = useCopy();
  const [founder, setFounder] = useState({ name: '', title: '', bio: '', photo_url: '', linkedin_url: FOUNDER_LINKEDIN_DEFAULT });

  useEffect(() => {
    getPublic('/public/site-content').then(res => {
      const d = res || {};
      setFounder({
        name: d.founder_name || 'Barnet Harris',
        title: d.founder_title || 'Founder & CEO \u00b7 24-Year U.S. Military Veteran',
        bio: d.founder_bio || 'After 24 years of military service, Barnet saw firsthand what happens when families aren\u2019t prepared. He built CarryOn so that no family \u2014 military or civilian \u2014 has to face a crisis wondering where things are, who to call, or what to do next.',
        photo_url: founderPhotoUrl(d),
        linkedin_url: d.founder_linkedin_url || FOUNDER_LINKEDIN_DEFAULT,
      });
    }).catch(() => {});
  }, []);

  // Land on the hash target (About menu → /about#who) on SPA navigation and full loads alike; the
  // "Remember scroll position" restore skips hash URLs, so this is the single source of the landing spot.
  useEffect(() => {
    const jump = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' }), 120);
    };
    jump();
    window.addEventListener('hashchange', jump);
    return () => window.removeEventListener('hashchange', jump);
  }, []);

  const values = [1, 2, 3, 4, 5].map(n => ({ title: t(`about.values.${n}.title`), desc: t(`about.values.${n}.desc`) }));
  const teams = [1, 2, 3].map(n => ({ title: t(`about.team.${n}.title`), desc: t(`about.team.${n}.desc`) }));
  const valueCard = (v, i, delay, direction) => (
    <RevealSection key={i} delay={delay} direction={direction}>
      <div className="rounded-xl p-6 h-full transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20 hover:shadow-[0_8px_40px_rgba(212,175,55,0.04)]" style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
        <h4 className="text-white text-base font-bold mb-3">{v.title}</h4>
        <p className="text-[#7b879e] text-sm leading-relaxed">{renderCopy(v.desc)}</p>
      </div>
    </RevealSection>
  );

  return (
    <div className="min-h-screen" style={{ background: '#0d1b2a' }}>
      <SEO title={t('about.seo.title')} description={t('about.seo.description')} path="/about" />
      {founder.name && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Person",
          "name": founder.name,
          "jobTitle": founder.title,
          "description": founder.bio,
          "url": "https://carryon.us/about",
          ...(founder.photo_url ? { "image": founder.photo_url } : {}),
          ...(founder.linkedin_url ? { "sameAs": [founder.linkedin_url] } : {}),
          "worksFor": { "@type": "Organization", "name": "CarryOn", "legalName": "CarryOn Technologies LLC", "parentOrganization": { "@type": "Organization", "name": "CarryOn Enterprises Inc" }, "url": "https://www.carryon.us" }
        }) }} />
      )}

      {/* NAV BAR */}
      <nav className="fixed top-0 w-full z-50" style={{ borderBottom: '1px solid rgba(30,48,80,0.3)', background: 'rgba(13,27,42,0.97)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center" data-testid="about-logo">
            <img src="/carryon-logo.png" alt="CarryOn" className="h-12 cursor-pointer" />
          </a>
          <div className="hidden md:flex items-center gap-8">
            <a href="/#features" className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors">{t('nav.features')}</a>
            <a href="/#security" className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors">{t('nav.security')}</a>
            <a href="/#steps" className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors">{t('nav.steps')}</a>
            <span className="text-[#d4af37] text-sm font-medium" aria-current="page">{t('nav.about')}</span>
            <a href="/founder-about" className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors" data-testid="about-nav-founder">{t('nav.founder')}</a>
          </div>
          <div className="flex items-center gap-3">
            <a href="/login" className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1 min-h-[44px] px-2">
              <ChevronLeft className="w-3.5 h-3.5" /> {t('nav.signin')}
            </a>
            <MobileNav links={STANDALONE_LINKS} current="/about" navigateWithFade={(p) => { window.location.href = p; }} testIdSuffix="-about" />
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="pb-20 lg:pb-28 relative overflow-hidden" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))' }}>
        <div className="absolute inset-0 z-0">
          <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(1.3) contrast(1.05) saturate(1.1)' }} />
        </div>
        <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(13,27,42,0.0) 0%, rgba(13,27,42,0.05) 50%, rgba(13,27,42,0.25) 100%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 90% 80% at 20% 80%, rgba(255,255,255,0.12) 0%, transparent 60%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 60% at 10% 50%, rgba(255,255,255,0.08) 0%, transparent 50%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 70% at 85% 85%, rgba(255,255,255,0.14) 0%, transparent 55%)' }} />
        <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-6" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="about-hero-title">
            {t('about.hero.title')}
          </h1>
          <div className="w-16 h-1 mx-auto rounded-full mb-6" style={{ background: '#d4af37' }} />
          <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed">
            {renderCopy(t('about.hero.sub'))}
          </p>
        </RevealSection>
      </section>

      {/* BUILT FOR EVERY FAMILY — layered */}
      <section className="relative z-10 -mt-2">
        <div className="rounded-t-[2.5rem] py-16 lg:py-24 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #152238, #0d1b2a)', boxShadow: '0 -20px 60px rgba(0,0,0,0.5)' }}>
          <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-warmth.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(13,27,42,0.55) 0%, rgba(13,27,42,0.92) 100%)' }} />
          <div className="max-w-[800px] mx-auto px-6 relative z-10">
            <RevealSection>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white text-center mb-8" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {t('about.every.title')}
              </h2>
            </RevealSection>
            <RevealSection delay={0.1}>
              <p className="text-[#7b879e] text-base leading-relaxed mb-6">
                {renderCopy(t('about.every.p1'))}
              </p>
            </RevealSection>
            <RevealSection delay={0.15}>
              <p className="text-[#7b879e] text-base leading-relaxed mb-10">
                {renderCopy(t('about.every.p2'))}<SourceRef id="will" n={2} testIdSuffix="-about" />
              </p>
            </RevealSection>

            <RevealSection delay={0.2}>
              <h3 className="text-xl sm:text-2xl font-bold text-white text-center mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {t('about.every.why')}
              </h3>
            </RevealSection>
            <RevealSection delay={0.25}>
              <p className="text-[#7b879e] text-base leading-relaxed mb-6">
                {renderCopy(t('about.every.p3'), 'text-white font-normal italic')}
              </p>
            </RevealSection>
            <RevealSection delay={0.3}>
              <p className="text-[#7b879e] text-base leading-relaxed mb-10">
                {renderCopy(t('about.every.p4'))}
              </p>
            </RevealSection>

            {/* Quote */}
            <RevealSection delay={0.35}>
              <div className="rounded-xl p-6 lg:p-8 transition-all duration-700 hover:border-l-[#d4af37]" style={{ borderLeft: '3px solid #d4af37', background: 'rgba(212,175,55,0.04)' }}>
                <p className="text-white text-base lg:text-lg italic leading-relaxed">
                  {renderCopy(t('about.every.quote'))}
                </p>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* MISSION & VISION — layered */}
      <section className="relative z-20 -mt-1">
        <div className="rounded-t-[2rem] py-16 lg:py-24 relative overflow-hidden" style={{ background: '#0d1b2a', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'url(/texture-roots.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(212,175,55,0.04) 0%, transparent 60%)' }} />
          <div className="max-w-[900px] mx-auto px-6 relative z-10">
            <div className="grid md:grid-cols-2 gap-6">
              <RevealSection delay={0} direction="left">
                <div className="rounded-xl p-6 lg:p-8 h-full transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20" style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
                  <h3 className="text-[#d4af37] text-lg font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('about.mission.title')}</h3>
                  <p className="text-[#7b879e] text-sm leading-relaxed">
                    {renderCopy(t('about.mission.text'))}
                  </p>
                </div>
              </RevealSection>
              <RevealSection delay={0.12} direction="right">
                <div className="rounded-xl p-6 lg:p-8 h-full transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20" style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
                  <h3 className="text-[#d4af37] text-lg font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('about.vision.title')}</h3>
                  <p className="text-[#7b879e] text-sm leading-relaxed">
                    {renderCopy(t('about.vision.text'))}
                  </p>
                </div>
              </RevealSection>
            </div>
          </div>
        </div>
      </section>

      {/* OUR VALUES — layered with staggered cards */}
      <section className="relative z-30 -mt-1">
        <div className="rounded-t-[2rem] py-16 lg:py-24 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #152238, #0d1b2a)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'url(/texture-circuit.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(13,27,42,0.55) 0%, rgba(13,27,42,0.92) 100%)' }} />
          <div className="max-w-[1000px] mx-auto px-6 relative z-10">
            <RevealSection>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white text-center mb-12" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {t('about.values.title')}
              </h2>
            </RevealSection>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
              {values.slice(0, 3).map((v, i) => valueCard(v, i, i * 0.1, 'up'))}
            </div>
            <div className="grid sm:grid-cols-2 gap-5 max-w-[670px] mx-auto">
              {values.slice(3).map((v, i) => valueCard(v, i + 3, 0.3 + i * 0.12, i === 0 ? 'left' : 'right'))}
            </div>
          </div>
        </div>
      </section>

      {/* WHO WE ARE — layered. `#who` is where the About menu item lands (scroll-margin clears the fixed nav). */}
      <section id="who" className="relative z-40 -mt-1" style={{ scrollMarginTop: 'calc(4rem + env(safe-area-inset-top, 0px))' }} data-testid="about-who-section">
        <div className="rounded-t-[2rem] py-16 lg:py-24 relative overflow-hidden" style={{ background: '#0d1b2a', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-family.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(13,27,42,0.45) 0%, rgba(13,27,42,0.88) 100%)' }} />
          <div className="max-w-[800px] mx-auto px-6 relative z-10">
            <RevealSection>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white text-center mb-8" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {t('about.who.title')}
              </h2>
            </RevealSection>
            <RevealSection delay={0.1}>
              <p className="text-[#7b879e] text-base leading-relaxed mb-6">
                {renderCopy(t('about.who.p1'))}
              </p>
            </RevealSection>
            <RevealSection delay={0.15}>
              <p className="text-[#7b879e] text-base leading-relaxed mb-10">
                {renderCopy(t('about.who.p2'))}
              </p>
            </RevealSection>

            {/* Founder Block (D3.3) — data from Founder Portal */}
            <RevealSection delay={0.18}>
              <div className="rounded-2xl p-6 lg:p-8 mb-10 flex flex-col sm:flex-row items-center gap-6" style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.15)' }}>
                {founder.photo_url ? (
                  <img src={founder.photo_url} alt={founder.name} className="w-24 h-24 rounded-full object-cover flex-shrink-0" style={{ border: '2px solid rgba(212,175,55,0.3)' }} data-testid="founder-photo"
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                ) : null}
                <div className="w-24 h-24 rounded-full flex-shrink-0 items-center justify-center text-3xl font-bold" style={{ background: 'rgba(212,175,55,0.12)', color: '#d4af37', border: '2px solid rgba(212,175,55,0.3)', display: founder.photo_url ? 'none' : 'flex' }} data-testid="founder-photo-placeholder">
                  {founder.name ? founder.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'BH'}
                </div>
                <div className="text-center sm:text-left">
                  <h3 className="text-white text-lg font-bold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{founder.name}</h3>
                  <p className="text-[#d4af37] text-xs font-semibold mb-3">{founder.title}</p>
                  <p className="text-[#7b879e] text-sm leading-relaxed">{founder.bio}</p>
                  {founder.linkedin_url && (
                    <a href={founder.linkedin_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-[#0A66C2] hover:text-[#004182] transition-colors" data-testid="founder-linkedin-link">
                      <Linkedin className="w-4 h-4" /> {t('about.who.linkedin')}
                    </a>
                  )}
                  {flags.founder_story_public && (
                    <div className="mt-4">
                      <a href="/founder-about" className="founder-story-pill inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold hover:brightness-110 active:scale-95 transition-[filter,transform]" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="about-founder-story-pill">
                        Meet the Founder <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </RevealSection>

            {/* Team Cards */}
            <div className="grid sm:grid-cols-3 gap-5">
              {teams.map(({ title, desc }, i) => (
                <RevealSection key={i} delay={0.2 + i * 0.1}>
                  <div className="rounded-xl p-6 text-center h-full transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20" style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
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
        <div className="rounded-t-[2rem] py-20 lg:py-28 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #152238, #0d1b2a)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-pulse.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 50% 50% at 50% 60%, rgba(212,175,55,0.05) 0%, transparent 70%)' }} />
          <RevealSection className="max-w-[600px] mx-auto px-6 text-center relative z-10">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white italic mb-8" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {t('about.cta.title')}
            </h2>
            <a href="/start" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm transition-all hover:brightness-110 hover:scale-105 active:scale-95"
              style={{ background: '#d4af37', color: '#0B1221', transition: 'all 0.3s' }}>
              {t('about.cta.button')} <ChevronRight className="w-4 h-4" />
            </a>
          </RevealSection>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-[60] py-10" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <a href="/login"><img src="/carryon-logo.png" alt="CarryOn" className="h-8 opacity-60" /></a>
            <div className="flex items-center gap-6">
              <a href="/privacy" className="text-[#3a4a63] text-xs hover:text-[#7b879e] transition-colors">{t('footer.privacy')}</a>
              <a href="/terms" className="text-[#3a4a63] text-xs hover:text-[#7b879e] transition-colors">{t('footer.terms')}</a>
              <span className="text-[#3a4a63] text-xs">{t('footer.accessibility')}</span>
            </div>
            <div className="text-right text-[#3a4a63] text-xs leading-relaxed">
              <p>{COMPANY.addressLine1}</p>
              <p>{COMPANY.addressLine2} U.S.A.</p>
              <p data-testid="about-footer-phone">{COMPANY.phone}</p>
            </div>
          </div>
          <p className="text-center text-[#2d3d55] text-xs mt-6">&copy; {new Date().getFullYear()} {t('footer.copyright')}</p>
          <p className="text-center text-[#2d3d55] text-xs mt-1" data-testid="about-corporate-disclosure">CarryOn is operated by {COMPANY.disclosure}.</p>
        </div>
      </footer>
    </div>
  );
};

export default AboutPage;
