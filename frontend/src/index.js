import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Prevent iOS overscroll/bounce on fixed header and bottom nav
document.addEventListener('touchmove', function(e) {
  // Allow scrolling inside scrollable content areas
  let target = e.target;
  while (target && target !== document.body) {
    const style = window.getComputedStyle(target);
    const overflow = style.overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && target.scrollHeight > target.clientHeight) {
      // At top and scrolling up, or at bottom and scrolling down — prevent
      if (target.scrollTop <= 0 && e.touches[0].clientY > (target._lastTouchY || 0)) {
        // At top, pulling down — only prevent if already at scroll top
        if (target.scrollTop === 0) return;
      }
      return; // Allow normal scroll inside scrollable areas
    }
    target = target.parentElement;
  }
}, { passive: true });

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
