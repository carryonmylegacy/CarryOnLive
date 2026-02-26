import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { Heart, CheckCircle2, Clock, Shield, Loader2, Eye, Lock, Users } from 'lucide-react';
import { Button } from '../../components/ui/button';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STEPS = [
  { key: 'submitted', label: 'Certificate Submitted', desc: 'Your death certificate has been securely uploaded and is waiting for a Transition Verification Team member.' },
  { key: 'reviewing', label: 'Under Review', desc: 'A Transition Verification Team member has opened your submission and is actively reviewing the document.' },
  { key: 'authenticated', label: 'Certificate Authenticated', desc: 'The death certificate has been verified as authentic by the Transition Verification Team.' },
  { key: 'sealing', label: 'Benefactor Account Sealed', desc: "The benefactor's account has been immutably sealed. No further changes can be made to any estate content." },
  { key: 'approved', label: 'Beneficiary Access Granted', desc: 'Your access to the vault, action checklist, milestone messages, and Estate Guardian has been configured and unlocked.' },
];

const CondolencePage = () => {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('pending');
  const [showCondolence, setShowCondolence] = useState(true);
  const pollRef = useRef(null);

  const estateId = localStorage.getItem('beneficiary_estate_id');

  // Show condolence message for 5 seconds, then show tracker
  useEffect(() => {
    const t = setTimeout(() => setShowCondolence(false), 5000);
    return () => clearTimeout(t);
  }, []);

  // Poll transition status every 4 seconds
  useEffect(() => {
    const poll = async () => {
      if (!estateId) return;
      try {
        const res = await axios.get(`${API_URL}/transition/status/${estateId}`, getAuthHeaders());
        const cert = res.data.certificate;
        const estateStatus = res.data.estate_status;

        if (cert) {
          setStatus(cert.status);
        }
        // If estate is transitioned and cert is approved, we're done
        if (estateStatus === 'transitioned' && cert?.status === 'approved') {
          setStatus('approved');
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    };

    poll(); // Initial fetch
    pollRef.current = setInterval(poll, 4000);
    return () => clearInterval(pollRef.current);
  }, [estateId]);

  const getStepState = (stepKey) => {
    const order = ['pending', 'submitted', 'reviewing', 'authenticated', 'sealing', 'approved'];
    const currentIdx = order.indexOf(status);
    const stepIdx = order.indexOf(stepKey);
    // pending maps to submitted (step 0)
    const effectiveIdx = currentIdx <= 1 ? 1 : currentIdx;
    if (stepIdx < effectiveIdx) return 'done';
    if (stepIdx === effectiveIdx) return 'active';
    return 'pending';
  };

  const isComplete = status === 'approved';

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ background: 'linear-gradient(145deg, #0B1120, #0F1629 40%, #0A1628)' }} data-testid="condolence-page">
      <div className="w-full max-w-lg text-center">
        {/* Condolence Message */}
        {showCondolence ? (
          <>
            <img src="/carryon-app-logo.png" alt="CarryOn" className="w-40 mx-auto mb-7" onError={(e) => { e.target.style.display = 'none'; }} />
            <div className="mx-auto mb-6 flex items-center justify-center" style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(139,92,246,0.08)' }}>
              <Heart className="w-8 h-8 text-[#A78BFA]" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-[var(--t)] mb-4 leading-tight">
              Our Sincerest Condolences
            </h1>
            <p className="text-base text-[var(--t2)] leading-relaxed mb-3 max-w-md mx-auto">
              We are deeply sorry for your loss.
            </p>
            <p className="text-sm text-[var(--t3)] leading-relaxed mb-3 max-w-md mx-auto">
              Your benefactor entrusted CarryOn with their legacy because they wanted to make this time as manageable as possible for you and your family.
            </p>
            <p className="text-sm text-[var(--t4)] leading-relaxed mb-8 max-w-md mx-auto">
              Your submission has been received. A member of our Transition Verification Team will review it shortly.
            </p>
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[var(--t5)] animate-bounce" style={{ animationDelay: '0s' }} />
              <div className="w-2 h-2 rounded-full bg-[var(--t5)] animate-bounce" style={{ animationDelay: '0.15s' }} />
              <div className="w-2 h-2 rounded-full bg-[var(--t5)] animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
          </>
        ) : (
          <>
            <img src="/carryon-app-logo.png" alt="CarryOn" className="w-36 mx-auto mb-6" onError={(e) => { e.target.style.display = 'none'; }} />
            <h1 className="text-2xl font-bold text-[var(--t)] mb-1">Transition Verification</h1>
            <p className="text-sm text-[var(--t4)] mb-2">Real-time status of your submission</p>
            
            {/* Live indicator */}
            {!isComplete && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <div className="w-2 h-2 rounded-full bg-[var(--gn2)] animate-pulse" />
                <span className="text-xs font-bold text-[var(--gn2)]">LIVE</span>
              </div>
            )}

            {/* Progress Tracker */}
            <div className="rounded-2xl p-7 text-left" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              {STEPS.map((step, i) => {
                const state = getStepState(step.key);
                return (
                  <div key={step.key} className="flex gap-4 relative" style={{ marginBottom: i < STEPS.length - 1 ? 20 : 0 }}>
                    {/* Connector line */}
                    {i < STEPS.length - 1 && (
                      <div className="absolute left-4 top-8 w-0.5" style={{
                        height: 'calc(100% - 8px)',
                        background: state === 'done' ? 'var(--gn)' : state === 'active' ? 'linear-gradient(to bottom, var(--bl), var(--b))' : 'var(--b)',
                        transition: 'background 1s ease',
                      }} />
                    )}
                    {/* Status circle */}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10" style={{
                      background: state === 'done' ? 'var(--gnbg)' : state === 'active' ? 'var(--blbg)' : 'var(--s)',
                      border: `2px solid ${state === 'done' ? 'var(--gn)' : state === 'active' ? 'var(--bl3)' : 'var(--b)'}`,
                      transition: 'all 1s ease',
                    }}>
                      {state === 'done' ? <CheckCircle2 className="w-4 h-4 text-[var(--gn2)]" /> :
                       state === 'active' ? <Loader2 className="w-4 h-4 text-[var(--bl3)] animate-spin" /> :
                       <div className="w-1.5 h-1.5 rounded-full bg-[var(--b)]" />}
                    </div>
                    {/* Label */}
                    <div className="pt-1">
                      <div className="text-sm font-bold" style={{
                        color: state === 'done' ? 'var(--gn2)' : state === 'active' ? '#7AABFD' : 'var(--t5)',
                        transition: 'color 1s ease',
                      }}>
                        {step.label}
                      </div>
                      {(state === 'done' || state === 'active') && (
                        <div className="text-xs mt-1 leading-relaxed" style={{ color: state === 'done' ? 'var(--t4)' : 'var(--t3)' }}>
                          {step.desc}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Waiting message or Enter button */}
            {isComplete ? (
              <Button
                className="w-full mt-7 py-4 text-base font-bold"
                style={{ background: 'linear-gradient(135deg, #3B7BF7, #2B6AE6)', color: 'white', borderRadius: 14 }}
                onClick={() => navigate('/beneficiary/dashboard')}
                data-testid="enter-platform-btn"
              >
                Enter Platform
              </Button>
            ) : (
              <div className="mt-6 text-sm text-[var(--t4)] leading-relaxed">
                <p>This page updates automatically. You can close it and return later — your submission will continue processing.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CondolencePage;
