/**
 * ScrollBar — stable, non-glitching custom scroll indicator.
 *
 * Key design decisions to prevent flashing:
 * - Both thumbTop AND thumbHeight stored in a single state update (no split renders)
 * - NO CSS transition on top/height — position snaps instantly during scroll
 * - Transition only on opacity and width (fade in/out, grab-to-grow)
 * - Thumb height is always 1/6 of track (indicator style, not proportional)
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

const THUMB_FRACTION = 1 / 6;

export default function ScrollBar({ scrollRef, color = 'rgba(212,175,55,0.55)' }) {
  const [state, setState] = useState({ top: 0, height: 40, visible: false });
  const [dragging, setDragging] = useState(false);
  const hideTimer = useRef(null);
  const dragStartY = useRef(0);
  const dragStartScrollTop = useRef(0);
  const rafRef = useRef(null);

  const compute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 2) {
      setState(s => s.visible ? { ...s, visible: false } : s);
      return;
    }
    const thumbHeight = Math.max(24, clientHeight * THUMB_FRACTION);
    const trackRange = clientHeight - thumbHeight;
    const scrollRange = scrollHeight - clientHeight;
    const top = scrollRange > 0 ? (scrollTop / scrollRange) * trackRange : 0;

    // Single atomic state update — prevents split renders that cause flashing
    setState({ top, height: thumbHeight, visible: true });

    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setState(s => ({ ...s, visible: false }));
    }, 1600);
  }, [scrollRef]);

  const onScroll = useCallback(() => {
    // Throttle to one RAF per scroll event to avoid excessive renders
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

  // Drag handlers
  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    dragStartY.current = e.clientY;
    dragStartScrollTop.current = scrollRef.current?.scrollTop || 0;

    const onMove = (ev) => {
      const el = scrollRef.current;
      if (!el) return;
      const { scrollHeight, clientHeight } = el;
      const thumbH = Math.max(24, clientHeight * THUMB_FRACTION);
      const trackRange = clientHeight - thumbH;
      const scrollRange = scrollHeight - clientHeight;
      if (trackRange <= 0) return;
      const dy = ev.clientY - dragStartY.current;
      el.scrollTop = dragStartScrollTop.current + (dy / trackRange) * scrollRange;
    };

    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      hideTimer.current = setTimeout(() => {
        setState(s => ({ ...s, visible: false }));
      }, 1200);
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
        position: 'absolute',
        top: 0,
        right: 2,
        bottom: 0,
        width: dragging ? 5 : 3,
        pointerEvents: 'none',
        // Only animate opacity and width — NEVER top or height during scroll
        opacity: show ? 1 : 0,
        transition: 'opacity 250ms ease, width 120ms ease',
        zIndex: 50,
      }}
    >
      {/* Thumb */}
      <div
        onPointerDown={onPointerDown}
        style={{
          position: 'absolute',
          right: 0,
          top,
          width: '100%',
          height,
          background: dragging ? 'rgba(212,175,55,0.9)' : color,
          borderRadius: 999,
          cursor: 'grab',
          pointerEvents: 'all',
          // NO transition on top/height — instant position during scroll prevents flashing
          transition: dragging ? 'none' : 'background 150ms ease',
          touchAction: 'none',
          willChange: 'transform',
        }}
        data-testid="scroll-thumb"
      />
    </div>
  );
}
