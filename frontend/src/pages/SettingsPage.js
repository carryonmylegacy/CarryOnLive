import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { toast } from '../utils/toast';
import { useAuth } from '../contexts/AuthContext';
import { useLocalStorageBoolean } from '../hooks/useLocalStorageBoolean';
import { Shield, LogOut, Loader2, ShieldCheck, Activity } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Button } from '../components/ui/button';
import NotificationSettings from '../components/NotificationSettings';
import { NotificationPrefsCard } from '../components/settings/NotificationPrefsCard';
import ProfileCard from '../components/settings/ProfileCard';
import PersonalInfoCard from '../components/settings/PersonalInfoCard';
import EstatePhotoCard from '../components/settings/EstatePhotoCard';
import PublicDeviceModeCard from '../components/settings/PublicDeviceModeCard';
import OfflineBehaviorCard from '../components/settings/OfflineBehaviorCard';
import OfflineAccessCard from '../components/settings/OfflineAccessCard';
import OfflineCapabilitiesCard from '../components/settings/OfflineCapabilitiesCard';
import SyncStatusCard from '../components/settings/SyncStatusCard';
import ScrollRestorationCard from '../components/settings/ScrollRestorationCard';
import AppearanceCard from '../components/settings/AppearanceCard';
import DashboardViewCard from '../components/settings/DashboardViewCard';
import DigestCard from '../components/settings/DigestCard';
import PrivacyCard from '../components/settings/PrivacyCard';
import DockCustomizer from '../components/DockCustomizer';
// MenuOrderCustomizer retired May 22 2026 — file kept on disk in
// case the founder chooses to bring per-section reordering back.
import ReferralCard from '../components/ReferralCard';
import ChatAutoscrollCard from '../components/settings/ChatAutoscrollCard';
import TrusteeAccessCard from '../components/settings/TrusteeAccessCard';
import {
  isPlatformOfflineVisible,
  PLATFORM_OFFLINE_FLAG_EVENT,
} from '../utils/platformOfflineFlag';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user, token, logout, getAuthHeaders, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [settingsReady, setSettingsReady] = useState(false);
  const [_guideHidden, setGuideHidden] = useState(true);
  const [betaBugIconHidden, setBetaBugIconHidden] = useLocalStorageBoolean('hide_beta_bug_icon');
  // Founder's master Offline-Mode platform switch (see
  // `/utils/platformOfflineFlag.js`). When OFF, the entire Offline
  // section in Settings is hidden — Feb 26 2026 founder direction
  // ("offline mode isn't fully baked yet, but I want my master
  // switch to govern user-visible affordances platform-wide").
  const [offlineVisible, setOfflineVisible] = useState(() => isPlatformOfflineVisible());
  useEffect(() => {
    const onChange = () => setOfflineVisible(isPlatformOfflineVisible());
    window.addEventListener(PLATFORM_OFFLINE_FLAG_EVENT, onChange);
    return () => window.removeEventListener(PLATFORM_OFFLINE_FLAG_EVENT, onChange);
  }, []);

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
      apiClient.get(`${API_URL}/estates`, getAuthHeaders())
        .then(() => setSettingsReady(true))
        .catch(() => setSettingsReady(true)); // Still show the page even if estate fetch fails
    }
    // Fetch onboarding dismiss state
    if (!isStaff) {
      apiClient.get(`${API_URL}/onboarding/progress`, getAuthHeaders())
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
    <div className="w-full max-w-[1400px] mx-auto p-4 lg:p-6 pt-4 lg:pt-6 pb-28 sm:pb-8 space-y-5 animate-page-in" data-testid="settings-page"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(var(--gold-rgb), 0.12), transparent 55%), radial-gradient(ellipse at bottom right, rgba(240,201,92,0.06), transparent 55%)' }}>
      {/* Header — standardized icon-box + title + 1-line description,
          matching MM / SDV / IAC / Beneficiaries. Back + Save utility
          buttons preserved on the right. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(var(--gold-rgb), 0.2), rgba(240,201,92,0.15))' }}>
            <Shield className="w-5 h-5 text-[var(--gold)]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)] truncate" style={{ fontFamily: 'var(--sans)' }}>
              Settings
            </h1>
            <p className="text-xs text-[var(--t5)]">Manage your profile, security, and preferences</p>
          </div>
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

      {/* Onboarding Notice */}
      {fromOnboarding && (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(var(--gold-rgb), 0.08)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}>
          <span className="text-[var(--gold)] text-lg font-bold">!</span>
          <div>
            <p className="text-[var(--t)] text-sm font-semibold">Complete Your Profile</p>
            <p className="text-[var(--t4)] text-xs">Fill in the fields below to finish setting up your account.</p>
          </div>
        </div>
      )}

      {/* ── Section: Profile ── */}
      <SectionHeader title="Profile" hint="Your name, photo, and personal info." />
      <ProfileCard />
      <PersonalInfoCard initialEditAddress={editAddress || fromOnboarding} />

      {/* Estate Photo — benefactors only */}
      {!isStaff && <EstatePhotoCard />}

      {/* Referral program — benefactors only (staff don't refer) */}
      {!isStaff && <ReferralCard />}

      {/* ── Section: Offline ── (hidden when the founder's master
          Offline Mode switch in the Admin sidebar is OFF — gating
          done via /utils/platformOfflineFlag.js so users never see
          a toggle for a feature that's been disabled platform-wide.) */}
      {offlineVisible && (
        <>
          <SectionHeader title="Offline" hint="Control how CarryOn behaves when you lose signal." />
          {/* Plain-English list of what works offline vs what needs the
              internet. Sets user expectations explicitly so nothing is
              surprising on a flight or in a basement. */}
          <OfflineCapabilitiesCard />
          <OfflineBehaviorCard />
          {/* PWA-only opt-in: cache an encrypted credential on this device so
              the user can sign back in even with no internet. Renders nothing
              in a regular browser tab (the use case requires the home-screen
              install). */}
          <OfflineAccessCard />
          {/* Permanent in-app diagnostics for the offline sync queue.
              Renders nothing when the queue is empty and no error has
              ever been recorded, so the page stays uncluttered for users
              who don't hit offline scenarios. */}
          <SyncStatusCard />
        </>
      )}

      {/* ── Section: Security ── */}
      <SectionHeader title="Security" hint="2FA, passkeys, auto-logout, vault locks." />
      {/* Trustee Access (TMA) — benefactor-only. The card hides itself
          when the `tma` feature gate is off and renders fully greyed
          out when the active session is a trustee login. */}
      {!isStaff && <TrusteeAccessCard />}
      {/* Public Device Mode — benefactor-only. Hidden in the Founder
          ADMIN portal (admin/operator roles) since it's an estate-level
          setting that doesn't apply to staff accounts. */}
      {!isStaff && <PublicDeviceModeCard />}
      <Card className="glass-card cursor-pointer hover:border-[var(--gold)]/30 transition-colors" onClick={() => navigate('/security-settings')} data-testid="settings-security-link">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(var(--gold-rgb), 0.1)' }}>
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
                    await apiClient.put(`${API_URL}/auth/profile`, { hide_benefactor_reminder: !checked }, {
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
      <SectionHeader title="Appearance & Navigation" hint="Theme, dock, and navigation preferences." />
      <AppearanceCard isStaff={isStaff} />

      {/* Dashboard View — layout + readiness gauge graphic.
          Hidden for staff since they don't see the benefactor dashboard. */}
      {!isStaff && <DashboardViewCard />}

      {/* Remember-scroll-position toggle. Pref is stored in
          localStorage so it persists across PWA cold-launches AND
          while offline (no server round-trip). */}
      <ScrollRestorationCard />

      {/* Dock Customizer */}
      <Card className="glass-card" data-testid="settings-dock-card">
        <CardContent className="pt-5">
          <DockCustomizer />
        </CardContent>
      </Card>

      {/* Menu Order Customizer — RETIRED May 22 2026 when the
          benefactor menu was consolidated to 4 fixed sections. The
          component file is preserved on disk in case the founder
          chooses to bring per-section reordering back later. */}

      {/* ── Section: Notifications ── */}
      <SectionHeader title="Notifications" hint="Push, in-app, and email preferences." />
      {/* Notification Settings (push notifications) */}
      <NotificationSettings getAuthHeaders={getAuthHeaders} />

      {/* Notification Preferences (granular category controls) */}
      <NotificationPrefsCard />

      <DigestCard />

      {/* Chat auto-scroll threshold — per-user preference applied by
          EstateChatPage when re-opening a channel. Non-staff only
          because staff portals don't surface the ECT. */}
      {!isStaff && <ChatAutoscrollCard />}

      {/* ── Section: Privacy — non-staff only ── */}
      {!isStaff && (
        <>
          <SectionHeader title="Privacy & Data" hint="What we collect and how you control it." />
          <PrivacyCard />
        </>
      )}

      {/* Beta Tester Settings */}
      {user?.is_beta_tester && (
        <>
          <SectionHeader title="Beta Testing" hint="Preferences for beta-only controls." />
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

      {/* Offline diagnostics — opens the on-device readout overlay. Helps
          the user (and support) confirm what the Service Worker actually
          cached, on the real device, with a one-tap "Re-arm offline cache". */}
      <Card className="glass-card" data-testid="settings-offline-diag-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--t)]">Offline diagnostics</p>
              <p className="text-xs text-[var(--t5)]">See what's cached on this device and re-arm offline mode</p>
            </div>
            <Button
              variant="outline"
              onClick={() => window.dispatchEvent(new Event('carryon:open-diagnostics'))}
              data-testid="settings-open-diagnostics"
            >
              <Activity className="w-4 h-4 mr-2" />
              Open
            </Button>
          </div>
        </CardContent>
      </Card>

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

      {/* Footer — hairline divider + breathing room */}
      <div className="pt-4 mt-2" style={{ borderTop: '1px solid var(--b)' }}>
        <div className="text-center pt-6 pb-4">
          <div className="flex items-center justify-center gap-2 text-[var(--t5)] text-sm mb-2">
            <Shield className="w-4 h-4" />
            <span>AES-256 Encrypted · Zero-Knowledge · 2FA Protected</span>
          </div>
          <p className="text-[var(--t5)] text-xs">
            CarryOn™ v1.0.0 · © 2024 CarryOn Inc.
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Two-line section header — large title + 1-line hint. Replaces the tiny
 * uppercase label pattern for better scannability on long Settings pages.
 */
const SectionHeader = ({ title, hint }) => (
  <div className="pt-3 pl-1">
    <h2 className="text-base font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)', letterSpacing: '-0.01em' }}>{title}</h2>
    {hint && <p className="text-xs text-[var(--t5)] mt-0.5">{hint}</p>}
  </div>
);

export default SettingsPage;
