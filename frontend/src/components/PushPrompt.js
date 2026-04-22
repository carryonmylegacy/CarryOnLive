import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from '../utils/toast';
import axios from 'axios';
import { API_URL } from '../config';

// Detect if running as installed PWA (Home Screen)
const isInstalledPWA = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
};

// Detect if running inside Capacitor native shell
const isCapacitorNative = () => {
  try { return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform(); }
  catch { return false; }
};

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

const PushPrompt = ({ getAuthHeaders }) => {
  const [visible, setVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    // Skip web push entirely in Capacitor native — native push handles this
    if (isCapacitorNative()) return;
    // Require Notification, serviceWorker, AND PushManager
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (localStorage.getItem('carryon_push_prompted')) return;
    if (Notification.permission === 'granted') {
      // Already granted — check if there's an active subscription, register if needed
      (async () => {
        try {
          const reg = await navigator.serviceWorker.getRegistration('/sw-push.js');
          if (reg) {
            const sub = await reg.pushManager.getSubscription();
            if (sub) { localStorage.setItem('carryon_push_prompted', 'true'); return; }
          }
        } catch {}
        // Permission granted but no subscription — silently re-subscribe
        try {
          const registration = await navigator.serviceWorker.register('/sw-push.js');
          // Wait for active state
          const sw = registration.installing || registration.waiting || registration.active;
          if (sw && sw.state !== 'activated') {
            await new Promise((resolve) => {
              const t = setTimeout(resolve, 8000);
              sw.addEventListener('statechange', () => { if (sw.state === 'activated') { clearTimeout(t); resolve(); } });
              if (sw.state === 'activated') { clearTimeout(t); resolve(); }
            });
          }
          const vapidRes = await axios.get(`${API_URL}/push/vapid-public-key`);
          const vapidPublicKey = vapidRes.data.public_key;
          const padding = '='.repeat((4 - (vapidPublicKey.length % 4)) % 4);
          const base64 = (vapidPublicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = window.atob(base64);
          const outputArray = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: outputArray,
          });
          const subJson = subscription.toJSON();
          await axios.post(`${API_URL}/push/subscribe`, {
            endpoint: subJson.endpoint,
            keys: subJson.keys,
          }, getAuthHeaders());
        } catch {}
        localStorage.setItem('carryon_push_prompted', 'true');
      })();
      return;
    }
    if (Notification.permission === 'denied') return;
    // Delay the prompt slightly so it doesn't compete with other modals
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnable = async () => {
    setSubscribing(true);
    try {
      // Platform checks before requesting permission
      if (isCapacitorNative()) {
        toast.error('Push notifications for the native app are managed in your device settings.');
        dismiss();
        return;
      }
      if (!('PushManager' in window)) {
        if (isIOS() && !isInstalledPWA()) {
          toast.error('Push notifications require adding CarryOn to your Home Screen. Tap the Share button, then "Add to Home Screen".');
        } else if (isIOS()) {
          toast.error('Push notifications require iOS 16.4 or later. Please update your device.');
        } else {
          toast.error('Push notifications are not supported in this browser.');
        }
        dismiss();
        return;
      }

      // If the browser has already recorded "denied" for this origin,
      // Notification.requestPermission() silently returns "denied" without
      // re-prompting. Detect up-front and show browser-specific unblock
      // steps instead of a dead-end "permission denied" toast.
      const prePerm = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
      if (prePerm === 'denied') {
        const { notificationUnblockInstruction } = await import('../utils/notificationPermissionHelp');
        toast.error(notificationUnblockInstruction(), { duration: 12000 });
        dismiss();
        return;
      }

      const permResult = await Notification.requestPermission();
      if (permResult !== 'granted') {
        if (permResult === 'denied') {
          const { notificationUnblockInstruction } = await import('../utils/notificationPermissionHelp');
          toast.error(notificationUnblockInstruction(), { duration: 12000 });
        } else {
          toast.error('Notification permission was not granted. Try again and accept the browser prompt.');
        }
        dismiss();
        return;
      }
      // Register and wait for the specific SW to be active
      const registration = await navigator.serviceWorker.register('/sw-push.js');
      // Wait for the SW to reach active state
      const sw = registration.installing || registration.waiting || registration.active;
      if (sw && sw.state !== 'activated' && sw.state !== 'activating') {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('SW activation timeout')), 10000);
          sw.addEventListener('statechange', () => {
            if (sw.state === 'activated') { clearTimeout(timeout); resolve(); }
          });
          if (sw.state === 'activated') { clearTimeout(timeout); resolve(); }
        });
      }

      const vapidRes = await axios.get(`${API_URL}/push/vapid-public-key`);
      if (!vapidRes.data?.public_key) throw new Error('VAPID key missing');
      const vapidPublicKey = vapidRes.data.public_key;

      // Convert VAPID key
      const padding = '='.repeat((4 - (vapidPublicKey.length % 4)) % 4);
      const base64 = (vapidPublicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: outputArray,
      });

      const subJson = subscription.toJSON();
      await axios.post(`${API_URL}/push/subscribe`, {
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      }, getAuthHeaders());

      toast.success('Notifications enabled!');
    } catch (err) {
      console.error('Push subscription error:', err?.name, err?.message, err);
      if (err?.message?.includes('timeout')) {
        toast.error('Service worker took too long to activate. Try closing and reopening the app.');
      } else if (err?.response?.status === 503) {
        toast.error('Push notifications are not yet configured on this server.');
      } else if (err?.name === 'NotAllowedError') {
        toast.error('Notification permission was not granted. Check your device Settings > Notifications.');
      } else if (err?.name === 'AbortError') {
        toast.error('Push subscription was interrupted. Please try again.');
      } else if (err?.name === 'InvalidStateError') {
        toast.error('Push subscription failed. Try removing the app from Home Screen and re-adding it.');
      } else if (err?.message?.includes('VAPID')) {
        toast.error('Push notification server configuration error. Contact support.');
      } else {
        const detail = err?.message || err?.name || 'Unknown error';
        toast.error(`Failed to enable notifications: ${detail}`);
      }
    } finally {
      setSubscribing(false);
      dismiss();
    }
  };

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem('carryon_push_prompted', 'true');
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-sm rounded-2xl px-4 py-3 shadow-2xl"
      style={{ background: 'var(--bg2)', border: '1px solid rgba(212,175,55,0.3)' }}
      data-testid="push-notification-prompt"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.15)' }}>
          <Bell className="w-5 h-5" style={{ color: '#d4af37' }} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white mb-1">Enable Notifications</div>
          <div className="text-xs text-[#8892A6] mb-3">
            Get notified when family members send messages in your Estate Communications.
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleEnable}
              disabled={subscribing}
              size="sm"
              className="h-8 text-xs px-4 rounded-full font-semibold"
              style={{ background: '#d4af37', color: '#0F1629' }}
              data-testid="push-prompt-enable"
            >
              {subscribing ? 'Enabling...' : 'Enable'}
            </Button>
            <Button
              onClick={dismiss}
              variant="ghost"
              size="sm"
              className="h-8 text-xs px-3 rounded-full text-[#8892A6]"
              data-testid="push-prompt-dismiss"
            >
              Not now
            </Button>
          </div>
        </div>
        <button onClick={dismiss} className="text-[#8892A6] hover:text-white p-1">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default PushPrompt;
