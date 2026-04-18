/**
 * ScrollBar — stable scroll indicator for contained scrollable divs.
 *
 * FIXED THUMB HEIGHT: The thumb is always 36px tall. This is the key
 * anti-glitch decision — dynamic height (clientHeight * fraction) causes
 * flashing when flex layout recalculates clientHeight by even 1px.
 *
 * MOUNT DELAY: 360ms so entrance animations complete before first measurement.
 *
 * Usage:
 *   const ref = useRef();
 *   <div ref={ref} className="overflow-y-auto" style={{ position: 'relative' }}>
 *     {content}
 *     <ScrollBar scrollRef={ref} />
 *   </div>
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

const THUMB_H = 36;          // fixed px — never changes, never causes flash
const MOUNT_DELAY = 360;     // ms — wait for entrance animations to settle

export default function ScrollBar({ scrollRef, color = 'rgba(212,175,55,0.6)' }) {
  const [thumbTop, setThumbTop] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);
  const hideTimer = useRef(null);
  const raf = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), MOUNT_DELAY);
    return () => clearTimeout(t);
  }, []);

  const compute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 4) { setVisible(false); return; }

    const trackRange = clientHeight - THUMB_H;    // how far thumb can travel
    const scrollRange = scrollHeight - clientHeight;
    const top = scrollRange > 0 ? (scrollTop / scrollRange) * trackRange : 0;

    setThumbTop(top);
    setVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 1600);
  }, [scrollRef]);

  const onScroll = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(compute);
  }, [compute]);

  useEffect(() => {
    if (!ready) return;
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(hideTimer.current);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [scrollRef, onScroll, ready]);

  // Drag to scroll
  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    const startY = e.clientY;
    const startTop = scrollRef.current?.scrollTop || 0;

    const onMove = (ev) => {
      const el = scrollRef.current;
      if (!el) return;
      const trackRange = el.clientHeight - THUMB_H;
      const scrollRange = el.scrollHeight - el.clientHeight;
      if (trackRange <= 0) return;
      el.scrollTop = startTop + ((ev.clientY - startY) / trackRange) * scrollRange;
    };

    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }, [scrollRef]);

  const show = visible || dragging;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0, right: 2, bottom: 0,
        width: dragging ? 5 : 3,
        pointerEvents: 'none',
        opacity: show ? 1 : 0,
        // Opacity fade only — NEVER animate width during scroll (causes jitter)
        transition: `opacity 250ms ease${dragging ? ', width 100ms ease' : ''}`,
        zIndex: 50,
      }}
    >
      <div
        onPointerDown={onPointerDown}
        style={{
          position: 'absolute',
          right: 0,
          top: thumbTop,
          width: '100%',
          height: THUMB_H,             // fixed — never changes
          background: dragging ? 'rgba(212,175,55,0.95)' : color,
          borderRadius: 999,
          cursor: 'grab',
          pointerEvents: 'all',
          // ZERO transitions on position — position must snap with scroll
          transition: 'background 150ms ease',
          touchAction: 'none',
        }}
        data-testid="scroll-thumb"
      />
    </div>
  );
}
