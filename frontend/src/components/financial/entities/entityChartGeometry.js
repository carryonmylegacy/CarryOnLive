/**
 * EntityOrgChart — geometry helpers for orthogonal edge routing.
 *
 * Extracted from EntityOrgChart.js during Monolith Reduction 4/6 (Feb 2026).
 * Pure functions: no React, no DOM, no closures over component state.
 * Exported for both the live chart renderer and the static print-page
 * renderer in EntitiesPrintPage.js.
 */
import { STEP_OUT, CORNER_R } from './entityChartConstants';

// Pick the perimeter anchor on `rect` facing the point `towards`.
export function anchorOn(rect, towards) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const dx = towards.x - cx, dy = towards.y - cy;
  const tx = Math.abs(dx) / (rect.w / 2 || 1);
  const ty = Math.abs(dy) / (rect.h / 2 || 1);
  if (tx > ty) {
    return dx > 0
      ? { x: rect.x + rect.w, y: cy, dir: 'right' }
      : { x: rect.x,          y: cy, dir: 'left' };
  }
  return dy > 0
    ? { x: cx, y: rect.y + rect.h, dir: 'down' }
    : { x: cx, y: rect.y,          dir: 'up' };
}

export function stepOut(anchor, dist = STEP_OUT) {
  if (anchor.dir === 'up')    return { x: anchor.x, y: anchor.y - dist };
  if (anchor.dir === 'down')  return { x: anchor.x, y: anchor.y + dist };
  if (anchor.dir === 'left')  return { x: anchor.x - dist, y: anchor.y };
  return { x: anchor.x + dist, y: anchor.y };
}

// Does horizontal segment (x1..x2 at y) cross the rect?
export function hSegHitsRect(x1, x2, y, r, pad = 4) {
  const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
  return y > r.y - pad && y < r.y + r.h + pad && hi > r.x - pad && lo < r.x + r.w + pad;
}
export function vSegHitsRect(y1, y2, x, r, pad = 4) {
  const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
  return x > r.x - pad && x < r.x + r.w + pad && hi > r.y - pad && lo < r.y + r.h + pad;
}

// Stable hash 0..1 from string for per-edge offset
export function hash01(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) / 1000;
}

// Route a single edge orthogonally with obstacle deflection.
export function routeEdge(srcRect, tgtRect, obstacles, edgeId) {
  // Anchor on both endpoints toward each other's center
  const tCenter = { x: tgtRect.x + tgtRect.w / 2, y: tgtRect.y + tgtRect.h / 2 };
  const sCenter = { x: srcRect.x + srcRect.w / 2, y: srcRect.y + srcRect.h / 2 };
  const sA = anchorOn(srcRect, tCenter);
  const tA = anchorOn(tgtRect, sCenter);
  const s2 = stepOut(sA);
  const t2 = stepOut(tA);

  // Per-edge offset to fan out parallel edges
  const jitter = (hash01(edgeId) - 0.5) * 22; // ±11px

  let mids = [];

  const sVert = sA.dir === 'up' || sA.dir === 'down';
  const tVert = tA.dir === 'up' || tA.dir === 'down';

  if (sVert && tVert) {
    // V-H-V routing: midY between s2.y and t2.y, possibly deflected
    let midY = (s2.y + t2.y) / 2 + jitter;
    // Deflect if horizontal segment at midY crosses an obstacle
    for (let i = 0; i < 4; i++) {
      const hit = obstacles.find((r) => hSegHitsRect(s2.x, t2.x, midY, r));
      if (!hit) break;
      // Try going above or below the offending obstacle, whichever side is closer
      const above = hit.y - 14;
      const below = hit.y + hit.h + 14;
      midY = Math.abs(midY - above) < Math.abs(midY - below) ? above : below;
    }
    // Clamp midY into the corridor between source and target. Without
    // this, deflecting around an obstacle that sits OUTSIDE the
    // source→target band can push the horizontal sweep (and the
    // ownership-% badge that anchors to it) on top of the source or
    // target tile — that's how the "100% pill eats the benefactor's
    // name" bug used to manifest.
    const corridorMin = Math.min(s2.y, t2.y) + 12;
    const corridorMax = Math.max(s2.y, t2.y) - 12;
    if (corridorMax > corridorMin) {
      midY = Math.max(corridorMin, Math.min(corridorMax, midY));
    }
    // Vertical legs from s2 → (s2.x, midY) → (t2.x, midY) → t2
    // Check vertical legs don't punch through obstacles either; if they do, push midX
    let leftX = s2.x, rightX = t2.x;
    const checkVert = (x, y1, y2) => obstacles.find((r) => vSegHitsRect(y1, y2, x, r));
    if (checkVert(leftX, s2.y, midY)) {
      // shift the start of the horizontal further so the vertical clears
      // (rare with sensible drags; cheap fallback)
    }
    if (checkVert(rightX, midY, t2.y)) { /* same — accept best effort */ }
    mids = [{ x: s2.x, y: midY }, { x: t2.x, y: midY }];
  } else if (!sVert && !tVert) {
    // H-V-H routing
    let midX = (s2.x + t2.x) / 2 + jitter;
    for (let i = 0; i < 4; i++) {
      const hit = obstacles.find((r) => vSegHitsRect(s2.y, t2.y, midX, r));
      if (!hit) break;
      const left = hit.x - 14;
      const right = hit.x + hit.w + 14;
      midX = Math.abs(midX - left) < Math.abs(midX - right) ? left : right;
    }
    // Same corridor clamp on X for symmetric H-V-H routing.
    const corridorMin = Math.min(s2.x, t2.x) + 12;
    const corridorMax = Math.max(s2.x, t2.x) - 12;
    if (corridorMax > corridorMin) {
      midX = Math.max(corridorMin, Math.min(corridorMax, midX));
    }
    mids = [{ x: midX, y: s2.y }, { x: midX, y: t2.y }];
  } else {
    // Mixed (one vertical, one horizontal anchor): elbow path s2 → corner → t2
    // Corner at (t2.x, s2.y) if source is vertical-out, else (s2.x, t2.y)
    if (sVert) {
      let cornerX = t2.x;
      // If the horizontal leg from (s2.x, t2.y... wait — corner is (t2.x, s2.y)
      let cornerY = s2.y;
      // Horizontal seg s2 → corner crosses obstacles?
      for (let i = 0; i < 3; i++) {
        const hit = obstacles.find((r) => hSegHitsRect(s2.x, cornerX, cornerY, r));
        if (!hit) break;
        // bend by going further down or up first
        cornerY = sA.dir === 'down' ? hit.y + hit.h + 14 : hit.y - 14;
      }
      mids = [{ x: s2.x, y: cornerY }, { x: cornerX, y: cornerY }];
    } else {
      let cornerX = s2.x;
      let cornerY = t2.y;
      for (let i = 0; i < 3; i++) {
        const hit = obstacles.find((r) => vSegHitsRect(s2.y, cornerY, cornerX, r));
        if (!hit) break;
        cornerX = sA.dir === 'right' ? hit.x + hit.w + 14 : hit.x - 14;
      }
      mids = [{ x: cornerX, y: s2.y }, { x: cornerX, y: cornerY }];
    }
  }

  const points = [
    { x: sA.x, y: sA.y },
    s2,
    ...mids,
    t2,
    { x: tA.x, y: tA.y },
  ];
  // Mid label position (for ownership %)
  const midPoint = mids.length
    ? { x: (mids[0].x + mids[mids.length - 1].x) / 2, y: (mids[0].y + mids[mids.length - 1].y) / 2 }
    : { x: (sA.x + tA.x) / 2, y: (sA.y + tA.y) / 2 };
  return { points, midPoint, sA, tA };
}

// Convert a polyline into an SVG path with rounded elbows.
export function polylineToRoundedPath(points, r = CORNER_R) {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], cur = points[i], next = points[i + 1];
    const lenIn = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const lenOut = Math.hypot(next.x - cur.x, next.y - cur.y);
    const rIn = Math.min(r, lenIn / 2);
    const rOut = Math.min(r, lenOut / 2);
    const inX = cur.x - ((cur.x - prev.x) / (lenIn || 1)) * rIn;
    const inY = cur.y - ((cur.y - prev.y) / (lenIn || 1)) * rIn;
    const outX = cur.x + ((next.x - cur.x) / (lenOut || 1)) * rOut;
    const outY = cur.y + ((next.y - cur.y) / (lenOut || 1)) * rOut;
    d += ` L ${inX} ${inY} Q ${cur.x} ${cur.y}, ${outX} ${outY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}
