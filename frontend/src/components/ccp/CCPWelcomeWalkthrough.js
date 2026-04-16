import React from 'react';
import {
  Shield, FileText, AlertTriangle, UserCheck, Play, Zap, MapPin, Clock,
  ArrowRight, ArrowLeft, Check,
} from 'lucide-react';

/**
 * CCPWelcomeWalkthrough — 3-step intro overlay for first-visit CCP users.
 * Extracted from ConnectedProtocolPage. Pure prop-passthrough, zero logic changes.
 */
const CCPWelcomeWalkthrough = ({ welcomeStep, setWelcomeStep, onDismiss }) => {
  const dismiss = () => {
    onDismiss();
    localStorage.setItem('carryon_ccp_intro_seen', '1');
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center overflow-y-auto" data-testid="ccp-welcome-overlay"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)', paddingLeft: '14px', paddingRight: '14px', paddingTop: 'calc(64px + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(84px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="w-full max-w-md rounded-2xl px-3.5 py-2.5 my-auto flex-shrink-0" style={{ background: 'var(--bg2)', border: '1px solid rgba(212,175,55,0.3)', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2.5 mb-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={`w-2 h-2 rounded-full transition-all duration-300 ${
              welcomeStep === s ? 'bg-[#d4af37] scale-125' : welcomeStep > s ? 'bg-[#22C993]' : 'bg-white/10'
            }`} />
          ))}
        </div>

        {/* Step 1: What is CCP? */}
        {welcomeStep === 1 && (
          <div className="text-center" data-testid="ccp-welcome-step-1">
            <Shield className="w-8 h-8 mx-auto mb-1.5" style={{ color: '#d4af37' }} />
            <h2 className="text-base font-bold mb-1" style={{ color: 'var(--t)', fontFamily: 'Outfit, sans-serif' }}>
              Welcome to CarryOn Contingency Protocols
            </h2>
            <p className="text-xs mb-2 leading-snug" style={{ color: 'var(--t4)' }}>
              This is where your family creates emergency plans — for hurricanes, medical emergencies, power outages, or any situation where everyone needs to know what to do.
            </p>
            <div className="space-y-1 text-left mb-2">
              {[
                { icon: FileText, title: 'Create Emergency Plans', desc: 'Set up rendezvous points, communication steps, and supply locations.' },
                { icon: UserCheck, title: 'Check In During Emergencies', desc: 'Everyone marks themselves safe so the family knows who needs help.' },
                { icon: Play, title: 'Practice with Drills', desc: 'Run practice drills so everyone knows what to do before a real emergency.' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                  <item.icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#d4af37' }} />
                  <div>
                    <span className="text-xs font-bold leading-snug" style={{ color: 'var(--t)' }}>{item.title}</span>
                    <span className="text-xs leading-snug" style={{ color: 'var(--t4)' }}> — {item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setWelcomeStep(2)}
              className="w-full py-2 rounded-xl text-sm font-bold transition-all active:scale-[0.97] whitespace-nowrap"
              data-testid="ccp-welcome-next-1"
              style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}>
              Next — How to Create a Plan <ArrowRight className="w-4 h-4 inline ml-1" />
            </button>
          </div>
        )}

        {/* Step 2: How to create a plan */}
        {welcomeStep === 2 && (
          <div className="text-center" data-testid="ccp-welcome-step-2">
            <FileText className="w-8 h-8 mx-auto mb-1.5" style={{ color: '#d4af37' }} />
            <h2 className="text-base font-bold mb-1" style={{ color: 'var(--t)', fontFamily: 'Outfit, sans-serif' }}>
              Creating Your First Plan
            </h2>
            <p className="text-xs mb-2 leading-snug" style={{ color: 'var(--t4)' }}>
              It only takes a few minutes. Here's what you'll do:
            </p>
            <div className="space-y-1 text-left mb-2">
              {[
                { num: '1', title: 'Give it a name', desc: 'Something like "Hurricane Plan" or "Fire Evacuation"' },
                { num: '2', title: 'Add meeting points', desc: 'Where should the family meet? (e.g., Grandma\'s house, the park)' },
                { num: '3', title: 'Write a communication plan', desc: 'How will everyone stay in touch? (e.g., text first, then call)' },
                { num: '4', title: 'Add instructions', desc: 'Any special steps like grabbing the go-bag or turning off the gas' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>
                    {item.num}
                  </div>
                  <div>
                    <span className="text-xs font-bold leading-snug" style={{ color: 'var(--t)' }}>{item.title}</span>
                    <span className="text-xs leading-snug" style={{ color: 'var(--t4)' }}> — {item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setWelcomeStep(1)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
                data-testid="ccp-welcome-back-2"
                style={{ background: 'var(--s)', color: 'var(--t4)' }}>
                <ArrowLeft className="w-3.5 h-3.5 inline mr-1" /> Back
              </button>
              <button onClick={() => setWelcomeStep(3)}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-[0.97] whitespace-nowrap"
                data-testid="ccp-welcome-next-2"
                style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}>
                Next — During Emergencies <ArrowRight className="w-4 h-4 inline ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: During an emergency */}
        {welcomeStep === 3 && (
          <div className="text-center" data-testid="ccp-welcome-step-3">
            <AlertTriangle className="w-8 h-8 mx-auto mb-1.5" style={{ color: '#F05252' }} />
            <h2 className="text-base font-bold mb-1" style={{ color: 'var(--t)', fontFamily: 'Outfit, sans-serif' }}>
              When an Emergency Happens
            </h2>
            <p className="text-xs mb-2 leading-snug" style={{ color: 'var(--t4)' }}>
              When something happens, the estate owner activates the plan. Then everyone in the family does this:
            </p>
            <div className="space-y-1 text-left mb-2">
              {[
                { icon: Zap, color: '#F05252', title: 'Plan Gets Activated', desc: 'Everyone gets notified immediately with the plan details.' },
                { icon: UserCheck, color: '#22C993', title: 'Check In as Safe', desc: 'Tap the big green CHECK IN button and pick your status.' },
                { icon: MapPin, color: '#3B7BF7', title: 'Share Your Location', desc: 'Optionally share where you are so family can find you.' },
                { icon: Clock, color: 'var(--t4)', title: 'Stand Down', desc: 'When it\'s over, the owner deactivates the plan and a report is saved.' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                  <item.icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: item.color }} />
                  <div>
                    <span className="text-xs font-bold leading-snug" style={{ color: 'var(--t)' }}>{item.title}</span>
                    <span className="text-xs leading-snug" style={{ color: 'var(--t4)' }}> — {item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setWelcomeStep(2)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
                data-testid="ccp-welcome-back-3"
                style={{ background: 'var(--s)', color: 'var(--t4)' }}>
                <ArrowLeft className="w-3.5 h-3.5 inline mr-1" /> Back
              </button>
              <button onClick={dismiss}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-[0.97] whitespace-nowrap"
                data-testid="ccp-welcome-dismiss"
                style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}>
                <Check className="w-4 h-4 inline mr-1" /> Got It — Let's Start
              </button>
            </div>
          </div>
        )}

        {/* Skip link */}
        <button onClick={dismiss}
          className="w-full py-1 mt-1.5 text-[11px] font-medium transition-all active:scale-[0.97]"
          data-testid="ccp-welcome-skip"
          style={{ color: 'var(--t5)', background: 'transparent' }}>
          Skip — I'll figure it out on my own
        </button>
      </div>
    </div>
  );
};

export default CCPWelcomeWalkthrough;
