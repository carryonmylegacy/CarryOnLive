import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

export const HeroCtas = ({ navigateWithFade, testIdSuffix = '', align = 'center' }) => {
  const centered = align === 'center';
  return (
    <div className={`flex flex-col ${centered ? 'items-center text-center' : 'items-center sm:items-start text-center sm:text-left'}`} data-testid={`hero-ctas${testIdSuffix}`}>
      <div className={`flex items-center gap-3 flex-wrap ${centered ? 'justify-center' : 'justify-center sm:justify-start'}`}>
        <button onClick={() => navigateWithFade('/start')} data-testid={`hero-start-now${testIdSuffix}`}
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base transition-transform duration-150 active:scale-95 hover:brightness-110"
          style={{ background: '#d4af37', color: '#0B1221', boxShadow: '0 6px 30px rgba(212,175,55,0.35)' }}>
          Start Now <ChevronRight className="w-4 h-4" />
        </button>
        <a href="#preview" data-testid={`scroll-explore${testIdSuffix}`}
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg font-semibold text-base text-white transition-colors duration-200 hover:border-[#d4af37]/70"
          style={{ background: 'rgba(11,18,33,0.45)', border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
          See it in action <ChevronDown className="w-4 h-4 text-[#d4af37]" />
        </a>
      </div>
      <p className="text-white/75 text-xs sm:text-sm mt-4 leading-relaxed" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }} data-testid={`hero-no-card${testIdSuffix}`}>
        Explore first &mdash; no credit card needed. Or{' '}
        <a href="#quiz" className="text-[#fcd34d] underline underline-offset-4 hover:text-white" data-testid={`hero-quiz-link${testIdSuffix}`}>take the 60-second readiness quiz</a>
        {' '}&middot;{' '}
        <a href="/pricing" className="text-[#fcd34d] underline underline-offset-4 hover:text-white" data-testid={`hero-pricing-link${testIdSuffix}`}>view pricing</a>
      </p>
    </div>
  );
};

export default HeroCtas;
