import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * SlidePanel — reusable slide-in-from-right overlay.
 *
 * Desktop (≥1025px):  fills the full main-content area (right of sidebar).
 * Mobile  (<1025px):  full-screen, respects header safe-area, slides UNDER
 *                      the floating bottom nav (z-index 45 < nav's 50).
 */
export default function SlidePanel({ open, onClose, title, subtitle, children }) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

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
      <div className={`slide-panel-body ${closing ? 'slide-panel-exit' : 'slide-panel-enter'}`}>
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
