import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bell, BellOff, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Convert URL-safe base64 to Uint8Array for VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const NotificationSettings = ({ getAuthHeaders }) => {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    checkPushSupport();
  }, []);

  const checkPushSupport = async () => {
    // Check if push is supported
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setIsSupported(false);
      setLoading(false);
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission);

    // Check if already subscribed
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw-push.js');
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      }
    } catch (err) {
      console.error('Error checking subscription:', err);
    }
    setLoading(false);
  };

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw-push.js');
      await navigator.serviceWorker.ready;
      return registration;
    } catch (err) {
      console.error('Service worker registration failed:', err);
      throw err;
    }
  };

  const subscribe = async () => {
    setSubscribing(true);
    try {
      // Request notification permission
      const permResult = await Notification.requestPermission();
      setPermission(permResult);
      
      if (permResult !== 'granted') {
        toast.error('Notification permission denied');
        setSubscribing(false);
        return;
      }

      // Register service worker
      const registration = await registerServiceWorker();

      // Get VAPID public key from server
      const vapidRes = await axios.get(`${API_URL}/push/vapid-public-key`);
      const vapidPublicKey = vapidRes.data.public_key;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      // Send subscription to backend
      const subJson = subscription.toJSON();
      await axios.post(`${API_URL}/push/subscribe`, {
        endpoint: subJson.endpoint,
        keys: subJson.keys
      }, getAuthHeaders());

      setIsSubscribed(true);
      // toast removed
    } catch (err) {
      console.error('Subscription error:', err);
      toast.error('Failed to enable notifications');
    } finally {
      setSubscribing(false);
    }
  };

  const unsubscribe = async () => {
    setSubscribing(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw-push.js');
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          // Unsubscribe from browser
          await subscription.unsubscribe();
          
          // Remove from backend
          const subJson = subscription.toJSON();
          await axios.delete(`${API_URL}/push/unsubscribe`, {
            ...getAuthHeaders(),
            data: {
              endpoint: subJson.endpoint,
              keys: subJson.keys
            }
          });
        }
      }
      setIsSubscribed(false);
      // toast removed
    } catch (err) {
      console.error('Unsubscribe error:', err);
      toast.error('Failed to disable notifications');
    } finally {
      setSubscribing(false);
    }
  };

  const handleToggle = () => {
    if (isSubscribed) {
      unsubscribe();
    } else {
      subscribe();
    }
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-5 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" />
        </CardContent>
      </Card>
    );
  }

  if (!isSupported) {
    return (
      <Card className="glass-card">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--s)]">
              <BellOff className="w-5 h-5 text-[var(--t5)]" />
            </div>
            <div>
              <h3 className="font-bold text-[var(--t)]">Push Notifications</h3>
              <p className="text-sm text-[var(--t5)]">Not supported in this browser</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card" data-testid="notification-settings">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ 
                background: isSubscribed 
                  ? 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.15))' 
                  : 'var(--s)' 
              }}
            >
              {isSubscribed ? (
                <Bell className="w-5 h-5 text-[var(--gn2)]" />
              ) : (
                <BellOff className="w-5 h-5 text-[var(--t5)]" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-[var(--t)]">Push Notifications</h3>
              <p className="text-sm text-[var(--t4)]">
                {isSubscribed 
                  ? 'You\'ll receive alerts for messages, DTS updates, and more' 
                  : 'Enable to receive important alerts'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {subscribing && <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)]" />}
            <Switch
              checked={isSubscribed}
              onCheckedChange={handleToggle}
              disabled={subscribing || permission === 'denied'}
              data-testid="notification-toggle"
            />
          </div>
        </div>
        
        {permission === 'denied' && (
          <div className="mt-3 p-3 rounded-xl bg-[var(--rdbg)] border border-[var(--rd)]/20">
            <p className="text-sm text-[var(--rd)] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Notifications blocked. Please enable in browser settings.
            </p>
          </div>
        )}
        
        {isSubscribed && (
          <div className="mt-3 p-3 rounded-xl bg-[var(--gnbg)] border border-[var(--gn2)]/20">
            <p className="text-sm text-[var(--gn2)] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              You'll receive notifications for:
            </p>
            <ul className="mt-2 text-xs text-[var(--t4)] space-y-1 ml-6">
              <li>• Support message replies</li>
              <li>• DTS quote updates</li>
              <li>• Beneficiary invitation acceptances</li>
              <li>• Transition status changes</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NotificationSettings;
