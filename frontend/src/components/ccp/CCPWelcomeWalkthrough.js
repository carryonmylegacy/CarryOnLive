import React from 'react';
import {
  Shield, FileText, AlertTriangle, UserCheck, Play, Zap, MapPin, Clock,
  ArrowRight, ArrowLeft, Check,
} from 'lucide-react';
import { useLabelCleaner } from '../../utils/brandLabel';

/**
 * CCPWelcomeWalkthrough — 3-step intro overlay for first-visit CCP users.
 * Large tile with all corners rounded. Scrollable on small screens.
 */
const CCPWelcomeWalkthrough = ({ welcomeStep, setWelcomeStep, onDismiss }) => {
  const cleanLabel = useLabelCleaner();
  const dismiss = () => {
    onDismiss();
    localStorage.setItem('carryon_ccp_intro_seen', '1');
  };

  const FeatureRow = ({ icon: Icon, color = '#d4af37', title, desc }) => (
    <div className="flex items-start gap-3 px-4 py-3 rounded-2xl" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold leading-snug" style={{ color: 'var(--t)' }}>{title}</div>
        <div className="text-xs leading-snug mt-0.5" style={{ color: 'var(--t4)' }}>{desc}</div>
      </div>
    </div>
  );

  const NumberRow = ({ num, title, desc }) => (
    <div className="flex items-start gap-3 px-4 py-3 rounded-2xl" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black" style={{ background: 'rgba(var(--gold-rgb), 0.15)', color: '#d4af37' }}>
        {num}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold leading-snug" style={{ color: 'var(--t)' }}>{title}</div>
        <div className="text-xs leading-snug mt-0.5" style={{ color: 'var(--t4)' }}>{desc}</div>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-start lg:justify-center overflow-y-auto pt-[calc(72px+env(safe-area-inset-top,0px))] pb-[calc(140px+env(safe-area-inset-bottom,0px))] lg:!pt-8 lg:!pb-8"
      data-testid="ccp-welcome-overlay"
      style={{
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        paddingLeft: '14px',
        paddingRight: '14px',
      }}
    >
      {/* Tile — max-lg, all 4 corners rounded */}
      <div
        className="w-full max-w-lg rounded-3xl px-5 py-5"
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
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}>
            <Shield className="w-3.5 h-3.5" style={{ color: '#d4af37' }} />
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#d4af37' }}>{cleanLabel('Contingency Protocols (CCP)')}</span>
          </div>
        </div>

        {/* Progress dots — pill style */}
        <div className="flex items-center justify-center gap-2.5 mb-5">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className="rounded-full transition-all duration-300"
              style={{
                width: welcomeStep === s ? '24px' : '8px',
                height: '8px',
                background: welcomeStep === s ? '#d4af37' : welcomeStep > s ? '#22C993' : 'rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </div>

        {/* Step 1: What is CCP? */}
        {welcomeStep === 1 && (
          <div data-testid="ccp-welcome-step-1">
            <div className="text-center mb-5">
              <Shield className="w-10 h-10 mx-auto mb-2.5" style={{ color: '#d4af37' }} />
              <h2 className="text-xl font-bold mb-1.5" style={{ color: 'var(--t)', fontFamily: 'var(--serif)' }}>
                Welcome to Contingency Protocols
              </h2>
              <p className="text-sm leading-snug" style={{ color: 'var(--t4)' }}>
                This is where your family creates emergency plans — for hurricanes, medical situations, power outages, or anything where everyone needs to know exactly what to do.
              </p>
            </div>

            <div className="space-y-2.5 mb-5">
              <FeatureRow icon={FileText}  title="Create Contingency Protocols"     desc="Set up rendezvous points, communication steps, and supply locations." />
              <FeatureRow icon={UserCheck} title="Check In During Emergencies" desc="Everyone marks themselves safe so the family instantly knows who needs help." />
              <FeatureRow icon={Play}      title="Practice with Drills"        desc="Run practice drills so everyone knows what to do before a real emergency hits." />
            </div>

            <button
              onClick={() => setWelcomeStep(2)}
              className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              data-testid="ccp-welcome-next-1"
              style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}
            >
              Next — How to Create a Plan <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: How to create a plan */}
        {welcomeStep === 2 && (
          <div data-testid="ccp-welcome-step-2">
            <div className="text-center mb-5">
              <FileText className="w-10 h-10 mx-auto mb-2.5" style={{ color: '#d4af37' }} />
              <h2 className="text-xl font-bold mb-1.5" style={{ color: 'var(--t)', fontFamily: 'var(--serif)' }}>
                Creating Your First Plan
              </h2>
              <p className="text-sm leading-snug" style={{ color: 'var(--t4)' }}>
                It only takes a few minutes. Here's the four things you'll add:
              </p>
            </div>

            <div className="space-y-2.5 mb-5">
              <NumberRow num="1" title="Give it a name"           desc='Something like "Hurricane Plan" or "Fire Evacuation".' />
              <NumberRow num="2" title="Add meeting points"       desc="Where should the family meet? (e.g., Grandma's house, the park, the school parking lot)" />
              <NumberRow num="3" title="Write a communication plan" desc="How will everyone stay in touch? (e.g., text first, then call this number)" />
              <NumberRow num="4" title="Add step-by-step instructions" desc="Any special steps like grabbing the go-bag or turning off the gas at the main valve." />
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={() => setWelcomeStep(1)}
                className="px-4 py-3 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] flex items-center gap-1.5"
                data-testid="ccp-welcome-back-2"
                style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t4)' }}
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={() => setWelcomeStep(3)}
                className="flex-1 py-3 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                data-testid="ccp-welcome-next-2"
                style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}
              >
                Next — During Emergencies <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: During an emergency */}
        {welcomeStep === 3 && (
          <div data-testid="ccp-welcome-step-3">
            <div className="text-center mb-5">
              <AlertTriangle className="w-10 h-10 mx-auto mb-2.5" style={{ color: '#F05252' }} />
              <h2 className="text-xl font-bold mb-1.5" style={{ color: 'var(--t)', fontFamily: 'var(--serif)' }}>
                When an Emergency Happens
              </h2>
              <p className="text-sm leading-snug" style={{ color: 'var(--t4)' }}>
                The estate owner activates the plan. Here's what happens next for everyone in the family:
              </p>
            </div>

            <div className="space-y-2.5 mb-5">
              <FeatureRow icon={Zap}       color="#F05252"     title="Plan Gets Activated"  desc="Everyone gets notified immediately with the full plan details." />
              <FeatureRow icon={UserCheck} color="#22C993"     title="Check In as Safe"     desc="Tap the big green CHECK IN button and pick your current status." />
              <FeatureRow icon={MapPin}    color="#3B7BF7"     title="Share Your Location"  desc="Optionally share where you are so family members can find you." />
              <FeatureRow icon={Clock}     color="var(--t4)"   title="Stand Down"           desc="When it's over, the owner deactivates the plan and a full report is saved." />
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={() => setWelcomeStep(2)}
                className="px-4 py-3 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] flex items-center gap-1.5"
                data-testid="ccp-welcome-back-3"
                style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t4)' }}
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={dismiss}
                className="flex-1 py-3 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                data-testid="ccp-welcome-dismiss"
                style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}
              >
                <Check className="w-4 h-4" /> Got It — Let's Start
              </button>
            </div>
          </div>
        )}

        {/* Skip */}
        <button
          onClick={dismiss}
          className="w-full py-2.5 mt-3 text-xs font-medium transition-all active:scale-[0.97]"
          data-testid="ccp-welcome-skip"
          style={{ color: 'var(--t5)', background: 'transparent', border: 'none' }}
        >
          Skip — I'll figure it out on my own
        </button>
      </div>
    </div>
  );
};

export default CCPWelcomeWalkthrough;
