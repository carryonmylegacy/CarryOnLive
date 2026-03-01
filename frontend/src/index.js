import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Prevent iOS WKWebView overscroll bounce (CSS alone doesn't work in Capacitor)
(function() {
  let startY = 0;
  document.addEventListener('touchstart', function(e) {
    startY = e.touches[0].pageY;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    const el = findScrollable(e.target);
    if (!el) {
      e.preventDefault();
      return;
    }
    const dy = e.touches[0].pageY - startY;
    // At top scrolling up, or at bottom scrolling down — block it
    if ((el.scrollTop <= 0 && dy > 0) || (el.scrollTop + el.clientHeight >= el.scrollHeight && dy < 0)) {
      e.preventDefault();
    }
  }, { passive: false });

  function findScrollable(node) {
    while (node && node !== document.body && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const oy = style.overflowY;
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    // Check if body itself is scrollable
    if (document.documentElement.scrollHeight > document.documentElement.clientHeight) {
      return document.documentElement;
    }
    return null;
  }
})();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
