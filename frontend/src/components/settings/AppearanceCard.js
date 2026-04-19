import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
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
            onCheckedChange={(checked) => {
              toggleTheme();
              toast.success(checked ? 'Dark mode enabled — saved.' : 'Light mode enabled — saved.');
            }}
            data-testid="settings-theme-toggle"
          />
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
                  localStorage.removeItem('carryon_welcome_guided_shown');
                  try { await axios.post(`${API_URL}/onboarding/reset`, {}, getAuthHeaders()); } catch (e) { /* ignore */ }
                } else {
                  localStorage.setItem('carryon_onboarding_dismissed', 'true');
                  localStorage.setItem('carryon_welcome_guided_shown', 'true');
                  try { await axios.post(`${API_URL}/onboarding/dismiss`, {}, getAuthHeaders()); } catch (e) { /* ignore */ }
                }
                toast.success(checked ? 'Getting Started Guide turned on — saved.' : 'Getting Started Guide hidden — saved.');
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
