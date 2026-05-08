/**
 * EntityOrgChart — 2D layered org chart for CFP Entities & Structures.
 *
 * Lays nodes out in horizontal rows by depth (root at top). Lines are
 * drawn via an absolutely-positioned SVG overlay computed from the
 * actual DOM positions of each node (ResizeObserver-driven so layout
 * survives container resizes, theme switches, and orientation flips).
 *
 * Same visual DNA as FamilyTree (gold gradient lines, dash-reveal
 * animation, soft glow filter) but laid out as a true 2D org chart
 * that stretches both ways instead of a single vertical fan.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Building2, Shield, Landmark, Home, User as UserIcon, Settings, Users } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { getEntityPalette, getTypeMeta, ROLE_PALETTE, PALETTE } from '../../../config/entityCatalog';

const BUCKET_ICON = {
  business: Building2,
  trust: Shield,
  charity: Landmark,
  property: Home,
  external_person: UserIcon,
  specialized: Settings,
};

// Build the node + edge list from raw API rows.
// Edges are drawn from source → target. We only consider non-deleted.
function buildGraph({ entities, externals, relationships, beneficiaries, user }) {
  const nodes = new Map();

  // Add the user as a node (always present so the chart has at least one root)
  if (user?.id) {
    nodes.set(`user:${user.id}`, {
      key: `user:${user.id}`,
      kind: 'user',
      id: user.id,
      label: (user.first_name || user.name?.split(' ')[0] || 'You'),
      sublabel: user.last_name || '',
      photo: user.photo_url,
    });
  }

  (beneficiaries || []).forEach((b) => {
    nodes.set(`beneficiary:${b.id}`, {
      key: `beneficiary:${b.id}`,
      kind: 'beneficiary',
      id: b.id,
      label: b.first_name || (b.name || '').split(' ')[0] || 'Beneficiary',
      sublabel: b.relation || '',
      photo: b.photo_url,
      avatar_color: b.avatar_color,
    });
  });

  (externals || []).forEach((p) => {
    nodes.set(`external_person:${p.id}`, {
      key: `external_person:${p.id}`,
      kind: 'external_person',
      id: p.id,
      label: p.first_name,
      sublabel: p.last_name || 'Outside party',
    });
  });

  (entities || []).forEach((e) => {
    nodes.set(`entity:${e.id}`, {
      key: `entity:${e.id}`,
      kind: 'entity',
      id: e.id,
      entity: e,
    });
  });

  // Edges only between nodes we know about.
  const edges = (relationships || [])
    .map((r) => ({
      id: r.id,
      sourceKey: `${r.source_type}:${r.source_id}`,
      targetKey: `${r.target_type}:${r.target_id}`,
      role: r.role,
      ownership_pct: r.ownership_pct,
      raw: r,
    }))
    .filter((e) => nodes.has(e.sourceKey) && nodes.has(e.targetKey));

  // Compute depth: BFS from "roots" (nodes with no incoming edge).
  // Falls back: every node touched gets a depth; orphans default 0.
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

  const usedKeys = new Set();
  edges.forEach((e) => {
    usedKeys.add(e.sourceKey);
    usedKeys.add(e.targetKey);
  });

  const depth = new Map();
  const roots = [];
  usedKeys.forEach((k) => {
    if (!incoming.has(k) || incoming.get(k).length === 0) {
      depth.set(k, 0);
      roots.push(k);
    }
  });
  // BFS
  const queue = [...roots];
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

  // Group involved nodes by depth row
  const rows = [];
  depth.forEach((d, k) => {
    if (!rows[d]) rows[d] = [];
    rows[d].push(nodes.get(k));
  });

  // Orphan entities (no relationships at all) get parked on row 0
  (entities || []).forEach((e) => {
    if (!usedKeys.has(`entity:${e.id}`)) {
      if (!rows[0]) rows[0] = [];
      rows[0].push(nodes.get(`entity:${e.id}`));
    }
  });

  // If literally nothing has been added yet, return empty
  return { rows: rows.filter(Boolean), edges };
}

// --- Node renderers --------------------------------------------------------

function PersonNode({ node, palette, onClick }) {
  const initials = (node.label?.[0] || '') + (node.sublabel?.[0] || '');
  const color = node.avatar_color || palette.stroke;
  return (
    <div className="flex flex-col items-center gap-1 select-none" style={{ width: 92 }}>
      <div
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        className="rounded-full flex items-center justify-center font-bold cursor-pointer transition-transform hover:scale-105"
        data-testid={`entity-node-${node.key}`}
        style={{
          width: 56, height: 56,
          background: color + '20',
          color,
          border: `2.5px solid ${color}`,
          boxShadow: `0 0 14px ${color}55`,
          fontSize: 18,
        }}
      >
        {initials.toUpperCase().slice(0, 2) || <UserIcon className="w-5 h-5" />}
      </div>
      <span className="text-xs font-semibold text-[var(--t)] text-center leading-tight truncate w-full">{node.label}</span>
      {node.sublabel && (
        <span className="text-[11px] text-[var(--t4)] text-center leading-tight truncate w-full">{node.sublabel}</span>
      )}
    </div>
  );
}

function EntityNode({ node, onClick }) {
  const e = node.entity;
  const palette = getEntityPalette(e);
  const meta = getTypeMeta(e.category, e.type);
  const Icon = BUCKET_ICON[e.category] || Settings;
  return (
    <div
      onClick={onClick}
      role="button"
      data-testid={`entity-node-entity-${e.id}`}
      className="rounded-2xl px-3 py-2.5 cursor-pointer transition-transform hover:scale-[1.03] flex items-start gap-2 select-none"
      style={{
        width: 200,
        background: palette.fill,
        border: `1.5px solid ${palette.stroke}`,
        boxShadow: `0 0 18px ${palette.glow}`,
      }}
    >
      <div
        className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: `${palette.stroke}25`, color: palette.text }}
      >
        <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
      </div>
      <div className="flex-1 min-w-0">
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
    </div>
  );
}

// --- Main chart -------------------------------------------------------------

export default function EntityOrgChart({
  entities, externals, relationships, beneficiaries,
  onAddEntity, onSelectNode,
}) {
  const { user } = useAuth();
  const [nodePositions, setNodePositions] = useState({});
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const containerRef = useRef(null);
  const nodeRefs = useRef({});

  const { rows, edges } = useMemo(
    () => buildGraph({ entities, externals, relationships, beneficiaries, user }),
    [entities, externals, relationships, beneficiaries, user],
  );

  // Recompute pixel positions of every node + container size for SVG overlay
  const recomputePositions = () => {
    const c = containerRef.current;
    if (!c) return;
    const cb = c.getBoundingClientRect();
    setContainerSize({ w: cb.width, h: cb.height });
    const next = {};
    Object.entries(nodeRefs.current).forEach(([key, el]) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      next[key] = {
        cx: r.left + r.width / 2 - cb.left,
        topY: r.top - cb.top,
        bottomY: r.bottom - cb.top,
      };
    });
    setNodePositions(next);
  };

  useLayoutEffect(() => {
    recomputePositions();
    // recompute on next frame, after fonts settle
    const t = setTimeout(recomputePositions, 60);
    return () => clearTimeout(t);
  }, [rows, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(recomputePositions);
    ro.observe(c);
    window.addEventListener('resize', recomputePositions);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recomputePositions);
    };
  }, []);

  // No data yet → caller should hide the section entirely. We still render
  // an empty-but-zero-height container so animation hooks don't break.
  if (!rows.length) return null;

  const chartHeight = Math.max(220, rows.length * 130);

  return (
    <div
      ref={containerRef}
      data-testid="entity-org-chart"
      className="relative w-full overflow-x-auto overflow-y-hidden"
      style={{ minHeight: chartHeight }}
    >
      <style>{`
        @keyframes ecDashReveal { to { stroke-dashoffset: 0; } }
        @keyframes ecPulse { 0%, 100% { opacity: 0.8; } 50% { opacity: 1; } }
        .ec-edge-path {
          animation: ecDashReveal 1.4s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
        }
        .ec-edge-path { filter: drop-shadow(0 0 3px currentColor); }
      `}</style>

      {/* SVG overlay: connection lines */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={containerSize.w}
        height={containerSize.h}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="ec-flow-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4A537" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#7A5A23" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {edges.map((edge) => {
          const a = nodePositions[edge.sourceKey];
          const b = nodePositions[edge.targetKey];
          if (!a || !b) return null;
          const role = ROLE_PALETTE[edge.role] || ROLE_PALETTE.owner;
          // Source bottom-center to target top-center, with smooth cubic
          const sx = a.cx, sy = a.bottomY + 2;
          const tx = b.cx, ty = b.topY - 2;
          const midY = sy + (ty - sy) / 2;
          const d = `M ${sx},${sy} C ${sx},${midY} ${tx},${midY} ${tx},${ty}`;
          const stroke = edge.role === 'owner' || edge.role === 'gp' || edge.role === 'lp'
            ? 'url(#ec-flow-gold)' : role.color;
          return (
            <g key={edge.id} style={{ color: role.color }}>
              <path
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={edge.role === 'owner' && edge.ownership_pct ? Math.max(1.4, Math.min(3.4, edge.ownership_pct / 33)) : 1.6}
                strokeDasharray={role.dash || undefined}
                strokeLinecap="round"
                pathLength="1"
                strokeDashoffset="1"
                className="ec-edge-path"
              />
              {edge.role === 'owner' && edge.ownership_pct != null && (
                <g transform={`translate(${(sx + tx) / 2 - 18}, ${midY - 9})`}>
                  <rect width="36" height="18" rx="9" fill="#0b1120" stroke="#D4A537" strokeWidth="1" opacity="0.9" />
                  <text x="18" y="13" textAnchor="middle" fontSize="10" fontWeight="700" fill="#D4A537">
                    {Math.round(edge.ownership_pct)}%
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Layered rows */}
      <div className="relative z-10 flex flex-col gap-9 py-4 px-2 min-w-fit">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex flex-row items-start justify-center gap-6 flex-wrap">
            {row.map((node) => (
              <div
                key={node.key}
                ref={(el) => { nodeRefs.current[node.key] = el; }}
              >
                {node.kind === 'entity' ? (
                  <EntityNode node={node} onClick={() => onSelectNode?.(node)} />
                ) : (
                  <PersonNode
                    node={node}
                    palette={
                      node.kind === 'user' ? PALETTE.cream :
                      node.kind === 'beneficiary' ? { stroke: node.avatar_color || '#22C993' } :
                      PALETTE.slate
                    }
                    onClick={() => onSelectNode?.(node)}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
