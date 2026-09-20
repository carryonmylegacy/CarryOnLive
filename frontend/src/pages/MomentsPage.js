import React from 'react';
import { Mic, CalendarHeart, Send } from 'lucide-react';
import { SEO } from '../components/SEO';
import { useCopy, renderCopy } from '../copy/CopyContext';
import { ProductPreview } from '../components/landing/ProductPreview';
import { RevealSection } from '../components/landing/RevealSection';
import { BenefactorNav, CtaButton, HEADING } from '../components/benefactor/BenefactorHero';
import { BenefactorMessages, BenefactorTrust } from '../components/benefactor/BenefactorStory';
import { BenefactorFooter } from '../components/benefactor/BenefactorClose';
import { useAcquisition } from '../components/benefactor/useAcquisition';
import { useFounder } from '../components/landing/FounderCard';

const STEP_ICONS = [Mic, CalendarHeart, Send];
const CARD = { background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(183,148,246,0.25)' };

/* Paid-traffic landing page #3 — Milestone Messages, the emotional hook. Every CTA goes to the no-card
 * door tagged `landing_page: moments`. Not linked from the site navigation and not indexed. */
export default function MomentsPage() {
  const { t } = useCopy();
  const { days, go, navigate } = useAcquisition('moments');
  const founder = useFounder();

  return (
    <div className="min-h-screen" style={{ background: '#0B1221' }} data-testid="moments-page">
      <SEO title={t('moments.seo.title')} description={t('moments.seo.description')} path="/moments" noindex />
      <BenefactorNav onSignIn={() => navigate('/login')} />

      <section className="relative text-center px-6" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))', paddingBottom: '3rem', background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(139,92,246,0.14) 0%, transparent 60%)' }} data-testid="moments-hero">
        <div className="max-w-[820px] mx-auto">
          <p className="text-[#B794F6] text-xs sm:text-sm font-bold uppercase tracking-[0.2em] mb-5" data-testid="moments-hero-eyebrow">{t('moments.hero.eyebrow')}</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-6" style={HEADING} data-testid="moments-hero-h1">
            {t('moments.hero.h1a')}<br /><span className="text-[#d4af37]">{t('moments.hero.h1b')}</span>
          </h1>
          <p className="text-[#a0aec0] text-base md:text-lg leading-relaxed max-w-[680px] mx-auto mb-8" data-testid="moments-hero-sub">{renderCopy(t('moments.hero.sub'))}</p>
          <CtaButton label={t('moments.hero.cta')} onClick={() => go('hero')} testId="moments-hero-cta" />
          {days != null && <p className="text-[#8b97ab] text-sm mt-4" data-testid="moments-hero-nocard">{t('moments.hero.nocard', { days })}</p>}
        </div>
      </section>

      {founder.video_id && (
        <section className="px-6 pb-12" data-testid="moments-video">
          <RevealSection className="max-w-[900px] mx-auto">
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(212,175,55,0.25)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', aspectRatio: '16 / 9', background: '#0b1322' }}>
              <iframe src={`https://www.youtube.com/embed/${founder.video_id}?rel=0&modestbranding=1`} title={`${founder.name} on why he built CarryOn`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen data-testid="moments-founder-video" />
            </div>
          </RevealSection>
        </section>
      )}

      <ProductPreview testIdSuffix="-moments" defaultTab="messages" />

      <section className="px-6 py-20" data-testid="moments-how">
        <div className="max-w-[1000px] mx-auto">
          <RevealSection><h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12" style={HEADING}>{t('moments.how.title')}</h2></RevealSection>
          <div className="grid sm:grid-cols-3 gap-5">
            {['1', '2', '3'].map((n, i) => {
              const Icon = STEP_ICONS[i];
              return (
                <RevealSection key={n} delay={i * 0.1} className="rounded-2xl p-6" style={CARD} data-testid={`moments-step-${n}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(212,175,55,0.14)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)' }}>{n}</span>
                    <Icon className="w-5 h-5 text-[#B794F6]" />
                  </div>
                  <h3 className="text-white text-lg font-bold mb-2" style={HEADING}>{t(`moments.how.${n}.title`)}</h3>
                  <p className="text-[#8b97ab] text-sm leading-relaxed">{renderCopy(t(`moments.how.${n}.desc`))}</p>
                </RevealSection>
              );
            })}
          </div>
        </div>
      </section>

      <BenefactorMessages />
      <BenefactorTrust />

      <section className="px-6 py-24 text-center" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(139,92,246,0.12) 0%, transparent 60%)' }} data-testid="moments-final">
        <RevealSection className="max-w-[720px] mx-auto">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-5" style={HEADING}>{t('moments.final.title')}</h2>
          {days != null && <p className="text-[#a0aec0] text-base md:text-lg leading-relaxed mb-8">{renderCopy(t('moments.final.text', { days }))}</p>}
          <CtaButton label={t('moments.final.cta')} onClick={() => go('final')} testId="moments-final-cta" />
        </RevealSection>
      </section>
      <BenefactorFooter />
    </div>
  );
}
