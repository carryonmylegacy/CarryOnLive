import React, { useState, useEffect } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Moon, Sun, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const AppearanceCard = ({ isStaff }) => {
  const { getAuthHeaders } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  // The QuickStart tile on the Dashboard is controlled by the same
  // `carryon_quickstart_tile_dismissed` localStorage flag the tile's
  // own "X" dismiss button writes. Toggle ON = tile visible (flag
  // removed); Toggle OFF = tile hidden (flag set). The dashboard
  // listens for `carryon:quickstart-tile-visibility-changed` to
  // reactively re-render without a page reload.
  const [quickstartTileVisible, setQuickstartTileVisible] = useState(() => {
    try { return localStorage.getItem('carryon_quickstart_tile_dismissed') !== '1'; }
    catch { return true; }
  });
  // "Welcome to Your Estate" — the third onboarding tile that
  // appears for users who are BOTH benefactor AND beneficiary,
  // explaining how to switch between the two portal views. Hidden
  // via `localStorage.carryon_welcome_tile_dismissed` from the
  // tile's own X button.
  const [welcomeTileVisible, setWelcomeTileVisible] = useState(() => {
    try { return localStorage.getItem('carryon_welcome_tile_dismissed') !== 'true'; }
    catch { return true; }
  });
  // Reflect the "Hide all Getting Started prompts for today" master
  // gate set from the dashboard's gold pill. When active, expose a
  // "Show again now" reset so the user can re-enable the whole group
  // before midnight without leaving Settings.
  const computeHiddenUntil = () => {
    try {
      const until = localStorage.getItem('carryon_onboarding_hidden_until');
      if (!until) return null;
      const t = new Date(until).getTime();
      return Number.isFinite(t) && t > Date.now() ? until : null;
    } catch { return null; }
  };
  const [hiddenUntil, setHiddenUntil] = useState(computeHiddenUntil);

  useEffect(() => {
    apiClient.get(`${API_URL}/onboarding/status`, getAuthHeaders()).then(res => {
      setOnboardingVisible(!res.data.dismissed);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check the master gate when the user re-focuses the Settings
  // tab (it may have been cleared/set from another tab or by midnight
  // elapsing while Settings was idle).
  useEffect(() => {
    const recheck = () => setHiddenUntil(computeHiddenUntil());
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    window.addEventListener('carryon:onboarding-hidden-changed', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
      window.removeEventListener('carryon:onboarding-hidden-changed', recheck);
    };
  }, []);

  // Helper: friendly local-time label for the next-midnight reset.
  const formatResetTime = (iso) => {
    try {
      const d = new Date(iso);
      // Local-time formatting — falls back to ISO if Intl is missing.
      return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch { return iso; }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-[var(--t)] flex items-center gap-2">
          {theme === 'dark' ? <Moon className="w-5 h-5 text-[var(--gold)]" /> : <Sun className="w-5 h-5 text-[var(--gold)]" />}
          Appearance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-[var(--t)] font-medium">Dark Mode</h4>
            <p className="text-[var(--t5)] text-sm">Use dark theme for the interface</p>
          </div>
          <Switch
            checked={theme === 'dark'}
            onCheckedChange={(checked) => {
              toggleTheme();
              toast.success(checked ? 'Dark mode enabled — saved.' : 'Light mode enabled — saved.');
            }}
            data-testid="settings-theme-toggle"
          />
        </div>
        {!isStaff && (
          <>
            {/*
              QuickStart Wizard tile visibility — SEPARATE product from
              the Getting Started Guide below. Toggle ON re-shows the
              QuickStart tile on the Dashboard (View PDF, Edit &
              regenerate). Toggle OFF hides it. The tile itself houses
              the wizard launch — there is no separate "Open Wizard"
              button per founder mandate Feb 26 2026.
            */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-[var(--t)] font-medium flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--gold)]" />
                  QuickStart Tile on Dashboard
                </h4>
                <p className="text-[var(--t5)] text-sm">Show the QuickStart Wizard tile on your dashboard so you can open the guide PDF or edit your answers anytime.</p>
              </div>
              <Switch
                checked={quickstartTileVisible}
                onCheckedChange={(checked) => {
                  setQuickstartTileVisible(checked);
                  try {
                    if (checked) {
                      localStorage.removeItem('carryon_quickstart_tile_dismissed');
                    } else {
                      localStorage.setItem('carryon_quickstart_tile_dismissed', '1');
                    }
                  } catch { /* ignore */ }
                  try {
                    window.dispatchEvent(new CustomEvent('carryon:quickstart-tile-visibility-changed', { detail: { visible: checked } }));
                  } catch { /* ignore */ }
                  toast.success(checked ? 'QuickStart tile shown on dashboard — saved.' : 'QuickStart tile hidden — saved.');
                }}
                data-testid="settings-quickstart-tile-toggle"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-[var(--t)] font-medium">Setup Checklist</h4>
                <p className="text-[var(--t5)] text-sm">Show the 8-step setup wizard on your dashboard</p>
              </div>
              <Switch
                checked={onboardingVisible}
                onCheckedChange={async (checked) => {
                  setOnboardingVisible(checked);
                  if (checked) {
                    localStorage.removeItem('carryon_onboarding_dismissed');
                    localStorage.removeItem('carryon_welcome_guided_shown');
                    try { await apiClient.post(`${API_URL}/onboarding/reset`, {}, getAuthHeaders()); } catch (e) { /* ignore */ }
                  } else {
                    localStorage.setItem('carryon_onboarding_dismissed', 'true');
                    localStorage.setItem('carryon_welcome_guided_shown', 'true');
                    try { await apiClient.post(`${API_URL}/onboarding/dismiss`, { hide_resume_banner: true }, getAuthHeaders()); } catch (e) { /* ignore */ }
                  }
                  toast.success(checked ? 'Setup Checklist turned on — saved.' : 'Setup Checklist hidden — saved.');
                }}
                data-testid="settings-onboarding-toggle"
              />
            </div>
            {/*
              "Welcome to Your Estate" tile — the third onboarding
              prompt, shown only to users who hold BOTH a benefactor
              AND beneficiary role (its content teaches them to flip
              between the two portal views). Toggle ON re-enables it
              on the next dashboard render; OFF hides it the same way
              the tile's own X dismiss does.
            */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-[var(--t)] font-medium">Welcome to Your Estate Tile</h4>
                <p className="text-[var(--t5)] text-sm">Reminder that explains how to switch between your Benefactor and Beneficiary views. Only appears if your account holds both roles.</p>
              </div>
              <Switch
                checked={welcomeTileVisible}
                onCheckedChange={(checked) => {
                  setWelcomeTileVisible(checked);
                  try {
                    if (checked) {
                      localStorage.removeItem('carryon_welcome_tile_dismissed');
                    } else {
                      localStorage.setItem('carryon_welcome_tile_dismissed', 'true');
                    }
                  } catch { /* ignore */ }
                  try {
                    window.dispatchEvent(new CustomEvent('carryon:welcome-tile-visibility-changed', { detail: { visible: checked } }));
                  } catch { /* ignore */ }
                  toast.success(checked ? 'Welcome tile shown on dashboard — saved.' : 'Welcome tile hidden — saved.');
                }}
                data-testid="settings-welcome-tile-toggle"
              />
            </div>
            {/*
              "Hide all Getting Started prompts for today" reset —
              visible ONLY when the master gate set by the dashboard's
              gold pill is still active. Lets the user un-hide the
              whole group before midnight without ever leaving
              Settings.
            */}
            {hiddenUntil && (
              <div
                className="flex items-center justify-between gap-3 rounded-xl p-3"
                data-testid="settings-onboarding-hidden-banner"
                style={{
                  background: 'linear-gradient(135deg, rgba(var(--gold-rgb), 0.10), rgba(var(--gold-rgb), 0.04))',
                  border: '1px solid rgba(var(--gold-rgb), 0.30)',
                }}
              >
                <div className="min-w-0">
                  <h4 className="text-[var(--t)] font-medium">Onboarding prompts paused</h4>
                  <p className="text-[var(--t5)] text-xs">
                    Hidden until {formatResetTime(hiddenUntil)}. They'll reappear automatically tomorrow.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="settings-onboarding-show-again"
                  onClick={() => {
                    try { localStorage.removeItem('carryon_onboarding_hidden_until'); } catch { /* ignore */ }
                    setHiddenUntil(null);
                    try { window.dispatchEvent(new CustomEvent('carryon:onboarding-hidden-changed', { detail: { hidden: false } })); } catch { /* ignore */ }
                    toast.success('Getting Started prompts will appear again on your dashboard.');
                  }}
                  className="flex-shrink-0 px-4 py-2 rounded-full text-xs lg:text-sm font-bold transition-all active:scale-[0.96] lg:hover:scale-[1.03]"
                  style={{
                    background: 'linear-gradient(135deg, #d4af37, #b8962e)',
                    color: '#181818',
                    border: '1px solid rgba(255,255,255,0.18)',
                    boxShadow: '0 4px 12px rgba(var(--gold-rgb), 0.25)',
                  }}
                >
                  Show again now
                </button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AppearanceCard;
