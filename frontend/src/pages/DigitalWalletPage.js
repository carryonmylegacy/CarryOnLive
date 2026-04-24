import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { KeyRound, Plus, Trash2, Edit2, Eye, EyeOff, Shield, Loader2, User, Wallet, Globe, Mail, Cloud, CreditCard, Save, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from '../utils/toast';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { ReturnPopup } from '../components/GuidedActivation';
import SlidePanel from '../components/SlidePanel';
import axios from 'axios';
import { cachedGet } from '../utils/apiCache';
import { API_URL } from '../config';

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
  const [showAdd, setShowAdd] = useState(false);
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
    // Airplane-mode short-circuit — preserve current state instead of
    // letting .catch() fallbacks wipe it with empty arrays.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
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
          axios.get(`${API_URL}/digital-wallet/${eid}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${API_URL}/beneficiaries/${eid}`, { headers }).catch(() => ({ data: [] })),
        ]);
        // Empty-response clobber guard.
        const nextEntries = Array.isArray(walletRes.data) ? walletRes.data : [];
        const nextBens = Array.isArray(benRes.data) ? benRes.data : [];
        if (nextEntries.length > 0 || entries.length === 0) setEntries(nextEntries);
        if (nextBens.length > 0 || beneficiaries.length === 0) setBeneficiaries(nextBens);
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

  const handleCredentialSaved = async () => {
    const wasFirstEntry = entries.length === 0;
    setShowAdd(false);
    setEditEntry(null);
    await fetchData();
    // Show return popup only for the very first credential added and if not already graduated
    if (wasFirstEntry && !sessionStorage.getItem('carryon_dav_popup_shown')) {
      sessionStorage.setItem('carryon_dav_popup_shown', 'true');
      try {
        await axios.post(`${API_URL}/onboarding/complete-step/add_credential`, {}, getAuthHeaders());
        const prog = await axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders());
        if (!prog.data?.already_graduated) setTimeout(() => setShowReturnPopup(true), 1000);
      } catch {}
    }
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm('Delete this entry? This cannot be undone.')) return;
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
      if (r.queued) toast.success('Deletion queued — will sync when you reconnect.');
      fetchData();
    } catch (err) {
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
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="digital-wallet-page"
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
          <button onClick={() => navigate('/dashboard')}
            className="flex-shrink-0 text-xs font-bold text-[var(--t4)] px-3 py-2 rounded-xl transition-colors hover:bg-[var(--s)]"
            data-testid="back-to-dashboard-btn">
            <ArrowLeft className="w-4 h-4 inline mr-1" />Back
          </button>
        </div>
      )}

      <SectionLockedOverlay sectionId="digital-access">

      {entries.length === 0 ? (
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
                {catEntries.map(entry => (
                  <Card key={entry.id} className="glass-card mb-2" data-testid={`wallet-entry-${entry.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-bold text-[var(--t)]">{entry.account_name}</h4>
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
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditEntry(entry)} className="p-1.5 rounded-lg hover:bg-[var(--s)] text-[var(--t4)]" data-testid={`edit-wallet-${entry.id}`} aria-label="Edit entry">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(entry.id)} className="p-1.5 rounded-lg hover:bg-[var(--rdbg)] text-[var(--t4)] hover:text-[var(--rd2)]" data-testid={`delete-wallet-${entry.id}`} aria-label="Delete entry">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAdd || editEntry) && (
        <WalletEntryPanel
          entry={editEntry}
          beneficiaries={beneficiaries}
          onClose={() => { setShowAdd(false); setEditEntry(null); }}
          onSaved={handleCredentialSaved}
          getAuthHeaders={getAuthHeaders}
        />
      )}

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

const WalletEntryPanel = ({ entry, beneficiaries, onClose, onSaved, getAuthHeaders }) => {
  const [name, setName] = useState(entry?.account_name || '');
  const [login, setLogin] = useState(entry?.login_username || '');
  const [password, setPassword] = useState(entry?.password || '');
  const [access, setAccess] = useState(entry?.additional_access || '');
  const [notes, setNotes] = useState(entry?.notes || '');
  const [category, setCategory] = useState(entry?.category || 'other');
  const [beneficiaryId, setBeneficiaryId] = useState(entry?.assigned_beneficiary_id || '');
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleSave = async () => {
    if (!name) { toast.error('Account Name is required'); return; }
    if (!login) { toast.error('Login / Username / Email is required'); return; }
    setSaving(true);
    try {
      const data = {
        account_name: name, login_username: login,
        password: password || undefined, additional_access: access || undefined,
        notes: notes || undefined, category,
        assigned_beneficiary_id: beneficiaryId || undefined,
      };
      const headers = getAuthHeaders();
      const { mutateWithOutbox } = await import('../utils/offlineMutation');
      const r = await mutateWithOutbox({
        entity_type: 'digital_wallet_entry',
        entity_id: entry ? entry.id : `local-wallet-${Date.now()}`,
        method: entry ? 'PUT' : 'POST',
        url: entry ? `/digital-wallet/${entry.id}` : '/digital-wallet',
        body: data,
        authHeaders: headers,
      });
      if (!r.ok) throw r.error || new Error('Save failed');
      if (r.queued) toast.success(`Account ${entry ? 'change' : 'saved'} offline — will sync when you reconnect.`);
      onSaved();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save'); }
    setSaving(false);
  };

  return (
    <SlidePanel open onClose={onClose} title={entry ? 'Edit Account' : 'Add Digital Account'} subtitle={entry ? 'Update credentials and assignment' : 'Store a new set of credentials'}>
      <div className="space-y-5">
        <Card className="glass-card animate-bounce-tile" data-testid="wallet-panel-basics">
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
        <Card className="glass-card animate-bounce-tile" data-testid="wallet-panel-credentials">
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
        <Card className="glass-card animate-bounce-tile" data-testid="wallet-panel-assignment">
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
        <div className="flex gap-3 pt-1 animate-bounce-tile">
          <Button variant="outline" onClick={onClose} className="flex-1 border-[var(--b)] text-[var(--t3)]">Cancel</Button>
          <Button className="flex-1 gold-button" onClick={handleSave} disabled={saving || !name || !login} data-testid="wallet-save">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {entry ? 'Update' : 'Save'} Account
          </Button>
        </div>
      </div>
    </SlidePanel>
  );
};

export default DigitalWalletPage;
