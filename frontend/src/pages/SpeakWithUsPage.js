import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { RevealSection } from '../components/landing/RevealSection';
import LandingContent from '../components/landing/LandingContent';
import { API_URL } from '../config';

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

const SpeakWithUsPage = () => {
  const navigate = useNavigate();
  const [footerInfo, setFooterInfo] = useState({ line1: '1550 Wilson Boulevard 7th Floor', line2: 'Arlington, VA 22209 U.S.A.', phone: '(703) 884-1527' });

  const [homepageVideoId, setHomepageVideoId] = useState('EhU-jojs1jk');
  const [verticalVideoId, setVerticalVideoId] = useState('');
  const isMobileView = useIsMobileViewport();

  useEffect(() => {
    apiClient.get(`${API_URL}/public/site-content`).then(r => {
      setFooterInfo({ line1: r.data.footer_address_line1, line2: r.data.footer_address_line2, phone: r.data.footer_phone });
      if (r.data?.homepage_video_id) setHomepageVideoId(r.data.homepage_video_id);
      if (r.data?.homepage_video_id_vertical) setVerticalVideoId(r.data.homepage_video_id_vertical);
    }).catch(() => {});
  }, []);

  const showVertical = isMobileView && verticalVideoId;
  const activeVideoId = showVertical ? verticalVideoId : homepageVideoId;

  const navigateWithFade = (path) => navigate(path);

  const scrollToCalendar = () => {
    const el = document.getElementById('speak-calendar');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* ═══════════════════ HERO ═══════════════════ */}
      <section id="speak-calendar" className="relative overflow-hidden" style={{ minHeight: '100vh' }}>
        {/* Dark gradient background — no flag */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #0a1628 0%, #0d1a30 40%, #111f34 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 20%, rgba(var(--gold-rgb), 0.04) 0%, transparent 60%)' }} />

        <div className="relative z-10 flex flex-col items-center px-6 pt-12 pb-8 lg:pt-20 lg:pb-10">

          {/* Desktop: side-by-side layout */}
          <div className="w-full max-w-[1400px] mx-auto flex flex-col lg:flex-row lg:items-start lg:gap-10 xl:gap-14">
            {/* Left: Logo + Headline + subheadline */}
            <div className="flex-1 mb-10 lg:mb-0">
              <RevealSection delay={0.1}>
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 lg:gap-8">
                  <div className="flex-shrink-0">
                    <img src="/carryon-logo.png" alt="CarryOn" className="w-[160px] lg:w-[200px] xl:w-[260px] h-auto" />
                  </div>
                  <div className="text-center sm:text-left flex-1 sm:pt-2">
                    <h1 className="text-3xl sm:text-4xl xl:text-5xl font-bold text-white leading-[1.08] mb-4" style={{ fontFamily: 'var(--sans)' }}>
                      Your family is protected and connected.
                      <span className="block text-[#d4af37] mt-1">Even when you can&apos;t be there.</span>
                    </h1>
                    <p className="text-[#8a95a9] text-sm xl:text-base max-w-lg leading-relaxed">
                      CarryOn keeps your documents, plans, and wishes organized, and ensures your family is ready for anything that comes its way, giving you the peace of mind to know that the people you love know exactly what to do, no matter what happens.
                    </p>
                  </div>
                </div>
              </RevealSection>
            </div>

            {/* Right: Calendar embed — full widget, no clipping */}
            <div className="w-full lg:max-w-[480px] flex-shrink-0">
              <RevealSection delay={0.3} direction="right">
                <iframe
                  src="https://api.leadconnectorhq.com/widget/booking/V67QUruJToWmHt4GaNyn"
                  style={{ width: '100%', minHeight: '750px', border: 'none' }}
                  scrolling="yes"
                  title="Schedule a Consultation"
                  data-testid="speak-with-us-calendar"
                />
              </RevealSection>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ LANDING CONTENT — video + Built for Real Families onward ═══════════════════ */}
      <LandingContent
        navigateWithFade={navigateWithFade}
        footerInfo={footerInfo}
        testIdSuffix="-speak"
        skipToRealFamilies
        ctaOverride={{ onClick: scrollToCalendar, label: 'Book a Demo' }}
        beforeAbout={
          <section className="relative z-10">
            <div className="py-16 lg:py-24 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)' }}>
              <div className="absolute inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(var(--gold-rgb), 0.04) 0%, transparent 70%)' }} />
              <RevealSection className="max-w-[900px] mx-auto px-6 text-center relative z-10">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 leading-tight" style={{ fontFamily: 'var(--sans)' }}>
                  See CarryOn in Action
                </h2>
                <p className="text-white/60 text-sm lg:text-base mb-8">
                  Learn how CarryOn&#8482; keeps your family ready for anything.
                </p>
                {showVertical ? (
                  <div className="relative rounded-2xl overflow-hidden mx-auto" style={{ border: '1px solid rgba(var(--gold-rgb), 0.15)', boxShadow: '0 8px 60px rgba(0,0,0,0.4)', maxWidth: '360px' }}>
                    <div style={{ position: 'relative', paddingBottom: '177.78%', height: 0 }}>
                      <iframe
                        src={`https://www.youtube.com/embed/${activeVideoId}?rel=0&modestbranding=1&color=white`}
                        title="CarryOn - Family Preparedness"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        data-testid="speak-video"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(var(--gold-rgb), 0.15)', boxShadow: '0 8px 60px rgba(0,0,0,0.4)' }}>
                    <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                      <iframe
                        src={`https://www.youtube.com/embed/${activeVideoId}?rel=0&modestbranding=1&color=white`}
                        title="CarryOn - Estate Planning Made Simple"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        data-testid="speak-video"
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

export default SpeakWithUsPage;
