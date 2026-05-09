/**
 * DocumentLinker — SDV document picker.
 *
 * UX:
 *   • Each linked document renders as a row (file icon + name + × remove).
 *   • Below the rows there is always a single "+ Add linked document" button.
 *   • Tapping the button opens a native <select> populated with all SDV
 *     documents that are NOT yet linked. The user picks one and the
 *     button reappears so they can add another.
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
import { useNavigate } from 'react-router-dom';
import { Plus, X, FileText, ExternalLink } from 'lucide-react';

const docLabel = (doc) => doc?.name || doc?.title || `Document ${doc?.id?.slice(0, 6)}`;

export default function DocumentLinker({ value, onChange, documents }) {
  const navigate = useNavigate();
  const selected = value || [];
  const [picking, setPicking] = useState(false);
  const docById = Object.fromEntries((documents || []).map((d) => [d.id, d]));

  const remove = (id) => onChange(selected.filter((x) => x !== id));
  const available = (documents || []).filter((d) => !selected.includes(d.id));
  const openInVault = (docId) => navigate(`/vault?openDoc=${encodeURIComponent(docId)}`);

  const handlePick = (e) => {
    const id = e.target.value;
    if (!id) return;
    onChange([...selected, id]);
    setPicking(false);
  };

  return (
    <div className="space-y-2" data-testid="entity-document-linker">
      {selected.length === 0 && !picking && (
        <p className="text-[12px] text-[var(--t5)] italic">No documents linked yet.</p>
      )}

      {/* Linked rows */}
      {selected.map((docId) => {
        const doc = docById[docId];
        return (
          <div
            key={docId}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: 'var(--card)',
              border: '1px solid rgba(212,165,55,0.35)',
            }}
            data-testid={`doc-link-row-${docId}`}
          >
            <FileText className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
            <span className="flex-1 text-[13px] text-[var(--t)] truncate">
              {doc ? docLabel(doc) : 'Document not in your SDV'}
            </span>
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

      {/* Adder: button OR a native <select> while picking */}
      {!picking && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-[var(--gold)] border border-dashed border-[var(--gold)]/40 hover:bg-[var(--gold)]/5"
          data-testid="doc-link-add"
        >
          <Plus className="w-3.5 h-3.5" /> Add linked document
        </button>
      )}

      {picking && available.length > 0 && (
        <div className="flex items-stretch gap-2">
          {/* Native <select>; iOS PWA opens its wheel picker, Android &
              desktop get a normal dropdown — both reliable and high
              contrast. defaultValue="" so the placeholder option is the
              initial state. */}
          <select
            autoFocus
            defaultValue=""
            onChange={handlePick}
            className="input-field select-themed flex-1"
            data-testid="doc-link-picker"
            style={{ borderColor: 'rgba(212,165,55,0.55)' }}
          >
            <option value="" disabled>Select a document…</option>
            {available.map((d) => (
              <option key={d.id} value={d.id}>{docLabel(d)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="px-3 rounded-lg text-[12px] font-bold text-[var(--t4)] border border-[var(--b)] hover:text-[var(--t)] hover:bg-[var(--s)]"
            data-testid="doc-link-cancel"
          >
            Cancel
          </button>
        </div>
      )}

      {picking && available.length === 0 && (
        <div
          className="px-3 py-3 rounded-lg space-y-2"
          style={{ background: 'var(--card)', border: '1px solid rgba(212,165,55,0.35)' }}
          data-testid="doc-link-empty-prompt"
        >
          <p className="text-[12px] text-[var(--t3)]">
            {(documents || []).length === 0
              ? 'Your Secure Document Vault is empty. Upload a document to your SDV first, then come back here to link it.'
              : 'Every document in your SDV is already linked here.'}
          </p>
          <div className="flex items-center gap-2">
            {(documents || []).length === 0 && (
              <button
                type="button"
                onClick={() => { setPicking(false); window.location.href = '/vault'; }}
                className="px-3 py-1.5 rounded-md text-[11px] font-bold btn-gold-cta"
                data-testid="doc-link-goto-vault"
              >
                Open SDV
              </button>
            )}
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="px-3 py-1.5 rounded-md text-[11px] font-bold text-[var(--t4)] border border-[var(--b)]"
              data-testid="doc-link-empty-cancel"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { docLabel };
