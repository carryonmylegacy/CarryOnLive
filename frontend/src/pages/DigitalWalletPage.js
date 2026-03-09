import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { KeyRound, Plus, Trash2, Edit2, Eye, EyeOff, Shield, Loader2, User, Wallet, Globe, Mail, Cloud, CreditCard, MoreHorizontal, X, Check } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from '../utils/toast';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { ReturnPopup } from '../components/GuidedActivation';
import axios from 'axios';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [estateId, setEstateId] = useState(null);
  const [showReturnPopup, setShowReturnPopup] = useState(false);

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const headers = getAuthHeaders()?.headers;
      if (!headers) { setLoading(false); return; }
      const estatesRes = await axios.get(`${API_URL}/estates`, { headers });
      if (estatesRes.data.length > 0) {
        const eid = estatesRes.data[0].id;
        setEstateId(eid);
        const [walletRes, benRes] = await Promise.all([
          axios.get(`${API_URL}/digital-wallet/${eid}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${API_URL}/beneficiaries/${eid}`, { headers }).catch(() => ({ data: [] })),
        ]);
        setEntries(Array.isArray(walletRes.data) ? walletRes.data : []);
        setBeneficiaries(Array.isArray(benRes.data) ? benRes.data : []);
      }
    } catch (err) {
      console.error('Digital wallet fetch error:', err);
    }
    setLoading(false);
  };

  const handleCredentialSaved = async () => {
    setShowAdd(false);
    setEditEntry(null);
    await fetchData();
    // Show return popup for onboarding flow (first credential added)
    if (!sessionStorage.getItem('carryon_dav_popup_shown')) {
      sessionStorage.setItem('carryon_dav_popup_shown', 'true');
      try {
        await axios.post(`${API_URL}/onboarding/complete-step/add_credential`, {}, getAuthHeaders());
      } catch {}
      setTimeout(() => setShowReturnPopup(true), 1000);
    }
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm('Delete this entry? This cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/digital-wallet/${entryId}`, getAuthHeaders());
      // toast removed
      fetchData();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const togglePassword = (id) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getCategoryInfo = (cat) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[6];

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--gold)]" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in max-w-4xl mx-auto" data-testid="digital-wallet-page">
      <SectionLockBanner sectionId="vault" />

      <SectionLockedOverlay sectionId="vault">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Digital Access Vault (DAV)
          </h1>
          <p className="text-[var(--t4)] mt-1 text-sm">
            Securely store logins, passwords, and access credentials for your beneficiaries
          </p>
        </div>
        <Button className="gold-button" onClick={() => setShowAdd(true)} data-testid="add-wallet-entry">
          <Plus className="w-4 h-4 mr-2" /> Add Account
        </Button>
      </div>

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
                          <button onClick={() => setEditEntry(entry)} className="p-1.5 rounded-lg hover:bg-[var(--s)] text-[var(--t4)]" data-testid={`edit-wallet-${entry.id}`}>
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(entry.id)} className="p-1.5 rounded-lg hover:bg-[var(--rdbg)] text-[var(--t4)] hover:text-[var(--rd2)]" data-testid={`delete-wallet-${entry.id}`}>
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
        <WalletEntryModal
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

const WalletEntryModal = ({ entry, beneficiaries, onClose, onSaved, getAuthHeaders }) => {
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
    if (!name || !login) { toast.error('Account name and login are required'); return; }
    setSaving(true);
    try {
      const data = {
        account_name: name,
        login_username: login,
        password: password || undefined,
        additional_access: access || undefined,
        notes: notes || undefined,
        category,
        assigned_beneficiary_id: beneficiaryId || undefined,
      };
      const headers = getAuthHeaders();
      if (entry) {
        await axios.put(`${API_URL}/digital-wallet/${entry.id}`, data, headers);
        // toast removed
      } else {
        await axios.post(`${API_URL}/digital-wallet`, data, headers);
        // toast removed
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="glass-card border-[var(--b2)] sm:max-w-lg" data-testid="wallet-entry-modal">
        <DialogHeader>
          <DialogTitle className="text-[var(--t)]">{entry ? 'Edit Account' : 'Add Digital Account'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
          <div>
            <Label className="text-[var(--t4)] text-xs">Login / Username / Email <span className="text-red-400">*</span></Label>
            <Input value={login} onChange={e => setLogin(e.target.value)} placeholder="username or email" className="input-field mt-1" data-testid="wallet-login" />
          </div>
          <div className="relative">
            <Label className="text-[var(--t4)] text-xs">Password</Label>
            <Input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="input-field mt-1 pr-10" data-testid="wallet-password" />
            <button onClick={() => setShowPw(p => !p)} className="absolute right-3 top-7 text-[var(--t5)]">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div>
            <Label className="text-[var(--t4)] text-xs">Additional Access Info (2FA codes, PINs, security questions)</Label>
            <Input value={access} onChange={e => setAccess(e.target.value)} placeholder="e.g., 2FA backup codes, PIN" className="input-field mt-1" data-testid="wallet-access" />
          </div>
          <div>
            <Label className="text-[var(--t4)] text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes" className="input-field mt-1" />
          </div>
          <div>
            <Label className="text-[var(--t4)] text-xs">Assign to Beneficiary (who receives this upon transition)</Label>
            <Select value={beneficiaryId || 'none'} onValueChange={(val) => setBeneficiaryId(val === 'none' ? '' : val)}>
              <SelectTrigger className="input-field mt-1"><SelectValue placeholder="Select beneficiary..." /></SelectTrigger>
              <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]" style={{ zIndex: 99999 }}>
                <SelectItem value="none" className="text-[var(--t4)]">No one (keep private)</SelectItem>
                {beneficiaries.map(b => (
                  <SelectItem key={b.id} value={b.id} className="text-[var(--t2)]">
                    {b.first_name} {b.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 border-[var(--b)] text-[var(--t3)]">Cancel</Button>
            <Button className="flex-1 gold-button" onClick={handleSave} disabled={saving || !name || !login} data-testid="wallet-save">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {entry ? 'Update' : 'Save'} Account
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DigitalWalletPage;
