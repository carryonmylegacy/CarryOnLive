/**
 * PageScrollBar — fixed-position scroll indicator for full-page scroll containers.
 *
 * Uses direct DOM mutation. Zero React re-renders during scroll.
 * Renders as position:fixed so it stays visible regardless of scroll position.
 */
import React, { useRef, useEffect } from 'react';

const THUMB_H  = 32;
const TOP_OFF  = 70;   // below mobile header
const BOT_OFF  = 90;   // above dock
const HIDE_DELAY = 1800;

export default function PageScrollBar({ scrollRef }) {
  const wrapRef  = useRef(null);
  const thumbRef = useRef(null);
  const hideTimer = useRef(null);
  const raf = useRef(null);

  useEffect(() => {
    const show = () => { if (wrapRef.current)  wrapRef.current.style.opacity  = '1'; };
    const hide = () => { if (wrapRef.current)  wrapRef.current.style.opacity  = '0'; };

    const update = () => {
      const el = scrollRef.current;
      const thumb = thumbRef.current;
      if (!el || !thumb) return;

      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight + 4) { hide(); return; }

      const trackH = window.innerHeight - TOP_OFF - BOT_OFF;
      const trackRange = trackH - THUMB_H;
      const scrollRange = scrollHeight - clientHeight;
      const pct = scrollRange > 0 ? scrollTop / scrollRange : 0;
      const top = TOP_OFF + pct * trackRange;

      // Direct DOM mutation — zero React re-render
      thumb.style.top = `${top}px`;

      show();
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(hide, HIDE_DELAY);
    };

    const onScroll = () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(update);
    };

    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(hideTimer.current);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [scrollRef]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{
        position: 'fixed', right: 3, top: 0, bottom: 0,
        width: 3, zIndex: 200, pointerEvents: 'none',
        opacity: 0, transition: 'opacity 300ms ease',
      }}
    >
      {/* Track */}
      <div style={{
        position: 'absolute',
        top: TOP_OFF, bottom: BOT_OFF, right: 0, width: '100%',
        background: 'rgba(255,255,255,0.04)', borderRadius: 999,
      }} />
      {/* Thumb — position controlled via direct DOM (thumb.style.top) */}
      <div
        ref={thumbRef}
        style={{
          position: 'absolute', right: 0,
          top: TOP_OFF,  // initial position — overwritten by direct DOM
          width: '100%', height: THUMB_H,
          background: 'rgba(212,175,55,0.6)',
          borderRadius: 999,
          willChange: 'top',
        }}
        data-testid="page-scroll-thumb"
      />
    </div>
  );
}
