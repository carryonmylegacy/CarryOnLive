import React from 'react';
import { Check, Lock } from 'lucide-react';
import { useCopy, renderCopy, copyList } from '../../copy/CopyContext';
import { RevealSection } from '../landing/RevealSection';
import { CtaButton, HEADING } from './BenefactorHero';

const CARD = { background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.45)', boxShadow: '0 30px 80px rgba(0,0,0,0.45), 0 0 60px rgba(212,175,55,0.08)' };
const fmt = (n) => Number(n).toFixed(2);

const SinglePlan = ({ plan, days, t, onSelect }) => (
  <RevealSection className="max-w-[520px] mx-auto rounded-3xl p-8 sm:p-10 text-center" style={CARD} data-testid="benefactor-plan-premium">
    <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] mb-3">{t('benefactor.price.tag')}</p>
    <h3 className="text-white text-3xl font-bold mb-2" style={HEADING} data-testid="benefactor-plan-name">CarryOn {plan.name}</h3>
    <p className="text-white mb-1"><span className="text-5xl font-bold" style={HEADING} data-testid="benefactor-plan-price">${fmt(plan.price)}</span><span className="text-[#a0aec0] text-base">{t('benefactor.price.per')}</span></p>
    <p className="text-[#10b981] text-sm font-semibold mb-8" data-testid="benefactor-plan-trial">{t('benefactor.price.trial', { days })}</p>
    <ul className="text-left space-y-3 mb-8">
      {copyList(t('benefactor.price.includes')).map((item, i) => (
        <li key={i} className="flex gap-3 text-[#c5cedb] text-sm sm:text-base leading-snug"><Check className="w-5 h-5 text-[#d4af37] flex-shrink-0" /><span>{renderCopy(item)}</span></li>
      ))}
    </ul>
    <CtaButton label={t('benefactor.price.cta', { days })} onClick={() => onSelect(plan.id)} testId="benefactor-plan-cta" className="w-full" />
    <p className="flex items-center justify-center gap-1.5 text-[#8b97ab] text-xs mt-4"><Lock className="w-3 h-3 text-[#10b981]" /> {t('benefactor.price.fine')}</p>
    <button onClick={() => onSelect(plan.id, 'paynow')} className="text-[#a0aec0] hover:text-[#d4af37] text-sm underline underline-offset-4 mt-4 transition-colors" data-testid="benefactor-plan-paynow">{t('benefactor.price.paynow')}</button>
  </RevealSection>
);

const AllPlans = ({ plans, days, t, onSelect }) => (
  <div className="flex flex-wrap justify-center gap-5" data-testid="benefactor-plans-all">
    {plans.map((p, i) => (
      <RevealSection key={p.id} delay={i * 0.08} className="w-full sm:w-[calc(33.333%-0.9rem)] min-w-[260px] rounded-2xl p-6 text-center" style={{ ...CARD, border: p.id === 'premium' ? CARD.border : '1px solid rgba(255,255,255,0.1)', boxShadow: 'none' }} data-testid={`benefactor-plan-${p.id}`}>
        <h3 className="text-white text-xl font-bold mb-1" style={HEADING}>{p.name}</h3>
        <p className="text-white mb-1"><span className="text-3xl font-bold" style={HEADING}>${fmt(p.price)}</span><span className="text-[#a0aec0] text-sm">{t('benefactor.price.per')}</span></p>
        <p className="text-[#10b981] text-xs font-semibold mb-5">{t('benefactor.price.trial', { days })}</p>
        <ul className="text-left space-y-2 mb-6">{(p.features || []).map((f, j) => <li key={j} className="flex gap-2 text-[#c5cedb] text-sm"><Check className="w-4 h-4 text-[#d4af37] flex-shrink-0 mt-0.5" />{f}</li>)}</ul>
        <CtaButton label={t('benefactor.price.all_cta')} onClick={() => onSelect(p.id)} testId={`benefactor-plan-cta-${p.id}`} className="w-full !py-3" />
      </RevealSection>
    ))}
  </div>
);

/** Price block. Default = one Premium card (the test); `?v=all` shows Base / Standard / Premium. /pricing itself is untouched. */
export const BenefactorPrice = ({ plans, variant, days, onSelect }) => {
  const { t } = useCopy();
  const premium = plans.find(p => p.id === 'premium');
  const main = ['base', 'standard', 'premium'].map(id => plans.find(p => p.id === id)).filter(Boolean);
  if (!premium) return null;
  return (
    <section id="price" className="px-6 py-20" data-testid="benefactor-price" data-variant={variant}>
      <div className="max-w-[1000px] mx-auto">
        <RevealSection className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={HEADING}>{variant === 'all' ? t('benefactor.price.all_title') : t('benefactor.price.title')}</h2>
          <p className="text-[#a0aec0] text-base md:text-lg max-w-[600px] mx-auto">{renderCopy(t('benefactor.price.sub'))}</p>
        </RevealSection>
        {variant === 'all' ? <AllPlans plans={main} days={days} t={t} onSelect={onSelect} /> : <SinglePlan plan={premium} days={days} t={t} onSelect={onSelect} />}
        <p className="text-center mt-8"><a href="/pricing" className="text-[#8b97ab] hover:text-[#d4af37] text-sm underline underline-offset-4 transition-colors" data-testid="benefactor-compare-link">{t('benefactor.price.compare')}</a></p>
      </div>
    </section>
  );
};
