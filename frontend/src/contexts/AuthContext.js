import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { clearCache } from '../utils/apiCache';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('carryon_token'));
  const [loading, setLoading] = useState(true);
  const [pendingEmail, setPendingEmail] = useState(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [enabledFeatures, setEnabledFeatures] = useState(null);

  const fetchSubscriptionStatus = async (authToken) => {
    try {
      const res = await axios.get(`${API_URL}/subscriptions/status`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setSubscriptionStatus(res.data);
      // Shadow/on: mirror the authoritative subscription for offline paint.
      import('../offline/featureFlag').then(({ getOfflineMode }) => {
        if (getOfflineMode() !== 'off') {
          import('../offline/repos/subscriptionRepo').then((m) =>
            m.upsertLocalSubscription(res.data),
          ).catch(() => {});
        }
      }).catch(() => {});
    } catch (err) {
      console.error('Subscription status fetch error:', err);
    }
  };

  const fetchEnabledFeatures = async (authToken, estateId = null) => {
    try {
      const params = estateId ? `?estate_id=${estateId}` : '';
      const res = await axios.get(`${API_URL}/subscriptions/enabled-features${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setEnabledFeatures(res.data?.enabled_features || null);
    } catch (err) {
      console.error('Enabled features fetch error:', err);
    }
  };

  const refreshEnabledFeatures = async (estateId = null) => {
    if (token) {
      await fetchEnabledFeatures(token, estateId);
    }
  };

  // Global interceptor — detect single-session enforcement
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401 && err.response?.data?.detail === 'signed_in_elsewhere') {
          localStorage.removeItem('carryon_token');
          sessionStorage.removeItem('trial_banner_dismissed');
          setToken(null);
          setUser(null);
          alert('Your session ended because you signed in on another device.');
          window.location.href = '/login';
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          // Fire all three boot requests in PARALLEL, not sequentially.
          // Previously these were awaited in series, so a cold Railway
          // backend (10-40s cold start) multiplied by 3 could produce a
          // 2-minute white screen. A 20s timeout per request prevents
          // indefinite hangs if the backend is unreachable.
          const authHeaders = { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 };
          const savedEstateId = localStorage.getItem('selected_estate_id');
          const estateParam = savedEstateId ? `?estate_id=${savedEstateId}` : '';

          const [meRes, subRes, featRes] = await Promise.allSettled([
            axios.get(`${API_URL}/auth/me`, authHeaders),
            axios.get(`${API_URL}/subscriptions/status`, authHeaders),
            axios.get(`${API_URL}/subscriptions/enabled-features${estateParam}`, authHeaders),
          ]);

          if (meRes.status !== 'fulfilled') {
            // Network failed (or timed out). If the device is simply offline
            // AND the stored JWT hasn't expired yet, trust the cached session
            // and hydrate the user from whatever we have in IndexedDB or the
            // JWT payload itself. The alternative — logging them out and
            // bouncing to /login — is the exact 'force-quit-while-offline'
            // regression the user flagged: returning users lose access to
            // an app they were already signed into.
            const isNetworkError = !meRes.reason?.response;
            // iOS Safari's `navigator.onLine` lies in installed PWAs. Use
            // the authoritative helper from index.js which ALSO considers
            // the error shape itself (code, message) — a request that
            // came back with no response IS offline, regardless of what
            // `navigator.onLine` claims.
            const offline =
              (typeof window !== 'undefined' && typeof window.__isDeviceOffline === 'function')
                ? window.__isDeviceOffline(meRes.reason)
                : (typeof navigator !== 'undefined' && navigator.onLine === false);
            let jwtPayload = null;
            try {
              const [, body] = token.split('.');
              jwtPayload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
            } catch { /* malformed token — fall through to logout */ }
            const notExpired = jwtPayload?.exp && jwtPayload.exp * 1000 > Date.now();

            if (isNetworkError && offline && notExpired) {
              // Wrap the whole hydrate path so NOTHING can escape and wedge
              // the boot splash. On any failure, still release the splash
              // and keep the user on an authenticated shell — at worst
              // they'll see empty dashboards until reconnect.
              try {
                let cachedProfile = null;
                try {
                  const { getLocalProfile } = await import('../offline/repos/profileRepo');
                  cachedProfile = await getLocalProfile();
                } catch { /* offline cache not available — use JWT fields only */ }
                setUser({
                  id: jwtPayload.user_id || jwtPayload.sub,
                  email: jwtPayload.email || cachedProfile?.email,
                  role: jwtPayload.role || cachedProfile?.role || 'benefactor',
                  name: cachedProfile?.name || cachedProfile?.first_name || '',
                  ...(cachedProfile || {}),
                  _offlineHydrated: true,
                });
                try {
                  const { getLocalSubscription } = await import('../offline/repos/subscriptionRepo');
                  const localSub = await getLocalSubscription();
                  if (localSub) setSubscriptionStatus(localSub);
                } catch {}
              } catch (hydrateErr) {
                console.warn('[auth] offline hydrate failed, continuing with JWT-only user:', hydrateErr);
                setUser({
                  id: jwtPayload.user_id || jwtPayload.sub,
                  email: jwtPayload.email,
                  role: jwtPayload.role || 'benefactor',
                  _offlineHydrated: true,
                });
              }
              setLoading(false);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('carryon:app-ready'));
              }
              return; // skip the rest of the online-only warmup
            }

            // Online but server returned an error.
            // Only treat as a genuine sign-out for 401/403 (expired/invalid
            // token, signed in elsewhere). For 429 (rate limit) and 5xx
            // (server hiccup), keep the user logged in — they didn't lose
            // their session, they just got a transient hand-off. The
            // dashboard will retry on next focus / 5-min poll.
            const errStatus = meRes.reason?.response?.status;
            if (errStatus === 429 || (errStatus >= 500 && errStatus < 600)) {
              // Hydrate from JWT only so the shell can render. Real /me
              // will be retried by the existing focus/interval refresh
              // logic later in this file.
              if (jwtPayload && notExpired) {
                setUser({
                  id: jwtPayload.user_id || jwtPayload.sub,
                  email: jwtPayload.email,
                  role: jwtPayload.role || 'benefactor',
                  _transientAuthError: errStatus,
                });
                setLoading(false);
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new Event('carryon:app-ready'));
                }
                return;
              }
            }
            throw meRes.reason;
          }
          const userData = meRes.value.data;
          setUser({
            ...userData,
            is_also_benefactor: userData.is_also_benefactor || false,
            is_also_beneficiary: userData.is_also_beneficiary || false,
            _serverScope: userData.admin_scope,
          });
          if (subRes.status === 'fulfilled') {
            setSubscriptionStatus(subRes.value.data);
          }
          if (featRes.status === 'fulfilled') {
            setEnabledFeatures(featRes.value.data?.enabled_features || null);
          }
          // Mirror subscription + profile snapshots into the offline cache
          // so next cold boot can paint trial banners and header avatar
          // instantly. Flag-agnostic as of Apr 24, 2026: every user
          // benefits from airplane-mode survival, not just those who
          // explicitly enabled offline mode. Phase 7: if encryption-
          // at-rest is enabled, prime the session key BEFORE the first
          // upsert so sensitive fields are sealed as they land in
          // IndexedDB.
          (async () => {
            try {
              const crypto = await import('../offline/crypto');
              if (crypto.isEncryptionEnabled()) {
                await crypto.primeSessionKey(token);
              }
            } catch {}
            try {
              const [prof, sub] = await Promise.all([
                import('../offline/repos/profileRepo'),
                import('../offline/repos/subscriptionRepo'),
              ]);
              try { await prof.upsertLocalProfile(userData); } catch {}
              if (subRes.status === 'fulfilled') {
                try { await sub.upsertLocalSubscription(subRes.value.data); } catch {}
              }
            } catch {}
          })();
          // Warm the offline mirror on every boot (not just fresh login)
          // so returning users always start with a fresh local cache.
          // Fire-and-forget; no-op when the offline flag is off.
          import('../offline/warmup').then((m) => m.warmUpAfterLogin(token)).catch(() => {});
          // Drive chunked pending uploads on reconnect (Phase 9).
          import('../offline/syncClient').then((m) => { try { m.syncClient.setAuthToken(token); } catch {} }).catch(() => {});
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            import('../offline/chunkedUploader').then((m) => m.drainPendingUploads(token)).catch(() => {});
          }
          // Cross-device scroll-restoration hydrate. Pulls the
          // server's copy of the toggle + saved positions so a user
          // who flipped the toggle on their phone sees it on (and
          // resumes positions from) their laptop. Online-only —
          // local pref still works offline from localStorage.
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            import('../hooks/useScrollRestoration')
              .then((m) => m.hydrateScrollRestorationFromServer())
              .catch(() => {});
          }
          // Pre-warm every lazy-loaded page chunk in the background so that
          // offline navigation to an unvisited page paints from SW cache
          // instead of crashing the ErrorBoundary. Fires only once per
          // session and only when online; idle-callback-scheduled so it
          // doesn't fight the post-login page's first paint.
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            import('../offline/prewarmChunks').then((m) => m.prewarmRouteChunks()).catch(() => {});
          }
        } catch (error) {
          console.error('Auth init error:', error);
          logout();
        }
      }
      setLoading(false);
      // Signal to the inline boot splash in index.html that it's safe to
      // fade itself out — auth either resolved (cached login) or we're
      // heading to /login. Either way, real app chrome is about to render.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('carryon:app-ready'));
      }
    };
    initAuth();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── On reconnect WITHOUT a logout/login cycle, drain queued uploads.
  // Without this, a user who recorded offline, then merely toggled
  // airplane mode off (no logout), would stay queued forever — the
  // drain only fired from initAuth on a token change. SyncClient's
  // online handler also drains, but only when the offline-mode flag is
  // toggled on; we want the safety net regardless of the flag because
  // pendingUpload rows are flag-agnostic by design.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onOnline = () => {
      if (!token) return;
      import('../offline/chunkedUploader')
        .then((m) => m.drainPendingUploads(token, { forceRetry: true }))
        .catch(() => {});
      // Also drain the text-write outbox (deletes / edits / etc.) so
      // the user's offline mutations land. Without this, a Delete that
      // got queued offline (now flag-agnostic in outbox.enqueue) would
      // sit forever even though the device just reconnected.
      import('../offline/outbox')
        .then((m) => m.drain())
        .catch(() => {});
      // Pull any cross-device scroll-restoration state from the
      // server so a user who flipped the toggle on their phone sees
      // it on (and can resume scroll positions on) their laptop.
      import('../hooks/useScrollRestoration')
        .then((m) => m.hydrateScrollRestorationFromServer())
        .catch(() => {});
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [token]);

  const login = async (email, password, otpMethod = 'email', phone = null, forceLogin = false) => {
    // Clear dev switcher session on normal login
    localStorage.removeItem('dev_switcher_admin_session');
    localStorage.removeItem('dev_switcher_active_role');
    // Clear API data cache to ensure fresh data on new session
    clearCache();
    const payload = { email, password, otp_method: otpMethod, force_login: forceLogin };
    if (otpMethod === 'sms' && phone) {
      payload.phone = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
    }
    const response = await axios.post(`${API_URL}/auth/login`, payload);
    const data = response.data;
    // Active session on another device — return for UI to handle
    if (data.active_session_exists) {
      return { activeSessionExists: true, message: data.message };
    }
    // Sealed account — transitioned benefactor
    if (data.sealed) {
      return { sealed: true, transitioned_at: data.transitioned_at };
    }
    // Direct login (OTP disabled) — token returned immediately
    if (data.access_token) {
      localStorage.setItem('carryon_token', data.access_token);
      setToken(data.access_token);
      setUser({ ...data.user, _serverScope: data.user.admin_scope });
      setPendingEmail(null);
      // Fire-and-forget: warm the offline mirror while the splash fades.
      // No-op when the offline flag is off.
      import('../offline/warmup').then((m) => m.warmUpAfterLogin(data.access_token)).catch(() => {});
      return { direct: true, user: data.user };
    }
    // OTP flow fallback
    setPendingEmail(email);
    return data;
  };

  const verifyOtp = async (email, otp, trustToday = false) => {
    const response = await axios.post(`${API_URL}/auth/verify-otp`, { email, otp, trust_today: trustToday });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('carryon_token', access_token);
    setToken(access_token);
    setUser({ ...userData, _serverScope: userData.admin_scope });
    setPendingEmail(null);
    // Fire-and-forget: warm the offline mirror. No-op when flag is off.
    import('../offline/warmup').then((m) => m.warmUpAfterLogin(access_token)).catch(() => {});
    return userData;
  };

  const resendOtp = async (email, method = 'email') => {
    const response = await axios.post(`${API_URL}/auth/resend-otp`, { email, method });
    return response.data;
  };

  const logout = async () => {
    // Server-side token blacklisting + session clear
    try {
      if (token) {
        await axios.post(`${API_URL}/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (e) { /* proceed with client-side logout even if server call fails */ }
    clearCache();
    // Phase 7: clear the in-memory offline encryption key so the next user
    // on this device derives their own key and cannot decrypt the previous
    // user's sealed IndexedDB rows.
    try {
      import('../offline/crypto').then((m) => m.clearSessionKey()).catch(() => {});
    } catch {}
    // Purge the service worker's per-user API + image caches so the next
    // user to log in on this device doesn't see a flash of the previous
    // user's dashboard data.
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_APP_CACHES' });
      }
    } catch {}
    localStorage.removeItem('carryon_token');
    localStorage.removeItem('dev_switcher_admin_session');
    localStorage.removeItem('dev_switcher_admin_token');
    localStorage.removeItem('dev_switcher_active_role');
    sessionStorage.removeItem('trial_banner_dismissed');
    setToken(null);
    setUser(null);
    setPendingEmail(null);
    setSubscriptionStatus(null);
  };

  // Auto-logout when app is backgrounded for longer than user's timeout setting
  // Also handles 'midnight' mode — logs out at local midnight
  // Server-mandated session timeout (from session policy) overrides user preference
  useEffect(() => {
    let bgTimer = null;
    let midnightTimer = null;
    let inactivityTimer = null;

    const scheduleMidnightLogout = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const msUntilMidnight = midnight.getTime() - now.getTime();
      midnightTimer = setTimeout(() => {
        localStorage.removeItem('carryon_token');
        sessionStorage.removeItem('trial_banner_dismissed');
        setToken(null);
        setUser(null);
        window.location.href = '/login';
      }, msUntilMidnight);
    };

    const setting = localStorage.getItem('carryon_auto_logout_minutes') || '5';
    const serverTimeout = user?.session_timeout_minutes;

    // Server-mandated inactivity timeout for staff
    if (serverTimeout && token) {
      const resetInactivity = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          localStorage.removeItem('carryon_token');
          sessionStorage.removeItem('trial_banner_dismissed');
          setToken(null);
          setUser(null);
          window.location.href = '/login';
        }, serverTimeout * 60 * 1000);
      };
      resetInactivity();
      const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
      events.forEach(e => document.addEventListener(e, resetInactivity));
      return () => {
        events.forEach(e => document.removeEventListener(e, resetInactivity));
        if (inactivityTimer) clearTimeout(inactivityTimer);
      };
    }

    if (setting === 'midnight' && token) {
      scheduleMidnightLogout();
    }

    const handleVisibility = () => {
      if (setting === 'midnight') return; // midnight mode doesn't use bg timer
      const mins = parseInt(setting, 10);
      if (document.hidden && token) {
        if (mins === 0) {
          // Instant logout on app leave
          localStorage.removeItem('carryon_token');
          sessionStorage.removeItem('trial_banner_dismissed');
          setToken(null);
          setUser(null);
          window.location.href = '/login';
        } else {
          bgTimer = setTimeout(() => {
            localStorage.removeItem('carryon_token');
            sessionStorage.removeItem('trial_banner_dismissed');
            setToken(null);
            setUser(null);
            window.location.href = '/login';
          }, mins * 60 * 1000);
        }
      } else if (bgTimer) {
        clearTimeout(bgTimer);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (bgTimer) clearTimeout(bgTimer);
      if (midnightTimer) clearTimeout(midnightTimer);
    };
  }, [token]);

  const devLogin = async (email, password) => {
    const response = await axios.post(`${API_URL}/auth/dev-login`, { email, password });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('carryon_token', access_token);
    setToken(access_token);
    setUser({ ...userData, _serverScope: userData.admin_scope });
    setPendingEmail(null);
    return userData;
  };

  // Direct token login — used by invitation acceptance and other flows
  // that already have a valid token from the backend (not email/password).
  const loginWithToken = (access_token, userData) => {
    localStorage.setItem('carryon_token', access_token);
    setToken(access_token);
    setUser(userData || null);
    setPendingEmail(null);
  };

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${token}` }
  });

  const refreshSubscription = async () => {
    if (token) {
      await fetchSubscriptionStatus(token);
      await fetchEnabledFeatures(token);
    }
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const userData = response.data;
      setUser({
        ...userData,
        is_also_benefactor: userData.is_also_benefactor || false,
        is_also_beneficiary: userData.is_also_beneficiary || false,
      });
    } catch (error) {
      console.error('Refresh user error:', error);
    }
  };

  // Escape-hatch listener — the global RouteErrorBoundary fires this
  // event when the user taps "Sign out and start over" or, while
  // offline, "Try again". The boundary lives outside the AuthContext
  // tree (it's a class component, can't use hooks), so it can't call
  // logout() directly. The event lets us reach across that boundary
  // and clear the in-memory user/token state. Without this the user
  // got stuck in a loop: localStorage cleared, but React state still
  // had user/token → ProtectedRoute kept rendering /dashboard → throw
  // → boundary → tap → flash → repeat.
  useEffect(() => {
    const handler = () => { logout(); };
    window.addEventListener('carryon-force-logout', handler);
    return () => window.removeEventListener('carryon-force-logout', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Keep enabledFeatures fresh without requiring logout/login ──
  // The feature-gate config lives in the DB and can be changed by an
  // admin at any time (Founder Portal → Subscriptions → Feature Gates).
  // Without this effect, `enabledFeatures` is loaded once at login and
  // then sits stale for the whole session — meaning an admin toggle of
  // DTS or EPT for a tier wouldn't reach a user whose tab was already
  // open. Three triggers keep it fresh:
  //   1. Page focus (user tabs back in after making an admin change)
  //   2. 5-minute poll (long-lived tabs stay current)
  //   3. Explicit pushes via the exposed `refreshEnabledFeatures()`
  useEffect(() => {
    if (!token) return;
    const onFocus = () => { fetchEnabledFeatures(token); };
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchEnabledFeatures(token);
      }
    }, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      token,
      loading,
      pendingEmail,
      subscriptionStatus,
      enabledFeatures,
      login,
      loginWithToken,
      verifyOtp,
      resendOtp,
      devLogin,
      logout,
      getAuthHeaders,
      refreshSubscription,
      refreshUser,
      refreshEnabledFeatures,
      isAuthenticated: !!user
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
