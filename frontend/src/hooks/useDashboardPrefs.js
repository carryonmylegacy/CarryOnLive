/**
 * CarryOn — Dashboard View Preferences
 * ============================================================================
 * Per-device UX knobs the user toggles in Settings → Appearance to
 * control the main dashboard surface. Kept in localStorage so
 * preferences travel with the device (same rationale as `offline.mode`
 * and `theme`).
 *
 * Two axes:
 *   • `layout`: how the big blocks are arranged on desktop ≥lg.
 *       - 'tiles-left'    → square tile grid on LEFT, readiness on RIGHT  (default)
 *       - 'tiles-right'   → square tile grid on RIGHT, readiness on LEFT
 *       - 'readiness-top' → readiness dial on TOP, 6 chiclets in a row below
 *     Mobile/PWA layout is unaffected — it always uses the compact
 *     vertical flow that fits a phone-narrow viewport.
 *
 *   • `gauge`: which readiness visualization to draw. This one DOES
 *     follow the user to mobile/PWA because the graphic is universal.
 *       - 'speedometer' → the colored-arc needle dial (default)
 *       - 'circle'      → slim gold-arc circle with serif score (matches
 *                         the `/mockups/dashboard-v2.html` prototype)
 *
 * Both keys emit a `carryon:dashboard-prefs:change` CustomEvent on
 * write so open tabs (Dashboard + Settings) re-render live without a
 * page reload.
 */

import { useEffect, useState } from 'react';

const LAYOUT_KEY = 'carryon_dashboard_layout';
const GAUGE_KEY = 'carryon_dashboard_gauge';

export const LAYOUT_OPTIONS = ['tiles-left', 'tiles-right', 'readiness-top'];
export const GAUGE_OPTIONS = ['speedometer', 'circle'];

const DEFAULTS = { layout: 'tiles-left', gauge: 'speedometer' };
const EVENT_NAME = 'carryon:dashboard-prefs:change';

function readSafe(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v || fallback;
  } catch {
    return fallback;
  }
}

export function getDashboardLayout() {
  const v = readSafe(LAYOUT_KEY, DEFAULTS.layout);
  return LAYOUT_OPTIONS.includes(v) ? v : DEFAULTS.layout;
}

export function getDashboardGauge() {
  const v = readSafe(GAUGE_KEY, DEFAULTS.gauge);
  return GAUGE_OPTIONS.includes(v) ? v : DEFAULTS.gauge;
}

export function setDashboardLayout(layout) {
  if (!LAYOUT_OPTIONS.includes(layout)) return;
  try { localStorage.setItem(LAYOUT_KEY, layout); } catch {}
  try { window.dispatchEvent(new CustomEvent(EVENT_NAME)); } catch {}
}

export function setDashboardGauge(gauge) {
  if (!GAUGE_OPTIONS.includes(gauge)) return;
  try { localStorage.setItem(GAUGE_KEY, gauge); } catch {}
  try { window.dispatchEvent(new CustomEvent(EVENT_NAME)); } catch {}
}

/**
 * React hook that returns the current preferences and a setter for
 * each. Re-renders on localStorage or in-tab dispatch changes.
 */
export function useDashboardPrefs() {
  const [prefs, setPrefs] = useState(() => ({
    layout: getDashboardLayout(),
    gauge: getDashboardGauge(),
  }));

  useEffect(() => {
    const refresh = () => setPrefs({
      layout: getDashboardLayout(),
      gauge: getDashboardGauge(),
    });
    window.addEventListener(EVENT_NAME, refresh);
    // `storage` fires when ANOTHER tab writes — useful for desktop
    // users with Settings open in one tab and Dashboard in another.
    window.addEventListener('storage', (e) => {
      if (e.key === LAYOUT_KEY || e.key === GAUGE_KEY) refresh();
    });
    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return {
    ...prefs,
    setLayout: setDashboardLayout,
    setGauge: setDashboardGauge,
  };
}
