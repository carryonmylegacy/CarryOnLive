import React, { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
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
  // `isPinned` is the single source of truth for what the button shows.
  // It's seeded from BOTH the server flag (doc.pinned_offline) and the
  // local Dexie blob on mount, then driven by the user's toggle actions.
  // Previously the render used `doc.pinned_offline || localPinned`, which
  // stayed truthy after an unpin because the parent never refetched the
  // doc prop — so the button appeared stuck gold on tap-to-unpin.
  const [isPinned, setIsPinned] = useState(!!doc.pinned_offline);

  useEffect(() => {
    let alive = true;
    // Merge the server flag (from the prop we were rendered with) with
    // whatever Dexie actually has locally. Either being true means the
    // user intended this doc to be pinned.
    isPinnedLocally(doc.id)
      .then((p) => {
        if (alive) setIsPinned(!!doc.pinned_offline || p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [doc.id, doc.pinned_offline]);

  // Stay in sync when this doc is (un)pinned from another surface — e.g.
  // the "Storage used offline" panel's unpin button. Re-reads the local
  // Dexie state so the row's pin icon never looks stale.
  useEffect(() => {
    const onPinsChanged = (e) => {
      if (e?.detail?.docId && e.detail.docId !== doc.id) return;
      isPinnedLocally(doc.id).then((p) => setIsPinned(!!p)).catch(() => {});
    };
    window.addEventListener('carryon:pins-changed', onPinsChanged);
    return () => window.removeEventListener('carryon:pins-changed', onPinsChanged);
  }, [doc.id]);

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
        await apiClient.put(`${API_URL}/documents/${doc.id}/pin-offline?pinned=false`, null, getAuthHeaders());
        await unpinDocument(doc.id);
        setIsPinned(false);
        toast.success('Removed from offline pins');
      } else {
        // Pin: server flag first so the user's intent survives even if
        // the blob fetch fails (warmup will retry on next sync).
        await apiClient.put(`${API_URL}/documents/${doc.id}/pin-offline?pinned=true`, null, getAuthHeaders());
        try {
          const bytes = await pinDocument(doc, getAuthHeaders()?.headers);
          setIsPinned(true);
          toast.success(`Pinned for offline (${(bytes / 1024).toFixed(0)} KB)`);
        } catch (_blobErr) {
          // Server flag is set; blob will be primed by warmup later.
          setIsPinned(true);
          toast.info('Marked for offline. Will download on next sync.');
        }
      }
      // Notify sibling pin UIs (the Storage-used-offline panel and any
      // other rendered rows for this doc) so they reflect the change
      // immediately instead of looking "stuck" until a full reload.
      try {
        window.dispatchEvent(new CustomEvent('carryon:pins-changed', { detail: { docId: doc.id } }));
      } catch { /* SSR / no window */ }
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
      aria-pressed={isPinned}
      data-pinned={isPinned ? 'true' : 'false'}
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
