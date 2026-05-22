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
              QuickStart Wizard restart — SEPARATE product from the
              Getting Started Guide below. The QW is a 10-step
              conversational onboarding that produces a personalized
              Estate Plan Checklist PDF (saved to the SDV). The
              Getting Started Guide is the long-form, in-app
              walk-through that opens contextual "Getting Started"
              callouts on each pillar page. Per founder mandate
              May 22 2026: must NEVER be conflated.
            */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-[var(--t)] font-medium flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--gold)]" />
                  QuickStart Wizard
                </h4>
                <p className="text-[var(--t5)] text-sm">A 2-minute conversational wizard that generates your personalized Estate Plan Guide PDF. Reopen any time to edit answers and regenerate the guide.</p>
              </div>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap"
                style={{
                  background: 'linear-gradient(135deg, var(--gold), #b8962e)',
                  color: '#080e1a',
                  border: '1px solid rgba(255,255,255,0.10)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                }}
                data-testid="settings-quickstart-open-btn"
                onClick={async () => {
                  try {
                    await apiClient.post(`${API_URL}/quickstart/reopen`, {}, getAuthHeaders());
                  } catch (e) {
                    // Reopen is best-effort — even if it 404s (e.g.,
                    // user never completed the wizard yet) the resume
                    // event still pops the wizard from its current
                    // step.
                  }
                  try { sessionStorage.removeItem('carryon_quickstart_skipped_session'); } catch { /* ignore */ }
                  try { window.dispatchEvent(new CustomEvent('carryon:resume-quickstart')); } catch { /* ignore */ }
                  toast.success('QuickStart Wizard opened — answer or edit your steps to regenerate your guide.');
                }}
              >
                Open Wizard
              </button>
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
