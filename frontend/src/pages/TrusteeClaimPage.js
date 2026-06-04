import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { toast } from '../utils/toast';
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * TrusteeClaimPage — public claim flow.
 *
 * 1. Load invite preview by token from the URL.
 * 2. Trustee chooses username + password → OTP fired to their email.
 * 3. Trustee enters OTP → grant activated.
 * 4. Auto-redirect to /login with a success toast.
 */
const TrusteeClaimPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [stage, setStage] = useState('loading'); // loading | invalid | form | otp | done
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  // form fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [busy, setBusy] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!token) { setStage('invalid'); return; }
    setStage('loading');
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const r = await apiClient.get(`${API_URL}/trustee/claim/${token}`);
        setPreview(r.data);
        setUsername(r.data.suggested_username || '');
        setStage('form');
        return;
      } catch (e) {
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail;
        // Definitive server rejection (invalid / expired / already used): show it now, no retry.
        if (detail && status >= 400 && status < 500) {
          setError(detail);
          setStage('invalid');
          return;
        }
        // Transient failure (network drop, CORS preflight, 5xx, or a cold backend
        // waking up) — wait and retry with backoff before giving up.
        if (attempt < maxAttempts) {
          await new Promise((res) => setTimeout(res, attempt * 2500));
          continue;
        }
        setError('We couldn\u2019t reach CarryOn just now. The server may be waking up — please tap "Try again" in a moment.');
        setStage('invalid');
      }
    }
  }, [token]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const handleStart = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Choose a password of at least 8 characters.');
      return;
    }
    if (password !== passwordConfirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`${API_URL}/trustee/claim/${token}/start`, {
        username: username.trim(),
        password,
      });
      toast.success('Verification code sent to your email.');
      setStage('otp');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not start the claim.');
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 4) {
      toast.error('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`${API_URL}/trustee/claim/${token}/complete`, {
        otp_code: otpCode.trim(),
      });
      setStage('done');
      toast.success('Trustee access activated.');
      setTimeout(() => navigate('/login'), 2400);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="trustee-claim-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 0%, rgba(212,175,55,0.12), transparent 60%), #0F1629',
        padding: 24,
      }}
    >
      <Card className="glass-card" style={{ width: '100%', maxWidth: 520 }}>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-[var(--gold)]" />
            <h1 className="text-[var(--t)] text-xl font-bold">Trustee Access — CarryOn™</h1>
          </div>

          {stage === 'loading' && (
            <div className="flex items-center gap-2 text-[var(--t4)]">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading invite…
            </div>
          )}

          {stage === 'invalid' && (
            <div
              className="rounded-xl p-4 flex items-start gap-3"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
              <div>
                <p className="text-[var(--t)] text-sm font-bold">Invite unavailable</p>
                <p className="text-[var(--t4)] text-sm mt-1">{error}</p>
                <p className="text-[var(--t5)] text-xs mt-2">Ask the benefactor to resend the invite from their Settings page.</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={loadPreview}
                  data-testid="trustee-claim-retry"
                  className="mt-3 h-8 text-xs"
                >
                  Try again
                </Button>
              </div>
            </div>
          )}

          {stage === 'form' && preview && (
            <form onSubmit={handleStart} className="space-y-4">
              <div
                className="rounded-xl p-4"
                style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}
              >
                <p className="text-[var(--t)] text-sm">
                  <strong>{preview.benefactor_name}</strong> has invited you to act as their trustee on CarryOn™.
                </p>
                <p className="text-[var(--t5)] text-sm mt-1">
                  Choose a username and password. You'll be asked to verify your email with a code in the next step.
                </p>
              </div>

              <div>
                <label htmlFor="tcl-uname" className="text-[var(--t)] text-sm font-bold">Choose your username</label>
                <Input
                  id="tcl-uname"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  data-testid="trustee-claim-username"
                  autoComplete="username"
                  required
                />
                <p className="text-[var(--t5)] text-xs mt-1">Letters, numbers, dots, hyphens, underscores only.</p>
              </div>

              <div>
                <label htmlFor="tcl-pw" className="text-[var(--t)] text-sm font-bold">Choose your password</label>
                <div className="relative">
                  <Input
                    id="tcl-pw"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    data-testid="trustee-claim-password"
                    autoComplete="new-password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    data-testid="trustee-claim-password-toggle"
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--t5)] hover:text-[var(--t)] transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[var(--t5)] text-xs mt-1">Minimum 8 characters.</p>
              </div>

              <div>
                <label htmlFor="tcl-pw2" className="text-[var(--t)] text-sm font-bold">Confirm password</label>
                <div className="relative">
                  <Input
                    id="tcl-pw2"
                    type={showPw2 ? 'text' : 'password'}
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    data-testid="trustee-claim-password-confirm"
                    autoComplete="new-password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw2((v) => !v)}
                    aria-label={showPw2 ? 'Hide password' : 'Show password'}
                    data-testid="trustee-claim-password-confirm-toggle"
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--t5)] hover:text-[var(--t)] transition-colors"
                  >
                    {showPw2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={busy} className="w-full" data-testid="trustee-claim-start">
                {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Continue
              </Button>
            </form>
          )}

          {stage === 'otp' && (
            <form onSubmit={handleComplete} className="space-y-4">
              <div
                className="rounded-xl p-4"
                style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}
              >
                <p className="text-[var(--t)] text-sm">
                  We just emailed a 6-digit verification code to <strong>{preview?.trustee_email}</strong>.
                </p>
                <p className="text-[var(--t5)] text-sm mt-1">Enter it below to finish activating your trustee access. The code expires in 10 minutes.</p>
              </div>
              <div>
                <label htmlFor="tcl-otp" className="text-[var(--t)] text-sm font-bold">Verification code</label>
                <Input
                  id="tcl-otp"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  placeholder="123456"
                  data-testid="trustee-claim-otp"
                  required
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full" data-testid="trustee-claim-complete">
                {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Verify and activate
              </Button>
            </form>
          )}

          {stage === 'done' && (
            <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <p className="text-[var(--t)] text-sm font-bold">Trustee access activated</p>
                <p className="text-[var(--t4)] text-sm mt-1">You can now sign in with your chosen username and password. Redirecting to the login page…</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TrusteeClaimPage;
