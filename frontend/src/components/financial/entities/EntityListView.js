/**
 * EntityListView — fallback indented-tree view when the org chart is
 * too dense for a small mobile screen, or when the user prefers a
 * scannable list.
 *
 * Layout: each "root" (a node not owned/controlled by anything else)
 * renders at depth 0; its descendants indent under it. Same data,
 * zero zooming required.
 */
import React, { useMemo } from 'react';
import { Building2, Shield, Landmark, Home, User as UserIcon, Settings, ChevronRight } from 'lucide-react';
import { getEntityPalette, getTypeMeta, ROLE_OPTIONS } from '../../../config/entityCatalog';

const BUCKET_ICON = {
  business: Building2, trust: Shield, charity: Landmark,
  property: Home, external_person: UserIcon, specialized: Settings,
};

export default function EntityListView({ entities, externals, relationships, beneficiaries, user, onSelectNode }) {
  const tree = useMemo(() => {
    // Build adjacency: source -> [{ targetEntityId, role, ownership_pct }]
    const childrenBySource = new Map();
    relationships.forEach((r) => {
      const k = `${r.source_type}:${r.source_id}`;
      if (!childrenBySource.has(k)) childrenBySource.set(k, []);
      childrenBySource.get(k).push(r);
    });

    // Roots: every "user / beneficiary / external_person" node, plus
    // entities that have no incoming relationships
    const incomingByEntity = new Set();
    relationships.forEach((r) => {
      if (r.target_type === 'entity') incomingByEntity.add(r.target_id);
    });
    const orphanEntities = entities.filter((e) => !incomingByEntity.has(e.id));

    // Each root produces a small tree
    const roots = [];
    if (user?.id) roots.push({ kind: 'user', id: user.id, label: user.first_name || 'You', sublabel: '(you)' });
    (beneficiaries || []).forEach((b) => roots.push({ kind: 'beneficiary', id: b.id, label: b.name || b.first_name, sublabel: b.relation || 'beneficiary' }));
    (externals || []).forEach((p) => roots.push({ kind: 'external_person', id: p.id, label: `${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`, sublabel: 'outside party' }));
    orphanEntities.forEach((e) => roots.push({ kind: 'entity', id: e.id, entity: e }));

    return { roots, childrenBySource };
  }, [entities, externals, relationships, beneficiaries, user]);

  const renderEntityRow = (entity, role, ownership_pct, depth) => {
    const palette = getEntityPalette(entity);
    const meta = getTypeMeta(entity.category, entity.type);
    const Icon = BUCKET_ICON[entity.category] || Settings;
    return (
      <div
        onClick={() => onSelectNode?.({ kind: 'entity', id: entity.id, key: `entity:${entity.id}`, entity })}
        className="flex items-center gap-2 py-2 cursor-pointer hover:bg-[var(--s)] rounded-md px-2"
        style={{ marginLeft: depth * 18 }}
        data-testid={`entity-list-row-entity-${entity.id}`}
      >
        {depth > 0 && <ChevronRight className="w-3 h-3 text-[var(--t5)] flex-shrink-0" />}
        <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: palette.fill, border: `1px solid ${palette.stroke}` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: palette.text }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-[var(--t)] truncate">{entity.name}</div>
          <div className="text-[11px] text-[var(--t5)] truncate">
            {meta?.friendly}
            {role && <> · <span style={{ color: 'var(--gold)' }}>{ROLE_OPTIONS.find((r)=>r.id===role)?.label || role}</span></>}
            {ownership_pct != null && ` ${Math.round(ownership_pct)}%`}
            {entity.formation_state && ` · ${entity.formation_state}`}
          </div>
        </div>
      </div>
    );
  };

  const renderPersonRow = (root, depth) => (
    <div
      onClick={() => onSelectNode?.({ kind: root.kind, id: root.id, key: `${root.kind}:${root.id}`, label: root.label, sublabel: root.sublabel })}
      className="flex items-center gap-2 py-2 cursor-pointer hover:bg-[var(--s)] rounded-md px-2"
      style={{ marginLeft: depth * 18 }}
      data-testid={`entity-list-row-${root.kind}-${root.id}`}
    >
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
        style={{
          background: root.kind === 'user' ? 'rgba(245,230,200,0.15)'
            : root.kind === 'beneficiary' ? 'rgba(34,201,147,0.15)'
            : 'rgba(100,116,139,0.15)',
          color: root.kind === 'user' ? '#F5E6C8'
            : root.kind === 'beneficiary' ? '#22C993'
            : '#9AA8BC',
          border: `1px solid ${root.kind === 'user' ? '#F5E6C8' : root.kind === 'beneficiary' ? '#22C993' : '#9AA8BC'}`,
        }}>
        {(root.label?.[0] || '?').toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold text-[var(--t)] truncate">{root.label}</div>
        <div className="text-[11px] text-[var(--t5)] truncate">{root.sublabel}</div>
      </div>
    </div>
  );

  // Recursively render a sub-tree under a given source key
  const renderSubtree = (sourceKey, depth, seen = new Set()) => {
    if (seen.has(sourceKey)) return null; // cycle guard
    seen = new Set(seen);
    seen.add(sourceKey);
    const children = tree.childrenBySource.get(sourceKey) || [];
    return children.map((rel) => {
      const child = entities.find((e) => e.id === rel.target_id);
      if (!child) return null;
      return (
        <React.Fragment key={rel.id}>
          {renderEntityRow(child, rel.role, rel.ownership_pct, depth)}
          {renderSubtree(`entity:${child.id}`, depth + 1, seen)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="px-2 py-2">
      {tree.roots.map((root) => (
        <div key={`${root.kind}:${root.id}`} className="mb-1">
          {root.kind === 'entity'
            ? renderEntityRow(root.entity, null, null, 0)
            : renderPersonRow(root, 0)}
          {renderSubtree(root.kind === 'entity' ? `entity:${root.id}` : `${root.kind}:${root.id}`, 1)}
        </div>
      ))}
    </div>
  );
}
