import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, CheckCircle2, Lock, Shield, Users, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';

const CondolencePage = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState(0);
  // Phases: 0=condolence, 1-5=verification steps

  const phases = [
    { label: 'Verifying Death Certificate', desc: 'Our Transition Verification Team is reviewing the authenticity of the submitted document.' },
    { label: 'Certificate Authenticated', desc: 'The death certificate has been verified as authentic.' },
    { label: 'Sealing Benefactor Account', desc: "The benefactor's account is being immutably sealed. No further changes can be made." },
    { label: 'Granting Beneficiary Access', desc: 'Configuring your access to vault documents, action checklist, Estate Guardian, and milestone messages.' },
    { label: 'Transition Complete', desc: 'Access has been granted. You may now enter the platform.' },
  ];

  useEffect(() => {
    if (phase === 0) {
      const t = setTimeout(() => setPhase(1), 3000);
      return () => clearTimeout(t);
    }
    if (phase > 0 && phase < 6) {
      const t = setTimeout(() => setPhase(p => p + 1), 2500);
      return () => clearTimeout(t);
    }
  }, [phase]);

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ background: 'linear-gradient(145deg, #0B1120, #0F1629 40%, #0A1628)' }} data-testid="condolence-page">
      <div className="w-full max-w-lg text-center">
        {/* Condolence Message (phase 0) */}
        {phase === 0 ? (
          <>
            <img src="/carryon-app-logo.png" alt="CarryOn™" className="w-40 mx-auto mb-7" onError={(e) => { e.target.style.display = 'none'; }} />
            <div className="w-18 h-18 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ width: 72, height: 72, background: 'rgba(139,92,246,0.08)' }}>
              <Heart className="w-8 h-8 text-[#A78BFA]" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-[var(--t)] mb-4 leading-tight">
              Our Sincerest Condolences
            </h1>
            <p className="text-base text-[var(--t2)] leading-relaxed mb-3 max-w-md mx-auto">
              We are deeply sorry for your loss.
            </p>
            <p className="text-sm text-[var(--t3)] leading-relaxed mb-3 max-w-md mx-auto">
              Your benefactor entrusted CarryOn™ with their legacy because they wanted to make this time as manageable as possible for you and your family.
            </p>
            <p className="text-sm text-[var(--t4)] leading-relaxed mb-8 max-w-md mx-auto">
              We are now processing your submission. This may take a moment.
            </p>
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[var(--t5)] animate-bounce" style={{ animationDelay: '0s' }} />
              <div className="w-2 h-2 rounded-full bg-[var(--t5)] animate-bounce" style={{ animationDelay: '0.15s' }} />
              <div className="w-2 h-2 rounded-full bg-[var(--t5)] animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
          </>
        ) : (
          <>
            <img src="/carryon-app-logo.png" alt="CarryOn™" className="w-36 mx-auto mb-6" onError={(e) => { e.target.style.display = 'none'; }} />
            <h1 className="text-2xl font-bold text-[var(--t)] mb-2">Transition Verification</h1>
            <p className="text-sm text-[var(--t4)] mb-8">Processing your request for access</p>

            {/* Progress Tracker */}
            <div className="rounded-2xl p-7 text-left" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              {phases.map((p, i) => {
                const stepNum = i + 1;
                const done = phase > stepNum;
                const active = phase === stepNum;
                return (
                  <div key={i} className="flex gap-4 relative" style={{ marginBottom: i < 4 ? 20 : 0 }}>
                    {/* Connector line */}
                    {i < 4 && (
                      <div className="absolute left-4 top-8 w-0.5 transition-all duration-700" style={{
                        height: 'calc(100% - 8px)',
                        background: done ? 'var(--gn)' : active ? 'linear-gradient(to bottom, var(--bl), var(--b))' : 'var(--b)',
                      }} />
                    )}
                    {/* Status circle */}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition-all duration-500" style={{
                      background: done ? 'var(--gnbg)' : active ? 'var(--blbg)' : 'var(--s)',
                      border: `2px solid ${done ? 'var(--gn)' : active ? 'var(--bl3)' : 'var(--b)'}`,
                    }}>
                      {done ? <CheckCircle2 className="w-4 h-4 text-[var(--gn2)]" /> :
                       active ? <div className="w-2 h-2 rounded-full bg-[var(--bl3)] animate-pulse" /> :
                       <div className="w-1.5 h-1.5 rounded-full bg-[var(--b)]" />}
                    </div>
                    {/* Label */}
                    <div className="pt-1">
                      <div className="text-sm font-bold transition-colors duration-500" style={{
                        color: done ? 'var(--gn2)' : active ? 'var(--bl4, #7AABFD)' : 'var(--t5)',
                      }}>
                        {p.label}
                      </div>
                      {(done || active) && (
                        <div className="text-xs mt-1 leading-relaxed" style={{ color: done ? 'var(--t4)' : 'var(--t3)' }}>
                          {p.desc}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Enter button */}
            {phase >= 6 && (
              <Button
                className="w-full mt-7 py-4 text-base font-bold"
                style={{ background: 'linear-gradient(135deg, #3B7BF7, #2B6AE6)', color: 'white', borderRadius: 14 }}
                onClick={() => navigate('/beneficiary/dashboard')}
                data-testid="enter-platform-btn"
              >
                Enter Platform
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CondolencePage;
