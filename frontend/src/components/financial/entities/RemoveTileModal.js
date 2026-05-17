/**
 * RemoveTileModal — confirmation modal for removing a chart tile.
 *
 * Extracted from EntityOrgChart.js during Monolith Reduction 4/6 follow-up
 * (Feb 2026). Pure presentational portal modal. Receives the node-to-remove
 * + handlers via props; owns zero internal state.
 *
 * Renders into document.body via createPortal so it sits above the chart's
 * panned/zoomed coordinate space.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export const RemoveTileModal = ({
  node,
  entities,
  onClose,
  onHide,
  onDelete,
  canDelete,
}) => {
  if (!node || typeof document === 'undefined') return null;

  const buildDescription = () => {
    if (node.kind === 'entity') {
      return `"${node.entity?.name || 'Entity'}" — deleting will also remove every connection to this entity.`;
    }
    if (node.kind === 'block') {
      return `"${node.name || 'Block'}" — deleting permanently removes this block from every entity it's attached to (the underlying beneficiary records are kept).`;
    }
    if (node.kind === 'cluster') {
      const parentName = (entities || []).find((e) => e.id === node.id)?.name || 'this entity';
      return `${node.members?.length || 0} beneficiar${(node.members?.length || 0) === 1 ? 'y' : 'ies'} are linked to ${parentName}. Deleting will unlink every one (the underlying beneficiary records are kept).`;
    }
    if (node.kind === 'user') {
      return `"${node.label || 'You'}" — this is your benefactor tile. You can hide it from the chart, but you can't delete yourself from your own estate.`;
    }
    if (node.kind === 'beneficiary') {
      return `"${node.label || 'Beneficiary'}" — deleting permanently removes this beneficiary from your estate (everywhere they appear).`;
    }
    return `"${node.label || 'Person'}" — deleting permanently removes this person from your estate.`;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center px-4"
      style={{ background: 'rgba(11,17,32,0.78)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
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
              {buildDescription()}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
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
            onClick={onHide}
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
          {node.kind !== 'user' && canDelete && (
            <button
              type="button"
              onClick={onDelete}
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
          {node.kind === 'user'
            ? 'Tip: click the "N hidden · Show all" pill in the top-right to restore.'
            : 'Hiding is reversible. Deleting fires after a 5-second Undo window — tap "Undo" in the toast if you change your mind.'}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default RemoveTileModal;
