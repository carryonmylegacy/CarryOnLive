/**
 * DocumentLinker — reusable multi-add document picker.
 *
 * Renders one dropdown per linked document, plus a "+ Add another
 * document" affordance whose dropdown filters to only the SDV documents
 * NOT yet linked. Each linked row has a trash icon for removal.
 *
 * Props:
 *   value         : array of doc id strings
 *   onChange(ids) : callback when the list changes
 *   documents     : full SDV documents list ({ id, name, ... })
 */
import React from 'react';
import { Plus, Trash2, FileText } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

const docLabel = (doc) => doc?.name || doc?.title || `Document ${doc?.id?.slice(0, 6)}`;

export default function DocumentLinker({ value, onChange, documents }) {
  const selected = value || [];
  // Available = docs not already selected. We compute this PER row so each
  // dropdown only shows the still-available docs (plus its own current pick).
  const docById = Object.fromEntries((documents || []).map((d) => [d.id, d]));

  const updateAt = (idx, newId) => {
    const next = [...selected];
    next[idx] = newId;
    onChange(next);
  };
  const removeAt = (idx) => {
    const next = selected.filter((_, i) => i !== idx);
    onChange(next);
  };
  const addRow = () => {
    onChange([...selected, '']);
  };

  // For row idx, available = docs not in selected, EXCEPT docs picked at idx itself.
  const optionsFor = (idx) => {
    const taken = new Set(selected.filter((_, i) => i !== idx).filter(Boolean));
    return (documents || []).filter((d) => !taken.has(d.id));
  };

  const remainingAfterAll = (documents || []).filter((d) => !selected.includes(d.id));
  const canAddMore = remainingAfterAll.length > 0;

  return (
    <div className="space-y-2" data-testid="entity-document-linker">
      {selected.length === 0 && (
        <p className="text-[11px] text-[var(--t5)] italic">No documents linked yet.</p>
      )}
      {selected.map((docId, idx) => {
        const opts = optionsFor(idx);
        return (
          <div key={idx} className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-[var(--t5)] flex-shrink-0" />
            <Select
              value={docId || ''}
              onValueChange={(v) => updateAt(idx, v)}
            >
              <SelectTrigger className="input-field select-themed flex-1" data-testid={`doc-link-row-${idx}`}>
                <SelectValue placeholder="Select a document…" />
              </SelectTrigger>
              <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)] max-h-64">
                {opts.length === 0 && <SelectItem value="__none__" disabled>No documents available</SelectItem>}
                {opts.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{docLabel(d)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={() => removeAt(idx)}
              className="p-1 text-[#ef4444] hover:opacity-70 flex-shrink-0"
              aria-label="Remove document"
              data-testid={`doc-link-remove-${idx}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
      {canAddMore ? (
        <button
          onClick={addRow}
          className="text-[11px] font-bold text-[var(--gold)] hover:underline flex items-center gap-1 py-1"
          data-testid="doc-link-add"
        >
          <Plus className="w-3 h-3" /> {selected.length === 0 ? 'Link a document' : 'Add another document'}
        </button>
      ) : (
        (documents || []).length > 0 && (
          <p className="text-[11px] text-[var(--t5)] italic">All available SDV documents are linked.</p>
        )
      )}
      {(documents || []).length === 0 && (
        <p className="text-[11px] text-[var(--t5)] italic">No documents in your SDV yet.</p>
      )}
    </div>
  );
}

export { docLabel };
