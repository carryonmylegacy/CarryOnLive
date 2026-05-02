// OfflineAccessCard — Settings → "Enable offline access on this device"
// toggle. Opt-in, PWA-only. Walks the user through enrolling this
// device for offline login (the toggle is hidden entirely in a plain
// browser tab) and stores an encrypted long-lived credential locally.
//
// Behavior:
//   - In a browser tab (isPWA() === false): renders nothing. The
//     entire feature is invisible because the use case (cold-load
//     auth in airplane mode) is irrelevant to a tab that won't even
//     boot when offline.
//   - In an installed PWA, ON: prompts for current password (we need
//     it to derive the encryption key — the JWT alone isn't useful
//     to encrypt with). On confirm, calls /api/auth/offline/enroll,
//     encrypts the returned token with PBKDF2(password+salt) → AES-GCM,
//     stores in IndexedDB. Toast: "Offline access enabled — you can
//     now log in on this device without an internet connection."
//   - In an installed PWA, OFF: confirms intent, calls
//     /api/auth/offline/revoke, clears the local IndexedDB record.

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { isPWA } from '../../utils/isPWA';
import {
  saveOfflineCredential,
  clearAllOfflineCredentials,
  hasAnyOfflineCredential,
} from '../../offline/offlineCredentialCache';

export default function OfflineAccessCard() {
  const { user, getAuthHeaders } = useAuth();
  const [installed] = useState(() => isPWA());
  const [enrolled, setEnrolled] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [password, setPassword] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      // Server-side enrollment count (this device may be one of several)
      const res = await axios.get(`${API_URL}/auth/offline/status`, getAuthHeaders());
      const local = await hasAnyOfflineCredential();
      // Only show "on" if BOTH the server has at least one credential AND
      // the local IndexedDB has it. If they're out of sync (e.g. user
      // revoked from another device) the local clears on next login.
      setEnrolled(Boolean(res.data?.enrolled && local));
    } catch {
      setEnrolled(false);
    } finally {
      setStatusLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // Browser tab — feature is invisible.
  if (!installed) return null;

  const handleEnroll = async () => {
    if (!password) return;
    setEnrolling(true);
    try {
      const res = await axios.post(`${API_URL}/auth/offline/enroll`, {}, getAuthHeaders());
      const { credential_id: credentialId, token, salt } = res.data;
      const identifier = (user?.email || user?.username || '').toLowerCase();
      await saveOfflineCredential({ identifier, password, credentialId, token, salt });
      setEnrolled(true);
      setShowEnrollModal(false);
      setPassword('');
      toast.success('Offline access enabled — you can now sign in on this device without internet.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not enable offline access');
    } finally {
      setEnrolling(false);
    }
  };

  const handleDisable = async () => {
    if (!window.confirm('Turn off offline access? You will need an internet connection to sign in on this device.')) return;
    try {
      await axios.post(`${API_URL}/auth/offline/revoke`, {}, getAuthHeaders());
      await clearAllOfflineCredentials();
      setEnrolled(false);
      toast.success('Offline access disabled.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not disable offline access');
    }
  };

  const handleToggle = (checked) => {
    if (checked) setShowEnrollModal(true);
    else handleDisable();
  };

  return (
    <>
      <Card className="glass-card" data-testid="settings-offline-access-card">
        <CardContent className="pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {enrolled
                ? <Wifi className="w-5 h-5 mt-0.5 text-[var(--gold)]" />
                : <WifiOff className="w-5 h-5 mt-0.5 text-[var(--t4)]" />}
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--t)]">Offline access on this device</p>
                <p className="text-xs font-semibold text-[var(--t4)] mt-1 leading-relaxed">
                  Sign in without internet. Your estate stays available even when you&rsquo;re offline. Only enable this on devices you trust.
                </p>
              </div>
            </div>
            {statusLoading
              ? <Loader2 className="w-5 h-5 animate-spin text-[var(--t4)]" />
              : <Switch
                  checked={enrolled}
                  onCheckedChange={handleToggle}
                  data-testid="settings-offline-access-toggle"
                />}
          </div>
        </CardContent>
      </Card>

      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" data-testid="offline-enroll-modal">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 32px)' }}>
            <h3 className="text-lg font-bold text-[var(--t)] mb-2">Enable offline access</h3>
            <p className="text-sm font-semibold text-[var(--t4)] mb-5 leading-relaxed">
              Re-enter your password. We&rsquo;ll use it to encrypt a sign-in credential that stays only on this device &mdash; never sent to our servers in plain text.
            </p>
            <div className="space-y-3">
              <Label htmlFor="offline-pwd" className="text-xs font-bold text-[var(--t3)]">Current password</Label>
              <Input
                id="offline-pwd"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your CarryOn password"
                data-testid="offline-enroll-password-input"
              />
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setShowEnrollModal(false); setPassword(''); }}
                  className="flex-1"
                  disabled={enrolling}
                  data-testid="offline-enroll-cancel"
                >Cancel</Button>
                <Button
                  onClick={handleEnroll}
                  disabled={!password || enrolling}
                  className="flex-1 gold-button"
                  data-testid="offline-enroll-confirm"
                >{enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enable'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
