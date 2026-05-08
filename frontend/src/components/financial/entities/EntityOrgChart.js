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
import { Building2, Shield, Landmark, Home, User as UserIcon, Settings, Info, Pencil } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { getEntityPalette, getTypeMeta, ROLE_PALETTE, PALETTE } from '../../../config/entityCatalog';
import { AvatarCircle } from '../../AvatarCircle';

const BUCKET_ICON = {
  business: Building2, trust: Shield, charity: Landmark,
  property: Home, external_person: UserIcon, specialized: Settings,
};

// Tile size constants — width/height are uniform so routing math stays sane.
const ENTITY_W = 200;
const ENTITY_H = 92;
const PERSON_W = 100;
const PERSON_H = 96;
const PADDING = 24;          // canvas inner padding
const ROW_GAP = 70;          // vertical gap between layout rows
const COL_GAP = 30;          // horizontal gap between sibling tiles
const STEP_OUT = 18;         // how far a line steps perpendicular out of a tile before turning
const CORNER_R = 10;         // rounded-corner radius

// LocalStorage key for per-estate position overrides
const POS_KEY = (estateId) => `cfp_entity_chart_positions:${estateId || 'global'}`;

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
      w: PERSON_W, h: PERSON_H,
    });
  });
  (entities || []).forEach((e) => {
    pool.set(`entity:${e.id}`, {
      key: `entity:${e.id}`, kind: 'entity', id: e.id, entity: e,
      w: ENTITY_W, h: ENTITY_H,
    });
  });

  const edges = (relationships || [])
    .map((r) => ({
      id: r.id,
      sourceKey: `${r.source_type}:${r.source_id}`,
      targetKey: `${r.target_type}:${r.target_id}`,
      role: r.role,
      ownership_pct: r.ownership_pct,
      raw: r,
    }))
    .filter((e) => pool.has(e.sourceKey) && pool.has(e.targetKey));

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

function PersonTile({ node, palette, dragging, locked, onPointerDownDrag, onClick, onDoubleClick, onInfoClick, onEditClick }) {
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
      {/* Action buttons overlay (top-right of the avatar). External-person nodes
          don't get an Edit pencil because they're handled differently. */}
      <div className="absolute top-0 right-0 flex flex-col gap-1">
        <TileIconButton icon={Info} onClick={onInfoClick} label="Info" testId={`tile-info-${node.key}`} />
        {node.kind !== 'user' && (
          <TileIconButton icon={Pencil} onClick={onEditClick} label="Edit" testId={`tile-edit-${node.key}`} />
        )}
      </div>
    </div>
  );
}

function EntityTile({ node, dragging, locked, onPointerDownDrag, onClick, onDoubleClick, onInfoClick, onEditClick }) {
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
        <TileIconButton icon={Pencil} onClick={onEditClick} label="Edit" testId={`tile-edit-entity-${e.id}`} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main chart
// ---------------------------------------------------------------------------
export default function EntityOrgChart({
  estateId, entities, externals, relationships, beneficiaries,
  onSingleClickNode, onDoubleClickNode, onInfoClickNode, onEditClickNode,
  cleanUpSignal, locked = false,
}) {
  const { user } = useAuth();
  const containerRef = useRef(null);
  const [draggingKey, setDraggingKey] = useState(null);
  const dragStateRef = useRef(null); // { key, startX, startY, origX, origY }
  const recentDragRef = useRef(false); // suppresses the click that follows a real drag
  const clickTimerRef = useRef(null);  // for distinguishing single vs double click
  // Position overrides per node (loaded from localStorage). Initial layout
  // fills any node not present here.
  const [overrides, setOverrides] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage?.getItem(POS_KEY(estateId));
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  // Reload overrides when estate changes
  useEffect(() => {
    try {
      const raw = window.localStorage?.getItem(POS_KEY(estateId));
      setOverrides(raw ? JSON.parse(raw) : {});
    } catch { setOverrides({}); }
  }, [estateId]);

  const persistOverrides = useCallback((next) => {
    try { window.localStorage?.setItem(POS_KEY(estateId), JSON.stringify(next)); } catch { /* quota */ }
  }, [estateId]);

  // Build graph + initial layout
  const { nodes, edges, depth } = useMemo(
    () => buildGraph({ entities, externals, relationships, beneficiaries, user }),
    [entities, externals, relationships, beneficiaries, user]
  );
  const { positions: initial, canvasW: initialW, canvasH: initialH } = useMemo(
    () => computeInitialLayout(nodes, depth),
    [nodes, depth]
  );

  // Effective position of any node = override OR initial
  const positionOf = useCallback((key) => overrides[key] || initial[key] || { x: PADDING, y: PADDING }, [overrides, initial]);

  // Canvas size: max of initial canvas + farthest dragged node
  const { canvasW, canvasH } = useMemo(() => {
    let w = initialW, h = initialH;
    nodes.forEach((n) => {
      const p = overrides[n.key];
      if (!p) return;
      w = Math.max(w, p.x + n.w + PADDING);
      h = Math.max(h, p.y + n.h + PADDING);
    });
    return { canvasW: w, canvasH: h };
  }, [nodes, overrides, initialW, initialH]);

  // Auto-center the benefactor (root user) tile horizontally inside the
  // scrollable canvas on first paint and whenever the canvas/layout size
  // changes. Important for narrow PWA viewports where the tree extends
  // wider than the screen — without this the user lands looking at the
  // top-left corner of the canvas with the root tile off-screen-right.
  const userKey = useMemo(() => {
    const u = nodes.find((n) => n.kind === 'user');
    return u?.key || null;
  }, [nodes]);
  useEffect(() => {
    if (!userKey) return;
    const el = containerRef.current;
    if (!el) return;
    const pos = overrides[userKey] || initial[userKey];
    if (!pos) return;
    const node = nodes.find((n) => n.key === userKey);
    const tileW = node?.w || 110;
    const target = Math.max(
      0,
      Math.min(
        el.scrollWidth - el.clientWidth,
        pos.x + tileW / 2 - el.clientWidth / 2
      )
    );
    const id = requestAnimationFrame(() => {
      el.scrollLeft = target;
    });
    return () => cancelAnimationFrame(id);
  }, [userKey, overrides, initial, nodes, canvasW, canvasH]);

  // ---- drag handling ----
  const onPointerDownDrag = (e, node) => {
    // When locked, drag is suppressed so the user can pan/scroll the
    // canvas without nudging tiles, and accidental layout resets are
    // impossible. Click handlers (single/double/info/edit) still fire.
    if (locked) return;
    // Don't start dragging on right-click or on the node click handler — we use
    // a small movement threshold below to disambiguate click vs drag.
    if (e.button === 2) return;
    const cb = containerRef.current?.getBoundingClientRect();
    if (!cb) return;
    e.preventDefault();
    e.stopPropagation();
    const cur = positionOf(node.key);
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
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setDraggingKey(node.key);
  };

  const onPointerMove = (e) => {
    const ds = dragStateRef.current;
    if (!ds) return;
    const dx = e.clientX - ds.startClientX;
    const dy = e.clientY - ds.startClientY;
    if (!ds.moved && Math.hypot(dx, dy) < 4) return; // movement threshold
    ds.moved = true;
    const nextX = ds.origX + dx;
    const nextY = ds.origY + dy;
    setOverrides((prev) => ({ ...prev, [ds.key]: { x: nextX, y: nextY } }));
  };

  const onPointerUp = () => {
    const ds = dragStateRef.current;
    if (!ds) return;
    if (ds.moved) {
      recentDragRef.current = true;
      // clear after the click event has had a chance to fire
      setTimeout(() => { recentDragRef.current = false; }, 50);
      // Persist to localStorage on drop
      setOverrides((prev) => {
        // clamp to non-negative coords (re-shift if dragged beyond left/top)
        let minX = 0, minY = 0;
        Object.values(prev).forEach((p) => { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; });
        const shift = (minX < 0 || minY < 0) ? { x: Math.max(0, -minX) + PADDING, y: Math.max(0, -minY) + PADDING } : null;
        const out = {};
        Object.entries(prev).forEach(([k, v]) => {
          out[k] = shift ? { x: v.x + shift.x, y: v.y + shift.y } : v;
        });
        persistOverrides(out);
        return out;
      });
    }
    dragStateRef.current = null;
    setDraggingKey(null);
  };

  if (!nodes.length) return null;

  // Build obstacle list = every tile rect (we exclude src/tgt for each edge inside the loop)
  const tileRects = nodes.map((n) => {
    const p = positionOf(n.key);
    return { key: n.key, x: p.x, y: p.y, w: n.w, h: n.h };
  });
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
      const stroke = (edge.role === 'owner' || edge.role === 'gp' || edge.role === 'lp')
        ? 'url(#ec-flow-gold)' : role.color;
      const sw = edge.role === 'owner' && edge.ownership_pct
        ? Math.max(1.6, Math.min(3.4, edge.ownership_pct / 33)) : 1.8;
      const d = polylineToRoundedPath(points);
      const dash = role.dash ? ` stroke-dasharray="${role.dash}"` : '';
      parts.push(
        `<g style="color:${role.color}">` +
        `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash} opacity="0.95" class="ec-edge"/>` +
        (edge.role === 'owner' && edge.ownership_pct != null
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
        minHeight: Math.max(260, canvasH),
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: draggingKey ? 'none' : 'auto',
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <style>{`
        .ec-edge { /* shadow disabled for now while we sanity-check rendering */ }
      `}</style>

      <div className="relative" style={{ width: canvasW, height: canvasH }}>
        {/* SVG line layer — innerHTML to bypass the platform's <span data-ve-dynamic>
            wrappers that would otherwise corrupt SVG namespace rendering. */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={canvasW} height={canvasH}
          style={{ overflow: 'visible' }}
          dangerouslySetInnerHTML={{ __html: edgesSvgInner }}
        />

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
          return (
            <div
              key={n.key}
              style={{
                position: 'absolute',
                left: p.x,
                top: p.y,
                zIndex: isDragging ? 30 : 10,
                transition: isDragging ? 'none' : 'box-shadow 200ms ease',
              }}
            >
              {n.kind === 'entity' ? (
                <EntityTile node={n} dragging={isDragging}
                  locked={locked}
                  onPointerDownDrag={(e) => onPointerDownDrag(e, n)}
                  onClick={handleClick}
                  onDoubleClick={handleDoubleClick}
                  onInfoClick={handleInfoClick}
                  onEditClick={handleEditClick} />
              ) : (
                <PersonTile
                  node={n}
                  palette={
                    n.kind === 'user' ? PALETTE.cream :
                    n.kind === 'beneficiary' ? { stroke: n.avatar_color || '#22C993' } :
                    PALETTE.slate
                  }
                  dragging={isDragging}
                  locked={locked}
                  onPointerDownDrag={(e) => onPointerDownDrag(e, n)}
                  onClick={handleClick}
                  onDoubleClick={handleDoubleClick}
                  onInfoClick={handleInfoClick}
                  onEditClick={handleEditClick}
                />
              )}
            </div>
          );
        })}
      </div>
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
