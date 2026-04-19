// CarryOn™ — Scrollbar Drag Momentum
// ============================================================================
// Adds iOS-style "toss" inertia to an OverlayScrollbars instance's vertical
// thumb drag. Physics model matches iOS UIScrollView decelerationRate:
//
//   v(t) = v0 * exp(-t / τ)
//
// where τ (tau) is the time constant. iOS "normal" decelerationRate ≈ 0.998
// per ms ⇒ τ ≈ 500ms. We use τ ≈ 325ms for a slightly tighter "quick" feel
// that matches the rest of the CarryOn UI (BeneficiaryOrbit spin).
//
// Two key refinements over the naive version:
//   1. Sub-pixel accumulator — `scrollTop` is integer-quantized in every
//      browser; writing integers each frame from a float velocity produces
//      visible stick-slip. We keep a float position and round only at the
//      write boundary, so sub-pixel velocity still advances the scroll
//      across frames.
//   2. Time-constant decay — frame-rate independent AND physically correct,
//      so the tail of the toss eases out smoothly rather than snapping at
//      the MIN_VELOCITY threshold.

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

  // Physics tuning — iOS-style time-constant exponential decay.
  const TAU_MS = 325;              // time constant; smaller = snappier stop
  const MIN_VELOCITY = 0.02;       // px/ms — below this, stop the animation
  const MIN_TOSS_VELOCITY = 0.12;  // px/ms — below this, don't animate at all
  const SAMPLE_WINDOW_MS = 80;     // velocity averaged over last N ms
  const MAX_VELOCITY = 6.0;        // px/ms — clamp extreme flicks

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

    // Compute velocity from the oldest sample in the window to the newest.
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = last.t - first.t;
    samples = [];
    if (dt <= 0) return;

    let velocity = (last.scrollTop - first.scrollTop) / dt; // px per ms
    if (Math.abs(velocity) < MIN_TOSS_VELOCITY) return;
    // Clamp runaway flicks so the toss always feels natural
    if (velocity > MAX_VELOCITY) velocity = MAX_VELOCITY;
    if (velocity < -MAX_VELOCITY) velocity = -MAX_VELOCITY;

    // Sub-pixel accumulator: float position advances smoothly even when
    // integer scrollTop writes would otherwise quantize the motion.
    let position = viewport.scrollTop;
    let lastFrame = performance.now();

    const tick = (now) => {
      const frameDt = now - lastFrame;
      lastFrame = now;

      // True exponential decay: v *= exp(-dt / τ)
      // Frame-rate independent and physically matches iOS UIScrollView.
      const decay = Math.exp(-frameDt / TAU_MS);
      // Integrate position using the AVERAGE velocity across this frame,
      // not the end-velocity — this is the trapezoidal rule and removes
      // the micro-lurch you get with simple Euler integration.
      const vStart = velocity;
      const vEnd = velocity * decay;
      const avgV = (vStart + vEnd) * 0.5;
      position += avgV * frameDt;
      velocity = vEnd;

      const maxScroll = viewport.scrollHeight - viewport.clientHeight;
      if (position < 0) { position = 0; velocity = 0; }
      else if (position > maxScroll) { position = maxScroll; velocity = 0; }

      // Round only at the write boundary; the float `position` still
      // advances sub-pixel-smoothly across frames.
      viewport.scrollTop = Math.round(position);

      if (Math.abs(velocity) < MIN_VELOCITY || position <= 0 || position >= maxScroll) {
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
