/**
 * MobileOtpToggle — admin-only quick toggle for platform-wide OTP.
 * Extracted from MobileNav.js for clarity.
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ShieldCheck } from 'lucide-react';
import { API_URL } from '../../config';

const MobileOtpToggle = () => {
  const [otpDisabled, setOtpDisabled] = useState(false);
  useEffect(() => {
    const token = localStorage.getItem('carryon_token');
    if (token) {
      axios.get(`${API_URL}/admin/platform-settings`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => setOtpDisabled(res.data?.otp_disabled || false)).catch(() => {});
    }
  }, []);
  const toggle = () => {
    const newVal = !otpDisabled;
    setOtpDisabled(newVal);
    const token = localStorage.getItem('carryon_token');
    axios.put(
      `${API_URL}/admin/platform-settings`,
      { otp_disabled: newVal },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    ).catch(() => setOtpDisabled(!newVal));
  };
  return (
    <button
      onClick={toggle}
      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all"
      style={{
        background: otpDisabled ? 'rgba(239,68,68,0.08)' : 'var(--b)',
        border: `1px solid ${otpDisabled ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)'}`,
      }}
    >
      <ShieldCheck className="w-5 h-5" style={{ color: otpDisabled ? '#ef4444' : '#10b981' }} />
      <span className="font-medium" style={{ color: otpDisabled ? '#ef4444' : '#A0AABF' }}>
        OTP {otpDisabled ? 'Disabled' : 'Enabled'}
      </span>
    </button>
  );
};

export default MobileOtpToggle;
