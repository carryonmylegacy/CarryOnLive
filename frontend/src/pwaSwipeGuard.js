// PWA Swipe-Back Guard — "History Trap" with URL tracking
// Must be imported FIRST in index.js, before React or React Router load.
// This ensures our popstate listener registers BEFORE React Router's,
// and stopImmediatePropagation() prevents Router from seeing the event.
//
// Strategy:
//   1. Wrap pushState/replaceState to track the "real" intended URL
//   2. On popstate (swipe-back or history.back), block it and restore the tracked URL
//   3. React Router's normal <Link>/<navigate('/path')> calls use pushState (no popstate),
//      so they work normally and just update our tracker

(function initPWASwipeGuard() {
  if (typeof window === 'undefined') return;

  var isPWA =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (!isPWA) return;

  // Track the last intentionally navigated URL
  var currentHref = window.location.href;

  // Wrap pushState — track URL but let the call through normally
  var origPush = window.history.pushState.bind(window.history);
  window.history.pushState = function (state, title, url) {
    origPush(state, title, url);
    currentHref = window.location.href;
  };

  // Wrap replaceState — same tracking
  var origReplace = window.history.replaceState.bind(window.history);
  window.history.replaceState = function (state, title, url) {
    origReplace(state, title, url);
    currentHref = window.location.href;
  };

  // Capture-phase listener fires BEFORE React Router's bubble-phase listener
  window.addEventListener(
    'popstate',
    function pwaPopstateGuard(e) {
      e.stopImmediatePropagation(); // hide from React Router
      // Restore to the last real URL
      origPush({ _pwaGuard: true }, '', currentHref);
    },
    true // capture phase
  );
})();
