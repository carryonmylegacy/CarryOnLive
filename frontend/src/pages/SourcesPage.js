import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, CalendarCheck } from 'lucide-react';
import { SEO } from '../components/SEO';
import { MarketingNav } from '../components/landing/MarketingNav';
import { MarketingFooter } from '../components/landing/MarketingFooter';
import { RevealSection } from '../components/landing/RevealSection';
import { useCopy, renderCopy } from '../copy/CopyContext';
import { SOURCE_IDS } from '../copy/siteCopySources';

const CARD = { background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.2)' };
const OUTFIT = { fontFamily: 'Outfit, sans-serif' };

const SourceEntry = ({ id, n, t }) => {
  const url = t(`sources.${id}.url`);
  const external = /^https?:/.test(url);
  return (
    <RevealSection delay={n * 0.05}>
      <article id={id} className="rounded-2xl p-6 sm:p-8 scroll-mt-28" style={CARD} data-testid={`source-${id}`}>
        <div className="flex items-start gap-4">
          <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: 'rgba(212,175,55,0.14)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.35)' }}>{n}</span>
          <div className="min-w-0 flex-1">
            <p className="text-white text-lg sm:text-xl font-bold leading-snug mb-3" style={OUTFIT} data-testid={`source-${id}-claim`}>“{t(`sources.${id}.claim`)}”</p>
            <p className="text-[#d4af37] text-xs font-bold uppercase tracking-wider mb-1">What it measures</p>
            <p className="text-[#a0aec0] text-base leading-relaxed mb-4">{renderCopy(t(`sources.${id}.measures`), 'text-white font-semibold')}</p>
            <p className="text-[#d4af37] text-xs font-bold uppercase tracking-wider mb-1">Source</p>
            <p className="text-[#e2e8f0] text-base leading-relaxed">{t(`sources.${id}.source`)}</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-sm">
              <a href={url} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} className="inline-flex items-center gap-1.5 text-[#d4af37] hover:text-[#fcd34d] underline underline-offset-4 break-all" data-testid={`source-${id}-link`}>
                {external ? url.replace(/^https?:\/\//, '') : 'How we protect this data'} <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              </a>
              <span className="inline-flex items-center gap-1.5 text-[#8492a8]"><CalendarCheck className="w-3.5 h-3.5" /> Checked: {t(`sources.${id}.checked`)}</span>
            </div>
          </div>
        </div>
      </article>
    </RevealSection>
  );
};

/** /sources — every precise statistic on the marketing site, what it measures, and where it comes from. */
const SourcesPage = () => {
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
    <div className={`min-h-screen transition-opacity duration-400 ${exiting ? 'opacity-0' : 'opacity-100'}`} style={{ background: '#0E1829' }} data-testid="sources-page">
      <SEO title={t('sources.seo.title')} description={t('sources.seo.description')} path="/sources" />
      <MarketingNav navigateWithFade={navigateWithFade} testIdSuffix="-sources" />
      <section className="relative overflow-hidden" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.08) 0%, transparent 60%)' }} />
        <RevealSection className="max-w-[760px] mx-auto px-6 relative z-10 pb-12">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm text-[#8492a8] hover:text-[#d4af37] transition-colors mb-8" data-testid="sources-back-home"><ArrowLeft className="w-4 h-4" /> {t('sources.back')}</a>
          <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] mb-4">{t('sources.hero.eyebrow')}</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-5" style={{ ...OUTFIT, textWrap: 'balance' }} data-testid="sources-h1">{t('sources.hero.title')}</h1>
          <p className="text-[#a0aec0] text-base lg:text-lg leading-relaxed" data-testid="sources-intro">{renderCopy(t('sources.hero.intro'), 'text-white font-semibold')}</p>
        </RevealSection>
      </section>
      <section className="relative z-10 pb-24">
        <div className="max-w-[760px] mx-auto px-6 space-y-5">
          {SOURCE_IDS.map((id, i) => <SourceEntry key={id} id={id} n={i + 1} t={t} />)}
        </div>
      </section>
      <MarketingFooter hide="sources" testIdSuffix="-sources" />
    </div>
  );
};

export default SourcesPage;
