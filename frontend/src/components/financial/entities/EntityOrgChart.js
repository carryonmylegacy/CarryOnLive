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
import { RemoveTileModal } from './RemoveTileModal';
import { notify } from '../../AppNotification';
import { Settings, Info, Pencil } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { getEntityPalette, getTypeMeta, ROLE_PALETTE, PALETTE, ROLE_OPTIONS } from '../../../config/entityCatalog';
import EntityLegend, { LEGEND_W, LEGEND_H } from './EntityLegend';

import { AvatarCircle } from '../../AvatarCircle';
import {
  LEGEND_KEY,
  BUCKET_ICON,
  ENTITY_W,
  ENTITY_H,
  PERSON_W,
  PERSON_H,
  PADDING,
  ROW_GAP,
  COL_GAP,
  STEP_OUT,
  CORNER_R,
  CLUSTER_AVATAR,
  CLUSTER_SLOT_W,
  CLUSTER_SLOT_H,
  CLUSTER_COLS,
  CLUSTER_HEADER_H,
  CLUSTER_PAD_X,
  CLUSTER_PAD_Y,
  CLUSTER_HALF_STEP,
  CLUSTER_W,
  clusterHeight,
  POS_KEY,
  HIDDEN_KEY,
} from './entityChartConstants';

// buildGraph + computeInitialLayout moved to entityChartGraph.js during
// Monolith Reduction 4/6 (Feb 2026). Re-exported below so external
// consumers (EntitiesPrintPage.js) keep working.
import { buildGraph, computeInitialLayout } from './entityChartGraph';


// Geometry helpers (anchorOn, stepOut, hSegHitsRect, vSegHitsRect,
// hash01, routeEdge, polylineToRoundedPath) moved to entityChartGeometry.js
// during Monolith Reduction 4/6 (Feb 2026). Re-exported below for backward
// compatibility with EntitiesPrintPage.js.
import {
  anchorOn,
  stepOut,
  hSegHitsRect,
  vSegHitsRect,
  hash01,
  routeEdge,
  polylineToRoundedPath,
} from './entityChartGeometry';


// Tile renderers (TileIconButton, PersonTile, EntityTile, ClusterTile)
// moved to entityChartTiles.js during Monolith Reduction 4/6 (Feb 2026).
import { PersonTile, EntityTile, ClusterTile } from './entityChartTiles';


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
  estateId, entities, externals, relationships, beneficiaries, blocks,
  onSingleClickNode, onDoubleClickNode, onInfoClickNode, onEditClickNode,
  onDeleteNode, onEditBlockClick, onHiddenChange,
  cleanUpSignal, locked = false, readOnly = false, fitOnLoad = false,
  legendHidden = false, onHideLegend,
  serverOverrides, onSaveLayout,
  focusKey, focusNonce,
  // Bumped (e.g. by a "Center" toolbar button) to re-fit the tree
  // into the viewport and center on the bbox centroid. Identical
  // math to the `fitOnLoad=true` initial-layout path, just on demand.
  // Skips the very first render so it doesn't double-fire with the
  // initial fit when fitOnLoad is also true.
  centerNonce = 0,
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

  // Bubble hidden-tile state up to the parent so the toolbar can
  // render an always-visible "Show N hidden" pill. We pass `count`
  // and a stable `showAll` callback. Parent decides where/how to
  // render the affordance — keeping it in the toolbar (rather than
  // floating inside the scrollable chart) means it stays visible no
  // matter how the user has panned/zoomed.
  useEffect(() => {
    onHiddenChange?.({ count: hiddenKeys.size, showAll: showAllHidden });
  }, [hiddenKeys, showAllHidden, onHiddenChange]);

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
      if (node.kind === 'block') return `Deleted block "${node.name || 'block'}"`;
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
  // state — the user tapped the lock chip while still on the page.
  // We always fire `onSaveLayout` so the parent can surface honest
  // confirmation (success / no-op / error) every single time the
  // user taps lock, even if nothing moved. `hadChanges` lets the
  // parent skip the network round-trip when there's literally
  // nothing to persist.
  // Unmount-on-navigate-away is handled by the cleanup effect below
  // with `userInitiated: false` so the toast doesn't flash on the way
  // out.
  const lockedRef = useRef(locked);
  useEffect(() => {
    const wasLocked = lockedRef.current;
    lockedRef.current = locked;
    if (locked && !wasLocked) {
      const snapshot = overrides;
      const hadChanges = dirtyRef.current;
      dirtyRef.current = false;
      try { onSaveLayoutRef.current?.(snapshot, { userInitiated: true, hadChanges }); } catch { /* surfaced as toast in parent */ }
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
    () => buildGraph({ entities, externals, relationships, beneficiaries, user, blocks }),
    [entities, externals, relationships, beneficiaries, user, blocks]
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

  // ── Focus-on-key effect ───────────────────────────────────────────
  // When the parent bumps `focusKey` (e.g., user tapped a row in the
  // Blocks Summary card), pan the chart so that node is centered in
  // the viewport AND add it to `pulseKeys` so the tile shows a 2-sec
  // gold-ring pulse for the audience to follow during a live demo.
  const [pulseKeys, setPulseKeys] = useState(() => new Set());
  useEffect(() => {
    if (!focusKey) return;
    const el = containerRef.current;
    const target = nodes.find((n) => n.key === focusKey);
    if (!el || !target) return;
    const pos = positionOf(focusKey);
    if (!pos) return;
    const z = zoom || 1;
    const targetCenterX = (pos.x + target.w / 2) * z;
    const targetCenterY = (pos.y + target.h / 2) * z;
    const rect = el.getBoundingClientRect();
    el.scrollTo({
      left: Math.max(0, targetCenterX - rect.width / 2),
      top: Math.max(0, targetCenterY - rect.height / 2),
      behavior: 'smooth',
    });
    setPulseKeys((prev) => {
      const next = new Set(prev);
      next.add(focusKey);
      return next;
    });
    const t = setTimeout(() => {
      setPulseKeys((prev) => {
        if (!prev.has(focusKey)) return prev;
        const next = new Set(prev);
        next.delete(focusKey);
        return next;
      });
    }, 2200);
    return () => clearTimeout(t);
    // We intentionally omit positionOf/zoom from deps — refocusing on
    // every zoom change would yank the viewport mid-pinch. The effect
    // re-fires when the parent bumps focusKey OR focusNonce (so
    // clicking the same row twice still re-pulses).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, focusNonce]);

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
  // ── Reusable fit-and-center routine ───────────────────────────────────
  // Computes the bbox of every node, picks the largest zoom that keeps
  // the entire tree inside the current viewport (clamped to
  // [ZOOM_MIN, ZOOM_MAX] so we never invent a new most-zoomed-out
  // level), centers the viewport on the bbox centroid, and applies
  // the result via the existing scrollIntent → setZoom commit pipeline.
  // Used by both the initial layout effect (when `fitOnLoad` is true)
  // and the imperative Center handler (`centerNonce`).
  const runFitAndCenter = useCallback(() => {
    if (!nodes.length) return;
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (cw === 0 || ch === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      const p = overrides[n.key] || initial[n.key];
      if (!p) return;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x + n.w > maxX) maxX = p.x + n.w;
      if (p.y + n.h > maxY) maxY = p.y + n.h;
    });
    if (!Number.isFinite(minX)) return;

    const PAD = 60; // breathing room around the tree
    const treeW = (maxX - minX) + PAD * 2;
    const treeH = (maxY - minY) + PAD * 2;
    let nextZoom = Math.min(cw / treeW, ch / treeH, 1.0);
    nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZoom));
    const worldCx = (minX + maxX) / 2 + PAN_MARGIN;
    const worldCy = (minY + maxY) / 2 + PAN_MARGIN;
    const scrollX = worldCx * nextZoom - cw / 2;
    const scrollY = worldCy * nextZoom - ch / 2;

    scrollIntentRef.current = { type: 'abs', x: Math.max(0, scrollX), y: Math.max(0, scrollY) };
    if (Math.abs(zoomRef.current - nextZoom) < 0.001) {
      el.scrollLeft = Math.max(0, scrollX);
      el.scrollTop = Math.max(0, scrollY);
      scrollIntentRef.current = null;
    } else {
      setZoom(nextZoom);
    }
  }, [nodes, overrides, initial]);

  useLayoutEffect(() => {
    if (!nodes.length) return;
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (cw === 0 || ch === 0) return; // viewport not measured yet
    // Include an "overrides hydrated" bit in the key so the initial
    // fit re-runs once the saved tile positions arrive from local-
    // Storage + serverOverrides (both populate AFTER first render).
    // Without this bit, the first render stamped its key with
    // overrides={} and used `initial` (default) positions to compute
    // the bbox centroid — leaving the tree visibly off-center on
    // every CFP page load until the user manually tapped Center.
    // After overrides populate, the key stabilises and subsequent
    // user drags do NOT yank the viewport.
    const overridesHydrated = Object.keys(overrides).length > 0 ? '1' : '0';
    const key = `${estateId}|${fitOnLoad ? 'fit' : 'center'}|${relayoutTick}|${viewportTick}|${overridesHydrated}`;
    if (initialLayoutKeyRef.current === key) return;
    initialLayoutKeyRef.current = key;

    if (fitOnLoad) {
      runFitAndCenter();
      return;
    }

    // Benefactor-centered path (fitOnLoad=false): zoom 1×, scroll so
    // the benefactor tile sits in the middle of the viewport.
    let nextZoom = 1;
    let scrollX = 0;
    let scrollY = 0;
    if (userKey) {
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
    // If the new zoom matches the current zoom (very common on
    // rotation in centered mode where zoom stays at 1×), `setZoom`
    // is a no-op and the [zoom]-keyed scroll-commit effect below
    // will NOT re-fire — silently dropping the scroll intent and
    // leaving the chart parked at the pre-rotation scroll position.
    // Commit the absolute scroll synchronously here when there's no
    // zoom change so landscape rotation always re-centers cleanly.
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
  }, [estateId, fitOnLoad, relayoutTick, viewportTick, nodes, userKey, overrides, initial, runFitAndCenter]);

  // ── Imperative re-center handler ──────────────────────────────────────
  // Parent toolbar bumps `centerNonce` to ask us to re-fit + re-center.
  // We skip the initial render (nonce starts at 0) so this effect
  // doesn't double-fire alongside the initial-layout effect.
  const centerNonceRef = useRef(centerNonce);
  useEffect(() => {
    if (centerNonce === centerNonceRef.current) return;
    centerNonceRef.current = centerNonce;
    runFitAndCenter();
  }, [centerNonce, runFitAndCenter]);

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
  // True while at least 2 fingers are down. Drives `touchAction: none`
  // on the container so iOS Safari doesn't fight our pinch with its
  // own zoom/scroll heuristics (which add visible jitter even when
  // we preventDefault()).
  const [isPinching, setIsPinching] = useState(false);
  // Grab-to-pan state for LOCKED mode. Lets the user click-and-drag the
  // entire chart around the viewport (mouse only — touch keeps using
  // native momentum scroll via overflow:auto + touch-action:auto, which
  // already feels right on iPad/iPhone). Active only when `locked` is
  // true; in unlocked mode the user is moving individual tiles instead.
  //   { startX, startY, scrollLeft, scrollTop }
  const panRef = useRef(null);
  const [isPanning, setIsPanning] = useState(false);
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
        // World point sitting under the gesturestart midpoint. Stays
        // CONSTANT through the gesture; we re-anchor it to the LIVE
        // screen midpoint on every move so finger-walk pans naturally
        // without twisting the chart (Apple Maps / Figma behavior).
        anchorWorldX: (ax + el.scrollLeft) / z,
        anchorWorldY: (ay + el.scrollTop) / z,
      };
      setIsPinching(true);
    };
    const onTouchMove = (e) => {
      const p = pinchRef.current;
      if (!p) return;
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const t1 = e.touches[0], t2 = e.touches[1];
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const rect = el.getBoundingClientRect();
      const liveScreenX = cx - rect.left;
      const liveScreenY = cy - rect.top;
      const ratio = dist / p.startDist;
      // Mild damping (0.85) — keeps the gesture from over-amplifying
      // small finger movements without making it feel laggy.
      const damped = Math.pow(ratio, 0.85);
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, p.startZoom * damped));
      const prev = zoomRef.current;
      const zoomChanged = Math.abs(next - prev) > 1e-4;
      if (zoomChanged) {
        // Hand the scroll correction to the existing useLayoutEffect
        // on [zoom] so React commits zoom + scroll in the SAME paint.
        // Going through scrollIntentRef instead of a manual rAF
        // eliminates the 1-frame double-paint that read as jitter
        // (chart would scale, then snap to new scroll position one
        // frame later). Live midpoint → smooth finger-walk pan as
        // part of the same gesture.
        scrollIntentRef.current = {
          type: 'anchor',
          worldX: p.anchorWorldX,
          worldY: p.anchorWorldY,
          screenX: liveScreenX,
          screenY: liveScreenY,
        };
        zoomRef.current = next;
        // Don't toFixed() — rounding mid-gesture causes consecutive
        // moves to collapse to the same zoom value, which then trips
        // off again on the next tick. Raw float is smoother and React
        // still bails on Object.is equality when truly unchanged.
        setZoom(next);
      } else {
        // Pure pan inside the gesture (zoom unchanged). Outer dim
        // hasn't changed → set scroll synchronously without going
        // through React. No reflow, no setState churn.
        el.scrollLeft = Math.max(0, p.anchorWorldX * next - liveScreenX);
        el.scrollTop = Math.max(0, p.anchorWorldY * next - liveScreenY);
      }
    };
    const onTouchEnd = (e) => {
      // End the pinch when we drop below 2 fingers.
      if (e.touches.length < 2) {
        pinchRef.current = null;
        setIsPinching(false);
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
    // primary dragged tile. ONE case now:
    //
    //   • The dragged tile is part of an active marquee selection.
    //     Move every selected tile together as a rigid body.
    //
    // (Earlier we also auto-paired an entity with its cluster so the
    //  cluster "followed" the parent on drag. That was useful when
    //  the cluster was rendered as many individual avatars with
    //  fragile spaghetti edges — moving the parent meant manually
    //  re-tidying every avatar. Now the cluster is a single
    //  composite tile and the one connecting edge re-routes itself
    //  in real time, so the auto-pair just gets in the user's way.
    //  Per user request, the user moves tiles independently and the
    //  line adapts as they go.)
    //
    // We capture each member's current origX/origY at drag-start so
    // the pointermove handler can apply a single delta to all of
    // them.
    let groupKeys = null;
    let groupOrig = null;
    if (selectedKeys.size > 0 && selectedKeys.has(node.key)) {
      groupKeys = Array.from(selectedKeys);
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
    // LOCKED mode: start a grab-pan. Mouse only — touch already gets
    // native momentum scroll from overflow:auto. We start panning even
    // if the pointerdown lands on a tile, because tiles aren't movable
    // when locked anyway, so the cursor's "grab" affordance is correct
    // everywhere on the chart.
    if (locked) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (e.button === 2) return; // ignore right-click
      const el = containerRef.current;
      if (!el) return;
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      };
      setIsPanning(true);
      try { el.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
      e.preventDefault();
      return;
    }
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
    // Grab-pan in locked mode: drive scrollLeft/scrollTop manually so
    // the chart follows the cursor. Use clientX/Y deltas from the
    // captured starting point — same math as a native scrollbar drag.
    if (panRef.current) {
      const el = containerRef.current;
      if (el) {
        const dx = e.clientX - panRef.current.startX;
        const dy = e.clientY - panRef.current.startY;
        el.scrollLeft = panRef.current.scrollLeft - dx;
        el.scrollTop = panRef.current.scrollTop - dy;
      }
      return;
    }
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

  const onContainerPointerUp = (e) => {
    // End a grab-pan if one was in flight; everything below it is
    // marquee/long-press cleanup that doesn't apply in locked mode.
    if (panRef.current) {
      try { containerRef.current?.releasePointerCapture?.(e?.pointerId); } catch { /* ignore */ }
      panRef.current = null;
      setIsPanning(false);
      return;
    }
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
      `<stop offset="0%" stop-color="#D4AF37" stop-opacity="0.95"/>` +
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
            `<rect width="36" height="18" rx="9" fill="#0b1120" stroke="#D4AF37" stroke-width="1" opacity="0.92"/>` +
            `<text x="18" y="13" text-anchor="middle" font-size="10" font-weight="700" fill="#D4AF37">${Math.round(edge.ownership_pct)}%</text>` +
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
        touchAction: (draggingKey || isPinching) ? 'none' : 'auto',
        // Affordance: in locked mode the entire chart pans on mouse
        // drag, so show the grab/grabbing hand cursor. In unlocked
        // mode tiles are individually draggable, so leave the cursor
        // to the tiles themselves.
        cursor: locked ? (isPanning ? 'grabbing' : 'grab') : undefined,
        userSelect: isPanning ? 'none' : undefined,
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
            boxShadow: '0 4px 18px rgba(0,0,0,0.45), 0 0 14px rgba(var(--gold-rgb), 0.35)',
            position: 'sticky',
          }}
          data-testid="entity-role-filter-pill"
        >
          <span>Filtering by:</span>
          <span style={{ color: '#fff' }}>{roleFilter}</span>
          <button
            type="button"
            onClick={() => setRoleFilter(null)}
            className="ml-1 inline-flex items-center justify-center rounded-full transition-colors hover:bg-[rgba(var(--gold-rgb), 0.18)]"
            style={{
              width: 20, height: 20,
              border: '1px solid rgba(var(--gold-rgb), 0.55)',
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

      {/* Hidden-tiles pill lives in the parent toolbar now (via
          `onHiddenChange`) so it stays visible regardless of pan
          /zoom. The in-chart sticky pill used to only appear when
          the user had panned the right side of the chart into view,
          which made it effectively invisible at 1× zoom on wide
          estates. */}

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
            // GPU compositing hints — promote this layer so pinch-zoom
            // updates the GPU transform matrix instead of triggering a
            // full repaint of the chart on every touchmove tick. Big
            // smoothness win on iOS Safari + Android Chrome.
            willChange: isPinching ? 'transform' : undefined,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            // Dot-matrix grid background — graph-paper feel, Railway
            // style. The dots live in canvas coordinates so they pan +
            // zoom WITH the tree, giving the user true reference
            // points rather than a viewport-fixed pattern. `color-mix`
            // pulls the dot color from `var(--t)` so it adapts cleanly
            // to dark and light themes without a runtime branch.
            backgroundImage:
              'radial-gradient(circle, color-mix(in srgb, var(--t) 14%, transparent) 1px, transparent 1.4px)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0',
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
                background: 'rgba(var(--gold-rgb), 0.10)',
                border: '1.5px dashed rgba(var(--gold-rgb), 0.75)',
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
              data-pulse={pulseKeys.has(n.key) ? 'true' : undefined}
              style={{
                position: 'absolute',
                left: p.x,
                top: p.y,
                zIndex: isDragging ? 30 : (pulseKeys.has(n.key) ? 25 : 10),
                transition: isDragging ? 'none' : 'box-shadow 200ms ease, opacity 200ms ease',
                opacity: activeNodeKeys && !activeNodeKeys.has(n.key) ? 0.25 : 1,
                // Selection ring (Ask 3): a subtle gold glow on every
                // tile the marquee picked up so the user knows what
                // moves together.
                // Pulse ring: triggered by parent via focusKey — used
                // by the Blocks Summary card to draw the audience's
                // eye to a specific tile during a live demo. Animates
                // a 2-sec gold halo via CSS keyframes (`ec-pulse-ring`
                // defined in index.css).
                boxShadow: pulseKeys.has(n.key)
                  ? '0 0 0 4px rgba(var(--gold-rgb), 0.95), 0 0 36px rgba(var(--gold-rgb), 0.85)'
                  : selectedKeys.has(n.key)
                    ? '0 0 0 3px rgba(var(--gold-rgb), 0.85), 0 0 18px rgba(var(--gold-rgb), 0.55)'
                    : undefined,
                borderRadius: (selectedKeys.has(n.key) || pulseKeys.has(n.key)) ? 12 : undefined,
                animation: pulseKeys.has(n.key) ? 'ec-pulse-ring 2.2s ease-out 1' : undefined,
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
              ) : n.kind === 'cluster' || n.kind === 'block' ? (
                <ClusterTile node={n} dragging={isDragging}
                  locked={locked || readOnly}
                  entities={entities}
                  onPointerDownDrag={(e) => onPointerDownDrag(e, n)}
                  onClick={handleClick}
                  onHideClick={readOnly ? undefined : handleHideClick}
                  onEditBlockClick={readOnly ? undefined : onEditBlockClick} />
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
      <RemoveTileModal
        node={confirmRemoveNode}
        entities={entities}
        onClose={closeRemoveModal}
        onHide={confirmRemoveHide}
        onDelete={confirmRemoveDelete}
        canDelete={typeof onDeleteNode === 'function'}
      />
    </div>
  );
}

// Layout utilities moved to entityChartLayoutUtils.js during Monolith
// Reduction 4/6 (Feb 2026). Re-exported for backward-compat.
export { resetEntityChartPositions, cleanUpEntityChartPositions } from './entityChartLayoutUtils';

