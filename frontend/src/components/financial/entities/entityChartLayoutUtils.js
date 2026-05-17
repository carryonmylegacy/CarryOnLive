/**
 * EntityOrgChart — layout reset + clean-up utilities.
 *
 * Extracted from EntityOrgChart.js during Monolith Reduction 4/6 (Feb 2026).
 * Pure functions that manipulate localStorage position-override state.
 * Imported by `EntitiesSection.js` (Reset button) and re-exported from
 * EntityOrgChart.js for backward-compat with any other consumers.
 */
import { POS_KEY, ENTITY_W, ENTITY_H, COL_GAP, PADDING } from './entityChartConstants';

// Reset helper exported for the section header. Clears any drag overrides
// for this estate so the chart falls back to the auto-layout.
export function resetEntityChartPositions(estateId) {
  try { window.localStorage?.removeItem(POS_KEY(estateId)); } catch { /* ignore */ }
}

/**
 * Clean Up — snap every tile to a logical grid based on its current
 * relative positioning. We:
 *   1. Cluster tiles into horizontal rows: tiles whose Y is within
 *      ROW_BAND of an existing band collapse into that band's average Y.
 *   2. Within each band, sort tiles by current X and re-distribute them
 *      with uniform COL_GAP horizontal spacing, centered on the band's
 *      average X.
 *   3. Snap each final coord to the nearest 20px so everything aligns.
 *
 * Persists the new positions immediately and returns them so callers
 * can bump a re-mount key if they want a fresh animation.
 */
export function cleanUpEntityChartPositions(estateId, currentPositionsByKey, nodeMetaByKey) {
  if (!currentPositionsByKey || Object.keys(currentPositionsByKey).length === 0) {
    // Nothing to do — let the auto-layout drive.
    try { window.localStorage?.removeItem(POS_KEY(estateId)); } catch { /* ignore */ }
    return {};
  }
  const ROW_BAND = 60; // px
  const SNAP = 20;     // px
  const entries = Object.entries(currentPositionsByKey).map(([k, p]) => {
    const meta = nodeMetaByKey[k] || { w: ENTITY_W, h: ENTITY_H };
    return { key: k, x: p.x, y: p.y, w: meta.w, h: meta.h };
  });
  // Sort by Y to make banding deterministic
  entries.sort((a, b) => a.y - b.y);
  const bands = []; // [{y_avg, members:[entry]}]
  entries.forEach((e) => {
    const center = e.y + e.h / 2;
    const band = bands.find((b) => Math.abs(b.y_avg - center) <= ROW_BAND);
    if (band) {
      band.members.push(e);
      band.y_avg = (band.y_avg * (band.members.length - 1) + center) / band.members.length;
    } else {
      bands.push({ y_avg: center, members: [e] });
    }
  });
  // Within each band, lay out left-to-right by current X
  const out = {};
  bands.forEach((b) => {
    const members = [...b.members].sort((m1, m2) => m1.x - m2.x);
    const totalW = members.reduce((s, m) => s + m.w, 0) + COL_GAP * (members.length - 1);
    const avgX = members.reduce((s, m) => s + (m.x + m.w / 2), 0) / members.length;
    let cursor = avgX - totalW / 2;
    if (cursor < PADDING) cursor = PADDING;
    members.forEach((m) => {
      const x = Math.round(cursor / SNAP) * SNAP;
      const y = Math.round((b.y_avg - m.h / 2) / SNAP) * SNAP;
      out[m.key] = { x: Math.max(PADDING, x), y: Math.max(PADDING, y) };
      cursor += m.w + COL_GAP;
    });
  });
  try { window.localStorage?.setItem(POS_KEY(estateId), JSON.stringify(out)); } catch { /* quota */ }
  return out;
}
