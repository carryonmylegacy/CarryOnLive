import React, { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Heart, FileText, ShieldCheck, Download, WifiOff, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';
import {
  pinDocument,
  unpinDocument,
  isPinnedLocally,
  getPinnedBlob,
} from '../../offline/pinnedDocsRepo';
import { iosSafeDownload } from '../../utils/iosSafeDownload';

/**
 * BeneficiaryEssentialDocsPanel — top-of-page panel on the beneficiary's
 * vault page showing the 4 essential documents the benefactor has
 * designated for them, each with a "Make available offline" toggle.
 *
 * Behavior
 *   • Lists exactly the 4 slots (living will, healthcare directive,
 *     general POA, financial POA), even when empty (so the beneficiary
 *     understands the scope and can ask their benefactor to populate).
 *   • Toggle ON → fetches the binary, persists to Dexie via
 *     pinnedDocsRepo. Hard cap: 25 MB per document. Larger files toast
 *     and abort.
 *   • Toggle OFF → evicts the local blob.
 *   • Download button works offline IF the doc is pinned (reads from
 *     the local blob); falls back to a "needs internet" toast otherwise.
 */

const SLOT_ICONS = {
  living_will: Heart,
  healthcare_directive: ShieldCheck,
  general_poa: FileText,
  financial_poa: FileText,
};

const MAX_OFFLINE_DOC_BYTES = 25 * 1024 * 1024; // 25 MB

const BeneficiaryEssentialDocsPanel = ({ estateId, getAuthHeaders }) => {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pinningId, setPinningId] = useState(null);
  const [pinnedMap, setPinnedMap] = useState({}); // { [docId]: bool }
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    let alive = true;
    const fetchSlots = async () => {
      if (!estateId) { setLoading(false); return; }
      try {
        // Online path — fetch authoritative slot data.
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          const res = await apiClient.get(`${API_URL}/beneficiary/essential-docs/${estateId}`, getAuthHeaders());
          if (!alive) return;
          const list = Array.isArray(res.data) ? res.data : [];
          setSlots(list);
          // Persist a metadata-only cache so the panel still renders
          // offline. File blobs live in Dexie pinnedDocsRepo (NEVER
          // duplicated into localStorage).
          try {
            localStorage.setItem(
              `carryon_list_cache:beneficiary:essential_docs:${estateId}`,
              JSON.stringify({ value: list, ts: Date.now() }),
            );
          } catch { /* quota — non-fatal */ }
          // Discover which docs are already pinned locally.
          const map = {};
          for (const s of list) {
            if (s.document?.id) {
              map[s.document.id] = await isPinnedLocally(s.document.id);
            }
          }
          if (alive) setPinnedMap(map);
        } else {
          // Offline — rehydrate from cache.
          try {
            const cached = JSON.parse(
              localStorage.getItem(`carryon_list_cache:beneficiary:essential_docs:${estateId}`) || 'null',
            );
            if (Array.isArray(cached?.value)) setSlots(cached.value);
          } catch { /* ignore */ }
          // Pin status from local Dexie (always available offline).
          const map = {};
          for (const s of slots) {
            if (s.document?.id) {
              map[s.document.id] = await isPinnedLocally(s.document.id);
            }
          }
          if (alive) setPinnedMap(map);
        }
      } catch {
        // Quietly fall back — panel hides if we can't show slots.
      } finally {
        if (alive) setLoading(false);
      }
    };
    fetchSlots();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estateId]);

  const handleTogglePin = async (slot, nextValue) => {
    const doc = slot.document;
    if (!doc?.id) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false && nextValue) {
      toast.error('Turning offline access ON requires an internet connection (we need to download the file).');
      return;
    }
    setPinningId(doc.id);
    try {
      if (nextValue) {
        // 25 MB hard cap — skip the network round-trip if metadata
        // already tells us the file is too big.
        if (doc.file_size && doc.file_size > MAX_OFFLINE_DOC_BYTES) {
          toast.error(`This document is ${(doc.file_size / 1024 / 1024).toFixed(1)} MB — too large for offline cache (25 MB cap).`);
          return;
        }
        // Persist server-side flag first so the user's intent survives
        // even if the blob fetch fails — the warmup loop will retry.
        await apiClient.put(
          `${API_URL}/documents/${doc.id}/pin-offline?pinned=true`,
          null,
          getAuthHeaders(),
        ).catch(() => { /* server flag is best-effort */ });
        // Fetch + persist the blob via the same helper the benefactor
        // uses (pinnedDocsRepo.pinDocument).
        const fetchHeaders = getAuthHeaders()?.headers || {};
        const bytes = await pinDocument(doc, fetchHeaders);
        if (bytes > MAX_OFFLINE_DOC_BYTES) {
          // Defensive — file_size metadata lied. Roll back the cache.
          await unpinDocument(doc.id);
          toast.error(`This document is ${(bytes / 1024 / 1024).toFixed(1)} MB — too large for offline cache (25 MB cap).`);
          return;
        }
        setPinnedMap((m) => ({ ...m, [doc.id]: true }));
        toast.success(`${slot.label} available offline (${(bytes / 1024).toFixed(0)} KB)`);
      } else {
        await apiClient.put(
          `${API_URL}/documents/${doc.id}/pin-offline?pinned=false`,
          null,
          getAuthHeaders(),
        ).catch(() => { /* server flag is best-effort */ });
        await unpinDocument(doc.id);
        setPinnedMap((m) => ({ ...m, [doc.id]: false }));
        toast.success('Removed from offline cache');
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update offline access');
    } finally {
      setPinningId(null);
    }
  };

  const handleDownload = async (slot) => {
    const doc = slot.document;
    if (!doc?.id) return;
    setDownloading(doc.id);
    try {
      // Offline path — try the local pinned blob first.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const blob = await getPinnedBlob(doc.id);
        if (blob) {
          await iosSafeDownload(blob, doc.name || 'document', doc.name || 'Document', 'beneficiary_essential_doc');
          return;
        }
        toast.error('This document is not available offline. Connect to the internet to download.');
        return;
      }
      // Online path — pull a fresh copy from the server.
      const res = await apiClient.get(`${API_URL}/documents/${doc.id}/preview`, {
        ...getAuthHeaders(),
        responseType: 'blob',
      });
      await iosSafeDownload(res.data, doc.name || 'document', doc.name || 'Document', 'beneficiary_essential_doc');
    } catch (_err) {
      toast.error('Download failed.');
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5" data-testid="ben-essential-docs-loading">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[120px] rounded-2xl animate-pulse"
            style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px dashed rgba(var(--gold-rgb), 0.3)' }} />
        ))}
      </div>
    );
  }

  // Hide the panel completely if there are zero slots in the response —
  // some legacy estates won't have any essential docs designated.
  if (!slots.length) return null;

  return (
    <div className="mb-5" data-testid="ben-essential-docs-panel">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[12px] font-bold tracking-wide uppercase" style={{ color: 'var(--gold, #d4af37)' }}>
          Essential Offline Documents
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {slots.map((slot) => {
          const Icon = SLOT_ICONS[slot.slot] || FileText;
          const doc = slot.document;
          const isPinned = doc ? !!pinnedMap[doc.id] : false;
          return (
            <div
              key={slot.slot}
              data-testid={`ben-essential-slot-${slot.slot}`}
              className="rounded-2xl p-4"
              style={{
                background: doc
                  ? 'linear-gradient(135deg, rgba(var(--gold-rgb), 0.08), rgba(var(--gold-rgb), 0.04))'
                  : 'rgba(var(--gold-rgb), 0.03)',
                border: doc
                  ? '2px solid rgba(var(--gold-rgb), 0.55)'
                  : '2px dashed rgba(var(--gold-rgb), 0.4)',
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(var(--gold-rgb), 0.18)' }}>
                  <Icon className="w-5 h-5" style={{ color: 'var(--gold, #d4af37)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-[14px] truncate" style={{ color: 'var(--t)' }}>{slot.label}</h4>
                  {doc ? (
                    <>
                      <p className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--t2)' }}>
                        {doc.name || 'Untitled'}
                        {doc.file_size ? <span className="ml-2 text-[var(--t4)]">{(doc.file_size / 1024 / 1024).toFixed(1)} MB</span> : null}
                      </p>
                      <div className="flex items-center gap-2 mt-2.5">
                        <Switch
                          checked={isPinned}
                          onCheckedChange={(v) => handleTogglePin(slot, v)}
                          disabled={pinningId === doc.id}
                          data-testid={`ben-essential-slot-${slot.slot}-toggle`}
                        />
                        <span className="text-[12px] font-bold" style={{ color: isPinned ? '#34d399' : 'var(--t3)' }}>
                          {pinningId === doc.id ? (
                            <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Working…</span>
                          ) : isPinned ? (
                            <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Available offline</span>
                          ) : (
                            <span className="inline-flex items-center gap-1"><WifiOff className="w-3 h-3" /> Make available offline</span>
                          )}
                        </span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] font-bold"
                          onClick={() => handleDownload(slot)}
                          disabled={downloading === doc.id}
                          data-testid={`ben-essential-slot-${slot.slot}-download`}
                        >
                          {downloading === doc.id ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3 mr-1" />
                          )}
                          Download
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-[12px] mt-0.5" style={{ color: 'var(--t3)' }}>
                        Not designated to you yet.
                      </p>
                      <p className="text-[11px] mt-2" style={{ color: 'var(--t4)' }}>
                        Ask your benefactor to add this document and grant you access.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] mt-2" style={{ color: 'var(--t4)' }}>
        Tap <strong>Make available offline</strong> to download a copy onto this device. 25 MB max per document. Files stay on this device until you remove them.
      </p>
    </div>
  );
};

export default BeneficiaryEssentialDocsPanel;
