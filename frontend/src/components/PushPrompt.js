import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from '../utils/toast';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PushPrompt = ({ getAuthHeaders }) => {
  const [visible, setVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    // Only show if: browser supports push, not already asked, not already subscribed
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (localStorage.getItem('carryon_push_prompted')) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;
    // Delay the prompt slightly so it doesn't compete with other modals
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleEnable = async () => {
    setSubscribing(true);
    try {
      const permResult = await Notification.requestPermission();
      if (permResult !== 'granted') {
        toast.error('Notification permission denied');
        dismiss();
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw-push.js');
      await navigator.serviceWorker.ready;

      const vapidRes = await axios.get(`${API_URL}/push/vapid-public-key`);
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
      console.error('Push subscription error:', err);
      toast.error('Failed to enable notifications');
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
      style={{ background: '#1A2236', border: '1px solid rgba(212,175,55,0.3)' }}
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
