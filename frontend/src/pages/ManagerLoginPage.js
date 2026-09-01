/**
 * ManagerLoginPage — dedicated sign-in for B2B partner managers
 * (credentials created by the founder in Admin → Finance → Partners →
 * Managers). Completely separate from user/founder auth: manager
 * tokens live in `carryon_manager_token` and only work on /api/manager/*.
 *
 * First sign-in with a founder-issued (assigned or generated) password
 * returns password_change_required + a limited-scope change token — the
 * manager must create their own password before a portal session exists.
 */

import { FlagBackdrop } from '../components/FlagBackdrop';
import SEO from '../components/SEO';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { Loader2, Lock, User, ShieldCheck, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from '../utils/toast';
import { API_URL } from '../config';

export default function ManagerLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Set-your-own-password phase (first login with a founder-issued password)
  const [changeToken, setChangeToken] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);

  const enterPortal = (data) => {
    localStorage.setItem('carryon_manager_token', data.access_token);
    localStorage.setItem('carryon_manager_info', JSON.stringify(data.manager));
    navigate('/partner/portal');
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    setSubmitting(true);
    try {
      const { data } = await apiClient.post(`${API_URL}/manager/login`, { username: username.trim(), password });
      if (data.password_change_required) {
        setChangeToken(data.change_token);
        setSubmitting(false);
        return;
      }
      enterPortal(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Sign-in failed');
      setSubmitting(false);
    }
  };

  const submitNewPassword = async (e) => {
    e?.preventDefault?.();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await apiClient.post(`${API_URL}/manager/set-password`, {
        change_token: changeToken,
        new_password: newPassword,
      });
      toast.success('Password set — welcome to your portal');
      enterPortal(data);
    } catch (err) {
      const status = err.response?.status;
      toast.error(err.response?.data?.detail || 'Could not set your password');
      if (status === 401 || status === 409) {
        // Change session expired or already used — back to sign-in.
        setChangeToken(null);
        setNewPassword('');
        setConfirmPassword('');
        setPassword('');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center py-10" style={{ background: 'var(--bg)' }} data-testid="manager-login-page">
      {/* Gated portal entry (manager sign-in) — noindex, deliberately NOT in sitemap.xml */}
      <SEO title="Partner With CarryOn" description="Bring family continuity to the people you serve. How advisors, planners, and organizations partner with CarryOn." path="/partner" noindex />
      <div className="absolute inset-0 z-0">
        <FlagBackdrop style={{ filter: 'brightness(0.55) contrast(1.05)' }} />
      </div>
      <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.55) 0%, rgba(11,18,33,0.85) 100%)' }} />
      <div className="relative z-10 max-w-md w-full mx-6 rounded-2xl p-8" style={{
        background: 'linear-gradient(160deg, rgba(17,27,48,0.97), rgba(13,22,40,0.99))',
        border: '1px solid rgba(var(--gold-rgb), 0.18)',
        boxShadow: '0 8px 80px rgba(0,0,0,0.5)',
      }}>
        {changeToken ? (
          <>
            <div className="text-center mb-6" data-testid="manager-setpw-screen">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.4)' }}>
                <KeyRound className="w-7 h-7 text-[#d4af37]" />
              </div>
              <h1 className="text-white text-2xl font-semibold mb-1.5" style={{ fontFamily: 'var(--serif)' }}>Create Your Password</h1>
              <p className="text-white/70 text-sm">Your temporary password worked. Now choose a new password that only you know.</p>
            </div>

            <form onSubmit={submitNewPassword} className="space-y-3.5">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                <Input type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  required placeholder="New password" autoComplete="new-password"
                  className="h-11 pl-10 pr-10 bg-[#0B1627] border-[#1A2D48] text-white rounded-lg"
                  data-testid="manager-setpw-new" />
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#334155] hover:text-[#7b879e]"
                  aria-label="Toggle password visibility">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                <Input type={showNew ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  required placeholder="Confirm new password" autoComplete="new-password"
                  className="h-11 pl-10 bg-[#0B1627] border-[#1A2D48] text-white rounded-lg"
                  data-testid="manager-setpw-confirm" />
              </div>
              <p className="text-white/45 text-xs">At least 8 characters, with an uppercase letter, a lowercase letter, and a number. It must be different from the password you were issued.</p>
              <Button type="submit" disabled={submitting || !newPassword || !confirmPassword}
                className="w-full h-12 rounded-lg font-bold text-base"
                style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0B1221' }}
                data-testid="manager-setpw-submit">
                {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Set Password & Enter Portal'}
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.4)' }}>
                <ShieldCheck className="w-7 h-7 text-[#d4af37]" />
              </div>
              <h1 className="text-white text-2xl font-semibold mb-1.5" style={{ fontFamily: 'var(--serif)' }}>Partner Portal</h1>
              <p className="text-white/70 text-sm">Sign in with the partner credentials CarryOn issued to you.</p>
            </div>

            <form onSubmit={submit} className="space-y-3.5">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                <Input value={username} onChange={e => setUsername(e.target.value)} required
                  placeholder="Username" autoComplete="username"
                  className="h-11 pl-10 bg-[#0B1627] border-[#1A2D48] text-white rounded-lg"
                  data-testid="manager-login-username" />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                <Input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="Password" autoComplete="current-password"
                  className="h-11 pl-10 pr-10 bg-[#0B1627] border-[#1A2D48] text-white rounded-lg"
                  data-testid="manager-login-password" />
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#334155] hover:text-[#7b879e]"
                  aria-label="Toggle password visibility">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button type="submit" disabled={submitting || !username || !password}
                className="w-full h-12 rounded-lg font-bold text-base"
                style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0B1221' }}
                data-testid="manager-login-submit">
                {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in…</> : 'Sign In'}
              </Button>
              <p className="text-white/45 text-xs text-center">Lost your credentials? Contact CarryOn to regenerate them.</p>
            </form>
          </>
        )}

        <div className="mt-6 pt-5 border-t flex items-center justify-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <img src="/carryon-logo.png" alt="CarryOn" className="h-6 w-auto opacity-80" />
          <span className="text-white/70 text-xs font-semibold">Powered by CarryOn Enterprises Inc.</span>
        </div>
      </div>
    </div>
  );
}
