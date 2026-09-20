import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useCopy } from '../../copy/CopyContext';
import { recordFunnelEvent } from '../../utils/funnelTelemetry';

export const HeroCtas = ({ navigateWithFade, testIdSuffix = '', align = 'center' }) => {
  const { t } = useCopy();
  const centered = align === 'center';
  return (
    <div className={`flex flex-col ${centered ? 'items-center text-center' : 'items-center sm:items-start text-center sm:text-left'}`} data-testid={`hero-ctas${testIdSuffix}`}>
      <div className={`flex items-center gap-3 flex-wrap ${centered ? 'justify-center' : 'justify-center sm:justify-start'}`}>
        <button onClick={() => { recordFunnelEvent({ event: 'landing_cta_click', meta: { page: 'home', location: 'hero' } }); navigateWithFade('/start'); }} data-testid={`hero-start-now${testIdSuffix}`}
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base transition-transform duration-150 active:scale-95 hover:brightness-110"
          style={{ background: '#d4af37', color: '#0B1221', boxShadow: '0 6px 30px rgba(212,175,55,0.35)' }}>
          {t('home.hero.cta')} <ChevronRight className="w-4 h-4" />
        </button>
        <a href="#preview" data-testid={`scroll-explore${testIdSuffix}`}
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg font-semibold text-base text-white transition-colors duration-200 hover:border-[#d4af37]/70"
          style={{ background: 'rgba(11,18,33,0.45)', border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
          {t('home.hero.see')} <ChevronDown className="w-4 h-4 text-[#d4af37]" />
        </a>
      </div>
      <p className="text-white/75 text-xs sm:text-sm mt-4 leading-relaxed" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }} data-testid={`hero-no-card${testIdSuffix}`}>
        {t('home.hero.nocard')}{' '}
        <a href="#quiz" className="text-[#fcd34d] underline underline-offset-4 hover:text-white" data-testid={`hero-quiz-link${testIdSuffix}`}>{t('home.hero.quizlink')}</a>
        {' '}&middot;{' '}
        <a href="/pricing" className="text-[#fcd34d] underline underline-offset-4 hover:text-white" data-testid={`hero-pricing-link${testIdSuffix}`}>{t('home.hero.pricinglink')}</a>
      </p>
    </div>
  );
};

export default HeroCtas;
