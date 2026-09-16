import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { MarketingNav } from '../components/landing/MarketingNav';
import { RevealSection } from '../components/landing/RevealSection';
import { useChangelog, formatDate } from '../components/landing/TrustBadges';

const ChangelogPage = () => {
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);
  const navigateWithFade = (path) => { setExiting(true); setTimeout(() => navigate(path), 400); };
  const entries = useChangelog();

  return (
    <div className={`min-h-screen transition-opacity duration-400 ${exiting ? 'opacity-0' : 'opacity-100'}`} style={{ background: '#0E1829' }} data-testid="changelog-page">
      <>
        <title>What's New - CarryOn Product Updates</title>
        <meta name="description" content="Every real CarryOn product update, dated. Founded 2024 in Arlington, Virginia." />
        <link rel="canonical" href="https://carryon.us/changelog" />
        <meta property="og:title" content="What's New - CarryOn" />
        <meta property="og:url" content="https://carryon.us/changelog" />
      </>
      <MarketingNav navigateWithFade={navigateWithFade} testIdSuffix="-changelog" />

      <section className="relative overflow-hidden" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.08) 0%, transparent 60%)' }} />
        <RevealSection className="max-w-[760px] mx-auto px-6 text-center relative z-10 pb-14">
          <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] mb-4">Built in the open</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-5" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="changelog-h1">What&apos;s new in CarryOn</h1>
          <p className="text-[#a0aec0] text-base lg:text-lg leading-relaxed">Every real update, dated. No press releases, no awards we haven&apos;t won. Founded 2024 &middot; Arlington, Virginia.</p>
        </RevealSection>
      </section>

      <section className="relative z-10 pb-24">
        <div className="max-w-[760px] mx-auto px-6 space-y-6">
          {entries.map((e, i) => (
            <RevealSection key={e.title} delay={i * 0.06}>
              <article className="rounded-2xl p-6 sm:p-8" style={{ background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: `1px solid ${i === 0 ? 'rgba(212,175,55,0.45)' : 'rgba(212,175,55,0.2)'}` }} data-testid={`changelog-entry-${i}`}>
                <p className="text-[#d4af37] text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">{i === 0 && <Sparkles className="w-3.5 h-3.5" />}{e.date ? formatDate(e.date) : 'Foundation'}</p>
                <h2 className="text-white text-xl sm:text-2xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>{e.title}</h2>
                <ul className="space-y-2">
                  {e.items.map(item => (
                    <li key={item} className="flex gap-3 text-[#a0aec0] text-sm leading-relaxed"><span className="w-1.5 h-1.5 rounded-full bg-[#d4af37] mt-2 flex-shrink-0" />{item}</li>
                  ))}
                </ul>
              </article>
            </RevealSection>
          ))}
        </div>
      </section>

      <section className="relative z-10 py-20 text-center" style={{ background: '#0D1B2A' }}>
        <RevealSection className="max-w-[600px] mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>See it for yourself.</h2>
          <p className="text-[#8b97ab] text-base mb-8">Explore first, no card needed.</p>
          <button onClick={() => navigateWithFade('/start')} className="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-bold text-base transition-transform active:scale-95" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="changelog-start-now">Start Now <ChevronRight className="w-4 h-4" /></button>
        </RevealSection>
      </section>

      <footer className="py-8 text-center text-[#334155] text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <a href="/" className="hover:text-[#7b879e] mr-5">Home</a><a href="/pricing" className="hover:text-[#7b879e] mr-5">Pricing</a><a href="/customers" className="hover:text-[#7b879e] mr-5">Customer stories</a><a href="/about" className="hover:text-[#7b879e]">About</a>
        <p className="mt-3">&copy; {new Date().getFullYear()} CarryOn Technologies LLC</p>
      </footer>
    </div>
  );
};

export default ChangelogPage;
