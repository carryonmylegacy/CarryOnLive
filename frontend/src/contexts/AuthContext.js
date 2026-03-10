import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('carryon_token'));
  const [loading, setLoading] = useState(true);
  const [pendingEmail, setPendingEmail] = useState(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);

  const fetchSubscriptionStatus = async (authToken) => {
    try {
      const res = await axios.get(`${API_URL}/subscriptions/status`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setSubscriptionStatus(res.data);
    } catch (err) {
      console.error('Subscription status fetch error:', err);
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
          const response = await axios.get(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          // Include multi-role flags in user object
          const userData = response.data;
          setUser({
            ...userData,
            is_also_benefactor: userData.is_also_benefactor || false,
            is_also_beneficiary: userData.is_also_beneficiary || false,
          });
          await fetchSubscriptionStatus(token);
        } catch (error) {
          console.error('Auth init error:', error);
          logout();
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email, password, otpMethod = 'email', phone = null) => {
    // Clear dev switcher session on normal login
    localStorage.removeItem('dev_switcher_admin_session');
    const payload = { email, password, otp_method: otpMethod };
    if (otpMethod === 'sms' && phone) {
      payload.phone = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
    }
    const response = await axios.post(`${API_URL}/auth/login`, payload);
    const data = response.data;
    // Sealed account — transitioned benefactor
    if (data.sealed) {
      return { sealed: true, transitioned_at: data.transitioned_at };
    }
    // Direct login (OTP disabled) — token returned immediately
    if (data.access_token) {
      localStorage.setItem('carryon_token', data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      setPendingEmail(null);
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
    setUser(userData);
    setPendingEmail(null);
    return userData;
  };

  const resendOtp = async (email) => {
    const response = await axios.post(`${API_URL}/auth/resend-otp`, { email });
    return response.data;
  };

  const logout = async () => {
    // Server-side token blacklisting
    try {
      if (token) {
        await axios.post(`${API_URL}/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (e) { /* proceed with client-side logout even if server call fails */ }
    localStorage.removeItem('carryon_token');
    localStorage.removeItem('dev_switcher_admin_session');
    localStorage.removeItem('dev_switcher_admin_token');
    sessionStorage.removeItem('trial_banner_dismissed');
    setToken(null);
    setUser(null);
    setPendingEmail(null);
    setSubscriptionStatus(null);
  };

  // Auto-logout when app is backgrounded for longer than user's timeout setting
  useEffect(() => {
    let bgTimer = null;
    const handleVisibility = () => {
      const mins = parseInt(localStorage.getItem('carryon_auto_logout_minutes') || '5', 10);
      if (document.hidden && token) {
        bgTimer = setTimeout(() => {
          localStorage.removeItem('carryon_token');
          sessionStorage.removeItem('trial_banner_dismissed');
          setToken(null);
          setUser(null);
          window.location.href = '/login';
        }, mins * 60 * 1000);
      } else if (bgTimer) {
        clearTimeout(bgTimer);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (bgTimer) clearTimeout(bgTimer);
    };
  }, [token]);

  const devLogin = async (email, password) => {
    const response = await axios.post(`${API_URL}/auth/dev-login`, { email, password });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('carryon_token', access_token);
    setToken(access_token);
    setUser(userData);
    setPendingEmail(null);
    return userData;
  };

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${token}` }
  });

  const refreshSubscription = async () => {
    if (token) await fetchSubscriptionStatus(token);
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

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      pendingEmail,
      subscriptionStatus,
      login,
      verifyOtp,
      resendOtp,
      devLogin,
      logout,
      getAuthHeaders,
      refreshSubscription,
      refreshUser,
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
