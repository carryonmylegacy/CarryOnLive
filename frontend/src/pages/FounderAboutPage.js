import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ShieldX, Lock, Eye, EyeOff } from 'lucide-react';
import { API_URL } from '../config';

const FounderAboutPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState(token ? 'verifying' : 'login');
  const [reason, setReason] = useState('');
  const iframeRef = useRef(null);

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      try {
        const res = await fetch(`${API_URL}/founder-about/verify/${token}`);
        const data = await res.json();
        if (data.valid) {
          setStatus('valid');
        } else {
          setStatus('invalid');
          setReason(data.reason || 'unknown');
        }
      } catch {
        setStatus('invalid');
        setReason('error');
      }
    };
    verify();
  }, [token]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${API_URL}/founder-about/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (data.valid) {
        setStatus('valid');
      } else {
        const msgs = {
          no_access: 'No approved access found for this email.',
          no_password: 'Your access has not been fully set up yet.',
          wrong_password: 'Incorrect password. Please try again.',
        };
        setLoginError(msgs[data.reason] || 'Access denied.');
      }
    } catch {
      setLoginError('Unable to verify. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Loading state (token verification)
  if (status === 'verifying') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#0d1b2a' }} data-testid="founder-page-loading">
        <Loader2 className="w-10 h-10 text-[#d4af37] animate-spin mb-4" />
        <p className="text-[#9aa5b4] text-sm">Verifying your invitation...</p>
      </div>
    );
  }

  // Login form (no token — email + password access)
  if (status === 'login') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 relative" style={{ background: '#0d1b2a' }} data-testid="founder-page-login">
        <div className="absolute inset-0 z-0">
          <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.4) contrast(1.05) saturate(0.8)' }} />
        </div>
        <div className="absolute inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(13,27,42,0.6) 0%, rgba(13,27,42,0.85) 100%)' }} />

        <div className="relative z-10 w-full max-w-sm">
          <div className="rounded-2xl p-8" style={{ background: 'rgba(13,27,42,0.75)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(212,175,55,0.12)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
            <div className="text-center mb-6">
              <Lock className="w-8 h-8 text-[#d4af37] mx-auto mb-3" />
              <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>About the Founder</h1>
              <p className="text-[#9aa5b4] text-sm mt-1">Enter your credentials to view</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-[#9aa5b4] text-xs font-medium block mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-[#4a5568]"
                  style={{ background: 'rgba(11,18,33,0.6)', border: '1px solid rgba(14,165,233,0.1)' }}
                  data-testid="founder-login-email"
                  required
                />
              </div>
              <div>
                <label className="text-[#9aa5b4] text-xs font-medium block mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-[#4a5568] pr-10"
                    style={{ background: 'rgba(11,18,33,0.6)', border: '1px solid rgba(14,165,233,0.1)' }}
                    data-testid="founder-login-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7a90] hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <p className="text-red-400 text-xs text-center" data-testid="founder-login-error">{loginError}</p>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: '#d4af37', color: '#0d1b2a' }}
                data-testid="founder-login-submit"
              >
                {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'View Founder Page'}
              </button>
            </form>
          </div>

          <button
            onClick={() => navigate('/about')}
            className="mt-4 text-[#6b7a90] text-xs hover:text-[#d4af37] transition-colors mx-auto block"
          >
            &larr; Back to About CarryOn
          </button>
        </div>
      </div>
    );
  }

  // Access denied (invalid token)
  if (status === 'invalid') {
    const messages = {
      not_found: 'This invitation link is not valid.',
      revoked: 'This invitation has been revoked by the Founder.',
      no_token: 'No invitation token provided.',
      error: 'Unable to verify your invitation. Please try again.',
    };

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#0d1b2a' }} data-testid="founder-page-denied">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)' }}>
            <ShieldX className="w-9 h-9 text-[#d4af37]" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>Access Restricted</h1>
          <p className="text-[#9aa5b4] text-base mb-8 leading-relaxed">{messages[reason] || messages.error}</p>
          <button
            onClick={() => navigate('/about')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all hover:brightness-110 active:scale-95"
            style={{ background: '#d4af37', color: '#0d1b2a' }}
            data-testid="founder-page-back-btn"
          >
            Visit About CarryOn
          </button>
        </div>
      </div>
    );
  }

  // Valid access — show iframe
  return (
    <div className="min-h-screen" style={{ background: '#0d1b2a' }} data-testid="founder-page-content">
      <iframe
        ref={iframeRef}
        src="/founder-story.html"
        title="About the Founder"
        className="w-full border-0"
        style={{ minHeight: '100vh', height: '100%' }}
        onLoad={() => {
          try {
            const iframe = iframeRef.current;
            if (iframe?.contentDocument?.body) {
              iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px';
            }
          } catch {
            if (iframeRef.current) iframeRef.current.style.height = '100vh';
          }
        }}
      />
    </div>
  );
};

export default FounderAboutPage;
