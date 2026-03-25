import React, { useState } from 'react';
import { X, ChevronDown, Smartphone, MoreHorizontal, Share, Bookmark, BookOpen, Plus, Hand } from 'lucide-react';

const isIOSDevice = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isAndroidDevice = () => /Android/.test(navigator.userAgent);
const isSafariBrowser = () => /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/.test(navigator.userAgent);

/* ── Visual: Safari bottom toolbar with ••• highlighted ── */
const ToolbarVisual = () => (
  <div className="rounded-2xl p-2 flex items-center gap-2" style={{ background: 'rgba(40,50,70,0.95)', border: '1px solid rgba(255,255,255,0.08)' }}>
    <div className="text-white/20 text-xl px-1">&lsaquo;</div>
    <div className="text-white/20 px-1">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18"/></svg>
    </div>
    <div className="flex-1 rounded-full px-3 py-1" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <span className="text-white/30 text-[11px]">carryon.us</span>
    </div>
    <div className="text-white/20 px-1">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-3-6.7"/><path d="M21 3v5h-5"/></svg>
    </div>
    <div className="relative">
      <div className="w-9 h-9 rounded-full flex items-center justify-center animate-pulse" style={{ background: 'rgba(212,175,55,0.2)', border: '2px solid #d4af37', boxShadow: '0 0 16px rgba(212,175,55,0.4)' }}>
        <MoreHorizontal className="w-5 h-5 text-[#d4af37]" />
      </div>
    </div>
  </div>
);

/* ── Visual: The popup menu with "Share" highlighted ── */
const MenuVisual = () => (
  <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(40,48,65,0.98)', border: '1px solid rgba(255,255,255,0.08)' }}>
    <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)' }}>
      <Share className="w-4 h-4 text-[#d4af37]" />
      <span className="text-[#d4af37] text-sm font-semibold">Share</span>
      <span className="ml-auto text-[#d4af37] text-xs animate-pulse">tap this</span>
    </div>
    <div className="flex items-center gap-3 px-4 py-2.5 opacity-40">
      <Bookmark className="w-4 h-4 text-white/60" />
      <span className="text-white/60 text-sm">Add to Bookmarks</span>
    </div>
    <div className="flex items-center gap-3 px-4 py-2.5 opacity-40">
      <BookOpen className="w-4 h-4 text-white/60" />
      <span className="text-white/60 text-sm">Add Bookmark to...</span>
    </div>
    <div className="flex items-center gap-3 px-4 py-2.5 opacity-40">
      <Plus className="w-4 h-4 text-white/60" />
      <span className="text-white/60 text-sm">New Tab</span>
    </div>
  </div>
);

/* ── Visual: Share sheet with "Add to Home Screen" highlighted ── */
const ShareSheetVisual = () => (
  <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(40,48,65,0.98)', border: '1px solid rgba(255,255,255,0.08)' }}>
    <div className="flex items-center gap-3 px-4 py-2.5 opacity-40">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/60"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/></svg>
      <span className="text-white/60 text-sm">Copy</span>
    </div>
    <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)' }}>
      <Plus className="w-4 h-4 text-[#d4af37]" />
      <span className="text-[#d4af37] text-sm font-semibold">Add to Home Screen</span>
      <span className="ml-auto text-[#d4af37] text-xs animate-pulse">tap this</span>
    </div>
    <div className="flex items-center gap-3 px-4 py-2.5 opacity-40">
      <Bookmark className="w-4 h-4 text-white/60" />
      <span className="text-white/60 text-sm">Add to Favorites</span>
    </div>
  </div>
);

/* ── Visual: The "Add" confirmation screen ── */
const AddConfirmVisual = () => (
  <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(40,48,65,0.98)', border: '1px solid rgba(255,255,255,0.08)' }}>
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-white/40 text-sm">Cancel</span>
      <span className="text-white/60 text-sm font-semibold">Add to Home Screen</span>
      <span className="text-[#d4af37] text-sm font-bold animate-pulse" style={{ textShadow: '0 0 8px rgba(212,175,55,0.4)' }}>Add</span>
    </div>
    <div className="flex items-center gap-3 px-4 py-3 mx-3 mb-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.3)' }}>
      <img src="/carryon-logo.png" alt="" className="w-8 h-8 rounded-lg" />
      <span className="text-white/70 text-sm">CarryOn</span>
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
        <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6" style={{ background: '#0f1a2e', border: '1px solid rgba(212,175,55,0.2)' }}>
          <h2 className="text-white text-lg font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Open in Safari</h2>
          <p className="text-[#7b879e] text-sm mb-4">Adding to your Home Screen only works in Safari. Copy <span className="text-[#d4af37] font-semibold">carryon.us</span> and paste it into Safari.</p>
          <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-bold active:scale-[0.97]" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }} data-testid="install-guide-done">Got it</button>
        </div>
      </div>
    );
  }

  if (android) {
    return (
      <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} data-testid="pwa-install-guide">
        <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6" style={{ background: '#0f1a2e', border: '1px solid rgba(212,175,55,0.2)' }}>
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-white text-lg font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Install CarryOn</h2>
            <button onClick={onClose} className="text-[#475569] hover:text-white p-1" data-testid="install-guide-close"><X className="w-5 h-5" /></button>
          </div>
          <div className="space-y-4 mb-5">
            <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>1</div><span className="text-white text-sm">Tap <strong className="text-[#d4af37]">the three dots</strong> at the top-right</span></div>
            <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>2</div><span className="text-white text-sm">Tap <strong className="text-[#d4af37]">&ldquo;Install app&rdquo;</strong> or <strong className="text-[#d4af37]">&ldquo;Add to Home screen&rdquo;</strong></span></div>
            <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>3</div><span className="text-white text-sm">Tap <strong className="text-[#d4af37]">&ldquo;Install&rdquo;</strong></span></div>
          </div>
          <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-bold active:scale-[0.97]" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }} data-testid="install-guide-done">Got it</button>
        </div>
      </div>
    );
  }

  /* ── iOS Safari: 4-step visual walkthrough ── */
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} data-testid="pwa-install-guide">
      <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[92vh] overflow-y-auto" style={{ background: '#0f1a2e', border: '1px solid rgba(212,175,55,0.2)', borderBottom: 'none', boxShadow: '0 -8px 40px rgba(0,0,0,0.6)' }}>
        <div className="p-5 pb-0">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-white text-base font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Install CarryOn in 4 taps</h2>
            <button onClick={onClose} className="text-[#475569] hover:text-white p-1" data-testid="install-guide-close"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Step 1: Tap ••• */}
        <div className="px-5 mb-4" data-testid="install-step-1">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.25)' }}>1</div>
            <span className="text-white text-sm font-semibold">Tap <span className="text-[#d4af37]">•••</span> at the bottom-right</span>
          </div>
          <ToolbarVisual />
        </div>

        {/* Step 2: Tap Share */}
        <div className="px-5 mb-4" data-testid="install-step-2">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.25)' }}>2</div>
            <span className="text-white text-sm font-semibold">Tap <span className="text-[#d4af37]">&ldquo;Share&rdquo;</span></span>
          </div>
          <MenuVisual />
        </div>

        {/* Step 3: Tap Add to Home Screen */}
        <div className="px-5 mb-4" data-testid="install-step-3">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.25)' }}>3</div>
            <span className="text-white text-sm font-semibold">Tap <span className="text-[#d4af37]">&ldquo;Add to Home Screen&rdquo;</span></span>
          </div>
          <ShareSheetVisual />
        </div>

        {/* Step 4: Tap Add */}
        <div className="px-5 mb-4" data-testid="install-step-4">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.25)' }}>4</div>
            <span className="text-white text-sm font-semibold">Tap <span className="text-[#d4af37]">&ldquo;Add&rdquo;</span> in the top-right</span>
          </div>
          <AddConfirmVisual />
        </div>

        {/* Can't find it */}
        <div className="px-5 mb-3">
          <button onClick={() => setShowAlt(!showAlt)} className="flex items-center gap-1.5 text-[#6b7a90] text-xs font-medium hover:text-[#d4af37] transition-colors" data-testid="cant-find-toggle">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAlt ? 'rotate-180' : ''}`} />
            Can&apos;t find it?
          </button>
          {showAlt && (
            <p className="text-[#6b7a90] text-xs mt-2 leading-relaxed pl-5">On some iPhones, &ldquo;Add to Home Screen&rdquo; may appear directly in the ••• menu without tapping Share first. Scroll down in the menu to find it.</p>
          )}
        </div>

        {/* Done */}
        <div className="px-5 pb-5 pt-1">
          <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }} data-testid="install-guide-done">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallGuide;
