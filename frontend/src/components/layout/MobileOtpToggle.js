/**
 * MobileOtpToggle — admin-only quick toggle for platform-wide OTP.
 * Extracted from MobileNav.js for clarity.
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';

const MobileOtpToggle = () => {
  const [otpDisabled, setOtpDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const authHeaders = () => ({
    headers: {
      Authorization: `Bearer ${localStorage.getItem('carryon_token')}`,
      'Content-Type': 'application/json',
    },
  });

  useEffect(() => {
    // Fetch authoritative state. Surface a toast on failure so the admin
    // isn't left looking at a stale-green "OTP Enabled" badge when the
    // real server state is the opposite.
    const token = localStorage.getItem('carryon_token');
    if (!token) { setLoaded(true); return; }
    axios.get(`${API_URL}/admin/platform-settings`, authHeaders())
      .then(res => {
        setOtpDisabled(!!res.data?.otp_disabled);
        setLoaded(true);
      })
      .catch((err) => {
        setLoaded(true);
        if (err?.response?.status && err.response.status !== 401) {
          toast.error("Couldn't read OTP state — tap again in a moment.");
        }
      });
  }, []);

  const toggle = async () => {
    if (busy) return;
    const newVal = !otpDisabled;
    setOtpDisabled(newVal); // optimistic
    setBusy(true);
    try {
      const res = await axios.put(
        `${API_URL}/admin/platform-settings`,
        { otp_disabled: newVal },
        authHeaders(),
      );
      // Server returns authoritative settings — use that as the truth,
      // not our optimistic value. Fixes drift if someone else toggled on
      // another device.
      const authoritative = !!res.data?.otp_disabled;
      setOtpDisabled(authoritative);
      toast.success(authoritative ? 'OTP disabled platform-wide' : 'OTP enabled platform-wide');
    } catch (err) {
      // Revert + explain.
      setOtpDisabled(!newVal);
      const detail = err?.response?.data?.detail || err?.message || 'request failed';
      toast.error(`Could not update OTP setting — ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy || !loaded}
      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all disabled:opacity-60"
      style={{
        background: otpDisabled ? 'rgba(239,68,68,0.08)' : 'var(--b)',
        border: `1px solid ${otpDisabled ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)'}`,
      }}
      data-testid="mobile-otp-toggle"
    >
      {busy ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#A0AABF' }} />
            : <ShieldCheck className="w-5 h-5" style={{ color: otpDisabled ? '#ef4444' : '#10b981' }} />}
      <span className="font-medium" style={{ color: otpDisabled ? '#ef4444' : '#A0AABF' }}>
        OTP {otpDisabled ? 'Disabled' : 'Enabled'}
      </span>
    </button>
  );
};

export default MobileOtpToggle;
