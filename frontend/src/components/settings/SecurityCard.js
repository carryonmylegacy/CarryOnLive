import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, Mail, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const SecurityCard = () => {
  const { user, getAuthHeaders } = useAuth();

  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
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

  useEffect(() => {
    if (!user) return;
    // Check passkey support
    if (window.PublicKeyCredential) {
      setPasskeySupported(true);
      axios.get(`${API_URL}/auth/passkeys`, getAuthHeaders())
        .then(res => setPasskeyRegistered((res.data.passkeys || []).length > 0))
        .catch(() => {});
    }
    // Fetch 2FA preference
    axios.get(`${API_URL}/auth/2fa-preference`, getAuthHeaders()).then(res => {
      setUserOtpEnabled(res.data.otp_enabled !== false);
      setGlobalOtpDisabled(res.data.global_disabled || false);
    }).catch(() => {});
    // Fetch SMS OTP status
    axios.get(`${API_URL}/auth/sms-otp-status`, getAuthHeaders()).then(res => {
      setSmsOtpEnabled(res.data.sms_otp_enabled || false);
      setSmsMaskedPhone(res.data.masked_phone || null);
    }).catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePasskeyToggle = useCallback(async (checked) => {
    setPasskeyLoading(true);
    try {
      if (checked) {
        const optionsRes = await axios.post(`${API_URL}/auth/passkey/register-options`, {}, getAuthHeaders());
        const { startRegistration } = await import('@simplewebauthn/browser');
        const credential = await startRegistration(optionsRes.data);
        await axios.post(`${API_URL}/auth/passkey/register-verify`, credential, getAuthHeaders());
        setPasskeyRegistered(true);
        toast.success('Passkey registered');
      } else {
        const res = await axios.get(`${API_URL}/auth/passkeys`, getAuthHeaders());
        const passkeys = res.data.passkeys || [];
        if (passkeys.length > 0) {
          await axios.delete(`${API_URL}/auth/passkeys/${passkeys[0].id}`, getAuthHeaders());
        }
        setPasskeyRegistered(false);
        toast.success('Passkey removed');
      }
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        toast.error(err.response?.data?.detail || 'Passkey operation failed');
      }
    } finally { setPasskeyLoading(false); }
  }, [getAuthHeaders]);

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-[var(--t)] flex items-center gap-2">
          <Lock className="w-5 h-5 text-[var(--gold)]" />
          Security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {passkeySupported && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-[var(--t)] font-medium">Passkey (Face ID / Touch ID)</h4>
                <p className="text-[var(--t5)] text-sm">Sign in without a password</p>
              </div>
              <Switch checked={passkeyRegistered} onCheckedChange={handlePasskeyToggle} disabled={passkeyLoading} data-testid="settings-passkey-toggle" />
            </div>
            <Separator className="bg-[var(--b)]" />
          </>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-[var(--t)] font-medium">Two-Factor Authentication</h4>
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
                await axios.put(`${API_URL}/auth/2fa-preference`, { otp_enabled: checked }, getAuthHeaders());
                setUserOtpEnabled(checked);
                toast.success(checked ? '2FA enabled' : '2FA disabled');
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
                <div>
                  <h4 className="text-[var(--t)] font-medium flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    SMS Verification Codes
                  </h4>
                  <p className="text-[var(--t5)] text-sm">
                    {smsOtpEnabled
                      ? `Enabled — codes sent to ${smsMaskedPhone || 'your phone'}`
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
                        await axios.delete(`${API_URL}/auth/sms-otp`, getAuthHeaders());
                        setSmsOtpEnabled(false);
                        setSmsMaskedPhone(null);
                        setSmsSetupStep('idle');
                        toast.success('SMS verification disabled');
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
                          }, getAuthHeaders());
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
                          await axios.post(`${API_URL}/auth/sms-otp-verify`, { otp: smsVerifyCode }, getAuthHeaders());
                          setSmsOtpEnabled(true);
                          setSmsSetupStep('idle');
                          setSmsVerifyCode('');
                          toast.success('SMS verification enabled! Login codes will now be sent via text message.');
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
      </CardContent>
    </Card>
  );
};

export default SecurityCard;
