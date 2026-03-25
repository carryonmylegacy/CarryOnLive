import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Moon, Sun } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const AppearanceCard = ({ isStaff }) => {
  const { getAuthHeaders } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [onboardingVisible, setOnboardingVisible] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/onboarding/status`, getAuthHeaders()).then(res => {
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
            onCheckedChange={toggleTheme}
            data-testid="settings-theme-toggle"
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-[var(--t)] font-medium">Auto-Logout Timer</h4>
            <p className="text-[var(--t5)] text-sm">Log out after being away for this long</p>
          </div>
          <select
            value={localStorage.getItem('carryon_auto_logout_minutes') || '5'}
            onChange={(e) => localStorage.setItem('carryon_auto_logout_minutes', e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-[var(--s)] border border-[var(--b)] text-[var(--t)]"
            data-testid="auto-logout-select"
          >
            <option value="1">1 min</option>
            <option value="3">3 min</option>
            <option value="5">5 min</option>
            <option value="10">10 min</option>
            <option value="15">15 min</option>
          </select>
        </div>
        {!isStaff && (
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
                  try { await axios.post(`${API_URL}/onboarding/reset`, {}, getAuthHeaders()); } catch (e) { /* ignore */ }
                } else {
                  localStorage.setItem('carryon_onboarding_dismissed', 'true');
                  try { await axios.post(`${API_URL}/onboarding/dismiss`, {}, getAuthHeaders()); } catch (e) { /* ignore */ }
                }
              }}
              data-testid="settings-onboarding-toggle"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AppearanceCard;
