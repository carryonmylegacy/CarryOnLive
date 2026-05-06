import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldX, Lock, Eye, EyeOff, Send, ArrowLeft } from 'lucide-react';
import { API_URL } from '../config';

const FounderAboutPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(token ? 'verifying' : 'gate');
  const [reason, setReason] = useState('');
  const iframeRef = useRef(null);

  // Gate mode: 'request' (default) or 'login'
  // Auto-switch to login when an approval email link arrives with ?login=1
  const [gateMode, setGateMode] = useState(searchParams.get('login') === '1' ? 'login' : 'request');

  // Request form state
  const [reqName, setReqName] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqMsg, setReqMsg] = useState('');
  const [reqLoading, setReqLoading] = useState(false);
  const [reqStatus, setReqStatus] = useState('');

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

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!reqName.trim() || !reqEmail.trim()) return;
    setReqLoading(true);
    try {
      const res = await fetch(`${API_URL}/founder/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: reqName.trim(), email: reqEmail.trim(), message: reqMsg.trim() }),
      });
      const data = await res.json();
      setReqStatus(data.status === 'already_pending' ? 'already_pending' : 'submitted');
    } catch {
      setReqStatus('error');
    } finally {
      setReqLoading(false);
    }
  };

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
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#0d1b2a', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} data-testid="founder-page-loading">
        <Loader2 className="w-10 h-10 text-[#d4af37] animate-spin mb-4" />
        <p className="text-[#9aa5b4] text-sm">Verifying your invitation...</p>
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
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#0d1b2a', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} data-testid="founder-page-denied">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-5 sm:mb-6" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)' }}>
            <ShieldX className="w-7 h-7 sm:w-9 sm:h-9 text-[#d4af37]" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-3" style={{ fontFamily: 'var(--sans)' }}>Access Restricted</h1>
          <p className="text-[#9aa5b4] text-sm sm:text-base mb-8 leading-relaxed">{messages[reason] || messages.error}</p>
          <button onClick={() => navigate('/about')} className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all hover:brightness-110 active:scale-95" style={{ background: '#d4af37', color: '#0d1b2a' }} data-testid="founder-page-back-btn">
            Visit About CarryOn
          </button>
        </div>
      </div>
    );
  }

  // Valid access — show iframe
  if (status === 'valid') {
    return (
      <div className="min-h-screen" style={{ background: '#0d1b2a' }} data-testid="founder-page-content">
        <iframe ref={iframeRef} src="/founder-story.html" title="About the Founder" className="w-full border-0" style={{ minHeight: '100vh', height: '100%' }}
          onLoad={() => { try { const iframe = iframeRef.current; if (iframe?.contentDocument?.body) { iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px'; } } catch { if (iframeRef.current) iframeRef.current.style.height = '100vh'; } }}
        />
      </div>
    );
  }

  // Gate page — request access or sign in
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 relative" style={{ background: '#0d1b2a', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} data-testid="founder-page-gate">
      <div className="absolute inset-0 z-0">
        <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.35) contrast(1.05) saturate(0.8)' }} />
      </div>
      <div className="absolute inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(13,27,42,0.5) 0%, rgba(13,27,42,0.85) 100%)' }} />

      <div className="relative z-10 w-full max-w-sm">
        {/* Back link */}
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[#6b7a90] text-xs hover:text-[#d4af37] transition-colors mb-4 py-1" data-testid="founder-back-btn">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>

        <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(13,27,42,0.8)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(212,175,55,0.12)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>

          {/* Request Access Mode */}
          {gateMode === 'request' && !reqStatus && (
            <>
              <div className="text-center mb-5">
                <h1 className="text-lg sm:text-xl font-bold text-white" style={{ fontFamily: 'var(--sans)' }}>Meet the Founder</h1>
                <p className="text-[#9aa5b4] text-xs sm:text-sm mt-2 leading-relaxed">
                  Interested in learning more about the founder of CarryOn&#8482; and what inspired him to build it? Request access below, and you&#8217;ll be notified when your request is approved.
                </p>
              </div>
              <form onSubmit={handleRequest} className="space-y-3" autoComplete="off" data-form-type="other">
                <input type="text" value={reqName} onChange={e => setReqName(e.target.value)} placeholder="Your name" required autoComplete="one-time-code" name="founder_visitor_name"
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-[#4a5568]" style={{ background: 'rgba(11,18,33,0.6)', border: '1px solid rgba(14,165,233,0.1)', fontSize: '16px' }} data-testid="founder-req-name" />
                <input type="text" inputMode="email" value={reqEmail} onChange={e => setReqEmail(e.target.value)} placeholder="Your email" required autoComplete="one-time-code" name="founder_visitor_contact"
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-[#4a5568]" style={{ background: 'rgba(11,18,33,0.6)', border: '1px solid rgba(14,165,233,0.1)', fontSize: '16px' }} data-testid="founder-req-email" />
                <textarea value={reqMsg} onChange={e => setReqMsg(e.target.value)} placeholder="Why are you interested? (optional)" rows={3} autoComplete="one-time-code" name="founder_visitor_note"
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-[#4a5568] resize-none" style={{ background: 'rgba(11,18,33,0.6)', border: '1px solid rgba(14,165,233,0.1)', fontSize: '16px' }} data-testid="founder-req-message" />
                <button type="submit" disabled={reqLoading}
                  className="w-full py-3 rounded-lg font-semibold text-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: '#d4af37', color: '#0d1b2a' }} data-testid="founder-req-submit">
                  {reqLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Request Access</>}
                </button>
              </form>
              <div className="mt-4 pt-3 text-center" style={{ borderTop: '1px solid rgba(14,165,233,0.06)' }}>
                <button onClick={() => setGateMode('login')} className="text-[#6b7a90] text-xs hover:text-[#d4af37] transition-colors py-1" data-testid="founder-switch-login">
                  Already have access? Sign in here &rarr;
                </button>
              </div>
            </>
          )}

          {/* Request Submitted Confirmation */}
          {gateMode === 'request' && reqStatus && (
            <div className="text-center py-2">
              {reqStatus === 'submitted' && (
                <>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                    <Send className="w-6 h-6 text-[#22c55e]" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2">Request Submitted</h3>
                  <p className="text-[#9aa5b4] text-xs sm:text-sm leading-relaxed">The founder will review your request. You&#8217;ll receive your access credentials once approved.</p>
                </>
              )}
              {reqStatus === 'already_pending' && (
                <>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)' }}>
                    <Send className="w-6 h-6 text-[#d4af37]" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2">Request Already Pending</h3>
                  <p className="text-[#9aa5b4] text-xs sm:text-sm leading-relaxed">You already have a pending request. The founder will review it shortly.</p>
                </>
              )}
              {reqStatus === 'error' && (
                <>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <ShieldX className="w-6 h-6 text-[#ef4444]" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2">Something Went Wrong</h3>
                  <p className="text-[#9aa5b4] text-xs sm:text-sm">Please try again later.</p>
                </>
              )}
              <button onClick={() => navigate('/about')} className="mt-5 px-6 py-2.5 rounded-lg text-sm font-semibold text-[#9aa5b4] hover:text-white transition-colors" style={{ border: '1px solid rgba(14,165,233,0.1)' }}>
                Back to About
              </button>
            </div>
          )}

          {/* Login Mode */}
          {gateMode === 'login' && (
            <>
              <div className="text-center mb-5">
                <Lock className="w-7 h-7 sm:w-8 sm:h-8 text-[#d4af37] mx-auto mb-3" />
                <h1 className="text-lg sm:text-xl font-bold text-white" style={{ fontFamily: 'var(--sans)' }}>About the Founder</h1>
                <p className="text-[#9aa5b4] text-xs sm:text-sm mt-1">Enter your credentials to view</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-3" autoComplete="off" data-form-type="other">
                <div>
                  <label className="text-[#9aa5b4] text-xs font-medium block mb-1.5">Email</label>
                  <input type="text" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoComplete="one-time-code" name="founder_access_contact"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-[#4a5568]" style={{ background: 'rgba(11,18,33,0.6)', border: '1px solid rgba(14,165,233,0.1)', fontSize: '16px' }} data-testid="founder-login-email" />
                </div>
                <div>
                  <label className="text-[#9aa5b4] text-xs font-medium block mb-1.5">Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" required autoComplete="new-password" name="founder_access_key"
                      className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-[#4a5568] pr-10" style={{ background: 'rgba(11,18,33,0.6)', border: '1px solid rgba(14,165,233,0.1)', fontSize: '16px' }} data-testid="founder-login-password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7a90] hover:text-white transition-colors p-1">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {loginError && <p className="text-red-400 text-xs text-center" data-testid="founder-login-error">{loginError}</p>}
                <button type="submit" disabled={loginLoading}
                  className="w-full py-3 rounded-lg font-semibold text-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: '#d4af37', color: '#0d1b2a' }} data-testid="founder-login-submit">
                  {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'View Founder Page'}
                </button>
              </form>
              <div className="mt-4 pt-3 text-center" style={{ borderTop: '1px solid rgba(14,165,233,0.06)' }}>
                <button onClick={() => setGateMode('request')} className="text-[#6b7a90] text-xs hover:text-[#d4af37] transition-colors py-1" data-testid="founder-switch-request">
                  &larr; Don&#8217;t have access? Request it here
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FounderAboutPage;
