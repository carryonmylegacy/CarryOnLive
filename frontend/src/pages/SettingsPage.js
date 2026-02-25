import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  Settings,
  Moon,
  Sun,
  User,
  Bell,
  Lock,
  LogOut,
  ChevronRight,
  Shield
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';

const SettingsPage = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in max-w-2xl mx-auto" data-testid="settings-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Settings
        </h1>
        <p className="text-[#94a3b8] mt-1">
          Manage your account and preferences
        </p>
      </div>

      {/* Profile Section */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <User className="w-5 h-5 text-[#d4af37]" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#d4af37]/20 flex items-center justify-center text-[#d4af37] text-xl font-bold">
              {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg">{user?.name || 'User'}</h3>
              <p className="text-[#94a3b8] text-sm">{user?.email || ''}</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-[#d4af37]/20 text-[#d4af37] text-xs rounded-full capitalize">
                {user?.role || 'benefactor'}
              </span>
            </div>
          </div>
          
          <Separator className="bg-white/10" />
          
          <Button variant="outline" className="w-full border-white/10 text-white justify-between">
            Edit Profile
            <ChevronRight className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            {theme === 'dark' ? <Moon className="w-5 h-5 text-[#d4af37]" /> : <Sun className="w-5 h-5 text-[#d4af37]" />}
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-white font-medium">Dark Mode</h4>
              <p className="text-[#64748b] text-sm">Use dark theme for the interface</p>
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
          <CardTitle className="text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#d4af37]" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-white font-medium">Email Notifications</h4>
              <p className="text-[#64748b] text-sm">Receive updates via email</p>
            </div>
            <Switch defaultChecked />
          </div>
          
          <Separator className="bg-white/10" />
          
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-white font-medium">Security Alerts</h4>
              <p className="text-[#64748b] text-sm">Get notified of security events</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#d4af37]" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full border-white/10 text-white justify-between">
            Change Password
            <ChevronRight className="w-4 h-4" />
          </Button>
          
          <Button variant="outline" className="w-full border-white/10 text-white justify-between">
            Two-Factor Authentication
            <span className="text-[#10b981] text-sm">Enabled</span>
          </Button>
          
          <Button variant="outline" className="w-full border-white/10 text-white justify-between">
            Active Sessions
            <ChevronRight className="w-4 h-4" />
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
        <div className="flex items-center justify-center gap-2 text-[#64748b] text-sm mb-2">
          <Shield className="w-4 h-4" />
          <span>AES-256 Encrypted · Zero-Knowledge · SOC 2</span>
        </div>
        <p className="text-[#64748b] text-xs">
          CarryOn™ v1.0.0 · © 2024 CarryOn Inc.
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
