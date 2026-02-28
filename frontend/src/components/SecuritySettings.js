import React, { useState, useEffect } from 'react';
import { Shield, Lock, Unlock, Mic, KeyRound, HelpCircle, Eye, EyeOff, CheckCircle2, Loader2, ChevronDown, ChevronUp, StopCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { toast } from 'sonner';
import { useSectionLock } from './security/SectionLock';
import axios from 'axios';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SECTIONS = [
  { id: 'sdv', name: 'Secure Document Vault', abbr: 'SDV' },
  { id: 'mm', name: 'Milestone Messages', abbr: 'MM' },
  { id: 'bm', name: 'Beneficiary Management', abbr: 'BM' },
  { id: 'iac', name: 'Immediate Action Checklist', abbr: 'IAC' },
  { id: 'dts', name: 'Designated Trustee Services', abbr: 'DTS' },
  { id: 'ega', name: 'Estate Guardian AI', abbr: 'EGA' },
];

const LOCK_MODES = [
  { value: 'on_page_leave', label: 'Auto-lock when you leave the page' },
  { value: 'on_logout', label: 'Auto-lock when you log out' },
  { value: 'manual', label: 'Manual lock only (lock on command)' },
];

const SecuritySettings = ({ getAuthHeaders }) => {
  const [settings, setSettings] = useState({});
  const [questions, setQuestions] = useState([]);
  const [expandedSection, setExpandedSection] = useState(null);
  const [loading, setLoading] = useState(true);
  const { fetchSettings: refreshGlobalLock } = useSectionLock();

  const headers = getAuthHeaders()?.headers || {};

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    fetchAll();
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const fetchAll = async () => {
    try {
      const [settingsRes, questionsRes] = await Promise.all([
        axios.get(`${API_URL}/security/settings`, { headers }),
        axios.get(`${API_URL}/security/questions`, { headers }),
      ]);
      setSettings(settingsRes.data);
      setQuestions(questionsRes.data.questions);
    } catch (err) {
      // silent
    }
    setLoading(false);
    // Also refresh the global SectionLock context so lock banners update immediately
    refreshGlobalLock();
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--t4)]" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card" data-testid="security-settings-card">
      <CardHeader>
        <CardTitle className="text-[var(--t)] flex items-center gap-2">
          <Shield className="w-5 h-5 text-[var(--gold)]" />
          Section Security (Triple Lock)
        </CardTitle>
        <p className="text-xs text-[var(--t4)] mt-1">
          Configure up to 3 security layers per section: Password, Voice Biometric, and Security Question.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {SECTIONS.map((sec) => (
          <SectionRow
            key={sec.id}
            section={sec}
            settings={settings[sec.id] || {}}
            questions={questions}
            expanded={expandedSection === sec.id}
            onToggle={() => setExpandedSection(expandedSection === sec.id ? null : sec.id)}
            headers={headers}
            onUpdate={fetchAll}
          />
        ))}
      </CardContent>
    </Card>
  );
};

const SectionRow = ({ section, settings: s, questions, expanded, onToggle, headers, onUpdate }) => {
  const isActive = s.is_active;
  const layers = [];
  if (s.password_enabled) layers.push('Password');
  if (s.voice_enabled) layers.push('Voice');
  if (s.security_question_enabled) layers.push('Q&A');

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${isActive ? 'rgba(139,92,246,0.2)' : 'var(--b)'}`, background: isActive ? 'rgba(139,92,246,0.03)' : 'transparent' }}>
      {/* Row header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--s)]/50 transition-colors"
        data-testid={`section-security-${section.id}`}
      >
        <div className="flex items-center gap-3">
          {isActive ? <Lock className="w-4 h-4 text-[var(--pr2)]" /> : <Unlock className="w-4 h-4 text-[var(--t5)]" />}
          <div className="text-left">
            <div className="text-sm font-bold text-[var(--t)]">{section.name}</div>
            <div className="text-xs text-[var(--t4)]">
              {isActive ? `${layers.join(' + ')} · ${LOCK_MODES.find(m => m.value === s.lock_mode)?.label || 'Manual'}` : 'No security configured'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--pr2)]/10 text-[var(--pr2)]">
              {layers.length} layer{layers.length > 1 ? 's' : ''}
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-[var(--t4)]" /> : <ChevronDown className="w-4 h-4 text-[var(--t4)]" />}
        </div>
      </button>

      {/* Expanded settings */}
      {expanded && (
        <SectionConfig section={section} settings={s} questions={questions} headers={headers} onUpdate={onUpdate} />
      )}
    </div>
  );
};

const SectionConfig = ({ section, settings: s, questions, headers, onUpdate }) => {
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwEnabled, setPwEnabled] = useState(s.password_enabled || false);
  const [voiceEnabled, setVoiceEnabled] = useState(s.voice_enabled || false);
  const [qEnabled, setQEnabled] = useState(s.security_question_enabled || false);
  const [question, setQuestion] = useState(s.security_question || '');
  const [customQ, setCustomQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [lockMode, setLockMode] = useState(s.lock_mode || 'manual');
  const [saving, setSaving] = useState(false);
  const [voicePhrase, setVoicePhrase] = useState(s.voice_passphrase || '');
  const [recording, setRecording] = useState(false);
  const [enrollCount, setEnrollCount] = useState(0);
  const [enrolling, setEnrolling] = useState(false);
  const mediaRecorderRef = React.useRef(null);

  // Account password verification for disabling security
  const [showAccountPwModal, setShowAccountPwModal] = useState(false);
  const [accountPw, setAccountPw] = useState('');
  const [accountPwVerifying, setAccountPwVerifying] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(null); // { field, value }

  const isCustomQuestion = question === '__custom__' || (question && !questions.includes(question));

  // Wrap toggle-off actions to require account password
  const handleToggle = (field, value) => {
    if (!value && s.is_active) {
      // Turning OFF an active security feature — require password
      setPendingToggle({ field, value });
      setShowAccountPwModal(true);
      setAccountPw('');
    } else {
      // Turning ON is always allowed
      if (field === 'password') setPwEnabled(value);
      else if (field === 'voice') setVoiceEnabled(value);
      else if (field === 'question') setQEnabled(value);
    }
  };

  const verifyAccountPassword = async () => {
    setAccountPwVerifying(true);
    try {
      const { email } = JSON.parse(atob(localStorage.getItem('carryon_token').split('.')[1]));
      await axios.post(`${API_URL}/auth/verify-password`, { email, password: accountPw }, { headers });
      // Password verified — apply the toggle
      if (pendingToggle) {
        if (pendingToggle.field === 'password') setPwEnabled(pendingToggle.value);
        else if (pendingToggle.field === 'voice') setVoiceEnabled(pendingToggle.value);
        else if (pendingToggle.field === 'question') setQEnabled(pendingToggle.value);
        else if (pendingToggle.field === 'remove') {
          // Full removal
          await axios.delete(`${API_URL}/security/settings/${section.id}`, { headers });
          toast.success(`Security removed from ${section.name}`);
          onUpdate();
        }
      }
      setShowAccountPwModal(false);
      setPendingToggle(null);
      setAccountPw('');
    } catch (err) {
      toast.error('Incorrect account password');
    }
    setAccountPwVerifying(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        password_enabled: pwEnabled,
        voice_enabled: voiceEnabled,
        security_question_enabled: qEnabled,
        lock_mode: lockMode,
      };
      if (pw) data.password = pw;
      const finalQ = question === '__custom__' ? customQ : question;
      if (finalQ) data.security_question = finalQ;
      if (answer) data.security_answer = answer;

      await axios.put(`${API_URL}/security/settings/${section.id}`, data, { headers: { ...headers, 'Content-Type': 'application/json' } });
      toast.success(`${section.name} security saved`);
      setPw('');
      setAnswer('');
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    }
    setSaving(false);
  };

  const handleRemove = async () => {
    try {
      await axios.delete(`${API_URL}/security/settings/${section.id}`, { headers });
      toast.success(`Security removed from ${section.name}`);
      onUpdate();
    } catch (err) {
      toast.error('Failed to remove security');
    }
  };

  const handleVoiceEnroll = () => {
    if (recording || enrolling) return;
    if (!voicePhrase.trim()) { toast.error('Enter a passphrase first'); return; }
    setRecording(true);

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;
        const chunks = [];
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          mediaRecorderRef.current = null;
          setRecording(false);
          setEnrolling(true);
          const blob = new Blob(chunks, { type: 'audio/webm' });
          try {
            const formData = new FormData();
            formData.append('file', blob, 'voice.webm');
            formData.append('passphrase', voicePhrase.trim());
            const res = await axios.post(`${API_URL}/security/voice/enroll/${section.id}`, formData, {
              headers: { ...headers, 'Content-Type': 'multipart/form-data' }
            });
            setEnrollCount(res.data.samples_recorded);
            toast.success(res.data.message);
          } catch (err) {
            toast.error(err.response?.data?.detail || 'Voice enrollment failed');
          }
          setEnrolling(false);
        };
        mediaRecorder.start();
      })
      .catch(() => { toast.error('Microphone access denied'); setRecording(false); });
  };

  const handleVoiceStop = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid var(--b)' }}>
      {/* Lock Mode */}
      <div className="pt-4">
        <Label className="text-[var(--t4)] text-xs font-bold">Lock Behavior</Label>
        <Select value={lockMode} onValueChange={setLockMode}>
          <SelectTrigger className="input-field mt-1 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#141C33] border-[var(--b)]" style={{ zIndex: 99999 }}>
            {LOCK_MODES.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-[var(--t2)] hover:bg-[var(--s)] cursor-pointer text-sm">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator className="bg-[var(--b)]" />

      {/* Layer 1: Password */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[var(--gold)]" />
            <span className="text-sm font-bold text-[var(--t)]">Layer 1: Password</span>
          </div>
          <Switch checked={pwEnabled} onCheckedChange={setPwEnabled} data-testid={`pw-toggle-${section.id}`} />
        </div>
        {pwEnabled && (
          <div className="ml-6 space-y-2">
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder={s.has_password ? '••••••• (already set, enter to change)' : 'Create section password'}
                className="input-field pr-10 text-sm"
                data-testid={`pw-input-${section.id}`}
              />
              <button onClick={() => setShowPw(p => !p)} className="absolute right-3 top-2.5 text-[var(--t5)]">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {s.has_password && <p className="text-[10px] text-[var(--gn2)] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Password set</p>}
          </div>
        )}
      </div>

      <Separator className="bg-[var(--b)]" />

      {/* Layer 2: Voice Biometric */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-[var(--bl3)]" />
            <span className="text-sm font-bold text-[var(--t)]">Layer 2: Voice Biometric</span>
          </div>
          <Switch checked={voiceEnabled} onCheckedChange={setVoiceEnabled} data-testid={`voice-toggle-${section.id}`} />
        </div>
        {voiceEnabled && (
          <div className="ml-6 space-y-3">
            <div>
              <Label className="text-[var(--t4)] text-xs">Your Passphrase</Label>
              <Input
                value={voicePhrase}
                onChange={e => setVoicePhrase(e.target.value)}
                placeholder='e.g., "Blue rivers flow beneath the mountain"'
                className="input-field mt-1 text-sm"
                data-testid={`voice-phrase-${section.id}`}
              />
            </div>
            <div className="rounded-xl p-4 text-center" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              {enrolling ? (
                <Loader2 className="w-8 h-8 mx-auto text-[var(--bl3)] animate-spin mb-2" />
              ) : recording ? (
                <div
                  onClick={handleVoiceStop}
                  className="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center cursor-pointer transition-all animate-pulse"
                  style={{ background: 'rgba(240,82,82,0.2)', border: '3px solid var(--rd2)' }}
                  data-testid={`voice-stop-${section.id}`}
                >
                  <StopCircle className="w-6 h-6 text-[var(--rd2)]" />
                </div>
              ) : (
                <div
                  onClick={handleVoiceEnroll}
                  className="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center cursor-pointer transition-all"
                  style={{ background: 'rgba(59,123,247,0.12)', border: '3px solid var(--bl3)' }}
                  data-testid={`voice-enroll-${section.id}`}
                >
                  <Mic className="w-6 h-6 text-[var(--bl3)]" />
                </div>
              )}
              <div className="text-xs font-bold text-[var(--t)]">{recording ? 'Recording — Tap to Stop' : enrolling ? 'Processing...' : 'Tap to Record Sample'}</div>
              {(enrollCount > 0 || s.has_voiceprint) && (
                <p className="text-[10px] text-[var(--gn2)] mt-1 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {enrollCount > 0 ? `${enrollCount} sample${enrollCount > 1 ? 's' : ''} enrolled` : 'Voiceprint enrolled'}
                  {enrollCount < 3 && ' · Record more for better accuracy'}
                </p>
              )}
            </div>
            <p className="text-[10px] text-[var(--t5)] leading-relaxed">
              Your voiceprint verifies both WHAT you say and WHO is saying it. Record 2-3 samples for best accuracy.
            </p>
          </div>
        )}
      </div>

      <Separator className="bg-[var(--b)]" />

      {/* Layer 3: Security Question */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[var(--pr2)]" />
            <span className="text-sm font-bold text-[var(--t)]">Layer 3: Security Question</span>
          </div>
          <Switch checked={qEnabled} onCheckedChange={setQEnabled} data-testid={`q-toggle-${section.id}`} />
        </div>
        {qEnabled && (
          <div className="ml-6 space-y-2">
            <div>
              <Label className="text-[var(--t4)] text-xs">Choose a Question</Label>
              <Select value={isCustomQuestion && question !== '__custom__' ? '__custom__' : question} onValueChange={(v) => { setQuestion(v); if (v !== '__custom__') setCustomQ(''); }}>
                <SelectTrigger className="input-field mt-1 w-full text-sm">
                  <SelectValue placeholder="Select a question..." />
                </SelectTrigger>
                <SelectContent className="bg-[#141C33] border-[var(--b)] max-h-60" style={{ zIndex: 99999 }}>
                  {questions.map(q => (
                    <SelectItem key={q} value={q} className="text-[var(--t2)] hover:bg-[var(--s)] cursor-pointer text-sm">{q}</SelectItem>
                  ))}
                  <SelectItem value="__custom__" className="text-[var(--pr2)] hover:bg-[var(--s)] cursor-pointer text-sm font-bold">Write my own question...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(question === '__custom__' || isCustomQuestion) && (
              <div>
                <Label className="text-[var(--t4)] text-xs">Your Custom Question</Label>
                <Input
                  value={customQ || (isCustomQuestion && question !== '__custom__' ? question : '')}
                  onChange={e => { setCustomQ(e.target.value); setQuestion('__custom__'); }}
                  placeholder="Type your own security question"
                  className="input-field mt-1 text-sm"
                  data-testid={`custom-q-${section.id}`}
                />
              </div>
            )}
            <div>
              <Label className="text-[var(--t4)] text-xs">Your Answer</Label>
              <Input
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                placeholder={s.has_security_question ? '••••••• (already set, enter to change)' : 'Enter your answer'}
                className="input-field mt-1 text-sm"
                data-testid={`q-answer-${section.id}`}
              />
            </div>
            {s.has_security_question && <p className="text-[10px] text-[var(--gn2)] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Security question set</p>}
          </div>
        )}
      </div>

      <Separator className="bg-[var(--b)]" />

      {/* Action Buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          className="flex-1 text-sm"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', color: 'white' }}
          disabled={saving || (!pwEnabled && !voiceEnabled && !qEnabled)}
          onClick={handleSave}
          data-testid={`save-security-${section.id}`}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Shield className="w-4 h-4 mr-1" />}
          Save {section.abbr} Security
        </Button>
        {s.is_active && (
          <Button variant="outline" className="border-[var(--rd2)]/30 text-[var(--rd2)] text-sm" onClick={handleRemove} data-testid={`remove-security-${section.id}`}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
};

export default SecuritySettings;
