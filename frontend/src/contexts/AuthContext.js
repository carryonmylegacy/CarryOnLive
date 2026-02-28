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

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const response = await axios.get(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUser(response.data);
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
    setToken(null);
    setUser(null);
    setPendingEmail(null);
    setSubscriptionStatus(null);
  };

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
