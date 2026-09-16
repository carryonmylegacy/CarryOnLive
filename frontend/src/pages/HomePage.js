import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import axios from 'axios';
import { ChevronRight } from 'lucide-react';
import { API_URL } from '../config';
import { RevealSection } from '../components/landing/RevealSection';
import LandingContent from '../components/landing/LandingContent';
import { HERO } from '../components/landing/heroCopy';
import { MobileNav, MARKETING_LINKS } from '../components/landing/MobileNav';
import { HeroCtas } from '../components/landing/HeroCtas';
import { HeroShot } from '../components/landing/HeroShot';

const useIsMobileViewport = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
};

const HomePage = () => {
  const navigate = useNavigate();
  const [flagOpacity, setFlagOpacity] = useState(1);
  const [exiting, setExiting] = useState(false);
  const [footerInfo, setFooterInfo] = useState({ line1: '1550 Wilson Boulevard 7th Floor', line2: 'Arlington, VA 22209 U.S.A.', phone: '(703) 884-1527' });
  const [landscapeVideoId, setLandscapeVideoId] = useState('EhU-jojs1jk');
  const [verticalVideoId, setVerticalVideoId] = useState('');
  const [founderLinkedin, setFounderLinkedin] = useState('');

  const isMobileView = useIsMobileViewport();

  useEffect(() => {
    axios.get(`${API_URL}/public/site-content`).then(r => {
      setFooterInfo({ line1: r.data.footer_address_line1, line2: r.data.footer_address_line2, phone: r.data.footer_phone });
      if (r.data.homepage_video_id) setLandscapeVideoId(r.data.homepage_video_id);
      if (r.data.homepage_video_id_vertical) setVerticalVideoId(r.data.homepage_video_id_vertical);
      if (r.data.founder_linkedin_url) setFounderLinkedin(r.data.founder_linkedin_url);
    }).catch(() => {});
  }, []);

  const navigateWithFade = (path) => {
    setExiting(true);
    setTimeout(() => navigate(path), 500);
  };

  useEffect(() => {
    const handleScroll = () => {
      const fade = Math.max(0, 1 - window.scrollY / 600);
      setFlagOpacity(fade);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Decide which video to show
  const showVertical = isMobileView && verticalVideoId;
  const activeVideoId = showVertical ? verticalVideoId : landscapeVideoId;

  return (
    <div className="min-h-screen" style={{
      background: '#0E1829',
      opacity: exiting ? 0 : 1,
      ...(exiting ? { transform: 'scale(0.98)' } : {}),
      transition: 'opacity 0.45s ease, transform 0.45s ease',
    }}>
      <Helmet>
        <title>CarryOn - Get Your Family&apos;s Affairs in Order, In One Secure Place</title>
        <meta name="description" content="CarryOn is one secure place for your documents, passwords, who to call first, and what to do next — so your family can handle what comes next. AES-256 encrypted. Built by a 24-year veteran." />
        <link rel="canonical" href="https://carryon.us/" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="CarryOn - Get your family's affairs in order, in one secure place" />
        <meta property="og:description" content="So your family knows where everything lives, who to call first, and what to do next — if something happens to you." />
        <meta property="og:url" content="https://carryon.us" />
        <meta property="og:site_name" content="CarryOn" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="CarryOn - Get your family's affairs in order" />
        <meta name="twitter:description" content="One secure place for your documents, passwords, who to call first, and what to do next." />
      </Helmet>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([
        {
          "@context": "https://schema.org",
          "@type": "WebApplication",
          "name": "CarryOn",
          "alternateName": "CarryOn Family Preparedness Platform",
          "url": "https://carryon.us",
          "description": "CarryOn helps American families get their affairs in order in one secure place — documents, passwords, who to call first, and what to do next — so loved ones can handle what comes next.",
          "applicationCategory": "LifestyleApplication",
          "operatingSystem": "Web, iOS",
          "offers": {
            "@type": "AggregateOffer",
            "lowPrice": "3.99",
            "highPrice": "24.99",
            "priceCurrency": "USD",
            "offerCount": 7
          },
          "featureList": [
            "Encrypted document vault for wills, trusts, policies, and deeds (Secure Document Vault, AES-256)",
            "AI review that finds gaps and contradictions in your paperwork, tuned to your state (Estate Guardian AI)",
            "Messages for the moments you'll miss — written, voice, or video (Milestone Messages)",
            "Who to call first, with a ranked backup for every person",
            "Emergency plans for medical, disaster, and financial situations (Contingency Protocols)",
            "Private encrypted family messaging (Estate Communications Tool)",
            "Bill and debt tracking (Financial Portal)",
            "What-to-do-first checklist for your family (Immediate Action Checklist)",
            "Passwords and accounts, assigned to the right person (Digital Access Vault)",
            "Who to notify list (Family & Friends Notification)"
          ],
          "provider": {
            "@type": "Organization",
            "name": "CarryOn Technologies LLC",
            "url": "https://carryon.us"
          }
        },
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "CarryOn Technologies LLC",
          "url": "https://carryon.us",
          "logo": "https://carryon.us/carryon-icon.jpg",
          "description": "CarryOn helps American families get their affairs in order in one secure place — documents, passwords, who to call first, and what to do next.",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "1550 Wilson Boulevard, 7th Floor",
            "addressLocality": "Arlington",
            "addressRegion": "VA",
            "postalCode": "22209",
            "addressCountry": "US"
          },
          "contactPoint": {
            "@type": "ContactPoint",
            "telephone": "+1-703-889-0017",
            "email": "info@carryon.us",
            "contactType": "customer service"
          },
          "foundingDate": "2024",
          "founder": {
            "@type": "Person",
            "name": "Barnet Harris",
            "jobTitle": "Founder & CEO",
            "url": "https://carryon.us/about",
            ...(founderLinkedin ? { "sameAs": [founderLinkedin] } : {})
          },
          "areaServed": "US"
        }
      ]) }} />

      {/* NAV BAR */}
      <nav className="fixed top-0 w-full z-[100]" style={{ borderBottom: '1px solid rgba(14,165,233,0.06)', background: 'rgba(11,18,33,0.97)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <img src="/carryon-logo.png" alt="CarryOn" className="h-12 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} data-testid="home-logo" />
          <div className="hidden md:flex items-center gap-8">
            {MARKETING_LINKS.map(item => (
              <a key={item.label} href={item.href} className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors duration-300">{item.label}</a>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigateWithFade('/start')} className="hidden sm:inline-flex items-center gap-1 px-5 py-2 rounded-lg text-sm font-bold transition-all active:scale-95" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="home-nav-get-started">
              Start Now
            </button>
            <button onClick={() => navigateWithFade('/login')} className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1" data-testid="home-sign-in-nav">
              Sign In <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <MobileNav navigateWithFade={navigateWithFade} testIdSuffix="-home" />
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden" style={{ paddingTop: 'calc(7rem + env(safe-area-inset-top, 0px))' }}>
        <div className="absolute inset-0 z-0" style={{ opacity: flagOpacity * 0.85 }}>
          <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(1.3) contrast(1.05) saturate(1.1)' }} />
        </div>
        <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.0) 0%, rgba(11,18,33,0.05) 50%, rgba(14,24,41,0.25) 100%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 90% 80% at 20% 80%, rgba(255,255,255,0.12) 0%, transparent 60%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 60% at 10% 50%, rgba(255,255,255,0.08) 0%, transparent 50%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 70% at 85% 85%, rgba(255,255,255,0.14) 0%, transparent 55%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 70% 50% at 35% 50%, rgba(212,175,55,0.04) 0%, transparent 70%)' }} />

        <div className="max-w-[1100px] mx-auto px-6 w-full relative z-10 text-center">
          <RevealSection delay={0.1}>
            <img src="/carryon-logo.png" alt="CarryOn" className="w-[200px] lg:w-[260px] h-auto mx-auto mb-6" />
            <p className="text-[#d4af37] text-xs sm:text-sm font-bold uppercase tracking-[0.22em] mb-4" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }} data-testid="hero-eyebrow-home">{HERO.eyebrow}</p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08] mb-4" style={{ fontFamily: 'Outfit, sans-serif', textWrap: 'balance', textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }} data-testid="hero-h1-home">
              {HERO.h1a}
              <span className="block text-[#d4af37] mt-1" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}>{HERO.h1b}</span>
            </h1>
            <p className="text-white/80 text-base lg:text-lg max-w-lg mx-auto leading-relaxed mb-8" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
              {HERO.sub}
            </p>
            <HeroCtas navigateWithFade={navigateWithFade} testIdSuffix="-home" />
            <div className="flex items-center gap-5 justify-center flex-wrap mt-8">
              {HERO.badges.map(badge => (
                <div key={badge} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                  <span className="text-white/70 text-sm font-medium" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{badge}</span>
                </div>
              ))}
            </div>
          </RevealSection>
          <RevealSection delay={0.35} distance={50}>
            <HeroShot testIdSuffix="-home" />
          </RevealSection>
        </div>
      </section>

      <LandingContent
        navigateWithFade={navigateWithFade}
        footerInfo={footerInfo}
        testIdSuffix="-home"
        beforeAbout={
          <section className="relative z-10">
            <div className="py-16 lg:py-24 relative overflow-hidden">
              <div className="absolute inset-0 z-0">
                <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.7) contrast(1.05) saturate(0.9)' }} />
              </div>
              <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,1) 0%, rgba(14,24,41,0.97) 80px, rgba(11,18,33,0.6) 50%, rgba(11,18,33,0.8) 100%)' }} />
              <div className="absolute inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(212,175,55,0.04) 0%, transparent 70%)' }} />
              <RevealSection className="max-w-[900px] mx-auto px-6 text-center relative z-10">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  See CarryOn in Action
                </h2>
                <p className="text-white/60 text-sm lg:text-base mb-8">
                  Learn how CarryOn&#8482; keeps your family ready for anything.
                </p>
                {showVertical ? (
                  /* Vertical (portrait) video for mobile PWA */
                  <div className="relative rounded-2xl overflow-hidden mx-auto" style={{ border: '1px solid rgba(212,175,55,0.15)', boxShadow: '0 8px 60px rgba(0,0,0,0.4), 0 0 40px rgba(212,175,55,0.05)', maxWidth: '360px' }}>
                    <div style={{ position: 'relative', paddingBottom: '177.78%', height: 0 }}>
                      <iframe
                        src={`https://www.youtube.com/embed/${activeVideoId}?rel=0&modestbranding=1&color=white`}
                        title="CarryOn — Family Preparedness"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        data-testid="homepage-video-home"
                      />
                    </div>
                  </div>
                ) : (
                  /* Landscape (16:9) video for desktop */
                  <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(212,175,55,0.15)', boxShadow: '0 8px 60px rgba(0,0,0,0.4), 0 0 40px rgba(212,175,55,0.05)' }}>
                    <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                      <iframe
                        src={`https://www.youtube.com/embed/${activeVideoId}?rel=0&modestbranding=1&color=white`}
                        title="CarryOn — Estate Planning Made Simple"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        data-testid="homepage-video-home"
                      />
                    </div>
                  </div>
                )}
              </RevealSection>
            </div>
          </section>
        }
      />
    </div>
  );
};

export default HomePage;
