/**
 * SortableBeneficiaryCard — drag-wrapper for beneficiary cards.
 *
 * Extracted from BeneficiariesPage.js during Monolith Reduction 6/6 (Feb 2026).
 * Pure presentational wrapper around @dnd-kit's useSortable. When
 * `disabled` is true the useSortable instance is detached (drag listeners
 * are no-ops) so the user-selected non-succession sort order (e.g.
 * alphabetical) doesn't fight the drag handles.
 */
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export const SortableBeneficiaryCard = ({ id, disabled, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative',
  };
  return (
    <div ref={setNodeRef} style={style} {...(disabled ? {} : attributes)} {...(disabled ? {} : listeners)}>
      {children}
    </div>
  );
};

export default SortableBeneficiaryCard;
