import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { KeyRound, Plus, Trash2, Edit2, Eye, EyeOff, Shield, Loader2, User, Wallet, Globe, Mail, Cloud, CreditCard, Save, ArrowLeft, Network, X } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from '../utils/toast';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { ReturnPopup } from '../components/GuidedActivation';
// SlidePanel import removed — DAV now uses inline expand-to-edit instead
// of a side panel modal. Keeping the comment as a breadcrumb so future
// readers understand the historical pattern.
import axios from 'axios';
import apiClient from '../utils/apiClient';
import { cachedGet } from '../utils/apiCache';
import { API_URL } from '../config';
import { saveList, readList } from '../utils/localListCache';
import { useDraftState } from '../hooks/useDraftState';

const CATEGORIES = [
  { value: 'crypto', label: 'Cryptocurrency', icon: Wallet },
  { value: 'banking', label: 'Banking / Financial', icon: CreditCard },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'social_media', label: 'Social Media', icon: Globe },
  { value: 'cloud', label: 'Cloud Storage', icon: Cloud },
  { value: 'subscription', label: 'Subscription', icon: CreditCard },
  { value: 'other', label: 'Other', icon: KeyRound },
];

const DigitalWalletPage = () => {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromGettingStarted = location.state?.fromGettingStarted;
  const [entries, setEntries] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  // Draft persistence — keep the add panel open if the user navigates
  // away mid-creation. Per-estate so multi-estate users don't bleed.
  const draftEstateId = (typeof localStorage !== 'undefined' && localStorage.getItem('selected_estate_id')) || null;
  const draftKey = draftEstateId ? `dav_form:${draftEstateId}:open` : null;
  const [showAdd, setShowAdd, clearShowAddDraft] = useDraftState(draftKey, false);
  const [editEntry, setEditEntry] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [showReturnPopup, setShowReturnPopup] = useState(false);
  const autoOpenedRef = useRef(false);

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open add form when arriving from Getting Started with no entries
  useEffect(() => {
    if (!loading && fromGettingStarted && !autoOpenedRef.current && entries.length === 0) {
      autoOpenedRef.current = true;
      setShowAdd(true);
    }
  }, [loading, fromGettingStarted, entries.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    // Airplane-mode rescue — rehydrate DAV entries + beneficiaries from
    // the last-known-good localStorage cache so the user keeps seeing
    // their digital wallet items offline. Populated by the online
    // branch below on every successful fetch.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const savedEid = localStorage.getItem('selected_estate_id');
      if (savedEid) {
        const cachedEntries = readList(`financial:dav:${savedEid}`);
        const cachedBens = readList(`dav:beneficiaries:${savedEid}`);
        if (Array.isArray(cachedEntries) && cachedEntries.length > 0) setEntries(cachedEntries);
        if (Array.isArray(cachedBens) && cachedBens.length > 0) setBeneficiaries(cachedBens);
      }
      setLoading(false);
      return;
    }
    try {
      const headers = getAuthHeaders()?.headers;
      if (!headers) { setLoading(false); return; }
      const estatesRes = await cachedGet(axios, `${API_URL}/estates`, { headers });
      if (estatesRes.data.length > 0) {
        const savedId = localStorage.getItem('selected_estate_id');
        const eid = (savedId && estatesRes.data.find(e => e.id === savedId)?.id) || estatesRes.data[0].id;
        const [walletRes, benRes] = await Promise.all([
          apiClient.get(`${API_URL}/digital-wallet/${eid}`, { headers }).catch(() => ({ data: [] })),
          apiClient.get(`${API_URL}/beneficiaries/${eid}`, { headers }).catch(() => ({ data: [] })),
        ]);
        const nextEntries = Array.isArray(walletRes.data) ? walletRes.data : [];
        const nextBens = Array.isArray(benRes.data) ? benRes.data : [];
        if (nextEntries.length > 0 || entries.length === 0) setEntries(nextEntries);
        if (nextBens.length > 0 || beneficiaries.length === 0) setBeneficiaries(nextBens);
        // Persist both for airplane-mode rehydration next visit.
        saveList(`financial:dav:${eid}`, nextEntries);
        saveList(`dav:beneficiaries:${eid}`, nextBens);
      }
    } catch (err) {
      console.error('Digital wallet fetch error:', err);
    }
    setLoading(false);
  };

  // Auto-refresh on reconnect.
  useEffect(() => {
    const refetch = () => { fetchData(); };
    window.addEventListener('online', refetch);
    window.addEventListener('offline', refetch);
    return () => {
      window.removeEventListener('online', refetch);
      window.removeEventListener('offline', refetch);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCredentialSaved = async (saved, opts = {}) => {
    const wasFirstEntry = entries.length === 0;
    clearShowAddDraft();
    setShowAdd(false);
    setEditEntry(null);
    // Optimistic UI: insert/update the entry into the list immediately
    // so it shows up whether we're online or queued offline.
    if (saved && saved.id) {
      setEntries(prev => {
        const next = opts.isEdit
          ? prev.map(e => (e.id === saved.id ? { ...e, ...saved } : e))
          : (prev.some(e => e.id === saved.id) ? prev : [...prev, saved]);
        const savedEid = localStorage.getItem('selected_estate_id');
        if (savedEid) saveList(`financial:dav:${savedEid}`, next);
        return next;
      });
    }
    if (!opts.queued) {
      await fetchData();
    }
    // Show return popup only for the very first credential added and if not already graduated
    if (wasFirstEntry && !sessionStorage.getItem('carryon_dav_popup_shown')) {
      sessionStorage.setItem('carryon_dav_popup_shown', 'true');
      try {
        await apiClient.post(`${API_URL}/onboarding/complete-step/add_credential`, {}, getAuthHeaders());
        const prog = await apiClient.get(`${API_URL}/onboarding/progress`, getAuthHeaders());
        if (!prog.data?.already_graduated) setTimeout(() => setShowReturnPopup(true), 1000);
      } catch {}
    }
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm('Delete this entry? This cannot be undone.')) return;
    // Optimistic remove — drop the row from the UI immediately so the
    // user sees their action take effect, both online and offline.
    const prevEntries = entries;
    setEntries(prev => prev.filter(e => e.id !== entryId));
    const savedEid = localStorage.getItem('selected_estate_id');
    if (savedEid) {
      saveList(`financial:dav:${savedEid}`, prevEntries.filter(e => e.id !== entryId));
    }
    try {
      const { mutateWithOutbox } = await import('../utils/offlineMutation');
      const r = await mutateWithOutbox({
        entity_type: 'digital_wallet_entry',
        entity_id: entryId,
        method: 'DELETE',
        url: `/digital-wallet/${entryId}`,
        authHeaders: getAuthHeaders(),
      });
      if (!r.ok) throw r.error || new Error('Delete failed');
      if (r.queued) {
        toast.success('Deletion queued — will sync when you reconnect.');
        return;
      }
      fetchData();
    } catch (err) {
      // Roll back optimistic remove on hard failure.
      setEntries(prevEntries);
      toast.error('Failed to delete');
    }
  };

  const togglePassword = (id) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--gold)]" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="digital-wallet-page"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(236,72,153,0.12), transparent 55%), radial-gradient(ellipse at bottom right, rgba(219,39,119,0.06), transparent 55%)' }}>
      {/* Header — standardized layout (icon box on left, title + 1-line
          description, action button on right, then SectionLockBanner
          below). Matches MM / SDV / IAC / FFN for uniform feel. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(236,72,153,0.2), rgba(219,39,119,0.15))' }}>
            <KeyRound className="w-5 h-5 text-[#ec4899]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
              Digital Access Vault (DAV)
            </h1>
            <p className="text-xs text-[var(--t5)]">
              {entries.length} account{entries.length === 1 ? '' : 's'} · Logins, passwords &amp; credentials for beneficiaries
            </p>
          </div>
        </div>
        <Button className="gold-button w-full sm:w-auto" onClick={() => setShowAdd(true)} data-testid="add-wallet-entry">
          <Plus className="w-5 h-5 mr-2" /> Add Account
        </Button>
      </div>

      <SectionLockBanner sectionId="digital-access" />

      {/* Getting Started context banner */}
      {fromGettingStarted && (
        <div className="flex items-center gap-3 rounded-2xl p-4" data-testid="getting-started-banner"
          style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.15)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.25)' }}>
            <KeyRound className="w-5 h-5 text-[#ec4899]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--t)]">Getting Started — Save a Digital Login</p>
            <p className="text-xs text-[var(--t4)]">Store one account login (like email or banking) so your loved ones can access it when needed.</p>
          </div>
        </div>
      )}

      <SectionLockedOverlay sectionId="digital-access">

      {entries.length === 0 && !showAdd ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <KeyRound className="w-12 h-12 mx-auto text-[var(--gold)] mb-4 opacity-50" />
            <h3 className="text-lg font-bold text-[var(--t)] mb-2">No Digital Accounts Yet</h3>
            <p className="text-sm text-[var(--t4)] mb-4">Store your email, banking, social media, subscription, and other account credentials here. Each can be assigned to a specific beneficiary.</p>
            <Button className="gold-button" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Your First Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* When user taps "Add Account", render a virtual NEW row at
              the very top of the list. The inline editor expands below
              its header, pushing every existing tile down — matching
              the Go-Bag / FFN inline pattern. */}
          {showAdd && (
            <Card className="glass-card" data-testid="wallet-entry-new">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <h4 className="font-bold text-[var(--t)]">New digital account</h4>
                  <button onClick={() => { clearShowAddDraft(); setShowAdd(false); }} className="p-1.5 rounded-lg hover:bg-[var(--s)] text-[var(--t4)]" aria-label="Cancel add" data-testid="wallet-cancel-new">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="pt-2 border-t border-[var(--b)]">
                  <WalletEntryPanel
                    entry={null}
                    beneficiaries={beneficiaries}
                    existingEntries={entries}
                    onClose={() => { clearShowAddDraft(); setShowAdd(false); }}
                    onSaved={handleCredentialSaved}
                    onLinkExisting={(existing) => {
                      clearShowAddDraft();
                      setShowAdd(false);
                      setEditEntry(existing);
                    }}
                    getAuthHeaders={getAuthHeaders}
                  />
                </div>
              </CardContent>
            </Card>
          )}
          {CATEGORIES.map(cat => {
            const catEntries = entries.filter(e => e.category === cat.value);
            if (catEntries.length === 0) return null;
            const CatIcon = cat.icon;
            return (
              <div key={cat.value}>
                <div className="flex items-center gap-2 mb-2">
                  <CatIcon className="w-4 h-4 text-[var(--gold)]" />
                  <h3 className="text-sm font-bold text-[var(--t4)] uppercase tracking-wider">{cat.label}</h3>
                </div>
                {catEntries.map(entry => {
                  const isEditing = editEntry?.id === entry.id;
                  return (
                  <Card key={entry.id} className="glass-card mb-2" data-testid={`wallet-entry-${entry.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-bold text-[var(--t)]">{entry.account_name}</h4>
                          {!isEditing && (
                            <>
                              <div className="mt-2 space-y-1 text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="text-[var(--t4)] w-20">Login:</span>
                                  <span className="text-[var(--t2)] font-mono">{entry.login_username}</span>
                                </div>
                                {(entry.password || entry.encrypted_password) && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[var(--t4)] w-20">Password:</span>
                                    <span className="text-[var(--t2)] font-mono">
                                      {visiblePasswords[entry.id] ? (entry.password || '********') : '********'}
                                    </span>
                                    <button onClick={() => togglePassword(entry.id)} className="text-[var(--t5)] hover:text-[var(--t)]">
                                      {visiblePasswords[entry.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                )}
                                {entry.additional_access && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[var(--t4)] w-20">Access:</span>
                                    <span className="text-[var(--t2)] font-mono text-xs">{visiblePasswords[entry.id] ? entry.additional_access : '********'}</span>
                                  </div>
                                )}
                                {entry.notes && (
                                  <div className="flex items-start gap-2 mt-1">
                                    <span className="text-[var(--t4)] w-20">Notes:</span>
                                    <span className="text-[var(--t3)] text-xs">{entry.notes}</span>
                                  </div>
                                )}
                              </div>
                              {entry.assigned_beneficiary_name && (
                                <div className="mt-2 flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 text-[var(--gold)]" />
                                  <span className="text-xs text-[var(--gold)] font-bold">Assigned to: {entry.assigned_beneficiary_name}</span>
                                </div>
                              )}
                              {entry.linked_entity_id && entry.linked_entity_name && (
                                <button
                                  onClick={() => navigate(`/financial?openEntity=${encodeURIComponent(entry.linked_entity_id)}`)}
                                  className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors"
                                  style={{
                                    color: 'var(--gold)',
                                    background: 'rgba(var(--gold-rgb), 0.10)',
                                    border: '1px solid rgba(var(--gold-rgb), 0.35)',
                                  }}
                                  data-testid={`wallet-entity-link-${entry.id}`}
                                  title="Open this entity in your Financial Picture"
                                >
                                  <Network className="w-3 h-3" />
                                  Linked to {entry.linked_entity_name}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        {!isEditing && (
                          <div className="flex gap-1">
                            <button onClick={() => setEditEntry(entry)} className="p-1.5 rounded-lg hover:bg-[var(--s)] text-[var(--t4)]" data-testid={`edit-wallet-${entry.id}`} aria-label="Edit entry">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(entry.id)} className="p-1.5 rounded-lg hover:bg-[var(--rdbg)] text-[var(--t4)] hover:text-[var(--rd2)]" data-testid={`delete-wallet-${entry.id}`} aria-label="Delete entry">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                      {isEditing && (
                        <div className="mt-3 pt-3 border-t border-[var(--b)]" data-testid={`wallet-edit-panel-${entry.id}`}>
                          <WalletEntryPanel
                            entry={entry}
                            beneficiaries={beneficiaries}
                            existingEntries={entries}
                            onClose={() => setEditEntry(null)}
                            onSaved={handleCredentialSaved}
                            onLinkExisting={(existing) => setEditEntry(existing)}
                            getAuthHeaders={getAuthHeaders}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );})}
              </div>
            );
          })}
        </div>
      )}

      {/* (Add/Edit SlidePanel removed — inline expand-to-edit now lives
          inside each entry card and at the top of the list when adding.) */}

      <div className="text-center py-4">
        <div className="flex items-center justify-center gap-2 text-[var(--t5)] text-sm">
          <Shield className="w-4 h-4" />
          <span>AES-256 Encrypted · All credentials stored securely</span>
        </div>
      </div>
      </SectionLockedOverlay>

      {showReturnPopup && (
        <ReturnPopup step="credential" onReturn={() => { setShowReturnPopup(false); navigate('/dashboard'); }} onAlternate={() => { setShowReturnPopup(false); setShowAdd(true); }} />
      )}
    </div>
  );
};

const WalletEntryPanel = ({ entry, beneficiaries, existingEntries, onClose, onSaved, onLinkExisting, getAuthHeaders }) => {
  // Draft persistence for NEW credential creation only. Sensitive
  // fields (password, additional_access) are intentionally NOT
  // persisted — they're re-entered on resume. Per-estate keyed so
  // multi-estate users don't bleed drafts.
  const draftEstateId = (typeof localStorage !== 'undefined' && localStorage.getItem('selected_estate_id')) || null;
  const isNew = !entry;
  const dKey = (isNew && draftEstateId) ? `dav_form:${draftEstateId}` : null;
  const [name, setName, clearNameDraft] = useDraftState(dKey ? `${dKey}:name` : null, entry?.account_name || '');
  const [login, setLogin, clearLoginDraft] = useDraftState(dKey ? `${dKey}:login` : null, entry?.login_username || '');
  const [password, setPassword] = useState(entry?.password || '');
  const [access, setAccess] = useState(entry?.additional_access || '');
  const [notes, setNotes, clearNotesDraft] = useDraftState(dKey ? `${dKey}:notes` : null, entry?.notes || '');
  const [category, setCategory, clearCategoryDraft] = useDraftState(dKey ? `${dKey}:category` : null, entry?.category || 'other');
  const [beneficiaryId, setBeneficiaryId, clearBenIdDraft] = useDraftState(dKey ? `${dKey}:benId` : null, entry?.assigned_beneficiary_id || '');
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const clearPanelDrafts = () => {
    clearNameDraft();
    clearLoginDraft();
    clearNotesDraft();
    clearCategoryDraft();
    clearBenIdDraft();
  };

  const handleSave = async () => {
    if (!name) { toast.error('Account Name is required'); return; }
    if (!login) { toast.error('Login / Username / Email is required'); return; }
    // Duplicate-login guard. If the login matches another entry that
    // already lives in the DAV (and we're not editing that very entry),
    // pause and surface a toast offering to open the existing entry
    // instead of silently creating a duplicate. Comparison is
    // case-insensitive trim — same shape used everywhere else.
    const normalized = (login || '').trim().toLowerCase();
    const dup = (existingEntries || []).find(e =>
      (e.login_username || '').trim().toLowerCase() === normalized &&
      e.id !== entry?.id
    );
    if (dup) {
      toast.warning(
        `A DAV entry with this login already exists${dup.account_name ? ` ("${dup.account_name}")` : ''}. Want to open that one and add to it instead?`,
        {
          duration: 7000,
          action: {
            label: 'Open existing entry',
            onClick: () => onLinkExisting?.(dup),
          },
        }
      );
      return;
    }
    setSaving(true);
    try {
      const data = {
        account_name: name, login_username: login,
        password: password || undefined, additional_access: access || undefined,
        notes: notes || undefined, category,
        assigned_beneficiary_id: beneficiaryId || undefined,
      };
      const headers = getAuthHeaders();
      const tempId = entry ? entry.id : `local-wallet-${(crypto?.randomUUID?.() || Date.now())}`;
      const { mutateWithOutbox } = await import('../utils/offlineMutation');
      const r = await mutateWithOutbox({
        entity_type: 'digital_wallet_entry',
        entity_id: tempId,
        method: entry ? 'PUT' : 'POST',
        url: entry ? `/digital-wallet/${entry.id}` : '/digital-wallet',
        body: data,
        authHeaders: headers,
      });
      if (!r.ok) throw r.error || new Error('Save failed');
      if (r.queued) toast.success(`Account ${entry ? 'change' : 'saved'} offline — will sync when you reconnect.`);
      // Build optimistic entity in server-shape so the parent can
      // show it instantly without waiting for a refetch.
      let saved;
      if (!r.queued && r.data && typeof r.data === 'object' && r.data.id) {
        saved = r.data;
      } else if (entry) {
        saved = { ...entry, ...data, id: entry.id, ...(r.queued ? { _local_pending: true } : {}) };
      } else {
        // Find the assigned beneficiary's display name from the list
        // so the optimistic row renders the same chip as a server row.
        const ben = (beneficiaries || []).find(b => b.id === beneficiaryId);
        saved = {
          id: tempId,
          account_name: name,
          login_username: login,
          password: password || null,
          additional_access: access || null,
          notes: notes || null,
          category,
          assigned_beneficiary_id: beneficiaryId || null,
          assigned_beneficiary_name: ben ? `${ben.first_name || ''} ${ben.last_name || ''}`.trim() || ben.name || '' : null,
          created_at: new Date().toISOString(),
          ...(r.queued ? { _local_pending: true } : {}),
        };
      }
      clearPanelDrafts();
      onSaved(saved, { queued: !!r.queued, isEdit: !!entry });
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save'); }
    setSaving(false);
  };

  return (
    <div className="space-y-5" data-testid="wallet-entry-form">
      <Card className="glass-card" data-testid="wallet-panel-basics">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold)]">Account Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[var(--t4)] text-xs">Account Name <span className="text-red-400">*</span></Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Coinbase" className="input-field mt-1" data-testid="wallet-name" />
            </div>
            <div>
              <Label className="text-[var(--t4)] text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="input-field mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]" style={{ zIndex: 99999 }}>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value} className="text-[var(--t2)]">{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="glass-card" data-testid="wallet-panel-credentials">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold)]">Credentials</p>
          <div>
            <Label className="text-[var(--t4)] text-xs">Login / Username / Email <span className="text-red-400">*</span></Label>
            <Input value={login} onChange={e => setLogin(e.target.value)} placeholder="username or email" className="input-field mt-1" data-testid="wallet-login" />
          </div>
          <div>
            <Label className="text-[var(--t4)] text-xs">Password</Label>
            <div className="relative mt-1">
              <Input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="********" className="input-field pr-10" data-testid="wallet-password" />
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label className="text-[var(--t4)] text-xs">Additional Access Info</Label>
            <Input value={access} onChange={e => setAccess(e.target.value)} placeholder="e.g., 2FA backup codes, PIN" className="input-field mt-1" data-testid="wallet-access" />
          </div>
        </CardContent>
      </Card>
      <Card className="glass-card" data-testid="wallet-panel-assignment">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold)]">Assignment & Notes</p>
          <div>
            <Label className="text-[var(--t4)] text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes" className="input-field mt-1" />
          </div>
          <div>
            <Label className="text-[var(--t4)] text-xs">Assign to Beneficiary</Label>
            <Select value={beneficiaryId || 'none'} onValueChange={(val) => setBeneficiaryId(val === 'none' ? '' : val)}>
              <SelectTrigger className="input-field mt-1"><SelectValue placeholder="Select beneficiary..." /></SelectTrigger>
              <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]" style={{ zIndex: 99999 }}>
                <SelectItem value="none" className="text-[var(--t4)]">No one (keep private)</SelectItem>
                {beneficiaries.map(b => (<SelectItem key={b.id} value={b.id} className="text-[var(--t2)]">{b.first_name} {b.last_name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-3 pt-1">
        <Button variant="outline" onClick={onClose} className="flex-1 border-[var(--b)] text-[var(--t3)]" data-testid="wallet-cancel">Cancel</Button>
        <Button className="flex-1 gold-button" onClick={handleSave} disabled={saving || !name || !login} data-testid="wallet-save">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {entry ? 'Update' : 'Save'} Account
        </Button>
      </div>
    </div>
  );
};

export default DigitalWalletPage;
