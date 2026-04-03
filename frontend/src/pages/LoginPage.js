import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Mail, Lock, Eye, EyeOff, Loader2, Shield, Users, ChevronRight, ChevronDown, Lock as LockIcon, Sparkles, FileCheck, UserCheck, Trash2, ClipboardCheck, MessageSquare, Key, Layers, Smartphone, MapPin, ShieldAlert, ArrowUpDown, SlidersHorizontal, ExternalLink, Radio, MessageCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from '../utils/toast';
import { isNative } from '../services/native';
import { isPWA, isMobileBrowser } from '../utils/pwaDetect';
import PWAInstallGuide from '../components/PWAInstallGuide';
import SealedAccountScreen from '../components/SealedAccountScreen';
import { haptics } from '../utils/haptics';
import { API_URL } from '../config';

/* ─── scroll-reveal hook ─── */
const useReveal = (threshold = 0.15) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, visible];
};

const RevealSection = ({ children, className = '', delay = 0, direction = 'up', ...props }) => {
  const [ref, visible] = useReveal(0.12);
  const transforms = { up: 'translate3d(0,20px,0)', down: 'translate3d(0,-20px,0)', left: 'translate3d(20px,0,0)', right: 'translate3d(-20px,0,0)' };
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translate3d(0,0,0)' : transforms[direction],
      transition: `opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      backfaceVisibility: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
    }} {...props}>
      {children}
    </div>
  );
};

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, verifyOtp, resendOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [trustToday, setTrustToday] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [flagOpacity, setFlagOpacity] = useState(1);
  const [exiting, setExiting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(true);
  const [pendingLoginResult, setPendingLoginResult] = useState(null);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [sealedAccount, setSealedAccount] = useState(null);
  const [otpMethod, setOtpMethod] = useState('email'); // 'email' or 'sms'
  const [hasSmsOtp, setHasSmsOtp] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPw, setForgotNewPw] = useState('');
  const [forgotConfirmPw, setForgotConfirmPw] = useState('');
  const [forgotStep, setForgotStep] = useState(1); // 1=email, 2=otp+newpw
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotError, setForgotError] = useState(false);
  const [activeSessionWarning, setActiveSessionWarning] = useState(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(() => !!localStorage.getItem('carryon_install_dismissed'));
  const isPWAMode = isPWA();
  const isMobileNonPWA = isMobileBrowser();

  const navigateWithFade = (path) => {
    setExiting(true);
    setTimeout(() => navigate(path), 500);
  };

  /* Biometric auto-login on mount — only for NATIVE apps, not web/PWA */
  useEffect(() => {
    const tryBiometric = async () => {
      await new Promise(r => setTimeout(r, 300));
      try {
        const { isBiometricEnabled } = await import('../services/biometric');
        const { isNative } = await import('../services/native');
        // Only auto-trigger on native Capacitor apps (not web — WebAuthn requires user gesture)
        if (!isNative || !isBiometricEnabled()) { setBiometricLoading(false); return; }

        const { authenticateWithBiometric } = await import('../services/biometric');
        const result = await authenticateWithBiometric();
        if (result?.access_token) {
          localStorage.setItem('carryon_token', result.access_token);
          const dest = result.user?.role === 'admin' ? '/admin' : result.user?.role === 'operator' ? '/ops' : result.user?.role === 'beneficiary' ? '/beneficiary' : '/dashboard';
          navigate(dest);
          return;
        }
      } catch {
        // Silent fail
      }
      setBiometricLoading(false);
    };
    tryBiometric();
    import('../services/passkey').then(({ isPasskeySupported, hasRegisteredPasskey }) => {
      if (isPasskeySupported()) hasRegisteredPasskey().then(setPasskeyAvailable);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  /* flag fade on scroll */
  useEffect(() => {
    const handleScroll = () => {
      const fade = Math.max(0, 1 - window.scrollY / 600);
      setFlagOpacity(fade);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  /* fetch homepage video ID */
  const [homepageVideoId, setHomepageVideoId] = useState('EhU-jojs1jk');
  useEffect(() => {
    axios.get(`${API_URL}/public/site-content`).then(r => {
      if (r.data?.homepage_video_id) setHomepageVideoId(r.data.homepage_video_id);
    }).catch(() => {});
  }, []);

  const completeLogin = async (result) => {
    // Biometric prompt only on native Capacitor app
    try {
      const { isBiometricAvailable, isBiometricEnabled } = await import('../services/biometric');
      const { available } = await isBiometricAvailable();
      if (available && !isBiometricEnabled() && !localStorage.getItem('carryon_biometric_declined') && password) {
        setPendingLoginResult(result);
        setShowBiometricPrompt(true);
        return;
      }
    } catch { /* continue */ }
    navigateToHome(result);
  };

  const navigateToHome = (result) => {
    haptics.success();
    if (result.user?.role === 'admin') navigate('/admin');
    else if (result.user?.role === 'operator') navigate('/ops');
    else {
      // For multi-role users, restore last-viewed portal
      const lastPortal = localStorage.getItem('carryon_last_portal');
      const isMultiRole = result.user?.is_also_benefactor || result.user?.is_also_beneficiary;
      if (isMultiRole && lastPortal === 'beneficiary') navigate('/beneficiary');
      else if (isMultiRole && lastPortal === 'benefactor') navigate('/dashboard');
      else if (result.user?.role === 'beneficiary' && result.user?.is_also_benefactor) navigate('/dashboard');
      else if (result.user?.role === 'beneficiary') navigate('/beneficiary');
      else navigate('/dashboard');
    }
  };

  const handleLogin = async (e, forceLogin = false) => {
    e?.preventDefault?.();
    setLoading(true);
    try {
      const result = await login(email, password, 'email', null, forceLogin);
      if (result.activeSessionExists) {
        // Show confirmation instead of an error toast
        setActiveSessionWarning(result.message);
        return;
      }
      setActiveSessionWarning(null);
      if (result.sealed) {
        setSealedAccount({ transitionedAt: result.transitioned_at });
        return;
      }
      if (result.direct) {
        await completeLogin(result);
      } else {
        // Capture SMS OTP info from login response
        if (result.has_sms) {
          setHasSmsOtp(true);
          setOtpMethod(result.otp_method || 'sms');
          setMaskedPhone(result.masked_phone || null);
        } else {
          setHasSmsOtp(false);
          setOtpMethod('email');
        }
        setShowOtpModal(true);
      }
    } catch (error) {
      if (error.response?.status === 429) {
        const detail = error.response?.data?.detail || '';
        const match = detail.match(/(\d+)\s*seconds/);
        const secs = match ? parseInt(match[1], 10) : 180;
        setLockoutSeconds(secs);
      } else {
        toast.error(error.response?.data?.detail || 'Invalid credentials');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { toast.error('Enter a valid 6-digit OTP'); return; }
    setLoading(true);
    try {
      const user = await verifyOtp(email, otp, trustToday);
      await completeLogin({ user, direct: true });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async (method) => {
    if (resendCooldown > 0) return;
    const sendMethod = method || otpMethod;
    try {
      const result = await resendOtp(email, sendMethod);
      if (result.sms_sent) {
        setOtpMethod('sms');
        toast.success('Code sent via SMS');
      } else if (result.email_sent) {
        setOtpMethod('email');
        toast.success('Code sent via email');
      } else {
        toast.error('Failed to send code — please try again');
      }
      setResendCooldown(30);
      const interval = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch {
      toast.error('Failed to resend code');
    }
  };

  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    try {
      const { authenticateWithPasskey } = await import('../services/passkey');
      const result = await authenticateWithPasskey(email || '');
      if (result.access_token) {
        localStorage.setItem('carryon_token', result.access_token);
        const dest = result.user?.role === 'admin' ? '/admin' : (result.user?.role === 'beneficiary' && result.user?.is_also_benefactor) ? '/dashboard' : result.user?.role === 'beneficiary' ? '/beneficiary' : '/dashboard';
        navigate(dest);
      }
    } catch (err) {
      const msg = err.message || '';
      if (!msg.includes('cancelled') && !msg.includes('AbortError') && !msg.includes('NotAllowedError')) {
        toast.error('Passkey sign-in failed. Try email and password.');
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  // Show nothing while checking biometric
  if (biometricLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0E1829' }}>
        <img src="/carryon-logo.png" alt="CarryOn" className="w-32 h-auto opacity-60" />
      </div>
    );
  }

  // Sealed account — transitioned benefactor
  if (sealedAccount) {
    return (
      <SealedAccountScreen
        transitionedAt={sealedAccount.transitionedAt}
        onBack={() => setSealedAccount(null)}
      />
    );
  }

  // Native app: simplified login — just the card, no website content
  if (isNative) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-6" style={{
        background: 'linear-gradient(168deg, #080e1a 0%, #0d1627 30%, #111d35 60%, #0a1122 100%)',
        overflow: 'hidden',
        overscrollBehavior: 'none',
        touchAction: 'none',
      }}>
        <img src="/carryon-logo.png" alt="CarryOn" className="w-[180px] h-auto mb-8" />
        <div className="w-full max-w-sm rounded-2xl p-7 relative" style={{
          background: 'linear-gradient(160deg, rgba(17,27,48,0.97), rgba(13,22,40,0.99))',
          border: '1px solid rgba(212,175,55,0.12)',
          boxShadow: '0 8px 80px rgba(0,0,0,0.5)',
        }}>
          <div className="absolute top-0 left-7 right-7 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #d4af37, transparent)' }} />
          <h2 className="text-white text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Sign In</h2>
          <p className="text-[#475569] text-sm mb-6">Access your CarryOn account</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a4a63]" />
              <Input type="text" placeholder="Username or Email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="h-12 bg-[#0b1322] border-[#1a2a42] text-white placeholder:text-[#2d3d55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-xl pl-10"
                autoComplete="username" data-testid="login-email" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a4a63]" />
              <Input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="h-12 bg-[#0b1322] border-[#1a2a42] text-white placeholder:text-[#2d3d55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-xl pl-10 pr-10"
                autoComplete="current-password" data-testid="login-password" />
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#3a4a63]">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {lockoutSeconds > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center" data-testid="lockout-banner">
                <p className="text-red-400 text-sm font-semibold">Account temporarily locked</p>
                <p className="text-red-300/80 text-xs mt-1">Try again in <span className="font-bold text-red-300 tabular-nums">{Math.floor(lockoutSeconds / 60)}:{String(lockoutSeconds % 60).padStart(2, '0')}</span></p>
              </div>
            )}
            {activeSessionWarning && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-center" data-testid="active-session-warning">
                <p className="text-amber-400 text-sm font-semibold">Signed in elsewhere</p>
                <p className="text-amber-300/80 text-xs mt-1.5">{activeSessionWarning}</p>
                <button type="button" onClick={(e) => { setActiveSessionWarning(null); handleLogin(e, true); }}
                  className="mt-2.5 w-full h-10 rounded-lg text-sm font-bold transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37' }}
                  data-testid="force-login-btn">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Sign In Here Instead'}
                </button>
              </div>
            )}
            <Button type="submit" disabled={loading || !email || !password || lockoutSeconds > 0} className="w-full h-12 rounded-xl text-base font-bold"
              style={{ background: lockoutSeconds > 0 ? '#374151' : 'linear-gradient(135deg, #d4af37, #b8962e)', color: lockoutSeconds > 0 ? '#6b7280' : '#080e1a' }} data-testid="login-submit">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : lockoutSeconds > 0 ? `Locked (${Math.floor(lockoutSeconds / 60)}:${String(lockoutSeconds % 60).padStart(2, '0')})` : 'Sign In'}
            </Button>
          </form>
          {passkeyAvailable && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-[#1a2a42]" />
                <span className="text-[#334155] text-[11px] uppercase tracking-widest font-medium">or</span>
                <div className="flex-1 h-px bg-[#1a2a42]" />
              </div>
              <button onClick={handlePasskeyLogin} disabled={passkeyLoading}
                className="w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                data-testid="login-passkey-native">
                {passkeyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-[#d4af37]" />}
                Sign in with Passkey
              </button>
            </>
          )}
          <div className="mt-5 flex items-center justify-between">
            <button onClick={() => navigateWithFade('/signup')} className="text-[#d4af37] text-sm font-bold">Create Account</button>
            <span className="text-[#94A3B8] text-sm font-bold cursor-pointer hover:text-[#d4af37] transition-colors"
              data-testid="forgot-password-link"
              onClick={() => { setForgotMode(true); setForgotEmail(email); setForgotStep(1); setForgotMsg(''); setForgotError(false); }}>Forgot Password?</span>
          </div>
          <div className="mt-5 pt-4 border-t flex flex-col items-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-[#10b981]" />
              <span className="text-white/80 text-sm font-bold">Bank-grade security · 256-bit SSL</span>
            </div>
            <button onClick={() => navigateWithFade('/get-started')} className="animate-pulse-fast hover:brightness-110 active:scale-[0.97] cursor-pointer" data-testid="new-here-link-mobile"
              style={{
                background: 'linear-gradient(180deg, #f0d860 0%, #d4af37 100%)',
                color: '#1a1200', fontWeight: 800, fontSize: '0.8125rem',
                padding: '0.5rem 1.25rem', borderRadius: '0.625rem',
                boxShadow: '0 3px 10px rgba(180,140,40,0.3), inset 0 1px 0 rgba(255,240,160,0.5)',
                transition: 'transform 0.12s ease, box-shadow 0.12s ease',
              }}>
              New to family preparedness?<br/>See what CarryOn can do
            </button>
          </div>
        </div>
        {forgotMode && (
          <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-24" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#152238', border: '1px solid rgba(212,175,55,0.5)', boxShadow: '0 0 60px rgba(212,175,55,0.08), 0 8px 40px rgba(0,0,0,0.6)' }}>
              <h2 className="text-lg font-bold text-white mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Reset Password</h2>
              {forgotStep === 1 ? (
                <>
                  <p className="text-xs text-[#94A3B8] mb-4">Enter your email and we'll send you a reset code.</p>
                  <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    placeholder="Email address" className="w-full px-4 py-3 rounded-xl text-sm mb-3 bg-[#0a1128] border border-[#1e293b] text-white" data-testid="forgot-email-native" />
                  {forgotMsg && <p className={`text-xs mb-3 ${forgotError ? 'text-red-400' : 'text-[#22C993]'}`}>{forgotMsg}</p>}
                  <button disabled={!forgotEmail || forgotLoading} onClick={async () => {
                    setForgotLoading(true);
                    try {
                      const res = await axios.post(`${API_URL}/auth/forgot-password`, { email: forgotEmail });
                      setForgotMsg(res.data.message);
                      setForgotError(false);
                      setForgotStep(2);
                    } catch (err) { setForgotMsg(err.response?.data?.detail || 'Failed to send code. Please try again.'); setForgotError(true); }
                    finally { setForgotLoading(false); }
                  }} className="w-full py-3 rounded-xl text-sm font-bold mb-3" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a', opacity: !forgotEmail || forgotLoading ? 0.5 : 1 }}>
                    {forgotLoading ? 'Sending...' : 'Send Reset Code'}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-[#94A3B8] mb-4">Enter the code sent to {forgotEmail} and your new password.</p>
                  <input type="text" value={forgotOtp} onChange={e => setForgotOtp(e.target.value)}
                    placeholder="6-digit code" maxLength={6} className="w-full px-4 py-3 rounded-xl text-sm mb-3 bg-[#0a1128] border border-[#1e293b] text-white text-center tracking-[0.3em]" data-testid="forgot-otp-native" />
                  <input type="password" value={forgotNewPw} onChange={e => setForgotNewPw(e.target.value)}
                    placeholder="New password (8+ characters)" className="w-full px-4 py-3 rounded-xl text-sm mb-3 bg-[#0a1128] border border-[#1e293b] text-white" data-testid="forgot-newpw-native" />
                  <input type="password" value={forgotConfirmPw} onChange={e => setForgotConfirmPw(e.target.value)}
                    placeholder="Confirm new password" className={`w-full px-4 py-3 rounded-xl text-sm mb-1 bg-[#0a1128] border text-white ${forgotConfirmPw && forgotNewPw !== forgotConfirmPw ? 'border-red-500' : 'border-[#1e293b]'}`} data-testid="forgot-confirmpw-native" />
                  {forgotConfirmPw && forgotNewPw !== forgotConfirmPw && (
                    <p className="text-red-400 text-xs mb-2">* Passwords do not match</p>
                  )}
                  {forgotMsg && <p className={`text-xs mb-3 ${forgotError ? 'text-red-400' : 'text-[#22C993]'}`}>{forgotMsg}</p>}
                  <button disabled={!forgotOtp || !forgotNewPw || forgotNewPw !== forgotConfirmPw || forgotLoading} onClick={async () => {
                    setForgotLoading(true);
                    try {
                      const res = await axios.post(`${API_URL}/auth/reset-password`, { email: forgotEmail, otp: forgotOtp, new_password: forgotNewPw });
                      setForgotMsg(res.data.message);
                      setForgotError(false);
                      setTimeout(() => { setForgotMode(false); setForgotStep(1); setForgotOtp(''); setForgotNewPw(''); setForgotConfirmPw(''); setForgotMsg(''); setForgotError(false); }, 2000);
                    } catch (err) { setForgotMsg(err.response?.data?.detail || 'Reset failed. Please try again.'); setForgotError(true); }
                    finally { setForgotLoading(false); }
                  }} className="w-full py-3 rounded-xl text-sm font-bold mb-3 mt-2" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a', opacity: !forgotOtp || !forgotNewPw || forgotNewPw !== forgotConfirmPw || forgotLoading ? 0.5 : 1 }}>
                    {forgotLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </>
              )}
              <button onClick={() => { setForgotMode(false); setForgotStep(1); setForgotMsg(''); setForgotError(false); }}
                className="w-full text-center text-xs text-[#475569] hover:text-[#94a3b8]">Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── PWA STANDALONE MODE — clean login, no marketing, no scroll ───
  if (isPWAMode) {
    const scrollInputIntoView = (e) => {
      setTimeout(() => {
        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
    };

    return (
      <div className="flex flex-col items-center justify-center px-5 relative overflow-y-auto" style={{
        minHeight: '100dvh',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 0.45s ease',
        WebkitOverflowScrolling: 'touch',
        paddingTop: 'max(1.5rem, env(safe-area-inset-top, 1.5rem))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))',
      }} data-testid="pwa-login-view">
        {/* Flag background */}
        <div className="fixed inset-0 z-0">
          <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(1.3) contrast(1.05) saturate(1.1)' }} />
        </div>
        <div className="fixed inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.15) 0%, rgba(11,18,33,0.35) 40%, rgba(14,24,41,0.6) 100%)' }} />
        <div className="fixed inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 90% 80% at 20% 80%, rgba(255,255,255,0.08) 0%, transparent 60%)' }} />
        <div className="fixed inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 80% 70% at 85% 85%, rgba(255,255,255,0.10) 0%, transparent 55%)' }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
          <img src="/carryon-logo.png" alt="CarryOn" className="w-[200px] h-auto mb-5" />

          <div className="w-full rounded-2xl p-6 relative" style={{
            background: 'linear-gradient(160deg, rgba(17,27,48,0.97), rgba(13,22,40,0.99))',
            border: '1px solid rgba(212,175,55,0.12)',
            boxShadow: '0 8px 80px rgba(0,0,0,0.5)',
          }}>
            <div className="absolute top-0 left-6 right-6 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #d4af37, transparent)' }} />
            <h2 className="text-white text-lg font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Sign In</h2>
            <p className="text-white/70 text-sm font-semibold mb-4">Access your CarryOn account</p>
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="text-white/80 text-sm font-bold mb-1 block">Username or Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                  <Input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Username or Email" required autoComplete="username"
                    onFocus={scrollInputIntoView}
                    className="h-10 pl-10 bg-[#0B1627] border-[#1A2D48] text-white placeholder:text-[#2A3C55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg text-sm" data-testid="login-email-pwa" />
              </div>
            </div>
            <div>
              <label className="text-white/80 text-sm font-bold mb-1 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" required autoComplete="current-password"
                  onFocus={scrollInputIntoView}
                  className="h-10 pl-10 pr-10 bg-[#0B1627] border-[#1A2D48] text-white placeholder:text-[#2A3C55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg text-sm" data-testid="login-password-pwa" />
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#334155] hover:text-[#7b879e] transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {lockoutSeconds > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-center">
                <p className="text-red-400 text-xs font-semibold">Account temporarily locked</p>
                <p className="text-red-300/80 text-[11px] mt-0.5">Try again in <span className="font-bold text-red-300 tabular-nums">{Math.floor(lockoutSeconds / 60)}:{String(lockoutSeconds % 60).padStart(2, '0')}</span></p>
              </div>
            )}
            {activeSessionWarning && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-center">
                <p className="text-amber-400 text-xs font-semibold">Signed in elsewhere</p>
                <p className="text-amber-300/80 text-[11px] mt-1">{activeSessionWarning}</p>
                <button type="button" onClick={(e) => { setActiveSessionWarning(null); handleLogin(e, true); }}
                  className="mt-2 w-full h-9 rounded-lg text-xs font-bold transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37' }}
                  data-testid="force-login-pwa">
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Sign In Here Instead'}
                </button>
              </div>
            )}
            <Button type="submit" disabled={loading || lockoutSeconds > 0} className="w-full h-10 rounded-lg font-bold text-sm" data-testid="login-submit-pwa"
              style={{ background: lockoutSeconds > 0 ? '#374151' : 'linear-gradient(135deg, #d4af37, #b8962e)', color: lockoutSeconds > 0 ? '#6b7280' : '#0B1221' }}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing In...</> : lockoutSeconds > 0 ? `Locked (${Math.floor(lockoutSeconds / 60)}:${String(lockoutSeconds % 60).padStart(2, '0')})` : 'Sign In'}
            </Button>
          </form>
          {passkeyAvailable && (
            <>
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <span className="text-[#334155] text-[11px] uppercase tracking-widest font-medium">or</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              </div>
              <button onClick={handlePasskeyLogin} disabled={passkeyLoading}
                className="w-full h-10 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                data-testid="login-passkey-pwa">
                {passkeyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />}
                Sign in with Passkey
              </button>
            </>
          )}
          <div className="mt-3.5 flex items-center justify-between">
            <button onClick={() => navigateWithFade('/signup')} className="text-[#d4af37] text-sm font-bold hover:text-[#fcd34d] transition-colors" data-testid="create-account-pwa">Create Account</button>
            <span className="text-[#94A3B8] text-sm font-bold cursor-pointer hover:text-[#d4af37] transition-colors"
              data-testid="forgot-password-pwa"
              onClick={() => { setForgotMode(true); setForgotEmail(email); setForgotStep(1); setForgotMsg(''); setForgotError(false); }}>Forgot Password?</span>
          </div>
          <div className="mt-3.5 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-center gap-2">
              <Shield className="w-3 h-3 text-[#10b981]" />
              <span className="text-white/80 text-xs font-bold">Bank-grade security &middot; 256-bit SSL</span>
            </div>
            <div className="mt-2 text-center">
              <button onClick={() => navigateWithFade('/get-started')} className="animate-pulse-fast hover:brightness-110 active:scale-[0.97] cursor-pointer" data-testid="new-here-pwa"
                style={{
                  background: 'linear-gradient(180deg, #f0d860 0%, #d4af37 100%)',
                  color: '#1a1200', fontWeight: 800, fontSize: '0.8125rem',
                  padding: '0.5rem 1.25rem', borderRadius: '0.625rem',
                  boxShadow: '0 3px 10px rgba(180,140,40,0.3), inset 0 1px 0 rgba(255,240,160,0.5)',
                }}>
                New to family preparedness?<br/>See what CarryOn can do!
              </button>
            </div>
          </div>
        </div>

          {/* Visit Homepage — opens in device browser */}
          <button onClick={() => window.open('/home', '_blank')} className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform" data-testid="visit-homepage-pwa"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#e2e8f0', backdropFilter: 'blur(8px)' }}>
            <ExternalLink className="w-3.5 h-3.5" />
            Visit Homepage
          </button>
        </div>

        {/* OTP Modal */}
        {showOtpModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl p-7" style={{ background: 'linear-gradient(145deg, rgba(20,30,52,0.98), rgba(15,22,41,1))', border: '1px solid rgba(212,175,55,0.15)' }}>
              <h3 className="text-white text-lg font-semibold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Two-Factor Authentication</h3>
              <p className="text-[#6b7a90] text-sm mb-5">
                {otpMethod === 'sms' ? `Enter the 6-digit code sent to ${maskedPhone || 'your phone'}` : 'Enter the 6-digit code sent to your email'}
              </p>
              <Input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" className="h-14 text-center text-2xl tracking-[0.4em] font-mono bg-[#0D1829] border-[#1E3048] text-white focus:border-[#d4af37] rounded-lg mb-4" data-testid="otp-input-pwa" autoFocus />
              {hasSmsOtp && (
                <div className="flex items-center gap-2 mb-4 p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.1)' }}>
                  <span className="text-[#6b7a90] text-xs">Send code via:</span>
                  <button onClick={() => handleResendOtp('sms')} disabled={resendCooldown > 0}
                    className={`text-xs px-3 py-1 rounded-full transition-all ${otpMethod === 'sms' ? 'bg-[#d4af37] text-[#0B1221] font-semibold' : 'text-[#6b7a90] hover:text-white'}`}>SMS {maskedPhone ? `(${maskedPhone})` : ''}</button>
                  <button onClick={() => handleResendOtp('email')} disabled={resendCooldown > 0}
                    className={`text-xs px-3 py-1 rounded-full transition-all ${otpMethod === 'email' ? 'bg-[#d4af37] text-[#0B1221] font-semibold' : 'text-[#6b7a90] hover:text-white'}`}>Email</button>
                </div>
              )}
              <label className="flex items-center gap-3 mb-4 cursor-pointer select-none group">
                <button type="button" onClick={() => setTrustToday(!trustToday)}
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${trustToday ? 'bg-[#d4af37] border-[#d4af37]' : 'border-[#334155] group-hover:border-[#7b879e]'}`}>
                  {trustToday && <svg className="w-3 h-3 text-[#0B1221]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </button>
                <span className="text-[#7b879e] text-sm leading-snug">Skip OTP for the rest of today<span className="block text-[#475569] text-xs mt-0.5">Resets at midnight Eastern Time</span></span>
              </label>
              <Button onClick={handleVerifyOtp} disabled={loading || otp.length !== 6} className="w-full h-11 rounded-lg font-semibold" data-testid="otp-verify-pwa"
                style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0B1221' }}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Sign In'}
              </Button>
              <div className="flex items-center justify-between mt-3">
                <button onClick={() => setShowOtpModal(false)} className="text-[#6b7a90] text-sm hover:text-white transition-colors">Cancel</button>
                <button onClick={() => handleResendOtp()} disabled={resendCooldown > 0}
                  className={`text-sm transition-colors ${resendCooldown > 0 ? 'text-[#334155]' : 'text-[#d4af37] hover:text-[#e8c54a]'}`}>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Forgot Password Modal */}
        {forgotMode && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#152238', border: '1px solid rgba(212,175,55,0.5)', boxShadow: '0 0 60px rgba(212,175,55,0.08), 0 8px 40px rgba(0,0,0,0.6)' }}>
              <h2 className="text-lg font-bold text-white mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Reset Password</h2>
              {forgotStep === 1 ? (
                <>
                  <p className="text-xs text-[#94A3B8] mb-4">Enter your email and we&apos;ll send you a reset code.</p>
                  <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    placeholder="Email address" className="w-full px-4 py-3 rounded-xl text-sm mb-3 bg-[#0a1128] border border-[#1e293b] text-white" data-testid="forgot-email-pwa" />
                  {forgotMsg && <p className={`text-xs mb-3 ${forgotError ? 'text-red-400' : 'text-[#22C993]'}`}>{forgotMsg}</p>}
                  <button disabled={!forgotEmail || forgotLoading} onClick={async () => {
                    setForgotLoading(true);
                    try {
                      const res = await axios.post(`${API_URL}/auth/forgot-password`, { email: forgotEmail });
                      setForgotMsg(res.data.message);
                      setForgotError(false);
                      setForgotStep(2);
                    } catch (err) { setForgotMsg(err.response?.data?.detail || 'Failed to send code.'); setForgotError(true); }
                    finally { setForgotLoading(false); }
                  }} className="w-full py-3 rounded-xl text-sm font-bold mb-3" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a', opacity: !forgotEmail || forgotLoading ? 0.5 : 1 }}>
                    {forgotLoading ? 'Sending...' : 'Send Reset Code'}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-[#94A3B8] mb-4">Enter the code sent to {forgotEmail} and your new password.</p>
                  <input type="text" value={forgotOtp} onChange={e => setForgotOtp(e.target.value)}
                    placeholder="6-digit code" maxLength={6} className="w-full px-4 py-3 rounded-xl text-sm mb-3 bg-[#0a1128] border border-[#1e293b] text-white text-center tracking-[0.3em]" />
                  <input type="password" value={forgotNewPw} onChange={e => setForgotNewPw(e.target.value)}
                    placeholder="New password (8+ characters)" className="w-full px-4 py-3 rounded-xl text-sm mb-3 bg-[#0a1128] border border-[#1e293b] text-white" />
                  <input type="password" value={forgotConfirmPw} onChange={e => setForgotConfirmPw(e.target.value)}
                    placeholder="Confirm new password" className={`w-full px-4 py-3 rounded-xl text-sm mb-1 bg-[#0a1128] border text-white ${forgotConfirmPw && forgotNewPw !== forgotConfirmPw ? 'border-red-500' : 'border-[#1e293b]'}`} />
                  {forgotConfirmPw && forgotNewPw !== forgotConfirmPw && (
                    <p className="text-red-400 text-xs mb-2">* Passwords do not match</p>
                  )}
                  {forgotMsg && <p className={`text-xs mb-3 ${forgotError ? 'text-red-400' : 'text-[#22C993]'}`}>{forgotMsg}</p>}
                  <button disabled={!forgotOtp || !forgotNewPw || forgotNewPw !== forgotConfirmPw || forgotLoading} onClick={async () => {
                    setForgotLoading(true);
                    try {
                      const res = await axios.post(`${API_URL}/auth/reset-password`, { email: forgotEmail, otp: forgotOtp, new_password: forgotNewPw });
                      setForgotMsg(res.data.message);
                      setForgotError(false);
                      setTimeout(() => { setForgotMode(false); setForgotStep(1); setForgotOtp(''); setForgotNewPw(''); setForgotConfirmPw(''); setForgotMsg(''); setForgotError(false); }, 2000);
                    } catch (err) { setForgotMsg(err.response?.data?.detail || 'Reset failed.'); setForgotError(true); }
                    finally { setForgotLoading(false); }
                  }} className="w-full py-3 rounded-xl text-sm font-bold mb-3 mt-2" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a', opacity: !forgotOtp || !forgotNewPw || forgotNewPw !== forgotConfirmPw || forgotLoading ? 0.5 : 1 }}>
                    {forgotLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </>
              )}
              <button onClick={() => { setForgotMode(false); setForgotStep(1); setForgotMsg(''); setForgotError(false); }}
                className="w-full text-center text-xs text-[#475569] hover:text-[#94a3b8]">Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{
      background: '#0E1829',
      opacity: exiting ? 0 : 1,
      ...(exiting ? { transform: 'scale(0.98)' } : {}),
      transition: 'opacity 0.45s ease, transform 0.45s ease',
    }}>

      {/* NAV BAR */}
      <nav className="fixed top-0 w-full z-[60]" style={{ borderBottom: '1px solid rgba(14,165,233,0.06)', background: 'rgba(11,18,33,0.97)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <img src="/carryon-logo.png" alt="CarryOn" className="h-12 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} data-testid="login-logo" />
          <div className="hidden md:flex items-center gap-8">
            {[
              { label: 'Features', href: '#features' },
              { label: 'Security', href: '#security' },
              { label: 'How It Works', href: '#steps' },
              { label: 'About', href: '/about' },
            ].map(item => (
              <a key={item.label} href={item.href} className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors duration-300">{item.label}</a>
            ))}
            <button onClick={() => navigateWithFade('/founder-about')} className="text-[#6b7a90] text-sm font-medium hover:text-[#d4af37] transition-colors duration-300" data-testid="nav-founder-btn">Founder</button>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <button onClick={() => navigateWithFade('/founder-about')} className="md:hidden text-[#6b7a90] text-xs font-medium hover:text-[#d4af37] transition-colors" data-testid="nav-founder-btn-mobile">Founder</button>
            <button onClick={() => navigateWithFade('/signup')} className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1">
              Open Account <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </nav>

      {/* ═══════════════════ HERO — FLAG BG + LOGO + LOGIN ═══════════════════ */}
      <section className="min-h-screen flex items-start sm:items-center relative overflow-hidden" style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top, 0px))' }}>
        {/* Flag background that fades on scroll */}
        <div className="absolute inset-0 z-0" style={{ opacity: flagOpacity * 0.85 }}>
          <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(1.3) contrast(1.05) saturate(1.1)' }} />
        </div>
        {/* Dark gradient overlay */}
        <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.0) 0%, rgba(11,18,33,0.05) 50%, rgba(14,24,41,0.25) 100%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 90% 80% at 20% 80%, rgba(255,255,255,0.12) 0%, transparent 60%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 60% at 10% 50%, rgba(255,255,255,0.08) 0%, transparent 50%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 70% at 85% 85%, rgba(255,255,255,0.14) 0%, transparent 55%)' }} />
        {/* Radial accent */}
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 70% 50% at 35% 50%, rgba(212,175,55,0.04) 0%, transparent 70%)' }} />

        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 w-full relative z-10">
          <div className="grid lg:grid-cols-[1fr_420px] gap-10 lg:gap-14 items-center">

            {/* Logo + Tagline — desktop: left side */}
            <RevealSection delay={0.1} className="hidden lg:block">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 lg:gap-8">
                <div className="flex-shrink-0">
                  <img src="/carryon-logo.png" alt="CarryOn" className="w-[200px] lg:w-[260px] h-auto" />
                </div>
                <div className="text-center sm:text-left flex-1 sm:pt-2">
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-[1.08] mb-3" style={{ fontFamily: 'Outfit, sans-serif', textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}>
                    Every American Family.
                    <span className="block text-[#d4af37] mt-1" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}>Ready.</span>
                  </h1>
                  <p className="text-white/80 text-sm lg:text-base max-w-lg leading-relaxed mb-5" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
                    The digital family preparedness platform that brings together every aspect of your life &mdash; so you and your loved ones can CarryOn through anything.
                  </p>
                  <div className="flex items-center gap-5 justify-center sm:justify-start mb-5">
                    {['AES-256 Encrypted', 'Per-Estate Keys', '2FA Protected'].map(badge => (
                      <div key={badge} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                        <span className="text-white/70 text-sm font-medium" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{badge}</span>
                      </div>
                    ))}
                  </div>
                  <a href="#about" className="inline-flex flex-col items-center gap-1 mt-4 px-5 py-2.5 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="text-white/70 text-lg font-bold group-hover:text-[#d4af37] transition-colors" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>Scroll to explore</span>
                    <ChevronDown className="w-6 h-6 text-white/50 animate-bounce group-hover:text-[#d4af37]" />
                  </a>
                </div>
              </div>
            </RevealSection>

            {/* Login Card */}
            <RevealSection delay={0.3} direction="right">
              <div className="flex justify-center lg:justify-end">
                <div className="w-full rounded-2xl p-8 relative login-card-glow" style={{
                  background: 'linear-gradient(160deg, rgba(17,27,48,0.97), rgba(13,22,40,0.99))',
                  border: '1px solid rgba(212,175,55,0.12)',
                  boxShadow: '0 8px 80px rgba(0,0,0,0.5), 0 0 50px rgba(212,175,55,0.02)',
                }}>
                  <div className="absolute top-0 left-8 right-8 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #d4af37, transparent)' }} />
                  <h2 className="text-white text-xl font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Sign In</h2>
                  <p className="text-white/70 text-sm font-semibold mb-6">Access your CarryOn account</p>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="text-white/80 text-sm font-bold mb-1.5 block">Username or Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                        <Input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Username or Email" required autoComplete="username"
                          className="h-11 pl-10 bg-[#0B1627] border-[#1A2D48] text-white placeholder:text-[#2A3C55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg" data-testid="login-email-input" />
                      </div>
                    </div>
                    <div>
                      <label className="text-white/80 text-sm font-bold mb-1.5 block">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                        <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" required autoComplete="current-password"
                          className="h-11 pl-10 pr-10 bg-[#0B1627] border-[#1A2D48] text-white placeholder:text-[#2A3C55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg" data-testid="login-password-input" />
                        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#334155] hover:text-[#7b879e] transition-colors">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    {lockoutSeconds > 0 && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center" data-testid="lockout-banner-mobile">
                        <p className="text-red-400 text-sm font-semibold">Account temporarily locked</p>
                        <p className="text-red-300/80 text-xs mt-1">Try again in <span className="font-bold text-red-300 tabular-nums">{Math.floor(lockoutSeconds / 60)}:{String(lockoutSeconds % 60).padStart(2, '0')}</span></p>
                      </div>
                    )}
                    {activeSessionWarning && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-center" data-testid="active-session-warning-desktop">
                        <p className="text-amber-400 text-sm font-semibold">Signed in elsewhere</p>
                        <p className="text-amber-300/80 text-xs mt-1.5">{activeSessionWarning}</p>
                        <button type="button" onClick={(e) => { setActiveSessionWarning(null); handleLogin(e, true); }}
                          className="mt-2.5 w-full h-10 rounded-lg text-sm font-bold transition-all active:scale-[0.97]"
                          style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37' }}
                          data-testid="force-login-btn-desktop">
                          {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Sign In Here Instead'}
                        </button>
                      </div>
                    )}
                    <Button type="submit" disabled={loading || lockoutSeconds > 0} className="w-full h-12 rounded-lg font-bold text-base" data-testid="login-submit-button"
                      style={{ background: lockoutSeconds > 0 ? '#374151' : 'linear-gradient(135deg, #d4af37, #b8962e)', color: lockoutSeconds > 0 ? '#6b7280' : '#0B1221' }}>
                      {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing In...</> : lockoutSeconds > 0 ? `Locked (${Math.floor(lockoutSeconds / 60)}:${String(lockoutSeconds % 60).padStart(2, '0')})` : 'Sign In'}
                    </Button>
                  </form>
                  {passkeyAvailable && (
                    <>
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                        <span className="text-[#334155] text-[11px] uppercase tracking-widest font-medium">or</span>
                        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                      </div>
                      <button onClick={handlePasskeyLogin} disabled={passkeyLoading}
                        className="w-full h-11 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:border-[#d4af37]/30"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                        data-testid="login-passkey-web">
                        {passkeyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-[#d4af37]" />}
                        Sign in with Passkey
                      </button>
                    </>
                  )}
                  <div className="mt-5 flex items-center justify-between">
                    <button onClick={() => navigateWithFade('/signup')} className="text-[#d4af37] text-sm font-bold hover:text-[#fcd34d] transition-colors">Create Account</button>
                    <span className="text-[#94A3B8] text-sm font-bold cursor-pointer hover:text-[#d4af37] transition-colors"
                      data-testid="forgot-password-link-web"
                      onClick={() => { setForgotMode(true); setForgotEmail(email); setForgotStep(1); setForgotMsg(''); setForgotError(false); }}>Forgot Password?</span>
                  </div>
                  <div className="mt-6 pt-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <div className="flex items-center justify-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-[#10b981]" />
                      <span className="text-white/80 text-sm font-bold">Bank-grade security &middot; 256-bit SSL</span>
                    </div>
                    <div className="mt-3 text-center">
                      <button onClick={() => navigateWithFade('/get-started')} className="animate-pulse-fast hover:brightness-110 active:scale-[0.97] cursor-pointer" data-testid="new-here-link"
                        style={{
                          background: 'linear-gradient(180deg, #f0d860 0%, #d4af37 100%)',
                          color: '#1a1200', fontWeight: 800, fontSize: '0.8125rem',
                          padding: '0.5rem 1.25rem', borderRadius: '0.625rem',
                          boxShadow: '0 3px 10px rgba(180,140,40,0.3), inset 0 1px 0 rgba(255,240,160,0.5)',
                          transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                        }}>
                        New to family preparedness?<br/>See what CarryOn can do!
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </RevealSection>

            {/* Logo + Tagline — mobile only, below login card */}
            <div className="lg:hidden col-span-full">
              <RevealSection delay={0.5}>
                <div className="flex flex-col items-center text-center mt-2">
                  <img src="/carryon-logo.png" alt="CarryOn" className="w-[240px] h-auto mb-5" />
                  <h2 className="text-3xl sm:text-4xl font-bold text-white leading-[1.08] mb-3" style={{ fontFamily: 'Outfit, sans-serif', textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}>
                    Every American Family.
                    <span className="block text-[#d4af37] mt-1" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}>Ready.</span>
                  </h2>
                  <p className="text-white/80 text-base max-w-sm leading-relaxed mb-5" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
                    The digital family preparedness platform that brings together every aspect of your life &mdash; so you and your loved ones can CarryOn through anything.
                  </p>
                  <div className="flex items-center gap-4 justify-center mb-4">
                    {['AES-256 Encrypted', 'Per-Estate Keys', '2FA Protected'].map(badge => (
                      <div key={badge} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                        <span className="text-white/70 text-sm font-medium" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{badge}</span>
                      </div>
                    ))}
                  </div>
                  <a href="#about" className="flex flex-col items-center gap-1 mt-4 mb-20 px-6 py-3 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
                    <span className="text-white/70 text-lg font-bold group-hover:text-[#d4af37] transition-colors" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>Scroll to explore</span>
                    <ChevronDown className="w-6 h-6 text-white/50 animate-bounce group-hover:text-[#d4af37]" />
                  </a>
                </div>
              </RevealSection>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ VIDEO — See CarryOn in Action ═══════════════════ */}
      <section className="relative z-10 -mt-2">
        <div className="py-16 lg:py-24 relative overflow-hidden">
          {/* Flag background continuation */}
          <div className="absolute inset-0 z-0">
            <img src="/flag-bg.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.7) contrast(1.05) saturate(0.9)' }} />
          </div>
          <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.75) 0%, rgba(11,18,33,0.6) 40%, rgba(11,18,33,0.8) 100%)' }} />
          <div className="absolute inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(212,175,55,0.04) 0%, transparent 70%)' }} />
          <RevealSection className="max-w-[900px] mx-auto px-6 text-center relative z-10">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              See CarryOn in Action
            </h2>
            <p className="text-white/60 text-sm lg:text-base mb-8">
              Learn how CarryOn&#8482; keeps your family ready for anything.
            </p>
            <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(212,175,55,0.15)', boxShadow: '0 8px 60px rgba(0,0,0,0.4), 0 0 40px rgba(212,175,55,0.05)' }}>
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                <iframe
                  src={`https://www.youtube.com/embed/${homepageVideoId}?rel=0&modestbranding=1&color=white`}
                  title="CarryOn — Estate Planning Made Simple"
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  data-testid="homepage-video"
                />
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ═══════════════════ ABOUT — family roots ═══════════════════ */}
      <section id="about" className="relative z-10 -mt-2">
        <div className="rounded-t-[2.5rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -20px 60px rgba(0,0,0,0.5)' }}>
          <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-roots.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(212,175,55,0.03) 0%, transparent 60%), linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.85) 100%)' }} />
          <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              More Than Estate Planning.<br />
              <span className="text-[#d4af37]">Total Family Preparedness.</span>
            </h2>
            <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-6">
              Life doesn&apos;t wait for the perfect moment to throw a challenge your way. A sudden illness. A natural disaster. An unexpected loss. The families that get through it aren&apos;t the ones who saw it coming &mdash; they&apos;re the ones who were prepared.
            </p>
            <p className="text-[#7b879e] text-base lg:text-lg leading-relaxed mb-8">
              CarryOn&#8482; is the first holistic digital family preparedness platform &mdash; a secure place to organize your documents, leave messages for the people you love, build action plans for any scenario, and ensure that no matter what happens, your family has everything they need to maintain continuity, stay connected, and move forward together.
            </p>
            <button onClick={() => navigateWithFade('/signup')} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-sm transition-transform duration-150 active:scale-95"
              style={{ background: '#d4af37', color: '#0B1221', transition: 'all 0.3s' }}>
              Get Started <ChevronRight className="w-4 h-4" />
            </button>
            <RevealSection delay={0.2}>
              <p className="mt-10 text-[#d4af37] text-sm lg:text-base italic font-medium">
                CarryOn&#8482; helps your family stay organized, connected, and prepared &mdash; not just for the unexpected, but for everything in between. It&apos;s just as valuable today as it is decades from now.
              </p>
            </RevealSection>
          </RevealSection>
        </div>
      </section>

      {/* ═══════════════════ REFRAME — slides over previous ═══════════════════ */}
      <section className="relative z-20 -mt-1">
        <div className="rounded-t-[2rem] py-20 lg:py-28 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.3]" style={{ backgroundImage: 'url(/texture-warmth.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.45) 0%, rgba(14,24,41,0.85) 100%)' }} />
          <RevealSection className="max-w-[800px] mx-auto px-6 text-center relative z-10">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Valuable Right Now.<br />
              <span className="text-[#d4af37]">Essential When It Matters Most.</span>
            </h2>
            <p className="text-[#7b879e] text-base leading-relaxed mb-8">
              Family preparedness isn&apos;t something you do once and forget. It&apos;s a living system that grows with your family. Every document you upload, every message you record, every plan you build &mdash; it all becomes part of a readiness infrastructure your family can rely on through any of life&apos;s biggest challenges. A job loss. A health crisis. A move across the country. The passing of someone you love. CarryOn&#8482; ensures your family never has to wonder where to look, who to call, or what to do next.
            </p>
            <RevealSection delay={0.15}>
              <p className="text-white text-base lg:text-lg font-semibold italic leading-relaxed">
                CarryOn&#8482; isn&apos;t something you set up and forget. It&apos;s a living system your family uses today &mdash; to organize, coordinate, and communicate &mdash; and relies on tomorrow when it matters most.
              </p>
            </RevealSection>
          </RevealSection>
        </div>
      </section>

      {/* ═══════════════════ EIGHT PILLARS — stacked with arrow spine ═══════════════════ */}
      <section id="features" className="relative z-30 -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0f1d30 0%, #132240 50%, #0f1d30 100%)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          {/* Warm subtle texture — no circuit boards */}
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(212,175,55,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(212,175,55,0.2) 0%, transparent 50%)' }} />
          <div className="max-w-[900px] mx-auto px-6 relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Eight Pillars of Family Readiness.
              </h2>
              <p className="text-[#a0aec0] text-base text-center max-w-[650px] mx-auto mb-16 leading-relaxed">
                Each pillar builds on the last &mdash; creating a complete family preparedness architecture, one step at a time.
              </p>
            </RevealSection>

            {/* Flow container — arrow behind the gaps between tiles */}
            <div data-testid="pillars-flow">
              {/* Tile stack with arrow behind it — arrow is scoped to ONLY the tile area */}
              <div className="relative">
                {/* Wide gentle arrow shaft — scoped to tile container only */}
                <div className="absolute left-1/2 -translate-x-1/2 z-0 rounded-full"
                  style={{
                    width: '180px',
                    top: '30px',
                    bottom: '0px',
                    background: 'linear-gradient(180deg, rgba(212,175,55,0.05) 0%, rgba(212,175,55,0.13) 15%, rgba(212,175,55,0.13) 85%, rgba(212,175,55,0.18) 100%)',
                    borderRadius: '90px',
                  }} />

                {/* Feature tiles — full width, stacked with generous gaps to show arrow */}
                <div className="relative z-10 flex flex-col gap-6">
                {[
                  { num: '01', icon: MessageSquare, title: 'Milestone Messages', abbr: 'MM',
                    bold: 'Your words at their wedding. Your voice on their birthday. Your love \u2014 delivered exactly when it matters.',
                    desc: 'Record written, audio, or video messages for the milestones you want to be part of \u2014 even if you can\'t be there. Graduations, births, first homes, or any moment you choose. Create them infinitely over time, and they\'re delivered exactly as you envision.' },
                  { num: '02', icon: LockIcon, title: 'Secure Document Vault', abbr: 'SDV',
                    bold: 'Every will, trust, policy, and deed \u2014 encrypted, organized, and accessible to the right people at the right time.',
                    desc: 'Upload your most critical family documents into a per-estate encrypted vault with AES-256 encryption and Triple Lock protection. Your beneficiaries access exactly what you authorize \u2014 and your documents become the foundation that powers everything else.' },
                  { num: '03', icon: Sparkles, title: 'Estate Guardian\u2122 AI', abbr: 'EGA',
                    bold: 'An AI analyst trained on U.S. law across all 50 states \u2014 working inside your encrypted vault to find what you missed.',
                    desc: 'EGA analyzes your uploaded documents for contradictions, gaps, outdated provisions, and missing pieces. It identifies critical details \u2014 claim phone numbers, executor contacts, filing deadlines \u2014 and auto-populates the beginnings of your personalized action plan. No team reads your documents. The AI works entirely within your encryption.' },
                  { num: '04', icon: ClipboardCheck, title: 'Immediate Action Checklist', abbr: 'IAC',
                    bold: 'A step-by-step guide your family can follow on the hardest days of their lives.',
                    desc: 'Partially auto-created by EGA from your documents and fully customizable by you. When a crisis hits, your family opens the IAC and knows exactly what to do, who to call, where to find every document, and what deadlines matter. No guessing. No searching. No overwhelm.' },
                  { num: '05', icon: Radio, title: 'Contingency Protocols', abbr: 'CCP',
                    bold: 'Response plans your family can build now for the scenarios they might face \u2014 ready to activate at a moment\u2019s notice.',
                    desc: 'Build contingency protocols for any situation: medical emergencies, natural disasters, financial disruptions, or the passing of a family member. Each protocol connects your people, your documents, your checklists, and your communication channels into one coordinated plan your family can execute together.' },
                  { num: '06', icon: MessageCircle, title: 'Estate Communications Tool', abbr: 'ECT',
                    bold: 'Secure, private family messaging that powers your protocols and keeps your family connected when it counts.',
                    desc: 'ECT is the communication backbone of your family\'s readiness infrastructure. Encrypted, access-controlled conversations between benefactors and beneficiaries, purpose-built for sensitive family coordination. When a contingency protocol activates, ECT is how your family stays in sync \u2014 privately and securely.' },
                  { num: '07', icon: Key, title: 'Digital Access Vault', abbr: 'DAV',
                    bold: 'Passwords, accounts, crypto keys, and digital credentials \u2014 saved, encrypted, and assigned to the right people.',
                    desc: 'The modern family has dozens of digital accounts, subscriptions, financial platforms, and access credentials that need to be passed down and organized. DAV stores them all in your encrypted vault, assigned to specific beneficiaries, so nothing is lost and nothing is forgotten.' },
                  { num: '08', icon: Users, title: 'Family & Friends Notification', abbr: 'FFN',
                    bold: 'The people who matter most should never hear important news through the grapevine.',
                    desc: 'Build a personalized notification list of family, friends, colleagues, and anyone your beneficiaries should contact during a transition or emergency. Names, phone numbers, relationships, and special notes \u2014 all organized and ready so your family can coordinate outreach without scrambling.' },
                ].map(({ num, icon: Icon, title, abbr, bold, desc }, i) => (
                  <RevealSection key={num} delay={i * 0.04}>
                    <div className="rounded-2xl p-6 lg:p-8 relative overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(20,33,56,0.98) 0%, rgba(16,28,48,0.98) 100%)',
                        border: '1px solid rgba(212,175,55,0.10)',
                        boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
                      }}>
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl" style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.3), rgba(212,175,55,0.6), rgba(212,175,55,0.3))' }} />
                      <div className="flex items-start gap-5">
                        <div className="flex flex-col items-center gap-2.5 flex-shrink-0 pt-0.5">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm"
                            style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.12), rgba(212,175,55,0.06))', border: '1.5px solid rgba(212,175,55,0.25)', color: '#d4af37' }}>
                            {num}
                          </div>
                          <div className="w-9 h-9 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(212,175,55,0.06)' }}>
                            <Icon className="w-4 h-4 text-[#d4af37]/70" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-3 mb-2">
                            <h4 className="text-white text-lg font-bold leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h4>
                            <span className="text-[#8b97ab] text-xs font-semibold tracking-wider flex-shrink-0">{abbr}</span>
                          </div>
                          <p className="text-sm font-medium mb-2.5 leading-relaxed" style={{ color: '#e8c972' }}>{bold}</p>
                          <p className="text-[#8b97ab] text-sm leading-relaxed">{desc}</p>
                        </div>
                      </div>
                    </div>
                  </RevealSection>
                ))}
              </div>
              {/* Close tile stack container — arrow is scoped here */}
              </div>

              {/* Single gentle arrowhead — connects shaft to end-state tile */}
              <div className="flex justify-center relative z-10 -mt-1 mb-0">
                <svg width="180" height="40" viewBox="0 0 180 40" fill="none">
                  <path d="M0 0 L90 36 L180 0" fill="rgba(212,175,55,0.18)" />
                  <path d="M20 0 L90 30 L160 0" fill="rgba(212,175,55,0.10)" />
                </svg>
              </div>

              {/* End-state tile — warm, fully opaque, clearly separated from arrow */}
              <RevealSection delay={0.5}>
                <div className="relative z-20 mx-auto max-w-[640px] rounded-[1.75rem] p-8 lg:p-10 text-center -mt-1"
                  data-testid="holistic-preparedness-tile"
                  style={{
                    background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)',
                    border: '2px solid rgba(212,175,55,0.30)',
                    boxShadow: '0 8px 48px rgba(0,0,0,0.35), 0 0 60px rgba(212,175,55,0.08), inset 0 1px 0 rgba(212,175,55,0.06)',
                  }}>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.08))', border: '1.5px solid rgba(212,175,55,0.25)' }}>
                    <Shield className="w-6 h-6 text-[#d4af37]" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold text-[#d4af37] mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    Holistic Family Preparedness.
                  </h3>
                  <p className="text-[#a0aec0] text-sm lg:text-base leading-relaxed mb-4">
                    Eight pillars. One family. A living system that grows with you, protects what matters most, and ensures that no matter what life brings &mdash; your family is never left searching, wondering, or scrambling.
                  </p>
                  <p className="text-white text-base font-semibold italic">
                    They&apos;re ready. Because you prepared.
                  </p>
                </div>
              </RevealSection>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ PLATFORM FEATURES — compact grid ═══════════════════ */}
      <section className="relative z-[35] -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.2]" style={{ backgroundImage: 'url(/texture-warmth.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.45) 0%, rgba(14,24,41,0.82) 100%)' }} />
          <div className="max-w-[1100px] mx-auto px-6 relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Built for Real Families.
              </h2>
              <p className="text-[#7b879e] text-base text-center max-w-[650px] mx-auto mb-14 leading-relaxed">
                Beyond the core pillars, CarryOn&#8482; gives your family a complete readiness infrastructure with tools designed for how modern families actually live.
              </p>
            </RevealSection>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { icon: UserCheck, title: 'Benefactor & Beneficiary System', desc: 'Enroll the people who matter most. Control what each person can see, access, and manage within your family\'s readiness plan.' },
                { icon: ArrowUpDown, title: 'Succession Hierarchy', desc: 'Ranked beneficiary succession with automatic promotion when a primary can no longer serve. Your chain of responsibility never breaks.' },
                { icon: Layers, title: 'Multi-Estate Support', desc: 'Manage multiple estates under one account &mdash; built for blended, extended, and modern families with complex structures.' },
                { icon: Users, title: 'Family Plan Savings', desc: 'Bundle your household for percentage-based discounts on every tier. The more family members you prepare, the more you save.' },
                { icon: ShieldAlert, title: 'Emergency Access', desc: 'Verified protocol for beneficiaries to request vault access when a benefactor is incapacitated. Built for real emergencies.' },
                { icon: SlidersHorizontal, title: 'Section Permissions', desc: 'Control exactly what each beneficiary can see &mdash; vault, messages, checklists, protocols, and more. Granular, per-person access.' },
                { icon: Smartphone, title: 'Native Mobile App', desc: 'iOS and Android with biometric login, push notifications, and full platform access. Your family\'s readiness goes wherever you go.' },
                { icon: MapPin, title: '50-State Legal Intelligence', desc: 'Estate Guardian calibrates every analysis to your declared state of residence and its specific laws. Personalized, not generic.' },
              ].map(({ icon: Icon, title, desc }, i) => (
                <RevealSection key={title} delay={i * 0.06}>
                  <div className="rounded-xl p-5 h-full transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20"
                    style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.12)' }}>
                      <Icon className="w-4 h-4 text-[#d4af37]" />
                    </div>
                    <h4 className="text-white text-sm font-semibold mb-1.5">{title}</h4>
                    <p className="text-[#6b7a90] text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: desc }} />
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ THREE STEPS — slides over ═══════════════════ */}
      <section id="steps" className="relative z-40 -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #111F34, #0E1829)', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: 'url(/texture-pathway.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 30%, rgba(212,175,55,0.03) 0%, transparent 70%)' }} />
          <div className="max-w-[800px] mx-auto px-6 text-center relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Family Readiness in Five Steps.
              </h2>
              <p className="text-[#7b879e] text-base max-w-[600px] mx-auto mb-14 leading-relaxed">
                You don&apos;t need to do it all at once. Start with what matters most and build your family&apos;s readiness over time.
              </p>
            </RevealSection>
            <div className="space-y-8 text-left">
              {[
                { step: '1', title: 'Enroll Your Family', desc: 'Invite your beneficiaries \u2014 the people who matter most. Set their roles, permissions, and access levels. Your family\'s readiness starts with the people in it.' },
                { step: '2', title: 'Leave Your Messages', desc: 'Record Milestone Messages for the moments you want to be part of \u2014 graduations, weddings, birthdays, or just a Tuesday. Create them over time, as many as you want, delivered exactly as you envision.' },
                { step: '3', title: 'Upload & Analyze', desc: 'Upload your documents into the Secure Document Vault. Estate Guardian\u2122 AI analyzes everything and auto-creates the beginnings of your personalized Immediate Action Checklist \u2014 so your family has a clear plan from day one.' },
                { step: '4', title: 'Build Your Protocols', desc: 'Create Contingency Protocols for the scenarios that matter to your family. Connect your documents, checklists, and communication channels into coordinated response plans. Use the Estate Communications Tool to keep everyone in sync.' },
                { step: '5', title: 'Live Your Life', desc: 'Your family\'s readiness infrastructure is built. Save credentials in the Digital Access Vault, organize contacts in Family & Friends Notification, and update your plan whenever life changes. When any challenge comes \u2014 your family will never be left searching.' },
              ].map(({ step, title, desc }, i) => (
                <RevealSection key={step} delay={i * 0.15}>
                  <div className="flex gap-5 group">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-base" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.25)' }}>
                      {step}
                    </div>
                    <div>
                      <p className="text-white text-base leading-relaxed">
                        <span className="font-bold">Step {step} &mdash; {title}.</span>{' '}
                        <span className="text-[#7b879e]">{desc}</span>
                      </p>
                    </div>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ SECURITY — slides over ═══════════════════ */}
      <section id="security" className="relative z-50 -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32 relative overflow-hidden" style={{ background: '#0E1829', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.35]" style={{ backgroundImage: 'url(/texture-family.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,24,41,0.35) 0%, rgba(14,24,41,0.75) 100%)' }} />
          <div className="max-w-[1100px] mx-auto px-6 text-center relative z-10">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Your Family&apos;s Privacy Is Non-Negotiable.
              </h2>
              <p className="text-[#7b879e] text-base max-w-[700px] mx-auto mb-14 leading-relaxed">
                The most important things your family will ever share live on this platform. That&apos;s why every layer of CarryOn&#8482; is built with the same security standards that protect financial institutions and government systems &mdash; because your family deserves nothing less.
              </p>
            </RevealSection>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                { icon: LockIcon, text: 'AES-256 per-estate encryption \u2014 your family\'s data is never accessed by our team' },
                { icon: Sparkles, text: 'Estate Guardian\u2122 AI operates entirely within your encrypted vault \u2014 no data ever leaves' },
                { icon: Shield, text: 'Two-factor authentication on every login with device trust options for your family' },
                { icon: Users, text: 'Transition verification by a human team \u2014 not algorithms, not AI. Real people confirming real events.' },
                { icon: Trash2, text: 'Post-execution record destruction \u2014 sensitive records are permanently eliminated after tasks complete' },
                { icon: FileCheck, text: 'SOC 2 compliance architecture with full audit trail and GDPR data rights built in' },
              ].map(({ icon: Icon, text }, i) => (
                <RevealSection key={i} delay={i * 0.08}>
                  <div className="rounded-xl p-6 text-center h-full"
                    style={{ background: 'rgba(15,26,46,0.45)', border: '1px solid rgba(14,165,233,0.06)' }}>
                    <Icon className="w-6 h-6 text-[#7b879e] mx-auto mb-4 transition-colors duration-300 group-hover:text-[#d4af37]" />
                    <p className="text-[#94a3b8] text-sm leading-relaxed">{text}</p>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ HOSPICE ═══════════════════ */}
      <section className="relative z-[60] -mt-1">
        <div className="rounded-t-[2rem] py-20 lg:py-24 relative overflow-hidden" style={{ background: '#111F34', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <div className="absolute inset-0 opacity-[0.3]" style={{ backgroundImage: 'url(/texture-pulse.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(17,31,52,0.4) 0%, rgba(17,31,52,0.75) 60%, #111F34 100%)' }} />
          <RevealSection className="max-w-[800px] mx-auto px-6 relative z-10">
            <div className="rounded-2xl p-8 lg:p-12 text-center transition-all duration-700 hover:border-[#d4af37]/40" style={{ border: '1px solid rgba(212,175,55,0.25)', background: 'rgba(212,175,55,0.03)' }}>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#d4af37] mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Free for Every American in Hospice Care.
              </h2>
              <p className="text-[#7b879e] text-base leading-relaxed mb-6">
                At any given time, over 300,000 Americans are in hospice &mdash; and the vast majority have no plan in place for their families. CarryOn&#8482; is offered at no cost to all U.S. citizens and resident aliens enrolled in certified hospice care. Full platform access. No exceptions.
              </p>
              <p className="text-white text-base font-semibold italic leading-relaxed">
                No one should be denied the ability to organize their affairs and prepare their family &mdash; simply because of their circumstances.
              </p>
            </div>
          </RevealSection>
          <RevealSection delay={0.2} className="max-w-[800px] mx-auto px-6 relative z-10 mt-6">
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="rounded-xl p-6 text-center transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20" style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
                <h4 className="text-white text-base font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Military &amp; Veteran Families</h4>
                <p className="text-[#7b879e] text-sm leading-relaxed">
                  Reduced pricing for active-duty service members, veterans, and their families. Your service prepared you for everything &mdash; let CarryOn help prepare your family for anything else.
                </p>
              </div>
              <div className="rounded-xl p-6 text-center transition-all duration-500 hover:-translate-y-1 hover:border-[#d4af37]/20" style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
                <h4 className="text-white text-base font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>New Adult Tier (18&ndash;25)</h4>
                <p className="text-[#7b879e] text-sm leading-relaxed">
                  A dedicated tier for young Americans just starting out. Because family preparedness shouldn&apos;t start when you think you need it &mdash; it should start the day you&apos;re responsible for yourself.
                </p>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ═══════════════════ FINAL CTA ═══════════════════ */}
      <section className="relative z-[70] -mt-1">
        <div className="rounded-t-[2rem] py-24 lg:py-32" style={{ background: '#0E1829', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
          <RevealSection className="max-w-[600px] mx-auto px-6 text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Readiness Starts Today.
            </h2>
            <p className="text-[#7b879e] text-base mb-8">
              Join the families who are choosing preparedness over uncertainty. Whatever comes next &mdash; your family will be ready.
            </p>
            <button onClick={() => navigateWithFade('/signup')} className="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-semibold text-base transition-transform duration-150 active:scale-95"
              style={{ background: '#d4af37', color: '#0B1221', transition: 'all 0.3s' }}>
              Start Your Free Trial <ChevronRight className="w-4 h-4" />
            </button>
          </RevealSection>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-[80] py-10" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <img src="/carryon-logo.png" alt="CarryOn" className="h-8 opacity-60" />
            <div className="flex items-center gap-6">
              <a href="/privacy" className="text-[#334155] text-xs hover:text-[#7b879e] transition-colors" data-testid="login-footer-privacy-link">Privacy Policy</a>
              <a href="/terms" className="text-[#334155] text-xs hover:text-[#7b879e] transition-colors" data-testid="login-footer-terms-link">Terms of Service</a>
              <span className="text-[#334155] text-xs">Accessibility</span>
            </div>
            <div className="text-right text-[#334155] text-xs leading-relaxed">
              <p>1550 Wilson Boulevard 7th Floor</p>
              <p>Arlington, VA 22209 U.S.A.</p>
              <p>(703) 884-1527</p>
            </div>
          </div>
          <p className="text-center text-[#2A3C55] text-xs mt-6">&copy; {new Date().getFullYear()} CarryOn Technologies LLC. All rights reserved.</p>
        </div>
      </footer>

      {/* Option C: Mobile browser "Add to Home Screen" banner */}
      {isMobileNonPWA && !installBannerDismissed && (
        <div className="fixed bottom-0 left-0 right-0 z-[90] p-3 safe-area-pb" style={{ background: 'linear-gradient(180deg, transparent, rgba(8,14,26,0.95) 20%)', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }} data-testid="install-banner">
          <div className="max-w-sm mx-auto rounded-xl p-3.5 flex items-center gap-3" style={{ background: 'rgba(17,27,48,0.95)', border: '1px solid rgba(212,175,55,0.2)', backdropFilter: 'blur(12px)' }}>
            <img src="/carryon-logo.png" alt="" className="w-8 h-8 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold leading-tight">Get the CarryOn App</p>
              <p className="text-[#6b7a90] text-[11px]">Add to your home screen &mdash; no download needed</p>
            </div>
            <button onClick={() => setShowInstallGuide(true)} className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
              style={{ background: '#d4af37', color: '#0B1221' }} data-testid="install-banner-cta">
              Install
            </button>
            <button onClick={() => { localStorage.setItem('carryon_install_dismissed', '1'); setInstallBannerDismissed(true); }} className="flex-shrink-0 text-[#475569] hover:text-white p-1" data-testid="install-banner-dismiss">
              <span className="text-lg leading-none">&times;</span>
            </button>
          </div>
        </div>
      )}

      {/* PWA Install Guide Modal */}
      <PWAInstallGuide open={showInstallGuide} onClose={() => setShowInstallGuide(false)} />

      {/* OTP MODAL */}
      {showOtpModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl p-8" style={{ background: 'linear-gradient(145deg, rgba(20,30,52,0.98), rgba(15,22,41,1))', border: '1px solid rgba(212,175,55,0.15)' }}>
            <h3 className="text-white text-xl font-semibold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Two-Factor Authentication</h3>
            <p className="text-[#6b7a90] text-sm mb-6">
              {otpMethod === 'sms'
                ? `Enter the 6-digit code sent to ${maskedPhone || 'your phone'}`
                : 'Enter the 6-digit code sent to your email'}
            </p>
            <Input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000" className="h-14 text-center text-2xl tracking-[0.4em] font-mono bg-[#0D1829] border-[#1E3048] text-white focus:border-[#d4af37] rounded-lg mb-4" data-testid="otp-input" autoFocus />
            
            {/* SMS/Email toggle when user has both options */}
            {hasSmsOtp && (
              <div className="flex items-center gap-2 mb-4 p-2 rounded-lg" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.1)' }}>
                <span className="text-[#6b7a90] text-xs">Send code via:</span>
                <button
                  onClick={() => handleResendOtp('sms')}
                  disabled={resendCooldown > 0}
                  className={`text-xs px-3 py-1 rounded-full transition-all ${otpMethod === 'sms' ? 'bg-[#d4af37] text-[#0B1221] font-semibold' : 'text-[#6b7a90] hover:text-white'}`}
                  data-testid="otp-method-sms">
                  SMS {maskedPhone ? `(${maskedPhone})` : ''}
                </button>
                <button
                  onClick={() => handleResendOtp('email')}
                  disabled={resendCooldown > 0}
                  className={`text-xs px-3 py-1 rounded-full transition-all ${otpMethod === 'email' ? 'bg-[#d4af37] text-[#0B1221] font-semibold' : 'text-[#6b7a90] hover:text-white'}`}
                  data-testid="otp-method-email">
                  Email
                </button>
              </div>
            )}

            {/* Trust today option */}
            <label className="flex items-center gap-3 mb-5 cursor-pointer select-none group" data-testid="trust-today-label">
              <button type="button" onClick={() => setTrustToday(!trustToday)}
                className={`flex-shrink-0 w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${
                  trustToday ? 'bg-[#d4af37] border-[#d4af37]' : 'border-[#334155] group-hover:border-[#7b879e]'
                }`} data-testid="trust-today-checkbox">
                {trustToday && <svg className="w-3 h-3 text-[#0B1221]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </button>
              <span className="text-[#7b879e] text-sm leading-snug">
                Skip OTP for the rest of today
                <span className="block text-[#475569] text-xs mt-0.5">Resets at midnight Eastern Time</span>
              </span>
            </label>

            <Button onClick={handleVerifyOtp} disabled={loading || otp.length !== 6} className="w-full h-11 rounded-lg font-semibold" data-testid="otp-verify-button"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0B1221' }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Sign In'}
            </Button>
            <div className="flex items-center justify-between mt-3">
              <button onClick={() => setShowOtpModal(false)} className="text-[#6b7a90] text-sm hover:text-white transition-colors" data-testid="otp-cancel-button">Cancel</button>
              <button onClick={() => handleResendOtp()} disabled={resendCooldown > 0}
                className={`text-sm transition-colors ${resendCooldown > 0 ? 'text-[#334155] cursor-not-allowed' : 'text-[#d4af37] hover:text-[#e8c54a]'}`}
                data-testid="otp-resend-button">
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Biometric Setup Prompt */}
      {showBiometricPrompt && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl p-8 text-center" style={{ background: 'linear-gradient(145deg, rgba(17,27,48,0.98), rgba(13,22,40,1))', border: '1px solid rgba(14,165,233,0.15)' }}>
            <div className="w-20 h-20 mx-auto mb-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(14,165,233,0.1)', border: '2px solid rgba(14,165,233,0.2)' }}>
              <Shield className="w-10 h-10 text-[#0EA5E9]" />
            </div>
            <h3 className="text-white text-xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Enable Face ID?</h3>
            <p className="text-[#6b7a90] text-sm mb-6 leading-relaxed">
              Sign in instantly with Face ID next time you open CarryOn. You can change this anytime in Settings.
            </p>
            <button
              onClick={async () => {
                try {
                  const { registerBiometric } = await import('../services/biometric');
                  const token = localStorage.getItem('carryon_token');
                  await registerBiometric(token, email, password);
                  localStorage.setItem('carryon_biometric_email', email);
                } catch (err) {
                  console.error('Biometric setup error:', err);
                }
                setShowBiometricPrompt(false);
                if (pendingLoginResult) navigateToHome(pendingLoginResult);
              }}
              className="w-full py-3 rounded-xl font-bold text-sm mb-3 transition-all"
              style={{ background: 'linear-gradient(135deg, #0EA5E9, #0369A1)', color: 'white' }}
              data-testid="enable-biometric-btn"
            >
              Enable Face ID
            </button>
            <button
              onClick={() => { localStorage.setItem('carryon_biometric_declined', 'true'); setShowBiometricPrompt(false); if (pendingLoginResult) navigateToHome(pendingLoginResult); }}
              className="text-[#475569] text-sm font-medium hover:text-[#94a3b8] transition-colors"
              data-testid="skip-biometric-btn"
            >
              Not Now
            </button>
          </div>
        </div>
      )}

      {/* Forgot Password Modal */}
      {forgotMode && (
        <div className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-4 pt-24 sm:pt-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#152238', border: '1px solid rgba(212,175,55,0.5)', boxShadow: '0 0 60px rgba(212,175,55,0.08), 0 8px 40px rgba(0,0,0,0.6)' }}>
            <h2 className="text-lg font-bold text-white mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>Reset Password</h2>
            {forgotStep === 1 ? (
              <>
                <p className="text-xs text-[#94A3B8] mb-4">Enter your email and we'll send you a reset code.</p>
                <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                  placeholder="Email address" className="w-full px-4 py-3 rounded-xl text-sm mb-3 bg-[#0a1128] border border-[#1e293b] text-white" />
                {forgotMsg && <p className={`text-xs mb-3 ${forgotError ? 'text-red-400' : 'text-[#22C993]'}`}>{forgotMsg}</p>}
                <button disabled={!forgotEmail || forgotLoading} onClick={async () => {
                  setForgotLoading(true);
                  try {
                    const res = await axios.post(`${API_URL}/auth/forgot-password`, { email: forgotEmail });
                    setForgotMsg(res.data.message);
                    setForgotError(false);
                    setForgotStep(2);
                  } catch (err) { setForgotMsg(err.response?.data?.detail || 'Failed to send code. Please try again.'); setForgotError(true); }
                  finally { setForgotLoading(false); }
                }} className="w-full py-3 rounded-xl text-sm font-bold mb-3" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a', opacity: !forgotEmail || forgotLoading ? 0.5 : 1 }}>
                  {forgotLoading ? 'Sending...' : 'Send Reset Code'}
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-[#94A3B8] mb-4">Enter the code sent to {forgotEmail} and your new password.</p>
                <input type="text" value={forgotOtp} onChange={e => setForgotOtp(e.target.value)}
                  placeholder="6-digit code" maxLength={6} className="w-full px-4 py-3 rounded-xl text-sm mb-3 bg-[#0a1128] border border-[#1e293b] text-white text-center tracking-[0.3em]" />
                <input type="password" value={forgotNewPw} onChange={e => setForgotNewPw(e.target.value)}
                  placeholder="New password (8+ characters)" className="w-full px-4 py-3 rounded-xl text-sm mb-3 bg-[#0a1128] border border-[#1e293b] text-white" />
                <input type="password" value={forgotConfirmPw} onChange={e => setForgotConfirmPw(e.target.value)}
                  placeholder="Confirm new password" className={`w-full px-4 py-3 rounded-xl text-sm mb-1 bg-[#0a1128] border text-white ${forgotConfirmPw && forgotNewPw !== forgotConfirmPw ? 'border-red-500' : 'border-[#1e293b]'}`} />
                {forgotConfirmPw && forgotNewPw !== forgotConfirmPw && (
                  <p className="text-red-400 text-xs mb-2">* Passwords do not match</p>
                )}
                {forgotMsg && <p className={`text-xs mb-3 ${forgotError ? 'text-red-400' : 'text-[#22C993]'}`}>{forgotMsg}</p>}
                <button disabled={!forgotOtp || !forgotNewPw || forgotNewPw !== forgotConfirmPw || forgotLoading} onClick={async () => {
                  setForgotLoading(true);
                  try {
                    const res = await axios.post(`${API_URL}/auth/reset-password`, { email: forgotEmail, otp: forgotOtp, new_password: forgotNewPw });
                    setForgotMsg(res.data.message);
                    setForgotError(false);
                    setTimeout(() => { setForgotMode(false); setForgotStep(1); setForgotOtp(''); setForgotNewPw(''); setForgotConfirmPw(''); setForgotMsg(''); setForgotError(false); }, 2000);
                  } catch (err) { setForgotMsg(err.response?.data?.detail || 'Reset failed. Please try again.'); setForgotError(true); }
                  finally { setForgotLoading(false); }
                }} className="w-full py-3 rounded-xl text-sm font-bold mb-3 mt-2" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a', opacity: !forgotOtp || !forgotNewPw || forgotNewPw !== forgotConfirmPw || forgotLoading ? 0.5 : 1 }}>
                  {forgotLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </>
            )}
            <button onClick={() => { setForgotMode(false); setForgotStep(1); setForgotMsg(''); setForgotError(false); }}
              className="w-full text-center text-xs text-[#475569] hover:text-[#94a3b8]">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
