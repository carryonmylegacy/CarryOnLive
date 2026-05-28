import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Shield, Lock, Unlock, KeyRound, HelpCircle, Eye, EyeOff, CheckCircle2, Loader2, ChevronDown, ChevronUp, Hash, Delete } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { toast } from '../utils/toast';
import { useSectionLock } from './security/SectionLock';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';

const SECTIONS = [
  { id: 'sdv', name: 'Secure Document Vault', abbr: 'SDV' },
  { id: 'mm', name: 'Milestone Messages', abbr: 'MM' },
  { id: 'bm', name: 'Beneficiary Management', abbr: 'BM' },
  { id: 'iac', name: 'Immediate Action Checklist', abbr: 'IAC' },
  { id: 'dts', name: 'Designated Trustee Services', abbr: 'DTS' },
  { id: 'ega', name: 'Estate Guardian AI', abbr: 'EGA' },
];

const LOCK_MODES = [
  { value: 'on_page_leave', label: 'Auto-lock on page leave' },
  { value: 'on_logout', label: 'Auto-lock on logout' },
  { value: 'manual', label: 'Manual lock only' },
];

const MAX_PIN_LENGTH = 8;
const MIN_PIN_LENGTH = 4;

const SecuritySettings = ({ getAuthHeaders }) => {
  const [settings, setSettings] = useState({});
  const [questions, setQuestions] = useState([]);
  const [expandedSection, setExpandedSection] = useState(null);
  const [loading, setLoading] = useState(true);
  const { fetchSettings: refreshGlobalLock } = useSectionLock();
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-expand section from URL param (e.g., /security-settings?section=sdv)
  useEffect(() => {
    const sectionParam = searchParams.get('section');
    if (sectionParam && SECTIONS.find(s => s.id === sectionParam)) {
      setExpandedSection(sectionParam);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Master key state
  const [hasMasterKey, setHasMasterKey] = useState(false);
  const [masterKeyInput, setMasterKeyInput] = useState('');
  const [savingMasterKey, setSavingMasterKey] = useState(false);
  const [showMasterKeyInput, setShowMasterKeyInput] = useState(false);
  const [showMasterKeyValue, setShowMasterKeyValue] = useState(false);

  const headers = getAuthHeaders()?.headers || {};

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    fetchAll();
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const fetchAll = async () => {
    try {
      const [settingsRes, questionsRes, masterKeyRes] = await Promise.all([
        apiClient.get(`${API_URL}/security/settings`, { headers }),
        apiClient.get(`${API_URL}/security/questions`, { headers }),
        apiClient.get(`${API_URL}/security/master-key-status`, { headers }),
      ]);
      setSettings(settingsRes.data);
      setQuestions(questionsRes.data.questions);
      setHasMasterKey(masterKeyRes.data.has_master_key);
    } catch (_err) {
      // silent
    }
    setLoading(false);
    refreshGlobalLock();
  };

  const handleSaveMasterKey = async () => {
    if (masterKeyInput.trim().length < 4) { toast.error('Master key must be at least 4 characters'); return; }
    setSavingMasterKey(true);
    try {
      await apiClient.post(`${API_URL}/security/master-key`, { master_key: masterKeyInput }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      setHasMasterKey(true);
      setMasterKeyInput('');
      setShowMasterKeyInput(false);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save'); }
    finally { setSavingMasterKey(false); }
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
    <>
    {/* Vault Master Key */}
    <Card className="glass-card mb-5" data-testid="master-key-card">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: hasMasterKey ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }}>
              <KeyRound className="w-5 h-5" style={{ color: hasMasterKey ? '#10b981' : '#ef4444' }} />
            </div>
            <div>
              <h3 className="font-bold text-[var(--t)] text-sm">Vault Master Key</h3>
              <p className="text-xs text-[var(--t4)]">
                {hasMasterKey
                  ? 'Set. This key can be spoken to customer service to unlock all documents if you forget individual passwords.'
                  : 'Required before you can lock individual documents. Spoken to customer service for emergency unlock.'}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--t3)] flex-shrink-0"
            onClick={() => setShowMasterKeyInput(!showMasterKeyInput)}>
            {hasMasterKey ? 'Update' : 'Set Key'}
          </Button>
        </div>
        {showMasterKeyInput && (
          <div className="mt-4 pt-4 space-y-3" style={{ borderTop: '1px solid var(--b)' }}>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--t4)]">{hasMasterKey ? 'New Master Key' : 'Master Key'} <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Input
                  type={showMasterKeyValue ? 'text' : 'password'}
                  value={masterKeyInput}
                  onChange={(e) => setMasterKeyInput(e.target.value)}
                  placeholder="Min 4 characters"
                  className="input-field pr-10"
                  style={{ fontSize: '16px' }}
                  data-testid="master-key-input"
                />
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setShowMasterKeyValue(!showMasterKeyValue)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)] hover:text-[var(--t)] transition-colors"
                  data-testid="master-key-toggle-visibility"
                >
                  {showMasterKeyValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="gold-button text-xs" onClick={handleSaveMasterKey} disabled={savingMasterKey || masterKeyInput.trim().length < 4} data-testid="save-master-key">
                {savingMasterKey ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <KeyRound className="w-3 h-3 mr-1" />}
                {hasMasterKey ? 'Update Key' : 'Save Key'}
              </Button>
              <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => { setShowMasterKeyInput(false); setMasterKeyInput(''); }}>Cancel</Button>
            </div>
            <p className="text-[11px] text-[var(--t5)]">This key is hashed and stored securely. Customer service cannot see it — they can only verify what you tell them over the phone.</p>
          </div>
        )}
      </CardContent>
    </Card>

    <Card className="glass-card" data-testid="security-settings-card">
      <CardHeader>
        <CardTitle className="text-[var(--t)] flex items-center gap-2">
          <Shield className="w-5 h-5 text-[var(--gold)]" />
          Section Security (Triple Lock)
        </CardTitle>
        <p className="text-xs text-[var(--t4)] mt-1">
          Configure up to 3 security layers per section: PIN, Password, and Security Question.
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
    </>
  );
};

const SectionRow = ({ section, settings: s, questions, expanded, onToggle, headers, onUpdate }) => {
  const isActive = s.is_active;
  const layers = [];
  if (s.pin_enabled && s.has_pin) layers.push('PIN');
  if (s.password_enabled && s.has_password) layers.push('Password');
  if (s.security_question_enabled && s.has_security_question) layers.push('Q&A');

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${isActive ? 'rgba(139,92,246,0.2)' : 'var(--b)'}`, background: isActive ? 'rgba(139,92,246,0.03)' : 'transparent' }}>
      {/* Row header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--s)]/50 transition-colors"
        data-testid={`section-security-${section.id}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isActive ? <Lock className="w-4 h-4 text-[var(--pr2)] flex-shrink-0" /> : <Unlock className="w-4 h-4 text-[var(--t5)] flex-shrink-0" />}
          <div className="text-left min-w-0">
            <div className="text-sm font-bold text-[var(--t)] truncate">{section.name}</div>
            <div className="text-xs text-[var(--t4)] truncate">
              {isActive ? `${layers.join(' + ')} · ${LOCK_MODES.find(m => m.value === s.lock_mode)?.label || 'Manual'}` : 'No security configured'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--pr2)]/10 text-[var(--pr2)] whitespace-nowrap">
              {layers.length} layer{layers.length > 1 ? 's' : ''}
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-[var(--t4)]" /> : <ChevronDown className="w-4 h-4 text-[var(--t4)]" />}
        </div>
      </button>

      {/* Expanded settings */}
      {expanded && (
        <SectionConfig
          key={`${section.id}-${s.pin_enabled}-${s.password_enabled}-${s.security_question_enabled}-${s.has_pin}-${s.has_password}-${s.has_security_question}`}
          section={section} settings={s} questions={questions} headers={headers} onUpdate={onUpdate}
        />
      )}
    </div>
  );
};

// ─── Inline PIN Keypad (for setting PIN in config) ───────────
const PinKeypad = ({ digits, onDigit, onBackspace, onClear, error, maxLen = MAX_PIN_LENGTH }) => (
  <div className="space-y-3">
    {/* PIN Dots */}
    <div className="flex justify-center gap-2" data-testid="pin-setup-dots">
      {Array.from({ length: maxLen }).map((_, i) => (
        <div key={i} className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-all"
          style={{
            background: i < digits.length ? 'rgba(var(--gold-rgb), 0.15)' : 'var(--s)',
            border: `2px solid ${i < digits.length ? 'var(--gold)' : error ? '#EF4444' : 'var(--b)'}`,
            color: 'var(--t)',
            opacity: i < digits.length ? 1 : 0.4,
          }}>
          {i < digits.length ? '\u2022' : ''}
        </div>
      ))}
    </div>

    {error && <p className="text-xs text-red-400 text-center" data-testid="pin-setup-error">{error}</p>}

    <div className="text-[11px] text-center text-[var(--t5)]">
      {digits.length < MIN_PIN_LENGTH
        ? `Enter at least ${MIN_PIN_LENGTH} digits`
        : `${digits.length} of ${maxLen} digits entered`}
    </div>

    {/* Numeric Keypad */}
    <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto" data-testid="pin-setup-keypad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
        <button key={n} type="button" onClick={() => onDigit(String(n))}
          className="py-3 rounded-xl text-lg font-bold text-[var(--t)] transition-all active:scale-95"
          style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
          disabled={digits.length >= maxLen}
          data-testid={`pin-setup-key-${n}`}>
          {n}
        </button>
      ))}
      <button type="button" onClick={onClear}
        className="py-3 rounded-xl text-xs font-bold text-[var(--t5)] transition-all active:scale-95"
        style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
        data-testid="pin-setup-key-clear">
        Clear
      </button>
      <button type="button" onClick={() => onDigit('0')}
        className="py-3 rounded-xl text-lg font-bold text-[var(--t)] transition-all active:scale-95"
        style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
        disabled={digits.length >= maxLen}
        data-testid="pin-setup-key-0">
        0
      </button>
      <button type="button" onClick={onBackspace}
        className="py-3 rounded-xl text-sm font-bold text-[var(--t5)] transition-all active:scale-95"
        style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
        data-testid="pin-setup-key-back">
        <Delete className="w-5 h-5 mx-auto" />
      </button>
    </div>
  </div>
);

const SectionConfig = ({ section, settings: s, questions, headers, onUpdate }) => {
  // PIN state
  const [pinEnabled, setPinEnabled] = useState(s.pin_enabled || false);
  const [pinDigits, setPinDigits] = useState('');
  const [pinError, setPinError] = useState('');

  // Password state
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwEnabled, setPwEnabled] = useState(s.password_enabled || false);

  // Security question state
  const [qEnabled, setQEnabled] = useState(s.security_question_enabled || false);
  const [question, setQuestion] = useState(s.security_question || '');
  const [customQ, setCustomQ] = useState('');
  const [answer, setAnswer] = useState('');

  const [lockMode, setLockMode] = useState(s.lock_mode || 'manual');
  const [saving, setSaving] = useState(false);

  // Master key verification for disabling security
  const [showMasterKeyModal, setShowMasterKeyModal] = useState(false);
  const [masterKeyVerify, setMasterKeyVerify] = useState('');
  const [masterKeyVerifying, setMasterKeyVerifying] = useState(false);
  const [showMasterKeyVerifyValue, setShowMasterKeyVerifyValue] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(null);

  const isCustomQuestion = question === '__custom__' || (question && !questions.includes(question));

  // Wrap toggle-off actions to require master key
  const handleToggle = (field, value) => {
    if (!value && s.is_active) {
      setPendingToggle({ field, value });
      setShowMasterKeyModal(true);
      setMasterKeyVerify('');
    } else {
      if (field === 'pin') setPinEnabled(value);
      else if (field === 'password') setPwEnabled(value);
      else if (field === 'question') setQEnabled(value);
    }
  };

  const verifyMasterKey = async () => {
    setMasterKeyVerifying(true);
    try {
      await apiClient.post(`${API_URL}/security/verify-master-key`, { master_key: masterKeyVerify }, { headers: { ...headers, 'Content-Type': 'application/json' } });

      if (pendingToggle) {
        if (pendingToggle.field === 'remove') {
          // Remove all security for this section
          await apiClient.delete(`${API_URL}/security/settings/${section.id}`, { headers });
          setPinEnabled(false);
          setPwEnabled(false);
          setQEnabled(false);
        } else {
          // Disable specific layer — compute new enabled states and save immediately
          const newPin = pendingToggle.field === 'pin' ? false : pinEnabled;
          const newPw = pendingToggle.field === 'password' ? false : pwEnabled;
          const newQ = pendingToggle.field === 'question' ? false : qEnabled;

          await apiClient.put(`${API_URL}/security/settings/${section.id}`, {
            pin_enabled: newPin && s.has_pin,
            password_enabled: newPw && s.has_password,
            security_question_enabled: newQ && s.has_security_question,
            lock_mode: lockMode,
          }, { headers: { ...headers, 'Content-Type': 'application/json' } });

          setPinEnabled(newPin);
          setPwEnabled(newPw);
          setQEnabled(newQ);
        }
        // Refresh parent settings + global lock state
        onUpdate();
      }

      setShowMasterKeyModal(false);
      setPendingToggle(null);
      setMasterKeyVerify('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Incorrect master key');
    }
    setMasterKeyVerifying(false);
  };

  const handleSave = async () => {
    // Validate PIN if enabled and being set
    if (pinEnabled && pinDigits.length > 0 && pinDigits.length < MIN_PIN_LENGTH) {
      setPinError(`PIN must be at least ${MIN_PIN_LENGTH} digits`);
      return;
    }
    if (pinEnabled && !s.has_pin && pinDigits.length === 0) {
      setPinError('Please set a PIN');
      return;
    }

    // Only enable layers that have their data set (either new data or existing data)
    const pinReallyEnabled = pinEnabled && (s.has_pin || pinDigits.length >= MIN_PIN_LENGTH);
    const pwReallyEnabled = pwEnabled && (s.has_password || pw.length > 0);
    const qReallyEnabled = qEnabled && (s.has_security_question || answer.length > 0);

    setSaving(true);
    try {
      const data = {
        pin_enabled: pinReallyEnabled,
        password_enabled: pwReallyEnabled,
        security_question_enabled: qReallyEnabled,
        lock_mode: lockMode,
      };
      if (pinDigits.length >= MIN_PIN_LENGTH) data.pin = pinDigits;
      if (pw) data.password = pw;
      const finalQ = question === '__custom__' ? customQ : question;
      if (finalQ) data.security_question = finalQ;
      if (answer) data.security_answer = answer;

      await apiClient.put(`${API_URL}/security/settings/${section.id}`, data, { headers: { ...headers, 'Content-Type': 'application/json' } });
      setPw('');
      setAnswer('');
      setPinDigits('');
      setPinError('');
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    }
    setSaving(false);
  };

  const handleRemove = () => {
    setPendingToggle({ field: 'remove' });
    setShowMasterKeyModal(true);
    setMasterKeyVerify('');
  };

  // PIN keypad handlers
  const handlePinDigit = (digit) => {
    setPinError('');
    if (pinDigits.length < MAX_PIN_LENGTH) {
      setPinDigits(prev => prev + digit);
    }
  };
  const handlePinBackspace = () => {
    setPinError('');
    setPinDigits(prev => prev.slice(0, -1));
  };
  const handlePinClear = () => {
    setPinError('');
    setPinDigits('');
  };

  return (
    <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid var(--b)' }}>
      {/* Lock Mode */}
      <div className="pt-4">
        <Label className="text-[var(--t4)] text-xs font-bold">Lock Behavior</Label>
        <Select value={lockMode} onValueChange={setLockMode}>
          <SelectTrigger className="input-field mt-1 w-full text-sm truncate">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]" style={{ zIndex: 99999 }}>
            {LOCK_MODES.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-[var(--t2)] hover:bg-[var(--s)] cursor-pointer text-sm">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator className="bg-[var(--b)]" />

      {/* Layer 1: PIN */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-[var(--gold)]" />
            <span className="text-sm font-bold text-[var(--t)]">Layer 1: PIN</span>
          </div>
          <Switch checked={pinEnabled} onCheckedChange={(v) => handleToggle('pin', v)} data-testid={`pin-toggle-${section.id}`} />
        </div>
        {pinEnabled && (
          <div className="ml-2 space-y-3">
            <PinKeypad
              digits={pinDigits}
              onDigit={handlePinDigit}
              onBackspace={handlePinBackspace}
              onClear={handlePinClear}
              error={pinError}
            />
            {s.has_pin && pinDigits.length === 0 && (
              <p className="text-[11px] text-[var(--gn2)] flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> PIN set — enter new digits above to change
              </p>
            )}
          </div>
        )}
      </div>

      <Separator className="bg-[var(--b)]" />

      {/* Layer 2: Password */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[var(--bl3)]" />
            <span className="text-sm font-bold text-[var(--t)]">Layer 2: Password</span>
          </div>
          <Switch checked={pwEnabled} onCheckedChange={(v) => handleToggle('password', v)} data-testid={`pw-toggle-${section.id}`} />
        </div>
        {pwEnabled && (
          <div className="ml-6 space-y-2">
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder={s.has_password ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (already set, enter to change)' : 'Create section password'}
                className="input-field pr-10 text-sm"
                data-testid={`pw-input-${section.id}`}
              />
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {s.has_password && <p className="text-[11px] text-[var(--gn2)] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Password set</p>}
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
          <Switch checked={qEnabled} onCheckedChange={(v) => handleToggle('question', v)} data-testid={`q-toggle-${section.id}`} />
        </div>
        {qEnabled && (
          <div className="ml-6 space-y-2">
            <div>
              <Label className="text-[var(--t4)] text-xs">Choose a Question</Label>
              <Select value={isCustomQuestion && question !== '__custom__' ? '__custom__' : question} onValueChange={(v) => { setQuestion(v); if (v !== '__custom__') setCustomQ(''); }}>
                <SelectTrigger className="input-field mt-1 w-full text-base">
                  <SelectValue placeholder="Select a question..." />
                </SelectTrigger>
                <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)] max-h-60" style={{ zIndex: 99999 }}>
                  {questions.map(q => (
                    <SelectItem key={q} value={q} className="text-[var(--t2)] hover:bg-[var(--s)] cursor-pointer text-base">{q}</SelectItem>
                  ))}
                  <SelectItem value="__custom__" className="text-[var(--pr2)] hover:bg-[var(--s)] cursor-pointer text-base font-bold">Write my own question...</SelectItem>
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
              <Label className="text-[var(--t4)] text-xs">Your Answer <span className="text-red-400">*</span></Label>
              <Input
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                placeholder={s.has_security_question ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (already set, enter to change)' : 'Enter your answer'}
                className="input-field mt-1 text-sm"
                data-testid={`q-answer-${section.id}`}
              />
            </div>
            {s.has_security_question && <p className="text-[11px] text-[var(--gn2)] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Security question set</p>}
          </div>
        )}
      </div>

      <Separator className="bg-[var(--b)]" />

      {/* Action Buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          className="flex-1 text-sm"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', color: 'white' }}
          disabled={saving || (!pinEnabled && !pwEnabled && !qEnabled)}
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

      {/* Master Key Verification Modal */}
      {showMasterKeyModal && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center px-4 overflow-y-auto" onClick={() => { setShowMasterKeyModal(false); setPendingToggle(null); }}>
          <div className="rounded-2xl p-6 max-w-sm w-full border border-[var(--b2)]" style={{ background: 'var(--bg)' }} onClick={e => e.stopPropagation()} data-testid="master-key-verify-modal">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[var(--gold)]/10 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-[var(--gold)]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--t)]">Confirm with Master Key</h3>
                <p className="text-xs text-[var(--t4)]">Enter your Vault Master Key to modify security settings</p>
              </div>
            </div>
            <div className="relative mb-3">
              <Input
                type={showMasterKeyVerifyValue ? 'text' : 'password'}
                value={masterKeyVerify}
                onChange={e => setMasterKeyVerify(e.target.value)}
                placeholder="Enter your master key"
                className="input-field pr-10"
                style={{ fontSize: '16px' }}
                onKeyDown={e => e.key === 'Enter' && masterKeyVerify && verifyMasterKey()}
                autoFocus
                data-testid="master-key-verify-input"
              />
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setShowMasterKeyVerifyValue(!showMasterKeyVerifyValue)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)] hover:text-[var(--t)] transition-colors"
                data-testid="master-key-verify-toggle"
              >
                {showMasterKeyVerifyValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-[var(--b)] text-[var(--t)]" onClick={() => { setShowMasterKeyModal(false); setPendingToggle(null); }}>Cancel</Button>
              <Button className="flex-1 gold-button" disabled={!masterKeyVerify || masterKeyVerifying} onClick={verifyMasterKey} data-testid="master-key-verify-confirm">
                {masterKeyVerifying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Confirm
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SecuritySettings;
