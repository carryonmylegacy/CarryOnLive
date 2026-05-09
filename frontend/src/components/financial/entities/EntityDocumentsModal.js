/**
 * EntityDocumentsModal — opens when the user taps an entity tile to
 * see every SDV document linked to that entity. Clicking any row
 * navigates to /vault?openDoc=<id> which the VaultPage auto-opens.
 *
 * Uses the platform's SlidePanel so it behaves identically to every
 * other slide-in across the app — same scroll, swipe-to-dismiss,
 * mobile safe-area padding, and bottom-nav clearance.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ExternalLink } from 'lucide-react';
import SlidePanel from '../../SlidePanel';
import { docLabel } from './DocumentLinker';

export default function EntityDocumentsModal({ open, entity, documents, onClose }) {
  const navigate = useNavigate();
  if (!entity) return null;
  const ids = entity.document_ids || [];
  const docs = ids.map((id) => documents.find((d) => d.id === id)).filter(Boolean);

  const openInVault = (docId) => {
    onClose?.();
    navigate(`/vault?openDoc=${encodeURIComponent(docId)}`);
  };

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Linked documents"
      subtitle={entity.name}
    >
      <div className="space-y-2" data-testid="entity-documents-modal">
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
            style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
            data-testid={`entity-doc-row-${d.id}`}
          >
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(212,165,55,0.12)', color: 'var(--gold)' }}
            >
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
    </SlidePanel>
  );
}
