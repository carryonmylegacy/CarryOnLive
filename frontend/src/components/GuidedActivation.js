import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, FileText, Upload, MessageSquare, CheckSquare, ChevronRight, X } from 'lucide-react';

/**
 * Bouncing "Return to Dashboard" popup — appears after completing an activation step.
 * Different copy each time for warmth.
 */
export const ReturnPopup = ({ step, beneficiaryNames, onReturn, onAlternate }) => {
  const variants = {
    message: {
      title: 'Beautiful. That message will mean everything.',
      subtitle: 'You can edit or create more messages anytime.',
      returnText: 'Return to Dashboard for Next Steps',
      alternateText: 'Create Another Message',
      icon: MessageSquare,
      color: '#8B5CF6',
    },
    document: {
      title: 'Great start — your vault is no longer empty.',
      subtitle: 'Every document you add strengthens your plan.',
      returnText: 'Head Back to Your Dashboard',
      alternateText: null,
      icon: Upload,
      color: '#3B82F6',
    },
    checklist: {
      title: 'Your loved ones will thank you for this.',
      subtitle: 'These steps will guide them when they need it most.',
      returnText: 'Almost There — Return to Dashboard',
      alternateText: null,
      icon: CheckSquare,
      color: '#F59E0B',
    },
    guardian: {
      title: 'Knowledge is power.',
      subtitle: 'The EGA will continue to learn as you build your plan.',
      returnText: 'Return to Dashboard',
      alternateText: null,
      icon: Sparkles,
      color: '#d4af37',
    },
  };

  const v = variants[step] || variants.message;
  const Icon = v.icon;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative rounded-2xl p-7 max-w-sm w-full text-center"
        style={{
          background: 'var(--bg2, #0F1629)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          animation: 'gentleBounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        }}>
        <style>{`
          @keyframes gentleBounce {
            0% { opacity: 0; transform: scale(0.85) translateY(20px); }
            50% { transform: scale(1.03) translateY(-5px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: `${v.color}15`, border: `1px solid ${v.color}25` }}>
          <Icon className="w-7 h-7" style={{ color: v.color }} />
        </div>
        <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{v.title}</h2>
        <p className="text-sm text-[#94a3b8] mb-6">{v.subtitle}</p>
        <button onClick={onReturn}
          className="w-full py-3 rounded-xl text-sm font-bold mb-3"
          style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}>
          {v.returnText} <ChevronRight className="w-4 h-4 inline ml-1" />
        </button>
        {v.alternateText && onAlternate && (
          <button onClick={onAlternate}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-[#94a3b8]"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            {v.alternateText}
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Celebration overlay — appears when all 4 activation steps are complete.
 * All tiles fade in, then this overlay fades in on top.
 */
export const ActivationCelebration = ({ onDismiss }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 cursor-pointer"
    onClick={onDismiss}
    style={{ animation: 'fadeInSlow 1.5s ease forwards' }}>
    <style>{`
      @keyframes fadeInSlow { 0% { opacity: 0; } 40% { opacity: 0; } 100% { opacity: 1; } }
      @keyframes celebPulse {
        0% { transform: scale(0.9); opacity: 0; }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); opacity: 1; }
      }
    `}</style>
    <div className="absolute inset-0 bg-black/50" />
    <div className="relative rounded-2xl p-8 max-w-sm w-full text-center"
      style={{
        background: 'var(--bg2, #0F1629)',
        border: '1px solid rgba(212,175,55,0.2)',
        boxShadow: '0 0 80px rgba(212,175,55,0.15), 0 25px 60px rgba(0,0,0,0.5)',
        animation: 'celebPulse 1s cubic-bezier(0.34, 1.56, 0.64, 1) 1s forwards',
        opacity: 0,
      }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
        style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))', border: '2px solid rgba(212,175,55,0.3)' }}>
        <Sparkles className="w-10 h-10 text-[#d4af37]" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
        Congratulations
      </h2>
      <p className="text-base text-[#d4af37] font-semibold mb-2">You've created the beginnings of your estate plan.</p>
      <p className="text-sm text-[#94a3b8] mb-4">Your loved ones are already more protected than 70% of American families.</p>
      <p className="text-xs text-[#64748b] italic">(tap anywhere to continue exploring CarryOn)</p>
    </div>
  </div>
);

/**
 * Water balloon pop animation for completed tiles.
 * Applied via className when a tile completes.
 */
export const popAnimationCSS = `
  @keyframes waterBalloonPop {
    0% { transform: scale(1); }
    15% { transform: scale(1.15) rotate(-2deg); border-radius: 20px; }
    30% { transform: scale(0.95) rotate(1deg); }
    45% { transform: scale(1.08); }
    60% { transform: scale(0.98); }
    75% { transform: scale(1.03); }
    100% { transform: scale(1); }
  }
  @keyframes ripplePulse {
    0% { box-shadow: 0 0 0 0 rgba(212,175,55,0.4); }
    70% { box-shadow: 0 0 0 15px rgba(212,175,55,0); }
    100% { box-shadow: 0 0 0 0 rgba(212,175,55,0); }
  }
  .tile-pop {
    animation: waterBalloonPop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), ripplePulse 1s ease-out;
  }
  @keyframes allTilesFadeIn {
    0% { opacity: 0; transform: translateY(10px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .tiles-fade-in > * {
    opacity: 0;
    animation: allTilesFadeIn 0.8s ease forwards;
  }
  .tiles-fade-in > *:nth-child(1) { animation-delay: 0.2s; }
  .tiles-fade-in > *:nth-child(2) { animation-delay: 0.4s; }
  .tiles-fade-in > *:nth-child(3) { animation-delay: 0.6s; }
  .tiles-fade-in > *:nth-child(4) { animation-delay: 0.8s; }
`;
