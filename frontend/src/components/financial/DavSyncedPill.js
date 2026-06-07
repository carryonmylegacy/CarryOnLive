import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

/**
 * "Login in DAV" reassurance pill (audit d5a54f5e follow-up).
 * Shown on a CFP item tile when the item links a Digital Access Vault
 * credential row (`item.dav_entry_id`). Gives benefactors instant confirmation
 * at a glance that the beneficiary login was saved to the vault — and is now a
 * one-tap deep-link straight to that credential in the DAV (highlighted on
 * arrival), tightening the CFP <-> DAV loop.
 */
export const DavSyncedPill = ({ linked, davEntryId, testId }) => {
  const navigate = useNavigate();
  if (!linked) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/digital-wallet?entry=${encodeURIComponent(davEntryId || '')}`);
      }}
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap transition-all hover:brightness-125 cursor-pointer"
      style={{
        background: 'rgba(16,185,129,0.12)',
        color: '#10b981',
        border: '1px solid rgba(16,185,129,0.3)',
      }}
      data-testid={testId}
      title="View this login in your Digital Access Vault"
    >
      <ShieldCheck className="w-3 h-3" /> Login in DAV
    </button>
  );
};

export default DavSyncedPill;
