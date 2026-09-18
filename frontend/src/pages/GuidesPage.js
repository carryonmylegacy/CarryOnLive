import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Clock, FolderOpen, Mail, UserCheck, Radio, Eye } from 'lucide-react';
import { SEO } from '../components/SEO';
import { MarketingNav } from '../components/landing/MarketingNav';
import { MarketingFooter } from '../components/landing/MarketingFooter';
import { RevealSection } from '../components/landing/RevealSection';
import { useCopy, renderCopy, renderBlocks, copyList } from '../copy/CopyContext';
import { useAuth } from '../contexts/AuthContext';
import { GUIDE_ARTICLES } from '../copy/siteCopyGuides';

const ORIGIN = 'https://www.carryon.us';
const ICONS = { FolderOpen, Mail, UserCheck, Clock, Radio };
const CARD = { background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.2)' };
const BLOCKS = { pClass: 'text-[#a0aec0] text-base lg:text-lg leading-relaxed mb-5 last:mb-0', ulClass: 'space-y-2.5 mb-5 last:mb-0', liClass: 'relative pl-6 text-[#a0aec0] text-base lg:text-lg leading-relaxed before:content-["•"] before:absolute before:left-1 before:text-[#d4af37] before:font-bold', strongClass: 'text-white font-semibold' };
const OUTFIT = { fontFamily: 'Outfit, sans-serif' };

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '');
const articleText = (a, t) => [t(`guides.${a.slug}.intro`), ...a.sections.map((_, i) => t(`guides.${a.slug}.s${i + 1}.body`))].join(' ');
const readMinutes = (text) => Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 220));

const JsonLd = ({ data }) => <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;

const Byline = ({ t, publishedAt, minutes, testId }) => (
  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748b]" data-testid={testId}>
    <a href={t('guides.index.byline_url')} className="text-[#a0aec0] font-semibold hover:text-[#d4af37]">{t('guides.index.byline')}</a>
    {publishedAt && <span>{t('guides.index.published_prefix')} <time dateTime={publishedAt}>{fmtDate(publishedAt)}</time></span>}
    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {t('guides.index.read_time', { minutes })}</span>
  </p>
);

const GuideCard = ({ a, t, publishedAt, index }) => {
  const Icon = ICONS[a.icon] || FolderOpen;
  return (
    <RevealSection delay={index * 0.06}>
      <a href={`/guides/${a.slug}`} className="block rounded-2xl p-6 sm:p-8 transition-transform hover:-translate-y-0.5" style={CARD} data-testid={`guide-card-${index}`}>
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)' }}><Icon className="w-5 h-5 text-[#d4af37]" /></div>
          <div className="min-w-0">
            <h2 className="text-white text-xl sm:text-2xl font-bold leading-snug mb-2" style={OUTFIT}>{t(`guides.${a.slug}.title`)}</h2>
            <p className="text-[#a0aec0] text-base leading-relaxed mb-4">{renderCopy(t(`guides.${a.slug}.dek`))}</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Byline t={t} publishedAt={publishedAt} minutes={readMinutes(articleText(a, t))} />
              <span className="inline-flex items-center gap-1 text-sm font-bold text-[#d4af37]">{t('guides.index.read_more')} <ChevronRight className="w-4 h-4" /></span>
            </div>
          </div>
        </div>
      </a>
    </RevealSection>
  );
};

const GuidesIndex = ({ t, publishedAt }) => (
  <>
    <SEO title={t('guides.index.seo.title')} description={t('guides.index.seo.description')} path="/guides" />
    <JsonLd data={{
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: t('guides.index.seo.title'), description: t('guides.index.seo.description'), url: `${ORIGIN}/guides`,
      mainEntity: { '@type': 'ItemList', itemListElement: GUIDE_ARTICLES.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/guides/${a.slug}`, name: t(`guides.${a.slug}.title`) })) },
    }} />
    <section className="relative overflow-hidden" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.08) 0%, transparent 60%)' }} />
      <RevealSection className="max-w-[760px] mx-auto px-6 text-center relative z-10 pb-14">
        <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] mb-4">{t('guides.index.eyebrow')}</p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-5" style={{ ...OUTFIT, textWrap: 'balance' }} data-testid="guides-h1">{t('guides.index.title')}</h1>
        <p className="text-[#a0aec0] text-base lg:text-lg leading-relaxed">{renderCopy(t('guides.index.intro'))}</p>
      </RevealSection>
    </section>
    <section className="relative z-10 pb-24">
      <div className="max-w-[760px] mx-auto px-6 space-y-5" data-testid="guides-list">
        {GUIDE_ARTICLES.map((a, i) => <GuideCard key={a.slug} a={a} t={t} publishedAt={publishedAt} index={i} />)}
      </div>
    </section>
  </>
);

const GuideArticle = ({ a, t, publishedAt, navigateWithFade }) => {
  const k = (s) => `guides.${a.slug}.${s}`;
  const title = t(k('title'));
  const url = `${ORIGIN}/guides/${a.slug}`;
  const minutes = readMinutes(articleText(a, t));
  const others = GUIDE_ARTICLES.filter(o => o.slug !== a.slug);
  useEffect(() => { window.scrollTo(0, 0); }, [a.slug]);
  return (
    <>
      <SEO title={t(k('seo.title'))} description={t(k('seo.description'))} path={`/guides/${a.slug}`} />
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'Article', headline: title, description: t(k('dek')), url, mainEntityOfPage: url,
        image: `${ORIGIN}/carryon-logo.png`, wordCount: articleText(a, t).split(/\s+/).filter(Boolean).length,
        author: { '@type': 'Person', name: t('guides.index.byline').split(',')[0].trim(), url: `${ORIGIN}${t('guides.index.byline_url')}` },
        publisher: { '@type': 'Organization', name: 'CarryOn', url: ORIGIN, logo: { '@type': 'ImageObject', url: `${ORIGIN}/carryon-logo.png` } },
        ...(publishedAt ? { datePublished: publishedAt, dateModified: publishedAt } : {}),
      }} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: t('guides.index.eyebrow'), item: `${ORIGIN}/guides` },
        { '@type': 'ListItem', position: 3, name: title, item: url },
      ] }} />
      <article className="relative overflow-hidden" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))' }} data-testid="guide-article">
        <div className="absolute inset-0 h-[520px]" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.08) 0%, transparent 60%)' }} />
        <div className="max-w-[720px] mx-auto px-6 relative z-10">
          <RevealSection>
            <a href="/guides" className="inline-flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#d4af37] transition-colors mb-8" data-testid="guide-back"><ArrowLeft className="w-4 h-4" /> {t('guides.index.back')}</a>
            <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] mb-4">{t('guides.index.eyebrow')}</p>
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-[1.1] mb-5" style={{ ...OUTFIT, textWrap: 'balance' }} data-testid="guide-h1">{title}</h1>
            <p className="text-[#a0aec0] text-lg lg:text-xl leading-relaxed mb-6" data-testid="guide-dek">{renderCopy(t(k('dek')))}</p>
            <Byline t={t} publishedAt={publishedAt} minutes={minutes} testId="guide-byline" />
          </RevealSection>
          <div className="my-10 h-px" style={{ background: 'linear-gradient(90deg, rgba(212,175,55,0.5), transparent)' }} />
          <RevealSection data-testid="guide-intro">{renderBlocks(t(k('intro')), BLOCKS)}</RevealSection>
          {a.sections.map((_, i) => (
            <RevealSection key={i} className="mt-12" data-testid={`guide-section-${i + 1}`}>
              <h2 className="text-white text-2xl sm:text-3xl font-bold mb-4" style={OUTFIT}>{t(k(`s${i + 1}.h`))}</h2>
              <div>{renderBlocks(t(k(`s${i + 1}.body`)), BLOCKS)}</div>
            </RevealSection>
          ))}
          <RevealSection className="mt-14 rounded-2xl p-6 sm:p-8" style={{ ...CARD, border: '1px solid rgba(212,175,55,0.4)' }} data-testid="guide-takeaways">
            <h2 className="text-white text-xl font-bold mb-4" style={OUTFIT}>{t('guides.index.takeaways_title')}</h2>
            <ol className="space-y-3">
              {copyList(t(k('takeaways'))).map((item, i) => (
                <li key={i} className="flex gap-3 text-base text-[#cbd5e1] leading-relaxed"><span className="text-[#d4af37] font-bold flex-shrink-0">{i + 1}.</span> <span>{renderCopy(item, 'text-white font-semibold')}</span></li>
              ))}
            </ol>
          </RevealSection>
          <p className="mt-8 text-sm text-[#64748b] leading-relaxed" data-testid="guide-disclaimer">{renderCopy(t('guides.index.disclaimer'))}</p>
        </div>
      </article>

      <section className="relative z-10 py-20 text-center mt-16" style={{ background: '#0D1B2A' }}>
        <RevealSection className="max-w-[600px] mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={OUTFIT}>{t('guides.index.cta.title')}</h2>
          <p className="text-[#8b97ab] text-base mb-8">{renderCopy(t('guides.index.cta.text'))}</p>
          <button onClick={() => navigateWithFade('/start')} className="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-bold text-base transition-transform active:scale-95" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="guide-start-now">{t('guides.index.cta.button')} <ChevronRight className="w-4 h-4" /></button>
        </RevealSection>
      </section>

      <section className="relative z-10 py-16">
        <div className="max-w-[760px] mx-auto px-6">
          <h2 className="text-white text-xl font-bold mb-5" style={OUTFIT}>{t('guides.index.more_title')}</h2>
          <div className="space-y-3" data-testid="guide-more">
            {others.map(o => (
              <a key={o.slug} href={`/guides/${o.slug}`} className="flex items-center justify-between gap-4 rounded-xl px-5 py-4 text-[#cbd5e1] hover:text-white transition-colors" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-base font-semibold leading-snug">{t(`guides.${o.slug}.title`)}</span><ChevronRight className="w-4 h-4 text-[#d4af37] flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

const Unlaunched = ({ t }) => (
  <section className="min-h-[70vh] flex items-center justify-center px-6 text-center" style={{ paddingTop: 'calc(6rem + env(safe-area-inset-top, 0px))' }} data-testid="guides-unlaunched">
    <SEO title={t('guides.index.unlaunched.title')} description={t('guides.index.unlaunched.text')} path="/guides" noindex />
    <div className="max-w-[520px]">
      <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] mb-4">{t('guides.index.eyebrow')}</p>
      <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={OUTFIT}>{t('guides.index.unlaunched.title')}</h1>
      <p className="text-[#a0aec0] text-base mb-8">{renderCopy(t('guides.index.unlaunched.text'))}</p>
      <a href="/" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="guides-unlaunched-home">{t('guides.index.unlaunched.button')}</a>
    </div>
  </section>
);

/** /guides and /guides/:slug — hidden (noindex) until the founder launches the section; staff can preview. */
const GuidesPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t, flags, loaded } = useCopy();
  const { user } = useAuth();
  const [exiting, setExiting] = useState(false);
  const navigateWithFade = (path) => { setExiting(true); setTimeout(() => navigate(path), 400); };
  const article = useMemo(() => (slug ? GUIDE_ARTICLES.find(a => a.slug === slug) : null), [slug]);
  const staffPreview = !flags.guides_launched && user?.role === 'admin';
  const visible = flags.guides_launched || staffPreview;
  const publishedAt = flags.guides_launched ? flags.guides_launched_at : null;
  if (slug && !article) return <Navigate to="/guides" replace />;
  return (
    <div className={`min-h-screen transition-opacity duration-400 ${exiting ? 'opacity-0' : 'opacity-100'}`} style={{ background: '#0E1829' }} data-testid="guides-page">
      <MarketingNav navigateWithFade={navigateWithFade} testIdSuffix="-guides" />
      {staffPreview && (
        <div className="fixed left-0 right-0 z-[90] text-center text-xs font-bold px-4 py-2" style={{ top: 'calc(4rem + env(safe-area-inset-top, 0px))', background: 'rgba(212,175,55,0.95)', color: '#0B1221' }} data-testid="guides-preview-banner">
          <Eye className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />{t('guides.index.preview_banner')}
        </div>
      )}
      {!visible && loaded && <Unlaunched t={t} />}
      {!visible && !loaded && <div className="min-h-[70vh]" aria-busy="true" />}
      {visible && (article
        ? <GuideArticle a={article} t={t} publishedAt={publishedAt} navigateWithFade={navigateWithFade} />
        : <GuidesIndex t={t} publishedAt={publishedAt} />)}
      <MarketingFooter testIdSuffix="-guides" />
    </div>
  );
};

export default GuidesPage;
