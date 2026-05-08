/**
 * EntityQuickInfoPopover — single-click info bubble for an entity tile.
 *
 * Shows the tile name + type, gross assets / debts / computed net worth,
 * and the one-step hierarchical neighbours (who connects in, what this
 * controls). Includes a small "Edit" button (opens the full detail
 * panel) and a "Documents" button (opens the documents modal).
 *
 * Position: anchored to the right of the clicked tile via fixed
 * positioning. Caller passes the tile's screen rect.
 */
import React from 'react';
import { Edit2, FileText, Pencil, X } from 'lucide-react';
import { ROLE_OPTIONS, getTypeMeta, getEntityPalette, getBucketMeta } from '../../../config/entityCatalog';
import { formatCurrency } from './FinancialFields';

export default function EntityQuickInfoPopover({
  open, anchorRect, node, entities, externals, beneficiaries, user,
  relationships, onClose, onEdit, onShowDocuments,
}) {
  if (!open || !node || !anchorRect) return null;
  const isEntity = node.kind === 'entity';
  const ent = isEntity ? entities.find((e) => e.id === node.id) : null;
  const meta = ent ? getTypeMeta(ent.category, ent.type) : null;
  const palette = ent ? getEntityPalette(ent) : null;

  // hierarchy
  const incoming = (relationships || []).filter((r) => `${r.target_type}:${r.target_id}` === node.key);
  const outgoing = (relationships || []).filter((r) => `${r.source_type}:${r.source_id}` === node.key);
  const labelFor = (type, id) => {
    if (type === 'user') return user?.first_name || 'You';
    if (type === 'beneficiary') {
      const b = beneficiaries.find((x) => x.id === id);
      return b ? (b.name || b.first_name) : 'Beneficiary';
    }
    if (type === 'external_person') {
      const p = externals.find((x) => x.id === id);
      return p ? `${p.first_name}${p.last_name ? ' ' + p.last_name : ''}` : 'Outside';
    }
    if (type === 'entity') {
      const e = entities.find((x) => x.id === id);
      return e ? e.name : 'Entity';
    }
    return id;
  };

  const a = ent?.gross_assets;
  const d = ent?.gross_debts;
  const net = (a != null && d != null) ? a - d : null;
  const docsCount = ent?.document_ids?.length || 0;

  // Position: try right side of the tile; if it would overflow the
  // viewport, drop below.
  const PW = 280, PH = 280;
  let left = anchorRect.right + 12;
  let top = anchorRect.top;
  if (left + PW > window.innerWidth - 12) left = Math.max(12, anchorRect.left - PW - 12);
  if (left + PW > window.innerWidth - 12) left = Math.max(12, window.innerWidth - PW - 12);
  if (top + PH > window.innerHeight - 12) top = Math.max(12, window.innerHeight - PH - 12);

  return (
    <>
      {/* Click-outside catcher */}
      <div className="fixed inset-0 z-40" onClick={onClose} data-testid="quick-info-backdrop" />
      <div
        data-testid="entity-quick-info"
        className="fixed z-50 rounded-2xl shadow-2xl"
        style={{
          left, top, width: PW,
          background: 'var(--bg2)',
          border: `1px solid ${palette?.stroke || 'var(--b)'}`,
          boxShadow: `0 12px 40px rgba(0,0,0,0.5)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-2 px-3 py-2.5 border-b border-[var(--b)]">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: palette?.text || 'var(--t5)' }}>
              {isEntity ? `${getBucketMeta(ent?.category)?.label?.replace('A ', '').replace('Something that holds ', 'Property — ')}` : node.kind === 'user' ? 'You' : node.kind === 'beneficiary' ? 'Beneficiary' : 'Outside party'}
            </div>
            <div className="text-sm font-bold text-[var(--t)] truncate">
              {isEntity ? ent?.name : node.label + (node.sublabel ? ` ${node.sublabel}` : '')}
            </div>
            {isEntity && meta?.friendly && (
              <div className="text-[11px] text-[var(--t4)] truncate">{meta.friendly}{ent?.formation_state ? ` · ${ent.formation_state}` : ''}</div>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-[var(--t5)] hover:text-[var(--t)]" aria-label="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Financials */}
        {isEntity && (
          <div className="px-3 py-2.5 border-b border-[var(--b)]">
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wide text-[var(--t5)]">Assets</div>
                <div className="text-sm font-bold" style={{ color: '#22C993' }}>{a == null ? '—' : formatCurrency(a)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wide text-[var(--t5)]">Debts</div>
                <div className="text-sm font-bold" style={{ color: '#C49545' }}>{d == null ? '—' : formatCurrency(d)}</div>
              </div>
            </div>
            <div
              className="mt-2 rounded-md px-2.5 py-1.5 flex items-center justify-between"
              style={{
                background: net == null ? 'var(--card)' : net >= 0 ? 'rgba(34,201,147,0.10)' : 'rgba(122,90,35,0.18)',
                border: `1px solid ${net == null ? 'var(--b)' : net >= 0 ? 'rgba(34,201,147,0.35)' : 'rgba(196,149,69,0.45)'}`,
              }}
            >
              <span className="text-[10px] uppercase font-bold tracking-wide text-[var(--t4)]">Net worth</span>
              <span
                className="text-sm font-bold"
                style={{ color: net == null ? 'var(--t5)' : net >= 0 ? '#22C993' : '#C49545' }}
              >
                {net == null ? '—' : formatCurrency(net)}
              </span>
            </div>
          </div>
        )}

        {/* Hierarchy */}
        <div className="px-3 py-2.5 border-b border-[var(--b)] space-y-2">
          {incoming.length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wide text-[var(--t5)] mb-1">Above (connects in)</div>
              {incoming.slice(0, 3).map((r) => {
                const role = ROLE_OPTIONS.find((x) => x.id === r.role);
                return (
                  <div key={r.id} className="text-[12px] text-[var(--t)] truncate">
                    <span className="font-semibold">{labelFor(r.source_type, r.source_id)}</span>
                    <span className="text-[var(--t5)]"> · {role?.label || r.role}{r.ownership_pct != null ? ` ${Math.round(r.ownership_pct)}%` : ''}</span>
                  </div>
                );
              })}
              {incoming.length > 3 && <div className="text-[11px] text-[var(--t5)]">+{incoming.length - 3} more</div>}
            </div>
          )}
          {outgoing.length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wide text-[var(--t5)] mb-1">Below (controls)</div>
              {outgoing.slice(0, 3).map((r) => {
                const role = ROLE_OPTIONS.find((x) => x.id === r.role);
                return (
                  <div key={r.id} className="text-[12px] text-[var(--t)] truncate">
                    <span className="font-semibold">{labelFor(r.target_type, r.target_id)}</span>
                    <span className="text-[var(--t5)]"> · {role?.label || r.role}{r.ownership_pct != null ? ` ${Math.round(r.ownership_pct)}%` : ''}</span>
                  </div>
                );
              })}
              {outgoing.length > 3 && <div className="text-[11px] text-[var(--t5)]">+{outgoing.length - 3} more</div>}
            </div>
          )}
          {incoming.length === 0 && outgoing.length === 0 && (
            <div className="text-[11px] text-[var(--t5)] italic">No connections.</div>
          )}
        </div>

        {/* Actions */}
        {isEntity && (
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              onClick={onShowDocuments}
              className="flex-1 text-[11px] font-bold py-1.5 rounded-md flex items-center justify-center gap-1 transition-colors"
              style={{ color: 'var(--gold)', border: '1px solid rgba(212,165,55,0.4)' }}
              data-testid="quick-info-docs"
            >
              <FileText className="w-3 h-3" /> Docs ({docsCount})
            </button>
            <button
              onClick={onEdit}
              className="flex-1 text-[11px] font-bold py-1.5 rounded-md flex items-center justify-center gap-1 transition-colors"
              style={{ color: 'var(--t)', border: '1px solid var(--b)' }}
              data-testid="quick-info-edit"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
        )}
        {!isEntity && (
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              onClick={onEdit}
              className="flex-1 text-[11px] font-bold py-1.5 rounded-md flex items-center justify-center gap-1 transition-colors"
              style={{ color: 'var(--t)', border: '1px solid var(--b)' }}
              data-testid="quick-info-edit"
            >
              <Edit2 className="w-3 h-3" /> {node.kind === 'external_person' ? 'Edit' : 'Details'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
