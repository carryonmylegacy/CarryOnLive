import React, { useState } from 'react';
import { X, Plus, Check, ChevronDown, Smartphone, MoreHorizontal } from 'lucide-react';

const isIOSDevice = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isAndroidDevice = () => /Android/.test(navigator.userAgent);
const isSafariBrowser = () => /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/.test(navigator.userAgent);

const StepCard = ({ step, icon, title, description, visual }) => (
  <div className="flex flex-col gap-3 p-4 rounded-xl mb-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} data-testid={`install-step-${step}`}>
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.25)' }}>
        {step}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.1)' }}>
            {icon}
          </div>
          <span className="text-white font-semibold text-sm">{title}</span>
        </div>
        <p className="text-[#7b879e] text-xs leading-relaxed">{description}</p>
      </div>
    </div>
    {visual && <div className="mt-1">{visual}</div>}
  </div>
);

/* Visual mockup of the Safari bottom toolbar with ••• highlighted */
const SafariToolbarMockup = () => (
  <div className="rounded-2xl p-2.5 flex items-center gap-3 mx-auto" style={{ background: 'rgba(30,42,66,0.9)', border: '1px solid rgba(255,255,255,0.08)', maxWidth: '300px' }}>
    <div className="text-white/25 text-lg font-light pl-1">&lsaquo;</div>
    <div className="text-white/25">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18"/></svg>
    </div>
    <div className="flex-1 rounded-full px-3 py-1.5 text-center" style={{ background: 'rgba(13,24,41,0.8)' }}>
      <span className="text-white/30 text-xs">carryon.us</span>
    </div>
    <div className="text-white/25">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-3-6.7"/><path d="M21 3v5h-5"/></svg>
    </div>
    <div className="relative flex flex-col items-center">
      <div className="animate-bounce mb-0.5">
        <ChevronDown className="w-4 h-4 text-[#d4af37]" />
      </div>
      <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.15)', border: '2px solid #d4af37', boxShadow: '0 0 12px rgba(212,175,55,0.3)' }}>
        <MoreHorizontal className="w-5 h-5 text-[#d4af37]" />
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

  let steps = [];
  let altText = null;

  if (ios && safari) {
    steps = [
      {
        icon: <MoreHorizontal className="w-4 h-4 text-[#d4af37]" />,
        title: 'Tap the three dots',
        description: 'Look at the very bottom-right corner of your screen. Tap the three dots.',
        visual: <SafariToolbarMockup />,
      },
      {
        icon: <Plus className="w-4 h-4 text-[#d4af37]" />,
        title: 'Tap "Add to Home Screen"',
        description: 'A menu will pop up. Look for "Add to Home Screen" with a plus (+) icon. You may need to scroll down to find it.',
      },
      {
        icon: <Check className="w-4 h-4 text-[#d4af37]" />,
        title: 'Tap "Add"',
        description: 'Tap "Add" in the top-right corner. That\'s it! CarryOn will appear on your home screen just like a real app.',
      },
    ];
    altText = 'On some iPhones, you may need to first tap "Share" (a box with an arrow pointing up) in the menu, then scroll down to find "Add to Home Screen."';
  } else if (ios && !safari) {
    steps = [
      {
        icon: <Smartphone className="w-4 h-4 text-[#d4af37]" />,
        title: 'Open in Safari first',
        description: 'Adding to your Home Screen only works in Safari. Open Safari, go to carryon.us, then follow the steps.',
      },
    ];
  } else if (android) {
    steps = [
      {
        icon: <MoreHorizontal className="w-4 h-4 text-[#d4af37]" />,
        title: 'Tap the menu',
        description: 'Tap the three dots in the top-right corner of your browser.',
      },
      {
        icon: <Smartphone className="w-4 h-4 text-[#d4af37]" />,
        title: 'Tap "Install app"',
        description: 'You may also see "Add to Home screen" — either option works.',
      },
      {
        icon: <Check className="w-4 h-4 text-[#d4af37]" />,
        title: 'Confirm',
        description: 'Tap "Install" to add CarryOn to your home screen.',
      },
    ];
  } else {
    steps = [
      {
        icon: <Smartphone className="w-4 h-4 text-[#d4af37]" />,
        title: 'Open on your phone',
        description: 'Visit carryon.us on your iPhone or Android phone to install the app.',
      },
    ];
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} data-testid="pwa-install-guide">
      <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto" style={{ background: '#0f1a2e', border: '1px solid rgba(212,175,55,0.2)', borderBottom: 'none', boxShadow: '0 -8px 40px rgba(0,0,0,0.6)' }}>
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-white text-lg font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Add CarryOn to Home Screen</h2>
              <p className="text-[#7b879e] text-xs mt-1">Works just like a real app — no App Store needed</p>
            </div>
            <button onClick={onClose} className="text-[#475569] hover:text-white transition-colors p-1" data-testid="install-guide-close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-4">
            {steps.map((step, i) => (
              <StepCard key={i} step={i + 1} {...step} />
            ))}
          </div>

          {ios && safari && altText && (
            <div className="mb-4">
              <button onClick={() => setShowAlt(!showAlt)} className="flex items-center gap-1.5 text-[#d4af37] text-xs font-medium hover:text-[#fcd34d] transition-colors" data-testid="cant-find-toggle">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAlt ? 'rotate-180' : ''}`} />
                Can&apos;t find it?
              </button>
              {showAlt && (
                <p className="text-[#6b7a90] text-xs mt-2 leading-relaxed pl-5">{altText}</p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
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
