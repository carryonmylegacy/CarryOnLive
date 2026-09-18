import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, FileText, MessageSquare, ClipboardCheck, Landmark, Check, X, Radio, ShieldCheck, CalendarDays } from 'lucide-react';
import { SEO } from '../components/SEO';
import { MarketingNav } from '../components/landing/MarketingNav';
import { MarketingFooter } from '../components/landing/MarketingFooter';
import { RevealSection } from '../components/landing/RevealSection';
import { useCopy, renderCopy, renderBlocks, copyList } from '../copy/CopyContext';

const PARTS = [
  ['documents', FileText], ['messages', MessageSquare], ['checklist', ClipboardCheck], ['financials', Landmark],
];
const CARD = { background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.2)' };
const BLOCK_CLASSES = { pClass: 'text-[#a0aec0] text-base leading-relaxed', ulClass: 'space-y-2 my-1', liClass: 'relative pl-5 text-[#a0aec0] text-base leading-relaxed before:content-["•"] before:absolute before:left-0 before:text-[#d4af37] before:font-bold', strongClass: 'text-white font-semibold' };

const Bullets = ({ k, icon: Icon = Check, color = '#d4af37', t, testId }) => (
  <ul className="space-y-3" data-testid={testId}>
    {copyList(t(k)).map((item, i) => (
      <li key={i} className="flex gap-3 text-[#a0aec0] text-base leading-relaxed"><Icon className="w-4 h-4 flex-shrink-0 mt-1.5" style={{ color }} /> <span>{renderCopy(item, 'text-white font-semibold')}</span></li>
    ))}
  </ul>
);

const H2 = ({ children }) => <h2 className="text-white text-2xl sm:text-3xl font-bold mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>{children}</h2>;

/** /readiness-score — plain-English policy page for the Estate Readiness Score (every line editable in Site Copy). */
const ReadinessScorePage = () => {
  const navigate = useNavigate();
  const { t } = useCopy();
  const [exiting, setExiting] = useState(false);
  const navigateWithFade = (path) => { setExiting(true); setTimeout(() => navigate(path), 400); };
  return (
    <div className={`min-h-screen transition-opacity duration-400 ${exiting ? 'opacity-0' : 'opacity-100'}`} style={{ background: '#0E1829' }} data-testid="readiness-score-page">
      <SEO title={t('readiness.seo.title')} description={t('readiness.seo.description')} path="/readiness-score" />
      <MarketingNav navigateWithFade={navigateWithFade} testIdSuffix="-readiness" />

      <section className="relative overflow-hidden" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.08) 0%, transparent 60%)' }} />
        <RevealSection className="max-w-[760px] mx-auto px-6 relative z-10 pb-12">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#d4af37] transition-colors mb-8" data-testid="readiness-back-home"><ArrowLeft className="w-4 h-4" /> {t('readiness.back')}</a>
          <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] mb-4">{t('readiness.hero.eyebrow')}</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-5" style={{ fontFamily: 'Outfit, sans-serif', textWrap: 'balance' }} data-testid="readiness-h1">{t('readiness.hero.title')}</h1>
          <p className="text-[#a0aec0] text-base lg:text-lg leading-relaxed" data-testid="readiness-intro">{renderCopy(t('readiness.hero.intro'), 'text-white font-semibold')}</p>
          <p className="inline-flex items-center gap-2 text-xs text-[#64748b] mt-6" data-testid="readiness-updated"><CalendarDays className="w-3.5 h-3.5" /> {t('readiness.updated_prefix')}: <span className="text-[#a0aec0]">{t('readiness.updated')}</span></p>
        </RevealSection>
      </section>

      <section className="relative z-10 pb-14">
        <RevealSection className="max-w-[760px] mx-auto px-6">
          <div className="rounded-2xl p-6 sm:p-8" style={{ ...CARD, border: '1px solid rgba(212,175,55,0.4)' }} data-testid="readiness-short">
            <H2>{t('readiness.short.title')}</H2>
            <Bullets k="readiness.short.items" t={t} testId="readiness-short-items" />
          </div>
        </RevealSection>
      </section>

      <section className="relative z-10 pb-14">
        <div className="max-w-[760px] mx-auto px-6">
          <RevealSection><H2>{t('readiness.parts.title')}</H2></RevealSection>
          <div className="space-y-5">
            {PARTS.map(([key, Icon], i) => (
              <RevealSection key={key} delay={i * 0.05}>
                <article className="rounded-2xl p-6 sm:p-8" style={CARD} data-testid={`readiness-part-${key}`}>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)' }}><Icon className="w-5 h-5 text-[#d4af37]" /></div>
                      <h3 className="text-white text-xl sm:text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{t(`readiness.parts.${key}.title`)}</h3>
                    </div>
                    <span className="text-xs font-bold text-[#d4af37] px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)' }}>{t('readiness.parts.weight')}</span>
                  </div>
                  <div className="space-y-3">{renderBlocks(t(`readiness.parts.${key}.body`), BLOCK_CLASSES)}</div>
                </article>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 pb-14">
        <RevealSection className="max-w-[760px] mx-auto px-6 grid md:grid-cols-2 gap-5">
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(34,201,147,0.25)' }} data-testid="readiness-moves">
            <H2>{t('readiness.moves.title')}</H2>
            <Bullets k="readiness.moves.items" color="#22C993" t={t} />
          </div>
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }} data-testid="readiness-not">
            <H2>{t('readiness.moves.not_title')}</H2>
            <Bullets k="readiness.moves.not_items" icon={X} color="#64748b" t={t} />
          </div>
        </RevealSection>
      </section>

      <section className="relative z-10 pb-14">
        <RevealSection className="max-w-[760px] mx-auto px-6">
          <div className="rounded-2xl p-6 sm:p-8" style={CARD} data-testid="readiness-ccp">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)' }}><Radio className="w-5 h-5 text-[#d4af37]" /></div>
              <h2 className="text-white text-2xl sm:text-3xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('readiness.ccp.title')}</h2>
            </div>
            <p className="text-[#a0aec0] text-base leading-relaxed mb-5">{renderCopy(t('readiness.ccp.intro'), 'text-white font-semibold')}</p>
            <Bullets k="readiness.ccp.items" t={t} />
            <p className="text-sm text-[#64748b] mt-5">{t('readiness.ccp.labels')}</p>
          </div>
        </RevealSection>
      </section>

      <section className="relative z-10 pb-20">
        <RevealSection className="max-w-[760px] mx-auto px-6">
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,175,55,0.25)' }} data-testid="readiness-promise">
            <div className="flex items-center gap-3 mb-4"><ShieldCheck className="w-6 h-6 text-[#d4af37]" /><h2 className="text-white text-2xl sm:text-3xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('readiness.promise.title')}</h2></div>
            <Bullets k="readiness.promise.items" t={t} />
          </div>
        </RevealSection>
      </section>

      <section className="relative z-10 py-20 text-center" style={{ background: '#0D1B2A' }}>
        <RevealSection className="max-w-[600px] mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('readiness.cta.title')}</h2>
          <p className="text-[#8b97ab] text-base mb-8">{renderCopy(t('readiness.cta.text'))}</p>
          <button onClick={() => navigateWithFade('/start')} className="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-bold text-base transition-transform active:scale-95" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="readiness-start-now">{t('readiness.cta.button')} <ChevronRight className="w-4 h-4" /></button>
          <p className="mt-5"><a href="/login" className="text-sm text-[#8b97ab] hover:text-[#d4af37] underline-offset-2 hover:underline" data-testid="readiness-signin">{t('readiness.cta.signin')}</a></p>
        </RevealSection>
      </section>

      <MarketingFooter testIdSuffix="-readiness" />
    </div>
  );
};

export default ReadinessScorePage;
