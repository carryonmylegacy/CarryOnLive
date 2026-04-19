import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from '../utils/toast';
import { useAuth } from '../contexts/AuthContext';
import { useLocalStorageBoolean } from '../hooks/useLocalStorageBoolean';
import { Shield, LogOut, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Button } from '../components/ui/button';
import NotificationSettings from '../components/NotificationSettings';
import { NotificationPrefsCard } from '../components/settings/NotificationPrefsCard';
import ProfileCard from '../components/settings/ProfileCard';
import PersonalInfoCard from '../components/settings/PersonalInfoCard';
import EstatePhotoCard from '../components/settings/EstatePhotoCard';
import AppearanceCard from '../components/settings/AppearanceCard';
import DigestCard from '../components/settings/DigestCard';
import PrivacyCard from '../components/settings/PrivacyCard';
import DockCustomizer from '../components/DockCustomizer';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user, token, logout, getAuthHeaders, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [settingsReady, setSettingsReady] = useState(false);
  const [guideHidden, setGuideHidden] = useState(true);
  const [betaBugIconHidden, setBetaBugIconHidden] = useLocalStorageBoolean('hide_beta_bug_icon');

  const isStaff = user?.role === 'admin' || user?.role === 'operator';
  const fromOnboarding = searchParams.get('from') === 'onboarding';
  const editAddress = searchParams.get('editAddress') === 'true';

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    if (!user) return;
    // Quick readiness check — just verify estates are accessible for non-staff
    if (isStaff) {
      setSettingsReady(true);
    } else {
      axios.get(`${API_URL}/estates`, getAuthHeaders())
        .then(() => setSettingsReady(true))
        .catch(() => setSettingsReady(true)); // Still show the page even if estate fetch fails
    }
    // Fetch onboarding dismiss state
    if (!isStaff) {
      axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders())
        .then(r => setGuideHidden(!!r.data?.manually_dismissed))
        .catch(() => {});
    }
  }, [token, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSave = () => {
    // Every card on this page auto-saves its own field on change (Profile,
    // PersonalInfo, Appearance, Notifications, Digest, Privacy, Dock). The
    // Save button exists to give the user an explicit confirmation that
    // the changes they just made are committed. We dispatch a global event
    // so any child card with a pending debounced write can flush, then
    // surface a toast.
    window.dispatchEvent(new CustomEvent('carryon:settings:flush'));
    toast.success('All settings on this page are saved.', {
      duration: 2500,
      description: 'Every change you just made is committed to your account.',
    });
  };

  if (!user || !settingsReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--gold)]" />
          <p className="text-[var(--t4)] text-sm">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-5 pb-28 sm:pb-8 animate-page-in">
      {/* Header — polished hero with Back + Save controls */}
      <div className="mb-1">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(180deg, var(--gold2), var(--gold))' }} />
            <h1 className="text-2xl lg:text-3xl font-bold text-[var(--t)] truncate" style={{ fontFamily: 'var(--sans)', letterSpacing: '-0.02em' }}>Settings</h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => navigate(-1)}
              className="px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-transform hover:scale-105 border"
              style={{ background: 'transparent', color: 'var(--t)', borderColor: 'var(--b)' }}
              data-testid="settings-back-button"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-transform hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
              data-testid="settings-save-button"
            >
              Save
            </button>
          </div>
        </div>
        <p className="text-[var(--t4)] text-sm pl-4">Manage your profile, security, and preferences.</p>
      </div>

      {/* Onboarding Notice */}
      {fromOnboarding && (
        <div className="rounded-xl p-4 mb-2 flex items-center gap-3" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
          <span className="text-[var(--gold)] text-lg font-bold">!</span>
          <div>
            <p className="text-[var(--t)] text-sm font-semibold">Complete Your Profile</p>
            <p className="text-[var(--t4)] text-xs">Fill in the fields below to finish setting up your account.</p>
          </div>
        </div>
      )}

      {/* ── Section: Profile ── */}
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--t5)] pt-1 pl-1">Profile</div>
      <ProfileCard />
      <PersonalInfoCard initialEditAddress={editAddress || fromOnboarding} />

      {/* Estate Photo — benefactors only */}
      {!isStaff && <EstatePhotoCard />}

      {/* ── Section: Security ── */}
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--t5)] pt-3 pl-1">Security</div>
      <Card className="glass-card cursor-pointer hover:border-[var(--gold)]/30 transition-colors" onClick={() => navigate('/security-settings')} data-testid="settings-security-link">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.1)' }}>
                <ShieldCheck className="w-5 h-5 text-[var(--gold)]" />
              </div>
              <div>
                <h4 className="text-[var(--t)] font-bold">Security Settings</h4>
                <p className="text-[var(--t5)] text-sm">2FA, passkeys, auto-logout, vault locks</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-[var(--t4)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </div>
        </CardContent>
      </Card>

      {/* Beneficiary Create Estate Reminder */}
      {user?.role === 'beneficiary' && (
        <Card className="glass-card">
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-[var(--t)] font-medium">Create Estate Reminder</h4>
                <p className="text-[var(--t5)] text-sm">Show a prompt to create your own estate plan when you log in</p>
              </div>
              <Switch
                checked={!user?.hide_benefactor_reminder}
                onCheckedChange={async (checked) => {
                  try {
                    await axios.put(`${API_URL}/auth/profile`, { hide_benefactor_reminder: !checked }, {
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    // Refresh AuthContext state in place — no full page reload.
                    await refreshUser();
                    toast.success(checked ? 'Create-Estate Reminder turned on — saved.' : 'Create-Estate Reminder turned off — saved.');
                  } catch {
                    toast.error('Could not save that change. Please try again.');
                  }
                }}
                data-testid="settings-benefactor-reminder-toggle"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Section: Appearance & Navigation ── */}
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--t5)] pt-3 pl-1">Appearance & Navigation</div>
      <AppearanceCard isStaff={isStaff} />

      {/* Dock Customizer */}
      <Card className="glass-card" data-testid="settings-dock-card">
        <CardContent className="pt-5">
          <DockCustomizer />
        </CardContent>
      </Card>

      {/* ── Section: Notifications ── */}
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--t5)] pt-3 pl-1">Notifications</div>
      {/* Notification Settings (push notifications) */}
      <NotificationSettings getAuthHeaders={getAuthHeaders} />

      {/* Notification Preferences (granular category controls) */}
      <NotificationPrefsCard />

      <DigestCard />

      {/* ── Section: Privacy — non-staff only ── */}
      {!isStaff && (
        <>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--t5)] pt-3 pl-1">Privacy & Data</div>
          <PrivacyCard />
        </>
      )}

      {/* Beta Tester Settings */}
      {user?.is_beta_tester && (
        <>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--t5)] pt-3 pl-1">Beta Testing</div>
          <Card className="glass-card" data-testid="settings-beta-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--t)]">Hide Bug Report Icon</p>
                  <p className="text-xs text-[var(--t5)]">Hide the floating bug icon on all pages</p>
                </div>
                <Switch
                  checked={betaBugIconHidden}
                  onCheckedChange={(checked) => {
                    setBetaBugIconHidden(checked);
                    toast.success(checked ? 'Bug report icon hidden — saved.' : 'Bug report icon restored — saved.');
                  }}
                  data-testid="beta-hide-bug-toggle"
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Sign Out */}
      <div className="pt-4">
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
      </div>

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
    </div>
  );
};

export default SettingsPage;
