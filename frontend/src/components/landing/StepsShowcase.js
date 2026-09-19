import React, { useEffect, useRef, useState } from 'react';
import { RevealSection } from './RevealSection';

const STEP_SHOTS = ['contacts', 'dashboard', 'vault', 'checklist', 'dashboard'];
const SHOT_ALT = {
  contacts: 'CarryOn beneficiaries screen on a phone showing the ranked list of who to call first',
  dashboard: 'CarryOn dashboard on a phone showing the Total Family Continuity score',
  vault: 'CarryOn document vault on a phone listing a will, insurance policy, and power of attorney',
  checklist: 'CarryOn what-to-do-first checklist on a phone',
};

export const StepsShowcase = ({ steps, testIdSuffix = '' }) => {
  const [active, setActive] = useState(0);
  const refs = useRef([]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) setActive(Number(e.target.dataset.step)); });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    refs.current.forEach(el => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const shot = STEP_SHOTS[active];
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-12 lg:gap-16 items-start text-left">
      <div className="space-y-12">
        {steps.map(({ step, title, desc }, i) => (
          <RevealSection key={step} delay={i * 0.1}>
            <div ref={el => { refs.current[i] = el; }} data-step={i} data-testid={`step-${step}${testIdSuffix}`} className="flex gap-5 transition-opacity duration-500" style={{ opacity: active === i ? 1 : 0.55 }}>
              <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-base transition-colors duration-500"
                style={active === i ? { background: '#d4af37', color: '#0B1221', border: '1px solid #d4af37' } : { background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.25)' }}>
                {step}
              </div>
              <p className="text-white text-base leading-relaxed">
                <span className="font-bold">Step {step} &mdash; {title}.</span>{' '}
                <span className="text-[#7b879e]">{desc}</span>
              </p>
            </div>
          </RevealSection>
        ))}
      </div>
      <div className="hidden lg:block lg:sticky lg:top-28" data-testid={`steps-phone${testIdSuffix}`} data-active-shot={shot}>
        <div className="relative rounded-[2.4rem] p-2.5 mx-auto" style={{ maxWidth: '300px', background: 'linear-gradient(160deg, #1c2a44, #0b1322)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 50px rgba(212,175,55,0.08)' }}>
          <div className="relative rounded-[2rem] overflow-hidden" style={{ aspectRatio: '390 / 664', background: '#0b1322' }}>
            {[...new Set(STEP_SHOTS)].map(id => (
              <img key={id} src={`/screenshots/m-${id}.webp`} alt={SHOT_ALT[id]} width="780" height="1328" loading="lazy"
                className="absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-500"
                style={{ opacity: id === shot ? 1 : 0 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepsShowcase;
