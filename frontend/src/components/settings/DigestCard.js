import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';
import { Bell, Mail, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const DigestCard = () => {
  const { user, getAuthHeaders } = useAuth();

  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestSending, setDigestSending] = useState(false);
  const [digestFrequency, setDigestFrequency] = useState('weekly');
  const [digestSections, setDigestSections] = useState({});
  const [digestSectionLabels, setDigestSectionLabels] = useState({});
  const [additionalRecipients, setAdditionalRecipients] = useState([]);
  const [newRecipientEmail, setNewRecipientEmail] = useState('');
  const [digestSaving, setDigestSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiClient.get(`${API_URL}/digest/preferences`, getAuthHeaders()).then(res => {
      const prefs = res.data || {};
      setWeeklyDigest(prefs.enabled || false);
      setDigestFrequency(prefs.frequency || 'weekly');
      setDigestSections(prefs.sections || {});
      setDigestSectionLabels(prefs.section_labels || {});
      setAdditionalRecipients(prefs.additional_recipients || []);
    }).catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveDigestPrefs = useCallback(async (updates) => {
    setDigestSaving(true);
    try {
      const payload = { ...updates };
      if (updates.frequency) setDigestFrequency(updates.frequency);
      if (updates.sections) setDigestSections(updates.sections);
      await apiClient.put(`${API_URL}/digest/preferences`, payload, getAuthHeaders());
    } catch (e) { toast.error('Failed to update digest preferences'); }
    finally { setDigestSaving(false); }
  }, [getAuthHeaders]);

  const toggleDigest = useCallback(async (checked) => {
    setDigestLoading(true);
    try {
      await apiClient.put(`${API_URL}/digest/preferences`, { enabled: checked }, getAuthHeaders());
      setWeeklyDigest(checked);
    } catch (e) { toast.error('Failed to update digest settings'); }
    finally { setDigestLoading(false); }
  }, [getAuthHeaders]);

  const addRecipient = useCallback(async () => {
    const email = newRecipientEmail.trim();
    if (!email || additionalRecipients.includes(email)) return;
    setDigestSaving(true);
    try {
      const updated = [...additionalRecipients, email];
      await apiClient.put(`${API_URL}/digest/preferences`, { additional_recipients: updated }, getAuthHeaders());
      setAdditionalRecipients(updated);
      setNewRecipientEmail('');
    } catch { toast.error('Failed to add recipient'); }
    finally { setDigestSaving(false); }
  }, [newRecipientEmail, additionalRecipients, getAuthHeaders]);

  const removeRecipient = useCallback(async (email) => {
    setDigestSaving(true);
    try {
      const updated = additionalRecipients.filter(e => e !== email);
      await apiClient.put(`${API_URL}/digest/preferences`, { additional_recipients: updated }, getAuthHeaders());
      setAdditionalRecipients(updated);
    } catch { toast.error('Failed to remove recipient'); }
    finally { setDigestSaving(false); }
  }, [additionalRecipients, getAuthHeaders]);

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-[var(--t)] flex items-center gap-2">
          <Bell className="w-5 h-5 text-[var(--gold)]" />
          Notifications & Digest
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Master Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-[var(--t)] font-medium flex items-center gap-2">
              <Mail className="w-4 h-4 text-[var(--t4)]" />
              Estate Health Digest
            </h4>
            <p className="text-[var(--t5)] text-sm">
              {user?.role === 'admin' ? 'Founder analytics, subscriptions & platform health'
               : user?.role === 'operator' ? (user?.operator_role === 'manager' ? 'Queue status, team performance & priorities' : 'Your assigned tasks & queue counts')
               : "Automated status update email with your estate's health"}
            </p>
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

        {weeklyDigest && (
          <div className="space-y-4 pl-1 pt-1">
            {/* Frequency */}
            <div>
              <label className="text-[var(--t)] text-sm font-medium mb-2 block">Frequency</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'biweekly', label: 'Bi-weekly' },
                  { value: 'monthly', label: 'Monthly' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => saveDigestPrefs({ frequency: opt.value })}
                    disabled={digestSaving}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                      digestFrequency === opt.value
                        ? 'bg-[var(--gold)] text-[#0b1120] border-[var(--gold)]'
                        : 'bg-[var(--card)] text-[var(--t4)] border-[var(--b)] hover:border-[var(--gold)]'
                    }`}
                    data-testid={`digest-freq-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Separator className="bg-[var(--b)]" />

            {/* Sections */}
            <div>
              <label className="text-[var(--t)] text-sm font-medium mb-3 block">Content Sections</label>
              <div className="space-y-3">
                {Object.keys(digestSections).map(key => {
                  const labels = digestSectionLabels[key];
                  if (!labels) return null;
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <div>
                        <p className="text-[var(--t)] text-sm font-medium">{labels[0]}</p>
                        <p className="text-[var(--t5)] text-xs">{labels[1]}</p>
                      </div>
                      <Switch
                        checked={digestSections[key] !== false}
                        onCheckedChange={(val) => saveDigestPrefs({ sections: { ...digestSections, [key]: val } })}
                        disabled={digestSaving}
                        data-testid={`digest-section-${key}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator className="bg-[var(--b)]" />

            {/* Recipients */}
            <div>
              <label className="text-[var(--t)] text-sm font-medium mb-3 block">Recipients</label>
              <div className="space-y-2">
                <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--card)] border border-[var(--b)]">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-[var(--gold)]" />
                    <span className="text-[var(--t)] text-sm">{user?.email}</span>
                  </div>
                  <span className="text-[var(--t5)] text-xs font-medium">Primary</span>
                </div>

                {additionalRecipients.map((email, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--card)] border border-[var(--b)]">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-[var(--t4)]" />
                      <span className="text-[var(--t)] text-sm">{email}</span>
                    </div>
                    <button
                      onClick={() => removeRecipient(email)}
                      disabled={digestSaving}
                      className="text-red-400 hover:text-red-300 p-1 rounded transition-colors"
                      data-testid={`remove-recipient-${i}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={newRecipientEmail}
                    onChange={(e) => setNewRecipientEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
                    className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm flex-1"
                    data-testid="digest-add-recipient-input"
                  />
                  <Button
                    onClick={addRecipient}
                    disabled={digestSaving || !newRecipientEmail.trim()}
                    variant="outline"
                    size="sm"
                    className="border-[var(--gold)] text-[var(--gold)] hover:bg-[var(--gold)] hover:text-[#0b1120] whitespace-nowrap"
                    data-testid="digest-add-recipient-btn"
                  >
                    {digestSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : '+ Add'}
                  </Button>
                </div>
              </div>
            </div>

            <Separator className="bg-[var(--b)]" />

            {/* Send Update Now */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={async () => {
                  setDigestSending(true);
                  try {
                    await apiClient.post(`${API_URL}/digest/preview-enhanced`, {}, getAuthHeaders());
                    toast.success(`Update sent to ${[user?.email, ...additionalRecipients].filter(Boolean).join(', ')}`);
                  } catch (e) {
                    toast.error('Could not send update');
                  } finally { setDigestSending(false); }
                }}
                disabled={digestSending}
                className="bg-[var(--gold)] text-[#0b1120] hover:bg-[var(--gold)]/90 font-semibold text-sm"
                data-testid="digest-send-now-btn"
              >
                {digestSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                Send Update Now
              </Button>
            </div>
          </div>
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
  );
};

export default DigestCard;
