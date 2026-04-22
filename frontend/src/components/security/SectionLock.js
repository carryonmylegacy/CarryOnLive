import React, { useState, createContext, useContext, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Unlock, Eye, EyeOff, KeyRound, CheckCircle2, Loader2, HelpCircle, Hash, Delete, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../../utils/toast';
import axios from 'axios';
import { API_URL } from '../../config';

const LOCKABLE_SECTIONS = {
  sdv: { name: 'Secure Document Vault', abbr: 'SDV' },
  mm: { name: 'Milestone Messages', abbr: 'MM' },
  bm: { name: 'Beneficiary Management', abbr: 'BM' },
  iac: { name: 'Immediate Action Checklist', abbr: 'IAC' },
  dts: { name: 'Designated Trustee Services', abbr: 'DTS' },
  ega: { name: 'Estate Guardian AI', abbr: 'EGA' },
  dav: { name: 'Digital Access Vault', abbr: 'DAV' },
};

// Map page sectionIds to API section_ids
const SECTION_ID_MAP = {
  vault: 'sdv',
  messages: 'mm',
  beneficiaries: 'bm',
  checklist: 'iac',
  dts: 'dts',
  guardian: 'ega',
  'digital-access': 'dav',
};

const SectionLockContext = createContext(null);

export const SectionLockProvider = ({ children }) => {
  const [settings, setSettings] = useState({});
  const [sessionUnlocked, setSessionUnlocked] = useState({});
  const [unlockModal, setUnlockModal] = useState(null);
  const [loading, setLoading] = useState(true);

  const getToken = () => localStorage.getItem('carryon_token');

  const fetchSettings = useCallback(async () => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    try {
      const res = await axios.get(`${API_URL}/security/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings(res.data);
    } catch (err) {
      // Not authenticated or no settings yet
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Auto-lock on page leave: re-lock sections when navigating away
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Lock sections with on_page_leave mode
        const newUnlocked = { ...sessionUnlocked };
        let changed = false;
        Object.entries(settings).forEach(([sid, s]) => {
          if (s.lock_mode === 'on_page_leave' && newUnlocked[sid]) {
            newUnlocked[sid] = false;
            changed = true;
          }
        });
        if (changed) setSessionUnlocked(newUnlocked);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [settings, sessionUnlocked]);

  const resolveId = (pageId) => SECTION_ID_MAP[pageId] || pageId;

  const isLocked = (pageId) => {
    const sid = resolveId(pageId);
    const s = settings[sid];
    if (!s?.is_active) return false;
    return !sessionUnlocked[sid];
  };

  const requestUnlock = (pageId, onSuccess) => {
    const sid = resolveId(pageId);
    setUnlockModal({ sectionId: sid, onSuccess });
  };

  const completeUnlock = (sid) => {
    setSessionUnlocked(prev => ({ ...prev, [sid]: true }));
    setUnlockModal(null);
  };

  // Lock on logout
  const lockAll = () => setSessionUnlocked({});

  return (
    <SectionLockContext.Provider value={{ settings, isLocked, requestUnlock, lockAll, fetchSettings, loading, LOCKABLE_SECTIONS, resolveId }}>
      {children}
      {unlockModal && (
        <UnlockModal
          sectionId={unlockModal.sectionId}
          settings={settings[unlockModal.sectionId]}
          onClose={() => setUnlockModal(null)}
          onUnlocked={() => {
            completeUnlock(unlockModal.sectionId);
            unlockModal.onSuccess?.();
          }}
        />
      )}
    </SectionLockContext.Provider>
  );
};

export const useSectionLock = () => {
  const ctx = useContext(SectionLockContext);
  if (!ctx) throw new Error('useSectionLock must be used within SectionLockProvider');
  return ctx;
};

// === LOCK BANNER ===
export const SectionLockBanner = ({ sectionId }) => {
  const ctx = useSectionLock();
  const { settings, isLocked, requestUnlock, resolveId } = ctx;
  const navigate = useNavigate();
  const sid = resolveId(sectionId);
  const sec = LOCKABLE_SECTIONS[sid];
  const s = settings[sid];
  if (!sec) return null;

  if (!s?.is_active) {
    return (
      <div
        className="rounded-xl p-4 mb-4 flex items-center justify-between gap-3 cursor-pointer transition-all hover:opacity-80 active:scale-[0.99]"
        style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}
        onClick={() => navigate('/security-settings')}
        data-testid={`lock-banner-${sectionId}`}
      >
        <div className="flex items-center gap-3">
          <Unlock className="w-5 h-5 text-[var(--pr2)]" />
          <div>
            <div className="text-sm font-bold text-[var(--pr2)]">Section Unlocked</div>
            <p className="text-xs text-[var(--t4)]">Set up security in Settings to protect {sec.name}</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLocked(sectionId)) {
    const layers = [];
    if (s.pin_enabled && s.has_pin) layers.push('PIN');
    if (s.password_enabled && s.has_password) layers.push('Password');
    if (s.security_question_enabled && s.has_security_question) layers.push('Security Question');
    const missingCount = 3 - layers.length;
    return (
      <div className="rounded-xl p-4 mb-4 flex items-center justify-between gap-3" style={{ background: 'rgba(240,82,82,0.06)', border: '1px solid rgba(240,82,82,0.12)' }} data-testid={`lock-banner-${sectionId}`}>
        <div
          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer active:opacity-70 transition-opacity"
          onClick={() => navigate(`/security-settings?section=${sid}`)}
          data-testid={`lock-banner-settings-${sectionId}`}
        >
          <Lock className="w-5 h-5 text-[var(--rd2)] flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-[var(--rd2)]">{sec.name} — Locked</div>
            <p className="text-xs text-[var(--t4)]">{layers.join(' + ')} verification required</p>
            {missingCount > 0 && (
              <p className="text-[11px] text-[var(--pr2)] mt-0.5">Tap to add {missingCount} more security layer{missingCount > 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
        <Button size="sm" onClick={() => requestUnlock(sectionId)} className="text-xs gold-button flex-shrink-0" data-testid={`unlock-${sectionId}`}>
          <KeyRound className="w-3 h-3 mr-1" /> Unlock
        </Button>
      </div>
    );
  }

  // Unlocked this session
  const activeLayers = [];
  if (s.pin_enabled && s.has_pin) activeLayers.push('PIN');
  if (s.password_enabled && s.has_password) activeLayers.push('Password');
  if (s.security_question_enabled && s.has_security_question) activeLayers.push('Q&A');
  const missingLayers = 3 - activeLayers.length;

  return (
    <div className="rounded-xl p-3 mb-4 flex items-center justify-between gap-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }} data-testid={`lock-banner-${sectionId}`}>
      <div
        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer active:opacity-70 transition-opacity"
        onClick={() => navigate(`/security-settings?section=${sid}`)}
        data-testid={`lock-banner-settings-${sectionId}`}
      >
        <CheckCircle2 className="w-4 h-4 text-[var(--gn2)] flex-shrink-0" />
        <div className="min-w-0">
          <span className="text-xs font-bold text-[var(--gn2)]">Unlocked this session</span>
          {missingLayers > 0 && (
            <p className="text-[11px] text-[var(--pr2)]">Tap to add {missingLayers} more layer{missingLayers > 1 ? 's' : ''}</p>
          )}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={() => {
        const { lockAll } = ctx;
        if (lockAll) lockAll();
      }} className="text-xs border-[var(--b)] text-[var(--t4)] hover:text-[var(--rd2)] hover:border-[var(--rd2)] flex-shrink-0" data-testid={`relock-${sectionId}`}>
        <Lock className="w-3 h-3 mr-1" /> Re-Lock
      </Button>
    </div>
  );
};

// === LOCKED OVERLAY ===
export const SectionLockedOverlay = ({ sectionId, children }) => {
  const { isLocked, requestUnlock } = useSectionLock();
  const sid = SECTION_ID_MAP[sectionId] || sectionId;
  const sec = LOCKABLE_SECTIONS[sid];

  if (!isLocked(sectionId)) return children;

  // When locked, do NOT render children at all — content is completely hidden
  return (
    <div className="flex items-center justify-center py-24" data-testid={`locked-overlay-${sectionId}`}>
      <div className="glass-card p-10 text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.1)', border: '2px solid rgba(212,175,55,0.2)' }}>
          <Lock className="w-10 h-10 text-[var(--gold)]" />
        </div>
        <h3 className="text-xl font-bold text-[var(--t)] mb-2">{sec?.name} is Locked</h3>
        <p className="text-sm text-[var(--t4)] mb-6">This section is protected. Verify your identity to view its contents.</p>
        <Button className="gold-button px-8" onClick={() => requestUnlock(sectionId)} data-testid={`unlock-overlay-${sectionId}`}>
          <KeyRound className="w-4 h-4 mr-2" /> Unlock Section
        </Button>
      </div>
    </div>
  );
};

// === UNLOCK MODAL ===
const UnlockModal = ({ sectionId, settings: s, onClose, onUnlocked }) => {
  const sec = LOCKABLE_SECTIONS[sectionId];
  const [pinDigits, setPinDigits] = useState('');
  const [pinError, setPinError] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [step, setStep] = useState(0);

  // Determine which steps are needed — only include layers that are BOTH enabled AND configured
  const steps = [];
  if (s?.pin_enabled && s?.has_pin) steps.push('pin');
  if (s?.password_enabled && s?.has_password) steps.push('password');
  if (s?.security_question_enabled && s?.has_security_question) steps.push('question');

  const currentStep = steps[step] || 'done';

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const token = localStorage.getItem('carryon_token');
      const formData = new FormData();
      if (pinDigits) formData.append('pin', pinDigits);
      if (password) formData.append('password', password);
      if (securityAnswer) formData.append('security_answer', securityAnswer);

      await axios.post(`${API_URL}/security/verify/${sectionId}`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      onUnlocked();
    } catch (err) {
      const detail = err.response?.data?.detail || 'Verification failed';
      toast.error(detail);
      // If PIN failed, reset PIN
      if (detail.toLowerCase().includes('pin')) {
        setPinDigits('');
        setPinError('Incorrect PIN');
      }
    }
    setVerifying(false);
  };

  const canProceed = () => {
    if (currentStep === 'pin') return pinDigits.length >= 4;
    if (currentStep === 'password') return password.length >= 1;
    if (currentStep === 'question') return securityAnswer.length >= 1;
    return false;
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleVerify();
    }
  };

  const handlePinDigit = (digit) => {
    setPinError('');
    if (pinDigits.length < 8) {
      setPinDigits(prev => prev + digit);
    }
  };
  const handlePinBackspace = () => {
    setPinError('');
    setPinDigits(prev => prev.slice(0, -1));
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        className="w-[calc(100%-2rem)] max-w-sm flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg)', border: '1px solid var(--b)', maxHeight: 'calc(100dvh - 6rem)' }}
        onClick={e => e.stopPropagation()}
        data-testid="unlock-modal"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 relative" style={{ background: 'linear-gradient(135deg, rgba(224,173,43,0.08), rgba(139,92,246,0.05))' }}>
          <button onClick={onClose} className="absolute top-3 right-3 text-[var(--t5)] hover:text-[var(--t)] p-2" data-testid="unlock-modal-close">
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-base font-bold text-[var(--t)]">Unlock {sec?.name}</h3>
          <p className="text-xs text-[var(--t4)] mt-1">
            Step {step + 1} of {steps.length}: {currentStep === 'pin' ? 'Enter your PIN' : currentStep === 'password' ? 'Enter section password' : 'Security question'}
          </p>
        </div>

        {/* Progress dots */}
        {steps.length > 1 && (
          <div className="flex gap-2 px-5 pt-3 justify-center">
            {steps.map((st, i) => (
              <div key={st} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${i < step ? 'bg-[var(--gn2)]' : i === step ? 'bg-[var(--gold)]' : 'bg-[var(--b)]'}`} />
                <span className="text-[11px] text-[var(--t5)] capitalize">{st === 'question' ? 'Q&A' : st === 'pin' ? 'PIN' : st}</span>
              </div>
            ))}
          </div>
        )}

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* PIN Step */}
          {currentStep === 'pin' && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <Lock className="w-7 h-7 text-[var(--gold)] mx-auto mb-2" />
                <p className="text-xs text-[var(--t5)]">Enter your 4-8 digit PIN</p>
              </div>

              {/* PIN Dots — show up to 8 */}
              <div className="flex justify-center gap-2" data-testid="unlock-pin-dots">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-all"
                    style={{
                      background: i < pinDigits.length ? 'rgba(212,175,55,0.15)' : 'var(--s)',
                      border: `2px solid ${i < pinDigits.length ? 'var(--gold)' : pinError ? '#EF4444' : 'var(--b)'}`,
                      color: 'var(--t)',
                      opacity: i < pinDigits.length ? 1 : 0.4,
                    }}>
                    {i < pinDigits.length ? '\u2022' : ''}
                  </div>
                ))}
              </div>

              {pinError && <p className="text-xs text-red-400 text-center" data-testid="unlock-pin-error">{pinError}</p>}

              {/* Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto" data-testid="unlock-pin-keypad">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <button key={n} onClick={() => handlePinDigit(String(n))}
                    className="py-3 rounded-xl text-lg font-bold text-[var(--t)] transition-all active:scale-95"
                    style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                    disabled={pinDigits.length >= 8}
                    data-testid={`unlock-pin-key-${n}`}>
                    {n}
                  </button>
                ))}
                <div />
                <button onClick={() => handlePinDigit('0')}
                  className="py-3 rounded-xl text-lg font-bold text-[var(--t)] transition-all active:scale-95"
                  style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                  disabled={pinDigits.length >= 8}
                  data-testid="unlock-pin-key-0">
                  0
                </button>
                <button onClick={handlePinBackspace}
                  className="py-3 rounded-xl text-sm font-bold text-[var(--t5)] transition-all active:scale-95"
                  style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                  data-testid="unlock-pin-key-back">
                  <Delete className="w-5 h-5 mx-auto" />
                </button>
              </div>
            </div>
          )}

          {/* Password Step */}
          {currentStep === 'password' && (
            <div className="space-y-4">
              <Label className="text-[var(--t4)] text-xs">Section Password <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter section password"
                  className="input-field pr-10"
                  onKeyDown={e => e.key === 'Enter' && canProceed() && handleNext()}
                  autoFocus
                  data-testid="unlock-password-input"
                />
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]" data-testid="unlock-pw-eye">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Security Question Step */}
          {currentStep === 'question' && (
            <div className="space-y-4">
              <div className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                <div className="flex items-start gap-2">
                  <HelpCircle className="w-4 h-4 text-[var(--gold)] mt-0.5 flex-shrink-0" />
                  <div className="text-sm font-bold text-[var(--t)]">{s?.security_question}</div>
                </div>
              </div>
              <div>
                <Label className="text-[var(--t4)] text-xs">Your Answer <span className="text-red-400">*</span></Label>
                <Input
                  value={securityAnswer}
                  onChange={e => setSecurityAnswer(e.target.value)}
                  placeholder="Enter your answer"
                  className="input-field mt-1"
                  onKeyDown={e => e.key === 'Enter' && canProceed() && handleNext()}
                  autoFocus
                  data-testid="unlock-security-answer"
                />
              </div>
            </div>
          )}

          {/* Submit Button — always shown now (no auto-submit voice step) */}
          <Button
            className="w-full mt-4 gold-button"
            disabled={!canProceed() || verifying}
            onClick={handleNext}
            data-testid="unlock-verify-btn"
          >
            {verifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {step < steps.length - 1 ? 'Continue' : 'Verify & Unlock'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
