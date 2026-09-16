import React, { useState } from 'react';
import { SEO } from '../components/SEO';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { MarketingNav } from '../components/landing/MarketingNav';
import { RevealSection } from '../components/landing/RevealSection';
import { FounderCard, useFounder } from '../components/landing/FounderCard';
import { TestimonialCard, useTestimonials } from '../components/landing/TestimonialsBlock';
import { TestimonialForm } from '../components/landing/TestimonialForm';
import { ProductPreview } from '../components/landing/ProductPreview';
import { TrustBadges } from '../components/landing/TrustBadges';

const CustomersPage = () => {
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);
  const navigateWithFade = (path) => { setExiting(true); setTimeout(() => navigate(path), 400); };
  const { items, total, loaded } = useTestimonials(50);
  const founder = useFounder();

  return (
    <div className={`min-h-screen transition-opacity duration-400 ${exiting ? 'opacity-0' : 'opacity-100'}`} style={{ background: '#0E1829' }} data-testid="customers-page">
      <SEO title="Customer Stories - CarryOn | Real Families, Real Words" description="CarryOn publishes only real member stories, reviewed by the founder. Read them here, see the actual product, and share your own." path="/customers" />
      <MarketingNav navigateWithFade={navigateWithFade} testIdSuffix="-customers" />

      <section className="relative overflow-hidden" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.08) 0%, transparent 60%)' }} />
        <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10 pb-16">
          <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] mb-4">Customer stories</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-5" style={{ fontFamily: 'Outfit, sans-serif', textWrap: 'balance' }} data-testid="customers-h1">
            Real families. Real words. <span className="text-[#d4af37]">Nothing invented.</span>
          </h1>
          <p className="text-[#a0aec0] text-base lg:text-lg leading-relaxed max-w-[640px] mx-auto">
            CarryOn launched in 2024. We don&apos;t buy reviews, we don&apos;t write our own, and we don&apos;t publish a quote we can&apos;t stand behind. Every story on this page comes from an actual member, is reviewed by the founder, and is marked <span className="text-[#10b981] font-medium">Verified member</span> when the email matches a CarryOn account.
          </p>
        </RevealSection>
      </section>

      <section className="relative z-10 pb-20" data-testid="customers-stories">
        <div className="max-w-[1100px] mx-auto px-6">
          {loaded && total === 0 && (
            <RevealSection>
              <div className="rounded-2xl p-8 sm:p-10 text-center" style={{ background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.25)' }} data-testid="customers-empty">
                <ShieldCheck className="w-8 h-8 text-[#d4af37] mx-auto mb-4" />
                <h2 className="text-white text-2xl font-bold mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>No published stories yet &mdash; on purpose.</h2>
                <p className="text-[#a0aec0] text-base leading-relaxed max-w-[560px] mx-auto">
                  Our first families are still building their plans. We&apos;d rather show you an empty page than a made-up one. When a member shares their words and the founder approves them, they appear here &mdash; and on the homepage &mdash; automatically.
                </p>
              </div>
            </RevealSection>
          )}
          {items.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {items.map((t, i) => <RevealSection key={t.id} delay={(i % 3) * 0.08}><TestimonialCard t={t} testIdSuffix="-customers" /></RevealSection>)}
            </div>
          )}
        </div>
      </section>

      <ProductPreview testIdSuffix="-customers" />

      <section className="relative z-10 py-20" style={{ background: 'linear-gradient(180deg, #111F34, #0D1B2A)' }} data-testid="customers-founder">
        <div className="max-w-[1000px] mx-auto px-6">
          <RevealSection>
            <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] text-center mb-3">A word from the founder</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-10" style={{ fontFamily: 'Outfit, sans-serif' }}>Why a 24-year veteran built this.</h2>
          </RevealSection>
          <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
            <RevealSection>
              {founder.video_id ? (
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(212,175,55,0.25)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', aspectRatio: '16 / 9', background: '#0b1322' }}>
                  <iframe src={`https://www.youtube.com/embed/${founder.video_id}?rel=0&modestbranding=1`} title={`${founder.name} on why he built CarryOn`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen data-testid="customers-founder-video" />
                </div>
              ) : null}
            </RevealSection>
            <RevealSection delay={0.1}><FounderCard testIdSuffix="-customers" /></RevealSection>
          </div>
        </div>
      </section>

      <section id="share" className="relative z-10 py-20" style={{ background: '#0D1B2A' }} data-testid="customers-share">
        <div className="max-w-[760px] mx-auto px-6">
          <RevealSection>
            <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] text-center mb-3">Already a member?</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>Share your story.</h2>
            <p className="text-[#a0aec0] text-base text-center leading-relaxed mb-10 max-w-[560px] mx-auto">Tell other families what made you set this up and what changed. The founder reads every submission; nothing is published without your consent.</p>
          </RevealSection>
          <RevealSection delay={0.1}>
            <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.25)' }}>
              <TestimonialForm />
            </div>
          </RevealSection>
        </div>
      </section>

      <section className="relative z-10 py-20 text-center" style={{ background: '#0E1829' }}>
        <RevealSection className="max-w-[600px] mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Not a member yet?</h2>
          <p className="text-[#8b97ab] text-base mb-8">Explore first, no card needed. Upload one document and invite one person &mdash; that&apos;s a real start.</p>
          <button onClick={() => navigateWithFade('/start')} className="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-bold text-base transition-transform active:scale-95" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="customers-start-now">Start Now <ChevronRight className="w-4 h-4" /></button>
          <TrustBadges className="mt-8" testIdSuffix="-customers" />
        </RevealSection>
      </section>

      <footer className="py-8 text-center text-[#334155] text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <a href="/" className="hover:text-[#7b879e] mr-5">Home</a><a href="/pricing" className="hover:text-[#7b879e] mr-5">Pricing</a><a href="/vs" className="hover:text-[#7b879e] mr-5">Compare</a><a href="/about" className="hover:text-[#7b879e] mr-5">About</a><a href="/changelog" className="hover:text-[#7b879e]">What&apos;s new</a>
        <p className="mt-3">&copy; {new Date().getFullYear()} CarryOn Technologies LLC</p>
      </footer>
    </div>
  );
};

export default CustomersPage;
