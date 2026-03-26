// PWA and mobile browser detection utilities

const isNativeApp = () => {
  try { return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform(); }
  catch { return false; }
};

export const isPWA = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
};

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

export const isAndroid = () => /Android/.test(navigator.userAgent);

export const isMobileBrowser = () => {
  if (typeof window === 'undefined') return false;
  if (isNativeApp()) return false;
  return (isIOS() || isAndroid()) && !isPWA();
};

export const isSafari = () => /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/.test(navigator.userAgent);

export const isChrome = () => /Chrome|CriOS/.test(navigator.userAgent);
