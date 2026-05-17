/**
 * EntityOrgChart — tile renderers.
 *
 * Extracted from EntityOrgChart.js during Monolith Reduction 4/6 (Feb 2026).
 * Pure-presentational tile components (TileIconButton, PersonTile,
 * EntityTile, ClusterTile). All state comes in via props; all callbacks
 * go out via props. No hooks, no closures over parent state.
 */
import React from 'react';
import { Settings, Info, Pencil, X } from 'lucide-react';
import { AvatarCircle } from '../../AvatarCircle';
import { ROLE_PALETTE, getTypeMeta, getEntityPalette } from '../../../config/entityCatalog';
import {
  BUCKET_ICON,
  ENTITY_W,
  ENTITY_H,
  PERSON_W,
  PERSON_H,
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
} from './entityChartConstants';

// ---------------------------------------------------------------------------
// Node renderers
// ---------------------------------------------------------------------------
// Stops drag from starting AND stops propagation so the tile's click /
// double-click handlers don't also fire when a user taps an icon button.
export const stopAll = (e) => { e.stopPropagation(); e.preventDefault(); };

// Reusable little circular icon-button shown on every tile.
export function TileIconButton({ icon: Icon, onClick, label, color = 'rgba(255,255,255,0.85)', testId }) {
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

export function PersonTile({ node, palette, dragging, locked, onPointerDownDrag, onClick, onDoubleClick, onInfoClick, onEditClick, onHideClick, roleFilter, onTitleClick }) {
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

export function EntityTile({ node, dragging, locked, onPointerDownDrag, onClick, onDoubleClick, onInfoClick, onEditClick, onHideClick }) {
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

// ClusterTile — composite tile per entity that has beneficiaries.
// Used for both auto-clusters (n.kind === 'cluster', header derives
// from the parent entity name) AND named blocks (n.kind === 'block',
// header is the user-given block name).
// Renders the title strip on top, then a brick-pattern grid of
// half-sized avatars (5 per row, odd rows offset by half a column).
// First name only beneath each avatar.
export function ClusterTile({ node, dragging, locked, onPointerDownDrag, onClick, entities, onHideClick, onEditBlockClick }) {
  const members = node.members || [];
  const w = CLUSTER_W;
  const h = clusterHeight(Math.max(1, members.length));
  const isBlock = node.kind === 'block';
  const headerLabel = isBlock
    ? (node.name || 'Block')
    : `${members.length} beneficiar${members.length === 1 ? 'y' : 'ies'} · ${(entities || []).find((e) => e.id === node.id)?.name || 'this entity'}`;
  // Both auto-clusters and named blocks share the same teal palette
  // on the canvas — they're conceptually the same artefact (a group
  // of beneficiaries attached to an entity). The user-facing
  // distinction is just the header text: auto-clusters show the
  // member-count + parent-entity, named blocks show the user-given
  // group name.
  const headerColor = '#22C993';
  const borderColor = 'rgba(34,201,147,0.55)';
  const bgColor = 'rgba(34,201,147,0.08)';
  const HALF_STEP = CLUSTER_HALF_STEP;
  return (
    <div
      onPointerDown={onPointerDownDrag}
      onClick={onClick}
      data-testid={isBlock ? `entity-node-block-${node.id}` : `entity-node-cluster-${node.id}`}
      className="relative rounded-xl select-none"
      style={{
        width: w,
        height: h,
        background: bgColor,
        border: `1.5px solid ${borderColor}`,
        boxShadow: dragging
          ? `0 8px 24px rgba(0,0,0,0.45), 0 0 24px ${headerColor}55`
          : `0 0 14px ${headerColor}33`,
        cursor: locked ? 'pointer' : (dragging ? 'grabbing' : 'grab'),
        touchAction: locked ? 'auto' : 'none',
      }}
    >
      <div
        className="px-2 pt-1.5 pb-1 pr-16 text-[11px] font-bold uppercase tracking-wide truncate"
        style={{ color: headerColor, pointerEvents: 'none' }}
      >
        {headerLabel}
      </div>
      <div
        className="absolute"
        style={{
          left: CLUSTER_PAD_X,
          top: CLUSTER_HEADER_H + CLUSTER_PAD_Y,
          right: CLUSTER_PAD_X,
          bottom: CLUSTER_PAD_Y,
          pointerEvents: 'none',
          overflow: 'hidden',
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
              style={{
                left,
                top,
                width: CLUSTER_AVATAR + 4,
                // Pin slot height so unusually long first-names (or
                // weird unicode) can't push the label past the slot's
                // allotted vertical space and bleed onto the next row
                // or out of the cluster tile entirely.
                height: CLUSTER_SLOT_H - 4,
                overflow: 'hidden',
              }}
            >
              <AvatarCircle
                photo={m.photo}
                initials={initials}
                color={m.avatar_color || headerColor}
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
      {/* Action chips top-right. Both named blocks and auto-clusters
          get the pencil — for clusters the modal converts the
          group into a first-class named block on save (creates the
          block + attaches it + wipes the old flat relationships).
          The hide-from-chart X sits to the pencil's right. */}
      {onEditBlockClick && (
        <div
          className="absolute top-1 right-7"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <TileIconButton
            icon={Pencil}
            onClick={(e) => { e.stopPropagation(); onEditBlockClick(node); }}
            label={isBlock ? 'Edit block name and members' : 'Name this group and edit members'}
            testId={isBlock ? `tile-edit-block-${node.id}` : `tile-edit-cluster-${node.id}`}
          />
        </div>
      )}
      {onHideClick && (
        <div className="absolute top-1 right-1">
          <TileIconButton icon={X} onClick={onHideClick} label="Hide from chart" testId={isBlock ? `tile-hide-block-${node.id}` : `tile-hide-cluster-${node.id}`} />
        </div>
      )}
    </div>
  );
}
