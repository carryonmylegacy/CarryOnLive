/**
 * PageScrollBar — fixed-position scroll indicator for full-page scroll containers.
 *
 * Direct DOM mutation + addEventListener drag = zero React re-renders = zero glitch.
 * position:fixed so it stays visible regardless of scroll position.
 */
import React, { useRef, useEffect } from 'react';

const THUMB_H   = 64;   // px — doubled per user request
const THICKNESS = 6;    // px — doubled per user request
const TOP_OFF   = 72;   // px — below mobile header
const BOT_OFF   = 92;   // px — above dock
const HIDE_DELAY = 1800;

export default function PageScrollBar({ scrollRef }) {
  const wrapRef  = useRef(null);
  const thumbRef = useRef(null);
  const hideTimer = useRef(null);
  const raf = useRef(null);

  useEffect(() => {
    const show = () => { if (wrapRef.current)  wrapRef.current.style.opacity = '1'; };
    const hide = () => { if (wrapRef.current)  wrapRef.current.style.opacity = '0'; };

    // ── Scroll position update ───────────────────────────────────────────
    const update = () => {
      const el   = scrollRef.current;
      const thumb = thumbRef.current;
      if (!el || !thumb) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight + 4) { hide(); return; }

      const trackH    = window.innerHeight - TOP_OFF - BOT_OFF;
      const trackRange  = trackH - THUMB_H;
      const scrollRange = scrollHeight - clientHeight;
      const pct = scrollRange > 0 ? scrollTop / scrollRange : 0;
      const top = TOP_OFF + pct * trackRange;

      thumb.style.top = `${top}px`;  // direct DOM — no React
      show();
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(hide, HIDE_DELAY);
    };

    const onScroll = () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(update);
    };

    // ── Drag to scroll ────────────────────────────────────────────────────
    const onThumbDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = scrollRef.current;
      if (!el) return;

      // Suppress ALL text selection during drag
      document.body.style.userSelect       = 'none';
      document.body.style.webkitUserSelect = 'none';
      document.documentElement.style.userSelect       = 'none';
      document.documentElement.style.webkitUserSelect = 'none';

      const startY      = e.clientY;
      const startScroll = el.scrollTop;

      const onMove = (ev) => {
        ev.preventDefault();
        const trackH    = window.innerHeight - TOP_OFF - BOT_OFF;
        const trackRange  = trackH - THUMB_H;
        const scrollRange = el.scrollHeight - el.clientHeight;
        if (trackRange <= 0) return;
        el.scrollTop = startScroll + ((ev.clientY - startY) / trackRange) * scrollRange;
      };

      const onUp = () => {
        document.body.style.userSelect       = '';
        document.body.style.webkitUserSelect = '';
        document.documentElement.style.userSelect       = '';
        document.documentElement.style.webkitUserSelect = '';
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup',   onUp);
      };

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup',   onUp,   { once: true });
    };

    const el   = scrollRef.current;
    const thumb = thumbRef.current;
    if (!el || !thumb) return;

    el.addEventListener('scroll',        onScroll,    { passive: true });
    thumb.addEventListener('pointerdown', onThumbDown);
    thumb.addEventListener('touchstart',  onThumbDown, { passive: false });

    return () => {
      el.removeEventListener('scroll', onScroll);
      thumb.removeEventListener('pointerdown', onThumbDown);
      thumb.removeEventListener('touchstart',  onThumbDown);
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
        width: THICKNESS, zIndex: 40, pointerEvents: 'none',
        opacity: 0, transition: 'opacity 300ms ease',
      }}
    >
      {/* Subtle track */}
      <div style={{
        position: 'absolute',
        top: TOP_OFF, bottom: BOT_OFF, right: 0, width: '100%',
        background: 'rgba(255,255,255,0.05)', borderRadius: 999,
      }} />
      {/* Thumb — position controlled via direct DOM */}
      <div
        ref={thumbRef}
        style={{
          position: 'absolute', right: 0,
          top: TOP_OFF,
          width: '100%', height: THUMB_H,
          background: 'rgba(212,175,55,0.65)',
          borderRadius: 999,
          willChange: 'top',
          cursor: 'grab',
          pointerEvents: 'all',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        data-testid="page-scroll-thumb"
      />
    </div>
  );
}
