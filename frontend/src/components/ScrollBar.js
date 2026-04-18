/**
 * ScrollBar — zero-React-state scroll indicator for contained scrollable divs.
 *
 * Direct DOM mutation during scroll = zero React re-renders = zero glitch.
 * Drag wired via addEventListener on the thumb DOM node (not React synthetic events).
 */
import { useRef, useEffect } from 'react';
import React from 'react';

const THUMB_H    = 64;    // px — fixed height, doubled per user request
const THICKNESS  = 6;     // px — track/thumb width
const HIDE_DELAY = 1500;  // ms
const MOUNT_DELAY = 360;  // ms — let entrance animations settle

export default function ScrollBar({ scrollRef }) {
  const wrapRef  = useRef(null);
  const thumbRef = useRef(null);
  const hideTimer = useRef(null);
  const raf = useRef(null);

  useEffect(() => {
    const show = () => { if (wrapRef.current)  wrapRef.current.style.opacity = '1'; };
    const hide = () => { if (wrapRef.current)  wrapRef.current.style.opacity = '0'; };

    // ── Scroll position update ───────────────────────────────────────────
    const update = () => {
      const el = scrollRef.current;
      const thumb = thumbRef.current;
      if (!el || !thumb) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight + 4) { hide(); return; }
      const trackRange  = clientHeight - THUMB_H;
      const scrollRange = scrollHeight - clientHeight;
      const pct = scrollRange > 0 ? scrollTop / scrollRange : 0;
      thumb.style.transform = `translateY(${pct * trackRange}px)`;
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

      // Suppress text selection for the entire drag gesture
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';

      const startY      = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      const startScroll = el.scrollTop;

      const onMove = (ev) => {
        ev.preventDefault();
        const clientY = ev.clientY || (ev.touches && ev.touches[0].clientY) || 0;
        const dy = clientY - startY;
        const trackRange  = el.clientHeight - THUMB_H;
        const scrollRange = el.scrollHeight - el.clientHeight;
        if (trackRange <= 0) return;
        el.scrollTop = startScroll + (dy / trackRange) * scrollRange;
      };

      const onUp = () => {
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup',   onUp);
        window.removeEventListener('touchmove',   onMove);
        window.removeEventListener('touchend',    onUp);
      };

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup',   onUp,   { once: true });
    };

    let attached = false;

    const t = setTimeout(() => {
      const el   = scrollRef.current;
      const thumb = thumbRef.current;
      if (!el || !thumb) return;

      el.addEventListener('scroll',    onScroll,    { passive: true });
      thumb.addEventListener('pointerdown', onThumbDown);
      attached = true;
    }, MOUNT_DELAY);

    return () => {
      clearTimeout(t);
      clearTimeout(hideTimer.current);
      if (raf.current) cancelAnimationFrame(raf.current);
      if (attached) {
        const el    = scrollRef.current;
        const thumb = thumbRef.current;
        if (el)    el.removeEventListener('scroll', onScroll);
        if (thumb) thumb.removeEventListener('pointerdown', onThumbDown);
      }
    };
  }, [scrollRef]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{
        position: 'absolute', top: 0, right: 2, bottom: 0,
        width: THICKNESS, zIndex: 50, pointerEvents: 'none',
        opacity: 0, transition: 'opacity 300ms ease',
      }}
    >
      <div
        ref={thumbRef}
        style={{
          position: 'absolute', top: 0, right: 0,
          width: '100%', height: THUMB_H,
          background: 'rgba(212,175,55,0.7)',
          borderRadius: 999,
          willChange: 'transform',
          cursor: 'grab',
          pointerEvents: 'all',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        data-testid="scroll-thumb"
      />
    </div>
  );
}
