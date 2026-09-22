/**
 * ComparePage — /vs (index) and /vs/:slug (CarryOn vs <competitor>).
 * Fair, dated, verifiable: competitor facts cite the public page they were read from and
 * carry the date in copy key `compare.checked`. Corrections line on every page.
 * Structure (slugs, names, URLs, check-mark rows) lives in data/compareData.js; every word
 * is founder-editable via copy/siteCopyPhase2.js.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { Check, Minus, ChevronRight, ExternalLink, Scale, ShieldCheck } from 'lucide-react';
import { SEO } from '../components/SEO';
import { MarketingNav } from '../components/landing/MarketingNav';
import { MarketingFooter } from '../components/landing/MarketingFooter';
import { RevealSection } from '../components/landing/RevealSection';
import { TrustBadges } from '../components/landing/TrustBadges';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';
import { ROW_KEYS, CARRYON_MARKS, COMPETITORS, getCompetitor } from '../data/compareData';
import { useCopy, renderCopy, copyList } from '../copy/CopyContext';

const ORIGIN = 'https://www.carryon.us';

const Cell = ({ value, highlight, t }) => {
  if (value === true) return <span className="inline-flex items-center gap-1.5 text-[#10b981] font-semibold"><Check className="w-4 h-4" /> {t('compare.table.included')}</span>;
  if (value === false) return <span className="inline-flex items-center gap-1.5 text-[#8492a8]"><Minus className="w-4 h-4" /> {t('compare.table.not_offered')}</span>;
  const notListed = typeof value === 'string' && value.startsWith('Not listed');
  return <span className={notListed ? 'text-[#8492a8]' : highlight ? 'text-[#e2e8f0]' : 'text-[#a0aec0]'}>{renderCopy(value)}</span>;
};

const ComparisonTable = ({ competitor, carryonRows, t }) => (
  <div className="rounded-2xl overflow-x-auto" style={{ border: '1px solid rgba(255,255,255,0.08)' }} data-testid="compare-table">
    <table className="w-full text-sm min-w-[640px]">
      <thead>
        <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
          <th className="text-left p-4 text-[#7b879e] font-semibold text-xs uppercase tracking-wider w-[26%]">{t('compare.table.col_what')}</th>
          <th className="text-left p-4 text-[#d4af37] font-bold w-[37%]">CarryOn</th>
          <th className="text-left p-4 text-white font-bold w-[37%]">{competitor.name}</th>
        </tr>
      </thead>
      <tbody>
        {ROW_KEYS.map(key => (
          <tr key={key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} data-testid={`compare-row-${key}`}>
            <td className="p-4 text-[#cbd5e1] font-medium align-top">{t(`compare.rows.${key}`)}</td>
            <td className="p-4 align-top leading-relaxed"><Cell value={carryonRows[key]} highlight t={t} /></td>
            <td className="p-4 align-top leading-relaxed"><Cell value={competitor.marks[key] ?? t(`compare.${competitor.slug}.rows.${key}`)} t={t} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ListCard = ({ title, items, accent, testId }) => (
  <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${accent}33` }} data-testid={testId}>
    <h3 className="text-white font-bold text-lg mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h3>
    <ul className="space-y-2.5">
      {items.map(item => (
        <li key={item} className="flex gap-2.5 text-sm text-[#a0aec0] leading-relaxed"><Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: accent }} /> {renderCopy(item)}</li>
      ))}
    </ul>
  </div>
);

const useCarryonPriceRow = (fallback) => {
  const [row, setRow] = useState(null);
  useEffect(() => {
    apiClient.get(`${API_URL}/subscriptions/plans`).then(r => {
      const tiers = (r.data.plans || []).filter(p => ['base', 'standard', 'premium'].includes(p.id) && p.price > 0);
      if (!tiers.length) return;
      const low = Math.min(...tiers.map(p => p.price)).toFixed(2);
      const high = Math.max(...tiers.map(p => p.price)).toFixed(2);
      setRow(`Base, Standard and Premium from $${low} to $${high} per month (launch pricing may apply — see /pricing). Reduced rates for seniors, military, veterans and young adults; free for hospice families.`);
    }).catch(() => {});
  }, []);
  return row ?? fallback;
};

const CompareIndex = ({ navigateWithFade, t }) => (
  <>
    <SEO title={t('compare.seo.title')} description={t('compare.seo.description')} path="/vs" />
    <section className="relative overflow-hidden" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.08) 0%, transparent 60%)' }} />
      <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10 pb-14">
        <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] mb-4">{t('compare.index.eyebrow')}</p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-5" style={{ fontFamily: 'Outfit, sans-serif', textWrap: 'balance' }} data-testid="compare-index-h1">
          {t('compare.index.h1a')} <span className="text-[#d4af37]">{t('compare.index.h1b')}</span>
        </h1>
        <p className="text-[#a0aec0] text-base lg:text-lg leading-relaxed max-w-[640px] mx-auto">
          {renderCopy(t('compare.index.intro'))}
        </p>
      </RevealSection>
    </section>
    <section className="pb-20 relative z-10">
      <div className="max-w-[1100px] mx-auto px-6 grid sm:grid-cols-3 gap-5">
        {COMPETITORS.map((c, i) => (
          <RevealSection key={c.slug} delay={i * 0.08}>
            <button type="button" onClick={() => navigateWithFade(`/vs/${c.slug}`)} className="w-full text-left rounded-2xl p-6 h-full transition-transform hover:-translate-y-0.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }} data-testid={`compare-card-${c.slug}`}>
              <Scale className="w-6 h-6 text-[#d4af37] mb-4" />
              <h2 className="text-white text-lg font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('compare.vs_word')} {c.name}</h2>
              <p className="text-[#8b97ab] text-sm leading-relaxed mb-4">{t(`compare.${c.slug}.tagline`)}</p>
              <span className="text-[#d4af37] text-sm font-semibold inline-flex items-center gap-1">{t('compare.index.card_cta')} <ChevronRight className="w-4 h-4" /></span>
            </button>
          </RevealSection>
        ))}
      </div>
    </section>
  </>
);

const CompareDetail = ({ competitor, navigateWithFade, t }) => {
  const checked = t('compare.checked');
  const priceRow = useCarryonPriceRow(t('compare.carryon.price'));
  const carryonRows = Object.fromEntries(ROW_KEYS.map(k => [k, CARRYON_MARKS[k] ?? (k === 'price' ? priceRow : t(`compare.carryon.${k}`))]));
  const vars = { name: competitor.name, checked, month: checked.split(' ')[0], year: checked.slice(-4) };
  const title = t('compare.detail.seo_title', vars);
  const description = t('compare.detail.seo_description', vars);
  const summary = copyList(t(`compare.${competitor.slug}.summary`));
  const faq = Array.from({ length: competitor.faqCount }, (_, i) => ({ q: t(`compare.${competitor.slug}.faq.${i + 1}.q`), a: t(`compare.${competitor.slug}.faq.${i + 1}.a`) })).filter(f => f.q);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: title, url: `${ORIGIN}/vs/${competitor.slug}`, dateModified: '2026-09-16', description },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Compare', item: `${ORIGIN}/vs` },
        { '@type': 'ListItem', position: 3, name: `CarryOn vs ${competitor.name}`, item: `${ORIGIN}/vs/${competitor.slug}` },
      ] },
      { '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    ],
  };
  return (
    <>
      <SEO title={title} description={description} path={`/vs/${competitor.slug}`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="relative overflow-hidden" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.08) 0%, transparent 60%)' }} />
        <RevealSection className="max-w-[860px] mx-auto px-6 text-center relative z-10 pb-12">
          <nav className="text-xs text-[#8492a8] mb-4" aria-label="Breadcrumb"><a href="/" className="hover:text-[#d4af37]">{t('footer.home')}</a> <span className="mx-1">/</span> <a href="/vs" className="hover:text-[#d4af37]">{t('footer.compare')}</a> <span className="mx-1">/</span> <span className="text-[#a0aec0]">{competitor.name}</span></nav>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-5" style={{ fontFamily: 'Outfit, sans-serif', textWrap: 'balance' }} data-testid="compare-h1">
            {t('compare.vs_word')} <span className="text-[#d4af37]">{competitor.name}</span>
          </h1>
          <p className="text-[#a0aec0] text-base lg:text-lg leading-relaxed max-w-[680px] mx-auto">{renderCopy(t(`compare.${competitor.slug}.positioning`))}</p>
          <p className="text-xs text-[#8492a8] mt-5" data-testid="compare-checked">
            {t('compare.detail.facts_before', vars)} <a href={competitor.pricingUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-[#d4af37]">{t('compare.detail.facts_link')}<ExternalLink className="inline w-3 h-3 ml-0.5" /></a> {t('compare.detail.facts_after', vars)}
          </p>
        </RevealSection>
      </section>

      <section className="relative z-10 pb-16">
        <RevealSection className="max-w-[860px] mx-auto px-6">
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.25)' }} data-testid="compare-short-version">
            <h2 className="text-white text-xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('compare.detail.short_title')}</h2>
            <ol className="space-y-3">
              {summary.map((s, i) => (
                <li key={i} className="flex gap-3 text-base text-[#cbd5e1] leading-relaxed"><span className="text-[#d4af37] font-bold flex-shrink-0">{i + 1}.</span> {renderCopy(s)}</li>
              ))}
            </ol>
          </div>
        </RevealSection>
      </section>

      <section className="relative z-10 pb-16">
        <RevealSection className="max-w-[1100px] mx-auto px-6">
          <h2 className="text-white text-2xl sm:text-3xl font-bold mb-6 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('compare.detail.side_title')}</h2>
          <ComparisonTable competitor={competitor} carryonRows={carryonRows} t={t} />
        </RevealSection>
      </section>

      <section className="relative z-10 pb-16">
        <div className="max-w-[1100px] mx-auto px-6 grid md:grid-cols-2 gap-5">
          <RevealSection><ListCard title={t('compare.detail.they_title', vars)} items={copyList(t(`compare.${competitor.slug}.they_have`))} accent="#94a3b8" testId="compare-they-have" /></RevealSection>
          <RevealSection delay={0.08}><ListCard title={t('compare.detail.we_title')} items={copyList(t(`compare.${competitor.slug}.we_have`))} accent="#d4af37" testId="compare-we-have" /></RevealSection>
        </div>
      </section>

      <section className="relative z-10 pb-16">
        <RevealSection className="max-w-[860px] mx-auto px-6">
          <h2 className="text-white text-2xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('compare.detail.faq_title')}</h2>
          <div className="space-y-4">
            {faq.map((f, i) => (
              <div key={i} className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} data-testid={`compare-faq-${i}`}>
                <h3 className="text-white font-semibold text-base mb-2">{f.q}</h3>
                <p className="text-[#a0aec0] text-sm leading-relaxed">{renderCopy(f.a)}</p>
              </div>
            ))}
          </div>
        </RevealSection>
      </section>

      <section className="relative z-10 py-16 text-center">
        <RevealSection className="max-w-[600px] mx-auto px-6">
          <ShieldCheck className="w-8 h-8 text-[#d4af37] mx-auto mb-4" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('compare.detail.cta_title')}</h2>
          <p className="text-[#8b97ab] text-base mb-8">{renderCopy(t('compare.detail.cta_text'))}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button type="button" onClick={() => navigateWithFade('/start')} className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-lg font-bold text-base transition-transform active:scale-95" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="compare-start-now">{t('compare.detail.cta_start')} <ChevronRight className="w-4 h-4" /></button>
            <button type="button" onClick={() => navigateWithFade('/pricing')} className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-lg font-semibold text-base transition-colors" style={{ border: '1px solid rgba(212,175,55,0.4)', color: '#d4af37' }} data-testid="compare-see-pricing">{t('compare.detail.cta_pricing')}</button>
          </div>
          <TrustBadges className="mt-8" testIdSuffix={`-vs-${competitor.slug}`} />
          <p className="text-xs text-[#8492a8] mt-8" data-testid="compare-corrections">
            {t('compare.detail.corrections_before', vars)} <a href="mailto:info@carryon.us" className="underline hover:text-[#d4af37]">info@carryon.us</a> {t('compare.detail.corrections_after')}
          </p>
        </RevealSection>
      </section>
    </>
  );
};

const ComparePage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t } = useCopy();
  const [exiting, setExiting] = useState(false);
  const navigateWithFade = (path) => { setExiting(true); setTimeout(() => navigate(path), 400); };
  const competitor = slug ? getCompetitor(slug) : null;
  if (slug && !competitor) return <Navigate to="/vs" replace />;
  return (
    <div className={`min-h-screen transition-opacity duration-400 ${exiting ? 'opacity-0' : 'opacity-100'}`} style={{ background: '#0E1829' }} data-testid="compare-page">
      <MarketingNav navigateWithFade={navigateWithFade} testIdSuffix="-compare" />
      {competitor ? <CompareDetail competitor={competitor} navigateWithFade={navigateWithFade} t={t} /> : <CompareIndex navigateWithFade={navigateWithFade} t={t} />}
      <MarketingFooter hide="compare" testIdSuffix="-compare" />
    </div>
  );
};

export default ComparePage;
