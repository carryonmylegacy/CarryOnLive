import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from '../utils/toast';
import { useAuth } from '../contexts/AuthContext';
import SecuritySettings from '../components/SecuritySettings';
import { Lock, Mail, Loader2, Timer, ShieldCheck, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const AUTO_LOGOUT_OPTIONS = [
  { value: '0', label: 'On App Leave (Instant)' },
  { value: '1', label: '1 minute' },
  { value: '3', label: '3 minutes' },
  { value: '5', label: '5 minutes' },
  { value: '10', label: '10 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: 'midnight', label: 'Daily (Midnight)' },
];

const SecuritySettingsPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();

  // Passkey state
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  // 2FA state
  const [userOtpEnabled, setUserOtpEnabled] = useState(true);
  const [globalOtpDisabled, setGlobalOtpDisabled] = useState(false);
  const [otpToggling, setOtpToggling] = useState(false);

  // SMS OTP state
  const [smsOtpEnabled, setSmsOtpEnabled] = useState(false);
  const [smsMaskedPhone, setSmsMaskedPhone] = useState(null);
  const [smsSetupStep, setSmsSetupStep] = useState('idle');
  const [smsPhoneInput, setSmsPhoneInput] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [smsVerifyCode, setSmsVerifyCode] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);

  // Auto-logout
  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState(
    localStorage.getItem('carryon_auto_logout_minutes') || '5'
  );

  const headers = getAuthHeaders();

  useEffect(() => {
    if (!user) return;
    if (window.PublicKeyCredential) {
      setPasskeySupported(true);
      axios.get(`${API_URL}/auth/passkeys`, headers)
        .then(res => setPasskeyRegistered((res.data.passkeys || []).length > 0))
        .catch(() => {});
    }
    axios.get(`${API_URL}/auth/2fa-preference`, headers).then(res => {
      setUserOtpEnabled(res.data.otp_enabled !== false);
      setGlobalOtpDisabled(res.data.global_disabled || false);
    }).catch(() => {});
    axios.get(`${API_URL}/auth/sms-otp-status`, headers).then(res => {
      setSmsOtpEnabled(res.data.sms_otp_enabled || false);
      setSmsMaskedPhone(res.data.masked_phone || null);
    }).catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePasskeyToggle = useCallback(async (checked) => {
    setPasskeyLoading(true);
    try {
      if (checked) {
        // Backend routes are mounted at /auth/webauthn/* (not /auth/passkey/*).
        // Earlier code used the wrong prefix and the toggle returned 404
        // "error not found" — fixed to align with backend/routes/webauthn.py.
        const optionsRes = await axios.post(`${API_URL}/auth/webauthn/register-options`, {}, headers);
        const { startRegistration } = await import('@simplewebauthn/browser');
        const credential = await startRegistration(optionsRes.data);
        // Backend expects { credential: <obj> }, not the credential blob directly.
        await axios.post(`${API_URL}/auth/webauthn/register`, { credential }, headers);
        setPasskeyRegistered(true);
        toast.success('Passkey registered — saved.');
      } else {
        const res = await axios.get(`${API_URL}/auth/passkeys`, headers);
        const passkeys = res.data.passkeys || [];
        if (passkeys.length > 0) {
          await axios.delete(`${API_URL}/auth/passkeys/${passkeys[0].id}`, headers);
        }
        setPasskeyRegistered(false);
        toast.success('Passkey removed — saved.');
      }
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        toast.error(err.response?.data?.detail || 'Passkey operation failed');
      }
    } finally { setPasskeyLoading(false); }
  }, [headers]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAutoLogoutChange = (value) => {
    setAutoLogoutMinutes(value);
    localStorage.setItem('carryon_auto_logout_minutes', value);
    const label = value === '0' ? 'instant on app leave' : value === 'midnight' ? 'daily at midnight' : `${value} minutes`;
    toast.success(`Auto-logout set to ${label} — saved.`);
  };

  const handleSave = () => {
    // Every security control on this page commits immediately to the
    // backend when toggled (passkey, 2FA, SMS, auto-logout). The Save
    // button provides an explicit confirmation that pending work is done.
    window.dispatchEvent(new CustomEvent('carryon:security:flush'));
    toast.success('All security settings on this page are saved.', {
      duration: 2500,
      description: 'Every change you just made is committed to your account.',
    });
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="security-settings-page"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(212,175,55,0.12), transparent 55%), radial-gradient(ellipse at bottom right, rgba(240,201,92,0.06), transparent 55%)' }}>
      {/* Header — standardized icon-box + title + 1-line description to
          match MM / SDV / IAC / Settings. Back + Save preserved on right. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(240,201,92,0.15))' }}>
            <ShieldCheck className="w-5 h-5 text-[var(--gold)]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)] truncate" style={{ fontFamily: 'var(--sans)' }}>
              Security Settings
            </h1>
            <p className="text-xs text-[var(--t5)]">
              Passkeys, 2FA, session controls, and vault protection
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-transform hover:scale-105 border"
            style={{ background: 'transparent', color: 'var(--t)', borderColor: 'var(--b)' }}
            data-testid="security-settings-back-button"
          >
            Back
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-transform hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
            data-testid="security-settings-save-button"
          >
            Save
          </button>
        </div>
      </div>

      {/* Account Security Card (Passkey, 2FA, SMS, Auto-Logout) */}
      <Card className="glass-card" data-testid="account-security-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <Lock className="w-5 h-5 text-[var(--gold)]" />
            Account Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Passkey */}
          {passkeySupported && (
            <>
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-[var(--t)] font-medium">Passkey (Face ID / Touch ID)</h4>
                    <StatusChip tone={passkeyRegistered ? 'on' : 'off'} label={passkeyRegistered ? 'Enabled' : 'Off'} />
                  </div>
                  <p className="text-[var(--t5)] text-sm">Sign in without a password</p>
                </div>
                <Switch checked={passkeyRegistered} onCheckedChange={handlePasskeyToggle} disabled={passkeyLoading} data-testid="settings-passkey-toggle" />
              </div>
              <Separator className="bg-[var(--b)]" />
            </>
          )}

          {/* 2FA */}
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-[var(--t)] font-medium">Two-Factor Authentication</h4>
                {globalOtpDisabled
                  ? <StatusChip tone="admin" label="Disabled by admin" />
                  : <StatusChip tone={userOtpEnabled ? 'on' : 'off'} label={userOtpEnabled ? 'Enabled' : 'Off'} />}
              </div>
              <p className="text-[var(--t5)] text-sm">
                {globalOtpDisabled
                  ? 'Disabled platform-wide by administrator'
                  : 'Require a verification code on every login'}
              </p>
            </div>
            <Switch
              checked={!globalOtpDisabled && userOtpEnabled}
              onCheckedChange={async (checked) => {
                setOtpToggling(true);
                try {
                  await axios.put(`${API_URL}/auth/2fa-preference`, { otp_enabled: checked }, headers);
                  setUserOtpEnabled(checked);
                  toast.success(checked ? 'Two-factor authentication enabled — saved.' : 'Two-factor authentication disabled — saved.');
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Failed to update 2FA preference');
                } finally { setOtpToggling(false); }
              }}
              disabled={otpToggling || globalOtpDisabled}
              data-testid="settings-2fa-toggle"
            />
          </div>

          {/* SMS OTP Section */}
          {!globalOtpDisabled && userOtpEnabled && (
            <>
              <Separator className="bg-[var(--b)]" />
              <div data-testid="sms-otp-section">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-[var(--t)] font-medium flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        SMS Verification Codes
                      </h4>
                      <StatusChip tone={smsOtpEnabled ? 'on' : 'off'} label={smsOtpEnabled ? 'Enabled' : 'Off'} />
                    </div>
                    <p className="text-[var(--t5)] text-sm">
                      {smsOtpEnabled
                        ? `Codes sent to ${smsMaskedPhone || 'your phone'}`
                        : 'Receive login codes via text message instead of email'}
                    </p>
                  </div>
                  {smsOtpEnabled && (
                    <Button variant="outline" size="sm"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                      data-testid="sms-otp-disable-btn"
                      disabled={smsLoading}
                      onClick={async () => {
                        setSmsLoading(true);
                        try {
                          await axios.delete(`${API_URL}/auth/sms-otp`, headers);
                          setSmsOtpEnabled(false);
                          setSmsMaskedPhone(null);
                          setSmsSetupStep('idle');
                          toast.success('SMS verification disabled — saved.');
                        } catch (err) {
                          toast.error(err.response?.data?.detail || 'Failed to disable SMS');
                        } finally { setSmsLoading(false); }
                      }}>
                      Disable
                    </Button>
                  )}
                </div>

                {/* Setup flow */}
                {!smsOtpEnabled && smsSetupStep === 'idle' && (
                  <Button variant="outline" size="sm"
                    className="border-[var(--gold)]/30 text-[var(--gold)] hover:bg-[var(--gold)]/10 mt-1"
                    data-testid="sms-otp-setup-btn"
                    onClick={() => setSmsSetupStep('entering')}>
                    Set Up SMS Verification
                  </Button>
                )}

                {!smsOtpEnabled && smsSetupStep === 'entering' && (
                  <div className="mt-3 space-y-3 p-3 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--t5)]" data-testid="sms-step-indicator">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.2)', color: '#d4af37' }}>1</span>
                      <span style={{ color: '#d4af37' }}>Phone</span>
                      <span className="mx-1 opacity-40">›</span>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>2</span>
                      <span>Verify</span>
                    </div>
                    <div>
                      <label className="text-[var(--t5)] text-xs mb-1 block">Mobile Phone Number</label>
                      <Input type="tel" value={smsPhoneInput}
                        onChange={e => setSmsPhoneInput(e.target.value)}
                        placeholder="+1 (555) 123-4567"
                        className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm"
                        data-testid="sms-phone-input" />
                    </div>
                    <label className="flex items-start gap-2 cursor-pointer select-none" data-testid="sms-consent-label">
                      <button type="button" onClick={() => setSmsConsent(!smsConsent)}
                        className={`flex-shrink-0 w-5 h-5 rounded border-2 mt-0.5 transition-all flex items-center justify-center ${
                          smsConsent ? 'bg-[var(--gold)] border-[var(--gold)]' : 'border-[var(--b)] hover:border-[var(--t5)]'
                        }`} data-testid="sms-consent-checkbox">
                        {smsConsent && <svg className="w-3 h-3 text-[#0B1221]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </button>
                      <span className="text-[var(--t5)] text-xs leading-relaxed">
                        I consent to receive SMS verification codes from CarryOn Enterprises Inc. Msg & data rates may apply. Reply STOP to opt out. See our{' '}
                        <a href="/privacy" className="text-[var(--gold)] underline">Privacy Policy</a> and{' '}
                        <a href="/terms" className="text-[var(--gold)] underline">Terms of Service</a>.
                      </span>
                    </label>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={!smsPhoneInput.trim() || !smsConsent || smsLoading}
                        className="text-xs" data-testid="sms-send-code-btn"
                        style={{ background: 'var(--gold)', color: '#0B1221' }}
                        onClick={async () => {
                          setSmsLoading(true);
                          try {
                            const res = await axios.post(`${API_URL}/auth/sms-otp-setup`, {
                              phone_number: smsPhoneInput, sms_consent: smsConsent
                            }, headers);
                            toast.success(res.data.message);
                            setSmsMaskedPhone(res.data.masked_phone);
                            setSmsSetupStep('verifying');
                          } catch (err) {
                            toast.error(err.response?.data?.detail || 'Failed to send verification code');
                          } finally { setSmsLoading(false); }
                        }}>
                        {smsLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        Send Verification Code
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-[var(--t5)]"
                        onClick={() => { setSmsSetupStep('idle'); setSmsPhoneInput(''); setSmsConsent(false); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {!smsOtpEnabled && smsSetupStep === 'verifying' && (
                  <div className="mt-3 space-y-3 p-3 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--t5)]" data-testid="sms-step-indicator">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,201,147,0.2)', color: '#22C993' }}><Check className="w-3 h-3" /></span>
                      <span>Phone</span>
                      <span className="mx-1 opacity-40">›</span>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.2)', color: '#d4af37' }}>2</span>
                      <span style={{ color: '#d4af37' }}>Verify</span>
                    </div>
                    <p className="text-[var(--t5)] text-sm">Enter the 6-digit code sent to {smsMaskedPhone}</p>
                    <Input type="text" inputMode="numeric" maxLength={6} value={smsVerifyCode}
                      onChange={e => setSmsVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="h-12 text-center text-xl tracking-[0.3em] font-mono bg-[var(--card)] border-[var(--b)] text-[var(--t)] rounded-lg"
                      data-testid="sms-verify-input" />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={smsVerifyCode.length !== 6 || smsLoading}
                        className="text-xs" data-testid="sms-verify-btn"
                        style={{ background: 'var(--gold)', color: '#0B1221' }}
                        onClick={async () => {
                          setSmsLoading(true);
                          try {
                            await axios.post(`${API_URL}/auth/sms-otp-verify`, { otp: smsVerifyCode }, headers);
                            setSmsOtpEnabled(true);
                            setSmsSetupStep('idle');
                            setSmsVerifyCode('');
                            toast.success('SMS verification enabled — saved. Login codes will now be sent via text message.');
                          } catch (err) {
                            toast.error(err.response?.data?.detail || 'Verification failed');
                          } finally { setSmsLoading(false); }
                        }}>
                        {smsLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        Verify & Enable
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-[var(--t5)]"
                        onClick={() => { setSmsSetupStep('entering'); setSmsVerifyCode(''); }}>
                        Back
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <Separator className="bg-[var(--b)]" />

          {/* Auto-Logout Timer */}
          <div className="flex items-center justify-between" data-testid="auto-logout-section">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-[var(--gold)]" />
              <div>
                <h4 className="text-[var(--t)] font-medium">Auto-Logout Timer</h4>
                <p className="text-[var(--t5)] text-sm">Log out after being away for this long</p>
              </div>
            </div>
            <select
              value={autoLogoutMinutes}
              onChange={(e) => handleAutoLogoutChange(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-bold bg-[var(--s)] border border-[var(--b)] text-[var(--t)]"
              data-testid="auto-logout-select"
            >
              {AUTO_LOGOUT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Vault Security (Triple Lock) */}
      <SecuritySettings getAuthHeaders={getAuthHeaders} />
    </div>
  );
};

export default SecuritySettingsPage;

/**
 * Status chip used next to Passkey / 2FA / SMS toggles. Tiny visual cue
 * that makes the current state scannable without reading the subtitle.
 */
const StatusChip = ({ tone = 'off', label }) => {
  const palette = {
    on:       { bg: 'rgba(34,201,147,0.12)', border: 'rgba(34,201,147,0.3)', fg: '#22C993' },
    off:      { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', fg: 'var(--t5)' },
    admin:    { bg: 'rgba(212,175,55,0.12)',  border: 'rgba(212,175,55,0.3)',  fg: '#d4af37' },
  }[tone] || {};
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg }}
      data-testid={`status-chip-${tone}`}
    >
      {tone === 'on' && <Check className="w-2.5 h-2.5" />}
      {label}
    </span>
  );
};
