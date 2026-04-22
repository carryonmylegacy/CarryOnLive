import React from 'react';
import {
  Shield, Lock, Users, X, ArrowLeft, Check, ChevronRight, MessageCircle,
} from 'lucide-react';

/**
 * ECT Security Intro — Two-step walkthrough overlay.
 * Large tile with all corners rounded. Scrollable on small screens.
 * Fills more screen real estate on large iPhones.
 */
export default function ECTSecurityIntro({ introStep, setIntroStep, onDismiss, onBack }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-start overflow-y-auto"
      style={{
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        paddingLeft: '14px',
        paddingRight: '14px',
        paddingTop: 'calc(72px + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* Tile — fills available width, all 4 corners rounded, generous padding */}
      <div
        className="w-full max-w-lg rounded-3xl px-5 py-5"
        data-testid="ect-security-intro"
        style={{
          background: 'var(--bg2)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: [
            '0 1px 2px rgba(0,0,0,0.25)',
            '0 4px 12px rgba(0,0,0,0.35)',
            '0 16px 40px rgba(0,0,0,0.5)',
            '0 40px 80px rgba(0,0,0,0.35)',
          ].join(', '),
        }}
      >
        {/* Header badge */}
        <div className="flex items-center justify-center mb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.2)' }}>
            <Shield className="w-3.5 h-3.5" style={{ color: '#d4af37' }} />
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#d4af37' }}>Estate Comms Tool (ECT)</span>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-3 mb-5">
          {[1, 2].map(s => (
            <div
              key={s}
              className="rounded-full transition-all duration-300"
              style={{
                width: introStep === s ? '24px' : '8px',
                height: '8px',
                background: introStep === s ? '#d4af37' : introStep > s ? '#22C993' : 'rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </div>

        {/* Step 1: Why ECT is different */}
        {introStep === 1 && (
          <div data-testid="ect-intro-step-1">
            <div className="text-center mb-5">
              <h2 className="text-xl font-bold mb-1.5" style={{ color: 'var(--t)', fontFamily: 'var(--serif)' }}>
                The Most Private Chat<br />You'll Ever Use
              </h2>
              <p className="text-sm" style={{ color: 'var(--t4)' }}>
                Here's what makes the Estate Comms Tool different from every other messaging app.
              </p>
            </div>

            <div className="space-y-2.5 mb-5">
              {[
                { icon: Lock,         title: 'Closed Network',           desc: 'Only estate members can reach you. No strangers, no spam, no cold messages.' },
                { icon: Shield,       title: 'No Phone Number Needed',   desc: 'Your number is never exposed, scanned, or shared with any contact.' },
                { icon: Users,        title: 'Owner-Controlled Access',  desc: 'The benefactor decides exactly who is in and who is out. Period.' },
                { icon: X,            title: 'Zero Data Mining',         desc: 'No ads. No tracking. No metadata sold. Your conversations are yours.' },
                { icon: MessageCircle,title: 'Trusted Contacts Only',    desc: 'FFN contacts receive your messages by email or SMS — no app required.' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.12)' }}>
                    <item.icon className="w-4 h-4" style={{ color: '#d4af37' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold leading-snug" style={{ color: 'var(--t)' }}>{item.title}</div>
                    <div className="text-xs leading-snug mt-0.5" style={{ color: 'var(--t4)' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-center mb-4 px-2" style={{ color: 'var(--t5)', fontStyle: 'italic' }}>
              "The most private messaging system is the one where strangers can never find the door."
            </p>

            <button
              onClick={() => setIntroStep(2)}
              className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              data-testid="ect-intro-next-1"
              style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}
            >
              Next — How to Use It <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: How to use ECT */}
        {introStep === 2 && (
          <div data-testid="ect-intro-step-2">
            <div className="text-center mb-5">
              <h2 className="text-xl font-bold mb-1.5" style={{ color: 'var(--t)', fontFamily: 'var(--serif)' }}>
                How to Use the Estate Comms Tool
              </h2>
              <p className="text-sm" style={{ color: 'var(--t4)' }}>
                Everything you need to know in about 30 seconds.
              </p>
            </div>

            <div className="space-y-2.5 mb-5">
              {[
                { num: '1', title: 'Start a Conversation', desc: 'Tap the gold + button at the top right of the screen.' },
                { num: '2', title: 'Pick Who to Chat With', desc: 'Choose one person for a direct message or select several to create a group.' },
                { num: '3', title: 'Type and Send',         desc: 'Type your message at the bottom bar and tap the gold send arrow.' },
                { num: '4', title: 'Photos & Attachments',  desc: 'Tap the paperclip to attach files or images. Press the mic to record a voice message.' },
                { num: '5', title: 'Pin Important Messages', desc: 'Long-press any message and tap Pin. Pinned messages are saved for everyone in the chat and accessible from the header — perfect for keeping critical info at your fingertips.' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>
                    {item.num}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold leading-snug" style={{ color: 'var(--t)' }}>{item.title}</div>
                    <div className="text-xs leading-snug mt-0.5" style={{ color: 'var(--t4)' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2.5 mb-0">
              <button
                onClick={() => setIntroStep(1)}
                className="px-4 py-3 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] flex items-center gap-1.5"
                data-testid="ect-intro-back-2"
                style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t4)' }}
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={onDismiss}
                className="flex-1 py-3 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                data-testid="ect-security-dismiss"
                style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}
              >
                <Check className="w-4 h-4" /> Got It — Start Chatting
              </button>
            </div>
          </div>
        )}

        {/* Skip link */}
        <button
          onClick={onBack}
          className="w-full py-2.5 mt-3 text-xs font-medium transition-all active:scale-[0.97]"
          data-testid="ect-security-back"
          style={{ color: 'var(--t5)', background: 'transparent', border: 'none' }}
        >
          Skip — Go Back
        </button>
      </div>
    </div>
  );
}
