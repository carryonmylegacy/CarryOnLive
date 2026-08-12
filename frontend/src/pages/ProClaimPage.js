/**
 * ProClaimPage — public page where a white-glove-provisioned client
 * takes ownership of their pre-built CarryOn portal (`/claim/:token`).
 *
 * Branded with the partner's logo + company. Client picks a username
 * and password, verifies a 6-digit email OTP, and is auto-signed-in to
 * a portal already stocked with the documents their advisor prepared.
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { Loader2, Lock, User, Eye, EyeOff, ShieldCheck, AlertCircle, FileText, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from '../utils/toast';
import { API_URL } from '../config';

export default function ProClaimPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [stage, setStage] = useState('credentials'); // credentials | otp | done
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await apiClient.get(`${API_URL}/pro/claim/${token}`);
        setPreview(data);
        setUsername(data.suggested_username || '');
        if (data.otp_pending) setStage('otp');
      } catch (err) {
        setError(err.response?.data?.detail || 'This claim link is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const startClaim = async (e) => {
    e?.preventDefault?.();
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    setSubmitting(true);
    try {
      await apiClient.post(`${API_URL}/pro/claim/${token}/start`, { username: username.trim(), password });
      setStage('otp');
      toast.success('Verification code sent to your email');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not start the claim');
    } finally {
      setSubmitting(false);
    }
  };

  const completeClaim = async (e) => {
    e?.preventDefault?.();
    setSubmitting(true);
    try {
      const { data } = await apiClient.post(`${API_URL}/pro/claim/${token}/complete`, { otp_code: otp.trim() });
      try { localStorage.setItem('carryon_token', data.access_token); } catch { /* ignore */ }
      setStage('done');
      setTimeout(() => window.location.assign('/dashboard'), 1200);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Verification failed');
      setSubmitting(false);
    }
  };

  const shell = (children) => (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center py-10" style={{ background: 'var(--bg)' }} data-testid="pro-claim-page">
      <div className="absolute inset-0 z-0">
        <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.55) contrast(1.05)' }} />
      </div>
      <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.55) 0%, rgba(11,18,33,0.85) 100%)' }} />
      <div className="relative z-10 max-w-lg w-full mx-6 rounded-2xl p-8" style={{
        background: 'linear-gradient(160deg, rgba(17,27,48,0.97), rgba(13,22,40,0.99))',
        border: '1px solid rgba(var(--gold-rgb), 0.18)',
        boxShadow: '0 8px 80px rgba(0,0,0,0.5)',
      }}>
        {children}
        <div className="mt-6 pt-5 border-t flex items-center justify-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <img src="/carryon-logo.png" alt="CarryOn" className="h-6 w-auto opacity-80" />
          <span className="text-white/70 text-xs font-semibold">Powered by CarryOn Enterprises Inc.</span>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return shell(
      <div className="flex items-center justify-center py-16" data-testid="pro-claim-loading">
        <Loader2 className="w-8 h-8 animate-spin text-[#d4af37]" />
      </div>,
    );
  }

  if (error) {
    return shell(
      <div className="text-center" data-testid="pro-claim-error">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)' }}>
          <AlertCircle className="w-7 h-7 text-[#fca5a5]" />
        </div>
        <h2 className="text-white text-xl font-semibold mb-2" style={{ fontFamily: 'var(--serif)' }}>We couldn&apos;t open that link.</h2>
        <p className="text-white/75 text-sm leading-relaxed">{error}</p>
      </div>,
    );
  }

  if (stage === 'done') {
    return shell(
      <div className="text-center" data-testid="pro-claim-done">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)' }}>
          <ShieldCheck className="w-7 h-7 text-[#34d399]" />
        </div>
        <h2 className="text-white text-xl font-semibold mb-2" style={{ fontFamily: 'var(--serif)' }}>Your portal is yours.</h2>
        <p className="text-white/75 text-sm">Signing you in…</p>
      </div>,
    );
  }

  return shell(
    <div data-testid="pro-claim-form">
      <div className="text-center mb-6">
        {preview?.logo_data_url && (
          <img src={preview.logo_data_url} alt={preview.partner_company}
            className="max-w-[180px] max-h-[90px] w-auto h-auto object-contain mx-auto mb-4 rounded-lg bg-white/95 p-2"
            data-testid="pro-claim-partner-logo" />
        )}
        <h1 className="text-white text-2xl font-semibold mb-2" style={{ fontFamily: 'var(--serif)' }} data-testid="pro-claim-headline">
          Welcome, <span className="text-[#d4af37] italic">{preview?.client_name}</span>.
        </h1>
        <p className="text-white/80 text-sm leading-relaxed">
          <strong>{preview?.rep_name}</strong> of <strong>{preview?.partner_company}</strong> has
          prepared your secure family-continuity portal.
        </p>
        {preview?.documents_count > 0 && (
          <p className="text-[#d4af37] text-sm font-semibold mt-2 inline-flex items-center gap-1.5" data-testid="pro-claim-docs-count">
            <FileText className="w-4 h-4" /> {preview.documents_count} document{preview.documents_count === 1 ? '' : 's'} already waiting in your vault
          </p>
        )}
      </div>

      {stage === 'credentials' ? (
        <form onSubmit={startClaim} className="space-y-3.5">
          <div>
            <label className="text-white/80 text-sm font-bold mb-1.5 block">Choose a Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
              <Input value={username} onChange={e => setUsername(e.target.value)} required
                className="h-11 pl-10 bg-[#0B1627] border-[#1A2D48] text-white rounded-lg"
                data-testid="pro-claim-username" />
            </div>
          </div>
          <div>
            <label className="text-white/80 text-sm font-bold mb-1.5 block">Create a Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
              <Input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                required minLength={8} placeholder="At least 8 characters"
                className="h-11 pl-10 pr-10 bg-[#0B1627] border-[#1A2D48] text-white rounded-lg"
                data-testid="pro-claim-password" />
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#334155] hover:text-[#7b879e]">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-white/80 text-sm font-bold mb-1.5 block">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
              <Input type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                required className="h-11 pl-10 bg-[#0B1627] border-[#1A2D48] text-white rounded-lg"
                data-testid="pro-claim-confirm" />
            </div>
          </div>
          <Button type="submit" disabled={submitting || !username || !password || !confirm}
            className="w-full h-12 rounded-lg font-bold text-base mt-1"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0B1221' }}
            data-testid="pro-claim-submit">
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending code…</> : 'Continue'}
          </Button>
          <p className="text-white/50 text-xs text-center">
            We&apos;ll email a 6-digit code to <span className="text-white/75 font-semibold">{preview?.client_email}</span> to verify it&apos;s you.
          </p>
        </form>
      ) : (
        <form onSubmit={completeClaim} className="space-y-4">
          <p className="text-white/80 text-sm text-center">
            Enter the 6-digit code we sent to <span className="font-semibold text-white">{preview?.client_email}</span>.
          </p>
          <Input value={otp} onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            inputMode="numeric" placeholder="••••••"
            className="h-14 text-center text-2xl tracking-[0.5em] bg-[#0B1627] border-[#1A2D48] text-white rounded-lg"
            data-testid="pro-claim-otp" />
          <Button type="submit" disabled={submitting || otp.length < 4}
            className="w-full h-12 rounded-lg font-bold text-base"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0B1221' }}
            data-testid="pro-claim-verify">
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…</> : <><Sparkles className="w-4 h-4 mr-2" /> Take Ownership</>}
          </Button>
          <button type="button" onClick={() => setStage('credentials')} className="w-full text-white/60 text-xs font-semibold hover:text-white/85">
            Didn&apos;t get a code? Go back and try again.
          </button>
        </form>
      )}
    </div>,
  );
}
