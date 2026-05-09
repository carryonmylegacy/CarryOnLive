/**
 * EntityLegend — floating, draggable legend for the E&S org chart.
 *
 * Surfaces every connection style + entity-category icon currently
 * present inside the chart so the benefactor can read what each line
 * means at a glance (e.g., "the dashed cyan line from your tile to a
 * trust = you are a beneficiary of that trust").
 *
 * Behavior:
 *   • Adapts to whatever roles + categories appear in the data — empty
 *     sections stay hidden so the tile shrinks to the smallest useful
 *     surface.
 *   • Drag from the header to reposition. Position persists per estate
 *     (localStorage). Drag is screen-pixel relative to the chart's
 *     viewport box, NOT the canvas — the legend stays put when the
 *     user pans the chart.
 *   • Tap × to hide; the parent surfaces a "Legend" chip to bring it
 *     back. Hidden state also persists per estate.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, Shield, Landmark, Home, User as UserIcon, Settings, X,
} from 'lucide-react';
import { ROLE_PALETTE, ROLE_OPTIONS, BUCKETS as ENTITY_BUCKETS } from '../../../config/entityCatalog';

const POS_KEY = (estateId) => `cfp_entity_legend_pos:${estateId || 'global'}`;
const HIDDEN_KEY = (estateId) => `cfp_entity_legend_hidden:${estateId || 'global'}`;

const BUCKET_ICON = {
  business: Building2,
  trust: Shield,
  charity: Landmark,
  property: Home,
  external_person: UserIcon,
  specialized: Settings,
};

// Equity roles that are styled with the gold flow gradient instead of
// the per-role color in ROLE_PALETTE. Mirror the list in
// EntityOrgChart so legend rows match the rendered edges 1:1.
const EQUITY_ROLE_IDS = new Set([
  'owner', 'member', 'shareholder', 'gp', 'lp',
  'joint_tenant', 'tenant_in_common', 'community_property',
]);

const ROLE_OPTION_BY_ID = new Map(ROLE_OPTIONS.map((r) => [r.id, r]));

export default function EntityLegend({ estateId, entities, relationships, hidden, onHiddenChange }) {
  const containerRef = useRef(null);
  const [pos, setPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 12, y: 12 };
    try {
      const raw = window.localStorage?.getItem(POS_KEY(estateId));
      if (raw) return JSON.parse(raw);
    } catch { /* fall through */ }
    return { x: 12, y: 12 };
  });

  // Re-load position whenever the estate changes (portal switching).
  useEffect(() => {
    try {
      const raw = window.localStorage?.getItem(POS_KEY(estateId));
      if (raw) setPos(JSON.parse(raw));
      else setPos({ x: 12, y: 12 });
    } catch { setPos({ x: 12, y: 12 }); }
  }, [estateId]);

  // Compute "what's visible". Roles come from relationships; categories
  // come from entities. We preserve ROLE_OPTIONS order so the legend
  // reads the same way every time.
  const presentRoles = useMemo(() => {
    const seen = new Set();
    (relationships || []).forEach((r) => { if (r.role) seen.add(r.role); });
    return ROLE_OPTIONS.filter((r) => seen.has(r.id));
  }, [relationships]);

  const presentCategories = useMemo(() => {
    const seen = new Set();
    (entities || []).forEach((e) => { if (e.category) seen.add(e.category); });
    return (ENTITY_BUCKETS || []).filter((b) => seen.has(b.id));
  }, [entities]);

  // ── Drag (pointer events; mirrors the same pattern used by the
  // chart's tile-drag so PWA touch + mouse + pencil all work).
  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    if (e.target.closest('[data-legend-no-drag="1"]')) return;
    e.preventDefault();
    e.stopPropagation();
    e.target.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    // Constrain to the parent's bounding box so the legend can't be
    // dragged off-screen and lost.
    const parent = containerRef.current?.parentElement;
    const me = containerRef.current;
    if (!parent || !me) return;
    const pb = parent.getBoundingClientRect();
    const mb = me.getBoundingClientRect();
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const nx = Math.min(Math.max(0, d.origX + dx), Math.max(0, pb.width - mb.width));
    const ny = Math.min(Math.max(0, d.origY + dy), Math.max(0, pb.height - mb.height));
    setPos({ x: nx, y: ny });
  };
  const onPointerUp = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      window.localStorage?.setItem(POS_KEY(estateId), JSON.stringify(pos));
    } catch { /* quota */ }
  };

  // Nothing to render if there are no edges and no entities at all,
  // or the user dismissed the legend.
  if (hidden) return null;
  if (presentRoles.length === 0 && presentCategories.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute z-30 select-none"
      style={{
        left: pos.x,
        top: pos.y,
        width: 192,
        background: 'rgba(11,17,32,0.92)',
        border: '1px solid rgba(212,165,55,0.45)',
        borderRadius: 12,
        backdropFilter: 'blur(8px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45), 0 0 14px rgba(212,165,55,0.18)',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-testid="entity-legend"
    >
      {/* Header / drag handle */}
      <div
        className="flex items-center justify-between px-2.5 py-1.5"
        style={{
          borderBottom: '1px solid rgba(212,165,55,0.25)',
          cursor: 'grab',
        }}
      >
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--gold)' }}>
          Legend
        </span>
        <button
          type="button"
          data-legend-no-drag="1"
          onClick={(e) => {
            e.stopPropagation();
            try { window.localStorage?.setItem(HIDDEN_KEY(estateId), '1'); } catch { /* quota */ }
            onHiddenChange?.(true);
          }}
          aria-label="Hide legend"
          title="Hide legend"
          className="inline-flex items-center justify-center rounded-full transition-colors hover:bg-[rgba(212,165,55,0.18)]"
          style={{
            width: 18, height: 18,
            border: '1px solid rgba(212,165,55,0.55)',
            color: 'var(--gold)',
          }}
          data-testid="entity-legend-hide"
        >
          <X style={{ width: 11, height: 11 }} />
        </button>
      </div>

      {/* Connections section */}
      {presentRoles.length > 0 && (
        <div className="px-2.5 py-2 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--t5)' }}>
            Connections
          </div>
          {presentRoles.map((role) => {
            const palette = ROLE_PALETTE[role.id] || ROLE_PALETTE.owner;
            const isEquity = EQUITY_ROLE_IDS.has(role.id);
            const stroke = isEquity ? '#D4A537' : palette.color;
            return (
              <div key={role.id} className="flex items-center gap-2">
                <svg width="28" height="8" style={{ flexShrink: 0 }} aria-hidden="true">
                  <line
                    x1="0" y1="4" x2="28" y2="4"
                    stroke={stroke}
                    strokeWidth={isEquity ? 2.6 : 1.8}
                    strokeLinecap="round"
                    strokeDasharray={palette.dash || undefined}
                  />
                </svg>
                <span className="text-[11px] truncate" style={{ color: 'var(--t)' }} title={role.help || role.label}>
                  {role.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Entities section */}
      {presentCategories.length > 0 && (
        <div
          className="px-2.5 py-2 space-y-1.5"
          style={{
            borderTop: presentRoles.length > 0 ? '1px solid rgba(212,165,55,0.18)' : undefined,
          }}
        >
          <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--t5)' }}>
            Entities
          </div>
          {presentCategories.map((b) => {
            const Icon = BUCKET_ICON[b.id] || Settings;
            return (
              <div key={b.id} className="flex items-center gap-2">
                <Icon style={{ width: 13, height: 13, color: 'var(--gold)', flexShrink: 0 }} />
                <span className="text-[11px] truncate" style={{ color: 'var(--t)' }} title={b.label}>
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Helper for the parent to read the persisted hidden state synchronously
// at render-time (avoids a one-frame flash where the legend renders and
// then immediately disappears).
EntityLegend.readHiddenForEstate = (estateId) => {
  try { return window.localStorage?.getItem(HIDDEN_KEY(estateId)) === '1'; }
  catch { return false; }
};
EntityLegend.writeHiddenForEstate = (estateId, hidden) => {
  try { window.localStorage?.setItem(HIDDEN_KEY(estateId), hidden ? '1' : '0'); }
  catch { /* quota */ }
};

// Re-export for legend-aware role lookups (kept for testability).
export { ROLE_OPTION_BY_ID };
