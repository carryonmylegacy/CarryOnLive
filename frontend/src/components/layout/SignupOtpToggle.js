/**
 * SignupOtpToggle — admin-only platform toggle that controls whether NEW
 * user signups must clear an email-OTP gate before being dropped onto
 * their dashboard. This is intentionally distinct from the existing
 * per-login OTP toggle (`otp_disabled`) which gates returning users.
 *
 * Default OFF (i.e. signup OTP is required) — admin flips ON for QA /
 * automation runs and back OFF afterward.
 *
 * Mirrors the shape of MobileOtpToggle.js for visual consistency.
 */
import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/apiClient';
import { UserPlus, Loader2 } from 'lucide-react';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';

const SignupOtpToggle = () => {
  const [signupOtpDisabled, setSignupOtpDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const authHeaders = () => ({
    headers: {
      Authorization: `Bearer ${localStorage.getItem('carryon_token')}`,
      'Content-Type': 'application/json',
    },
  });

  useEffect(() => {
    const token = localStorage.getItem('carryon_token');
    if (!token) { setLoaded(true); return; }
    apiClient.get(`${API_URL}/admin/platform-settings`, authHeaders())
      .then(res => {
        setSignupOtpDisabled(!!res.data?.signup_otp_disabled);
        setLoaded(true);
      })
      .catch((err) => {
        setLoaded(true);
        if (err?.response?.status && err.response.status !== 401) {
          toast.error("Couldn't read signup-OTP state — tap again in a moment.");
        }
      });
  }, []);

  const toggle = async () => {
    if (busy) return;
    const newVal = !signupOtpDisabled;
    setSignupOtpDisabled(newVal); // optimistic
    setBusy(true);
    try {
      const res = await apiClient.put(
        `${API_URL}/admin/platform-settings`,
        { signup_otp_disabled: newVal },
        authHeaders(),
      );
      const authoritative = !!res.data?.signup_otp_disabled;
      setSignupOtpDisabled(authoritative);
      toast.success(authoritative ? 'Signup OTP gate DISABLED — new signups skip email verify' : 'Signup OTP gate ENABLED — new signups must verify email');
    } catch (err) {
      setSignupOtpDisabled(!newVal);
      const detail = err?.response?.data?.detail || err?.message || 'request failed';
      toast.error(`Could not update signup-OTP setting — ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy || !loaded}
      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl disabled:opacity-60"
      style={{
        background: signupOtpDisabled ? 'rgba(239,68,68,0.08)' : 'var(--b)',
        border: `1px solid ${signupOtpDisabled ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)'}`,
        // iOS Safari sub-pixel RGB-fringe fix: transition only background +
        // border-color (not text color or `all`). Switching color across the
        // green→red palette via `transition-all` makes the font letters
        // briefly chromatically separate during the tween. Bigsur+/iOS17 +
        // -webkit-font-smoothing rendering paths show RGB sub-pixel
        // misalignment when the parent's color is mid-tween.
        transition: 'background-color 160ms ease, border-color 160ms ease',
        // Snap text color and icon color instantly so the eye doesn't see a
        // chromatic-fringe artifact along the edges of the glyphs.
        WebkitTransitionProperty: 'background-color, border-color',
      }}
      data-testid="mobile-signup-otp-toggle"
    >
      {busy ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#A0AABF' }} />
            : <UserPlus className="w-5 h-5" style={{ color: signupOtpDisabled ? '#ef4444' : '#10b981' }} />}
      <span className="font-medium" style={{ color: signupOtpDisabled ? '#ef4444' : '#A0AABF' }}>
        Signup OTP {signupOtpDisabled ? 'Disabled' : 'Enabled'}
      </span>
    </button>
  );
};

export default SignupOtpToggle;
