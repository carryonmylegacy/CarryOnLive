import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * SlidePanel — reusable slide-in-from-right overlay.
 *
 * Desktop (≥1025px):  fills the full main-content area (right of sidebar).
 * Mobile  (<1025px):  full-screen, respects header safe-area, slides UNDER
 *                      the floating bottom nav (z-index 45 < nav's 50).
 *                      Swipe right-to-left to dismiss.
 */
export default function SlidePanel({ open, onClose, title, subtitle, children }) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const touchRef = useRef({ startX: 0, startY: 0, dx: 0, swiping: false });

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const timer = setTimeout(() => setMounted(false), 280);
      return () => clearTimeout(timer);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setMounted(false);
      onClose();
    }, 280);
  }, [onClose]);

  // Esc key closes
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mounted, handleClose]);

  // ── Swipe-to-dismiss (mobile only) ──
  const onTouchStart = useCallback((e) => {
    if (window.innerWidth >= 1025) return;
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY, dx: 0, swiping: false };
  }, []);

  const onTouchMove = useCallback((e) => {
    if (window.innerWidth >= 1025) return;
    const ref = touchRef.current;
    const t = e.touches[0];
    const dx = t.clientX - ref.startX;
    const dy = Math.abs(t.clientY - ref.startY);

    // Only start swiping if horizontal movement dominates and is rightward
    if (!ref.swiping && dx > 10 && dx > dy) {
      ref.swiping = true;
    }
    if (!ref.swiping || dx <= 0) return;

    ref.dx = dx;
    if (panelRef.current) {
      panelRef.current.style.transform = `translateX(${dx}px)`;
      panelRef.current.style.transition = 'none';
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (window.innerWidth >= 1025) return;
    const ref = touchRef.current;
    const el = panelRef.current;
    if (!el) return;

    if (ref.swiping && ref.dx > 120) {
      // Swipe far enough → dismiss
      el.style.transition = 'transform 0.2s ease-out';
      el.style.transform = 'translateX(100%)';
      setTimeout(() => {
        el.style.transform = '';
        el.style.transition = '';
        setMounted(false);
        onClose();
      }, 200);
    } else {
      // Snap back
      el.style.transition = 'transform 0.2s ease-out';
      el.style.transform = 'translateX(0)';
      setTimeout(() => { el.style.transition = ''; }, 200);
    }
    touchRef.current = { startX: 0, startY: 0, dx: 0, swiping: false };
  }, [onClose]);

  if (!mounted) return null;

  const isCollapsed = localStorage.getItem('carryon_sidebar_collapsed') === 'true';

  return (
    <div
      className="slide-panel-root"
      data-testid="slide-panel"
      style={{ '--sb-offset': isCollapsed ? '72px' : 'var(--sidebar-width, 260px)' }}
    >
      {/* Backdrop */}
      <div
        className={`slide-panel-backdrop ${closing ? 'opacity-0' : 'opacity-100'}`}
        onClick={handleClose}
      />

      {/* Panel body */}
      <div
        ref={panelRef}
        className={`slide-panel-body ${closing ? 'slide-panel-exit' : 'slide-panel-enter'}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Header bar */}
        <div className="slide-panel-hdr">
          <button
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--t3)] hover:bg-[var(--s)] transition-colors flex-shrink-0"
            data-testid="slide-panel-back"
            aria-label="Close panel"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-[var(--t)] truncate" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {title}
            </h2>
            {subtitle && <p className="text-xs text-[var(--t5)] truncate">{subtitle}</p>}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="slide-panel-scroll">
          {children}
        </div>
      </div>
    </div>
  );
}
