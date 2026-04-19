// CarryOn™ — Scrollbar Drag Momentum
// ============================================================================
// Adds iOS-style "toss" inertia to an OverlayScrollbars instance's vertical
// thumb drag. When the user releases the thumb with non-zero velocity, we
// continue scrolling under an exponential decay until velocity dips below
// a threshold, bounds are hit, or the user grabs again.
//
// Matches the feel of the BeneficiaryOrbit spin: exponential friction
// (~0.94 per frame) produces the same visual deceleration curve.

/**
 * Attach pointer-based momentum to the vertical handle of an OverlayScrollbars
 * instance. Returns a disposer.
 */
export function attachDragMomentum(instance) {
  if (!instance) return () => {};
  const elements = instance.elements();
  const handle = elements.scrollbarVertical?.handle;
  const viewport = elements.viewport;
  if (!handle || !viewport) return () => {};

  // Physics tuning — match the BeneficiaryOrbit spin feel.
  const FRICTION = 0.94;           // velocity multiplier per 16ms frame
  const MIN_VELOCITY = 0.04;       // px/ms — below this, stop the animation
  const MIN_TOSS_VELOCITY = 0.15;  // px/ms — below this, don't animate at all
  const SAMPLE_WINDOW_MS = 80;     // velocity averaged over last N ms

  let dragging = false;
  let samples = [];                 // [{ t, scrollTop }]
  let rafId = null;

  const cancelMomentum = () => {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const onPointerDown = () => {
    cancelMomentum();
    dragging = true;
    samples = [{ t: performance.now(), scrollTop: viewport.scrollTop }];
  };

  const onPointerMove = () => {
    if (!dragging) return;
    const now = performance.now();
    samples.push({ t: now, scrollTop: viewport.scrollTop });
    // Keep only samples within the window so velocity is recent
    const cutoff = now - SAMPLE_WINDOW_MS;
    while (samples.length > 2 && samples[0].t < cutoff) samples.shift();
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    if (samples.length < 2) return;

    // Compute velocity from the oldest sample in the window to the newest
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = last.t - first.t;
    if (dt <= 0) return;
    let velocity = (last.scrollTop - first.scrollTop) / dt; // px per ms
    samples = [];

    if (Math.abs(velocity) < MIN_TOSS_VELOCITY) return;

    // Animate with exponential decay until velocity settles or bounds hit
    let lastFrame = performance.now();
    const tick = (now) => {
      const frameDt = now - lastFrame;
      lastFrame = now;
      // Apply friction scaled by frame duration (frame-rate independent)
      const frictionForFrame = Math.pow(FRICTION, frameDt / 16);
      velocity *= frictionForFrame;

      const next = viewport.scrollTop + velocity * frameDt;
      const maxScroll = viewport.scrollHeight - viewport.clientHeight;
      const clamped = Math.max(0, Math.min(next, maxScroll));
      viewport.scrollTop = clamped;

      if (Math.abs(velocity) < MIN_VELOCITY || clamped === 0 || clamped === maxScroll) {
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  };

  handle.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  // Wheel / touch on the viewport should cancel any active momentum
  viewport.addEventListener('wheel', cancelMomentum, { passive: true });
  viewport.addEventListener('touchstart', cancelMomentum, { passive: true });

  return () => {
    handle.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    viewport.removeEventListener('wheel', cancelMomentum);
    viewport.removeEventListener('touchstart', cancelMomentum);
    cancelMomentum();
  };
}

export default attachDragMomentum;
