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

  useEffect(() => {
    apiClient.get(`${API_URL}/onboarding/status`, getAuthHeaders()).then(res => {
      setOnboardingVisible(!res.data.dismissed);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
                <h4 className="text-[var(--t)] font-medium">Getting Started Guide</h4>
                <p className="text-[var(--t5)] text-sm">Show the onboarding wizard on your dashboard</p>
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
                  toast.success(checked ? 'Getting Started Guide turned on — saved.' : 'Getting Started Guide hidden — saved.');
                }}
                data-testid="settings-onboarding-toggle"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AppearanceCard;
