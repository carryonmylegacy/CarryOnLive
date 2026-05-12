/**
 * EntityOrgChart — free-drag 2D org chart for CFP Entities & Structures.
 *
 * Tiles are absolutely positioned and the user can drag any tile to any
 * point inside the chart canvas. Positions persist per estate via
 * localStorage. Edges re-route in real time during drag with three rules:
 *   1. Always connect to the proper anchor on each tile (top / bottom /
 *      left / right depending on relative position).
 *   2. Never cross through any other tile rect.
 *   3. Never sit on top of another edge — parallel edges get a stable
 *      hash-derived nudge so they fan out instead of overlapping.
 *
 * Lines render as orthogonal paths with rounded corners so they feel
 * organic while staying readable. Same gold-gradient + dash-reveal
 * animation language as FamilyTree.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { notify } from '../../AppNotification';
import { Building2, Shield, Landmark, Home, User as UserIcon, Settings, Info, Pencil, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { getEntityPalette, getTypeMeta, ROLE_PALETTE, PALETTE, ROLE_OPTIONS } from '../../../config/entityCatalog';
import EntityLegend, { LEGEND_W, LEGEND_H } from './EntityLegend';

// Pseudo-node key under which the legend's drag-position lives in the
// chart's `overrides` map. Treating the legend like a tile (key in
// overrides + positionOf + obstacle list for edge routing) lets the
// existing tile-drag pipeline move it with zero additional plumbing,
// which is exactly what the user asked for.
const LEGEND_KEY = '__legend__';
import { AvatarCircle } from '../../AvatarCircle';

const BUCKET_ICON = {
  business: Building2, trust: Shield, charity: Landmark,
  property: Home, external_person: UserIcon, specialized: Settings,
};

// Tile size constants — width/height are uniform so routing math stays sane.
const ENTITY_W = 200;
const ENTITY_H = 92;
const PERSON_W = 110;
// Extra height (was 96) to make room for the role-title chips beneath
// the last name (e.g., "Trustee" / "Co-trustee + Member (LLC)" /
// "Benefactor"). Chips wrap onto a second line when a person holds
// multiple roles, so this height accommodates up to ~2 rows of chips.
const PERSON_H = 124;
const PADDING = 24;          // canvas inner padding
const ROW_GAP = 70;          // vertical gap between layout rows
const COL_GAP = 30;          // horizontal gap between sibling tiles
const STEP_OUT = 18;         // how far a line steps perpendicular out of a tile before turning
const CORNER_R = 10;         // rounded-corner radius

// ---- Beneficiary cluster tile geometry --------------------------------
// A "cluster" is a single composite tile that contains every
// beneficiary relationship pointing at a given entity. Per user
// request: each member renders as a half-sized avatar (32 px) with
// first-name underneath; members lay out 5-per-row, with each row
// staggered by half a column so the grid reads as a brick pattern;
// only ONE connection line is drawn from the cluster up to its parent
// entity (the individual avatars carry no edges of their own).
const CLUSTER_AVATAR = 36;
const CLUSTER_SLOT_W = 50;          // per-member horizontal slot
const CLUSTER_SLOT_H = 60;          // per-member vertical slot
const CLUSTER_COLS = 5;
const CLUSTER_HEADER_H = 22;        // entity-label strip above the grid
const CLUSTER_PAD_X = 10;
const CLUSTER_PAD_Y = 8;
const CLUSTER_W = CLUSTER_PAD_X * 2 + CLUSTER_COLS * CLUSTER_SLOT_W; // 270
const clusterHeight = (memberCount) => {
  const rows = Math.max(1, Math.ceil(memberCount / CLUSTER_COLS));
  return CLUSTER_HEADER_H + CLUSTER_PAD_Y * 2 + rows * CLUSTER_SLOT_H + 4;
};

// LocalStorage key for per-estate position overrides
const POS_KEY = (estateId) => `cfp_entity_chart_positions:${estateId || 'global'}`;
// LocalStorage key for per-estate hidden node-keys. The user can hide
// individual tiles (including their own benefactor tile) from the
// chart visualization without deleting the underlying database
// record. The hidden set persists per estate.
const HIDDEN_KEY = (estateId) => `cfp_entity_chart_hidden:${estateId || 'global'}`;

// ---------------------------------------------------------------------------
// Graph build (same approach as v1 but returns nodes flat for free layout)
// ---------------------------------------------------------------------------
function buildGraph({ entities, externals, relationships, beneficiaries, user }) {
  const nodes = new Map();

  // Person/entity nodes only get added if they participate in a relationship
  // (or, for entities, even when orphan). We register everything in `pool`
  // first, then filter.
  const pool = new Map();
  if (user?.id) {
    pool.set(`user:${user.id}`, {
      key: `user:${user.id}`, kind: 'user', id: user.id,
      label: user.first_name || user.name?.split(' ')[0] || 'You',
      sublabel: user.last_name || '',
      photo: user.photo_url,
      w: PERSON_W, h: PERSON_H,
    });
  }
  (beneficiaries || []).forEach((b) => {
    pool.set(`beneficiary:${b.id}`, {
      key: `beneficiary:${b.id}`, kind: 'beneficiary', id: b.id,
      label: b.first_name || (b.name || '').split(' ')[0] || 'Beneficiary',
      sublabel: b.relation || '',
      photo: b.photo_url, avatar_color: b.avatar_color,
      w: PERSON_W, h: PERSON_H,
    });
  });
  (externals || []).forEach((p) => {
    pool.set(`external_person:${p.id}`, {
      key: `external_person:${p.id}`, kind: 'external_person', id: p.id,
      label: p.first_name, sublabel: p.last_name || 'Outside party',
      photo: p.photo_url, avatar_color: p.avatar_color,
      w: PERSON_W, h: PERSON_H,
    });
  });
  (entities || []).forEach((e) => {
    pool.set(`entity:${e.id}`, {
      key: `entity:${e.id}`, kind: 'entity', id: e.id, entity: e,
      w: ENTITY_W, h: ENTITY_H,
    });
  });

  // -- Per-entity beneficiary cluster tiles ---------------------------------
  // Per user request: every entity that has at least one
  // beneficiary-relationship gets a SINGLE composite cluster tile.
  // The tile renders a brick-pattern grid of half-sized avatars with
  // first-names internally and has ONE edge from the entity down into
  // the cluster. The individual beneficiaries no longer render as
  // separate person-tiles for their entity-beneficiary relationships
  // — they're consumed into the cluster. They DO still render as
  // full tiles for any *other* relationship they participate in
  // (person-to-person, trustee-of, …).
  const benByEntity = new Map(); // entityId -> [ {bid} ]
  (relationships || []).forEach((r) => {
    if (r.source_type === 'beneficiary' && r.target_type === 'entity' && r.role === 'beneficiary') {
      const list = benByEntity.get(r.target_id) || [];
      if (!list.find((m) => m.bid === r.source_id)) {
        list.push({ bid: r.source_id });
      }
      benByEntity.set(r.target_id, list);
    }
  });
  // Hydrate member metadata from the beneficiary pool entries.
  const benIndex = new Map();
  (beneficiaries || []).forEach((b) => benIndex.set(b.id, b));
  benByEntity.forEach((members, eid) => {
    const hydrated = members
      .map((m) => benIndex.get(m.bid))
      .filter(Boolean)
      .map((b) => ({
        id: b.id,
        first_name: b.first_name || (b.name || '').split(' ')[0] || 'Member',
        photo: b.photo_url,
        avatar_color: b.avatar_color,
      }));
    if (hydrated.length === 0) return;
    pool.set(`cluster:${eid}`, {
      key: `cluster:${eid}`,
      kind: 'cluster',
      id: eid,
      members: hydrated,
      w: CLUSTER_W,
      h: clusterHeight(hydrated.length),
    });
  });

  // Map each consumed beneficiary→entity edge to a single
  // entity→cluster edge. Direction is reversed (entity source,
  // cluster target) so the BFS depth pass naturally places the
  // cluster BELOW its parent entity. The edge is marked synthetic
  // so the equity / role-label passes skip it.
  const clusterEdgesAdded = new Set(); // entityIds we've already emitted an edge for
  const edges = (relationships || [])
    .reduce((acc, r) => {
      const isBenToEntity = r.source_type === 'beneficiary'
        && r.target_type === 'entity'
        && r.role === 'beneficiary';
      if (isBenToEntity) {
        if (!clusterEdgesAdded.has(r.target_id) && pool.has(`cluster:${r.target_id}`)) {
          clusterEdgesAdded.add(r.target_id);
          acc.push({
            id: `cluster-edge:${r.target_id}`,
            sourceKey: `entity:${r.target_id}`,
            targetKey: `cluster:${r.target_id}`,
            role: 'beneficiary',
            ownership_pct: null,
            synthetic: true,
            raw: r,
          });
        }
        // Suppress the individual beneficiary→entity edge — it's
        // represented inside the cluster tile, no line needed.
        return acc;
      }
      acc.push({
        id: r.id,
        sourceKey: `${r.source_type}:${r.source_id}`,
        targetKey: `${r.target_type}:${r.target_id}`,
        role: r.role,
        ownership_pct: r.ownership_pct,
        raw: r,
      });
      return acc;
    }, [])
    .filter((e) => pool.has(e.sourceKey) && pool.has(e.targetKey));

  // Attach the largest equity stake per person to its node so the
  // PersonTile can render a "% chip" beneath the avatar — exactly the
  // UX the user asked for: "show ... percentage equity with a little
  // percent sign underneath their avatar". Roles considered equity:
  // owner, member, shareholder, gp, lp, joint_tenant, tenant_in_common,
  // community_property.
  const EQUITY_ROLES = new Set([
    'owner', 'member', 'shareholder', 'gp', 'lp',
    'joint_tenant', 'tenant_in_common', 'community_property',
  ]);
  edges.forEach((e) => {
    if (!EQUITY_ROLES.has(e.role)) return;
    if (e.ownership_pct == null) return;
    const node = pool.get(e.sourceKey);
    if (!node) return;
    const cur = node.primary_equity_pct;
    if (cur == null || e.ownership_pct > cur) node.primary_equity_pct = e.ownership_pct;
  });

  // Role title beneath the name.
  //   user (the benefactor)        → ["Benefactor"] (always)
  //   beneficiary                  → ["Beneficiary"] (always)
  //   external_person              → derived from their connections —
  //                                  de-duped role labels in first-seen
  //                                  order. Empty if no connections yet.
  // `titles` is the array (each rendered as its own clickable chip);
  // `title` is the comma-joined string kept for tooltip / accessibility.
  const ROLE_LABEL = new Map(ROLE_OPTIONS.map((r) => [r.id, r.label]));
  pool.forEach((n, k) => {
    if (n.kind === 'user') { n.titles = ['Benefactor']; n.title = 'Benefactor'; return; }
    if (n.kind === 'beneficiary') { n.titles = ['Beneficiary']; n.title = 'Beneficiary'; return; }
    if (n.kind !== 'external_person') return;
    const seen = new Set();
    const labels = [];
    edges.forEach((e) => {
      if (e.sourceKey !== k) return;
      const lbl = ROLE_LABEL.get(e.role) || e.role;
      if (!lbl || seen.has(lbl)) return;
      seen.add(lbl);
      labels.push(lbl);
    });
    n.titles = labels;
    n.title = labels.join(', ');
  });

  // Persons (user/beneficiary/external_person) are only included if they touch
  // a relationship. Entities are always included so orphan entities still show.
  const personKeysWithRel = new Set();
  edges.forEach((e) => {
    const sk = e.sourceKey; const tk = e.targetKey;
    if (!sk.startsWith('entity:')) personKeysWithRel.add(sk);
    if (!tk.startsWith('entity:')) personKeysWithRel.add(tk);
  });
  pool.forEach((n, k) => {
    if (n.kind === 'entity') nodes.set(k, n);
    else if (n.kind === 'cluster') nodes.set(k, n);
    else if (personKeysWithRel.has(k)) nodes.set(k, n);
  });

  // If there are entities but the user never got pulled in (no relationship
  // involving the user), still include the user node so the benefactor has an
  // anchor on the canvas.
  if ((entities || []).length > 0 && user?.id && !nodes.has(`user:${user.id}`)) {
    nodes.set(`user:${user.id}`, pool.get(`user:${user.id}`));
  }

  // Compute depth (BFS from roots) just for INITIAL layout.
  const incoming = new Map();
  edges.forEach((e) => {
    if (!incoming.has(e.targetKey)) incoming.set(e.targetKey, []);
    incoming.get(e.targetKey).push(e);
  });
  const outgoing = new Map();
  edges.forEach((e) => {
    if (!outgoing.has(e.sourceKey)) outgoing.set(e.sourceKey, []);
    outgoing.get(e.sourceKey).push(e);
  });
  const used = new Set();
  edges.forEach((e) => { used.add(e.sourceKey); used.add(e.targetKey); });
  const depth = new Map();
  const queue = [];
  used.forEach((k) => {
    if (!incoming.has(k) || incoming.get(k).length === 0) {
      depth.set(k, 0);
      queue.push(k);
    }
  });
  while (queue.length) {
    const k = queue.shift();
    const d = depth.get(k) || 0;
    (outgoing.get(k) || []).forEach((e) => {
      const nd = d + 1;
      if (!depth.has(e.targetKey) || depth.get(e.targetKey) < nd) {
        depth.set(e.targetKey, nd);
        queue.push(e.targetKey);
      }
    });
  }
  // Orphan entities (no relationships): park on row 0
  (entities || []).forEach((e) => {
    const k = `entity:${e.id}`;
    if (!depth.has(k)) depth.set(k, 0);
  });
  // Orphan externals/beneficiaries get parked on row 0 too if not already placed
  nodes.forEach((n, k) => {
    if (!depth.has(k)) depth.set(k, 0);
  });

  return { nodes: Array.from(nodes.values()), edges, depth };
}

// Default layered layout: build initial { x, y } per node based on depth + index.
function computeInitialLayout(nodes, depth) {
  const rows = new Map();
  nodes.forEach((n) => {
    const d = depth.get(n.key) ?? 0;
    if (!rows.has(d)) rows.set(d, []);
    rows.get(d).push(n);
  });
  // Stable order within a row: persons first, then entities by name
  rows.forEach((arr) => {
    arr.sort((a, b) => {
      if (a.kind !== b.kind) {
        if (a.kind === 'user') return -1; if (b.kind === 'user') return 1;
        if (a.kind === 'beneficiary') return -1; if (b.kind === 'beneficiary') return 1;
        if (a.kind === 'external_person') return -1; if (b.kind === 'external_person') return 1;
      }
      return (a.label || a.entity?.name || '').localeCompare(b.label || b.entity?.name || '');
    });
  });
  // Find max width row to compute centering
  let maxRowW = 0;
  rows.forEach((arr) => {
    const w = arr.reduce((s, n) => s + n.w + COL_GAP, -COL_GAP);
    if (w > maxRowW) maxRowW = w;
  });
  const canvasW = Math.max(maxRowW + PADDING * 2, 720);
  const out = {};
  let y = PADDING;
  const sortedDepths = Array.from(rows.keys()).sort((a, b) => a - b);
  sortedDepths.forEach((d) => {
    const arr = rows.get(d);
    const rowW = arr.reduce((s, n) => s + n.w + COL_GAP, -COL_GAP);
    let x = PADDING + (canvasW - PADDING * 2 - rowW) / 2;
    const rowH = Math.max(...arr.map((n) => n.h));
    arr.forEach((n) => {
      out[n.key] = { x, y: y + (rowH - n.h) / 2 };
      x += n.w + COL_GAP;
    });
    y += rowH + ROW_GAP;
  });
  return { positions: out, canvasW, canvasH: y + PADDING - ROW_GAP };
}

// ---------------------------------------------------------------------------
// Geometry helpers for routing
// ---------------------------------------------------------------------------

// Pick the perimeter anchor on `rect` facing the point `towards`.
function anchorOn(rect, towards) {
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

function stepOut(anchor, dist = STEP_OUT) {
  if (anchor.dir === 'up')    return { x: anchor.x, y: anchor.y - dist };
  if (anchor.dir === 'down')  return { x: anchor.x, y: anchor.y + dist };
  if (anchor.dir === 'left')  return { x: anchor.x - dist, y: anchor.y };
  return { x: anchor.x + dist, y: anchor.y };
}

// Does horizontal segment (x1..x2 at y) cross the rect?
function hSegHitsRect(x1, x2, y, r, pad = 4) {
  const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
  return y > r.y - pad && y < r.y + r.h + pad && hi > r.x - pad && lo < r.x + r.w + pad;
}
function vSegHitsRect(y1, y2, x, r, pad = 4) {
  const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
  return x > r.x - pad && x < r.x + r.w + pad && hi > r.y - pad && lo < r.y + r.h + pad;
}

// Stable hash 0..1 from string for per-edge offset
function hash01(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) / 1000;
}

// Route a single edge orthogonally with obstacle deflection.
function routeEdge(srcRect, tgtRect, obstacles, edgeId) {
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
function polylineToRoundedPath(points, r = CORNER_R) {
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

// ---------------------------------------------------------------------------
// Node renderers
// ---------------------------------------------------------------------------
// Stops drag from starting AND stops propagation so the tile's click /
// double-click handlers don't also fire when a user taps an icon button.
const stopAll = (e) => { e.stopPropagation(); e.preventDefault(); };

// Reusable little circular icon-button shown on every tile.
function TileIconButton({ icon: Icon, onClick, label, color = 'rgba(255,255,255,0.85)', testId }) {
  return (
    <button
      onPointerDown={stopAll}
      onMouseDown={stopAll}
      onClick={(e) => { stopAll(e); onClick?.(e); }}
      className="rounded-full flex items-center justify-center transition-colors hover:bg-[rgba(212,165,55,0.18)]"
      style={{
        width: 22, height: 22,
        border: '1px solid rgba(212,165,55,0.45)',
        background: 'rgba(11,17,32,0.55)',
        color,
        backdropFilter: 'blur(4px)',
      }}
      aria-label={label}
      title={label}
      data-testid={testId}
    >
      <Icon style={{ width: 12, height: 12 }} />
    </button>
  );
}

function PersonTile({ node, palette, dragging, locked, onPointerDownDrag, onClick, onDoubleClick, onInfoClick, onEditClick, onHideClick, roleFilter, onTitleClick }) {
  const initials = (node.label?.[0] || '') + (node.sublabel?.[0] || '');
  const color = node.avatar_color || palette.stroke;
  const cacheKey =
    node.kind === 'user' ? `user:${node.id}:photo` :
    node.kind === 'beneficiary' ? `beneficiary:${node.id}:photo` :
    undefined;
  return (
    <div
      className="relative flex flex-col items-center gap-1 select-none"
      style={{ width: PERSON_W, height: PERSON_H, cursor: locked ? 'pointer' : (dragging ? 'grabbing' : 'grab'), touchAction: locked ? 'auto' : 'none' }}
      onPointerDown={onPointerDownDrag}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-testid={`entity-node-${node.key}`}
    >
      <div style={{ pointerEvents: 'none' }}>
        <AvatarCircle
          photo={node.photo}
          initials={(initials || '?').toUpperCase().slice(0, 2)}
          color={color}
          size={56}
          cacheKey={cacheKey}
          isPrimary={node.kind === 'user'}
        />
      </div>
      <span className="text-xs font-semibold text-[var(--t)] text-center leading-tight truncate w-full" style={{ pointerEvents: 'none' }}>{node.label}</span>
      {node.sublabel && (
        <span className="text-[11px] text-[var(--t4)] text-center leading-tight truncate w-full" style={{ pointerEvents: 'none' }}>{node.sublabel}</span>
      )}
      {Array.isArray(node.titles) && node.titles.length > 0 && (
        <div
          className="flex flex-wrap justify-center gap-x-1 gap-y-0.5 w-full px-0.5"
          // The chips need pointer events to be tappable for filtering,
          // but the rest of the tile body inherits the parent's drag/
          // click flow. Stop propagation in the chip handler so a tap
          // on the chip never opens the docs/info popover by accident.
          style={{ pointerEvents: 'auto' }}
          data-testid={`entity-node-title-${node.key}`}
        >
          {node.titles.map((t) => {
            const active = roleFilter === t;
            return (
              <button
                key={t}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTitleClick?.(t);
                }}
                className="text-[11px] font-bold leading-none rounded-full px-1.5 py-0.5 transition-all max-w-full truncate"
                style={{
                  background: active ? 'var(--gold)' : 'rgba(212,165,55,0.10)',
                  color: active ? '#080e1a' : 'var(--gold)',
                  border: active ? '1px solid var(--gold)' : '1px solid rgba(212,165,55,0.45)',
                }}
                title={`Filter by ${t}`}
                data-testid={`entity-node-title-chip-${node.key}-${t}`}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}
      {node.primary_equity_pct != null && node.kind !== 'user' && (
        <span
          className="inline-block text-[11px] font-bold rounded-full px-1.5 py-0.5 leading-none"
          style={{
            background: 'var(--bg2)',
            color: '#D4A537',
            border: '1px solid #D4A537',
            pointerEvents: 'none',
          }}
          data-testid={`entity-node-equity-${node.key}`}
        >
          {Math.round(node.primary_equity_pct)}%
        </span>
      )}
      {/* Action buttons overlay (top-right of the avatar). External-person nodes
          don't get an Edit pencil because they're handled differently. */}
      <div className="absolute top-0 right-0 flex flex-col gap-1">
        <TileIconButton icon={Info} onClick={onInfoClick} label="Info" testId={`tile-info-${node.key}`} />
        {node.kind !== 'user' && onEditClick && (
          <TileIconButton icon={Pencil} onClick={onEditClick} label="Edit" testId={`tile-edit-${node.key}`} />
        )}
        {onHideClick && (
          <TileIconButton icon={X} onClick={onHideClick} label="Hide from chart" testId={`tile-hide-${node.key}`} />
        )}
      </div>
    </div>
  );
}

function EntityTile({ node, dragging, locked, onPointerDownDrag, onClick, onDoubleClick, onInfoClick, onEditClick, onHideClick }) {
  const e = node.entity;
  const palette = getEntityPalette(e);
  const meta = getTypeMeta(e.category, e.type);
  const Icon = BUCKET_ICON[e.category] || Settings;
  return (
    <div
      onPointerDown={onPointerDownDrag}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-testid={`entity-node-entity-${e.id}`}
      className="relative rounded-2xl px-3 py-2.5 transition-shadow flex items-start gap-2 select-none"
      style={{
        width: ENTITY_W, height: ENTITY_H,
        background: palette.fill,
        border: `1.5px solid ${palette.stroke}`,
        boxShadow: dragging ? `0 8px 24px rgba(0,0,0,0.45), 0 0 24px ${palette.glow}` : `0 0 18px ${palette.glow}`,
        cursor: locked ? 'pointer' : (dragging ? 'grabbing' : 'grab'),
        touchAction: locked ? 'auto' : 'none',
      }}
    >
      <div
        className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: `${palette.stroke}25`, color: palette.text, pointerEvents: 'none' }}
      >
        <Icon style={{ width: 18, height: 18 }} />
      </div>
      <div className="flex-1 min-w-0 pr-7" style={{ pointerEvents: 'none' }}>
        <div className="text-[13px] font-bold text-[var(--t)] truncate" style={{ fontFamily: 'var(--sans)' }}>
          {e.name}
        </div>
        <div className="text-[11px] truncate font-semibold" style={{ color: palette.text }}>
          {meta?.friendly || e.type}
        </div>
        {e.formation_state && (
          <span
            className="inline-block mt-1 text-[11px] font-bold px-1.5 py-0.5 rounded-md"
            style={{ background: `${palette.stroke}30`, color: palette.text, border: `1px solid ${palette.stroke}50` }}
          >
            {e.formation_state}
          </span>
        )}
      </div>
      {/* Action buttons */}
      <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
        <TileIconButton icon={Info} onClick={onInfoClick} label="Info" testId={`tile-info-entity-${e.id}`} />
        {onEditClick && (
          <TileIconButton icon={Pencil} onClick={onEditClick} label="Edit" testId={`tile-edit-entity-${e.id}`} />
        )}
        {onHideClick && (
          <TileIconButton icon={X} onClick={onHideClick} label="Hide from chart" testId={`tile-hide-entity-${e.id}`} />
        )}
      </div>
    </div>
  );
}

// ClusterTile — one composite tile per entity that has beneficiaries.
// Renders the entity name on a header strip, then a brick-pattern grid
// of half-sized avatars (5 per row, odd rows offset by half a column).
// First name only beneath each avatar. One SVG edge connects this tile
// to the parent entity (handled by the edge layer, not in here).
function ClusterTile({ node, dragging, locked, onPointerDownDrag, onClick, entities, onHideClick }) {
  const members = node.members || [];
  const w = CLUSTER_W;
  const h = clusterHeight(members.length);
  const parentName = (entities || []).find((e) => e.id === node.id)?.name || '';
  const HALF_STEP = CLUSTER_SLOT_W / 2;
  return (
    <div
      onPointerDown={onPointerDownDrag}
      onClick={onClick}
      data-testid={`entity-node-cluster-${node.id}`}
      className="relative rounded-xl select-none"
      style={{
        width: w,
        height: h,
        background: 'rgba(34,201,147,0.08)',
        border: '1.5px solid rgba(34,201,147,0.55)',
        boxShadow: dragging
          ? '0 8px 24px rgba(0,0,0,0.45), 0 0 24px rgba(34,201,147,0.45)'
          : '0 0 14px rgba(34,201,147,0.22)',
        cursor: locked ? 'pointer' : (dragging ? 'grabbing' : 'grab'),
        touchAction: locked ? 'auto' : 'none',
      }}
    >
      <div
        className="px-2 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wide truncate"
        style={{ color: '#22C993', pointerEvents: 'none' }}
      >
        {members.length} beneficiar{members.length === 1 ? 'y' : 'ies'} · {parentName || 'this entity'}
      </div>
      <div
        className="absolute"
        style={{
          left: CLUSTER_PAD_X,
          top: CLUSTER_HEADER_H + CLUSTER_PAD_Y,
          right: CLUSTER_PAD_X,
          bottom: CLUSTER_PAD_Y,
          pointerEvents: 'none',
        }}
      >
        {members.map((m, i) => {
          const row = Math.floor(i / CLUSTER_COLS);
          const col = i % CLUSTER_COLS;
          const stagger = row % 2 === 1 ? HALF_STEP : 0;
          const left = col * CLUSTER_SLOT_W + stagger;
          const top = row * CLUSTER_SLOT_H;
          const initials = (m.first_name?.[0] || '?').toUpperCase();
          return (
            <div
              key={m.id}
              className="absolute flex flex-col items-center"
              style={{ left, top, width: CLUSTER_AVATAR + 4 }}
            >
              <AvatarCircle
                photo={m.photo}
                initials={initials}
                color={m.avatar_color || '#22C993'}
                size={CLUSTER_AVATAR}
                cacheKey={`beneficiary:${m.id}:photo`}
              />
              <span className="text-[11px] font-bold text-[var(--t)] mt-0.5 leading-tight truncate w-full text-center">
                {(m.first_name || '').split(' ')[0]}
              </span>
            </div>
          );
        })}
      </div>
      {onHideClick && (
        <div className="absolute top-1 right-1">
          <TileIconButton icon={X} onClick={onHideClick} label="Hide from chart" testId={`tile-hide-cluster-${node.id}`} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main chart
// ---------------------------------------------------------------------------
// Export the layout helpers so the print page (`/financial/entities/{id}/print`)
// can render a static SVG of the same tree without re-implementing the
// layered layout / edge-routing math. Internal usage is unchanged.
export { buildGraph, computeInitialLayout, routeEdge, polylineToRoundedPath };
export const PRINT_TILE_DIMENSIONS = {
  ENTITY_W, ENTITY_H, PERSON_W, PERSON_H, PADDING, CORNER_R,
};

export default function EntityOrgChart({
  estateId, entities, externals, relationships, beneficiaries,
  onSingleClickNode, onDoubleClickNode, onInfoClickNode, onEditClickNode,
  onDeleteNode,
  cleanUpSignal, locked = false, readOnly = false, fitOnLoad = false,
  legendHidden = false, onHideLegend,
  serverOverrides, onSaveLayout,
}) {
  const { user } = useAuth();
  const containerRef = useRef(null);
  // ── Zoom (cursor / pinch-anchored) ────────────────────────────────────
  // Range deliberately narrower than the previous 0.4–1.6 attempt so
  // iOS pinches feel controllable. The pinch handler also damps Safari's
  // raw e.scale (which ramps aggressively) — see usePinchZoom() below.
  const ZOOM_MIN = 0.55;
  const ZOOM_MAX = 1.35;
  const [zoom, setZoom] = useState(1);
  // Read-only mirror of zoom for stable closures inside event listeners.
  const zoomRef = useRef(1);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  // Scroll intent committed in a layout effect after every zoom change.
  //   { type:'anchor', worldX, worldY, screenX, screenY }
  //     → keeps that world point under that screen point across the zoom
  //       change (Apple Maps / Figma behavior). Used by pinch + ctrl+wheel.
  //   { type:'abs', x, y }
  //     → one-shot absolute scroll (initial layout & dbl-tap reset).
  const scrollIntentRef = useRef(null);
  // Bumped by the double-tap handler to force a fresh initial layout.
  const [relayoutTick, setRelayoutTick] = useState(0);
  const [draggingKey, setDraggingKey] = useState(null);
  const dragStateRef = useRef(null); // { key, startX, startY, origX, origY, groupKeys?, groupOrig? }
  const recentDragRef = useRef(false); // suppresses the click that follows a real drag

  // -- Marquee selection (Ask 3) --------------------------------------------
  // The user can long-press on empty canvas to draw a selection
  // rectangle; on release every tile centre inside the rect joins the
  // `selectedKeys` set. Tapping-and-holding any selected tile then
  // drags the entire selection as a single group.
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [marquee, setMarquee] = useState(null); // { x0, y0, x1, y1 } in canvas-coords
  const marqueeRef = useRef(null); // mirrors marquee for fast pointermove reads
  const longPressTimerRef = useRef(null);
  const longPressOriginRef = useRef(null); // { clientX, clientY, canvasX, canvasY }
  const clickTimerRef = useRef(null);  // for distinguishing single vs double click
  // Tap any role chip beneath a person tile to dim everyone who
  // doesn't share that role — e.g., tap "Trustee" to instantly see
  // who controls each trust. Tap the same chip again (or the "Clear"
  // button on the floating filter pill) to dismiss the filter.
  const [roleFilter, setRoleFilter] = useState(null);
  const handleTitleClick = useCallback((label) => {
    setRoleFilter((prev) => (prev === label ? null : label));
  }, []);
  // Position overrides per node. Two-tier source of truth:
  //   1. localStorage (instant, offline-friendly, per-device)
  //   2. server `serverOverrides` (authoritative, survives device
  //      switching / cache wipes / hard reloads)
  // When the server payload arrives (any non-empty serverOverrides),
  // it wins — that's the latest committed state. Otherwise we fall
  // back to whatever the user's local cache had.
  const [overrides, setOverrides] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage?.getItem(POS_KEY(estateId));
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  // Per-estate hidden node-keys (user dismissed individual tiles
  // from the visualization). Persisted to localStorage so the chart
  // remembers the user's curated view across reloads / device
  // restarts. The underlying DB records are NOT touched — this is a
  // purely visual hide.
  const [hiddenKeys, setHiddenKeys] = useState(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage?.getItem(HIDDEN_KEY(estateId));
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  });
  const hideNode = useCallback((key) => {
    if (!key) return;
    setHiddenKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      try { window.localStorage?.setItem(HIDDEN_KEY(estateId), JSON.stringify(Array.from(next))); }
      catch { /* quota */ }
      return next;
    });
  }, [estateId]);
  const showAllHidden = useCallback(() => {
    setHiddenKeys(new Set());
    try { window.localStorage?.removeItem(HIDDEN_KEY(estateId)); } catch { /* quota */ }
  }, [estateId]);

  // Per-tile remove modal. When the user clicks the × on any tile,
  // we don't act immediately — we open a small confirm dialog with
  // two choices:
  //   • "Hide from chart" — purely visual, adds the key to
  //     hiddenKeys (above).
  //   • "Delete permanently" — fires onDeleteNode upstream, which
  //     hits the appropriate backend DELETE endpoint and refetches.
  // The benefactor / user tile only gets the Hide option because
  // there's no DB record to delete (you can't delete yourself from
  // your own estate).
  const [confirmRemoveNode, setConfirmRemoveNode] = useState(null);
  const openRemoveModal = useCallback((node) => {
    setConfirmRemoveNode(node || null);
  }, []);
  const closeRemoveModal = useCallback(() => {
    setConfirmRemoveNode(null);
  }, []);
  const confirmRemoveHide = useCallback(() => {
    if (!confirmRemoveNode) return;
    hideNode(confirmRemoveNode.key);
    setConfirmRemoveNode(null);
  }, [confirmRemoveNode, hideNode]);
  const confirmRemoveDelete = useCallback(() => {
    if (!confirmRemoveNode || typeof onDeleteNode !== 'function') return;
    const node = confirmRemoveNode;
    const nodeKey = node.key;
    // Build a friendly toast title per node kind. The toast IS the
    // "deleted" confirmation; parent's handleDeleteNode now stays
    // silent on success so we don't double-toast.
    const toastTitle = (() => {
      if (node.kind === 'entity') return `Deleted "${node.entity?.name || 'entity'}"`;
      if (node.kind === 'cluster') {
        const n = node.members?.length || 0;
        const parentName = (entities || []).find((e) => e.id === node.id)?.name || 'this entity';
        return `Unlinked ${n} beneficiar${n === 1 ? 'y' : 'ies'} from ${parentName}`;
      }
      return `Deleted "${node.label || 'item'}"`;
    })();

    // Optimistic hide → tile vanishes immediately. The hiddenKeys
    // entry gets cleaned up below in both branches (post-delete refetch
    // makes the key orphan; restore drops it explicitly).
    hideNode(nodeKey);
    setConfirmRemoveNode(null);

    const dropFromHidden = () => {
      setHiddenKeys((prev) => {
        if (!prev.has(nodeKey)) return prev;
        const next = new Set(prev);
        next.delete(nodeKey);
        try { window.localStorage?.setItem(HIDDEN_KEY(estateId), JSON.stringify(Array.from(next))); }
        catch { /* quota */ }
        return next;
      });
    };

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        await onDeleteNode(node);
      } catch {
        // Parent surfaced an error toast — restore the tile so the
        // user isn't left with a phantom-hidden record.
        dropFromHidden();
      } finally {
        // Whether success or fail, drop the local hide flag — after
        // the parent's refetch the key is either orphan (record gone)
        // or the tile is visible again (record still there).
        dropFromHidden();
      }
    }, 5000);

    notify.success(toastTitle, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          cancelled = true;
          clearTimeout(timer);
          dropFromHidden();
          notify.info('Restored.');
        },
      },
    });
  }, [confirmRemoveNode, hideNode, onDeleteNode, estateId, entities]);
  // Tracks whether the user has dragged anything since the last save.
  // We only push to the backend when this is true to avoid a flood of
  // identical PUTs every time the user toggles the lock chip.
  const dirtyRef = useRef(false);
  // Stable mirror of onSaveLayout so unmount cleanup doesn't capture a
  // stale closure if the parent re-renders.
  const onSaveLayoutRef = useRef(onSaveLayout);
  useEffect(() => { onSaveLayoutRef.current = onSaveLayout; }, [onSaveLayout]);

  // Reload overrides when estate changes
  useEffect(() => {
    try {
      const raw = window.localStorage?.getItem(POS_KEY(estateId));
      setOverrides(raw ? JSON.parse(raw) : {});
    } catch { setOverrides({}); }
    try {
      const raw = window.localStorage?.getItem(HIDDEN_KEY(estateId));
      const arr = raw ? JSON.parse(raw) : [];
      setHiddenKeys(new Set(Array.isArray(arr) ? arr : []));
    } catch { setHiddenKeys(new Set()); }
  }, [estateId]);

  // Hydrate from server payload — but ONLY ONCE per estate. Subsequent
  // fetchAll calls (e.g., after the user adds a new entity, or saves
  // an edit) re-emit the same `serverOverrides` reference on each
  // refetch; if we re-applied it every time we would silently wipe any
  // unsaved local drags the user has made on this device. Once-per-
  // estate hydration is correct: the authoritative cross-device value
  // arrives on the first load, and after that local state is the
  // source of truth, with `onSaveLayout` pushing changes back.
  const hydratedEstateRef = useRef(null);
  useEffect(() => {
    if (!serverOverrides) return;
    if (hydratedEstateRef.current === estateId) return;
    hydratedEstateRef.current = estateId;
    if (Object.keys(serverOverrides).length === 0) return;
    setOverrides(serverOverrides);
    // Mirror to localStorage so offline reload starts from the truth.
    try { window.localStorage?.setItem(POS_KEY(estateId), JSON.stringify(serverOverrides)); }
    catch { /* quota */ }
    dirtyRef.current = false;
  }, [serverOverrides, estateId]);

  const persistOverrides = useCallback((next) => {
    try { window.localStorage?.setItem(POS_KEY(estateId), JSON.stringify(next)); } catch { /* quota */ }
    // Mark dirty so the next lock-toggle / unmount pushes to the
    // backend. We deliberately do NOT save on every drop — the user
    // typically nudges several tiles in a row, and we only need to
    // capture the final committed state per "session".
    dirtyRef.current = true;
  }, [estateId]);

  // Save to backend whenever the chart transitions into the LOCKED
  // state — the user clicked the lock chip while still on the page.
  // We pass `userInitiated: true` so the parent can surface a toast.
  // Unmount-on-navigate-away is handled by the cleanup effect below
  // with `userInitiated: false` so the toast doesn't flash on the way
  // out.
  const lockedRef = useRef(locked);
  useEffect(() => {
    const wasLocked = lockedRef.current;
    lockedRef.current = locked;
    if (locked && !wasLocked && dirtyRef.current) {
      const snapshot = overrides;
      dirtyRef.current = false;
      try { onSaveLayoutRef.current?.(snapshot, { userInitiated: true }); } catch { /* surfaced as toast in parent */ }
    }
  }, [locked, overrides]);

  // Final flush on unmount — silent (`userInitiated: false`). Captures
  // both (a) "user navigated away while still unlocked" and (b)
  // "user navigated away in the millisecond between toggling lock
  // and the lock-effect committing". We read overrides via a ref so
  // the cleanup doesn't capture a stale closure.
  const overridesRef = useRef(overrides);
  useEffect(() => { overridesRef.current = overrides; }, [overrides]);
  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        try { onSaveLayoutRef.current?.(overridesRef.current, { userInitiated: false }); } catch { /* best effort */ }
      }
    };
  }, []);

  // Build graph + initial layout
  const { nodes: rawNodes, edges: rawEdges, depth } = useMemo(
    () => buildGraph({ entities, externals, relationships, beneficiaries, user }),
    [entities, externals, relationships, beneficiaries, user]
  );
  // Apply per-estate hide filter. Hidden node-keys drop both their
  // tile AND any edge that touches them, so the visual reads cleanly.
  const { nodes, edges } = useMemo(() => {
    if (hiddenKeys.size === 0) return { nodes: rawNodes, edges: rawEdges };
    const ns = rawNodes.filter((n) => !hiddenKeys.has(n.key));
    const es = rawEdges.filter((e) => !hiddenKeys.has(e.sourceKey) && !hiddenKeys.has(e.targetKey));
    return { nodes: ns, edges: es };
  }, [rawNodes, rawEdges, hiddenKeys]);
  const { positions: initial, canvasW: initialW, canvasH: initialH } = useMemo(
    () => computeInitialLayout(nodes, depth),
    [nodes, depth]
  );

  // Pin every node's initial position the first time we see it, and
  // keep that pinned position stable across subsequent renders. This
  // is what stops a tile from shifting when the user adds a NEW entity
  // — without this, `computeInitialLayout` re-runs across the entire
  // graph (depth + sibling-count change as nodes appear), which moves
  // ANY tile that doesn't yet have an explicit drag-override. Reset
  // the pin map when the estate changes so we don't leak positions
  // from one estate into another.
  const stableInitialRef = useRef({ estateId: null, positions: {} });
  if (stableInitialRef.current.estateId !== estateId) {
    stableInitialRef.current = { estateId, positions: {} };
  }
  // Append-only: any node we haven't pinned yet, take its current
  // initial position and lock it in. Existing pinned positions are
  // never overwritten — that's the whole point.
  Object.entries(initial).forEach(([k, p]) => {
    if (!stableInitialRef.current.positions[k]) {
      stableInitialRef.current.positions[k] = p;
    }
  });

  // Compute "matches the role filter" sets. Two passes:
  //   Pass 1 — persons that match the active filter:
  //     • "Benefactor" → the user node.
  //     • "Beneficiary" → all beneficiary nodes (kind), plus any
  //       external_person whose `titles` includes "Beneficiary".
  //     • Anything else → any person whose `titles` includes that label.
  //   Pass 2 — entities + edges:
  //     • An entity is matched if at least one incoming edge starts
  //       from a matched person AND the edge's role label corresponds
  //       to the filter (so "Trustee" lights up only the trusts that
  //       have the matched trustees).
  //     • An edge is matched when its source is a matched person AND
  //       its role label === filter (or the special-case kind labels).
  // Non-matched tiles + edges render at reduced opacity. The matched
  // ones stay at full opacity so the user instantly sees "who controls
  // this trust?" / "what does this beneficiary inherit from?".
  const ROLE_LABEL = useMemo(() => new Map(ROLE_OPTIONS.map((r) => [r.id, r.label])), []);
  const { activeNodeKeys, activeEdgeIds } = useMemo(() => {
    if (!roleFilter) return { activeNodeKeys: null, activeEdgeIds: null };
    const matchedPersonKeys = new Set();
    nodes.forEach((n) => {
      if (n.kind === 'entity') return;
      const titles = Array.isArray(n.titles) ? n.titles : [];
      if (titles.includes(roleFilter)) matchedPersonKeys.add(n.key);
    });
    const matchedEdgeIds = new Set();
    const matchedEntityKeys = new Set();
    edges.forEach((e) => {
      if (!matchedPersonKeys.has(e.sourceKey)) return;
      const lbl = ROLE_LABEL.get(e.role) || e.role;
      const isSpecial = roleFilter === 'Benefactor' || roleFilter === 'Beneficiary';
      if (isSpecial || lbl === roleFilter) {
        matchedEdgeIds.add(e.id);
        if (e.targetKey.startsWith('entity:')) matchedEntityKeys.add(e.targetKey);
      }
    });
    const all = new Set([...matchedPersonKeys, ...matchedEntityKeys]);
    return { activeNodeKeys: all, activeEdgeIds: matchedEdgeIds };
  }, [roleFilter, nodes, edges, ROLE_LABEL]);

  // Effective position of any node = override OR pinned-stable initial OR
  // current initial OR (legend pseudo-tile fallback). The pinned-stable
  // map (built above) keeps existing tiles fixed when new entities are
  // added; without it, `computeInitialLayout` re-balances rows on every
  // graph change and unmoved tiles drift.
  // Special-case the legend pseudo-tile: if it has never been moved,
  // park it just above-left of the natural tree origin so it lands in
  // the user's viewport when the chart opens centered on the
  // benefactor (the inner positioned layer sits inside PAN_MARGIN, so
  // a small negative-x default still renders inside the outer canvas
  // padding without scrollbar tricks).
  const positionOf = useCallback((key) => {
    if (overrides[key]) return overrides[key];
    if (stableInitialRef.current.positions[key]) return stableInitialRef.current.positions[key];
    if (initial[key]) return initial[key];
    if (key === LEGEND_KEY) return { x: -LEGEND_W - 24, y: 0 };
    return { x: PADDING, y: PADDING };
  }, [overrides, initial]);

  // Canvas size: enforce a generous baseline so the user always has
  // pan-room in every direction (no "side wall" feel when dragging
  // tiles outward). The natural tree sits inside an outer pan margin
  // so users can scroll left/up just as easily as right/down. Tile
  // coordinates remain relative to the natural canvas (so saved
  // overrides keep working unchanged); the margin is purely a render
  // wrapper.
  const PAN_MARGIN = 700;
  const { canvasW, canvasH } = useMemo(() => {
    let w = initialW;
    let h = initialH;
    nodes.forEach((n) => {
      const p = overrides[n.key] || stableInitialRef.current.positions[n.key];
      if (!p) return;
      w = Math.max(w, p.x + n.w + PADDING);
      h = Math.max(h, p.y + n.h + PADDING);
    });
    return { canvasW: w, canvasH: h };
  }, [nodes, overrides, initialW, initialH]);
  const outerW = canvasW + PAN_MARGIN * 2;
  const outerH = canvasH + PAN_MARGIN * 2;

  // Find the benefactor (root user) tile so we always have a canonical
  // "home" for the viewport in centered mode.
  const userKey = useMemo(() => {
    const u = nodes.find((n) => n.kind === 'user');
    return u?.key || null;
  }, [nodes]);

  // ── Initial layout pass ───────────────────────────────────────────────
  // Runs once per (estateId × fitOnLoad × relayoutTick × viewport). Decides
  // (a) the starting zoom and (b) the starting scroll position, then
  // hands them off via scrollIntentRef so they commit synchronously
  // with the new zoom in the same paint (no visible jump frame).
  //
  //   • fitOnLoad=false → zoom 1×, benefactor centered in viewport.
  //   • fitOnLoad=true  → zoom = min(viewportW/treeW, viewportH/treeH, 1.0)
  //                       clamped to [ZOOM_MIN, ZOOM_MAX]; tree-bbox
  //                       centroid centered in viewport.
  //
  // The viewport bucket lives in `viewportTick`, which is bumped by a
  // ResizeObserver below. Without that bump, rotating the device from
  // portrait → landscape leaves the tree scrolled to the old centered
  // x/y inside a viewport that suddenly has very different dimensions —
  // exactly the "tree sits outside the viewport momentarily" symptom
  // the user reported. Bumping viewportTick re-runs this effect and
  // re-issues the centering scrollIntent.
  const initialLayoutKeyRef = useRef('');
  const [viewportTick, setViewportTick] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    let lastW = el.clientWidth;
    let lastH = el.clientHeight;
    let timer = null;
    // We want to re-center AFTER the iOS rotation animation finishes
    // (~250-300 ms). A short rAF-only debounce was too eager and
    // captured intermediate clientHeight values mid-rotation, leaving
    // the tree off-center until the user manually panned. A 280ms
    // trailing-edge debounce settles cleanly on the post-rotation size.
    const SETTLE_MS = 280;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const w = el.clientWidth;
        const h = el.clientHeight;
        // Only re-center on a meaningful change (≥ 32px on either axis)
        // so a vertical scrollbar appearing/disappearing doesn't yank
        // the viewport mid-pan.
        if (Math.abs(w - lastW) < 32 && Math.abs(h - lastH) < 32) return;
        lastW = w; lastH = h;
        setViewportTick((t) => t + 1);
      }, SETTLE_MS);
    };
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule);
      ro.observe(el);
    }
    // Belt-and-suspenders for iOS Safari, which has historically been
    // flaky about firing ResizeObserver inside a transform: scale()
    // ancestor during orientation flips. Listen on both events so
    // every rotation triggers a re-center even when RO is silent.
    const onOrient = () => schedule();
    window.addEventListener('orientationchange', onOrient);
    window.addEventListener('resize', onOrient);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('orientationchange', onOrient);
      window.removeEventListener('resize', onOrient);
      if (timer) clearTimeout(timer);
    };
  }, []);
  useLayoutEffect(() => {
    if (!nodes.length) return;
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (cw === 0 || ch === 0) return; // viewport not measured yet
    const key = `${estateId}|${fitOnLoad ? 'fit' : 'center'}|${relayoutTick}|${viewportTick}`;
    if (initialLayoutKeyRef.current === key) return;

    let nextZoom = 1;
    let scrollX = 0;
    let scrollY = 0;

    if (fitOnLoad) {
      // Compute world bbox of every tile (in natural-canvas coords).
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach((n) => {
        const p = overrides[n.key] || initial[n.key];
        if (!p) return;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x + n.w > maxX) maxX = p.x + n.w;
        if (p.y + n.h > maxY) maxY = p.y + n.h;
      });
      if (Number.isFinite(minX)) {
        const PAD = 60; // breathing room around the tree
        const treeW = (maxX - minX) + PAD * 2;
        const treeH = (maxY - minY) + PAD * 2;
        nextZoom = Math.min(cw / treeW, ch / treeH, 1.0);
        nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZoom));
        const worldCx = (minX + maxX) / 2 + PAN_MARGIN;
        const worldCy = (minY + maxY) / 2 + PAN_MARGIN;
        scrollX = worldCx * nextZoom - cw / 2;
        scrollY = worldCy * nextZoom - ch / 2;
      }
    } else if (userKey) {
      const pos = overrides[userKey] || initial[userKey];
      const node = nodes.find((n) => n.key === userKey);
      if (pos && node) {
        const tileW = node.w || 110;
        const tileH = node.h || 96;
        scrollX = (PAN_MARGIN + pos.x + tileW / 2) * nextZoom - cw / 2;
        scrollY = (PAN_MARGIN + pos.y + tileH / 2) * nextZoom - ch / 2;
      }
    }

    scrollIntentRef.current = { type: 'abs', x: Math.max(0, scrollX), y: Math.max(0, scrollY) };
    initialLayoutKeyRef.current = key;
    // If the new zoom matches the current zoom (very common on
    // rotation in centered mode where zoom stays at 1×), `setZoom`
    // is a no-op and the [zoom]-keyed scroll-commit effect below
    // will NOT re-fire — silently dropping the scroll intent and
    // leaving the chart parked at the pre-rotation scroll position.
    // Commit the absolute scroll synchronously here when there's no
    // zoom change so landscape rotation always re-centers cleanly.
    // (Anchored zoom paths still go through setZoom → commit effect.)
    if (Math.abs(zoomRef.current - nextZoom) < 0.001) {
      const el2 = containerRef.current;
      if (el2) {
        el2.scrollLeft = Math.max(0, scrollX);
        el2.scrollTop = Math.max(0, scrollY);
      }
      scrollIntentRef.current = null;
    } else {
      setZoom(nextZoom);
    }
  }, [estateId, fitOnLoad, relayoutTick, viewportTick, nodes, userKey, overrides, initial]);

  // ── Commit any pending scroll intent the moment the new zoom paints.
  // This is what makes anchored zoom feel snappy: there's no visible
  // jump frame between the scale change and the scroll correction.
  useLayoutEffect(() => {
    const el = containerRef.current;
    const it = scrollIntentRef.current;
    if (!el || !it) return;
    if (it.type === 'anchor') {
      el.scrollLeft = Math.max(0, it.worldX * zoom - it.screenX);
      el.scrollTop = Math.max(0, it.worldY * zoom - it.screenY);
      // Anchor intent is cleared by gestureend / wheel-idle so multiple
      // continuous events keep using the same anchor.
    } else if (it.type === 'abs') {
      el.scrollLeft = Math.max(0, it.x);
      el.scrollTop = Math.max(0, it.y);
      scrollIntentRef.current = null;
    }
  }, [zoom]);

  // ── Pinch-to-zoom (touch events) ──────────────────────────────────────
  // Switched from iOS Safari `gesture*` events to plain `touch*` events.
  // gesture* gave us flaky e.clientX (kept the gesturestart centroid
  // through gesturechange instead of tracking the live midpoint), would
  // bail mid-pinch when React's setState batching paused the gesture
  // for a frame, and never fired at all on Android Chrome / Edge — all
  // of which combined to "zooms not where my fingers are / stops
  // mid-pinch / jitters". Touch events expose the live finger
  // positions directly and let us write zoom + scroll synchronously
  // in the same event tick, so the visible content stays anchored.
  const pinchRef = useRef(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchStart = (e) => {
      // Don't pinch if a tile-drag is already in flight.
      if (dragStateRef.current) return;
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const t1 = e.touches[0], t2 = e.touches[1];
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const rect = el.getBoundingClientRect();
      const ax = cx - rect.left;
      const ay = cy - rect.top;
      const z = zoomRef.current;
      pinchRef.current = {
        startDist: Math.max(20, dist), // avoid divide-by-tiny later
        startZoom: z,
        anchorScreenX: ax,
        anchorScreenY: ay,
        anchorWorldX: (ax + el.scrollLeft) / z,
        anchorWorldY: (ay + el.scrollTop) / z,
      };
    };
    const onTouchMove = (e) => {
      const p = pinchRef.current;
      if (!p) return;
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const t1 = e.touches[0], t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const ratio = dist / p.startDist;
      // Mild damping (0.85) — keeps the gesture from over-amplifying
      // small finger movements without making it feel laggy.
      const damped = Math.pow(ratio, 0.85);
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, p.startZoom * damped));
      // Imperatively pin the anchor to the gesturestart midpoint:
      // newScrollLeft = anchorWorldX * newZoom − anchorScreenX. Doing
      // this synchronously in the same tick as setZoom (instead of in
      // a useLayoutEffect on [zoom]) prevents the visible "snap" the
      // user was seeing when React batched zoom updates.
      zoomRef.current = next;
      setZoom(+next.toFixed(4));
      // After React commits the new transform, set scroll so the
      // anchor stays under the fingers. Schedule via rAF so we run
      // after the layout is up-to-date.
      requestAnimationFrame(() => {
        const lEl = containerRef.current;
        if (!lEl) return;
        lEl.scrollLeft = Math.max(0, p.anchorWorldX * next - p.anchorScreenX);
        lEl.scrollTop = Math.max(0, p.anchorWorldY * next - p.anchorScreenY);
      });
    };
    const onTouchEnd = (e) => {
      // End the pinch when we drop below 2 fingers.
      if (e.touches.length < 2) {
        pinchRef.current = null;
      }
    };
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []); // attach once

  // ── Ctrl/Cmd + wheel zoom (desktop) ───────────────────────────────────
  // macOS trackpad pinch fires wheel events with ctrlKey === true so this
  // handler covers both keyboard zoom and trackpad pinch. Anchored at
  // the cursor.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let clearAnchorTimer = null;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const z = zoomRef.current;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldX = (screenX + el.scrollLeft) / z;
      const worldY = (screenY + el.scrollTop) / z;
      // deltaY positive (scroll down) = zoom out. exp() gives a smooth
      // multiplicative ramp; 0.0025 keeps it gentle.
      const stepFactor = Math.exp(-e.deltaY * 0.0025);
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * stepFactor));
      scrollIntentRef.current = { type: 'anchor', worldX, worldY, screenX, screenY };
      setZoom(+next.toFixed(3));
      if (clearAnchorTimer) clearTimeout(clearAnchorTimer);
      clearAnchorTimer = setTimeout(() => { scrollIntentRef.current = null; }, 200);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (clearAnchorTimer) clearTimeout(clearAnchorTimer);
    };
  }, []);

  // ── Double-tap to reset → re-applies current fit/center mode ─────────
  // Only fires for STATIONARY taps. The previous version listened to
  // pointerup alone, so two quick pan-and-release gestures across the
  // empty canvas registered as a double-tap and yanked the viewport
  // back to center — which manifested as "the chart keeps jumping
  // back" while the user was just trying to pan around.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const TAP_MOVE_TOL = 8;   // px — anything more is a drag, not a tap
    const TAP_TIME_TOL = 250; // ms — anything longer is a long-press
    const DBL_GAP = 320;      // ms — max gap between two taps
    const downRef = { x: 0, y: 0, t: 0, valid: false };
    let lastTapAt = 0;
    const onDown = (e) => {
      const t = e.target;
      if (t && (
        t.closest?.('[data-testid^="entity-node-"]') ||
        t.closest?.('button') ||
        t.closest?.('a')
      )) {
        downRef.valid = false;
        return;
      }
      downRef.x = e.clientX; downRef.y = e.clientY;
      downRef.t = Date.now();
      downRef.valid = true;
    };
    const onUp = (e) => {
      if (!downRef.valid) return;
      const dx = e.clientX - downRef.x;
      const dy = e.clientY - downRef.y;
      const dt = Date.now() - downRef.t;
      // Disqualify drags (panning), long-presses, multi-touch slips.
      if (Math.hypot(dx, dy) > TAP_MOVE_TOL || dt > TAP_TIME_TOL) {
        lastTapAt = 0;
        downRef.valid = false;
        return;
      }
      const now = Date.now();
      if (now - lastTapAt < DBL_GAP) {
        lastTapAt = 0;
        setRelayoutTick((n) => n + 1);
      } else {
        lastTapAt = now;
      }
      downRef.valid = false;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // ---- drag handling ----
  const onPointerDownDrag = (e, node) => {
    // When locked, drag is suppressed so the user can pan/scroll the
    // canvas without nudging tiles, and accidental layout resets are
    // impossible. Click handlers (single/double/info/edit) still fire.
    if (locked) return;
    // Don't start dragging on right-click or on the node click handler — we use
    // a small movement threshold below to disambiguate click vs drag.
    if (e.button === 2) return;
    // Bail if a pinch is already active — pinch-then-drag-while-pinch
    // produced "tile jumping" because both gestures wrote to the
    // viewport in conflicting ways.
    if (pinchRef.current) return;
    const cb = containerRef.current?.getBoundingClientRect();
    if (!cb) return;
    e.preventDefault();
    e.stopPropagation();
    const cur = positionOf(node.key);

    // Determine the "group" that should translate together with the
    // primary dragged tile. Two cases:
    //
    //   (a) The dragged tile is part of an active marquee selection.
    //       Move the entire selection together.
    //   (b) The dragged tile is an entity that has a beneficiary
    //       cluster (`cluster:<eid>`). The cluster follows the parent
    //       entity so the visual relationship stays intact.
    //
    // We capture each member's current origX/origY at drag-start so the
    // pointermove handler can apply a single delta to all of them.
    let groupKeys = null;
    let groupOrig = null;
    if (selectedKeys.size > 0 && selectedKeys.has(node.key)) {
      groupKeys = Array.from(selectedKeys);
    } else if (node.kind === 'entity') {
      const clusterKey = `cluster:${node.id}`;
      if (nodes.some((n) => n.key === clusterKey)) {
        groupKeys = [node.key, clusterKey];
      }
    } else if (node.kind === 'cluster') {
      const entityKey = `entity:${node.id}`;
      if (nodes.some((n) => n.key === entityKey)) {
        groupKeys = [node.key, entityKey];
      }
    }
    if (groupKeys && groupKeys.length > 1) {
      groupOrig = {};
      groupKeys.forEach((k) => {
        const p = positionOf(k);
        groupOrig[k] = { x: p.x, y: p.y };
      });
    } else {
      groupKeys = null;
    }

    dragStateRef.current = {
      key: node.key,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: cur.x,
      origY: cur.y,
      pointerId: e.pointerId,
      moved: false,
      w: node.w,
      h: node.h,
      groupKeys,
      groupOrig,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    // Also wire window-level listeners as a safety net. iOS PWA
    // setPointerCapture is unreliable across Safari versions — without
    // these, a finger that drifts off the tile element would lose
    // pointermove events and the tile would "stick" until the next
    // pointer event on the chart, manifesting as the tile teleporting
    // when the user re-touched the canvas.
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
    setDraggingKey(node.key);
  };

  const applyDragMove = (clientX, clientY) => {
    const ds = dragStateRef.current;
    if (!ds) return;
    const dx = clientX - ds.startClientX;
    const dy = clientY - ds.startClientY;
    if (!ds.moved && Math.hypot(dx, dy) < 4) return; // movement threshold
    ds.moved = true;
    // Pointer deltas are in viewport pixels but tile coords live in
    // natural-canvas space. With a CSS scale(zoom) wrapper we have to
    // divide deltas by zoom or the dragged tile drifts away from the
    // cursor at non-1× zoom levels. Read zoom from the ref (always
    // current) — closing over React state could read a stale value
    // briefly during pinch+drag interleavings.
    const z = zoomRef.current || 1;
    const ndx = dx / z;
    const ndy = dy / z;
    if (ds.groupKeys && ds.groupOrig) {
      // Translate every member of the group by the same delta so an
      // entity drags its mini-cluster (Ask 2) and a marquee selection
      // drags as a unit (Ask 3) without falling apart.
      setOverrides((prev) => {
        const next = { ...prev };
        ds.groupKeys.forEach((k) => {
          const o = ds.groupOrig[k];
          if (!o) return;
          next[k] = { ...(prev[k] || {}), x: o.x + ndx, y: o.y + ndy };
        });
        return next;
      });
    } else {
      setOverrides((prev) => ({
        ...prev,
        [ds.key]: { ...(prev[ds.key] || {}), x: ds.origX + ndx, y: ds.origY + ndy },
      }));
    }
  };

  const onPointerMove = (e) => {
    applyDragMove(e.clientX, e.clientY);
  };

  // Window-level fallback: we listen here whenever a drag is in flight
  // so movements that leave the chart's bounding box still update the
  // tile. Removed in onWindowPointerUp.
  const onWindowPointerMove = (e) => {
    applyDragMove(e.clientX, e.clientY);
  };
  const onWindowPointerUp = () => {
    onPointerUp();
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointercancel', onWindowPointerUp);
  };

  const onPointerUp = () => {
    const ds = dragStateRef.current;
    if (!ds) {
      // Clear marquee selection on a plain tap-and-release on blank
      // canvas (no drag, no long-press fired). This keeps the
      // "selected" outline from getting sticky.
      if (!marqueeRef.current && longPressTimerRef.current === null && longPressOriginRef.current === null) {
        if (selectedKeys.size > 0) setSelectedKeys(new Set());
      }
      return;
    }
    if (ds.moved) {
      recentDragRef.current = true;
      // clear after the click event has had a chance to fire
      setTimeout(() => { recentDragRef.current = false; }, 50);
      // Persist to localStorage on drop. We intentionally DO NOT
      // re-shift the entire layout when a tile lands in negative space
      // — the outer canvas already provides PAN_MARGIN px of room on
      // every side, so a tile dragged left of the natural tree should
      // simply stay there, not yank the rest of the chart back toward
      // the centre.
      setOverrides((prev) => {
        persistOverrides(prev);
        return prev;
      });
    }
    dragStateRef.current = null;
    setDraggingKey(null);
  };

  // ---- Marquee selection helpers (Ask 3) ----------------------------------
  // Map a viewport-space (clientX, clientY) into chart-canvas coords by
  // subtracting the container bounds and dividing by zoom. The chart
  // is rendered inside a CSS-scaled wrapper so this matches what we
  // store in `overrides`.
  const eventToCanvasXY = (clientX, clientY) => {
    const cb = containerRef.current?.getBoundingClientRect();
    if (!cb) return { x: 0, y: 0 };
    const z = zoomRef.current || 1;
    const sx = containerRef.current.scrollLeft || 0;
    const sy = containerRef.current.scrollTop || 0;
    return {
      x: (clientX - cb.left + sx) / z,
      y: (clientY - cb.top + sy) / z,
    };
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  };

  // Pointer-down on EMPTY canvas (i.e., not on a tile). Tiles call
  // `stopPropagation` in their own pointerdown so this only fires when
  // the user touches blank chart space. Schedule a 350 ms long-press
  // timer; if the pointer stays within ~6 px until it expires we start
  // drawing a marquee rect (`setMarquee`). Otherwise it's just a tap
  // or a regular scroll/pan and we cancel.
  const onContainerPointerDown = (e) => {
    if (locked) return;
    if (e.button === 2) return;
    if (pinchRef.current) return;
    const pt = eventToCanvasXY(e.clientX, e.clientY);
    longPressOriginRef.current = { clientX: e.clientX, clientY: e.clientY, canvasX: pt.x, canvasY: pt.y };
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      if (!longPressOriginRef.current) return;
      // Clear any prior selection — starting a fresh marquee.
      setSelectedKeys(new Set());
      const rect = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
      marqueeRef.current = rect;
      setMarquee(rect);
    }, 350);
  };

  const onContainerPointerMove = (e) => {
    // Existing drag-move logic stays first.
    applyDragMove(e.clientX, e.clientY);
    // Cancel pending long-press if the finger drifts before the timer.
    if (longPressTimerRef.current && longPressOriginRef.current) {
      const ox = longPressOriginRef.current.clientX;
      const oy = longPressOriginRef.current.clientY;
      if (Math.hypot(e.clientX - ox, e.clientY - oy) > 6) {
        cancelLongPress();
      }
    }
    // Update marquee rect if active.
    if (marqueeRef.current) {
      const pt = eventToCanvasXY(e.clientX, e.clientY);
      const next = {
        x0: marqueeRef.current.x0,
        y0: marqueeRef.current.y0,
        x1: pt.x,
        y1: pt.y,
      };
      marqueeRef.current = next;
      setMarquee(next);
    }
  };

  const onContainerPointerUp = () => {
    cancelLongPress();
    // Finalize marquee — compute selection.
    if (marqueeRef.current) {
      const m = marqueeRef.current;
      const minX = Math.min(m.x0, m.x1);
      const maxX = Math.max(m.x0, m.x1);
      const minY = Math.min(m.y0, m.y1);
      const maxY = Math.max(m.y0, m.y1);
      const sel = new Set();
      nodes.forEach((n) => {
        const p = positionOf(n.key);
        const cx = p.x + n.w / 2;
        const cy = p.y + n.h / 2;
        if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
          sel.add(n.key);
        }
      });
      marqueeRef.current = null;
      setMarquee(null);
      setSelectedKeys(sel);
    }
    onPointerUp();
  };

  // Clear marquee selection when the user taps anywhere that isn't a
  // selected tile and isn't the start of a new marquee. The simple
  // heuristic: any pointerdown on the container that DOESN'T evolve
  // into a long-press OR a drag of a selected tile clears the set.
  // We handle that by clearing in `onContainerPointerDown` if the user
  // taps blank canvas and the long-press never fires (handled in the
  // existing flow — if they just tap, the long-press timer is canceled
  // by the pointerup at < 350 ms; we clear `selectedKeys` then too).

  if (!nodes.length) return null;

  // Build obstacle list = every tile rect (we exclude src/tgt for each edge inside the loop).
  // Also include the legend tile so edges don't route through it — it
  // visually behaves like another tile, just without lines connected.
  const tileRects = nodes.map((n) => {
    const p = positionOf(n.key);
    return {
      key: n.key,
      x: p.x,
      y: p.y,
      w: n.w,
      h: n.h,
    };
  });
  if (!legendHidden) {
    const lp = positionOf(LEGEND_KEY);
    tileRects.push({ key: LEGEND_KEY, x: lp.x, y: lp.y, w: LEGEND_W, h: LEGEND_H });
  }
  const rectByKey = Object.fromEntries(tileRects.map((r) => [r.key, r]));

  // Build the SVG edge layer as raw markup to bypass the platform's
  // `<span data-ve-dynamic>` instrumentation that wraps React .map() output —
  // SVG cannot have HTML span ancestors without breaking the namespace, which
  // was preventing edges from rendering at all.
  const edgesSvgInner = (() => {
    const parts = [
      `<defs><linearGradient id="ec-flow-gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${canvasH}">` +
      `<stop offset="0%" stop-color="#D4A537" stop-opacity="0.95"/>` +
      `<stop offset="100%" stop-color="#7A5A23" stop-opacity="0.7"/></linearGradient></defs>`,
    ];
    edges.forEach((edge) => {
      const sR = rectByKey[edge.sourceKey];
      const tR = rectByKey[edge.targetKey];
      if (!sR || !tR) return;
      const obstacles = tileRects.filter((r) => r.key !== sR.key && r.key !== tR.key);
      const { points, midPoint } = routeEdge(sR, tR, obstacles, edge.id);
      const role = ROLE_PALETTE[edge.role] || ROLE_PALETTE.owner;
      const isEquity = (
        edge.role === 'owner' || edge.role === 'member' ||
        edge.role === 'shareholder' || edge.role === 'gp' || edge.role === 'lp' ||
        edge.role === 'joint_tenant' || edge.role === 'tenant_in_common' ||
        edge.role === 'community_property'
      );
      const stroke = isEquity ? 'url(#ec-flow-gold)' : role.color;
      const sw = isEquity && edge.ownership_pct
        ? Math.max(1.6, Math.min(3.4, edge.ownership_pct / 33)) : 1.8;
      const d = polylineToRoundedPath(points);
      const dash = role.dash ? ` stroke-dasharray="${role.dash}"` : '';
      // Dim non-matching edges when a role filter is active.
      const dimmed = activeEdgeIds && !activeEdgeIds.has(edge.id);
      const groupOpacity = dimmed ? 0.18 : 1;
      const edgeOpacity = dimmed ? 0.6 : 0.95;
      parts.push(
        `<g style="color:${role.color}" opacity="${groupOpacity}">` +
        `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash} opacity="${edgeOpacity}" class="ec-edge"/>` +
        (isEquity && edge.ownership_pct != null
          ? `<g transform="translate(${midPoint.x - 18}, ${midPoint.y - 9})">` +
            `<rect width="36" height="18" rx="9" fill="#0b1120" stroke="#D4A537" stroke-width="1" opacity="0.92"/>` +
            `<text x="18" y="13" text-anchor="middle" font-size="10" font-weight="700" fill="#D4A537">${Math.round(edge.ownership_pct)}%</text>` +
            `</g>`
          : '') +
        `</g>`
      );
    });
    return parts.join('');
  })();

  return (
    <div
      ref={containerRef}
      data-testid="entity-org-chart"
      className="relative"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 260,
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: draggingKey ? 'none' : 'auto',
      }}
      onPointerDown={onContainerPointerDown}
      onPointerMove={onContainerPointerMove}
      onPointerUp={onContainerPointerUp}
      onPointerCancel={onContainerPointerUp}
    >
      <style>{`
        .ec-edge { /* shadow disabled for now while we sanity-check rendering */ }
      `}</style>

      {/* Floating "Filtering by …" pill — appears whenever a role chip
          on a person tile is tapped. Sticky to the chart's top-center
          inside the scrollable viewport so it never scrolls off, and
          z-indexed above tiles + edges. Tap × to clear. */}
      {roleFilter && (
        <div
          className="absolute top-2 left-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap"
          style={{
            transform: 'translateX(-50%)',
            background: 'rgba(11,17,32,0.92)',
            border: '1px solid var(--gold)',
            color: 'var(--gold)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 18px rgba(0,0,0,0.45), 0 0 14px rgba(212,165,55,0.35)',
            position: 'sticky',
          }}
          data-testid="entity-role-filter-pill"
        >
          <span>Filtering by:</span>
          <span style={{ color: '#fff' }}>{roleFilter}</span>
          <button
            type="button"
            onClick={() => setRoleFilter(null)}
            className="ml-1 inline-flex items-center justify-center rounded-full transition-colors hover:bg-[rgba(212,165,55,0.18)]"
            style={{
              width: 20, height: 20,
              border: '1px solid rgba(212,165,55,0.55)',
              color: 'var(--gold)',
            }}
            aria-label="Clear role filter"
            title="Clear filter"
            data-testid="entity-role-filter-clear"
          >
            <span style={{ fontSize: 12, lineHeight: 1 }}>×</span>
          </button>
        </div>
      )}

      {/* Hidden-tiles pill — appears whenever the user has dismissed
          one or more tiles from the chart. Click to restore all. */}
      {hiddenKeys.size > 0 && (
        <button
          type="button"
          onClick={showAllHidden}
          className="absolute z-40 flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap transition-colors hover:bg-[rgba(212,165,55,0.18)]"
          style={{
            top: roleFilter ? 44 : 8,
            right: 8,
            background: 'rgba(11,17,32,0.92)',
            border: '1px solid var(--gold)',
            color: 'var(--gold)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 18px rgba(0,0,0,0.45), 0 0 14px rgba(212,165,55,0.35)',
            position: 'sticky',
          }}
          data-testid="entity-hidden-tiles-pill"
          aria-label={`Show ${hiddenKeys.size} hidden tile${hiddenKeys.size === 1 ? '' : 's'}`}
          title="Restore all hidden tiles"
        >
          <span>{hiddenKeys.size} hidden</span>
          <span style={{ opacity: 0.7 }}>·</span>
          <span style={{ color: '#fff' }}>Show all</span>
        </button>
      )}

      {/* Outer pan-margin layer. Sized in screen pixels (outerW × zoom)
          so the parent's overflow:auto gets correct scroll bounds.
          Inside, a scale(zoom) wrapper carries the actual visual zoom
          with transformOrigin: top-left so screen-px math lines up
          cleanly. Coordinates on tiles remain in natural-canvas space
          so saved drag overrides keep working unchanged. */}
      <div className="relative" style={{ width: outerW * zoom, height: outerH * zoom }}>
        <div
          className="relative"
          style={{
            width: outerW,
            height: outerH,
            transform: zoom !== 1 ? `scale(${zoom})` : undefined,
            transformOrigin: 'top left',
          }}
        >
        <div
          className="absolute"
          style={{ left: PAN_MARGIN, top: PAN_MARGIN, width: canvasW, height: canvasH }}
        >
        {/* SVG line layer — innerHTML to bypass the platform's <span data-ve-dynamic>
            wrappers that would otherwise corrupt SVG namespace rendering. */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={canvasW} height={canvasH}
          style={{ overflow: 'visible' }}
          dangerouslySetInnerHTML={{ __html: edgesSvgInner }}
        />

        {/* Marquee selection rectangle (Ask 3) — only visible while
            the user is actively dragging out a selection. */}
        {marquee && (() => {
          const x = Math.min(marquee.x0, marquee.x1);
          const y = Math.min(marquee.y0, marquee.y1);
          const w = Math.abs(marquee.x1 - marquee.x0);
          const h = Math.abs(marquee.y1 - marquee.y0);
          return (
            <div
              data-testid="marquee-rect"
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: w,
                height: h,
                pointerEvents: 'none',
                background: 'rgba(212,175,55,0.10)',
                border: '1.5px dashed rgba(212,175,55,0.75)',
                borderRadius: 6,
                zIndex: 40,
              }}
            />
          );
        })()}

        {/* Tile layer */}
        {nodes.map((n) => {
          const p = positionOf(n.key);
          const isDragging = draggingKey === n.key;
          const handleClick = (e) => {
            // Suppress click if a drag actually moved the tile
            if (dragStateRef.current?.moved || recentDragRef.current) {
              e.preventDefault(); e.stopPropagation();
              return;
            }
            // Defer single-click action so a double-click within ~250ms can cancel it.
            if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
            clickTimerRef.current = setTimeout(() => {
              clickTimerRef.current = null;
              onSingleClickNode?.(n);
            }, 230);
          };
          const handleDoubleClick = (e) => {
            // Cancel the pending single-click
            if (clickTimerRef.current) {
              clearTimeout(clickTimerRef.current);
              clickTimerRef.current = null;
            }
            if (recentDragRef.current) return;
            e.preventDefault(); e.stopPropagation();
            onDoubleClickNode?.(n);
          };
          const handleInfoClick = (e) => {
            // Capture the tile rect for popover anchoring. Walk up from the
            // click target until we hit the [data-testid="entity-node-..."] tile.
            let tileEl = e.currentTarget;
            while (tileEl && !tileEl.dataset?.testid?.startsWith('entity-node-')) {
              tileEl = tileEl.parentElement;
            }
            const rect = tileEl ? tileEl.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
            onInfoClickNode?.(n, rect);
          };
          const handleEditClick = () => {
            onEditClickNode?.(n);
          };
          const handleHideClick = () => {
            // Opens the confirm modal — actual hide / delete happens
            // in confirmRemoveHide / confirmRemoveDelete below.
            openRemoveModal(n);
          };
          return (
            <div
              key={n.key}
              data-selected={selectedKeys.has(n.key) ? 'true' : undefined}
              style={{
                position: 'absolute',
                left: p.x,
                top: p.y,
                zIndex: isDragging ? 30 : 10,
                transition: isDragging ? 'none' : 'box-shadow 200ms ease, opacity 200ms ease',
                opacity: activeNodeKeys && !activeNodeKeys.has(n.key) ? 0.25 : 1,
                // Selection ring (Ask 3): a subtle gold glow on every
                // tile the marquee picked up so the user knows what
                // moves together.
                boxShadow: selectedKeys.has(n.key)
                  ? '0 0 0 3px rgba(212,175,55,0.85), 0 0 18px rgba(212,175,55,0.55)'
                  : undefined,
                borderRadius: selectedKeys.has(n.key) ? 12 : undefined,
              }}
            >
              {n.kind === 'entity' ? (
                <EntityTile node={n} dragging={isDragging}
                  locked={locked || readOnly}
                  onPointerDownDrag={(e) => onPointerDownDrag(e, n)}
                  onClick={handleClick}
                  onDoubleClick={readOnly ? undefined : handleDoubleClick}
                  onInfoClick={handleInfoClick}
                  onEditClick={readOnly ? undefined : handleEditClick}
                  onHideClick={readOnly ? undefined : handleHideClick} />
              ) : n.kind === 'cluster' ? (
                <ClusterTile node={n} dragging={isDragging}
                  locked={locked || readOnly}
                  entities={entities}
                  onPointerDownDrag={(e) => onPointerDownDrag(e, n)}
                  onClick={handleClick}
                  onHideClick={readOnly ? undefined : handleHideClick} />
              ) : (
                <PersonTile
                  node={n}
                  palette={
                    n.kind === 'user' ? PALETTE.cream :
                    n.kind === 'beneficiary' ? { stroke: n.avatar_color || '#22C993' } :
                    PALETTE.slate
                  }
                  dragging={isDragging}
                  locked={locked || readOnly}
                  onPointerDownDrag={(e) => onPointerDownDrag(e, n)}
                  onClick={handleClick}
                  onDoubleClick={readOnly ? undefined : handleDoubleClick}
                  onInfoClick={handleInfoClick}
                  onEditClick={readOnly ? undefined : handleEditClick}
                  onHideClick={readOnly ? undefined : handleHideClick}
                  roleFilter={roleFilter}
                  onTitleClick={handleTitleClick}
                />
              )}
            </div>
          );
        })}

        {/* Legend pseudo-tile — lives inside the same panned/zoomed
            inner layer as the regular tiles, so it pans + zooms with
            the tree exactly like another node. Drag uses the chart's
            zoom-aware onPointerDownDrag, so deltas feel identical. */}
        {!legendHidden && (() => {
          const lp = positionOf(LEGEND_KEY);
          const isLegendDragging = draggingKey === LEGEND_KEY;
          return (
            <div
              key={LEGEND_KEY}
              style={{
                position: 'absolute',
                left: lp.x,
                top: lp.y,
                zIndex: isLegendDragging ? 30 : 12,
                transition: isLegendDragging ? 'none' : 'box-shadow 200ms ease',
              }}
              data-testid="entity-legend-wrapper"
            >
              <EntityLegend
                entities={entities}
                relationships={relationships}
                dragging={isLegendDragging}
                onPointerDownDrag={(e) => onPointerDownDrag(e, { key: LEGEND_KEY, w: LEGEND_W, h: LEGEND_H })}
                onHide={() => onHideLegend?.()}
              />
            </div>
          );
        })()}
        </div>
        </div>
      </div>

      {/* Per-tile Remove confirm modal. Renders via React portal so it
          sits above any zoom/pan transforms and any iOS PWA scroll
          containers. The benefactor (user) tile only gets the "Hide
          from chart" action — there's no DB record to delete. */}
      {confirmRemoveNode && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center px-4"
          style={{ background: 'rgba(11,17,32,0.78)', backdropFilter: 'blur(6px)' }}
          onClick={closeRemoveModal}
          data-testid="entity-remove-modal-backdrop"
        >
          <div
            className="w-full max-w-md rounded-2xl p-5 shadow-2xl overflow-y-auto"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--gold)',
              color: 'var(--t)',
              maxHeight: '85vh',
            }}
            onClick={(e) => e.stopPropagation()}
            data-testid="entity-remove-modal"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-base font-bold" style={{ color: 'var(--gold)' }}>
                  Remove this tile?
                </div>
                <div className="text-[13px] mt-1" style={{ color: 'var(--t3)' }}>
                  {(() => {
                    const n = confirmRemoveNode;
                    if (n.kind === 'entity') {
                      return `"${n.entity?.name || 'Entity'}" — deleting will also remove every connection to this entity.`;
                    }
                    if (n.kind === 'cluster') {
                      const parentName = (entities || []).find((e) => e.id === n.id)?.name || 'this entity';
                      return `${n.members?.length || 0} beneficiar${(n.members?.length || 0) === 1 ? 'y' : 'ies'} are linked to ${parentName}. Deleting will unlink every one (the underlying beneficiary records are kept).`;
                    }
                    if (n.kind === 'user') {
                      return `"${n.label || 'You'}" — this is your benefactor tile. You can hide it from the chart, but you can't delete yourself from your own estate.`;
                    }
                    if (n.kind === 'beneficiary') {
                      return `"${n.label || 'Beneficiary'}" — deleting permanently removes this beneficiary from your estate (everywhere they appear).`;
                    }
                    return `"${n.label || 'Person'}" — deleting permanently removes this person from your estate.`;
                  })()}
                </div>
              </div>
              <button
                type="button"
                onClick={closeRemoveModal}
                aria-label="Close"
                className="rounded-full p-1 hover:bg-[rgba(255,255,255,0.08)] flex-shrink-0"
                style={{ color: 'var(--t3)' }}
                data-testid="entity-remove-modal-close"
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              <button
                type="button"
                onClick={confirmRemoveHide}
                className="flex-1 rounded-md px-4 py-2.5 text-sm font-semibold"
                style={{
                  background: 'rgba(212,165,55,0.12)',
                  border: '1px solid var(--gold)',
                  color: 'var(--gold)',
                }}
                data-testid="entity-remove-modal-hide"
              >
                Hide from chart only
              </button>
              {confirmRemoveNode.kind !== 'user' && typeof onDeleteNode === 'function' && (
                <button
                  type="button"
                  onClick={confirmRemoveDelete}
                  className="flex-1 rounded-md px-4 py-2.5 text-sm font-semibold"
                  style={{
                    background: '#7F1D1D',
                    border: '1px solid #DC2626',
                    color: '#FEE2E2',
                  }}
                  data-testid="entity-remove-modal-delete"
                >
                  Delete permanently
                </button>
              )}
            </div>
            <div className="text-[11px] mt-3" style={{ color: 'var(--t4)' }}>
              {confirmRemoveNode.kind === 'user'
                ? 'Tip: click the "N hidden · Show all" pill in the top-right to restore.'
                : 'Hiding is reversible. Deleting fires after a 5-second Undo window — tap "Undo" in the toast if you change your mind.'}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

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
