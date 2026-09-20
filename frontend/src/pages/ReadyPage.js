import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { SEO } from '../components/SEO';
import { useCopy, renderCopy, copyList } from '../copy/CopyContext';
import { ProductPreview } from '../components/landing/ProductPreview';
import { ReadinessQuiz } from '../components/landing/ReadinessQuiz';
import { RevealSection } from '../components/landing/RevealSection';
import { BenefactorNav, CtaButton, HEADING } from '../components/benefactor/BenefactorHero';
import { BenefactorTrust } from '../components/benefactor/BenefactorStory';
import { BenefactorFooter } from '../components/benefactor/BenefactorClose';
import { useAcquisition } from '../components/benefactor/useAcquisition';

/* Paid-traffic landing page #2 — Family Readiness. The ask is the 60-second quiz, not the purchase;
 * the quiz result hands off to the no-card door tagged `landing_page: ready`. Not linked from the site. */
export default function ReadyPage() {
  const { t } = useCopy();
  const { days, go, navigate } = useAcquisition('ready');

  return (
    <div className="min-h-screen" style={{ background: '#0B1221' }} data-testid="ready-page">
      <SEO title={t('ready.seo.title')} description={t('ready.seo.description')} path="/ready" noindex />
      <BenefactorNav onSignIn={() => navigate('/login')} />

      <section className="relative text-center px-6" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))', paddingBottom: '3rem', background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.10) 0%, transparent 60%)' }} data-testid="ready-hero">
        <div className="max-w-[820px] mx-auto">
          <p className="text-[#d4af37] text-xs sm:text-sm font-bold uppercase tracking-[0.2em] mb-5" data-testid="ready-hero-eyebrow">{t('ready.hero.eyebrow')}</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-6" style={HEADING} data-testid="ready-hero-h1">
            {t('ready.hero.h1a')}<br /><span className="text-[#d4af37]">{t('ready.hero.h1b')}</span>
          </h1>
          <p className="text-[#a0aec0] text-base md:text-lg leading-relaxed max-w-[680px] mx-auto mb-8" data-testid="ready-hero-sub">{renderCopy(t('ready.hero.sub'))}</p>
          <a href="#quiz" onClick={(e) => { e.preventDefault(); document.getElementById('quiz')?.scrollIntoView({ behavior: 'smooth' }); }} className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full font-bold text-base transition-transform duration-150 hover:brightness-110 active:scale-95" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="ready-hero-cta">{t('ready.hero.cta')}</a>
          {days != null && <p className="mt-4"><button onClick={() => go('hero-skip')} className="text-[#8b97ab] hover:text-[#d4af37] text-sm underline underline-offset-4" data-testid="ready-hero-skip">{t('ready.hero.skip', { days })}</button></p>}
        </div>
      </section>

      <ReadinessQuiz navigateWithFade={navigate} testIdSuffix="-ready" onStart={(score) => go('quiz-result', { score })} />

      <section className="px-6 py-20" data-testid="ready-after">
        <RevealSection className="max-w-[760px] mx-auto rounded-2xl p-8 sm:p-10" style={{ background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(212,175,55,0.18)' }}>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6" style={HEADING}>{t('ready.after.title')}</h2>
          <ul className="space-y-3">
            {copyList(t('ready.after.items')).map((item, i) => (
              <li key={i} className="flex gap-3 text-[#c5cedb] text-base leading-relaxed"><CheckCircle2 className="w-5 h-5 text-[#10b981] flex-shrink-0 mt-0.5" /><span>{renderCopy(item)}</span></li>
            ))}
          </ul>
        </RevealSection>
      </section>

      <ProductPreview testIdSuffix="-ready" />
      <BenefactorTrust />

      <section className="px-6 py-24 text-center" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(212,175,55,0.10) 0%, transparent 60%)' }} data-testid="ready-final">
        <RevealSection className="max-w-[720px] mx-auto">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-5" style={HEADING}>{t('ready.final.title')}</h2>
          {days != null && <p className="text-[#a0aec0] text-base md:text-lg leading-relaxed mb-8">{renderCopy(t('ready.final.text', { days }))}</p>}
          <CtaButton label={t('ready.final.cta')} onClick={() => go('final')} testId="ready-final-cta" />
        </RevealSection>
      </section>
      <BenefactorFooter />
    </div>
  );
}
