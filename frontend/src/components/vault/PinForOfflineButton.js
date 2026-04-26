import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Pin, PinOff, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';
import {
  pinDocument,
  unpinDocument,
  isPinnedLocally,
} from '../../offline/pinnedDocsRepo';

/**
 * PinForOfflineButton — toggles "pin this document for offline access".
 *
 * Two-tier persistence:
 *   1. Local Dexie blob (`pinnedDocsRepo`) — what makes the document
 *      actually viewable offline.
 *   2. Server flag (`pinned_offline=true`) — survives across devices,
 *      so re-installing the PWA still re-primes the blob via warmup.
 *
 * Locked documents cannot be pinned (the blob would be unusable
 * without the per-session unlock). The backend enforces this; we
 * proactively grey out the button so users don't have to learn by
 * error.
 */
const PinForOfflineButton = ({ doc, getAuthHeaders }) => {
  const [pinning, setPinning] = useState(false);
  const [localPinned, setLocalPinned] = useState(false);

  useEffect(() => {
    let alive = true;
    isPinnedLocally(doc.id).then((p) => alive && setLocalPinned(p)).catch(() => {});
    return () => { alive = false; };
  }, [doc.id]);

  const isPinnedServer = !!doc.pinned_offline;
  const isPinned = isPinnedServer || localPinned;
  const disabled = !!doc.is_locked;

  const handleToggle = async (e) => {
    e.stopPropagation();
    if (disabled) {
      toast.error('Locked documents cannot be pinned for offline access.');
      return;
    }
    setPinning(true);
    try {
      if (isPinned) {
        // Unpin: server flag first (cheap), then evict local blob.
        await axios.put(`${API_URL}/documents/${doc.id}/pin-offline?pinned=false`, null, getAuthHeaders());
        await unpinDocument(doc.id);
        setLocalPinned(false);
        toast.success('Removed from offline pins');
      } else {
        // Pin: server flag first so the user's intent survives even if
        // the blob fetch fails (warmup will retry on next sync).
        await axios.put(`${API_URL}/documents/${doc.id}/pin-offline?pinned=true`, null, getAuthHeaders());
        try {
          const bytes = await pinDocument(doc, getAuthHeaders()?.headers);
          setLocalPinned(true);
          toast.success(`Pinned for offline (${(bytes / 1024).toFixed(0)} KB)`);
        } catch (blobErr) {
          // Server flag is set; blob will be primed by warmup later.
          toast.info('Marked for offline. Will download on next sync.');
        }
      }
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to update pin';
      toast.error(detail);
    } finally {
      setPinning(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className={isPinned ? 'text-[var(--gold)]' : 'text-[#94a3b8] hover:text-white'}
      onClick={handleToggle}
      disabled={pinning || disabled}
      title={
        disabled ? 'Locked documents cannot be pinned' :
          isPinned ? 'Pinned for offline — tap to unpin' :
            'Pin for offline access'
      }
      aria-label={isPinned ? 'Unpin from offline' : 'Pin for offline'}
      data-testid={`pin-offline-${doc.id}`}
    >
      {pinning ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isPinned ? (
        <Pin className="w-4 h-4 fill-current" />
      ) : (
        <PinOff className="w-4 h-4" />
      )}
    </Button>
  );
};

export default PinForOfflineButton;
