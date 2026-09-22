import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useCopy, renderCopy } from '../../copy/CopyContext';
import { RevealSection } from '../landing/RevealSection';
import { CtaButton, HEADING } from './BenefactorHero';

export const BenefactorFaq = ({ days }) => {
  const { t } = useCopy();
  const [open, setOpen] = useState('1');
  return (
    <section className="px-6 py-20" style={{ background: '#0E1829' }} data-testid="benefactor-faq">
      <div className="max-w-[760px] mx-auto">
        <RevealSection><h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-10" style={HEADING}>{t('benefactor.faq.title')}</h2></RevealSection>
        <div className="space-y-3">
          {['1', '2', '3', '4', '5'].map(n => (
            <div key={n} className="rounded-xl" style={{ background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <button onClick={() => setOpen(open === n ? '' : n)} aria-expanded={open === n} className="w-full flex items-center justify-between gap-4 text-left px-5 py-4 text-white font-semibold text-base" data-testid={`benefactor-faq-q-${n}`}>
                {t(`benefactor.faq.${n}.q`)} <ChevronDown className={`w-5 h-5 text-[#d4af37] flex-shrink-0 transition-transform ${open === n ? 'rotate-180' : ''}`} />
              </button>
              {open === n && <p className="px-5 pb-5 text-[#a0aec0] text-sm sm:text-base leading-relaxed" data-testid={`benefactor-faq-a-${n}`}>{renderCopy(t(`benefactor.faq.${n}.a`, { days }))}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export const BenefactorFinal = ({ onCta }) => {
  const { t } = useCopy();
  return (
    <section className="px-6 py-24 text-center" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(212,175,55,0.10) 0%, transparent 60%)' }} data-testid="benefactor-final">
      <RevealSection className="max-w-[720px] mx-auto">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-5" style={HEADING}>{t('benefactor.final.title')}</h2>
        <p className="text-[#a0aec0] text-base md:text-lg leading-relaxed mb-8">{renderCopy(t('benefactor.final.text'))}</p>
        <CtaButton label={t('benefactor.final.cta')} onClick={() => onCta('final')} testId="benefactor-final-cta" />
      </RevealSection>
    </section>
  );
};

/** Deliberately tiny footer — legal links only, no site map. */
export const BenefactorFooter = () => {
  const { t } = useCopy();
  return (
    <footer className="py-8 text-center text-[#334155] text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} data-testid="benefactor-footer">
      {[['privacy', '/privacy'], ['terms', '/terms'], ['security', '/security'], ['winddown', '/wind-down-promise']].map(([k, href], i, arr) => (
        <a key={k} href={href} className={`hover:text-[#c9d2e0] ${i < arr.length - 1 ? 'mr-5' : ''}`} data-testid={`benefactor-footer-${k}`}>{t(`footer.${k}`)}</a>
      ))}
      <p className="mt-3">&copy; {new Date().getFullYear()} {t('footer.short_copyright')}</p>
    </footer>
  );
};
