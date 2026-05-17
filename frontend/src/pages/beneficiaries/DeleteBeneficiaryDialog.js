/**
 * DeleteBeneficiaryDialog — confirmation dialog for beneficiary deletion.
 *
 * Extracted from BeneficiariesPage.js during Monolith Reduction 6/6 (Feb 2026).
 * Pure presentational dialog — receives the target + handlers via props.
 * Owns no state of its own; visibility is fully parent-controlled.
 */
import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';

export const DeleteBeneficiaryDialog = ({ target, onClose, onDelete }) => (
  <AlertDialog open={!!target} onOpenChange={(open) => !open && onClose()}>
    <AlertDialogContent style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
      <AlertDialogHeader>
        <AlertDialogTitle className="text-[var(--t)]">Delete Beneficiary</AlertDialogTitle>
        <AlertDialogDescription className="text-[var(--t4)]">
          You are about to permanently delete <strong className="text-[var(--t)]">{target?.name}</strong>.
          Do you want to remove them from <strong>all connected estates</strong>, or only this estate?
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="flex-col sm:flex-row gap-2">
        <AlertDialogCancel
          className="text-[var(--t4)] border-[var(--b)] hover:bg-[var(--s)]"
          data-testid="delete-ben-cancel"
        >
          Cancel
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={() => onDelete(target?.id, false)}
          className="font-bold"
          style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}
          data-testid="delete-ben-this-estate"
        >
          This Estate Only
        </AlertDialogAction>
        <AlertDialogAction
          onClick={() => onDelete(target?.id, true)}
          className="font-bold"
          style={{ background: '#EF4444', color: '#fff' }}
          data-testid="delete-ben-all-estates"
        >
          All Estates
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default DeleteBeneficiaryDialog;
