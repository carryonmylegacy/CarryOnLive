import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import axios from 'axios';
import {
  Moon,
  Sun,
  User,
  Bell,
  Lock,
  LogOut,
  ChevronRight,
  Shield,
  Mail,
  Loader2,
  Download,
  Trash2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';
import { toast } from 'sonner';
import NotificationSettings from '../components/NotificationSettings';
import FamilyPlanSettings from '../components/FamilyPlanSettings';
import SubscriptionPaywall from '../components/SubscriptionPaywall';
import { SubscriptionManagement } from '../components/settings/SubscriptionManagement';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SettingsPage = () => {
  const { user, logout, subscriptionStatus, refreshSubscription, token } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestSending, setDigestSending] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  // GDPR state
  const [consent, setConsent] = useState(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [retentionPolicy, setRetentionPolicy] = useState(null);
  const [showRetention, setShowRetention] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isAdmin = user?.role === 'admin';

  const getAuthHeaders = () => {
    const token = localStorage.getItem('carryon_token');
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  // Handle post-checkout redirect — detect session_id in URL after Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (!sessionId || !token) return;

    setConfirmingPayment(true);
    const headers = { Authorization: `Bearer ${token}` };

    axios.get(`${API_URL}/subscriptions/checkout-status/${sessionId}`, { headers })
      .then(async (res) => {
        if (res.data?.payment_status === 'paid' || res.data?.payment_status === 'complete') {
          toast.success('Payment confirmed! Your plan has been updated.');
          window.history.replaceState({}, '', window.location.pathname);
          if (refreshSubscription) await refreshSubscription();
        } else {
          toast.info('Payment is being processed. Checking again shortly...');
          // Retry after a few seconds for async payment processing
          setTimeout(async () => {
            try {
              const retry = await axios.get(`${API_URL}/subscriptions/checkout-status/${sessionId}`, { headers });
              if (retry.data?.payment_status === 'paid' || retry.data?.payment_status === 'complete') {
                toast.success('Subscription updated!');
                window.history.replaceState({}, '', window.location.pathname);
                if (refreshSubscription) await refreshSubscription();
              }
            } catch (e) { /* ignore retry errors */ }
            setConfirmingPayment(false);
          }, 5000);
          return;
        }
        setConfirmingPayment(false);
      })
      .catch(() => {
        toast.error('Could not confirm payment. Please refresh or contact support.');
        setConfirmingPayment(false);
      });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fetchDigestPref = async () => {
      try {
        const res = await axios.get(`${API_URL}/digest/preferences`, getAuthHeaders());
        setWeeklyDigest(res.data.weekly_digest);
      } catch (e) { /* default to true */ }
    };
    const fetchConsent = async () => {
      try {
        const res = await axios.get(`${API_URL}/compliance/consent`, getAuthHeaders());
        setConsent(res.data);
      } catch (e) { /* default */ }
    };
    fetchDigestPref();
    fetchConsent();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDigest = async (val) => {
    setDigestLoading(true);
    try {
      await axios.put(`${API_URL}/digest/preferences`, { weekly_digest: val }, getAuthHeaders());
      setWeeklyDigest(val);
    } catch (e) { /* ignore */ }
    finally { setDigestLoading(false); }
  };

  const sendPreview = async () => {
    setDigestSending(true);
    try {
      await axios.post(`${API_URL}/digest/preview`, {}, getAuthHeaders());
      toast.success('Preview digest sent to your email!');
    } catch (e) {
      toast.error('Could not send preview — do you have an estate?');
    }
    finally { setDigestSending(false); }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const updateConsent = async (field, value) => {
    setConsentLoading(true);
    const updated = { ...consent, [field]: value };
    try {
      await axios.put(`${API_URL}/compliance/consent`, {
        marketing_emails: updated.marketing_emails,
        analytics_tracking: updated.analytics_tracking,
        third_party_sharing: updated.third_party_sharing,
      }, getAuthHeaders());
      setConsent(updated);
      toast.success('Privacy preference updated');
    } catch (e) {
      toast.error('Failed to update preference');
    }
    setConsentLoading(false);
  };

  const handleDataExport = async () => {
    setExportLoading(true);
    try {
      const res = await axios.get(`${API_URL}/compliance/data-export`, getAuthHeaders());
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `carryon-data-export-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('Your data export has been downloaded');
    } catch (e) {
      toast.error('Failed to export data');
    }
    setExportLoading(false);
  };

  const handleDeleteRequest = async () => {
    if (deleteEmail !== user?.email) {
      toast.error('Email does not match your account');
      return;
    }
    setDeleteLoading(true);
    try {
      const res = await axios.post(`${API_URL}/compliance/deletion-request`, {
        confirm_email: deleteEmail,
        reason: deleteReason,
      }, getAuthHeaders());
      toast.success(res.data.message);
      setShowDeleteConfirm(false);
      setDeleteEmail('');
      setDeleteReason('');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to submit deletion request');
    }
    setDeleteLoading(false);
  };

  const fetchRetentionPolicy = async () => {
    if (retentionPolicy) { setShowRetention(true); return; }
    try {
      const res = await axios.get(`${API_URL}/compliance/retention-policy`, getAuthHeaders());
      setRetentionPolicy(res.data);
      setShowRetention(true);
    } catch (e) {
      toast.error('Could not load retention policy');
    }
  };

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in max-w-4xl mx-auto" data-testid="settings-page">
      {/* Post-checkout payment confirmation */}
      {confirmingPayment && (
        <div className="fixed inset-0 z-50 bg-[#0a0e1a]/80 flex items-center justify-center flex-col gap-3">
          <Loader2 className="w-8 h-8 text-[var(--gold)] animate-spin" />
          <p className="text-[var(--t4)] text-sm">Confirming your payment...</p>
        </div>
      )}
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Settings
        </h1>
        <p className="text-[var(--t4)] mt-1 text-sm sm:text-base">
          Manage your account, subscription, and preferences
        </p>
      </div>

      {/* Profile */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <User className="w-5 h-5 text-[var(--gold)]" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[var(--gold)]/20 flex items-center justify-center text-[var(--gold)] text-xl font-bold">
              {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
            </div>
            <div>
              <h3 className="text-[var(--t)] font-semibold text-lg">{user?.name || 'User'}</h3>
              <p className="text-[var(--t4)] text-sm">{user?.email || ''}</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-[var(--gold)]/20 text-[var(--gold)] text-xs rounded-full capitalize">
                {user?.role || 'benefactor'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <NotificationSettings getAuthHeaders={() => getAuthHeaders()} />

      {/* Subscription Plans — hidden for admin */}
      {!isAdmin && (
        <SubscriptionManagement
          subscriptionStatus={subscriptionStatus}
          refreshSubscription={refreshSubscription}
          getAuthHeaders={() => getAuthHeaders()}
          onShowPaywall={() => setShowPaywall(true)}
        />
      )}

      {/* Family Plan — hidden for admin */}
      {!isAdmin && (
        <FamilyPlanSettings getAuthHeaders={() => getAuthHeaders()} />
      )}

      {/* Appearance */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            {theme === 'dark' ? <Moon className="w-5 h-5 text-[var(--gold)]" /> : <Sun className="w-5 h-5 text-[var(--gold)]" />}
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[var(--t)] font-medium">Dark Mode</h4>
              <p className="text-[var(--t5)] text-sm">Use dark theme for the interface</p>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={toggleTheme}
              data-testid="settings-theme-toggle"
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <Bell className="w-5 h-5 text-[var(--gold)]" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[var(--t)] font-medium flex items-center gap-2">
                <Mail className="w-4 h-4 text-[var(--t4)]" />
                Weekly Estate Digest
              </h4>
              <p className="text-[var(--t5)] text-sm">Monday morning readiness report with your top 3 action items</p>
            </div>
            <div className="flex items-center gap-2">
              {digestLoading && <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)]" />}
              <Switch
                checked={weeklyDigest}
                onCheckedChange={toggleDigest}
                disabled={digestLoading}
                data-testid="settings-weekly-digest-toggle"
              />
            </div>
          </div>
          {weeklyDigest && user?.role === 'benefactor' && (
            <button
              onClick={sendPreview}
              disabled={digestSending}
              className="text-xs text-[var(--gold)] hover:underline flex items-center gap-1"
              data-testid="settings-digest-preview"
            >
              {digestSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              Send me a preview now
            </button>
          )}
          <Separator className="bg-[var(--b)]" />
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[var(--t)] font-medium">Email Notifications</h4>
              <p className="text-[var(--t5)] text-sm">Receive updates via email</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator className="bg-[var(--b)]" />
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[var(--t)] font-medium">Security Alerts</h4>
              <p className="text-[var(--t5)] text-sm">Get notified of security events</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <Lock className="w-5 h-5 text-[var(--gold)]" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full border-[var(--b)] text-[var(--t)] justify-between">
            Change Password
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" className="w-full border-[var(--b)] text-[var(--t)] justify-between">
            Two-Factor Authentication
            <span className="text-[#10b981] text-sm">Enabled</span>
          </Button>
        </CardContent>
      </Card>

      {/* Sign Out */}
      <Card className="glass-card border-[#ef4444]/20">
        <CardContent className="p-4">
          <Button
            variant="outline"
            className="w-full border-[#ef4444]/50 text-[#ef4444] hover:bg-[#ef4444]/10"
            onClick={handleLogout}
            data-testid="settings-logout-button"
          >
            <LogOut className="w-5 h-5 mr-2" />
            Sign Out
          </Button>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center py-4">
        <div className="flex items-center justify-center gap-2 text-[var(--t5)] text-sm mb-2">
          <Shield className="w-4 h-4" />
          <span>AES-256 Encrypted · Zero-Knowledge · 2FA Protected</span>
        </div>
        <p className="text-[var(--t5)] text-xs">
          CarryOn™ v1.0.0 · © 2024 CarryOn Inc.
        </p>
      </div>

      {/* Paywall Modal */}
      {showPaywall && (
        <SubscriptionPaywall onDismiss={() => setShowPaywall(false)} />
      )}
    </div>
  );
};

export default SettingsPage;
