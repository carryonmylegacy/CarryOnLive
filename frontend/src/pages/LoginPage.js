import { YouTubeFacade } from '../components/YouTubeFacade';
import { FlagBackdrop } from '../components/FlagBackdrop';
import React, { useState, useEffect } from 'react';
import SEO from '../components/SEO';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../utils/apiClient';
import { Mail, Lock, Eye, EyeOff, Loader2, Shield, ChevronRight, ChevronDown, Sparkles, ExternalLink, WifiOff, Menu, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from '../utils/toast';
import { isNative } from '../services/native';
import { isPWA, isMobileBrowser } from '../utils/pwaDetect';
import PWAInstallGuide from '../components/PWAInstallGuide';
import SealedAccountScreen from '../components/SealedAccountScreen';
import { haptics } from '../utils/haptics';
import { API_URL } from '../config';
import { RevealSection } from '../components/landing/RevealSection';
import { FreeModeBanner } from '../components/FreeModeBanner';
import LandingContent from '../components/landing/LandingContent';
import ForgotPasswordModal from '../components/auth/ForgotPasswordModal';
import { isPWA as isStandalonePWA } from '../utils/isPWA';
import {
  getOfflineCredential,
  unlockOfflineCredential,
} from '../offline/offlineCredentialCache';

/**
 * Offline notice + recovery tip rendered above the sign-in form when
 * the device has no signal. CarryOn's offline-first runtime kicks in
 * AFTER login (it needs a JWT and a synced local mirror to work
 * without a server), so explaining that boundary up front avoids a
 * confusing "why is everything broken?" moment when a traveling user
 * lands here in airplane mode.
 */
const LoginOfflineBanner = ({ isOffline, hasOfflineCredential }) => {
  if (!isOffline) return null;
  // If the user has already enrolled an offline credential on this
  // device, the banner is purely informational and confirms they're
  // about to use it. The "you have to be logged in before losing
  // signal" caveat does NOT apply once enrolled — the encrypted
  // credential lives on this device.
  if (hasOfflineCredential) {
    return (
      <div
        data-testid="login-offline-banner"
        className="rounded-xl px-4 py-3 mb-4 flex gap-3 items-start"
        style={{
          background: 'rgba(34, 201, 147, 0.12)',
          border: '1px solid rgba(34, 201, 147, 0.4)',
        }}
      >
        <WifiOff className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#34d399' }} />
        <div className="text-[13px] leading-snug" style={{ color: 'rgba(255,255,255,0.92)' }}>
          <div className="font-semibold mb-1" style={{ color: '#34d399' }}>You&apos;re offline &mdash; offline sign-in is enabled on this device.</div>
          <p>
            Enter the password for the account you enrolled in <span className="font-semibold" style={{ color: '#fcd34d' }}>Settings &rarr; Offline</span>.
            We&apos;ll unlock your encrypted credential locally and sign you in. Some pages may show cached data only until you reconnect.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div
      data-testid="login-offline-banner"
      className="rounded-xl px-4 py-3 mb-4 flex gap-3 items-start"
      style={{
        background: 'rgba(239, 68, 68, 0.12)',
        border: '1px solid rgba(239, 68, 68, 0.4)',
      }}
    >
      <WifiOff className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#fca5a5' }} />
      <div className="text-[13px] leading-snug" style={{ color: 'rgba(255,255,255,0.92)' }}>
        <div className="font-semibold mb-1" style={{ color: '#fca5a5' }}>You&apos;re offline &mdash; sign-in needs a connection.</div>
        <p className="mb-2">
          Sign in once while online and CarryOn will keep working offline after that:
          record milestones, upload documents, send messages, and edit anything &mdash;
          we&apos;ll sync it all when you reconnect.
        </p>
        <p style={{ color: 'rgba(255,255,255,0.78)' }}>
          Want to sign in even with no signal? After signing in, head to{' '}
          <span className="font-semibold" style={{ color: '#fcd34d' }}>Settings &rarr; Offline</span>{' '}
          and turn on &ldquo;Offline access on this device.&rdquo; You&apos;ll be able to sign back in on this device without a connection from then on.
        </p>
      </div>
    </div>
  );
};

const useIsMobileViewport = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
};

const LoginPage = () => {
  const isLoginPath = useLocation().pathname === '/login';
  const navigate = useNavigate();
  const { login, verifyOtp, resendOtp, loginWithToken: authLoginWithToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [trustToday, setTrustToday] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const flagRef = React.useRef(null);
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
  // Live online/offline status for the login-offline banner.
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false
  );
  // Whether this device has a previously-enrolled offline credential.
  // Drives the banner copy: with a credential the user CAN sign in
  // offline; without one the page is honest about the limitation.
  const [hasOfflineCredential, setHasOfflineCredential] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { hasAnyOfflineCredential } = await import('../offline/offlineCredentialCache');
        const has = await hasAnyOfflineCredential();
        if (live) setHasOfflineCredential(has);
      } catch { /* IndexedDB unavailable — leave as false */ }
    })();
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const onOff = () => setIsOffline(true);
    const onOn = () => setIsOffline(false);
    window.addEventListener('offline', onOff);
    window.addEventListener('online', onOn);
    return () => {
      window.removeEventListener('offline', onOff);
      window.removeEventListener('online', onOn);
    };
  }, []);
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
  // When the platform is in Free Mode, the hero surfaces the "CarryOn is
  // free right now" tile (same copy as the in-app Free banner).
  const [platformFreeMode, setPlatformFreeMode] = useState(false);

  useEffect(() => {
    apiClient.get(`${API_URL}/public/site-content`).then(r => {
      setPlatformFreeMode(!!r.data.platform_free_mode);
    }).catch(() => {});
  }, []);

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

  /* flag fade on scroll — uses ref to avoid re-renders */
  useEffect(() => {
    const handleScroll = () => {
      const fade = Math.max(0, 1 - window.scrollY / 600);
      if (flagRef.current) flagRef.current.style.opacity = fade * 0.85;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  /* fetch homepage video ID */
  const [homepageVideoId, setHomepageVideoId] = useState('KlZ8egF_Nyw');
  const [verticalVideoId, setVerticalVideoId] = useState('5fDJ9e7bEUo');
  const isMobileView = useIsMobileViewport();
  useEffect(() => {
    apiClient.get(`${API_URL}/public/site-content`).then(r => {
      if (r.data?.homepage_video_id) setHomepageVideoId(r.data.homepage_video_id);
      if (r.data?.homepage_video_id_vertical) setVerticalVideoId(r.data.homepage_video_id_vertical);
    }).catch(() => {});
  }, []);

  const showVertical = isMobileView && verticalVideoId;
  const activeVideoId = showVertical ? verticalVideoId : homepageVideoId;

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

    // ── Stripe-return safety net ─────────────────────────────────────
    // If the user JUST completed a Stripe checkout and got bounced
    // back to /login (typical macOS dock-PWA → external-browser
    // redirect path), we routed the pending `session_id` into
    // localStorage before handing them to Stripe. Honor it now so the
    // post-login redirect lands them on /subscription with the
    // session_id intact — that fires the celebration + reconciliation
    // flow already wired into SubscriptionPage. Falls back to the
    // current URL's `?session_id=…` if present (case where Stripe
    // redirected directly to /login).
    try {
      let pending = null;
      const raw = localStorage.getItem('carryon_pending_stripe_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        const ageMs = Date.now() - (parsed?.created_at || 0);
        if (parsed?.session_id && ageMs < 60 * 60 * 1000) {
          pending = parsed;
        } else {
          // Expired — clear so we don't loop.
          localStorage.removeItem('carryon_pending_stripe_session');
        }
      }
      const urlParams = new URLSearchParams(window.location.search);
      const urlSession = urlParams.get('session_id');
      const urlFcSession = urlParams.get('fc_session_id');
      const sid = pending?.session_id || urlSession || urlFcSession;
      if (sid && result.user?.role !== 'admin' && result.user?.role !== 'operator') {
        // Founders Circle sessions use a different query param name.
        const qp = pending?.fc || urlFcSession ? 'fc_session_id' : 'session_id';
        navigate(`/subscription?${qp}=${encodeURIComponent(sid)}`);
        return;
      }
    } catch { /* fall through to default routing */ }

    if (result.user?.role === 'admin') navigate('/admin');
    else if (result.user?.role === 'operator') navigate('/ops');
    else {
      // For multi-role users we no longer honor a stored last-portal
      // hint. The user's explicit mandate (Feb 2026): if an account has
      // a benefactor role at all, ALWAYS land on the Benefactor portal.
      // The deleted Estate Plan Network hub was the symptom; this is
      // the rule that prevents the regression.
      if (result.user?.role === 'beneficiary' && result.user?.is_also_benefactor) navigate('/dashboard');
      else if (result.user?.role === 'beneficiary') navigate('/beneficiary/dashboard');
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
      const looksOffline = !error.response && (
        error.code === 'ERR_OFFLINE' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ERR_NETWORK' ||
        error.message === 'Network Error' ||
        error.message === 'offline' ||
        (typeof navigator !== 'undefined' && navigator.onLine === false)
      );

      // PWA-only offline-credential fallback. Attempted whenever:
      //   1. The device is an installed PWA (home-screen app — the whole
      //      point of offline login).
      //   2. The server login didn't return a real HTTP response
      //      (network failed OR navigator.onLine is false). Includes
      //      the tricky transitional-airplane-mode-just-toggled-off
      //      case where the OS thinks we're online but the radio hasn't
      //      reattached yet.
      //   3. The user provided a password (without one there's nothing
      //      to decrypt).
      // We do NOT require the typed identifier to match the enroll
      // identifier — getOfflineCredential() falls back to the single
      // stored credential on the device when exact match fails. The
      // AES-GCM auth tag is the real gate.
      if (!error.response && isStandalonePWA() && password) {
        try {
          const rec = await getOfflineCredential(email);
          if (!rec) {
            // Truly no credential on this device → fall through to
            // standard error UX.  Emit a clear toast here so the
            // screen doesn't look hung.
            if (looksOffline) {
              toast.error(
                "You're offline and no offline sign-in is enabled on this device. Reconnect, sign in once, then enable offline access in Settings.",
                { force: true, duration: 7000 },
              );
              return;
            }
          } else {
            toast.loading('Unlocking offline sign-in…', { duration: 4000 });
            try {
              const { token: offlineToken, user: cachedFromVault } = await unlockOfflineCredential({
                identifier: rec.identifier,
                password,
              });
              // Prefer the encrypted user snapshot captured at enroll
              // time — it carries the real portal-routing flags
              // (is_also_benefactor, is_also_beneficiary, default_portal,
              // current_portal, admin_scope, role) so navigateToHome()
              // sends multi-role users to the right portal instead of
              // the empty "Estate Plan Network" limbo. Fall back to a
              // JWT-derived stub only if the snapshot is missing
              // (legacy enrollments).
              let resolvedUser = cachedFromVault;
              if (!resolvedUser) {
                let payload = {};
                try {
                  const seg = offlineToken.split('.')[1];
                  const json = atob(seg.replace(/-/g, '+').replace(/_/g, '/'));
                  payload = JSON.parse(json);
                } catch { /* empty */ }
                resolvedUser = {
                  id: payload.user_id || '',
                  email: payload.email || rec.identifier,
                  role: payload.role || 'benefactor',
                  name: payload.name || rec.identifier,
                  username: rec.identifier,
                  admin_scope: [],
                  is_also_benefactor: false,
                  is_also_beneficiary: false,
                };
              }
              authLoginWithToken(offlineToken, resolvedUser);
              haptics.success();
              // Force the global offline flag to TRUE before the dashboard
              // mounts. iOS PWA's `navigator.onLine` lies in airplane
              // mode (returns true), and the `offline` window event may
              // not have fired yet on a cold-launch + airplane-mode-
              // already-engaged sequence. Without this, DashboardPage's
              // `isOffline` check returns false, the offline-first
              // estate hydration branch is skipped, and the page paints
              // empty because the network call also fails. Setting the
              // flag here — at the moment we have ABSOLUTE PROOF the
              // device is offline (we just unlocked an offline
              // credential) — guarantees every consumer that reads
              // `navigator.onLine` from this point onward gets `false`.
              try { window.dispatchEvent(new Event('offline')); } catch { /* ignore */ }
              toast.success('Signed in offline. Some pages may be limited until you reconnect.', { force: true });
              // Honor the explicit user mandate: if this account has a
              // benefactor role at all, land on the Benefactor portal —
              // never the multi-estate network/limbo. Clearing the
              // stored last-portal hint forces navigateToHome to use
              // role-defaults (admin → /admin, benefactor or
              // multi-role-with-benefactor → /dashboard, solo
              // beneficiary → /beneficiary).
              try { localStorage.removeItem('carryon_last_portal'); } catch { /* empty */ }
              navigateToHome({ user: resolvedUser });
              return;
            } catch (unlockErr) {
              if (unlockErr?.message === 'wrong_password') {
                toast.error('Wrong password for offline sign-in. Please try again.', { force: true });
                return;
              }
              toast.error("Offline sign-in failed. Reconnect and try again.", { force: true });
              return;
            }
          }
        } catch (offlineErr) {
          // IndexedDB open failure or similar — surface something, don't
          // silently fall through to a "sign in requires a connection"
          // toast when the user enrolled offline access.
          console.error('Offline login path errored:', offlineErr);
        }
      }

      if (error.response?.status === 429) {
        const detail = error.response?.data?.detail || '';
        const match = detail.match(/(\d+)\s*seconds/);
        const secs = match ? parseInt(match[1], 10) : 180;
        setLockoutSeconds(secs);
      } else if (looksOffline) {
        // Honest offline message — the server never saw the request,
        // so we shouldn't blame the credentials. iOS Safari's
        // `navigator.onLine` can return true even in airplane mode, so
        // we ALSO accept timeout / network-error codes as proof the
        // device couldn't reach the backend. Passes `force: true` so
        // the global "suppress network-error toasts while offline"
        // filter doesn't swallow it.
        toast.error("You're offline. Sign in requires a connection — reconnect and try again.", { force: true, duration: 6000 });
      } else {
        const detail = error.response?.data?.detail || 'Invalid credentials';
        if (detail.includes('Multiple accounts')) {
          toast.error("Multiple accounts share this email. Use your username to sign in. Don't know it? Click 'Forgot Username?' below.", { duration: 8000 });
        } else {
          toast.error(detail);
        }
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
        const dest = result.user?.role === 'admin' ? '/admin' : (result.user?.role === 'beneficiary' && result.user?.is_also_benefactor) ? '/dashboard' : result.user?.role === 'beneficiary' ? '/beneficiary/dashboard' : '/dashboard';
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
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
          border: '1px solid rgba(var(--gold-rgb), 0.12)',
          boxShadow: '0 8px 80px rgba(0,0,0,0.5)',
        }}>
          <div className="absolute top-0 left-7 right-7 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #d4af37, transparent)' }} />
          <h2 className="text-white text-xl font-semibold mb-1" style={{ fontFamily: 'var(--sans)' }}>Sign In</h2>
          <p className="text-[#475569] text-sm mb-6">Access your CarryOn account</p>
          <LoginOfflineBanner isOffline={isOffline} hasOfflineCredential={hasOfflineCredential} />
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a4a63]" />
              <Input type="text" placeholder="Username or Email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="h-12 bg-[#0b1322] border-[#1a2a42] text-white placeholder:text-[#2d3d55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-xl pl-10"
                autoComplete="username" name="email" data-testid="login-email" aria-label="Username or Email" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a4a63]" />
              <Input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="h-12 bg-[#0b1322] border-[#1a2a42] text-white placeholder:text-[#2d3d55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-xl pl-10 pr-10"
                autoComplete="current-password" name="password" data-testid="login-password" aria-label="Password" />
              <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onMouseDown={e => e.preventDefault()} onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#3a4a63]">
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
                  style={{ background: 'rgba(var(--gold-rgb), 0.15)', border: '1px solid rgba(var(--gold-rgb), 0.3)', color: '#d4af37' }}
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
                style={{ background: 'var(--s)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                data-testid="login-passkey-native">
                {passkeyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-[#d4af37]" />}
                Sign in with Passkey
              </button>
            </>
          )}
          <div className="mt-5 flex items-center justify-between">
            <button onClick={() => navigateWithFade('/signup')} className="text-[#d4af37] text-sm font-bold">Create Account</button>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[#94A3B8] text-sm font-bold cursor-pointer hover:text-[#d4af37] transition-colors"
                data-testid="forgot-password-link"
                onClick={() => { setForgotMode(true); setForgotEmail(email); setForgotStep(1); setForgotMsg(''); setForgotError(false); }}>Forgot Password?</span>
              <span className="text-[#6b7a90] text-xs cursor-pointer hover:text-[#d4af37] transition-colors"
                data-testid="forgot-username-link"
                onClick={() => {
                  const usernameEmail = prompt('Enter the email associated with your account:');
                  if (usernameEmail) {
                    apiClient.post(`${API_URL}/auth/forgot-username`, { email: usernameEmail })
                      .then(() => toast.success('If that email exists, your username(s) have been sent.'))
                      .catch(() => toast.error('Something went wrong.'));
                  }
                }}>Forgot Username?</span>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t flex flex-col items-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-[#10b981]" />
              <span className="text-white/80 text-sm font-bold">AES-256 encryption · Per-estate keys · TLS 1.3</span>
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
      </div>
    );
  }

  // ─── PWA STANDALONE MODE — clean login, no marketing, no scroll ───
  if (isPWAMode) {
    return (
      <div className="flex flex-col items-center justify-center px-5 relative overflow-y-auto" style={{
        // Use 100svh (small-viewport-height) instead of 100dvh. dvh
        // changes when the iOS keyboard / autofill bar slides in or
        // out, which used to cause a visible jitter on every focus
        // because the container kept resizing mid-animation. svh is
        // the smallest stable viewport (keyboard-down), so the layout
        // doesn't shift when the keyboard appears.
        minHeight: '100svh',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 0.45s ease',
        WebkitOverflowScrolling: 'touch',
        paddingTop: 'max(1.5rem, env(safe-area-inset-top, 1.5rem))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))',
      }} data-testid="pwa-login-view">
        {/* Flag background */}
        <div className="fixed inset-0 z-0">
          <FlagBackdrop style={{ filter: 'brightness(1.3) contrast(1.05) saturate(1.1)' }} />
        </div>
        <div className="fixed inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.15) 0%, rgba(11,18,33,0.35) 40%, rgba(14,24,41,0.6) 100%)' }} />
        <div className="fixed inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 90% 80% at 20% 80%, rgba(255,255,255,0.08) 0%, transparent 60%)' }} />
        <div className="fixed inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 80% 70% at 85% 85%, rgba(255,255,255,0.10) 0%, transparent 55%)' }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
          <img src="/carryon-logo.png" alt="CarryOn" className="w-[200px] h-auto mb-5" />

          <div className="w-full rounded-2xl p-6 relative" style={{
            background: 'linear-gradient(160deg, rgba(17,27,48,0.97), rgba(13,22,40,0.99))',
            border: '1px solid rgba(var(--gold-rgb), 0.12)',
            boxShadow: '0 8px 80px rgba(0,0,0,0.5)',
          }}>
            <div className="absolute top-0 left-6 right-6 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #d4af37, transparent)' }} />
            <h2 className="text-white text-lg font-semibold mb-1" style={{ fontFamily: 'var(--sans)' }}>Sign In</h2>
            <p className="text-white/70 text-sm font-semibold mb-4">Access your CarryOn account</p>
            <LoginOfflineBanner isOffline={isOffline} hasOfflineCredential={hasOfflineCredential} />
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="text-white/80 text-sm font-bold mb-1 block">Username or Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                  <Input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Username or Email" required autoComplete="username"
                    name="email"
                    className="h-10 pl-10 bg-[#0B1627] border-[#1A2D48] text-white placeholder:text-[#2A3C55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg text-sm" data-testid="login-email-pwa" aria-label="Username or Email" />
              </div>
            </div>
            <div>
              <label className="text-white/80 text-sm font-bold mb-1 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" required autoComplete="current-password"
                  name="password"
                  className="h-10 pl-10 pr-10 bg-[#0B1627] border-[#1A2D48] text-white placeholder:text-[#2A3C55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg text-sm" data-testid="login-password-pwa" aria-label="Password" />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onMouseDown={e => e.preventDefault()} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#334155] hover:text-[#7b879e] transition-colors">
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
                  style={{ background: 'rgba(var(--gold-rgb), 0.15)', border: '1px solid rgba(var(--gold-rgb), 0.3)', color: '#d4af37' }}
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
                <div className="flex-1 h-px" style={{ background: 'var(--s)' }} />
                <span className="text-[#334155] text-[11px] uppercase tracking-widest font-medium">or</span>
                <div className="flex-1 h-px" style={{ background: 'var(--s)' }} />
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
            <div className="flex flex-col items-end gap-1">
              <span className="text-[#94A3B8] text-sm font-bold cursor-pointer hover:text-[#d4af37] transition-colors"
                data-testid="forgot-password-pwa"
                onClick={() => { setForgotMode(true); setForgotEmail(email); setForgotStep(1); setForgotMsg(''); setForgotError(false); }}>Forgot Password?</span>
              <span className="text-[#6b7a90] text-xs cursor-pointer hover:text-[#d4af37] transition-colors"
                data-testid="forgot-username-pwa"
                onClick={() => {
                  const usernameEmail = prompt('Enter the email associated with your account:');
                  if (usernameEmail) {
                    apiClient.post(`${API_URL}/auth/forgot-username`, { email: usernameEmail })
                      .then(() => toast.success('If that email exists, your username(s) have been sent.'))
                      .catch(() => toast.error('Something went wrong.'));
                  }
                }}>Forgot Username?</span>
            </div>
          </div>
          <div className="mt-3.5 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-center gap-2">
              <Shield className="w-3 h-3 text-[#10b981]" />
              <span className="text-white/80 text-xs font-bold">AES-256 encryption &middot; Per-estate keys &middot; TLS 1.3</span>
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
            style={{ background: 'var(--b)', border: '1px solid rgba(255,255,255,0.2)', color: '#e2e8f0', backdropFilter: 'blur(8px)' }}>
            <ExternalLink className="w-3.5 h-3.5" />
            Visit Homepage
          </button>
        </div>

        {/* OTP Modal */}
        {showOtpModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl p-7" style={{ background: 'linear-gradient(145deg, rgba(20,30,52,0.98), rgba(15,22,41,1))', border: '1px solid rgba(var(--gold-rgb), 0.15)' }}>
              <h3 className="text-white text-lg font-semibold mb-2" style={{ fontFamily: 'var(--sans)' }}>Two-Factor Authentication</h3>
              <p className="text-[#6b7a90] text-sm mb-5">
                {otpMethod === 'sms' ? `Enter the 6-digit code sent to ${maskedPhone || 'your phone'}` : 'Enter the 6-digit code sent to your email'}
              </p>
              <Input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" className="h-14 text-center text-2xl tracking-[0.4em] font-mono bg-[#0D1829] border-[#1E3048] text-white focus:border-[#d4af37] rounded-lg mb-4" data-testid="otp-input-pwa" autoFocus />
              {hasSmsOtp && (
                <div className="flex items-center gap-2 mb-4 p-2 rounded-lg" style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.1)' }}>
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

      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{
      background: 'var(--bg)',
      opacity: exiting ? 0 : 1,
      ...(exiting ? { transform: 'scale(0.98)' } : {}),
      transition: 'opacity 0.45s ease, transform 0.45s ease',
    }}>
      <SEO title="CarryOn™ — The Family Continuity Platform" description="If something happens tomorrow, your family knows exactly what to do. The complete continuity system for every disruption — hospital stay, deployment, disaster, or the final day." path="/" noindex={isLoginPath} />

      {/* NAV BAR */}
      <nav className="fixed top-0 w-full z-[100]" style={{ borderBottom: '1px solid rgba(14,165,233,0.06)', background: 'rgba(11,18,33,0.97)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
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
            {/* Mobile hamburger — opens dropdown with all nav items
                that are inline on desktop. Previously only "Founder"
                was visible on mobile, hiding Features / Security / How
                It Works / About from phone visitors. */}
            <button
              onClick={() => setMobileNavOpen(v => !v)}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-[#9aa5b4] hover:text-[#d4af37] transition-colors"
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileNavOpen}
              data-testid="nav-mobile-toggle"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <button onClick={() => navigateWithFade('/signup')} className="text-[#d4af37] text-sm font-semibold hover:text-[#fcd34d] transition-colors flex items-center gap-1">
              Start your family&apos;s plan <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {/* Mobile dropdown — only renders when toggled. Tappable area
            is comfortably large; closes on item tap so the page can
            scroll/navigate naturally. */}
        {mobileNavOpen && (
          <div
            className="md:hidden"
            style={{ background: 'rgba(11,18,33,0.98)', borderTop: '1px solid rgba(14,165,233,0.06)' }}
            data-testid="nav-mobile-dropdown"
          >
            <div className="max-w-[1400px] mx-auto px-6 py-3 flex flex-col gap-1">
              {[
                { label: 'Features', href: '#features' },
                { label: 'Security', href: '#security' },
                { label: 'How It Works', href: '#steps' },
              ].map(item => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className="block py-3 text-[#cbd5e1] text-base font-medium hover:text-[#d4af37] transition-colors"
                  data-testid={`nav-mobile-${item.label.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  {item.label}
                </a>
              ))}
              <button
                onClick={() => { setMobileNavOpen(false); navigateWithFade('/about'); }}
                className="text-left py-3 text-[#cbd5e1] text-base font-medium hover:text-[#d4af37] transition-colors"
                data-testid="nav-mobile-about"
              >
                About
              </button>
              <button
                onClick={() => { setMobileNavOpen(false); navigateWithFade('/founder-about'); }}
                className="text-left py-3 text-[#cbd5e1] text-base font-medium hover:text-[#d4af37] transition-colors"
                data-testid="nav-mobile-founder"
              >
                Founder
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* ═══════════════════ HERO — FLAG BG + LOGO + LOGIN ═══════════════════ */}
      <section className="min-h-screen flex items-start sm:items-center relative overflow-hidden" style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top, 0px))' }}>
        {/* Flag background that fades on scroll */}
        <div ref={flagRef} className="absolute inset-0 z-0" style={{ opacity: 0.85 }}>
          <FlagBackdrop style={{ filter: 'brightness(1.3) contrast(1.05) saturate(1.1)' }} />
        </div>
        {/* Dark gradient overlay */}
        <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.0) 0%, rgba(11,18,33,0.05) 50%, rgba(14,24,41,0.25) 100%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 90% 80% at 20% 80%, rgba(255,255,255,0.12) 0%, transparent 60%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 60% at 10% 50%, rgba(255,255,255,0.08) 0%, transparent 50%)' }} />
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 70% at 85% 85%, rgba(255,255,255,0.14) 0%, transparent 55%)' }} />
        {/* Radial accent */}
        <div className="absolute inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 70% 50% at 35% 50%, rgba(var(--gold-rgb), 0.04) 0%, transparent 70%)' }} />

        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 w-full relative z-10">
          <div className="grid lg:grid-cols-[1fr_350px] xl:grid-cols-[1fr_420px] gap-10 lg:gap-10 xl:gap-14 items-start">

            {/* Logo + Tagline — desktop: left side */}
            <RevealSection delay={0.1} className="hidden lg:block">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 lg:gap-8">
                <div className="flex-shrink-0">
                  <img src="/carryon-logo.png" alt="CarryOn" className="w-[200px] xl:w-[260px] h-auto" />
                </div>
                <div className="text-center sm:text-left flex-1 sm:pt-2">
                  <p className="text-[#d4af37] text-sm font-semibold uppercase tracking-[0.18em] mb-3" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>The Family Continuity Platform</p>
                  <h1 className="text-3xl sm:text-4xl xl:text-5xl font-semibold text-white leading-[1.08] mb-3 tracking-tight" style={{ fontFamily: 'var(--serif)', textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}>
                    If something happens tomorrow, your family knows
                    <span className="block text-[#d4af37] mt-1 italic" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}>exactly what to do.</span>
                  </h1>
                  <p className="text-white/80 text-sm xl:text-base max-w-lg leading-relaxed mb-5" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
                    CarryOn is the continuity system for your family &mdash; keeping everyone ready, connected, and clear through every disruption, from a hospital stay to the final day. Built calmly today; there the moment your family needs it.
                  </p>
                  <div className="flex items-center gap-5 justify-center sm:justify-start mb-5">
                    {['AES-256 Encrypted', 'Per-Estate Keys', '2FA Protected'].map(badge => (
                      <div key={badge} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                        <span className="text-white/70 text-sm font-medium" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{badge}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Platform Free Mode tile — spans the FULL left column (from the
                  logo's left edge to the right margin), beneath the logo/verbiage
                  and above the scroll pill. */}
              {platformFreeMode && (
                <FreeModeBanner
                  tone="onDark"
                  testId="login-free-mode-tile"
                  className="w-full mt-7 animate-fade-in"
                />
              )}
              <a href="#about" className="flex w-fit flex-col items-center justify-center gap-1 mt-10 mx-auto cursor-pointer text-center"
                data-testid="scroll-explore-desktop"
                style={{ opacity: 0.85, transition: 'opacity 200ms cubic-bezier(0.4,0,0.2,1)' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.85'}>
                <span className="text-white/85 text-sm font-semibold tracking-[0.1em] uppercase" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>Explore CarryOn</span>
                <ChevronDown className="w-5 h-5 text-[#d4af37]" strokeWidth={2.5} style={{ animation: 'fadeInUp 1.4s ease-in-out infinite alternate' }} />
              </a>
            </RevealSection>

            {/* Login Card */}
            <RevealSection delay={0.3} direction="right">
              <div className="flex justify-center lg:justify-end">
                <div className="w-full rounded-2xl p-8 relative login-card-glow" style={{
                  background: 'linear-gradient(160deg, rgba(17,27,48,0.97), rgba(13,22,40,0.99))',
                  border: '1px solid rgba(var(--gold-rgb), 0.12)',
                  boxShadow: '0 8px 80px rgba(0,0,0,0.5), 0 0 50px rgba(var(--gold-rgb), 0.02)',
                }}>
                  <div className="absolute top-0 left-8 right-8 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #d4af37, transparent)' }} />
                  <h2 className="text-white text-xl font-semibold mb-1" style={{ fontFamily: 'var(--sans)' }}>Sign In</h2>
                  <p className="text-white/70 text-sm font-semibold mb-6">Access your CarryOn account</p>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="text-white/80 text-sm font-bold mb-1.5 block">Username or Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                        <Input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Username or Email" required autoComplete="username"
                          name="email"
                          className="h-11 pl-10 bg-[#0B1627] border-[#1A2D48] text-white placeholder:text-[#2A3C55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg" data-testid="login-email-input" aria-label="Username or Email" />
                      </div>
                    </div>
                    <div>
                      <label className="text-white/80 text-sm font-bold mb-1.5 block">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#334155]" />
                        <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" required autoComplete="current-password"
                          name="password"
                          className="h-11 pl-10 pr-10 bg-[#0B1627] border-[#1A2D48] text-white placeholder:text-[#2A3C55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-lg" data-testid="login-password-input" aria-label="Password" />
                        <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onMouseDown={e => e.preventDefault()} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#334155] hover:text-[#7b879e] transition-colors">
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
                          style={{ background: 'rgba(var(--gold-rgb), 0.15)', border: '1px solid rgba(var(--gold-rgb), 0.3)', color: '#d4af37' }}
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
                        <div className="flex-1 h-px" style={{ background: 'var(--s)' }} />
                        <span className="text-[#334155] text-[11px] uppercase tracking-widest font-medium">or</span>
                        <div className="flex-1 h-px" style={{ background: 'var(--s)' }} />
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
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[#94A3B8] text-sm font-bold cursor-pointer hover:text-[#d4af37] transition-colors"
                        data-testid="forgot-password-link-web"
                        onClick={() => { setForgotMode(true); setForgotEmail(email); setForgotStep(1); setForgotMsg(''); setForgotError(false); }}>Forgot Password?</span>
                      <span className="text-[#6b7a90] text-xs cursor-pointer hover:text-[#d4af37] transition-colors"
                        data-testid="forgot-username-link-web"
                        onClick={() => {
                          const usernameEmail = prompt('Enter the email associated with your account:');
                          if (usernameEmail) {
                            apiClient.post(`${API_URL}/auth/forgot-username`, { email: usernameEmail })
                              .then(() => toast.success('If that email exists, your username(s) have been sent.'))
                              .catch(() => toast.error('Something went wrong.'));
                          }
                        }}>Forgot Username?</span>
                    </div>
                  </div>
                  <div className="mt-6 pt-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <div className="flex items-center justify-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-[#10b981]" />
                      <span className="text-white/80 text-sm font-bold">AES-256 encryption &middot; Per-estate keys &middot; TLS 1.3</span>
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
                  <p className="text-[#d4af37] text-sm font-semibold uppercase tracking-[0.18em] mb-3" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>The Family Continuity Platform</p>
                  <h2 className="text-3xl sm:text-4xl font-semibold text-white leading-[1.08] mb-3 tracking-tight" style={{ fontFamily: 'var(--serif)', textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}>
                    If something happens tomorrow, your family knows
                    <span className="block text-[#d4af37] mt-1 italic" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)' }}>exactly what to do.</span>
                  </h2>
                  <p className="text-white/80 text-base max-w-sm leading-relaxed mb-5" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
                    CarryOn is the continuity system for your family &mdash; ready, connected, and clear through every disruption, from a hospital stay to the final day.
                  </p>
                  <div className="flex items-center gap-4 justify-center mb-4">
                    {['AES-256 Encrypted', 'Per-Estate Keys', '2FA Protected'].map(badge => (
                      <div key={badge} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                        <span className="text-white/70 text-sm font-medium" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{badge}</span>
                      </div>
                    ))}
                  </div>
                  <a href="#about" className="flex flex-col items-center justify-center gap-1 mt-8 mb-20 mx-auto cursor-pointer text-center"
                    data-testid="scroll-explore-mobile"
                    style={{ opacity: 0.85, transition: 'opacity 200ms cubic-bezier(0.4,0,0.2,1)' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.85'}>
                    <span className="text-white/85 text-sm font-semibold tracking-[0.1em] uppercase" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>Explore CarryOn</span>
                    <ChevronDown className="w-5 h-5 text-[#d4af37]" strokeWidth={2.5} style={{ animation: 'fadeInUp 1.4s ease-in-out infinite alternate' }} />
                  </a>
                </div>
              </RevealSection>
            </div>
          </div>
        </div>
      </section>

      <LandingContent
        navigateWithFade={navigateWithFade}
        beforeAbout={
          /* ═══════════════════ VIDEO — See CarryOn in Action ═══════════════════ */
          <section className="relative z-10">
            <div className="py-16 lg:py-24 relative overflow-hidden">
              <div className="absolute inset-0 z-0">
                <FlagBackdrop style={{ filter: 'brightness(0.7) contrast(1.05) saturate(0.9)' }} />
              </div>
              <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(8,14,26,1) 0%, rgba(8,14,26,0.97) 80px, rgba(11,18,33,0.6) 50%, rgba(11,18,33,0.8) 100%)' }} />
              <div className="absolute inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(var(--gold-rgb), 0.04) 0%, transparent 70%)' }} />
              <RevealSection className="max-w-[900px] mx-auto px-6 text-center relative z-10">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 leading-tight" style={{ fontFamily: 'var(--sans)' }}>
                  See CarryOn in Action
                </h2>
                <p className="text-white/60 text-sm lg:text-base mb-8">
                  Learn how CarryOn&#8482; keeps your family ready for anything.
                </p>
                {showVertical ? (
                  <div className="relative rounded-2xl overflow-hidden mx-auto" style={{ border: '1px solid rgba(var(--gold-rgb), 0.15)', boxShadow: '0 8px 60px rgba(0,0,0,0.4), 0 0 40px rgba(var(--gold-rgb), 0.05)', maxWidth: '360px' }}>
                    <div style={{ position: 'relative', paddingBottom: '177.78%', height: 0 }}>
                      <YouTubeFacade videoId={activeVideoId} title="CarryOn — The Family Continuity Platform (vertical)" testId="homepage-video" />
                    </div>
                  </div>
                ) : (
                <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(var(--gold-rgb), 0.15)', boxShadow: '0 8px 60px rgba(0,0,0,0.4), 0 0 40px rgba(var(--gold-rgb), 0.05)' }}>
                  <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                    <YouTubeFacade videoId={activeVideoId} title="CarryOn — The Family Continuity Platform" testId="homepage-video" />
                  </div>
                </div>
                )}
              </RevealSection>
            </div>
          </section>
        }
      />

      {/* Option C: Mobile browser "Add to Home Screen" banner */}
      {isMobileNonPWA && !installBannerDismissed && (
        <div className="fixed bottom-0 left-0 right-0 z-[90] p-3 safe-area-pb" style={{ background: 'linear-gradient(180deg, transparent, rgba(8,14,26,0.95) 20%)', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }} data-testid="install-banner">
          <div className="max-w-sm mx-auto rounded-xl p-3.5 flex items-center gap-3" style={{ background: 'rgba(17,27,48,0.95)', border: '1px solid rgba(var(--gold-rgb), 0.2)', backdropFilter: 'blur(12px)' }}>
            <img src="/carryon-logo.png" alt="" className="w-8 h-8 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold leading-tight">Get the CarryOn App</p>
              <p className="text-[#6b7a90] text-[11px]">Add to your home screen &mdash; no download needed</p>
            </div>
            <button onClick={() => setShowInstallGuide(true)} className="gold-keep-dark flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
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
          <div className="w-full max-w-md rounded-2xl p-8" style={{ background: 'linear-gradient(145deg, rgba(20,30,52,0.98), rgba(15,22,41,1))', border: '1px solid rgba(var(--gold-rgb), 0.15)' }}>
            <h3 className="text-white text-xl font-semibold mb-2" style={{ fontFamily: 'var(--sans)' }}>Two-Factor Authentication</h3>
            <p className="text-[#6b7a90] text-sm mb-6">
              {otpMethod === 'sms'
                ? `Enter the 6-digit code sent to ${maskedPhone || 'your phone'}`
                : 'Enter the 6-digit code sent to your email'}
            </p>
            <Input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000" className="h-14 text-center text-2xl tracking-[0.4em] font-mono bg-[#0D1829] border-[#1E3048] text-white focus:border-[#d4af37] rounded-lg mb-4" data-testid="otp-input" autoFocus />
            
            {/* SMS/Email toggle when user has both options */}
            {hasSmsOtp && (
              <div className="flex items-center gap-2 mb-4 p-2 rounded-lg" style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.1)' }}>
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
            <h3 className="text-white text-xl font-bold mb-2" style={{ fontFamily: 'var(--sans)' }}>Enable Face ID?</h3>
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

      <ForgotPasswordModal
        forgotMode={forgotMode} setForgotMode={setForgotMode}
        forgotStep={forgotStep} setForgotStep={setForgotStep}
        forgotEmail={forgotEmail} setForgotEmail={setForgotEmail}
        forgotOtp={forgotOtp} setForgotOtp={setForgotOtp}
        forgotNewPw={forgotNewPw} setForgotNewPw={setForgotNewPw}
        forgotConfirmPw={forgotConfirmPw} setForgotConfirmPw={setForgotConfirmPw}
        forgotLoading={forgotLoading} setForgotLoading={setForgotLoading}
        forgotMsg={forgotMsg} setForgotMsg={setForgotMsg}
        forgotError={forgotError} setForgotError={setForgotError}
      />
    </div>
  );
};

export default LoginPage;
