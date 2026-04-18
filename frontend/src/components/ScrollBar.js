/**
 * ScrollBar — custom scroll indicator for mobile (iOS/Android).
 *
 * CSS scrollbars don't render on iOS Safari. This component renders a
 * thin gold thumb on the right edge of any scrollable container.
 *
 * Thumb is always 1/8 the track height — indicator style, not proportional.
 *
 * Usage:
 *   const ref = useRef();
 *   <div ref={ref} className="overflow-y-auto" style={{ position: 'relative' }}>
 *     {content}
 *     <ScrollBar scrollRef={ref} />
 *   </div>
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

const THUMB_FRACTION = 1 / 8; // thumb is always 1/8 of the track height

export default function ScrollBar({ scrollRef, color = 'rgba(212,175,55,0.5)' }) {
  const [visible, setVisible] = useState(false);
  const [thumbTop, setThumbTop] = useState(0);
  const [dragging, setDragging] = useState(false);
  const hideTimer = useRef(null);
  const dragStartY = useRef(0);
  const dragStartScrollTop = useRef(0);

  const updateThumb = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 2) { setVisible(false); return; }

    const thumbHeight = clientHeight * THUMB_FRACTION;
    const trackRange = clientHeight - thumbHeight;               // how far thumb can travel
    const scrollRange = scrollHeight - clientHeight;
    const top = (scrollTop / scrollRange) * trackRange;

    setThumbTop(top);
    setVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (!dragging) setVisible(false); }, 1800);
  }, [scrollRef, dragging]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateThumb, { passive: true });
    return () => { el.removeEventListener('scroll', updateThumb); clearTimeout(hideTimer.current); };
  }, [scrollRef, updateThumb]);

  // Drag to scroll
  const onPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    dragStartY.current = e.clientY;
    dragStartScrollTop.current = scrollRef.current?.scrollTop || 0;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  };

  const onPointerMove = useCallback((e) => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollHeight, clientHeight } = el;
    const thumbHeight = clientHeight * THUMB_FRACTION;
    const trackRange = clientHeight - thumbHeight;
    const scrollRange = scrollHeight - clientHeight;
    const dy = e.clientY - dragStartY.current;
    el.scrollTop = dragStartScrollTop.current + (dy / trackRange) * scrollRange;
  }, [scrollRef]);

  const onPointerUp = useCallback(() => {
    setDragging(false);
    window.removeEventListener('pointermove', onPointerMove);
    hideTimer.current = setTimeout(() => setVisible(false), 1200);
  }, [onPointerMove]);

  useEffect(() => {
    return () => { window.removeEventListener('pointermove', onPointerMove); };
  }, [onPointerMove]);

  const el = scrollRef.current;
  if (!el) return null;
  const thumbHeight = Math.max(20, (el.clientHeight || 200) * THUMB_FRACTION);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 2,
        width: dragging ? 8 : 3,
        height: '100%',
        pointerEvents: 'none',
        opacity: (visible || dragging) ? 1 : 0,
        transition: 'opacity 300ms ease, width 150ms ease',
        zIndex: 50,
      }}
      aria-hidden="true"
    >
      {/* Track — subtle background */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: 999, background: 'rgba(255,255,255,0.04)' }} />
      {/* Thumb */}
      <div
        onPointerDown={onPointerDown}
        style={{
          position: 'absolute',
          right: 0,
          top: thumbTop,
          width: '100%',
          height: thumbHeight,
          background: dragging ? 'rgba(212,175,55,0.9)' : color,
          borderRadius: 999,
          cursor: 'grab',
          pointerEvents: 'all',
          transition: dragging ? 'none' : 'background 150ms ease, opacity 300ms ease',
          touchAction: 'none',
        }}
        data-testid="scroll-thumb"
      />
    </div>
  );
}
