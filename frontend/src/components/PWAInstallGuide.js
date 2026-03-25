import React, { useState } from 'react';
import { X, Share, MoreVertical, Plus, Check, ChevronDown, Smartphone } from 'lucide-react';

const isIOSDevice = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isAndroidDevice = () => /Android/.test(navigator.userAgent);
const isSafariBrowser = () => /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/.test(navigator.userAgent);

const StepCard = ({ step, icon, title, description }) => (
  <div className="flex items-start gap-4 p-4 rounded-xl mb-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} data-testid={`install-step-${step}`}>
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
        icon: <Share className="w-4 h-4 text-[#d4af37]" />,
        title: 'Tap the Share button',
        description: 'Look for this icon at the bottom of your screen, in the Safari toolbar.',
      },
      {
        icon: <Plus className="w-4 h-4 text-[#d4af37]" />,
        title: 'Tap "Add to Home Screen"',
        description: 'Scroll down in the menu until you see it. It has a plus (+) icon next to it.',
      },
      {
        icon: <Check className="w-4 h-4 text-[#d4af37]" />,
        title: 'Tap "Add"',
        description: 'Tap "Add" in the top-right corner. CarryOn will appear on your home screen like a real app.',
      },
    ];
    altText = 'If your Safari address bar is at the top of your screen, the Share button is up there instead — look for the same icon near the address bar.';
  } else if (ios && !safari) {
    steps = [
      {
        icon: <MoreVertical className="w-4 h-4 text-[#d4af37]" />,
        title: 'Open in Safari first',
        description: 'This feature only works in Safari. Copy the URL and paste it into Safari, then follow the steps there.',
      },
    ];
  } else if (android) {
    steps = [
      {
        icon: <MoreVertical className="w-4 h-4 text-[#d4af37]" />,
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
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} data-testid="pwa-install-guide">
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: '#0f1a2e', border: '1px solid rgba(212,175,55,0.2)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between mb-4">
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
                Can&apos;t find the Share button?
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
