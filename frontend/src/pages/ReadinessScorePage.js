import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, FileText, MessageSquare, ClipboardCheck, Landmark, Check, X, Radio, ShieldCheck, CalendarDays, Heart, Lock, Clock, MapPin } from 'lucide-react';
import { SEO } from '../components/SEO';
import { MarketingNav } from '../components/landing/MarketingNav';
import { MarketingFooter } from '../components/landing/MarketingFooter';
import { RevealSection } from '../components/landing/RevealSection';
import { useCopy, renderCopy, renderBlocks, copyList } from '../copy/CopyContext';
import { READINESS_PILLARS, READINESS_DETAILS } from '../copy/siteCopyReadiness';

const ICONS = { Heart, Lock, Landmark, Clock };
const DETAIL_ICONS = { documents: FileText, messages: MessageSquare, checklist: ClipboardCheck, financials: Landmark };
const CARD = { background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.2)' };
const OUTFIT = { fontFamily: 'Outfit, sans-serif' };
const BLOCK_CLASSES = { pClass: 'text-[#a0aec0] text-base leading-relaxed', ulClass: 'space-y-2.5 my-1', liClass: 'relative pl-5 text-[#a0aec0] text-base leading-relaxed before:content-["•"] before:absolute before:left-0 before:text-[#d4af37] before:font-bold', strongClass: 'text-white font-semibold' };

const Bullets = ({ k, icon: Icon = Check, color = '#d4af37', t, testId }) => (
  <ul className="space-y-3" data-testid={testId}>
    {copyList(t(k)).map((item, i) => (
      <li key={i} className="flex gap-3 text-[#a0aec0] text-base leading-relaxed"><Icon className="w-4 h-4 flex-shrink-0 mt-1.5" style={{ color }} /> <span>{renderCopy(item, 'text-white font-semibold')}</span></li>
    ))}
  </ul>
);
const H2 = ({ children }) => <h2 className="text-white text-2xl sm:text-3xl font-bold mb-5" style={OUTFIT}>{children}</h2>;
const IconBox = ({ icon: Icon, color = '#d4af37' }) => (
  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}1f`, border: `1px solid ${color}4d` }}><Icon className="w-5 h-5" style={{ color }} /></div>
);

const PillarCard = ({ p, t, index }) => (
  <RevealSection delay={index * 0.05}>
    <article id={p.key} className="rounded-2xl p-6 sm:p-8 scroll-mt-28" style={{ ...CARD, border: `1px solid ${p.color}55` }} data-testid={`readiness-pillar-${p.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <IconBox icon={ICONS[p.icon]} color={p.color} />
          <h3 className="text-white text-xl sm:text-2xl font-bold" style={OUTFIT}>{t(`readiness.pillar.${p.key}.title`)}</h3>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: p.color, background: `${p.color}1a`, border: `1px solid ${p.color}40` }} data-testid={`readiness-pillar-weights-${p.key}`}>{t(`readiness.pillar.${p.key}.weights`)}</span>
      </div>
      <div className="space-y-3">{renderBlocks(t(`readiness.pillar.${p.key}.body`), BLOCK_CLASSES)}</div>
    </article>
  </RevealSection>
);

const DetailCard = ({ name, t, index }) => (
  <RevealSection delay={index * 0.05}>
    <article id={name} className="rounded-2xl p-6 sm:p-8 scroll-mt-28" style={CARD} data-testid={`readiness-part-${name}`}>
      <div className="flex items-center gap-3 mb-4">
        <IconBox icon={DETAIL_ICONS[name]} />
        <h3 className="text-white text-xl sm:text-2xl font-bold" style={OUTFIT}>{t(`readiness.detail.${name}.title`)}</h3>
      </div>
      <div className="space-y-3">{renderBlocks(t(`readiness.detail.${name}.body`), BLOCK_CLASSES)}</div>
    </article>
  </RevealSection>
);

/** /readiness-score — plain-English policy page for the dashboard readiness score (every line editable in Site Copy). */
const ReadinessScorePage = () => {
  const navigate = useNavigate();
  const { t } = useCopy();
  const [exiting, setExiting] = useState(false);
  const navigateWithFade = (path) => { setExiting(true); setTimeout(() => navigate(path), 400); };
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return undefined;
    const timer = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className={`min-h-screen transition-opacity duration-400 ${exiting ? 'opacity-0' : 'opacity-100'}`} style={{ background: '#0E1829' }} data-testid="readiness-score-page">
      <SEO title={t('readiness.seo.title')} description={t('readiness.seo.description')} path="/readiness-score" />
      <MarketingNav navigateWithFade={navigateWithFade} testIdSuffix="-readiness" />

      <section className="relative overflow-hidden" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.08) 0%, transparent 60%)' }} />
        <RevealSection className="max-w-[760px] mx-auto px-6 relative z-10 pb-12">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm text-[#8492a8] hover:text-[#d4af37] transition-colors mb-8" data-testid="readiness-back-home"><ArrowLeft className="w-4 h-4" /> {t('readiness.back')}</a>
          <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] mb-4">{t('readiness.hero.eyebrow')}</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-5" style={{ ...OUTFIT, textWrap: 'balance' }} data-testid="readiness-h1">{t('readiness.hero.title')}</h1>
          <p className="text-[#a0aec0] text-base lg:text-lg leading-relaxed" data-testid="readiness-intro">{renderCopy(t('readiness.hero.intro'), 'text-white font-semibold')}</p>
          <p className="text-[#d4af37] text-base lg:text-lg italic mt-4" data-testid="readiness-principle">{t('readiness.hero.line')}</p>
          <p className="inline-flex items-center gap-2 text-xs text-[#8492a8] mt-6" data-testid="readiness-updated"><CalendarDays className="w-3.5 h-3.5" /> {t('readiness.updated_prefix')}: <span className="text-[#a0aec0]">{t('readiness.updated')}</span></p>
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

      <section className="relative z-10 pb-6">
        <div className="max-w-[760px] mx-auto px-6">
          <RevealSection><H2>{t('readiness.pillars.title')}</H2></RevealSection>
          <div className="space-y-5">
            {READINESS_PILLARS.map((p, i) => <PillarCard key={p.key} p={p} t={t} index={i} />)}
          </div>
          <RevealSection><p className="text-sm text-[#8b97ab] leading-relaxed mt-5 px-1 inline-flex items-start gap-2" data-testid="readiness-example"><MapPin className="w-4 h-4 text-[#d4af37] flex-shrink-0 mt-0.5" /> <span>{renderCopy(t('readiness.pillars.example'), 'text-white font-semibold')}</span></p></RevealSection>
        </div>
      </section>

      <section className="relative z-10 pt-8 pb-14">
        <div className="max-w-[760px] mx-auto px-6">
          <RevealSection><H2>{t('readiness.details.title')}</H2></RevealSection>
          <div className="space-y-5">
            {READINESS_DETAILS.map((name, i) => <DetailCard key={name} name={name} t={t} index={i} />)}
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
          <div id="contingency" className="rounded-2xl p-6 sm:p-8 scroll-mt-28" style={CARD} data-testid="readiness-ccp">
            <div className="flex items-center gap-3 mb-4">
              <IconBox icon={Radio} />
              <h2 className="text-white text-2xl sm:text-3xl font-bold" style={OUTFIT}>{t('readiness.ccp.title')}</h2>
            </div>
            <p className="text-[#a0aec0] text-base leading-relaxed mb-5">{renderCopy(t('readiness.ccp.intro'), 'text-white font-semibold')}</p>
            <Bullets k="readiness.ccp.items" t={t} />
            <p className="text-sm text-[#8492a8] mt-5">{t('readiness.ccp.labels')}</p>
          </div>
        </RevealSection>
      </section>

      <section className="relative z-10 pb-14">
        <RevealSection className="max-w-[760px] mx-auto px-6">
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }} data-testid="readiness-elsewhere">
            <H2>{t('readiness.elsewhere.title')}</H2>
            <Bullets k="readiness.elsewhere.items" t={t} />
          </div>
        </RevealSection>
      </section>

      <section className="relative z-10 pb-20">
        <RevealSection className="max-w-[760px] mx-auto px-6">
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,175,55,0.25)' }} data-testid="readiness-promise">
            <div className="flex items-center gap-3 mb-4"><ShieldCheck className="w-6 h-6 text-[#d4af37]" /><h2 className="text-white text-2xl sm:text-3xl font-bold" style={OUTFIT}>{t('readiness.promise.title')}</h2></div>
            <Bullets k="readiness.promise.items" t={t} />
          </div>
        </RevealSection>
      </section>

      <section className="relative z-10 py-20 text-center" style={{ background: '#0D1B2A' }}>
        <RevealSection className="max-w-[600px] mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={OUTFIT}>{t('readiness.cta.title')}</h2>
          <p className="text-[#8b97ab] text-base mb-8">{renderCopy(t('readiness.cta.text'))}</p>
          <button onClick={() => navigateWithFade('/start')} className="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-bold text-base transition-transform active:scale-95" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="readiness-start-now">{t('readiness.cta.button')} <ChevronRight className="w-4 h-4" /></button>
          <p className="mt-5"><a href="/login" className="text-sm text-[#8b97ab] hover:text-[#d4af37] underline-offset-2 hover:underline" data-testid="readiness-signin">{t('readiness.cta.signin')}</a></p>
        </RevealSection>
      </section>

      <MarketingFooter hide="readiness" testIdSuffix="-readiness" />
    </div>
  );
};

export default ReadinessScorePage;
