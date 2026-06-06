import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';
import { clearCache } from '../utils/apiCache';
import { isAutoLogoutSuspended, suspendAutoLogout } from '../utils/autoLogoutSuspend';

const AuthContext = createContext(null);

// audit 4fcd843 #1/#2 — single source of truth for wiping ALL local session
// data on logout. Awaited by manual logout AND invoked by every AUTOMATIC
// logout path (signed-in-elsewhere, midnight, idle timeout, background) so a
// user signed out without tapping "Log out" never leaves estate data (Dexie
// mirrors, list caches, the AES decryption key, SW caches) on a shared device.
async function performLocalLogoutCleanup() {
  try { clearCache(); } catch { /* no-op */ }
  // Kick off the async purges (dynamic imports) up front; await them at the end.
  const purges = [
    import('../offline/crypto').then((m) => m.clearSessionKey()).catch(() => {}),
    import('../offline/db').then((m) => m.purgeLocalData()).catch(() => {}),
    import('../utils/localListCache').then((m) => m.clearAllLists()).catch(() => {}),
  ];
  // Synchronous storage + SW-cache wipe — token removed IMMEDIATELY (before any
  // await) so the dead session can't be reused even if a purge below stalls.
  try {
    localStorage.removeItem('carryon_token');
    localStorage.removeItem('dev_switcher_admin_session');
    localStorage.removeItem('dev_switcher_admin_token');
    localStorage.removeItem('dev_switcher_active_role');
    localStorage.removeItem('selected_estate_id');
    localStorage.removeItem('beneficiary_estate_id');
    sessionStorage.removeItem('trial_banner_dismissed');
  } catch { /* private mode */ }
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_APP_CACHES' });
    }
  } catch { /* no SW */ }
  await Promise.allSettled(purges);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('carryon_token'));
  const [loading, setLoading] = useState(true);
  const [pendingEmail, setPendingEmail] = useState(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [enabledFeatures, setEnabledFeatures] = useState(null);

  // audit 18a9d44 F-18-01 — establish (and re-establish on SW takeover) the
  // signed-in user's partitioned service-worker API cache namespace so cached
  // authenticated responses are never readable by a later user on the device.
  useEffect(() => {
    const uid = user?.id;
    if (!uid || !('serviceWorker' in navigator)) return;
    const send = () => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SET_CACHE_ID', cacheId: uid });
      }
    };
    send();
    navigator.serviceWorker.ready.then(send).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', send);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', send);
  }, [user?.id]);

  // ── Partner co-branding ──────────────────────────────────────────
  // When the signed-in user redeemed a B2B/Enterprise code, this
  // holds their partner's logo (as a base64 data URL) + company name
  // so every CarryOn-branded surface (sidebar, mobile header,
  // onboarding, paywall) can swap to the partner's mark.
  //
  // Strict invariants:
  //   • Direct consumer signups (`partner_slug` not set) NEVER see
  //     a partner logo. Value stays null. Nothing changes for them.
  //   • Admin/founder sessions don't have `partner_slug`. Their
  //     UX is untouched — the Founder Portal Switcher keeps the
  //     CarryOn mark exactly as before.
  //   • Reset on logout so the next user on the same device gets
  //     the right brand.
  const [partnerBranding, setPartnerBranding] = useState(null);

  // Fetch the partner's branding (logo + name) once per session when
  // the auth'd user has a `partner_slug`. Public endpoint — no auth
  // header needed — same blob the unauth landing page uses.
  useEffect(() => {
    const slug = user?.partner_slug;
    if (!slug) {
      setPartnerBranding(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(`${API_URL}/public/partners/${slug}`, { timeout: 15000 });
        if (cancelled || !res.data) return;
        setPartnerBranding({
          slug,
          companyName: res.data.company_name || null,
          logoUrl: res.data.logo_data_url || null,
        });
      } catch {
        // Partner deleted, deactivated, or transient network blip —
        // fall back to default CarryOn branding rather than locking
        // the UI into a half-loaded state.
        if (!cancelled) setPartnerBranding(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.partner_slug]);

  const fetchSubscriptionStatus = async (authToken) => {
    try {
      const res = await apiClient.get(`${API_URL}/subscriptions/status`, {
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
      const res = await apiClient.get(`${API_URL}/subscriptions/enabled-features${params}`, {
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
          // audit 4fcd843 #1 — run the FULL local purge (Dexie, list caches,
          // AES key, SW caches), not just token removal, before redirecting.
          performLocalLogoutCleanup().finally(() => {
            setToken(null);
            setUser(null);
            alert('Your session ended because you signed in on another device.');
            window.location.href = '/login';
          });
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        // Prime the at-rest decryption key the INSTANT we have a token.
        // It's derived purely from the token and NEVER touches the
        // network, so doing it here (before any /auth/me round-trip) means
        // every cached read this session — profile, vault, subscription —
        // can decrypt immediately. Critical for Wi-Fi-with-no-internet,
        // where navigator.onLine lies and the boot requests below hang the
        // full timeout: without this the cache stayed locked until the
        // timeout fired. Fire-and-forget; offline paths await it too.
        try {
          import('../offline/crypto')
            .then((m) => { if (m.isEncryptionEnabled()) m.primeSessionKey(token); })
            .catch(() => {});
        } catch { /* no-op */ }

        // Optimistic offline paint. If the boot round-trip is slow — a
        // cold backend OR Wi-Fi-with-no-internet where each request hangs
        // its full 20s timeout — don't make the user stare at a spinner.
        // After OPTIMISTIC_MS, if we still have a valid (unexpired) cached
        // session, paint the authenticated shell from cache and release
        // the splash. The boot requests below keep running and reconcile:
        // a successful /auth/me overrides this with authoritative data; a
        // 401/403 still logs the user out.
        let optimisticPainted = false;
        const _jwt = (() => {
          try {
            const [, b] = token.split('.');
            return JSON.parse(atob(b.replace(/-/g, '+').replace(/_/g, '/')));
          } catch { return null; }
        })();
        const _notExpired = _jwt?.exp && _jwt.exp * 1000 > Date.now();
        // Paint the authenticated shell from cache and release the splash.
        // Idempotent (guarded by `optimisticPainted`) so it's safe to call
        // from BOTH the 5s safety-net timer and the fast offline probe below.
        const paintOptimistic = () => {
          if (optimisticPainted) return;
          optimisticPainted = true;
          // The boot round-trip is unresponsive. Mark the device offline NOW
          // so the dashboard + every page request short-circuits to cache
          // instead of each hanging its own 20s timeout (the cause of the
          // 15s+ "login to dashboard" lag on Wi-Fi-with-no-internet). If
          // /auth/me later succeeds we clear this flag and reconcile to live
          // data, so a rare false-positive self-corrects.
          try { if (typeof window !== 'undefined' && window.__setDeviceOffline) window.__setDeviceOffline(true); } catch { /* no-op */ }
          setUser((prev) => prev || {
            id: _jwt.user_id || _jwt.sub,
            email: _jwt.email,
            role: _jwt.role || 'benefactor',
            _offlineHydrated: true,
          });
          setLoading(false);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('carryon:app-ready'));
          }
          (async () => {
            try {
              const { getLocalProfile } = await import('../offline/repos/profileRepo');
              const cp = await getLocalProfile();
              if (cp) {
                setUser((prev) => {
                  const merged = { ...(prev || {}), ...cp, _offlineHydrated: true };
                  if (!merged.name) merged.name = cp.first_name || '';
                  return merged;
                });
              }
            } catch { /* cache locked/empty — JWT shell stands */ }
            try {
              const { getLocalSubscription } = await import('../offline/repos/subscriptionRepo');
              const ls = await getLocalSubscription();
              if (ls) setSubscriptionStatus(ls);
            } catch { /* no cached sub */ }
          })();
        };
        // 5s safety net: if NOTHING resolved (slow/cold backend), still
        // release the splash from cache rather than spin forever.
        const optimisticTimer = _notExpired ? setTimeout(paintOptimistic, 5000) : null;

        // Fast offline discriminator (cuts the offline cold-boot wait from
        // ~5s to ~1.5s). We probe a STATIC same-origin asset — /manifest.json
        // is served by the FRONTEND host and is NOT served from the SW cache
        // (it falls through to network in sw-push.js), so:
        //   • genuinely offline  → the fetch throws / aborts within 1.5s
        //     → paint from cache immediately.
        //   • online but slow/cold BACKEND → the static asset still returns
        //     near-instantly (it doesn't touch the backend) → we do NOT
        //     false-flag offline; the boot requests + reconciliation proceed.
        // This is the clean signal iOS's lying `navigator.onLine` can't give.
        if (_notExpired && typeof fetch === 'function') {
          (async () => {
            try {
              const ctrl = new AbortController();
              const to = setTimeout(() => ctrl.abort(), 1500);
              await fetch(`/manifest.json?cy_boot=${Date.now()}`, {
                method: 'GET',
                cache: 'no-store',
                signal: ctrl.signal,
              });
              clearTimeout(to);
              // Reached the host (any response) → we're online; let the
              // normal boot flow + reconciliation run.
            } catch {
              // Network error or 1.5s abort → the static host is unreachable
              // → genuinely offline. Paint from cache now.
              paintOptimistic();
            }
          })();
        }

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
            apiClient.get(`${API_URL}/auth/me`, authHeaders),
            apiClient.get(`${API_URL}/subscriptions/status`, authHeaders),
            apiClient.get(`${API_URL}/subscriptions/enabled-features${estateParam}`, authHeaders),
          ]);
          if (optimisticTimer) clearTimeout(optimisticTimer);

          // If /auth/me actually came back, we're genuinely online — clear
          // any offline flag the optimistic-paint timer may have set so the
          // app reconciles to live data instead of staying stuck on cache.
          if (meRes.status === 'fulfilled') {
            try { if (typeof window !== 'undefined' && window.__setDeviceOffline) window.__setDeviceOffline(false); } catch { /* no-op */ }
          }

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
                // STEP 1 — paint an authenticated shell IMMEDIATELY from the
                // JWT and release the splash. Never block first paint on the
                // PBKDF2 key derivation or IndexedDB reads below; on a phone
                // that adds visible lag to the offline dashboard load.
                setUser({
                  id: jwtPayload.user_id || jwtPayload.sub,
                  email: jwtPayload.email,
                  role: jwtPayload.role || 'benefactor',
                  _offlineHydrated: true,
                });
                setLoading(false);
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new Event('carryon:app-ready'));
                }
                // STEP 2 — in the BACKGROUND, prime the AES-GCM session key
                // and merge the decrypted profile (name, photo, username,
                // personal info) so the UI fills in a beat later. On a cold
                // OFFLINE BOOT this branch runs INSTEAD of the online path
                // (which primes the key at the successful-/me block), so
                // without this the key stays null, unsealRecord() returns
                // null, and getLocalProfile() yields nothing — stranding the
                // user's own identity behind a lock until they reconnect.
                (async () => {
                  try {
                    const cryptoMod = await import('../offline/crypto');
                    if (cryptoMod.isEncryptionEnabled()) {
                      await cryptoMod.primeSessionKey(token);
                    }
                  } catch { /* key prime best-effort */ }
                  try {
                    const { getLocalProfile } = await import('../offline/repos/profileRepo');
                    const cachedProfile = await getLocalProfile();
                    if (cachedProfile) {
                      setUser((prev) => {
                        const merged = { ...(prev || {}), ...cachedProfile, _offlineHydrated: true };
                        if (!merged.name) merged.name = cachedProfile.first_name || prev?.name || '';
                        merged.email = merged.email || prev?.email;
                        return merged;
                      });
                    }
                  } catch { /* offline cache unavailable — JWT-only user stands */ }
                  try {
                    const { getLocalSubscription } = await import('../offline/repos/subscriptionRepo');
                    const localSub = await getLocalSubscription();
                    if (localSub) setSubscriptionStatus(localSub);
                  } catch {}
                })();
              } catch (hydrateErr) {
                console.warn('[auth] offline hydrate failed, continuing with JWT-only user:', hydrateErr);
                setUser({
                  id: jwtPayload.user_id || jwtPayload.sub,
                  email: jwtPayload.email,
                  role: jwtPayload.role || 'benefactor',
                  _offlineHydrated: true,
                });
                setLoading(false);
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new Event('carryon:app-ready'));
                }
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
    const response = await apiClient.post(`${API_URL}/auth/login`, payload);
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
    const response = await apiClient.post(`${API_URL}/auth/verify-otp`, { email, otp, trust_today: trustToday });
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
    const response = await apiClient.post(`${API_URL}/auth/resend-otp`, { email, method });
    return response.data;
  };

  const logout = async () => {
    // Server-side token blacklisting + session clear
    try {
      if (token) {
        await apiClient.post(`${API_URL}/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (_e) { /* proceed with client-side logout even if server call fails */ }
    // audit 4fcd843 #2 — AWAIT the full local purge (API cache, AES key, Dexie,
    // list caches, estate selectors, SW caches, auth/switcher keys) BEFORE we
    // clear React state, so a PWA closed immediately after logout still finishes
    // wiping the previous user's data from a shared device.
    await performLocalLogoutCleanup();
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
        // audit 4fcd843 #1 — full local purge on automatic midnight logout.
        performLocalLogoutCleanup().finally(() => {
          setToken(null);
          setUser(null);
          window.location.href = '/login';
        });
      }, msUntilMidnight);
    };

    const setting = localStorage.getItem('carryon_auto_logout_minutes') || '5';
    const serverTimeout = user?.session_timeout_minutes;

    // Server-mandated inactivity timeout for staff
    if (serverTimeout && token) {
      const resetInactivity = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          // audit 4fcd843 #1 — full local purge on server-mandated idle logout.
          performLocalLogoutCleanup().finally(() => {
            setToken(null);
            setUser(null);
            window.location.href = '/login';
          });
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
      // Skip auto-logout if a critical flow has temporarily suspended
      // it (verification doc upload → iOS Files/Photos picker, Stripe
      // Checkout popup, native IAP sheet, etc.). Those round-trips
      // legitimately hide the tab for a few seconds and must NOT bounce
      // the user back to /login mid-payment.
      if (isAutoLogoutSuspended()) return;
      const mins = parseInt(setting, 10);
      if (document.hidden && token) {
        if (mins === 0) {
          // Instant logout on app leave — audit 4fcd843 #1 full local purge.
          performLocalLogoutCleanup().finally(() => {
            setToken(null);
            setUser(null);
            window.location.href = '/login';
          });
        } else {
          bgTimer = setTimeout(() => {
            // Re-check the suspend flag at the moment the timer fires
            // (the user may have started a Stripe/upload flow during
            // the wait window).
            if (isAutoLogoutSuspended()) return;
            // audit 4fcd843 #1 — full local purge on background-timeout logout.
            performLocalLogoutCleanup().finally(() => {
              setToken(null);
              setUser(null);
              window.location.href = '/login';
            });
          }, mins * 60 * 1000);
        }
      } else if (bgTimer) {
        clearTimeout(bgTimer);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Global safety net: ANY <input type="file"> click anywhere in the
    // app temporarily suspends auto-logout. iOS opens Photos / Files /
    // Camera as a sibling activity which hides the web tab — if the
    // user's security policy is "instant on app leave" they were being
    // bounced back to /login mid-upload (Senior verification, Vault
    // doc upload, Beneficiary avatar, etc.). Released when focus
    // returns OR after a 90s ceiling.
    //
    // Also covers <a target="_blank"> clicks (Terms of Service,
    // Privacy Policy, "Learn more" links in the paywall surfaces,
    // any external link in the app) — opening a new tab hides the
    // current one and would otherwise trip the same instant-logout.
    const handleGlobalSiblingActivityClick = (e) => {
      const t = e.target;
      if (!t) return;
      // File inputs
      if (t.tagName === 'INPUT' && (t.type || '').toLowerCase() === 'file') {
        const release = suspendAutoLogout();
        const safety = setTimeout(release, 90000);
        const cleanup = () => { clearTimeout(safety); release(); };
        window.addEventListener('focus', cleanup, { once: true });
        return;
      }
      // External-target anchors (opens new tab / external app). Walk
      // up at most 4 levels in case the user clicked an icon/span
      // inside the anchor.
      let el = t;
      for (let depth = 0; depth < 4 && el && el !== document.body; depth++) {
        if (el.tagName === 'A') {
          const target = (el.getAttribute('target') || '').toLowerCase();
          const href = el.getAttribute('href') || '';
          const isExternal = target === '_blank'
            || href.startsWith('mailto:')
            || href.startsWith('tel:')
            || href.startsWith('sms:');
          if (isExternal) {
            const release = suspendAutoLogout();
            const safety = setTimeout(release, 90000);
            const cleanup = () => { clearTimeout(safety); release(); };
            window.addEventListener('focus', cleanup, { once: true });
          }
          return;
        }
        el = el.parentElement;
      }
    };
    document.addEventListener('click', handleGlobalSiblingActivityClick, true);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('click', handleGlobalSiblingActivityClick, true);
      if (bgTimer) clearTimeout(bgTimer);
      if (midnightTimer) clearTimeout(midnightTimer);
    };
  }, [token]);

  const devLogin = async (email, password) => {
    const response = await apiClient.post(`${API_URL}/auth/dev-login`, { email, password });
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
      const response = await apiClient.get(`${API_URL}/auth/me`, {
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
  // CRITICAL: every refresh must pass through the currently-selected
  // estate id so a beneficiary's view inherits the BENEFACTOR's tier
  // (not their own subscription) — see /subscriptions/enabled-features
  // for the resolution rule. Dropping the estate id silently leaks
  // own-tier features into a beneficiary view on the next focus event.
  useEffect(() => {
    if (!token) return;
    const currentEstateId = () => {
      try { return localStorage.getItem('selected_estate_id') || localStorage.getItem('beneficiary_estate_id') || null; }
      catch { return null; }
    };
    const onFocus = () => { fetchEnabledFeatures(token, currentEstateId()); };
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchEnabledFeatures(token, currentEstateId());
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
      partnerBranding,
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

// ── useBrand ──────────────────────────────────────────────────────
// Returns the brand name to display in user-facing product copy.
// • For users authenticated under a B2B/Enterprise partner code,
//   resolves to the partner's company name (e.g., "Acme Wealth").
// • For direct consumer signups and admin/founder sessions, resolves
//   to "CarryOn" — preserving the original UX.
// • Legal text, footers, copyright, ToS, ™ marks, "powered by CarryOn"
//   attribution and email From lines MUST NOT use this hook — they
//   should stay as "CarryOn" because that's the legal entity.
export const useBrand = () => {
  const { partnerBranding } = useAuth();
  return partnerBranding?.companyName || 'CarryOn';
};
