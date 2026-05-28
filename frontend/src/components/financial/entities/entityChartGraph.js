/**
 * EntityOrgChart — graph build + initial layout.
 *
 * Extracted from EntityOrgChart.js during Monolith Reduction 4/6 (Feb 2026).
 * `buildGraph` flattens (entities, externals, relationships, beneficiaries,
 * blocks) into a node list + edge list. `computeInitialLayout` runs the
 * default layered layout that is then overridden by the user's drag state.
 *
 * Pure functions — no React, no DOM access. Imported by both the live
 * EntityOrgChart and by EntitiesPrintPage for the static print renderer.
 */
import {
  ENTITY_W,
  ENTITY_H,
  PERSON_W,
  PERSON_H,
  PADDING,
  ROW_GAP,
  COL_GAP,
  CLUSTER_W,
  clusterHeight,
} from './entityChartConstants';
import { ROLE_OPTIONS } from '../../../config/entityCatalog';

// ---------------------------------------------------------------------------
// Graph build (same approach as v1 but returns nodes flat for free layout)
// ---------------------------------------------------------------------------
export function buildGraph({ entities, externals, relationships, beneficiaries, user, blocks }) {
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

  // -- Named beneficiary blocks ---------------------------------------------
  // Blocks are first-class, reusable, named groups. Each block becomes
  // a single `block:<bid>` tile, regardless of how many entities it's
  // attached to. Members are resolved from the block's stored member
  // list (kind + id) — kinds are 'beneficiary' | 'external_person' | 'user'.
  const externalsIndex = new Map();
  (externals || []).forEach((p) => externalsIndex.set(p.id, p));
  const userIdToHydrated = user ? {
    id: user.id,
    first_name: user.first_name || (user.name || '').split(' ')[0] || 'You',
    photo: user.photo_url,
    avatar_color: '#D4AF37',
  } : null;
  (blocks || []).forEach((b) => {
    const hydratedMembers = (b.members || []).map((m) => {
      if (m.kind === 'beneficiary') {
        const ben = benIndex.get(m.id);
        if (!ben) return null;
        return {
          id: ben.id,
          first_name: ben.first_name || (ben.name || '').split(' ')[0] || 'Member',
          photo: ben.photo_url,
          avatar_color: ben.avatar_color,
        };
      }
      if (m.kind === 'external_person') {
        const p = externalsIndex.get(m.id);
        if (!p) return null;
        return {
          id: p.id,
          first_name: p.first_name || (p.name || '').split(' ')[0] || 'Member',
          photo: p.photo_url,
          avatar_color: '#94A3B8',
        };
      }
      if (m.kind === 'user' && userIdToHydrated && userIdToHydrated.id === m.id) {
        return userIdToHydrated;
      }
      return null;
    }).filter(Boolean);
    pool.set(`block:${b.id}`, {
      key: `block:${b.id}`,
      kind: 'block',
      id: b.id,
      name: b.name || 'Block',
      members: hydratedMembers,
      w: CLUSTER_W,
      h: clusterHeight(Math.max(1, hydratedMembers.length)),
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
      // Block→entity relationship: one edge per (block, entity) pair.
      // Direction reversed (entity source, block target) to mirror the
      // legacy cluster behavior — block sits below its attached entity
      // in the BFS depth pass.
      if (r.source_type === 'beneficiary_block' && r.target_type === 'entity' && r.role === 'beneficiary') {
        if (pool.has(`block:${r.source_id}`) && pool.has(`entity:${r.target_id}`)) {
          acc.push({
            id: `block-edge:${r.id}`,
            sourceKey: `entity:${r.target_id}`,
            targetKey: `block:${r.source_id}`,
            role: 'beneficiary',
            ownership_pct: null,
            synthetic: true,
            raw: r,
          });
        }
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
    else if (n.kind === 'block') nodes.set(k, n);
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
export function computeInitialLayout(nodes, depth) {
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
