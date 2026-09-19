import React from 'react';
import { ChevronRight, AlertCircle } from 'lucide-react';
import { useCopy, renderCopy, copyList } from '../../copy/CopyContext';
import { LiveCountBadge } from '../landing/LiveStats';
import { RevealSection } from '../landing/RevealSection';

export const HEADING = { fontFamily: 'Outfit, sans-serif' };
export const GOLD_BTN = { background: '#d4af37', color: '#0B1221' };

/** Gold pill CTA shared by every block on /benefactor. */
export const CtaButton = ({ label, onClick, testId, className = '' }) => (
  <button onClick={onClick} className={`inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full font-bold text-base transition-transform duration-150 hover:brightness-110 active:scale-95 ${className}`} style={GOLD_BTN} data-testid={testId}>
    {label} <ChevronRight className="w-4 h-4" />
  </button>
);

/** Logo + Sign In only — no marketing menu on the acquisition page. */
export const BenefactorNav = ({ onSignIn }) => {
  const { t } = useCopy();
  return (
    <nav className="fixed top-0 w-full z-[100]" style={{ background: 'rgba(11,18,33,0.97)', borderBottom: '1px solid rgba(14,165,233,0.06)', paddingTop: 'env(safe-area-inset-top, 0px)' }} data-testid="benefactor-nav">
      <div className="max-w-[1100px] mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center" data-testid="benefactor-nav-logo"><img src="/carryon-logo.png" alt="CarryOn" className="h-12" /></a>
        <button onClick={onSignIn} className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1" data-testid="benefactor-nav-sign-in">{t('nav.signin')} <ChevronRight className="w-3.5 h-3.5" /></button>
      </div>
    </nav>
  );
};

export const BenefactorHero = ({ days, onCta }) => {
  const { t } = useCopy();
  return (
    <section className="relative text-center px-6" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))', paddingBottom: '3rem', background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.10) 0%, transparent 60%)' }} data-testid="benefactor-hero">
      <div className="max-w-[820px] mx-auto">
        <p className="text-[#d4af37] text-xs sm:text-sm font-bold uppercase tracking-[0.2em] mb-5" data-testid="benefactor-hero-eyebrow">{t('benefactor.hero.eyebrow')}</p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-6" style={HEADING} data-testid="benefactor-hero-h1">
          {t('benefactor.hero.h1a')}<br /><span className="text-[#d4af37]">{t('benefactor.hero.h1b')}</span>
        </h1>
        <p className="text-[#a0aec0] text-base md:text-lg leading-relaxed max-w-[680px] mx-auto mb-8" data-testid="benefactor-hero-sub">{renderCopy(t('benefactor.hero.sub'))}</p>
        <CtaButton label={t('benefactor.hero.cta')} onClick={() => onCta('hero')} testId="benefactor-hero-cta" />
        <p className="text-[#8b97ab] text-sm mt-4" data-testid="benefactor-hero-nocard">{t('benefactor.hero.nocard', { days })}</p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8 text-sm text-[#a0aec0]">
          {['1', '2', '3'].map(n => <span key={n} className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#10b981]" />{t(`home.hero.badge${n}`)}</span>)}
        </div>
        <div className="mt-6 flex justify-center"><LiveCountBadge testIdSuffix="-benefactor" /></div>
      </div>
    </section>
  );
};

export const BenefactorProblem = () => {
  const { t } = useCopy();
  return (
    <section className="px-6 py-16" data-testid="benefactor-problem">
      <RevealSection className="max-w-[760px] mx-auto rounded-2xl p-8 sm:p-10" style={{ background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6" style={HEADING}>{t('benefactor.problem.title')}</h2>
        <ul className="space-y-3 mb-6">
          {copyList(t('benefactor.problem.items')).map((item, i) => (
            <li key={i} className="flex gap-3 text-[#c5cedb] text-base leading-relaxed"><AlertCircle className="w-5 h-5 text-[#f87171] flex-shrink-0 mt-0.5" /><span>{renderCopy(item)}</span></li>
          ))}
        </ul>
        <p className="text-white text-base md:text-lg font-semibold">{renderCopy(t('benefactor.problem.closing'))}</p>
      </RevealSection>
    </section>
  );
};
