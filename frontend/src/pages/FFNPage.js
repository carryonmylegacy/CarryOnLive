import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { useLabelCleaner } from '../utils/brandLabel';
import { useDebouncedRefetch } from '../hooks/useDebouncedRefetch';
import {
  Heart, Plus, Edit2, Trash2, Loader2, Phone, Mail,
  MapPin, User, X, Check, Users
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from '../utils/toast';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { API_URL } from '../config';
import { formatPhoneUS } from '../utils/phoneFormat';
import { saveList, readList } from '../utils/localListCache';
import { useDraftState } from '../hooks/useDraftState';

const EMPTY_FORM = { name: '', phone: '', email: '', address: '', relationship: '', notes: '' };

export default function FFNPage() {
  const { getAuthHeaders } = useAuth();
  const cleanLabel = useLabelCleaner();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [estateId, setEstateId] = useState(null);
  // Draft persistence: navigating away mid-add must restore the open
  // form + filled fields when the user returns. Keyed per estate so
  // multi-estate users don't bleed drafts.
  //
  // Critical: read selected_estate_id SYNCHRONOUSLY from localStorage
  // at first render (not from the estateId useState which is async-set
  // by fetchData below). The useState initializer in useDraftState
  // only runs once — if the key is null at first render, the hook
  // seeds with the default and never re-reads from storage when the
  // estateId arrives later. This was iter_114's reported FFN restore
  // failure: drafts were written but never read back.
  const draftEstateId = (typeof localStorage !== 'undefined' && localStorage.getItem('selected_estate_id')) || estateId || null;
  const draftKey = draftEstateId ? `ffn_form:${draftEstateId}` : null;
  const [showForm, setShowForm, clearShowFormDraft] = useDraftState(draftKey ? `${draftKey}:open` : null, false);
  const [editingId, setEditingId, clearEditingDraft] = useDraftState(draftKey ? `${draftKey}:editing` : null, null);
  const [form, setForm, clearFormDraft] = useDraftState(draftKey ? `${draftKey}:fields` : null, EMPTY_FORM);
  const clearDraft = useCallback(() => {
    clearShowFormDraft();
    clearEditingDraft();
    clearFormDraft();
  }, [clearShowFormDraft, clearEditingDraft, clearFormDraft]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const fetchData = useCallback(async () => {
    // Airplane-mode rescue — rehydrate from the last-known-good cached
    // list so the user sees their FFN contacts instead of a blank
    // "first-time" state. The cache is populated on every successful
    // online fetch below.
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isOffline) {
      const savedEid = localStorage.getItem('selected_estate_id');
      if (savedEid) {
        setEstateId(savedEid);
        const cached = readList(`ffn:${savedEid}`);
        if (Array.isArray(cached) && cached.length > 0) setContacts(cached);
      }
      setLoading(false);
      return;
    }
    try {
      const estatesRes = await apiClient.get(`${API_URL}/estates`, getAuthHeaders());
      const owned = (() => {
        const all = estatesRes.data.filter(e => e.user_role_in_estate === 'owner' || (!e.user_role_in_estate && !e.is_beneficiary_estate));
        const savedId = localStorage.getItem('selected_estate_id');
        return (savedId && all.find(e => e.id === savedId)) || all[0];
      })();
      if (!owned) { setLoading(false); return; }
      setEstateId(owned.id);
      const contactsRes = await apiClient.get(`${API_URL}/ffn/${owned.id}`, getAuthHeaders());
      // Empty-response clobber guard.
      const fresh = Array.isArray(contactsRes.data) ? contactsRes.data : [];
      if (fresh.length > 0 || contacts.length === 0) setContacts(fresh);
      // Persist for the next airplane-mode rehydration.
      saveList(`ffn:${owned.id}`, fresh);
    } catch (err) {
      console.error('FFN fetch error:', err);
    }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh on reconnect so airplane-mode toggling re-hydrates the
  // list without the user having to navigate away and back. The
  // refetch is debounced (400 ms trailing edge) so a burst of
  // online/offline/outbox events during sync recovery doesn't pile
  // up multiple concurrent /api/family-final requests and starve
  // Safari's per-origin connection budget.
  useDebouncedRefetch(
    () => fetchData(),
    ['online', 'offline', 'carryon:outbox:drained'],
  );

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    // 'NEW' is the transient sentinel for an inline-added row that
    // hasn't been persisted yet — treat it as a create (POST), not
    // an update.
    const isCreating = !editingId || editingId === 'NEW';
    try {
      const { mutateWithOutbox } = await import('../utils/offlineMutation');
      const r = await mutateWithOutbox({
        entity_type: 'ffn',
        entity_id: isCreating ? undefined : editingId,
        method: isCreating ? 'POST' : 'PUT',
        url: isCreating ? `/ffn/${estateId}` : `/ffn/${editingId}`,
        body: form,
        authHeaders: getAuthHeaders(),
      });
      if (!r.ok) throw r.error || new Error('save failed');
      if (r.queued) {
        toast.success(isCreating ? 'Contact queued — will sync when you reconnect.' : 'Contact saved offline — will sync when you reconnect.');
        // Optimistically update the UI so the user sees their change.
        if (isCreating) {
          const tempId = `local-ffn-${Date.now()}`;
          setContacts(prev => [...prev, { ...form, id: tempId, _local_pending: true }]);
        } else {
          setContacts(prev => prev.map(c => c.id === editingId ? { ...c, ...form } : c));
        }
      } else {
        fetchData();
        toast.success(isCreating ? 'Contact added' : 'Contact saved');
      }
      clearDraft();
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save contact');
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      const { mutateWithOutbox } = await import('../utils/offlineMutation');
      const r = await mutateWithOutbox({
        entity_type: 'ffn',
        entity_id: id,
        method: 'DELETE',
        url: `/ffn/${id}`,
        body: null,
        authHeaders: getAuthHeaders(),
      });
      if (!r.ok) throw r.error || new Error('delete failed');
      setContacts(prev => prev.filter(c => c.id !== id));
      if (r.queued) toast.success('Contact removal queued — will sync when you reconnect.');
    } catch (_err) {
      toast.error('Failed to delete contact');
    }
    setDeleting(null);
  };

  const openEdit = (contact) => {
    setForm({
      name: contact.name || '',
      phone: formatPhoneUS(contact.phone || ''),
      email: contact.email || '',
      address: contact.address || '',
      relationship: contact.relationship || '',
      notes: contact.notes || '',
    });
    setEditingId(contact.id);
    setShowForm(true);
  };

  const openNew = () => {
    setForm(EMPTY_FORM);
    // Use 'NEW' sentinel so the inline editor renders at the top of
    // the list (prepended) — matching the Go-Bag / DAV pattern. The
    // sentinel is replaced with a real id on first successful save.
    setEditingId('NEW');
    setShowForm(true);
  };

  const cancelEdit = () => {
    clearDraft();
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  // List the user sees: real contacts + a transient NEW row pinned to
  // the top while the user is adding. The NEW row is not in `contacts`
  // (which mirrors what's on the server) — it's a virtual entry so the
  // inline-edit form can render inline like every other tile.
  const displayedContacts = (() => {
    if (editingId === 'NEW') {
      return [{ id: 'NEW', _isNew: true, ...EMPTY_FORM }, ...contacts];
    }
    return contacts;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-[var(--gold)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="ffn-page"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(236,72,153,0.12), transparent 55%), radial-gradient(ellipse at bottom right, rgba(219,39,119,0.06), transparent 55%)' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(236,72,153,0.2), rgba(219,39,119,0.15))' }}>
            <Heart className="w-5 h-5 text-[#ec4899]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>{cleanLabel('Friends & Family Notification (FFN)')}</h1>
            <p className="text-xs text-[var(--t5)]">{contacts.length} contact{contacts.length !== 1 ? 's' : ''} to notify</p>
          </div>
        </div>
        <Button onClick={openNew} className="gold-button w-full sm:w-auto" data-testid="ffn-add-btn">
          <Plus className="w-5 h-5 mr-2" /> Add Contact
        </Button>
      </div>

      <SectionLockBanner sectionId="ffn" />
      <SectionLockedOverlay sectionId="ffn">

      {/* Explainer */}
      <Card className="glass-card" data-testid="ffn-explainer">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-[#ec4899] mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-[var(--t3)] leading-relaxed">
                List who your beneficiaries should notify of your passing.
                This is not handled by CarryOn — it's a reference list for your family to use when the time comes.
              </p>
              <p className="text-xs text-[var(--t5)] mt-1">
                For confidential notifications that you don't want your family to know about, use DTS → Transition Notification instead.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact List */}
      {contacts.length === 0 && !showForm ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Heart className="w-12 h-12 mx-auto text-[var(--t5)] mb-3 opacity-40" />
            <h3 className="text-base font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'var(--sans)' }}>No contacts added yet</h3>
            <p className="text-sm text-[var(--t4)] mb-4">Add people you'd like your beneficiaries to notify on your behalf.</p>
            <Button onClick={openNew} className="gold-button" data-testid="ffn-empty-add">
              <Plus className="w-4 h-4 mr-1.5" /> Add First Contact
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="ffn-contact-list">
          {displayedContacts.map(c => {
            const isEditing = editingId === c.id || (editingId === 'NEW' && c.id === 'NEW');
            return (
            <Card key={c.id} className="glass-card" data-testid={`ffn-contact-${c.id}`}>
              <CardContent className="p-4">
                {/* Collapsed header — always visible */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[var(--t)]">{c._isNew ? 'New contact' : (c.name || 'Untitled contact')}</span>
                      {!c._isNew && c.relationship && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(236,72,153,0.1)', color: '#ec4899' }}>
                          {c.relationship}
                        </span>
                      )}
                    </div>
                    {!isEditing && (
                      <div className="space-y-1">
                        {c.phone && (
                          <div className="flex items-center gap-2 text-sm text-[var(--t4)]">
                            <Phone className="w-3.5 h-3.5 flex-shrink-0" /> {formatPhoneUS(c.phone)}
                          </div>
                        )}
                        {c.email && (
                          <div className="flex items-center gap-2 text-sm text-[var(--t4)]">
                            <Mail className="w-3.5 h-3.5 flex-shrink-0" /> {c.email}
                          </div>
                        )}
                        {c.address && (
                          <div className="flex items-center gap-2 text-sm text-[var(--t4)]">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> {c.address}
                          </div>
                        )}
                        {c.notes && (
                          <p className="text-xs text-[var(--t5)] mt-1 italic">{c.notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!isEditing && !c._isNew && (
                      <>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-[var(--t4)]" onClick={() => openEdit(c)} data-testid={`ffn-edit-${c.id}`}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-[var(--rd)]" onClick={() => handleDelete(c.id)} disabled={deleting === c.id} data-testid={`ffn-delete-${c.id}`}>
                          {deleting === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Inline editor — pushes the rest of the list down */}
                {isEditing && (
                  <div className="mt-4 pt-4 border-t border-[var(--b)] space-y-3" data-testid={`ffn-edit-panel-${c.id}`}>
                    <div>
                      <Label className="text-[var(--t4)]">Name <span className="text-red-400">*</span></Label>
                      <div className="relative mt-1">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t5)]" />
                        <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                          placeholder="Full name" className="input-field pl-10" style={{ fontSize: 16 }} data-testid="ffn-input-name" autoFocus />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[var(--t4)]">Relationship</Label>
                      <Input value={form.relationship} onChange={e => setForm(p => ({ ...p, relationship: e.target.value }))}
                        placeholder="e.g., College friend, Former colleague, Neighbor" className="input-field mt-1" style={{ fontSize: 16 }} data-testid="ffn-input-relationship" />
                    </div>
                    <div>
                      <Label className="text-[var(--t4)]">Phone</Label>
                      <div className="relative mt-1">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t5)]" />
                        <Input value={formatPhoneUS(form.phone)} onChange={e => setForm(p => ({ ...p, phone: formatPhoneUS(e.target.value) }))}
                          placeholder="(555) 123-4567" type="tel" className="input-field pl-10" style={{ fontSize: 16 }} data-testid="ffn-input-phone" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[var(--t4)]">Email</Label>
                      <div className="relative mt-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t5)]" />
                        <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                          placeholder="email@example.com" type="email" className="input-field pl-10" style={{ fontSize: 16 }} data-testid="ffn-input-email" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[var(--t4)]">Address</Label>
                      <div className="relative mt-1">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t5)]" />
                        <Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                          placeholder="123 Main St, City, State" className="input-field pl-10" style={{ fontSize: 16 }} data-testid="ffn-input-address" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[var(--t4)]">Notes</Label>
                      <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Any additional context — how you know this person, what to say to them, etc."
                        className="input-field mt-1 w-full rounded-lg p-3 min-h-[80px] bg-[var(--s)] border border-[var(--b)] text-[var(--t)]"
                        style={{ fontSize: 16 }} data-testid="ffn-input-notes" />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button onClick={cancelEdit} variant="outline" className="outline-pill-button flex-1" data-testid="ffn-cancel-btn">
                        <X className="w-4 h-4 mr-1.5" /> Cancel
                      </Button>
                      <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="gold-button flex-1" data-testid="ffn-save-btn">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
                        {c._isNew ? 'Add' : 'Save'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );})}
        </div>
      )}

      </SectionLockedOverlay>
    </div>
  );
}
