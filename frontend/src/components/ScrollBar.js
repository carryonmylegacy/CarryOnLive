/**
 * ScrollBar — contained scroll indicator for panels, sheets, and modals.
 *
 * This is a copy of PageScrollBar.js with two differences:
 *   1. position:absolute (not fixed) — relative to the sibling wrapper
 *   2. trackH = el.clientHeight (not window.innerHeight − offsets)
 *
 * DOM structure required by the consumer:
 *   <div style="position:relative; overflow:hidden">   ← wrapper
 *     <div ref={scrollRef} style="overflow-y:auto; height:100%">
 *       {content}
 *     </div>
 *     <ScrollBar scrollRef={scrollRef} />   ← sibling, NOT inside scrollable
 *   </div>
 *
 * Everything else — event handling, drag, text-selection suppression,
 * direct DOM mutation — is identical to PageScrollBar.
 */
import React, { useRef, useEffect } from 'react';

const THUMB_H    = 64;    // px
const THICKNESS  = 6;     // px
const HIDE_DELAY = 1500;  // ms
const MOUNT_DELAY = 360;  // ms — let entrance animations settle

export default function ScrollBar({ scrollRef }) {
  const wrapRef  = useRef(null);
  const thumbRef = useRef(null);
  const hideTimer = useRef(null);
  const raf = useRef(null);

  useEffect(() => {
    const show = () => { if (wrapRef.current) wrapRef.current.style.opacity = '1'; };
    const hide = () => { if (wrapRef.current) wrapRef.current.style.opacity = '0'; };

    // ── Scroll position update ────────────────────────────────────────────
    const update = () => {
      const el    = scrollRef.current;
      const thumb = thumbRef.current;
      if (!el || !thumb) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight + 4) { hide(); return; }

      const trackH    = clientHeight;          // visible height of the scroll area
      const trackRange  = trackH - THUMB_H;
      const scrollRange = scrollHeight - clientHeight;
      const pct = scrollRange > 0 ? scrollTop / scrollRange : 0;
      const top = pct * trackRange;            // no TOP_OFF — wrapper starts at 0

      thumb.style.top = `${top}px`;            // direct DOM, same as PageScrollBar
      show();
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(hide, HIDE_DELAY);
    };

    const onScroll = () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(update);
    };

    // ── Drag — identical to PageScrollBar ────────────────────────────────
    const onThumbDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = scrollRef.current;
      if (!el) return;

      document.body.style.userSelect               = 'none';
      document.body.style.webkitUserSelect         = 'none';
      document.documentElement.style.userSelect    = 'none';
      document.documentElement.style.webkitUserSelect = 'none';

      const startY      = e.clientY;
      const startScroll = el.scrollTop;

      const onMove = (ev) => {
        ev.preventDefault();
        const trackRange  = el.clientHeight - THUMB_H;
        const scrollRange = el.scrollHeight - el.clientHeight;
        if (trackRange <= 0) return;
        el.scrollTop = startScroll + ((ev.clientY - startY) / trackRange) * scrollRange;
      };

      const onUp = () => {
        document.body.style.userSelect               = '';
        document.body.style.webkitUserSelect         = '';
        document.documentElement.style.userSelect    = '';
        document.documentElement.style.webkitUserSelect = '';
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup',   onUp);
      };

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup',   onUp,   { once: true });
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
          position: 'absolute', right: 0,
          top: 0,                    // initial position, overwritten by direct DOM
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
        data-testid="scroll-thumb"
      />
    </div>
  );
}
