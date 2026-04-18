/**
 * ECTConfirmDialogs — pure, stateless confirmation dialogs for ECT.
 * All data flows in via props. Zero side effects.
 */
import React from 'react';
import { Loader2, Trash2 } from 'lucide-react';

/**
 * Single-channel delete confirmation.
 */
export function ECTDeleteConfirmDialog({ channel, onConfirm, onCancel }) {
  if (!channel) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-xs rounded-2xl p-6 text-center overflow-y-auto"
        style={{ background: '#0F1629', border: '1px solid rgba(255,255,255,0.1)', maxHeight: 'calc(100dvh - 120px)' }}>
        <Trash2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#dc2626' }} />
        <h3 className="text-base font-bold mb-1" style={{ color: 'var(--t)' }}>Delete Conversation</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--t4)' }}>
          Delete <strong style={{ color: 'var(--t)' }}>{channel.name}</strong>? This removes all messages and cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            data-testid="ect-delete-cancel"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}
          >Cancel</button>
          <button
            onClick={() => onConfirm(channel.id)}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            data-testid="ect-delete-confirm"
            style={{ background: '#dc2626', color: '#fff' }}
          >Delete</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Bulk-delete confirmation.
 */
export function ECTBulkDeleteConfirmDialog({ count, loading, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-xs rounded-2xl p-6 text-center overflow-y-auto"
        style={{ background: '#0F1629', border: '1px solid rgba(255,255,255,0.1)', maxHeight: 'calc(100dvh - 120px)' }}>
        <Trash2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#dc2626' }} />
        <h3 className="text-base font-bold mb-1" style={{ color: 'var(--t)' }}>
          Delete {count} Conversation{count !== 1 ? 's' : ''}
        </h3>
        <p className="text-sm mb-5" style={{ color: 'var(--t4)' }}>
          This will permanently delete {count} conversation{count !== 1 ? 's' : ''} and all their messages. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            data-testid="ect-bulk-delete-cancel"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
            data-testid="ect-bulk-delete-confirm"
            style={{ background: '#dc2626', color: '#fff' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? 'Deleting...' : `Delete ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}
