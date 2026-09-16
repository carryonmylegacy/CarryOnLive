/**
 * ComparePage — /vs (index) and /vs/:slug (CarryOn vs <competitor>).
 * Fair, dated, verifiable: competitor facts come from data/compareData.js and
 * cite the public page they were read from. Corrections line on every page.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { Check, Minus, ChevronRight, ExternalLink, Scale, ShieldCheck } from 'lucide-react';
import { SEO } from '../components/SEO';
import { MarketingNav } from '../components/landing/MarketingNav';
import { RevealSection } from '../components/landing/RevealSection';
import { TrustBadges } from '../components/landing/TrustBadges';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';
import { CARRYON, COMPETITORS, ROWS, CHECKED, getCompetitor } from '../data/compareData';

const ORIGIN = 'https://www.carryon.us';

const Cell = ({ value, highlight }) => {
  if (value === true) return <span className="inline-flex items-center gap-1.5 text-[#10b981] font-semibold"><Check className="w-4 h-4" /> Included</span>;
  if (value === false) return <span className="inline-flex items-center gap-1.5 text-[#64748b]"><Minus className="w-4 h-4" /> Not offered</span>;
  const notListed = typeof value === 'string' && value.startsWith('Not listed');
  return <span className={notListed ? 'text-[#64748b]' : highlight ? 'text-[#e2e8f0]' : 'text-[#a0aec0]'}>{value}</span>;
};

const ComparisonTable = ({ competitor, carryonRows }) => (
  <div className="rounded-2xl overflow-x-auto" style={{ border: '1px solid rgba(255,255,255,0.08)' }} data-testid="compare-table">
    <table className="w-full text-sm min-w-[640px]">
      <thead>
        <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
          <th className="text-left p-4 text-[#7b879e] font-semibold text-xs uppercase tracking-wider w-[26%]">What matters</th>
          <th className="text-left p-4 text-[#d4af37] font-bold w-[37%]">CarryOn</th>
          <th className="text-left p-4 text-white font-bold w-[37%]">{competitor.name}</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map(r => (
          <tr key={r.key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} data-testid={`compare-row-${r.key}`}>
            <td className="p-4 text-[#cbd5e1] font-medium align-top">{r.label}</td>
            <td className="p-4 align-top leading-relaxed"><Cell value={carryonRows[r.key]} highlight /></td>
            <td className="p-4 align-top leading-relaxed"><Cell value={competitor.rows[r.key]} /></td>
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
      {items.map(t => (
        <li key={t} className="flex gap-2.5 text-sm text-[#a0aec0] leading-relaxed"><Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: accent }} /> {t}</li>
      ))}
    </ul>
  </div>
);

const Footer = () => (
  <footer className="py-8 text-center text-[#334155] text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
    <a href="/" className="hover:text-[#7b879e] mr-5">Home</a><a href="/pricing" className="hover:text-[#7b879e] mr-5">Pricing</a><a href="/vs" className="hover:text-[#7b879e] mr-5">Compare</a><a href="/about" className="hover:text-[#7b879e] mr-5">About</a><a href="/changelog" className="hover:text-[#7b879e]">What&apos;s new</a>
    <p className="mt-3">&copy; {new Date().getFullYear()} CarryOn Technologies LLC</p>
  </footer>
);

const useCarryonPriceRow = () => {
  const [row, setRow] = useState(CARRYON.rows.price);
  useEffect(() => {
    apiClient.get(`${API_URL}/subscriptions/plans`).then(r => {
      const tiers = (r.data.plans || []).filter(p => ['base', 'standard', 'premium'].includes(p.id) && p.price > 0);
      if (!tiers.length) return;
      const low = Math.min(...tiers.map(p => p.price)).toFixed(2);
      const high = Math.max(...tiers.map(p => p.price)).toFixed(2);
      setRow(`Base, Standard and Premium from $${low} to $${high} per month (launch pricing may apply — see /pricing). Reduced rates for seniors, military, veterans and young adults; free for hospice families.`);
    }).catch(() => {});
  }, []);
  return row;
};

const CompareIndex = ({ navigateWithFade }) => (
  <>
    <SEO title="CarryOn vs Trustworthy, Everplans & Resolve Legacy — Honest Comparisons" description="Side-by-side, dated comparisons of CarryOn with Trustworthy, Everplans and Resolve Legacy: price, family sharing, checklists, emergency plans, AI review, security and data export." path="/vs" />
    <section className="relative overflow-hidden" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.08) 0%, transparent 60%)' }} />
      <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10 pb-14">
        <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] mb-4">Compare</p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-5" style={{ fontFamily: 'Outfit, sans-serif', textWrap: 'balance' }} data-testid="compare-index-h1">
          How CarryOn compares — <span className="text-[#d4af37]">honestly.</span>
        </h1>
        <p className="text-[#a0aec0] text-base lg:text-lg leading-relaxed max-w-[640px] mx-auto">
          Every comparison below quotes the other company&apos;s public website, says when we checked, and lists what they do that we don&apos;t. Pick the tool that fits your family — even if it isn&apos;t us.
        </p>
      </RevealSection>
    </section>
    <section className="pb-20 relative z-10">
      <div className="max-w-[1100px] mx-auto px-6 grid sm:grid-cols-3 gap-5">
        {COMPETITORS.map((c, i) => (
          <RevealSection key={c.slug} delay={i * 0.08}>
            <button type="button" onClick={() => navigateWithFade(`/vs/${c.slug}`)} className="w-full text-left rounded-2xl p-6 h-full transition-transform hover:-translate-y-0.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }} data-testid={`compare-card-${c.slug}`}>
              <Scale className="w-6 h-6 text-[#d4af37] mb-4" />
              <h2 className="text-white text-lg font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>CarryOn vs {c.name}</h2>
              <p className="text-[#8b97ab] text-sm leading-relaxed mb-4">{c.tagline}</p>
              <span className="text-[#d4af37] text-sm font-semibold inline-flex items-center gap-1">Read the comparison <ChevronRight className="w-4 h-4" /></span>
            </button>
          </RevealSection>
        ))}
      </div>
    </section>
  </>
);

const CompareDetail = ({ competitor, navigateWithFade }) => {
  const priceRow = useCarryonPriceRow();
  const carryonRows = { ...CARRYON.rows, price: priceRow };
  const title = `CarryOn vs ${competitor.name} — Which Is Right for Your Family? (${CHECKED.split(' ')[0]} ${CHECKED.slice(-4)})`;
  const description = `An honest, dated comparison of CarryOn and ${competitor.name}: price, family sharing, first-hours checklist, emergency plans, AI review, security and data export. Checked ${CHECKED}.`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: title, url: `${ORIGIN}/vs/${competitor.slug}`, dateModified: '2026-09-16', description },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Compare', item: `${ORIGIN}/vs` },
        { '@type': 'ListItem', position: 3, name: `CarryOn vs ${competitor.name}`, item: `${ORIGIN}/vs/${competitor.slug}` },
      ] },
      { '@type': 'FAQPage', mainEntity: competitor.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    ],
  };
  return (
    <>
      <SEO title={title} description={description} path={`/vs/${competitor.slug}`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="relative overflow-hidden" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.08) 0%, transparent 60%)' }} />
        <RevealSection className="max-w-[860px] mx-auto px-6 text-center relative z-10 pb-12">
          <nav className="text-xs text-[#64748b] mb-4" aria-label="Breadcrumb"><a href="/" className="hover:text-[#d4af37]">Home</a> <span className="mx-1">/</span> <a href="/vs" className="hover:text-[#d4af37]">Compare</a> <span className="mx-1">/</span> <span className="text-[#a0aec0]">{competitor.name}</span></nav>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-5" style={{ fontFamily: 'Outfit, sans-serif', textWrap: 'balance' }} data-testid="compare-h1">
            CarryOn vs <span className="text-[#d4af37]">{competitor.name}</span>
          </h1>
          <p className="text-[#a0aec0] text-base lg:text-lg leading-relaxed max-w-[680px] mx-auto">{competitor.positioning}</p>
          <p className="text-xs text-[#64748b] mt-5" data-testid="compare-checked">
            Facts about {competitor.name} were read from <a href={competitor.pricingUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-[#d4af37]">their public website<ExternalLink className="inline w-3 h-3 ml-0.5" /></a> on {CHECKED}. Trademarks belong to their owners.
          </p>
        </RevealSection>
      </section>

      <section className="relative z-10 pb-16">
        <RevealSection className="max-w-[860px] mx-auto px-6">
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.25)' }} data-testid="compare-short-version">
            <h2 className="text-white text-xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>The short version</h2>
            <ol className="space-y-3">
              {competitor.summary.map((s, i) => (
                <li key={i} className="flex gap-3 text-base text-[#cbd5e1] leading-relaxed"><span className="text-[#d4af37] font-bold flex-shrink-0">{i + 1}.</span> {s}</li>
              ))}
            </ol>
          </div>
        </RevealSection>
      </section>

      <section className="relative z-10 pb-16">
        <RevealSection className="max-w-[1100px] mx-auto px-6">
          <h2 className="text-white text-2xl sm:text-3xl font-bold mb-6 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>Side by side</h2>
          <ComparisonTable competitor={competitor} carryonRows={carryonRows} />
        </RevealSection>
      </section>

      <section className="relative z-10 pb-16">
        <div className="max-w-[1100px] mx-auto px-6 grid md:grid-cols-2 gap-5">
          <RevealSection><ListCard title={`What ${competitor.name} has that we don\u2019t (yet)`} items={competitor.theyHave} accent="#94a3b8" testId="compare-they-have" /></RevealSection>
          <RevealSection delay={0.08}><ListCard title="What CarryOn adds beyond the vault" items={competitor.weHave} accent="#d4af37" testId="compare-we-have" /></RevealSection>
        </div>
      </section>

      <section className="relative z-10 pb-16">
        <RevealSection className="max-w-[860px] mx-auto px-6">
          <h2 className="text-white text-2xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>Common questions</h2>
          <div className="space-y-4">
            {competitor.faq.map((f, i) => (
              <div key={i} className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} data-testid={`compare-faq-${i}`}>
                <h3 className="text-white font-semibold text-base mb-2">{f.q}</h3>
                <p className="text-[#a0aec0] text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </RevealSection>
      </section>

      <section className="relative z-10 py-16 text-center">
        <RevealSection className="max-w-[600px] mx-auto px-6">
          <ShieldCheck className="w-8 h-8 text-[#d4af37] mx-auto mb-4" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>See it for yourself</h2>
          <p className="text-[#8b97ab] text-base mb-8">Explore CarryOn for 30 days with no card. Upload one document and invite one person — that&apos;s a real start.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button type="button" onClick={() => navigateWithFade('/start')} className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-lg font-bold text-base transition-transform active:scale-95" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="compare-start-now">Start Now <ChevronRight className="w-4 h-4" /></button>
            <button type="button" onClick={() => navigateWithFade('/pricing')} className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-lg font-semibold text-base transition-colors" style={{ border: '1px solid rgba(212,175,55,0.4)', color: '#d4af37' }} data-testid="compare-see-pricing">See pricing</button>
          </div>
          <TrustBadges className="mt-8" testIdSuffix={`-vs-${competitor.slug}`} />
          <p className="text-xs text-[#64748b] mt-8" data-testid="compare-corrections">
            Spotted something out of date about {competitor.name}? Email <a href="mailto:info@carryon.us" className="underline hover:text-[#d4af37]">info@carryon.us</a> and we&apos;ll correct it within one business day.
          </p>
        </RevealSection>
      </section>
    </>
  );
};

const ComparePage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);
  const navigateWithFade = (path) => { setExiting(true); setTimeout(() => navigate(path), 400); };
  const competitor = slug ? getCompetitor(slug) : null;
  if (slug && !competitor) return <Navigate to="/vs" replace />;
  return (
    <div className={`min-h-screen transition-opacity duration-400 ${exiting ? 'opacity-0' : 'opacity-100'}`} style={{ background: '#0E1829' }} data-testid="compare-page">
      <MarketingNav navigateWithFade={navigateWithFade} testIdSuffix="-compare" />
      {competitor ? <CompareDetail competitor={competitor} navigateWithFade={navigateWithFade} /> : <CompareIndex navigateWithFade={navigateWithFade} />}
      <Footer />
    </div>
  );
};

export default ComparePage;
