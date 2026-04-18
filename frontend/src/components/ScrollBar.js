/**
 * ScrollBar — zero-React-state scroll indicator for contained scrollable divs.
 *
 * KEY GEOMETRY FIX: The thumb is position:absolute INSIDE the scrollable
 * container. When the container scrolls by N px, the thumb physically moves
 * N px in the opposite direction. The transform must compensate:
 *   translateY = scrollTop + (pct * trackRange)
 *                ^^^^^^^^^^
 *                cancels the container's scroll offset
 *
 * Without this, the thumb appears to scroll in the OPPOSITE direction.
 */
import { useRef, useEffect } from 'react';
import React from 'react';

const THUMB_H     = 64;    // px — fixed height
const THICKNESS   = 6;     // px — track width
const HIDE_DELAY  = 1500;  // ms
const MOUNT_DELAY = 360;   // ms — let entrance animations settle

export default function ScrollBar({ scrollRef }) {
  const wrapRef  = useRef(null);
  const thumbRef = useRef(null);
  const hideTimer = useRef(null);
  const raf = useRef(null);

  useEffect(() => {
    const show = () => { if (wrapRef.current)  wrapRef.current.style.opacity = '1'; };
    const hide = () => { if (wrapRef.current)  wrapRef.current.style.opacity = '0'; };

    // ── Scroll position update ────────────────────────────────────────────
    const update = () => {
      const el    = scrollRef.current;
      const thumb = thumbRef.current;
      if (!el || !thumb) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight + 4) { hide(); return; }

      const trackRange  = clientHeight - THUMB_H;
      const scrollRange = scrollHeight - clientHeight;
      const pct = scrollRange > 0 ? scrollTop / scrollRange : 0;

      // scrollTop offsets the element back into the visible area;
      // pct * trackRange places it at the correct position within the track.
      thumb.style.transform = `translateY(${scrollTop + pct * trackRange}px)`;

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

      // Suppress ALL text selection during drag (body + documentElement for iOS)
      const noSelect = () => {
        document.body.style.userSelect       = 'none';
        document.body.style.webkitUserSelect = 'none';
        document.documentElement.style.userSelect       = 'none';
        document.documentElement.style.webkitUserSelect = 'none';
      };
      const restoreSelect = () => {
        document.body.style.userSelect       = '';
        document.body.style.webkitUserSelect = '';
        document.documentElement.style.userSelect       = '';
        document.documentElement.style.webkitUserSelect = '';
      };

      noSelect();

      const startY      = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      const startScroll = el.scrollTop;

      const onMove = (ev) => {
        ev.preventDefault();  // requires { passive: false }
        const y = ev.clientY ?? ev.touches?.[0]?.clientY ?? 0;
        const dy = y - startY;
        const trackRange  = el.clientHeight - THUMB_H;
        const scrollRange = el.scrollHeight - el.clientHeight;
        if (trackRange <= 0) return;
        el.scrollTop = startScroll + (dy / trackRange) * scrollRange;
      };

      const onUp = () => {
        restoreSelect();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup',   onUp);
        window.removeEventListener('touchmove',   onMove);
        window.removeEventListener('touchend',    onUp);
      };

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup',   onUp,   { once: true });
      window.addEventListener('touchmove',   onMove, { passive: false });
      window.addEventListener('touchend',    onUp,   { once: true });
    };

    let attached = false;

    const t = setTimeout(() => {
      const el    = scrollRef.current;
      const thumb = thumbRef.current;
      if (!el || !thumb) return;
      el.addEventListener('scroll',        onScroll,    { passive: true });
      thumb.addEventListener('pointerdown', onThumbDown);
      thumb.addEventListener('touchstart',  onThumbDown, { passive: false });
      attached = true;
    }, MOUNT_DELAY);

    return () => {
      clearTimeout(t);
      clearTimeout(hideTimer.current);
      if (raf.current) cancelAnimationFrame(raf.current);
      if (attached) {
        const el    = scrollRef.current;
        const thumb = thumbRef.current;
        if (el)    el.removeEventListener('scroll',        onScroll);
        if (thumb) {
          thumb.removeEventListener('pointerdown', onThumbDown);
          thumb.removeEventListener('touchstart',  onThumbDown);
        }
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
