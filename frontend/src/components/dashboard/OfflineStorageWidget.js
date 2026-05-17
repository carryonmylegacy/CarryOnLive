import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { useNavigate } from 'react-router-dom';
import { HardDrive, PinOff, Loader2, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';
import { listPinned, unpinDocument } from '../../offline/pinnedDocsRepo';

/**
 * "Storage used offline" dashboard widget — Phase 9a closer.
 *
 * Shows the user how much device storage their pinned documents are
 * consuming and offers a one-tap unpin shortcut for each. Hides when
 * the user has no pins (no value to show empty state on the dashboard).
 *
 * The total/list comes from the local Dexie repo (`pinnedDocsRepo`),
 * which is the authoritative source for what's actually viewable
 * offline on THIS device. The server flag exists for cross-device
 * re-priming and is updated alongside any unpin we trigger here.
 */
const formatBytes = (bytes) => {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const OfflineStorageWidget = () => {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unpinning, setUnpinning] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listPinned();
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleUnpin = async (e, docId) => {
    e.stopPropagation();
    setUnpinning(docId);
    try {
      // Mirror PinForOfflineButton: clear server flag first, then evict local blob.
      try {
        await apiClient.put(`${API_URL}/documents/${docId}/pin-offline?pinned=false`, null, getAuthHeaders());
      } catch {
        // Server may be unreachable offline — the local evict is what matters here.
      }
      await unpinDocument(docId);
      toast.success('Removed from offline pins');
      refresh();
    } catch {
      toast.error('Failed to unpin');
    } finally {
      setUnpinning(null);
    }
  };

  if (loading || rows.length === 0) return null;

  const total = rows.reduce((sum, r) => sum + (r.size_bytes || 0), 0);

  return (
    <Card className="glass-card" data-testid="offline-storage-widget">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[var(--gold)]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--t3)]">
              Storage used offline
            </h3>
          </div>
          <span
            className="text-xs font-semibold text-[var(--t4)]"
            data-testid="offline-storage-total"
          >
            {formatBytes(total)} · {rows.length} {rows.length === 1 ? 'doc' : 'docs'}
          </span>
        </div>
        <ul className="space-y-1">
          {rows.slice(0, 5).map((r) => (
            <li
              key={r.cache_key}
              className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm hover:bg-[var(--s)] transition-colors"
              data-testid={`offline-storage-row-${r.doc_id}`}
            >
              <div className="min-w-0 flex-1 mr-2">
                <div className="text-[var(--t)] font-medium truncate">{r.title || 'Untitled'}</div>
                <div className="text-[11px] text-[var(--t5)]">{formatBytes(r.size_bytes)}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => handleUnpin(e, r.doc_id)}
                disabled={unpinning === r.doc_id}
                title="Unpin from offline"
                aria-label="Unpin from offline"
                data-testid={`offline-storage-unpin-${r.doc_id}`}
              >
                {unpinning === r.doc_id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <PinOff className="w-4 h-4" />}
              </Button>
            </li>
          ))}
        </ul>
        {rows.length > 5 && (
          <button
            type="button"
            onClick={() => navigate('/vault')}
            className="mt-2 w-full text-xs text-[var(--gold)] hover:underline flex items-center justify-center gap-1"
            data-testid="offline-storage-manage-all"
          >
            Manage all {rows.length} pinned docs <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </CardContent>
    </Card>
  );
};

export default OfflineStorageWidget;
