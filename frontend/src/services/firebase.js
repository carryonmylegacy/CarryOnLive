import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent, setUserProperties } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
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
