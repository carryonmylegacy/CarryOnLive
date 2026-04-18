/**
 * PageScrollBar — fixed-position scroll indicator for page-level scrollable containers.
 *
 * Use this when the scrollable element is the FULL PAGE container (e.g. DashboardLayout's
 * <main> element). Unlike ScrollBar (which uses position:absolute inside the scroll
 * container and scrolls away with content), PageScrollBar is position:fixed so it
 * always stays on the right edge of the screen regardless of scroll position.
 *
 * Usage:
 *   const mainRef = useRef();
 *   <main ref={mainRef} style={{ overflowY: 'auto' }}>
 *     <PageScrollBar scrollRef={mainRef} />
 *   </main>
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

const THUMB_FRACTION = 1 / 12; // half the previous 1/6
const THUMB_H = 36;             // fixed px — never changes, never causes flash
const TOP_OFFSET  = 70;  // below mobile header (~56px + some margin)
const BOT_OFFSET  = 90;  // above dock (~83px + some margin)

export default function PageScrollBar({ scrollRef }) {
  const [state, setState] = useState({ top: TOP_OFFSET, height: 40, visible: false });
  const [dragging, setDragging] = useState(false);
  const hideTimer = useRef(null);
  const rafRef = useRef(null);

  const compute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 4) {
      setState(s => s.visible ? { ...s, visible: false } : s);
      return;
    }

    const trackHeight = window.innerHeight - TOP_OFFSET - BOT_OFFSET;
    const thumbHeight = THUMB_H;
    const trackRange = trackHeight - thumbHeight;
    const scrollRange = scrollHeight - clientHeight;
    const pct = scrollRange > 0 ? scrollTop / scrollRange : 0;
    const top = TOP_OFFSET + pct * trackRange;

    setState({ top, height: THUMB_H, visible: true });
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setState(s => ({ ...s, visible: false })), 1800);
  }, [scrollRef]);

  const onScroll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(compute);
  }, [compute]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(hideTimer.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scrollRef, onScroll]);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
    const startY = e.clientY;
    const startScrollTop = scrollRef.current?.scrollTop || 0;

    const onMove = (ev) => {
      const el = scrollRef.current;
      if (!el) return;
      const { scrollHeight, clientHeight } = el;
      const trackH = window.innerHeight - TOP_OFFSET - BOT_OFFSET;
      const thumbH = THUMB_H;
      const trackRange = trackH - thumbH;
      const scrollRange = scrollHeight - clientHeight;
      if (trackRange <= 0) return;
      el.scrollTop = startScrollTop + ((ev.clientY - startY) / trackRange) * scrollRange;
    };

    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      hideTimer.current = setTimeout(() => setState(s => ({ ...s, visible: false })), 1200);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }, [scrollRef]);

  const { top, height, visible } = state;
  const show = visible || dragging;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        right: 3,
        top: 0,
        bottom: 0,
        width: dragging ? 5 : 3,
        pointerEvents: 'none',
        opacity: show ? 1 : 0,
        transition: 'opacity 250ms ease, width 120ms ease',
        zIndex: 200,
      }}
    >
      {/* Track */}
      <div style={{
        position: 'absolute',
        top: TOP_OFFSET, bottom: BOT_OFFSET,
        right: 0, width: '100%',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 999,
      }} />
      {/* Thumb */}
      <div
        onPointerDown={onPointerDown}
        style={{
          position: 'absolute',
          right: 0,
          top,
          width: '100%',
          height,
          background: dragging ? 'rgba(212,175,55,0.9)' : 'rgba(212,175,55,0.55)',
          borderRadius: 999,
          cursor: 'grab',
          pointerEvents: 'all',
          transition: 'background 150ms ease',  // NO transition on top/height
          touchAction: 'none',
        }}
        data-testid="page-scroll-thumb"
      />
    </div>
  );
}
