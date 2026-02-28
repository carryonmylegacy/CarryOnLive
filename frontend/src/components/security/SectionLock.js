import React, { useState, createContext, useContext, useEffect, useCallback } from 'react';
import { Lock, Unlock, Shield, Eye, EyeOff, Mic, MicOff, KeyRound, CheckCircle2, AlertTriangle, Loader2, HelpCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LOCKABLE_SECTIONS = {
  sdv: { name: 'Secure Document Vault', abbr: 'SDV' },
  mm: { name: 'Milestone Messages', abbr: 'MM' },
  bm: { name: 'Beneficiary Management', abbr: 'BM' },
  iac: { name: 'Immediate Action Checklist', abbr: 'IAC' },
  dts: { name: 'Designated Trustee Services', abbr: 'DTS' },
  ega: { name: 'Estate Guardian AI', abbr: 'EGA' },
};

// Map page sectionIds to API section_ids
const SECTION_ID_MAP = {
  vault: 'sdv',
  messages: 'mm',
  beneficiaries: 'bm',
  checklist: 'iac',
  dts: 'dts',
  guardian: 'ega',
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
    toast.success(`${LOCKABLE_SECTIONS[sid]?.name} unlocked`);
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
  const { settings, isLocked, requestUnlock, resolveId } = useSectionLock();
  const sid = resolveId(sectionId);
  const sec = LOCKABLE_SECTIONS[sid];
  const s = settings[sid];
  if (!sec) return null;

  if (!s?.is_active) {
    return (
      <div className="rounded-xl p-4 mb-4 flex items-center justify-between gap-3" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }} data-testid={`lock-banner-${sectionId}`}>
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
    if (s.password_enabled) layers.push('Password');
    if (s.voice_enabled) layers.push('Voice');
    if (s.security_question_enabled) layers.push('Security Question');
    return (
      <div className="rounded-xl p-4 mb-4 flex items-center justify-between gap-3" style={{ background: 'rgba(240,82,82,0.06)', border: '1px solid rgba(240,82,82,0.12)' }} data-testid={`lock-banner-${sectionId}`}>
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 text-[var(--rd2)]" />
          <div>
            <div className="text-sm font-bold text-[var(--rd2)]">{sec.name} — Locked</div>
            <p className="text-xs text-[var(--t4)]">{layers.join(' + ')} verification required</p>
          </div>
        </div>
        <Button size="sm" onClick={() => requestUnlock(sectionId)} className="text-xs gold-button" data-testid={`unlock-${sectionId}`}>
          <KeyRound className="w-3 h-3 mr-1" /> Unlock
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-3 mb-4 flex items-center justify-between gap-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }} data-testid={`lock-banner-${sectionId}`}>
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-[var(--gn2)]" />
        <span className="text-xs font-bold text-[var(--gn2)]">Unlocked this session</span>
      </div>
      <Button size="sm" variant="outline" onClick={() => {
        const { lockAll } = ctx;
        if (lockAll) lockAll();
      }} className="text-xs border-[var(--b)] text-[var(--t4)] hover:text-[var(--rd2)] hover:border-[var(--rd2)]" data-testid={`relock-${sectionId}`}>
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

  return (
    <div className="relative" data-testid={`locked-overlay-${sectionId}`}>
      <div className="filter blur-sm pointer-events-none select-none opacity-30">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="glass-card p-8 text-center max-w-sm">
          <Lock className="w-12 h-12 mx-auto text-[var(--gold)] mb-4" />
          <h3 className="text-lg font-bold text-[var(--t)] mb-2">{sec?.name} is Locked</h3>
          <p className="text-sm text-[var(--t4)] mb-4">Verify your identity to access this content.</p>
          <Button className="gold-button" onClick={() => requestUnlock(sectionId)}>
            <KeyRound className="w-4 h-4 mr-2" /> Unlock Section
          </Button>
        </div>
      </div>
    </div>
  );
};

// === UNLOCK MODAL ===
const UnlockModal = ({ sectionId, settings: s, onClose, onUnlocked }) => {
  const sec = LOCKABLE_SECTIONS[sectionId];
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [recording, setRecording] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [step, setStep] = useState(0);

  // Determine which steps are needed
  const steps = [];
  if (s?.password_enabled) steps.push('password');
  if (s?.voice_enabled) steps.push('voice');
  if (s?.security_question_enabled) steps.push('question');

  const currentStep = steps[step] || 'done';

  const handleVoiceRecord = () => {
    if (recording) return;
    setRecording(true);
    setVoiceStatus('Recording...');

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        const chunks = [];
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunks, { type: 'audio/webm' });
          setVoiceBlob(blob);
          setVoiceStatus('Voice recorded. Ready to verify.');
          setRecording(false);
        };
        mediaRecorder.start();
        setTimeout(() => mediaRecorder.stop(), 4000);
      })
      .catch(() => {
        toast.error('Microphone access denied');
        setRecording(false);
        setVoiceStatus('');
      });
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const token = localStorage.getItem('carryon_token');
      const formData = new FormData();
      if (password) formData.append('password', password);
      if (securityAnswer) formData.append('security_answer', securityAnswer);
      if (voiceBlob) formData.append('voice_file', voiceBlob, 'voice.webm');

      await axios.post(`${API_URL}/security/verify/${sectionId}`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      onUnlocked();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Verification failed');
    }
    setVerifying(false);
  };

  const canProceed = () => {
    if (currentStep === 'password') return password.length >= 1;
    if (currentStep === 'voice') return voiceBlob !== null;
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="glass-card border-[var(--b2)] sm:max-w-md p-0 gap-0 !top-[5vh] !translate-y-0 max-h-[90vh] overflow-y-scroll" data-testid="unlock-modal">
        <div className="p-5 pb-3" style={{ background: 'linear-gradient(135deg, rgba(224,173,43,0.08), rgba(139,92,246,0.05))', borderBottom: '1px solid var(--b)' }}>
          <DialogHeader>
            <DialogTitle className="text-[var(--t)]">Unlock {sec?.name}</DialogTitle>
            <DialogDescription className="text-[var(--t4)]">
              Step {step + 1} of {steps.length}: {currentStep === 'password' ? 'Enter section password' : currentStep === 'voice' ? 'Voice verification' : 'Security question'}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Progress dots */}
        {steps.length > 1 && (
          <div className="flex gap-2 px-5 pt-3 justify-center">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${i < step ? 'bg-[var(--gn2)]' : i === step ? 'bg-[var(--gold)]' : 'bg-[var(--b)]'}`} />
                <span className="text-[10px] text-[var(--t5)] capitalize">{s === 'question' ? 'Q&A' : s}</span>
              </div>
            ))}
          </div>
        )}

        <div className="p-5">
          {/* Password Step */}
          {currentStep === 'password' && (
            <div className="space-y-4">
              <div className="relative">
                <Label className="text-[var(--t4)] text-xs">Section Password</Label>
                <Input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter section password"
                  className="input-field mt-1 pr-10"
                  onKeyDown={e => e.key === 'Enter' && canProceed() && handleNext()}
                  autoFocus
                  data-testid="unlock-password-input"
                />
                <button onClick={() => setShowPw(p => !p)} className="absolute right-3 top-8 text-[var(--t5)]">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Voice Step */}
          {currentStep === 'voice' && (
            <div className="space-y-4">
              {s?.voice_passphrase && (
                <div className="text-center text-xs text-[var(--t4)]">
                  Speak your passphrase: <span className="font-bold text-[var(--t)]">"{s.voice_passphrase}"</span>
                </div>
              )}
              <div className="text-center p-6 rounded-xl" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                {voiceBlob ? (
                  <>
                    <CheckCircle2 className="w-12 h-12 mx-auto text-[var(--gn2)] mb-3" />
                    <div className="text-sm font-bold text-[var(--gn2)]">Voice Recorded</div>
                    <button onClick={() => { setVoiceBlob(null); setVoiceStatus(''); }} className="text-xs text-[var(--bl3)] mt-2 font-bold">Re-Record</button>
                  </>
                ) : (
                  <>
                    <div
                      onClick={handleVoiceRecord}
                      className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center cursor-pointer transition-all"
                      style={{ background: recording ? 'rgba(240,82,82,0.2)' : 'rgba(59,123,247,0.12)', border: `3px solid ${recording ? 'var(--rd2)' : 'var(--bl3)'}` }}
                      data-testid="voice-record-btn"
                    >
                      {recording ? <Loader2 className="w-7 h-7 text-[var(--rd2)] animate-spin" /> : <Mic className="w-7 h-7 text-[var(--bl3)]" />}
                    </div>
                    <div className="text-sm font-bold text-[var(--t)]">{recording ? 'Recording... Speak Now' : 'Tap to Record'}</div>
                  </>
                )}
                {voiceStatus && !voiceBlob && <p className="text-xs text-[var(--t4)] mt-2">{voiceStatus}</p>}
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
                <Label className="text-[var(--t4)] text-xs">Your Answer</Label>
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
      </DialogContent>
    </Dialog>
  );
};
