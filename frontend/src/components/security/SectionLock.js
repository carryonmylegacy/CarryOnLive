import React, { useState, createContext, useContext, useEffect } from 'react';
import { Lock, Unlock, Shield, Eye, EyeOff, Mic, MicOff, KeyRound, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { toast } from 'sonner';

// Lockable sections config
const LOCKABLE_SECTIONS = {
  vault: { name: 'Secure Document Vault', abbr: 'SDV' },
  checklist: { name: 'Immediate Action Checklist', abbr: 'IAC' },
  messages: { name: 'Milestone Messages', abbr: 'MM' },
  dts: { name: 'Designated Trustee Services', abbr: 'DTS' },
  beneficiaries: { name: 'Beneficiaries', abbr: 'BEN' },
};

const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'What street did you grow up on?',
  "What was your mother's maiden name?",
  'What was the first concert you attended?',
  'What is the name of your favorite teacher?',
  'What was the make of your first car?',
];

// Context for lock state
const SectionLockContext = createContext(null);

export const SectionLockProvider = ({ children }) => {
  const [locks, setLocks] = useState(() => {
    try {
      const saved = localStorage.getItem('carryon_section_locks');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    const init = {};
    Object.keys(LOCKABLE_SECTIONS).forEach(k => {
      init[k] = { locked: false, setupDone: false, pw: null, voice: null, backup: null };
    });
    return init;
  });

  const [setupModal, setSetupModal] = useState(null); // sectionId
  const [unlockModal, setUnlockModal] = useState(null); // { sectionId, onSuccess }
  const [sessionUnlocked, setSessionUnlocked] = useState({}); // sections unlocked this session

  useEffect(() => {
    localStorage.setItem('carryon_section_locks', JSON.stringify(locks));
  }, [locks]);

  const setupLock = (sectionId) => setSetupModal(sectionId);
  const requestUnlock = (sectionId, onSuccess) => setUnlockModal({ sectionId, onSuccess });

  const completeLockSetup = (sectionId, config) => {
    setLocks(prev => ({ ...prev, [sectionId]: { locked: true, setupDone: true, ...config } }));
    setSetupModal(null);
    toast.success(`${LOCKABLE_SECTIONS[sectionId]?.name} locked successfully`);
  };

  const completeUnlock = (sectionId) => {
    setSessionUnlocked(prev => ({ ...prev, [sectionId]: true }));
    setUnlockModal(null);
    toast.success(`${LOCKABLE_SECTIONS[sectionId]?.name} unlocked`);
  };

  const removeLock = (sectionId) => {
    setLocks(prev => ({ ...prev, [sectionId]: { locked: false, setupDone: false, pw: null, voice: null, backup: null } }));
    setSessionUnlocked(prev => ({ ...prev, [sectionId]: false }));
    toast.success('Section lock removed');
  };

  const isLocked = (sectionId) => {
    const lock = locks[sectionId];
    if (!lock?.locked) return false;
    return !sessionUnlocked[sectionId];
  };

  return (
    <SectionLockContext.Provider value={{ locks, isLocked, setupLock, requestUnlock, removeLock, LOCKABLE_SECTIONS }}>
      {children}
      {setupModal && (
        <LockSetupModal
          sectionId={setupModal}
          onClose={() => setSetupModal(null)}
          onComplete={completeLockSetup}
        />
      )}
      {unlockModal && (
        <UnlockModal
          sectionId={unlockModal.sectionId}
          lockState={locks}
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

// === LOCK BANNER — shows at top of lockable sections ===
export const SectionLockBanner = ({ sectionId }) => {
  const { locks, isLocked, setupLock, requestUnlock, removeLock } = useSectionLock();
  const sec = LOCKABLE_SECTIONS[sectionId];
  if (!sec) return null;
  const lock = locks[sectionId];

  if (!lock?.setupDone) {
    // Not set up yet — show setup prompt
    return (
      <div className="rounded-xl p-4 mb-4 flex items-center justify-between gap-3" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }} data-testid={`lock-banner-${sectionId}`}>
        <div className="flex items-center gap-3">
          <Unlock className="w-5 h-5 text-[var(--pr2)]" />
          <div>
            <div className="text-sm font-bold text-[var(--pr2)]">Section Unlocked</div>
            <p className="text-xs text-[var(--t4)]">Set up dual-password protection for {sec.name}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setupLock(sectionId)} className="text-xs" style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', color: 'white' }} data-testid={`setup-lock-${sectionId}`}>
          <Lock className="w-3 h-3 mr-1" /> Lock Section
        </Button>
      </div>
    );
  }

  if (isLocked(sectionId)) {
    // Locked — show unlock button
    return (
      <div className="rounded-xl p-4 mb-4 flex items-center justify-between gap-3" style={{ background: 'rgba(240,82,82,0.06)', border: '1px solid rgba(240,82,82,0.12)' }} data-testid={`lock-banner-${sectionId}`}>
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 text-[var(--rd2)]" />
          <div>
            <div className="text-sm font-bold text-[var(--rd2)]">{sec.name} — Locked</div>
            <p className="text-xs text-[var(--t4)]">Enter your section password and voice passphrase to unlock</p>
          </div>
        </div>
        <Button size="sm" onClick={() => requestUnlock(sectionId)} className="text-xs gold-button" data-testid={`unlock-${sectionId}`}>
          <KeyRound className="w-3 h-3 mr-1" /> Unlock
        </Button>
      </div>
    );
  }

  // Unlocked this session
  return (
    <div className="rounded-xl p-3 mb-4 flex items-center justify-between gap-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }} data-testid={`lock-banner-${sectionId}`}>
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-[var(--gn2)]" />
        <span className="text-xs font-bold text-[var(--gn2)]">Unlocked for this session</span>
      </div>
      <button onClick={() => removeLock(sectionId)} className="text-xs text-[var(--t5)] hover:text-[var(--rd2)]">Remove lock</button>
    </div>
  );
};

// === LOCKED OVERLAY — covers content when section is locked ===
export const SectionLockedOverlay = ({ sectionId, children }) => {
  const { isLocked, requestUnlock } = useSectionLock();
  const sec = LOCKABLE_SECTIONS[sectionId];

  if (!isLocked(sectionId)) return children;

  return (
    <div className="relative" data-testid={`locked-overlay-${sectionId}`}>
      <div className="filter blur-sm pointer-events-none select-none opacity-30">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="glass-card p-8 text-center max-w-sm">
          <Lock className="w-12 h-12 mx-auto text-[var(--gold)] mb-4" />
          <h3 className="text-lg font-bold text-[var(--t)] mb-2">{sec?.name} is Locked</h3>
          <p className="text-sm text-[var(--t4)] mb-4">Enter your section password and voice passphrase to access this content.</p>
          <Button className="gold-button" onClick={() => requestUnlock(sectionId)}>
            <KeyRound className="w-4 h-4 mr-2" /> Unlock Section
          </Button>
        </div>
      </div>
    </div>
  );
};

// === LOCK SETUP MODAL (4 steps) ===
const LockSetupModal = ({ sectionId, onClose, onComplete }) => {
  const sec = LOCKABLE_SECTIONS[sectionId];
  const [step, setStep] = useState(0);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [voicePhrase, setVoicePhrase] = useState('');
  const [voiceRecorded, setVoiceRecorded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [backupQ, setBackupQ] = useState('');
  const [backupA, setBackupA] = useState('');
  const [backupEmail, setBackupEmail] = useState('');

  const steps = ['Section Password', 'Voice Passphrase', 'Backup Recovery', 'Confirm & Lock'];

  const handleRecord = () => {
    setRecording(true);
    setTimeout(() => { setRecording(false); setVoiceRecorded(true); }, 3000);
  };

  const handleComplete = () => {
    onComplete(sectionId, {
      pw: pw1,
      voice: voicePhrase,
      backup: { q: backupQ, a: backupA, email: backupEmail },
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="glass-card border-[var(--b2)] sm:max-w-lg p-0 gap-0" data-testid="lock-setup-modal">
        {/* Header */}
        <div className="p-5 pb-3" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(224,173,43,0.05))', borderBottom: '1px solid var(--b)' }}>
          <DialogHeader>
            <DialogTitle className="text-[var(--t)]">Lock {sec?.name}</DialogTitle>
            <DialogDescription className="text-[var(--t4)]">Set up dual-password protection</DialogDescription>
          </DialogHeader>
        </div>

        {/* Progress */}
        <div className="flex gap-1 px-5 pt-3">
          {steps.map((s, i) => (
            <div key={i} className="flex-1">
              <div className="h-1 rounded-full mb-1" style={{ background: i <= step ? 'linear-gradient(90deg, var(--pr), var(--pr2))' : 'var(--b)' }} />
              <div className="text-[10px] text-center" style={{ color: i <= step ? 'var(--pr2)' : 'var(--t5)' }}>{s}</div>
            </div>
          ))}
        </div>

        <div className="p-5">
          {/* Step 0: Password */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-[var(--t)] mb-1">Create a Section Password</h3>
                <p className="text-xs text-[var(--t4)] leading-relaxed">This password is different from your login password and is used only to unlock this specific section.</p>
              </div>
              <div className="relative">
                <Label className="text-[var(--t4)] text-xs">Section Password</Label>
                <Input type={showPw ? 'text' : 'password'} value={pw1} onChange={e => setPw1(e.target.value)} placeholder="Enter a strong password" className="input-field mt-1 pr-10" />
                <button onClick={() => setShowPw(p => !p)} className="absolute right-3 top-8 text-[var(--t5)]">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div>
                <Label className="text-[var(--t4)] text-xs">Confirm Password</Label>
                <Input type={showPw ? 'text' : 'password'} value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm password" className="input-field mt-1" />
              </div>
              {pw1 && pw2 && pw1 !== pw2 && <p className="text-xs text-[var(--rd2)]">Passwords do not match</p>}
              <Button className="w-full" style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', color: 'white' }} disabled={!pw1 || pw1 !== pw2 || pw1.length < 4} onClick={() => setStep(1)}>Continue</Button>
            </div>
          )}

          {/* Step 1: Voice Passphrase */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-[var(--t)] mb-1">Record Your Voice Passphrase</h3>
                <p className="text-xs text-[var(--t4)] leading-relaxed">Choose a memorable phrase and speak it clearly. Only your voice saying this phrase will unlock the section.</p>
              </div>
              <div>
                <Label className="text-[var(--t4)] text-xs">Your Passphrase</Label>
                <Input value={voicePhrase} onChange={e => setVoicePhrase(e.target.value)} placeholder='e.g., "Blue rivers flow beneath the mountain"' className="input-field mt-1" />
              </div>
              {voicePhrase && (
                <div className="text-center p-6 rounded-xl" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                  {voiceRecorded ? (
                    <>
                      <CheckCircle2 className="w-12 h-12 mx-auto text-[var(--gn2)] mb-3" />
                      <div className="text-sm font-bold text-[var(--gn2)] mb-1">Voice Recorded</div>
                      <div className="text-xs text-[var(--t4)]">"{voicePhrase}"</div>
                      <button onClick={() => setVoiceRecorded(false)} className="text-xs text-[var(--bl3)] mt-2 font-bold">Re-Record</button>
                    </>
                  ) : (
                    <>
                      <div onClick={handleRecord} className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center cursor-pointer transition-all" style={{ background: recording ? 'rgba(240,82,82,0.2)' : 'rgba(59,123,247,0.12)', border: `3px solid ${recording ? 'var(--rd2)' : 'var(--bl3)'}` }}>
                        {recording ? <MicOff className="w-7 h-7 text-[var(--rd2)]" /> : <Mic className="w-7 h-7 text-[var(--bl3)]" />}
                      </div>
                      <div className="text-sm font-bold">{recording ? 'Recording... Speak Now' : 'Tap to Record'}</div>
                    </>
                  )}
                </div>
              )}
              {/* Video call recovery notice */}
              <div className="rounded-xl p-3" style={{ background: 'rgba(59,123,247,0.05)', border: '1px solid rgba(59,123,247,0.1)' }}>
                <p className="text-xs text-[var(--bl3)] leading-relaxed">
                  If all recovery methods fail, you can request a live video call with CarryOn™ support. You'll hold your government-issued photo ID next to your face on camera so a team member can verify your identity and reset access.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="border-[var(--b)] text-[var(--t3)]" onClick={() => setStep(0)}>Back</Button>
                <Button className="flex-1" style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', color: 'white' }} disabled={!voiceRecorded} onClick={() => setStep(2)}>Continue</Button>
              </div>
            </div>
          )}

          {/* Step 2: Backup Recovery */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-[var(--t)] mb-1">Backup Recovery Method</h3>
                <p className="text-xs text-[var(--t4)] leading-relaxed">Set a security question and recovery email in case you forget your password or voice passphrase.</p>
              </div>
              <div>
                <Label className="text-[var(--t4)] text-xs">Security Question</Label>
                <select value={backupQ} onChange={e => setBackupQ(e.target.value)} className="input-field mt-1 w-full rounded-lg p-3 bg-[var(--s)] border border-[var(--b)] text-[var(--t)] text-sm">
                  <option value="">Choose a question...</option>
                  {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[var(--t4)] text-xs">Your Answer</Label>
                <Input value={backupA} onChange={e => setBackupA(e.target.value)} placeholder="Your answer" className="input-field mt-1" />
              </div>
              <div>
                <Label className="text-[var(--t4)] text-xs">Recovery Email</Label>
                <Input type="email" value={backupEmail} onChange={e => setBackupEmail(e.target.value)} placeholder="your@email.com" className="input-field mt-1" />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="border-[var(--b)] text-[var(--t3)]" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1" style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', color: 'white' }} disabled={!backupQ || !backupA || !backupEmail} onClick={() => setStep(3)}>Continue</Button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-bold text-[var(--t)] mb-1">Confirm & Lock</h3>
              <div className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                {[['Section', sec?.name], ['Password', '••••••••'], ['Voice Passphrase', `"${voicePhrase}"`], ['Security Question', backupQ], ['Recovery Email', backupEmail]].map(([k, v], i, a) => (
                  <div key={k} className="flex justify-between py-2 text-sm" style={{ borderBottom: i < a.length - 1 ? '1px solid var(--b)' : 'none' }}>
                    <span className="text-[var(--t4)]">{k}</span>
                    <span className="text-[var(--t)] font-bold text-right max-w-[60%] truncate">{v}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
                <p className="text-xs text-[var(--yw)] leading-relaxed flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  Once locked, you will need both your section password AND voice passphrase to access this section. Store your backup recovery information securely.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="border-[var(--b)] text-[var(--t3)]" onClick={() => setStep(2)}>Back</Button>
                <Button className="flex-1" style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', color: 'white' }} onClick={handleComplete}>
                  <Lock className="w-4 h-4 mr-2" /> Lock {sec?.abbr}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// === UNLOCK MODAL (Password → Voice) ===
const UnlockModal = ({ sectionId, lockState, onClose, onUnlocked }) => {
  const sec = LOCKABLE_SECTIONS[sectionId];
  const ls = lockState[sectionId];
  const [step, setStep] = useState(0);
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [backupA, setBackupA] = useState('');

  const handlePasswordCheck = () => {
    if (pw === ls?.pw) {
      setStep(1);
    } else {
      toast.error('Incorrect section password');
    }
  };

  const handleVoiceRecord = () => {
    setRecording(true);
    setTimeout(() => { setRecording(false); setVoiceOk(true); }, 3000);
  };

  const handleBackupCheck = () => {
    if (backupA.toLowerCase() === ls?.backup?.a?.toLowerCase()) {
      onUnlocked();
    } else {
      toast.error('Incorrect answer');
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="glass-card border-[var(--b2)] sm:max-w-md p-0 gap-0" data-testid="unlock-modal">
        <div className="p-5 pb-3" style={{ background: 'linear-gradient(135deg, rgba(224,173,43,0.08), rgba(139,92,246,0.05))', borderBottom: '1px solid var(--b)' }}>
          <DialogHeader>
            <DialogTitle className="text-[var(--t)]">Unlock {sec?.name}</DialogTitle>
            <DialogDescription className="text-[var(--t4)]">{step === 0 ? 'Step 1: Enter section password' : 'Step 2: Voice verification'}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-5">
          {/* Step 0: Password */}
          {step === 0 && !showBackup && (
            <div className="space-y-4">
              <div className="relative">
                <Label className="text-[var(--t4)] text-xs">Section Password</Label>
                <Input type={showPw ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} placeholder="Enter section password" className="input-field mt-1 pr-10" onKeyDown={e => e.key === 'Enter' && handlePasswordCheck()} autoFocus />
                <button onClick={() => setShowPw(p => !p)} className="absolute right-3 top-8 text-[var(--t5)]">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button className="w-full gold-button" disabled={!pw} onClick={handlePasswordCheck}>Verify</Button>
              <button onClick={() => setShowBackup(true)} className="text-xs text-[var(--bl3)] w-full text-center font-bold">Forgot password? Use backup recovery</button>
            </div>
          )}

          {/* Backup recovery */}
          {step === 0 && showBackup && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-[var(--t)] text-sm mb-1">Backup Recovery</h3>
                <p className="text-xs text-[var(--t4)]">Answer your security question to unlock.</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                <div className="text-sm font-bold text-[var(--t)]">{ls?.backup?.q}</div>
              </div>
              <div>
                <Label className="text-[var(--t4)] text-xs">Your Answer</Label>
                <Input value={backupA} onChange={e => setBackupA(e.target.value)} placeholder="Your answer" className="input-field mt-1" autoFocus />
              </div>
              <Button className="w-full gold-button" disabled={!backupA} onClick={handleBackupCheck}>Verify Answer</Button>
              <button onClick={() => setShowBackup(false)} className="text-xs text-[var(--bl3)] w-full text-center font-bold">Back to password</button>
            </div>
          )}

          {/* Step 1: Voice */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center">
                <CheckCircle2 className="w-8 h-8 mx-auto text-[var(--gn2)] mb-2" />
                <div className="text-sm font-bold text-[var(--gn2)]">Password Verified</div>
                <p className="text-xs text-[var(--t4)] mt-1">Now speak your voice passphrase</p>
              </div>
              <div className="text-center p-6 rounded-xl" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                {voiceOk ? (
                  <>
                    <CheckCircle2 className="w-12 h-12 mx-auto text-[var(--gn2)] mb-3" />
                    <div className="text-sm font-bold text-[var(--gn2)]">Voice Verified</div>
                  </>
                ) : (
                  <>
                    <div className="text-xs text-[var(--t4)] mb-3">Your passphrase: "{ls?.voice}"</div>
                    <div onClick={handleVoiceRecord} className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center cursor-pointer transition-all" style={{ background: recording ? 'rgba(240,82,82,0.2)' : 'rgba(59,123,247,0.12)', border: `3px solid ${recording ? 'var(--rd2)' : 'var(--bl3)'}` }}>
                      {recording ? <MicOff className="w-7 h-7 text-[var(--rd2)]" /> : <Mic className="w-7 h-7 text-[var(--bl3)]" />}
                    </div>
                    <div className="text-sm font-bold">{recording ? 'Recording...' : 'Tap to Speak'}</div>
                  </>
                )}
              </div>
              {voiceOk && <Button className="w-full gold-button" onClick={onUnlocked}>Access {sec?.abbr}</Button>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
