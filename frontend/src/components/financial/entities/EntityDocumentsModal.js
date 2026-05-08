/**
 * EntityDocumentsModal — double-click target on a tile.
 *
 * Lists every SDV document linked to the tapped entity. Clicking any
 * row navigates to /vault?openDoc=<id> which the VaultPage opens
 * automatically on mount.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, X, ExternalLink } from 'lucide-react';
import { docLabel } from './DocumentLinker';

export default function EntityDocumentsModal({ open, entity, documents, onClose }) {
  const navigate = useNavigate();
  if (!open || !entity) return null;
  const ids = entity.document_ids || [];
  const docs = ids.map((id) => documents.find((d) => d.id === id)).filter(Boolean);

  const openInVault = (docId) => {
    onClose?.();
    navigate(`/vault?openDoc=${encodeURIComponent(docId)}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="entity-documents-modal">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl"
        style={{ background: 'var(--bg2)', border: '1px solid var(--b)', boxShadow: '0 12px 40px rgba(0,0,0,0.55)', maxHeight: '80vh' }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--b)]">
          <FileText className="w-4 h-4 text-[var(--gold)]" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--t5)]">Linked documents</div>
            <div className="text-sm font-bold text-[var(--t)] truncate">{entity.name}</div>
          </div>
          <button onClick={onClose} className="p-2 text-[var(--t5)] hover:text-[var(--t)]" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-2 py-2" style={{ maxHeight: 'calc(80vh - 64px)' }}>
          {docs.length === 0 && (
            <div className="text-[12px] text-[var(--t5)] italic text-center py-6">
              No documents linked to this entity yet. Edit the entity to link some.
            </div>
          )}
          {docs.map((d) => (
            <button
              key={d.id}
              onClick={() => openInVault(d.id)}
              className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--s)] transition-colors"
              style={{ border: '1px solid transparent' }}
              data-testid={`entity-doc-row-${d.id}`}
            >
              <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(212,165,55,0.12)', color: 'var(--gold)' }}>
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold text-[var(--t)] truncate">{docLabel(d)}</div>
                <div className="text-[11px] text-[var(--t5)] truncate">
                  {d.category || d.file_type || 'Document'} · Tap to open in SDV
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-[var(--t5)] flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
