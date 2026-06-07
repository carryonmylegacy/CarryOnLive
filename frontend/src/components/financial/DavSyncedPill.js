import React from 'react';
import { ShieldCheck } from 'lucide-react';

/**
 * "Login in DAV" reassurance pill (audit d5a54f5e follow-up).
 * Shown on a CFP item tile when the item links a Digital Access Vault
 * credential row (`item.dav_entry_id`). Gives benefactors instant confirmation
 * at a glance that the beneficiary login was saved to the vault — reinforcing
 * the "your family knows exactly what to do" promise at the point of entry.
 */
export const DavSyncedPill = ({ linked, testId }) => {
  if (!linked) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap"
      style={{
        background: 'rgba(16,185,129,0.12)',
        color: '#10b981',
        border: '1px solid rgba(16,185,129,0.3)',
      }}
      data-testid={testId}
      title="A beneficiary login for this item is saved in your Digital Access Vault"
    >
      <ShieldCheck className="w-3 h-3" /> Login in DAV
    </span>
  );
};

export default DavSyncedPill;
