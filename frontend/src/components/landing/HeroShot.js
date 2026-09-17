import React from 'react';
import { Lock } from 'lucide-react';

const mask = { maskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)' };

export const HeroShot = ({ testIdSuffix = '' }) => (
  <div className="relative z-10 mt-12 lg:mt-16 mx-auto w-full max-w-[980px] px-2 sm:px-6" style={mask} data-testid={`hero-product-shot${testIdSuffix}`}>
    <div className="hidden sm:block rounded-t-2xl overflow-hidden" style={{ border: '1px solid rgba(212,175,55,0.35)', borderBottom: 'none', boxShadow: '0 -20px 80px rgba(0,0,0,0.55)', maxHeight: '440px', background: '#0b1322' }}>
      <div className="flex items-center gap-3 px-4 py-2.5" style={{ background: 'rgba(8,14,26,0.95)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex gap-1.5">{['#ff5f57', '#febc2e', '#28c840'].map(c => <span key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}</div>
        <div className="flex-1 flex items-center gap-2 rounded-md px-3 py-1 text-xs text-[#8b97ab]" style={{ background: 'rgba(255,255,255,0.04)' }}><Lock className="w-3 h-3 text-[#10b981]" /> carryon.us/dashboard</div>
      </div>
      <img src="/screenshots/dashboard.webp" alt="CarryOn dashboard showing the family readiness score, financial health, and the estate's next steps" width="2160" height="1350" loading="eager" fetchPriority="high" className="w-full h-auto block" />
    </div>
    <div className="sm:hidden mx-auto max-w-[250px] rounded-t-[2rem] p-2 pb-0 overflow-hidden" style={{ background: 'linear-gradient(160deg, #1c2a44, #0b1322)', border: '1px solid rgba(255,255,255,0.16)', borderBottom: 'none', maxHeight: '300px', boxShadow: '0 -20px 60px rgba(0,0,0,0.55)' }}>
      <img src="/screenshots/m-dashboard.webp" alt="CarryOn dashboard on a phone showing the family readiness score" width="780" height="1328" loading="eager" fetchPriority="high" className="w-full h-auto block rounded-t-[1.6rem]" />
    </div>
  </div>
);

export default HeroShot;
