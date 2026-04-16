import React from 'react';
import {
  Shield, Lock, Users, X, MessageCircle, ArrowLeft, Check, ChevronRight,
} from 'lucide-react';

/**
 * ECT Security Intro — Two-step walkthrough overlay shown on first visit.
 */
export default function ECTSecurityIntro({ introStep, setIntroStep, onDismiss, onBack }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center overflow-y-auto" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', paddingLeft: '16px', paddingRight: '16px', paddingTop: 'calc(64px + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(84px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="w-full max-w-md rounded-2xl px-4 py-3 my-auto flex-shrink-0" data-testid="ect-security-intro" style={{ background: 'rgba(15,22,41,0.95)', border: '1px solid rgba(212,175,55,0.3)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2.5 mb-2.5">
          {[1, 2].map(s => (
            <div key={s} className={`w-2 h-2 rounded-full transition-all duration-300 ${
              introStep === s ? 'bg-[#d4af37] scale-125' : introStep > s ? 'bg-[#22C993]' : 'bg-white/10'
            }`} />
          ))}
        </div>

        {/* Step 1: Why ECT is different */}
        {introStep === 1 && (
          <div data-testid="ect-intro-step-1">
            <div className="text-center mb-2.5">
              <h2 className="text-base font-bold" style={{ color: 'var(--t)' }}>The Most Private Chat You'll Ever Use</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>Here's what makes Estate Comms different.</p>
            </div>
            <div className="space-y-1.5 mb-2.5">
              {[
                { icon: Lock, title: 'Closed Network', desc: 'Only estate members can reach you.' },
                { icon: Shield, title: 'No Phone Number Needed', desc: 'Your number is never exposed or scanned.' },
                { icon: Users, title: 'Owner-Controlled Access', desc: 'The benefactor decides who\'s in and out.' },
                { icon: X, title: 'Zero Data Mining', desc: 'No ads, tracking, or data selling. Ever.' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 px-2.5 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <item.icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#d4af37' }} />
                  <div>
                    <div className="text-sm font-bold leading-snug" style={{ color: 'var(--t)' }}>{item.title}</div>
                    <div className="text-xs leading-snug" style={{ color: 'var(--t4)' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-center mb-2.5" style={{ color: 'var(--t5)' }}>
              The most private messaging system is the one where strangers can never find the door.
            </p>
            <button
              onClick={() => setIntroStep(2)}
              className="w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
              data-testid="ect-intro-next-1"
              style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}
            >Next — How to Use It <ChevronRight className="w-4 h-4 inline ml-1" /></button>
          </div>
        )}

        {/* Step 2: How to use ECT */}
        {introStep === 2 && (
          <div data-testid="ect-intro-step-2">
            <div className="text-center mb-2.5">
              <h2 className="text-base font-bold" style={{ color: 'var(--t)' }}>How to Use Estate Comms</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>Everything you need to know in 30 seconds.</p>
            </div>
            <div className="space-y-1.5 mb-2.5">
              {[
                { num: '1', title: 'Start a Conversation', desc: 'Tap the gold + button at the top right.' },
                { num: '2', title: 'Pick Who to Chat With', desc: 'Choose one person or select several for a group.' },
                { num: '3', title: 'Type and Send', desc: 'Type at the bottom, tap the send arrow.' },
                { num: '4', title: 'Photos & Voice', desc: 'Paperclip for files, mic for voice messages.' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 px-2.5 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="w-5.5 h-5.5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', width: '22px', height: '22px' }}>
                    {item.num}
                  </div>
                  <div>
                    <div className="text-sm font-bold leading-snug" style={{ color: 'var(--t)' }}>{item.title}</div>
                    <div className="text-xs leading-snug" style={{ color: 'var(--t4)' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setIntroStep(1)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
                data-testid="ect-intro-back-2"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}>
                <ArrowLeft className="w-3.5 h-3.5 inline mr-1" /> Back
              </button>
              <button
                onClick={onDismiss}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                data-testid="ect-security-dismiss"
                style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}
              ><Check className="w-4 h-4 inline mr-1" /> Got It — Start Chatting</button>
            </div>
          </div>
        )}

        {/* Skip link */}
        <button
          onClick={onBack}
          className="w-full py-1.5 mt-2 text-xs font-medium transition-all active:scale-[0.97]"
          data-testid="ect-security-back"
          style={{ color: 'var(--t5)', background: 'transparent' }}
        >Skip — Go Back</button>
      </div>
    </div>
  );
}
