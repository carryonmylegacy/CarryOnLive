/**
 * DocumentLinker — SDV document picker.
 *
 * UX:
 *   • Each linked document renders as a compact read-only row showing:
 *       file icon + doc name + pencil (edit) + trashcan (remove)
 *   • Tapping the pencil swaps that row into the picker dropdown so the
 *     user can re-select a different SDV document (matches the "expand
 *     it back to the previous look" UX request).
 *   • Below the rows there is always a single "+ Add linked document"
 *     button. Tapping it opens a fresh native <select> populated with
 *     all SDV documents that are NOT yet linked.
 *   • Native <select> is intentional — Radix Select inside a SlidePanel
 *     can fail to receive pointer events on iOS standalone PWAs; the
 *     native picker is bullet-proof and gets the iOS wheel UI for free.
 *
 * Props:
 *   value         : string[]  — array of doc id strings already linked
 *   onChange(ids) : callback when the list changes
 *   documents     : full SDV documents list ({ id, name, ... })
 */
import React, { useState } from 'react';
import { Plus, X, FileText, Pencil } from 'lucide-react';

const docLabel = (doc) => doc?.name || doc?.title || `Document ${doc?.id?.slice(0, 6)}`;

export default function DocumentLinker({ value, onChange, documents }) {
  const selected = value || [];
  const [picking, setPicking] = useState(false);
  // When set, the row with this docId renders as a re-pick dropdown
  // in place of its read-only summary.
  const [editingId, setEditingId] = useState(null);
  const docById = Object.fromEntries((documents || []).map((d) => [d.id, d]));

  const remove = (id) => {
    if (editingId === id) setEditingId(null);
    onChange(selected.filter((x) => x !== id));
  };

  // Documents available for fresh "+ Add" picker (not yet linked).
  const available = (documents || []).filter((d) => !selected.includes(d.id));
  // Documents available when re-picking an existing row (not linked,
  // PLUS the one currently in this row so the user can keep it).
  const availableForEdit = (currentId) =>
    (documents || []).filter((d) => !selected.includes(d.id) || d.id === currentId);

  const handlePick = (e) => {
    const id = e.target.value;
    if (!id) return;
    onChange([...selected, id]);
    setPicking(false);
  };

  const handleSwap = (oldId) => (e) => {
    const newId = e.target.value;
    if (!newId || newId === oldId) {
      setEditingId(null);
      return;
    }
    onChange(selected.map((x) => (x === oldId ? newId : x)));
    setEditingId(null);
  };

  return (
    <div className="space-y-2" data-testid="entity-document-linker">
      {selected.length === 0 && !picking && (
        <p className="text-[12px] text-[var(--t5)] italic">No documents linked yet.</p>
      )}

      {/* Linked rows */}
      {selected.map((docId) => {
        const doc = docById[docId];
        const isEditing = editingId === docId;
        const opts = availableForEdit(docId);

        if (isEditing) {
          return (
            <div
              key={docId}
              className="flex items-stretch gap-2"
              data-testid={`doc-link-edit-${docId}`}
            >
              <select
                autoFocus
                defaultValue={docId}
                onChange={handleSwap(docId)}
                className="input-field select-themed flex-1"
                data-testid={`doc-link-edit-picker-${docId}`}
                style={{ borderColor: 'rgba(var(--gold-rgb), 0.55)' }}
              >
                {opts.length === 0 ? (
                  <option value={docId}>{doc ? docLabel(doc) : 'Document'}</option>
                ) : (
                  opts.map((d) => (
                    <option key={d.id} value={d.id}>{docLabel(d)}</option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-3 rounded-lg text-[12px] font-bold text-[var(--t4)] border border-[var(--b2)] hover:text-[var(--t)] hover:bg-[var(--s)]"
                data-testid={`doc-link-edit-cancel-${docId}`}
              >
                Cancel
              </button>
            </div>
          );
        }

        return (
          <div
            key={docId}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: 'var(--card)',
              border: '1px solid rgba(var(--gold-rgb), 0.35)',
            }}
            data-testid={`doc-link-row-${docId}`}
          >
            <FileText className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
            <span className="flex-1 text-[13px] text-[var(--t)] truncate">
              {doc ? docLabel(doc) : 'Document not in your SDV'}
            </span>
            <button
              type="button"
              onClick={() => setEditingId(docId)}
              className="p-1.5 rounded-md text-[var(--t5)] hover:text-[var(--gold)] hover:bg-[var(--rdbg)]"
              aria-label="Change linked document"
              data-testid={`doc-link-edit-${docId}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => remove(docId)}
              className="p-1.5 rounded-md text-[var(--t5)] hover:text-[#ef4444] hover:bg-[var(--rdbg)]"
              aria-label="Unlink document"
              data-testid={`doc-link-remove-${docId}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {/* Adder: button OR a native <select> while picking. The picker
          is a real <select> in BOTH cases — when SDV has docs the
          options are the docs; when SDV is empty the dropdown still
          opens but contains a single disabled "No documents" option
          so the user gets the same UX shape regardless. */}
      {!picking && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold text-[var(--gold)] whitespace-nowrap border border-[var(--gold)]/70 bg-[rgba(var(--gold-rgb), 0.10)] hover:bg-[rgba(var(--gold-rgb), 0.20)] hover:border-[var(--gold)] transition-colors"
            data-testid="doc-link-add"
          >
            <Plus className="w-3.5 h-3.5" /> Add linked document
          </button>
        </div>
      )}

      {picking && (
        <div className="flex items-stretch gap-2">
          <select
            autoFocus
            defaultValue=""
            onChange={handlePick}
            className="input-field select-themed flex-1"
            data-testid="doc-link-picker"
            style={{ borderColor: 'rgba(var(--gold-rgb), 0.55)' }}
            disabled={available.length === 0}
          >
            {available.length === 0 ? (
              <option value="" disabled>
                {(documents || []).length === 0
                  ? 'No documents in your SDV'
                  : 'No more documents to link'}
              </option>
            ) : (
              <>
                <option value="" disabled>Select a document…</option>
                {available.map((d) => (
                  <option key={d.id} value={d.id}>{docLabel(d)}</option>
                ))}
              </>
            )}
          </select>
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="px-3 rounded-lg text-[12px] font-bold text-[var(--t4)] border border-[var(--b2)] hover:text-[var(--t)] hover:bg-[var(--s)]"
            data-testid="doc-link-cancel"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export { docLabel };
