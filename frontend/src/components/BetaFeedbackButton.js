import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { X, Send, Paperclip, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from '../utils/toast';
import { API_URL } from '../config';

/* ---- Page name map ---- */
const PAGE_NAMES = {
  '/dashboard': 'Dashboard',
  '/vault': 'Vault',
  '/messages': 'Messages',
  '/beneficiaries': 'Beneficiaries',
  '/guardian': 'Estate Guardian AI',
  '/checklist': 'Immediate Action Checklist',
  '/trustee': 'Designated Trusted Steward',
  '/digital-wallet': 'Digital Wallet',
  '/timeline': 'Legacy Timeline',
  '/settings': 'Settings',
  '/security-settings': 'Security Settings',
  '/subscription': 'Subscription',
  '/admin': 'Founder Dashboard',
  '/ops': 'Operations Dashboard',
  '/support': 'Support Chat',
  '/transition': 'Transition',
  '/onboarding': 'Onboarding',
  '/beneficiary-hub': 'Beneficiary Hub',
};

function getPageName(pathname) {
  // Check exact match first
  if (PAGE_NAMES[pathname]) return PAGE_NAMES[pathname];
  // Check prefix match
  for (const [prefix, name] of Object.entries(PAGE_NAMES)) {
    if (pathname.startsWith(prefix)) return name;
  }
  return pathname;
}

/* ---- Bug icon SVG ---- */
const BugIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 2L6.5 3.5M16 2L17.5 3.5" stroke="#1e3a5f" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M3 11H5M19 11H21M3 15H5M19 15H21" stroke="#1e3a5f" strokeWidth="1.5" strokeLinecap="round"/>
    <ellipse cx="12" cy="14" rx="5" ry="6" fill="#1e3a5f"/>
    <circle cx="12" cy="8" r="3" fill="#1e3a5f"/>
    <path d="M12 11V20" stroke="#fbbf24" strokeWidth="1" strokeLinecap="round"/>
    <path d="M9 14H15" stroke="#fbbf24" strokeWidth="1" strokeLinecap="round"/>
  </svg>
);

export default function BetaFeedbackButton() {
  const { token } = useAuth();
  const location = useLocation();
  const [panelOpen, setPanelOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  /* ---- Drag logic ---- */
  const [pos, setPos] = useState(() => {
    const saved = localStorage.getItem('beta_bug_pos');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        // Reset if saved position is behind Dynamic Island (too high)
        if (p.y < 60) return { x: window.innerWidth - 70, y: window.innerHeight - 140 };
        return p;
      } catch {}
    }
    return { x: window.innerWidth - 70, y: window.innerHeight - 140 };
  });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const wasDragged = useRef(false);
  const btnRef = useRef(null);

  const clamp = useCallback((x, y) => {
    const sz = 48;
    // Respect iOS safe area (Dynamic Island / notch) — minimum 60px from top
    const safeTop = Math.max(60, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0', 10) + 8);
    return {
      x: Math.max(4, Math.min(x, window.innerWidth - sz - 4)),
      y: Math.max(safeTop, Math.min(y, window.innerHeight - sz - 4)),
    };
  }, []);

  const onPointerDown = useCallback((e) => {
    dragging.current = true;
    wasDragged.current = false;
    const rect = btnRef.current.getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.target.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return;
    wasDragged.current = true;
    const newPos = clamp(e.clientX - offset.current.x, e.clientY - offset.current.y);
    setPos(newPos);
  }, [clamp]);

  const onPointerUp = useCallback(() => {
    if (dragging.current) {
      dragging.current = false;
      setPos(p => {
        localStorage.setItem('beta_bug_pos', JSON.stringify(p));
        return p;
      });
    }
  }, []);

  const handleClick = useCallback(() => {
    if (!wasDragged.current) {
      setPanelOpen(prev => !prev);
    }
  }, []);

  // Recalculate position on window resize
  useEffect(() => {
    const onResize = () => setPos(p => clamp(p.x, p.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be under 10MB');
        return;
      }
      setAttachment(file);
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error('Please describe the issue');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('page', getPageName(location.pathname));
      formData.append('description', description.trim());
      if (attachment) {
        formData.append('attachment', attachment);
      }
      await axios.post(`${API_URL}/beta/feedback`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      toast.success('Feedback submitted — thank you!');
      setDescription('');
      setAttachment(null);
      setPanelOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const currentPage = getPageName(location.pathname);

  return (
    <>
      {/* Floating draggable button */}
      <button
        ref={btnRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={handleClick}
        className="fixed z-[90] flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        style={{
          left: pos.x,
          top: pos.y,
          width: 48,
          height: 48,
          borderRadius: 12,
          background: '#fbbf24',
          border: '2px solid #f59e0b',
          cursor: 'grab',
          touchAction: 'none',
        }}
        data-testid="beta-feedback-fab"
        title="Submit Beta Feedback"
      >
        <BugIcon />
      </button>

      {/* Slide-in panel */}
      {panelOpen && (
        <div className="fixed inset-0 z-[95]" data-testid="beta-feedback-panel">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setPanelOpen(false)} />

          {/* Panel */}
          <div
            className="absolute right-0 top-0 bottom-0 w-full sm:w-[400px] flex flex-col shadow-2xl animate-slide-in-right"
            style={{
              background: 'var(--bg2, #1a1f36)',
              borderLeft: '1px solid var(--b, #2a2f4a)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--b, #2a2f4a)', paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
              <div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--t, #fff)', fontFamily: 'var(--sans)' }}>Beta Feedback</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--t5, #6b7280)' }}>Report a bug or suggestion</p>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--s)]"
                style={{ color: 'var(--t4, #9ca3af)' }}
                data-testid="beta-feedback-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Current page */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t5, #6b7280)' }}>
                  Current Screen
                </label>
                <div
                  className="mt-1 px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--s, #242a45)', color: 'var(--t, #fff)', border: '1px solid var(--b, #2a2f4a)' }}
                  data-testid="beta-feedback-page"
                >
                  {currentPage}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t5, #6b7280)' }}>
                  What's the issue?
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what happened, what you expected, or any suggestion..."
                  className="mt-1 w-full rounded-lg px-3 py-2.5 text-base resize-none focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50"
                  style={{
                    background: 'var(--s, #242a45)',
                    color: 'var(--t, #fff)',
                    border: '1px solid var(--b, #2a2f4a)',
                    minHeight: 140,
                  }}
                  data-testid="beta-feedback-description"
                />
              </div>

              {/* Attachment */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t5, #6b7280)' }}>
                  Attachment (optional)
                </label>
                <div className="mt-1">
                  {attachment ? (
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--s, #242a45)', border: '1px solid var(--b, #2a2f4a)' }}
                    >
                      <Paperclip className="w-4 h-4 flex-shrink-0" style={{ color: '#d4af37' }} />
                      <span className="truncate flex-1" style={{ color: 'var(--t, #fff)' }}>{attachment.name}</span>
                      <button
                        onClick={() => setAttachment(null)}
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ color: 'var(--rd, #ef4444)' }}
                        data-testid="beta-feedback-remove-file"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ background: 'var(--s, #242a45)', border: '1px dashed var(--b, #2a2f4a)', color: 'var(--t4, #9ca3af)' }}
                      data-testid="beta-feedback-attach-btn"
                    >
                      <Paperclip className="w-4 h-4" />
                      Attach a screenshot
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4" style={{ borderTop: '1px solid var(--b, #2a2f4a)' }}>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !description.trim()}
                className="w-full h-11 text-sm font-bold rounded-xl flex items-center justify-center gap-2"
                style={{
                  background: submitting ? 'var(--s)' : 'linear-gradient(135deg, #d4af37, #b8942e)',
                  color: submitting ? 'var(--t4)' : '#0F1629',
                }}
                data-testid="beta-feedback-submit"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                ) : (
                  <><Send className="w-4 h-4" /> Send Feedback</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
