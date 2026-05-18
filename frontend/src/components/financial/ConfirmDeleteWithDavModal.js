import React from 'react';
import { Trash2, Link2, AlertTriangle, X } from 'lucide-react';
import { Button } from '../ui/button';

/**
 * ConfirmDeleteWithDavModal — 3-option delete confirmation for any CFP
 * item (bill / debt / account / property) that has an auto-linked
 * Digital Access Vault credential. Falls back to a simple Yes/Cancel
 * dialog when there's no DAV link.
 *
 * Works fully offline — the user's choice is captured client-side and
 * the resulting DELETE request is queued by mutateWithOutbox like any
 * other write (with the `delete_dav=true|false` flag baked into the
 * URL so the server replay is verbatim).
 */
export default function ConfirmDeleteWithDavModal({
  open,
  itemLabel,
  itemName,
  linkedDav,
  onCancel,
  onConfirmKeep,    // delete only the financial item, KEEP the DAV credential
  onConfirmCascade, // delete BOTH the financial item AND the DAV credential
}) {
  if (!open) return null;
  const hasDav = !!linkedDav;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
      data-testid="confirm-delete-dav-modal"
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b)', boxShadow: '0 24px 64px -8px rgba(0,0,0,0.7)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.12)' }}>
            <AlertTriangle className="w-5 h-5" style={{ color: '#ef4444' }} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-[var(--t)] text-base">Delete {itemLabel}?</h3>
            <p className="text-sm text-[var(--t3)] mt-0.5">
              {itemName ? <strong className="text-[var(--t)]">{itemName}</strong> : 'This entry'} will be removed. This cannot be undone.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-[var(--t4)] hover:text-[var(--t)]"
            data-testid="confirm-delete-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {hasDav ? (
          <>
            <div
              className="rounded-xl p-3 my-3 flex items-start gap-2.5"
              style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}
            >
              <Link2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-[var(--gold)]">Linked Digital Access Vault credential</div>
                <div className="text-sm text-[var(--t)] truncate">{linkedDav.account_name || 'Untitled'}</div>
                {linkedDav.login_username ? (
                  <div className="text-[12px] text-[var(--t3)] truncate">{linkedDav.login_username}</div>
                ) : null}
              </div>
            </div>
            <p className="text-sm text-[var(--t3)] mb-4">
              This {itemLabel.toLowerCase()} is auto-linked to a credential in the Digital Access Vault.
              Do you want to delete the linked credential too?
            </p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={onConfirmCascade}
                className="w-full"
                style={{ background: '#ef4444', color: 'white' }}
                data-testid="confirm-delete-both"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete {itemLabel.toLowerCase()} AND linked credential
              </Button>
              <Button
                onClick={onConfirmKeep}
                variant="outline"
                className="w-full"
                data-testid="confirm-delete-keep-dav"
              >
                Delete {itemLabel.toLowerCase()} only — keep the credential
              </Button>
              <Button
                onClick={onCancel}
                variant="ghost"
                className="w-full text-[var(--t3)]"
                data-testid="confirm-delete-cancel"
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <div className="flex gap-2 mt-4">
            <Button
              onClick={onCancel}
              variant="outline"
              className="flex-1"
              data-testid="confirm-delete-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirmKeep}
              className="flex-1"
              style={{ background: '#ef4444', color: 'white' }}
              data-testid="confirm-delete-yes"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
