import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

// Detect native app immediately (before React renders) to prevent layout flash
try {
  const isCapacitor = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (isCapacitor) document.body.classList.add('native-app');
} catch {}

// Prevent pinch-to-zoom on iOS PWA/bookmark to make it feel native
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

// Double-tap zoom is prevented via CSS touch-action: manipulation on body.
// No JavaScript touchend handler needed — the previous one blocked iOS keyboard dismiss.

// Mark all future scroll/touchstart listeners as passive by default
// This tells the browser it can start scrolling without waiting for JS
if (typeof EventTarget !== 'undefined') {
  const orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, fn, opts) {
    if ((type === 'touchstart' || type === 'scroll') && opts === undefined) {
      opts = { passive: true };
    }
    return orig.call(this, type, fn, opts);
  };
}


const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
