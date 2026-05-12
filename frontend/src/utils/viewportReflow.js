/**
 * viewportReflow — fixes two known iOS Safari / PWA bugs related to
 * viewport units (`vw`, `vh`, `dvh`) failing to update on rotation.
 *
 * Bug A: in iOS 15-17 PWA standalone mode, `vw` and `vh` values are
 *        sometimes cached at app launch and don't refresh on rotation.
 *        Symptom: fonts that use `clamp(..., 3vw, ...)` grow on landscape
 *        but don't shrink back to the original size on portrait.
 *
 * Bug B: scroll containers with `height: 100dvh` occasionally don't
 *        recompute on rotation, leaving content that overflows but can't
 *        be scrolled. Particularly bad after a 30+ second background task
 *        (xAI generation) where iOS may have suspended layout work.
 *
 * Fix: on every resize / orientationchange:
 *   1. Publish actual `window.innerWidth` / `window.innerHeight` as
 *      `--app-vw` and `--app-vh` CSS custom properties (in px). Components
 *      that need rotation-reactive sizing can use these instead of `vw`/`vh`.
 *   2. Force a layout reflow by reading `documentElement.offsetHeight` —
 *      this nudges Safari's layout engine to recompute viewport-derived
 *      values, unstuck `dvh` containers, and reset stale font sizes.
 *
 * Idempotent: calling install twice is a no-op.
 */

let installed = false;

export default function installViewportReflow() {
  if (installed) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;

  const update = () => {
    const w = window.innerWidth || 0;
    const h = window.innerHeight || 0;
    const root = document.documentElement;
    if (!root) return;
    // Publish px-equivalent of 1% viewport so CSS can use `calc(var(--app-vw) * 3)`
    // in places where `3vw` is unreliable.
    root.style.setProperty('--app-vw', `${w * 0.01}px`);
    root.style.setProperty('--app-vh', `${h * 0.01}px`);
    root.style.setProperty('--app-100vw', `${w}px`);
    root.style.setProperty('--app-100vh', `${h}px`);
    // Force a HARD layout reflow. Two-step:
    //   1) Touch body.minHeight to invalidate the body box-model cache.
    //   2) Read documentElement.offsetHeight (sync layout flush).
    // This is the documented workaround for the iOS PWA vw/vh stale-cache
    // bug that survives a simple offsetHeight read after orientationchange.
    if (document.body) {
      const prevMin = document.body.style.minHeight;
      document.body.style.minHeight = '0px';
      // eslint-disable-next-line no-unused-expressions
      root.offsetHeight;
      document.body.style.minHeight = prevMin;
    }
  };

  // Initial values so CSS can rely on the vars from first paint.
  update();

  // Debounce orientationchange a hair so iOS reports the FINAL post-rotation
  // dimensions (it sometimes fires the event mid-rotation with intermediate
  // values).
  let rotateTimer = null;
  const onRotate = () => {
    clearTimeout(rotateTimer);
    rotateTimer = setTimeout(update, 80);
  };

  window.addEventListener('resize', update, { passive: true });
  window.addEventListener('orientationchange', onRotate, { passive: true });
  // visibilitychange catches the case where the PWA was suspended in the
  // background during rotation — iOS doesn't always fire `resize` on resume.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') update();
  });
}
