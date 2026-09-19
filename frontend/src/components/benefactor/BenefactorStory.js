import React from 'react';
import { Heart, MessageSquareHeart, ShieldCheck } from 'lucide-react';
import { useCopy, renderCopy, copyList } from '../../copy/CopyContext';
import { RevealSection } from '../landing/RevealSection';
import { FounderCard } from '../landing/FounderCard';
import { HEADING } from './BenefactorHero';

const CARD = { background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(212,175,55,0.18)' };

export const BenefactorPayoff = () => {
  const { t } = useCopy();
  return (
    <section className="px-6 py-20" style={{ background: '#0E1829' }} data-testid="benefactor-payoff">
      <div className="max-w-[1000px] mx-auto">
        <RevealSection className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-5" style={HEADING}>
            {t('benefactor.payoff.h1')} <span className="text-[#d4af37]">{t('benefactor.payoff.h2')}</span>
          </h2>
          <p className="text-[#a0aec0] text-base md:text-lg leading-relaxed max-w-[680px] mx-auto">{renderCopy(t('benefactor.payoff.text'))}</p>
        </RevealSection>
        <div className="grid sm:grid-cols-3 gap-5">
          {['1', '2', '3'].map((n, i) => (
            <RevealSection key={n} delay={i * 0.1} className="rounded-2xl p-6" style={CARD} data-testid={`benefactor-payoff-card-${n}`}>
              <Heart className="w-5 h-5 text-[#d4af37] mb-4" />
              <h3 className="text-white text-lg font-bold mb-2" style={HEADING}>{t(`benefactor.payoff.${n}.title`)}</h3>
              <p className="text-[#8b97ab] text-sm leading-relaxed">{renderCopy(t(`benefactor.payoff.${n}.desc`))}</p>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
};

/** Milestone Messages — the human hook ("A message from Dad"). */
export const BenefactorMessages = () => {
  const { t } = useCopy();
  return (
    <section className="px-6 py-20" data-testid="benefactor-messages">
      <RevealSection className="max-w-[900px] mx-auto rounded-3xl p-8 sm:p-12 text-center" style={{ background: 'linear-gradient(160deg, rgba(139,92,246,0.14), rgba(15,26,46,0.7))', border: '1px solid rgba(183,148,246,0.3)' }}>
        <p className="inline-flex items-center gap-2 text-[#B794F6] text-xs font-bold uppercase tracking-[0.2em] mb-4"><MessageSquareHeart className="w-4 h-4" /> {t('benefactor.mm.eyebrow')}</p>
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-5" style={HEADING}>{t('benefactor.mm.title')}</h2>
        <p className="text-[#c5cedb] text-base md:text-lg leading-relaxed max-w-[640px] mx-auto mb-8">{renderCopy(t('benefactor.mm.text'))}</p>
        <p className="text-white text-lg sm:text-xl font-bold leading-snug" style={HEADING} data-testid="benefactor-mm-tagline">
          {t('benefactor.mm.tagline_a')}<br /><span className="text-[#d4af37]">{t('benefactor.mm.tagline_b')}</span>
        </p>
      </RevealSection>
    </section>
  );
};

export const BenefactorTrust = () => {
  const { t } = useCopy();
  return (
    <section id="trust" className="px-6 py-20" style={{ background: '#0E1829' }} data-testid="benefactor-trust">
      <div className="max-w-[1000px] mx-auto grid lg:grid-cols-[1fr_380px] gap-10 items-start">
        <RevealSection>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6" style={HEADING}>{t('benefactor.trust.title')}</h2>
          <ul className="space-y-3 mb-6">
            {copyList(t('benefactor.trust.items')).map((item, i) => (
              <li key={i} className="flex gap-3 text-[#c5cedb] text-base leading-relaxed"><ShieldCheck className="w-5 h-5 text-[#10b981] flex-shrink-0 mt-0.5" /><span>{renderCopy(item)}</span></li>
            ))}
          </ul>
          <a href="/security" className="text-[#d4af37] hover:text-[#fcd34d] text-sm font-semibold underline underline-offset-4" data-testid="benefactor-trust-security-link">{t('benefactor.trust.link')}</a>
        </RevealSection>
        <RevealSection delay={0.15}><FounderCard compact testIdSuffix="-benefactor" /></RevealSection>
      </div>
    </section>
  );
};
