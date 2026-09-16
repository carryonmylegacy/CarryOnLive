/**
 * RosterImportModal — founder-side "Import roster" for one B2B partner
 * (Admin → Finance → Partners → spreadsheet icon). Same panel, same rules
 * as the Partner Portal; clients are tagged created_by_admin_id.
 */

import React from 'react';
import { X } from 'lucide-react';
import { RosterImportPanel } from '../manager/RosterImportPanel';
import { API_URL } from '../../config';

export const RosterImportModal = ({ partner, authHeaders, onClose, onImported }) => {
  const base = `${API_URL}/admin/partners/${partner.id}/roster`;
  const api = { analyze: `${base}/analyze`, remap: `${base}/remap`, commit: `${base}/commit`, imports: `${base}/imports` };
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" style={{ background: 'rgba(5,10,20,0.75)', backdropFilter: 'blur(6px)' }} data-testid="roster-import-modal">
      <div className="w-full max-w-5xl rounded-2xl relative my-4" style={{ background: 'var(--bg)', border: '1px solid var(--b)' }}>
        <button onClick={onClose} className="absolute top-3 right-3 p-2 rounded-lg text-[var(--t5)] hover:text-[var(--t)]" style={{ background: 'var(--s)' }} data-testid="roster-import-modal-close" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
        <div className="p-4 sm:p-6 pt-12 sm:pt-6">
          <RosterImportPanel
            api={api}
            headers={authHeaders}
            onImported={onImported}
            title={`Import roster for ${partner.company_name}`}
          />
        </div>
      </div>
    </div>
  );
};
