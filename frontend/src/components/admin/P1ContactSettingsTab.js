import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Phone, Mail, MessageSquare, Save, Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const P1ContactSettingsTab = ({ getAuthHeaders }) => {
  const [settings, setSettings] = useState({ email: '', phone: '', chat_enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await axios.get(`${API_URL}/founder/p1-contact-settings`, getAuthHeaders());
        setSettings(res.data);
      } catch {}
      finally { setLoading(false); }
    };
    fetch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/founder/p1-contact-settings`, settings, getAuthHeaders());
      toast.success('Priority 1 contact settings updated');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>;

  return (
    <div className="space-y-4" data-testid="p1-contact-settings">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4 text-[#F87171]" />
        <h3 className="text-sm font-bold text-[var(--t)] uppercase tracking-wider">Priority 1 Contact Settings</h3>
      </div>
      <p className="text-xs text-[var(--t4)]">
        These settings control the emergency contact information shown on the sealed account screen
        when a transitioned benefactor tries to log in. This is their only lifeline.
      </p>

      <Card className="glass-card">
        <CardContent className="p-5 space-y-4">
          <div>
            <label className="text-[10px] text-[var(--t5)] uppercase tracking-wider font-bold mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3 h-3" /> Email Address
            </label>
            <Input
              value={settings.email}
              onChange={e => setSettings({ ...settings, email: e.target.value })}
              placeholder="founder@carryon.us"
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]"
              data-testid="p1-email-input"
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--t5)] uppercase tracking-wider font-bold mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3 h-3" /> Phone Number
            </label>
            <Input
              value={settings.phone}
              onChange={e => setSettings({ ...settings, phone: e.target.value })}
              placeholder="(808) 585-1156"
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]"
              data-testid="p1-phone-input"
            />
          </div>
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[var(--t5)]" />
              <span className="text-xs font-bold text-[var(--t)]">Live Chat Enabled</span>
            </div>
            <Switch
              checked={settings.chat_enabled}
              onCheckedChange={v => setSettings({ ...settings, chat_enabled: v })}
              data-testid="p1-chat-toggle"
            />
          </div>
          <Button
            className="w-full"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
            disabled={saving}
            onClick={handleSave}
            data-testid="p1-save-btn"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
