/**
 * ScrollBar — zero-React-state scroll indicator for contained divs.
 *
 * Uses direct DOM mutation (thumb.style.transform) during scroll.
 * Zero React re-renders during scroll = zero glitch, zero flash.
 * Only React render: initial mount.
 */
import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import React from 'react';

const THUMB_H = 32;
const HIDE_DELAY = 1500;
const MOUNT_DELAY = 350; // let entrance animations settle

export default function ScrollBar({ scrollRef }) {
  const wrapRef  = useRef(null);
  const thumbRef = useRef(null);
  const hideTimer = useRef(null);
  const raf = useRef(null);

  useEffect(() => {
    let attached = false;

    const show = () => {
      if (wrapRef.current) wrapRef.current.style.opacity = '1';
    };
    const hide = () => {
      if (wrapRef.current) wrapRef.current.style.opacity = '0';
    };

    const update = () => {
      const el = scrollRef.current;
      const thumb = thumbRef.current;
      if (!el || !thumb) return;

      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight + 4) { hide(); return; }

      const trackRange = clientHeight - THUMB_H;
      const scrollRange = scrollHeight - clientHeight;
      const pct = scrollRange > 0 ? scrollTop / scrollRange : 0;

      // Direct DOM — no React re-render
      thumb.style.transform = `translateY(${pct * trackRange}px)`;

      show();
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(hide, HIDE_DELAY);
    };

    const onScroll = () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(update);
    };

    const t = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.addEventListener('scroll', onScroll, { passive: true });
      attached = true;
    }, MOUNT_DELAY);

    return () => {
      clearTimeout(t);
      clearTimeout(hideTimer.current);
      if (raf.current) cancelAnimationFrame(raf.current);
      if (attached) {
        const el = scrollRef.current;
        if (el) el.removeEventListener('scroll', onScroll);
      }
    };
  }, [scrollRef]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{
        position: 'absolute', top: 0, right: 2, bottom: 0,
        width: 3, zIndex: 50, pointerEvents: 'none',
        opacity: 0, transition: 'opacity 300ms ease',
      }}
    >
      <div
        ref={thumbRef}
        style={{
          position: 'absolute', top: 0, right: 0,
          width: '100%', height: THUMB_H,
          background: 'rgba(212,175,55,0.65)',
          borderRadius: 999,
          willChange: 'transform',
        }}
        data-testid="scroll-thumb"
      />
    </div>
  );
}
