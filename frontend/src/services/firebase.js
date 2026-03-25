import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent, setUserProperties } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyAuc7mMRJMr5qLsusi-_XRItoRbYoaYXrY",
  authDomain: "carryon-74e7e.firebaseapp.com",
  projectId: "carryon-74e7e",
  storageBucket: "carryon-74e7e.firebasestorage.app",
  messagingSenderId: "986105602287",
  appId: "1:986105602287:web:28d212431b9d445d907b1a",
  measurementId: "G-60D910V279",
};

let analytics = null;

export function initFirebase() {
  try {
    const app = initializeApp(firebaseConfig);
    analytics = getAnalytics(app);
    return analytics;
  } catch (e) {
    console.warn('[Firebase] Init failed:', e.message);
    return null;
  }
}

export function trackEvent(eventName, params = {}) {
  if (!analytics) return;
  try {
    logEvent(analytics, eventName, params);
  } catch (e) {
    console.warn('[Firebase] Event failed:', e.message);
  }
}

export function setUserProps(props = {}) {
  if (!analytics) return;
  try {
    setUserProperties(analytics, props);
  } catch (e) {
    console.warn('[Firebase] Props failed:', e.message);
  }
}

// Meta Pixel helper — fires fbq() if loaded
export function trackPixel(eventName, params = {}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', eventName, params);
  }
}
