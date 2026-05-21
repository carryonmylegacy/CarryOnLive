import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import apiClient from '../utils/apiClient';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { API_URL } from '../config';
import { RevealSection } from '../components/landing/RevealSection';
import LandingContent from '../components/landing/LandingContent';
import { isIOS, isAndroid } from '../utils/pwaDetect';

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

  const isMobileView = useIsMobileViewport();

  useEffect(() => {
    apiClient.get(`${API_URL}/public/site-content`).then(r => {
      setFooterInfo({ line1: r.data.footer_address_line1, line2: r.data.footer_address_line2, phone: r.data.footer_phone });
      if (r.data.homepage_video_id) setLandscapeVideoId(r.data.homepage_video_id);
      if (r.data.homepage_video_id_vertical) setVerticalVideoId(r.data.homepage_video_id_vertical);
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

      {/* NAV BAR */}
      <nav className="fixed top-0 w-full z-[100]" style={{ borderBottom: '1px solid rgba(14,165,233,0.06)', background: 'rgba(11,18,33,0.97)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <img src="/carryon-logo.png" alt="CarryOn" className="h-12 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} data-testid="home-logo" />
          <div className="hidden md:flex items-center gap-8">
            {[
              { label: 'Features', href: '#features' },
              { label: 'Security', href: '#security' },
              { label: 'How It Works', href: '#steps' },
            ].map(item => (
              <a key={item.label} href={item.href} className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors duration-300">{item.label}</a>
            ))}
          </div>
          <button onClick={() => navigateWithFade('/login')} className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1" data-testid="home-sign-in-nav">
            Sign In <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="min-h-screen flex items-center relative overflow-hidden" style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top, 0px))' }}>
        <div className="absolute inset-0 z-0" style={{ opacity: flagOpacity * 0.85 }}>
          <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(1.3) contrast(1.05) saturate(1.1)' }} />
        </div>
        <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.0) 0%, rgba(11,18,33,0.05) 50%, rgba(14,24,41,0.25) 100%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 90% 80% at 20% 80%, rgba(255,255,255,0.12) 0%, transparent 60%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 60% at 10% 50%, rgba(255,255,255,0.08) 0%, transparent 50%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 70% at 85% 85%, rgba(255,255,255,0.14) 0%, transparent 55%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 70% 50% at 35% 50%, rgba(var(--gold-rgb), 0.04) 0%, transparent 70%)' }} />

        <div className="max-w-[900px] mx-auto px-6 w-full relative z-10 text-center">
          <RevealSection delay={0.1}>
            <img src="/carryon-logo.png" alt="CarryOn" className="w-[200px] lg:w-[260px] h-auto mx-auto mb-6" />
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-white leading-[1.08] mb-4 tracking-tight" style={{ fontFamily: 'var(--serif)', textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}>
              Every American Family.
              <span className="block text-[#d4af37] mt-1 italic" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}>Ready.</span>
            </h1>
            <p className="text-white/80 text-base lg:text-lg max-w-lg mx-auto leading-relaxed mb-8" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
              The digital family preparedness platform that brings together every aspect of your life &mdash; so you and your loved ones can CarryOn through anything.
            </p>
            <div className="flex items-center gap-4 justify-center flex-wrap mb-8">
              <button onClick={() => navigateWithFade('/signup')} className="gold-keep-dark inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base transition-transform duration-150 active:scale-95" data-testid="home-get-started-hero"
                style={{ background: '#d4af37', color: '#0B1221' }}>
                Get Started <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => navigateWithFade('/login')} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm transition-all active:scale-95" data-testid="home-sign-in-hero"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)' }}>
                Sign In
              </button>
            </div>
            <div className="flex items-center gap-5 justify-center mb-6">
              {['AES-256 Encrypted', 'Per-Estate Keys', '2FA Protected'].map(badge => (
                <div key={badge} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                  <span className="text-white/70 text-sm font-medium" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{badge}</span>
                </div>
              ))}
            </div>
          </RevealSection>
          <RevealSection delay={0.4}>
            <a href="#about" className="inline-flex flex-col items-center justify-center gap-1 mt-10 cursor-pointer text-center group"
              data-testid="scroll-explore-home"
              style={{ opacity: 0.85, transition: 'opacity 200ms cubic-bezier(0.4,0,0.2,1)' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.85'}>
              <span className="text-white/85 text-sm font-semibold tracking-[0.1em] uppercase" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>Discover More</span>
              <ChevronDown className="w-5 h-5 text-[#d4af37]" strokeWidth={2.5} style={{ animation: 'fadeInUp 1.4s ease-in-out infinite alternate' }} />
            </a>
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
              <div className="absolute inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(var(--gold-rgb), 0.04) 0%, transparent 70%)' }} />
              <RevealSection className="max-w-[900px] mx-auto px-6 text-center relative z-10">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 leading-tight" style={{ fontFamily: 'var(--sans)' }}>
                  See CarryOn in Action
                </h2>
                <p className="text-white/60 text-sm lg:text-base mb-8">
                  Learn how CarryOn&#8482; keeps your family ready for anything.
                </p>
                {showVertical ? (
                  /* Vertical (portrait) video for mobile PWA */
                  <div className="relative rounded-2xl overflow-hidden mx-auto" style={{ border: '1px solid rgba(var(--gold-rgb), 0.15)', boxShadow: '0 8px 60px rgba(0,0,0,0.4), 0 0 40px rgba(var(--gold-rgb), 0.05)', maxWidth: '360px' }}>
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
                  <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(var(--gold-rgb), 0.15)', boxShadow: '0 8px 60px rgba(0,0,0,0.4), 0 0 40px rgba(var(--gold-rgb), 0.05)' }}>
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
