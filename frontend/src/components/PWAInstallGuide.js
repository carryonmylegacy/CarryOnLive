import React, { useState } from 'react';
import { X, ChevronDown, MoreHorizontal } from 'lucide-react';

const isIOSDevice = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isAndroidDevice = () => /Android/.test(navigator.userAgent);
const isSafariBrowser = () => /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/.test(navigator.userAgent);

/* ── Safari toolbar mockup (light, matches iOS Light Mode) ── */
const ToolbarMini = () => (
  <div className="rounded-2xl p-2 flex items-center gap-2 mx-auto" style={{ background: '#f2f2f7', maxWidth: '280px', border: '1px solid rgba(0,0,0,0.08)' }}>
    <span className="text-[#8e8e93] text-sm px-1">&lsaquo;</span>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18"/></svg>
    <div className="flex-1 rounded-full px-2.5 py-1" style={{ background: '#e5e5ea' }}>
      <span className="text-[#8e8e93] text-[11px]">carryon.us</span>
    </div>
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2"><path d="M21 12a9 9 0 11-3-6.7"/><path d="M21 3v5h-5"/></svg>
    <div className="w-8 h-8 rounded-full flex items-center justify-center animate-pulse-fast" style={{ border: '2px solid #007AFF', background: 'rgba(0,122,255,0.15)', boxShadow: '0 0 14px rgba(0,122,255,0.5), 0 0 30px rgba(0,122,255,0.2)' }}>
      <MoreHorizontal className="w-4 h-4 text-[#007AFF]" />
    </div>
  </div>
);

/* ── ••• popup menu (light, matches iOS Light Mode) ── */
const DotMenuMini = () => (
  <div className="rounded-xl overflow-hidden mx-auto" style={{ background: '#ffffff', maxWidth: '260px', border: '1px solid rgba(0,0,0,0.08)' }}>
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 animate-pulse-fast" style={{ background: 'rgba(0,122,255,0.12)', borderBottom: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 0 12px rgba(0,122,255,0.3), inset 0 0 8px rgba(0,122,255,0.1)' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#007AFF" strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
      <span className="text-[#007AFF] text-sm font-medium flex-1">Share</span>
      <span className="text-[#007AFF] text-[11px]">tap this</span>
    </div>
    <div className="flex items-center gap-2.5 px-3.5 py-2 opacity-50" style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
      <span className="text-[#1c1c1e] text-sm">Add to Bookmarks</span>
    </div>
    <div className="flex items-center gap-2.5 px-3.5 py-2 opacity-50">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
      <span className="text-[#1c1c1e] text-sm">Add Bookmark to...</span>
    </div>
  </div>
);

/* ── iOS-accurate Share Sheet mockup (LIGHT theme, matches actual iOS) ── */
const ShareSheetMini = () => (
  <div className="rounded-xl overflow-hidden mx-auto" style={{ background: '#f2f2f7', maxWidth: '280px', border: '1px solid rgba(0,0,0,0.08)' }}>
    {/* Header */}
    <div className="flex items-center gap-2.5 p-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
      <img src="/carryon-logo.png" alt="" className="w-7 h-7 rounded-lg" />
      <div className="flex-1 min-w-0">
        <p className="text-[#1c1c1e] text-[11px] font-semibold truncate">CarryOn</p>
        <p className="text-[#8e8e93] text-[11px]">carryon.us</p>
      </div>
    </div>
    {/* App icons row */}
    <div className="flex gap-3 px-3 py-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
      {[
        { bg: '#007AFF', label: 'AirDrop', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none"><circle cx="12" cy="12" r="8"/></svg> },
        { bg: '#34C759', label: 'Messages', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> },
        { bg: '#007AFF', label: 'Mail', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
      ].map(app => (
        <div key={app.label} className="flex flex-col items-center gap-0.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: app.bg }}>{app.icon}</div>
          <span className="text-[#1c1c1e] text-[11px] leading-none">{app.label}</span>
        </div>
      ))}
    </div>
    {/* Action items */}
    <div className="text-[#1c1c1e]">
      <div className="flex items-center gap-2.5 px-3 py-2 opacity-50" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="1.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        <span className="text-sm">Copy</span>
      </div>
      <div className="flex items-center gap-2.5 px-3 py-2 opacity-50" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
        <span className="text-sm">Add to Bookmarks</span>
      </div>
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg mx-1 my-0.5 animate-pulse-fast" style={{ background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.3)', boxShadow: '0 0 12px rgba(0,122,255,0.3), inset 0 0 8px rgba(0,122,255,0.08)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#007AFF" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        <span className="text-[#007AFF] text-sm font-semibold flex-1">Add to Home Screen</span>
        <span className="text-[#007AFF] text-[11px] font-medium">tap this</span>
      </div>
      <div className="flex items-center gap-2.5 px-3 py-2 opacity-50">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span className="text-sm">Add to Favorites</span>
      </div>
    </div>
  </div>
);

/* ── iOS-accurate "Add to Home Screen" confirm dialog (LIGHT) ── */
const AddConfirmMini = () => (
  <div className="rounded-xl overflow-hidden mx-auto" style={{ background: '#f2f2f7', maxWidth: '280px', border: '1px solid rgba(0,0,0,0.08)' }}>
    <div className="flex items-center justify-between px-3.5 py-2.5" style={{ borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
      <span className="text-[#007AFF] text-sm">Cancel</span>
      <span className="text-[#1c1c1e] text-sm font-semibold">Add to Home Screen</span>
      <span className="text-white text-sm font-bold px-3 py-1 rounded-full animate-pulse-fast" style={{ background: '#007AFF', boxShadow: '0 0 14px rgba(0,122,255,0.6), 0 0 30px rgba(0,122,255,0.25)' }}>Add</span>
    </div>
    <div className="flex items-center gap-3 px-3.5 py-3">
      <img src="/carryon-logo.png" alt="" className="w-10 h-10 rounded-xl" style={{ border: '1px solid rgba(0,0,0,0.08)' }} />
      <div>
        <p className="text-[#1c1c1e] text-sm font-medium">CarryOn</p>
        <p className="text-[#8e8e93] text-[11px]">carryon.us</p>
      </div>
    </div>
  </div>
);

const PWAInstallGuide = ({ open, onClose }) => {
  const [showAlt, setShowAlt] = useState(false);

  if (!open) return null;

  const ios = isIOSDevice();
  const android = isAndroidDevice();
  const safari = isSafariBrowser();

  if (ios && !safari) {
    return (
      <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} data-testid="pwa-install-guide">
        <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6" style={{ background: 'var(--bg)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}>
          <h2 className="text-white text-lg font-bold mb-2" style={{ fontFamily: 'var(--sans)' }}>Open in Safari</h2>
          <p className="text-[#7b879e] text-sm mb-4">Adding to your Home Screen only works in Safari. Copy <span className="text-[#d4af37] font-semibold">carryon.us</span> and paste it into Safari.</p>
          <button onClick={onClose} className="gold-gradient-btn w-full py-3 rounded-xl text-sm font-bold active:scale-[0.97]" data-testid="install-guide-done">Got it</button>
        </div>
      </div>
    );
  }

  if (android) {
    return (
      <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} data-testid="pwa-install-guide">
        <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6" style={{ background: 'var(--bg)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}>
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-white text-lg font-bold" style={{ fontFamily: 'var(--sans)' }}>Install CarryOn</h2>
            <button onClick={onClose} className="text-[#475569] hover:text-white p-2" data-testid="install-guide-close" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
          <div className="space-y-4 mb-5">
            <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(var(--gold-rgb), 0.15)', color: '#d4af37' }}>1</div><span className="text-white text-sm">Tap <strong className="text-[#d4af37]">the three dots</strong> at the top-right</span></div>
            <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(var(--gold-rgb), 0.15)', color: '#d4af37' }}>2</div><span className="text-white text-sm">Tap <strong className="text-[#d4af37]">&ldquo;Install app&rdquo;</strong></span></div>
            <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(var(--gold-rgb), 0.15)', color: '#d4af37' }}>3</div><span className="text-white text-sm">Tap <strong className="text-[#d4af37]">&ldquo;Install&rdquo;</strong></span></div>
          </div>
          <button onClick={onClose} className="gold-gradient-btn w-full py-3 rounded-xl text-sm font-bold active:scale-[0.97]" data-testid="install-guide-done">Got it</button>
        </div>
      </div>
    );
  }

  /* ── iOS Safari: 4-step with real iOS-style mockups ── */
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} data-testid="pwa-install-guide">
      <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[92vh] overflow-y-auto" style={{ background: 'var(--bg)', border: '1px solid rgba(var(--gold-rgb), 0.2)', borderBottom: 'none' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 pb-2" style={{ background: 'var(--bg)' }}>
          <h2 className="text-white text-base font-bold" style={{ fontFamily: 'var(--sans)' }}>Install CarryOn</h2>
          <button onClick={onClose} className="text-[#475569] hover:text-white p-2" data-testid="install-guide-close" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-4 space-y-5 pb-3">
          {/* Step 1 */}
          <div data-testid="install-step-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: 'var(--b2)', color: '#ffffff' }}>1</div>
              <span className="text-white text-sm">Tap <span className="text-white font-bold">•••</span></span>
            </div>
            <ToolbarMini />
          </div>

          {/* Step 2 */}
          <div data-testid="install-step-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: 'var(--b2)', color: '#ffffff' }}>2</div>
              <span className="text-white text-sm">Tap <span className="text-white font-bold">&ldquo;Share&rdquo;</span></span>
            </div>
            <DotMenuMini />
          </div>

          {/* Step 3 */}
          <div data-testid="install-step-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: 'var(--b2)', color: '#ffffff' }}>3</div>
              <span className="text-white text-sm">Tap <span className="text-white font-bold">&ldquo;+ Add to Home Screen&rdquo;</span></span>
            </div>
            <ShareSheetMini />
          </div>

          {/* Step 4 */}
          <div data-testid="install-step-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: 'var(--b2)', color: '#ffffff' }}>4</div>
              <span className="text-white text-sm">Tap <span className="text-white font-bold">&ldquo;Add&rdquo;</span></span>
            </div>
            <AddConfirmMini />
          </div>
        </div>

        {/* Can't find it */}
        <div className="px-4 mb-2">
          <button onClick={() => setShowAlt(!showAlt)} className="flex items-center gap-1.5 text-[#6b7a90] text-xs hover:text-[#d4af37] transition-colors" data-testid="cant-find-toggle">
            <ChevronDown className={`w-3 h-3 transition-transform ${showAlt ? 'rotate-180' : ''}`} />
            Can&apos;t find it?
          </button>
          {showAlt && (
            <p className="text-[#6b7a90] text-xs mt-1.5 leading-relaxed pl-4">On some iPhones, &ldquo;Add to Home Screen&rdquo; appears directly in the ••• menu. Scroll down to find it.</p>
          )}
        </div>

        <div className="px-4 pb-5 pt-1">
          <button onClick={onClose} className="gold-gradient-btn w-full py-3 rounded-xl text-sm font-bold active:scale-[0.97]"
            data-testid="install-guide-done">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallGuide;
