/**
 * EntityLegend — adaptive legend "tile" for the E&S org chart.
 *
 * Visually identical to other tiles (rounded gold-bordered card,
 * panned + zoomed alongside them). The chart owns its position via
 * the same drag/overrides system as a regular tile — this component
 * is purely presentational so it slots into the chart's tile layer
 * without forking the drag pipeline.
 *
 * Surfaces every connection style + entity-category icon currently
 * present in the chart so the benefactor can read what each line means
 * at a glance (e.g., "the dashed cyan line from your tile to a trust =
 * you are a beneficiary of that trust").
 *
 * Auto-adapts to whatever roles + categories appear in the data —
 * empty sections stay hidden so the tile shrinks to its smallest
 * useful surface.
 *
 * Hidden-state persistence + the toolbar "Legend" chip live in the
 * parent (EntitiesSection) so the chart doesn't grow estate-id /
 * localStorage concerns.
 */
import React, { useMemo } from 'react';
import {
  Building2, Shield, Landmark, Home, User as UserIcon, Settings, X, GripVertical,
} from 'lucide-react';
import { ROLE_PALETTE, ROLE_OPTIONS, BUCKETS as ENTITY_BUCKETS } from '../../../config/entityCatalog';

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

export const LEGEND_W = 192;
// Rough height — drag math doesn't actually need this to be precise,
// but the chart uses it for tile-rect bookkeeping so edges don't try
// to terminate inside the legend.
export const LEGEND_H = 220;

function EntityLegend({ entities, relationships, onHide, onPointerDownDrag, dragging }) {
  // Compute "what's visible". Roles come from relationships; categories
  // come from entities. We preserve ROLE_OPTIONS / ENTITY_BUCKETS order
  // so the legend reads the same way every time.
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

  if (presentRoles.length === 0 && presentCategories.length === 0) return null;

  return (
    <div
      className="select-none"
      style={{
        width: LEGEND_W,
        background: 'rgba(11,17,32,0.92)',
        border: '1px solid rgba(212,165,55,0.45)',
        borderRadius: 12,
        backdropFilter: 'blur(8px)',
        boxShadow: dragging
          ? '0 12px 28px rgba(0,0,0,0.55), 0 0 18px rgba(212,165,55,0.4)'
          : '0 8px 24px rgba(0,0,0,0.45), 0 0 14px rgba(212,165,55,0.18)',
        cursor: dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDownDrag}
      data-testid="entity-legend"
    >
      {/* Header (drag affordance + close) */}
      <div
        className="flex items-center justify-between px-2.5 py-1.5"
        style={{ borderBottom: '1px solid rgba(212,165,55,0.25)' }}
      >
        <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--gold)' }}>
          <GripVertical style={{ width: 11, height: 11, opacity: 0.75 }} />
          Legend
        </span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onHide?.(); }}
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

// Persisted-hidden helpers used by the parent toolbar chip.
EntityLegend.readHiddenForEstate = (estateId) => {
  try { return window.localStorage?.getItem(HIDDEN_KEY(estateId)) === '1'; }
  catch { return false; }
};
EntityLegend.writeHiddenForEstate = (estateId, hidden) => {
  try { window.localStorage?.setItem(HIDDEN_KEY(estateId), hidden ? '1' : '0'); }
  catch { /* quota */ }
};

export default EntityLegend;
