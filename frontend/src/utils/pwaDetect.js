// PWA and mobile browser detection utilities

export const isPWA = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
};

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

export const isAndroid = () => /Android/.test(navigator.userAgent);

export const isMobileBrowser = () => {
  if (typeof window === 'undefined') return false;
  return (isIOS() || isAndroid()) && !isPWA();
};

export const isSafari = () => /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/.test(navigator.userAgent);

export const isChrome = () => /Chrome|CriOS/.test(navigator.userAgent);
