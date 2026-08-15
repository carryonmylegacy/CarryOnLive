/**
 * ClientNoteEditor — inline private partner note about a roster client.
 * Only the partner sees it; never surfaced to the client.
 */

import React, { useState } from 'react';
import { Loader2, StickyNote } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import apiClient from '../../utils/apiClient';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const mgrHeaders = () => {
  const t = window.localStorage.getItem('carryon_manager_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export const ClientNoteEditor = ({ clientId, initialNote, onSaved, onCancel }) => {
  const [note, setNote] = useState(initialNote || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put(`${API_URL}/manager/clients/${clientId}/note`, { note },
        { headers: { ...mgrHeaders(), 'Content-Type': 'application/json' } });
      toast.success('Note saved');
      onSaved?.(note);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--b)' }} data-testid={`mgr-note-editor-${clientId}`}>
      <p className="text-[11px] font-bold text-[var(--t4)] mb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
        <StickyNote className="w-3 h-3 text-[var(--gold)]" /> Private note — only you can see this
      </p>
      <Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={3}
        placeholder="e.g. Waiting on trust documents — follow up next week…"
        className="input-field text-sm mb-2" data-testid="mgr-note-textarea" />
      <div className="flex gap-2">
        <Button size="sm" className="gold-button text-xs" onClick={save} disabled={saving} data-testid="mgr-note-save-btn">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save Note'}
        </Button>
        <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={onCancel} data-testid="mgr-note-cancel-btn">
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default ClientNoteEditor;
