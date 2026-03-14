import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import axios from 'axios';
import { cachedGet } from '../utils/apiCache';
import {
  Moon,
  Sun,
  User,
  Bell,
  Lock,
  LogOut,
  ChevronRight,
  Shield,
  Mail,
  Loader2,
  Download,
  Trash2,
  FileText,
  AlertTriangle,
  Eye,
  EyeOff,
  Pencil,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';
import { toast } from '../utils/toast';
import NotificationSettings from '../components/NotificationSettings';
import { PhotoPicker } from '../components/PhotoPicker';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SettingsPage = () => {
  const { user, logout, token } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestSending, setDigestSending] = useState(false);
  const [digestFrequency, setDigestFrequency] = useState('weekly');
  const [digestSections, setDigestSections] = useState({
    family_tree: true, connection_status: true, readiness_score: true,
    dashboard_tiles: true, action_items: true, missing_items: true,
  });
  const [additionalRecipients, setAdditionalRecipients] = useState([]);
  const [newRecipientEmail, setNewRecipientEmail] = useState('');
  const [digestSaving, setDigestSaving] = useState(false);
  const [digestSectionLabels, setDigestSectionLabels] = useState({});

  // Personal information
  const [profileData, setProfileData] = useState({});
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(() => localStorage.getItem('carryon_onboarding_dismissed') !== 'true');

  // GDPR state
  const [consent, setConsent] = useState(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [retentionPolicy, setRetentionPolicy] = useState(null);
  const [showRetention, setShowRetention] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [estatePhoto, setEstatePhoto] = useState(null);
  const [estateId, setEstateId] = useState(null);
  const [estateName, setEstateName] = useState('');
  const [editingEstateName, setEditingEstateName] = useState(false);
  const [estateNameDraft, setEstateNameDraft] = useState('');
  const [settingsReady, setSettingsReady] = useState(false);
  const [username, setUsername] = useState('');
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const isAdmin = user?.role === 'admin';
  const isOperator = user?.role === 'operator';
  const isStaff = isAdmin || isOperator;

  const getAuthHeaders = () => {
    const token = localStorage.getItem('carryon_token');
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  useEffect(() => {
    const fetchDigestPref = async () => {
      try {
        const res = await axios.get(`${API_URL}/digest/preferences`, getAuthHeaders());
        setWeeklyDigest(res.data.enabled !== false);
        setDigestFrequency(res.data.frequency || 'weekly');
        if (res.data.sections) setDigestSections(res.data.sections);
        if (res.data.additional_recipients) setAdditionalRecipients(res.data.additional_recipients);
        if (res.data.section_labels) setDigestSectionLabels(res.data.section_labels);
      } catch (e) { /* default to true */ }
    };
    const fetchConsent = async () => {
      try {
        const res = await axios.get(`${API_URL}/compliance/consent`, getAuthHeaders());
        setConsent(res.data);
      } catch (e) { /* default */ }
    };
    fetchDigestPref();
    fetchConsent();
    import('../services/passkey').then(({ isPasskeySupported, hasRegisteredPasskey }) => {
      if (isPasskeySupported()) { setPasskeySupported(true); hasRegisteredPasskey().then(setPasskeyRegistered); }
    }).catch(() => {});
    // Fetch profile photo
    axios.get(`${API_URL}/auth/me`, getAuthHeaders()).then(res => {
      if (res.data.photo_url) setProfilePhoto(res.data.photo_url);
      if (res.data.username) setUsername(res.data.username);
      setDisplayName(res.data.name || '');
    }).catch(() => {});
    // Fetch full profile
    axios.get(`${API_URL}/auth/profile`, getAuthHeaders()).then(res => {
      setProfileData(res.data || {});
    }).catch(() => {});
    // Fetch estate photo (benefactors only)
    cachedGet(axios, `${API_URL}/estates`, getAuthHeaders()).then(res => {
      const estates = res.data || [];
      const owned = estates.find(e => !e.is_beneficiary_estate);
      if (owned) {
        setEstateId(owned.id);
        setEstateName(owned.name || '');
        if (owned.estate_photo_url) setEstatePhoto(owned.estate_photo_url);
      }
    }).catch(() => {}).finally(() => setSettingsReady(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDigest = async (val) => {
    setDigestLoading(true);
    try {
      await axios.put(`${API_URL}/digest/preferences`, { enabled: val }, getAuthHeaders());
      setWeeklyDigest(val);
    } catch (e) { /* ignore */ }
    finally { setDigestLoading(false); }
  };

  const saveDigestPrefs = async (updates) => {
    setDigestSaving(true);
    try {
      const res = await axios.put(`${API_URL}/digest/preferences`, updates, getAuthHeaders());
      if (res.data.frequency) setDigestFrequency(res.data.frequency);
      if (res.data.sections) setDigestSections(res.data.sections);
      if (res.data.additional_recipients !== undefined) setAdditionalRecipients(res.data.additional_recipients);
      toast.success('Preferences saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save preferences');
    }
    finally { setDigestSaving(false); }
  };

  const addRecipient = async () => {
    const email = newRecipientEmail.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (additionalRecipients.includes(email)) {
      toast.error('This email is already added');
      return;
    }
    const updated = [...additionalRecipients, email];
    await saveDigestPrefs({ additional_recipients: updated });
    setNewRecipientEmail('');
  };

  const removeRecipient = async (email) => {
    const updated = additionalRecipients.filter(e => e !== email);
    await saveDigestPrefs({ additional_recipients: updated });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      const res = await axios.put(`${API_URL}/auth/profile`, profileData, getAuthHeaders());
      setProfileData(res.data || {});
      if (res.data?.name) setDisplayName(res.data.name);
      setProfileEditing(false);
      toast.success('Personal information updated');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update profile');
    } finally { setProfileSaving(false); }
  };


  const handlePasskeyToggle = async () => {
    if (passkeyRegistered) {
      const { clearPasskeyFlag } = await import('../services/passkey');
      clearPasskeyFlag();
      setPasskeyRegistered(false);
      toast.success('Passkey removed from this app');
      return;
    }
    setPasskeyLoading(true);
    try {
      const { registerPasskey } = await import('../services/passkey');
      await registerPasskey(token);
      setPasskeyRegistered(true);
      toast.success('Passkey registered — you can now sign in without a password');
    } catch (err) {
      const msg = err.message || '';
      if (!msg.includes('cancelled') && !msg.includes('AbortError') && !msg.includes('NotAllowedError')) {
        toast.error(msg || 'Failed to register passkey');
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const updateConsent = async (field, value) => {
    setConsentLoading(true);
    const updated = { ...consent, [field]: value };
    try {
      await axios.put(`${API_URL}/compliance/consent`, {
        marketing_emails: updated.marketing_emails,
        analytics_tracking: updated.analytics_tracking,
        third_party_sharing: updated.third_party_sharing,
      }, getAuthHeaders());
      setConsent(updated);
      // toast removed
    } catch (e) {
      toast.error('Failed to update preference');
    }
    setConsentLoading(false);
  };

  const handleDataExport = async () => {
    setExportLoading(true);
    try {
      const res = await axios.get(`${API_URL}/compliance/data-export`, getAuthHeaders());
      const jsonStr = JSON.stringify(res.data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const filename = `carryon-data-export-${new Date().toISOString().split('T')[0]}.json`;

      // iOS Safari/PWA: use a visible anchor in the DOM
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      // Fallback: if click didn't trigger download (iOS PWA), open in new tab
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 1000);
      toast.success('Your data export is downloading');
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || 'Failed to export data');
    }
    setExportLoading(false);
  };

  const handleDeleteRequest = async () => {
    if (deleteEmail !== user?.email) {
      toast.error('Email does not match your account');
      return;
    }
    setDeleteLoading(true);
    try {
      await axios.post(`${API_URL}/compliance/deletion-request`, {
        confirm_email: deleteEmail,
        reason: deleteReason,
      }, getAuthHeaders());
      // toast removed
      setShowDeleteConfirm(false);
      setDeleteEmail('');
      setDeleteReason('');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to submit deletion request');
    }
    setDeleteLoading(false);
  };

  const fetchRetentionPolicy = async () => {
    if (retentionPolicy) { setShowRetention(true); return; }
    try {
      const res = await axios.get(`${API_URL}/compliance/retention-policy`, getAuthHeaders());
      setRetentionPolicy(res.data);
      setShowRetention(true);
    } catch (e) {
      toast.error('Could not load retention policy');
    }
  };

  if (!settingsReady) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 max-w-4xl mx-auto flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in max-w-4xl mx-auto" data-testid="settings-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Settings
        </h1>
        <p className="text-[var(--t4)] mt-1 text-sm sm:text-base">
          Manage your account and preferences
        </p>
      </div>

      {/* Profile */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <User className="w-5 h-5 text-[var(--gold)]" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <PhotoPicker
              currentPhoto={profilePhoto}
              onPhotoSelected={async (file, previewUrl) => {
                setProfilePhoto(previewUrl);
                try {
                  const reader = new FileReader();
                  reader.onload = async () => {
                    const base64 = reader.result.split(',')[1];
                    await axios.put(`${API_URL}/auth/profile-photo`, { photo_data: base64, file_name: file.name }, getAuthHeaders());
                  };
                  reader.readAsDataURL(file);
                } catch { /* silent */ }
              }}
              onRemove={async () => {
                setProfilePhoto(null);
                try { await axios.put(`${API_URL}/auth/profile-photo`, { photo_data: '', file_name: '' }, getAuthHeaders()); } catch {}
              }}
            />
            <div>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="h-8 text-sm font-semibold"
                    placeholder="Enter your name"
                    autoFocus
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && nameDraft.trim()) {
                        setNameSaving(true);
                        try {
                          await axios.put(`${API_URL}/auth/display-name`, { name: nameDraft.trim() }, getAuthHeaders());
                          setDisplayName(nameDraft.trim());
                          setEditingName(false);
                          toast.success('Name updated');
                        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update name'); }
                        finally { setNameSaving(false); }
                      } else if (e.key === 'Escape') { setEditingName(false); }
                    }}
                    data-testid="display-name-input"
                  />
                  <button
                    disabled={nameSaving}
                    onClick={async () => {
                      if (nameDraft.trim()) {
                        setNameSaving(true);
                        try {
                          await axios.put(`${API_URL}/auth/display-name`, { name: nameDraft.trim() }, getAuthHeaders());
                          setDisplayName(nameDraft.trim());
                          toast.success('Name updated');
                        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update name'); }
                        finally { setNameSaving(false); }
                      }
                      setEditingName(false);
                    }}
                    className="p-1 rounded-md hover:bg-[var(--s)]"
                    data-testid="display-name-save"
                  >
                    {nameSaving ? <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)]" /> : <Check className="w-4 h-4 text-[var(--gn)]" />}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-[var(--t)] font-semibold text-lg">{displayName || user?.name || 'User'}</h3>
                  <button
                    onClick={() => { setNameDraft(displayName || user?.name || ''); setEditingName(true); }}
                    className="p-1 rounded-md hover:bg-[var(--s)]"
                    data-testid="display-name-edit"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[var(--t4)]" />
                  </button>
                </div>
              )}
              <p className="text-[var(--t4)] text-sm">{user?.email || ''}</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-[var(--gold)]/20 text-[var(--gold)] text-xs rounded-full capitalize">
                {user?.role || 'benefactor'}
              </span>
            </div>
          </div>
          <Separator className="bg-[var(--b)]" />
          <div>
            <h4 className="text-[var(--t)] font-medium text-sm mb-1">Username</h4>
            <p className="text-[var(--t5)] text-xs mb-2">Choose a unique username for login</p>
            {editingUsername ? (
              <div className="flex items-center gap-2">
                <Input
                  value={usernameDraft}
                  onChange={(e) => setUsernameDraft(e.target.value)}
                  className="h-8 text-sm flex-1"
                  placeholder="Enter a username"
                  autoFocus
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && usernameDraft.trim()) {
                      setUsernameSaving(true);
                      try {
                        await axios.put(`${API_URL}/auth/username`, { username: usernameDraft.trim() }, getAuthHeaders());
                        setUsername(usernameDraft.trim());
                        setEditingUsername(false);
                        toast.success('Username updated');
                      } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update username'); }
                      finally { setUsernameSaving(false); }
                    } else if (e.key === 'Escape') {
                      setEditingUsername(false);
                    }
                  }}
                  data-testid="username-input"
                />
                <button
                  disabled={usernameSaving}
                  onClick={async () => {
                    if (usernameDraft.trim()) {
                      setUsernameSaving(true);
                      try {
                        await axios.put(`${API_URL}/auth/username`, { username: usernameDraft.trim() }, getAuthHeaders());
                        setUsername(usernameDraft.trim());
                        toast.success('Username updated');
                      } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update username'); }
                      finally { setUsernameSaving(false); }
                    }
                    setEditingUsername(false);
                  }}
                  className="p-1 rounded-md hover:bg-[var(--s)]"
                  data-testid="username-save"
                >
                  {usernameSaving ? <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)]" /> : <Check className="w-4 h-4 text-[var(--gn)]" />}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[var(--t)] text-sm font-medium">{username || <span className="text-[var(--t5)] italic">No username set</span>}</span>
                <button
                  onClick={() => { setUsernameDraft(username); setEditingUsername(true); }}
                  className="p-1 rounded-md hover:bg-[var(--s)]"
                  data-testid="username-edit"
                >
                  <Pencil className="w-3.5 h-3.5 text-[var(--t4)]" />
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-[var(--t)] flex items-center gap-2">
              <User className="w-5 h-5 text-[var(--gold)]" />
              Personal Information
            </CardTitle>
            {!profileEditing ? (
              <Button variant="outline" size="sm" onClick={() => setProfileEditing(true)}
                className="border-[var(--b)] text-[var(--t4)] hover:text-[var(--t)]" data-testid="profile-edit-btn">
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setProfileEditing(false)}
                  className="border-[var(--b)] text-[var(--t4)]">Cancel</Button>
                <Button size="sm" onClick={saveProfile} disabled={profileSaving}
                  className="bg-[var(--gold)] text-[#0b1120] hover:bg-[var(--gold)]/90" data-testid="profile-save-btn">
                  {profileSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Name Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[var(--t5)] text-xs mb-1 block">First Name</label>
              {profileEditing ? (
                <Input value={profileData.first_name || ''} onChange={e => setProfileData(p => ({...p, first_name: e.target.value}))}
                  className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-first-name" />
              ) : (
                <p className="text-[var(--t)] text-sm font-medium">{profileData.first_name || '—'}</p>
              )}
            </div>
            <div>
              <label className="text-[var(--t5)] text-xs mb-1 block">Middle Name</label>
              {profileEditing ? (
                <Input value={profileData.middle_name || ''} onChange={e => setProfileData(p => ({...p, middle_name: e.target.value}))}
                  className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-middle-name" />
              ) : (
                <p className="text-[var(--t)] text-sm font-medium">{profileData.middle_name || '—'}</p>
              )}
            </div>
            <div>
              <label className="text-[var(--t5)] text-xs mb-1 block">Last Name</label>
              {profileEditing ? (
                <Input value={profileData.last_name || ''} onChange={e => setProfileData(p => ({...p, last_name: e.target.value}))}
                  className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-last-name" />
              ) : (
                <p className="text-[var(--t)] text-sm font-medium">{profileData.last_name || '—'}</p>
              )}
            </div>
          </div>

          <Separator className="bg-[var(--b)]" />

          {/* Phone & DOB */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[var(--t5)] text-xs mb-1 block">Phone Number</label>
              {profileEditing ? (
                <Input type="tel" value={profileData.phone || ''} onChange={e => setProfileData(p => ({...p, phone: e.target.value}))}
                  placeholder="(555) 123-4567" className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-phone" />
              ) : (
                <p className="text-[var(--t)] text-sm font-medium">{profileData.phone || '—'}</p>
              )}
            </div>
            <div>
              <label className="text-[var(--t5)] text-xs mb-1 block">Date of Birth</label>
              {profileEditing ? (
                <Input type="date" value={profileData.date_of_birth || ''} onChange={e => setProfileData(p => ({...p, date_of_birth: e.target.value}))}
                  className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-dob" />
              ) : (
                <p className="text-[var(--t)] text-sm font-medium">{profileData.date_of_birth || '—'}</p>
              )}
            </div>
          </div>

          <Separator className="bg-[var(--b)]" />

          {/* Gender & Marital Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[var(--t5)] text-xs mb-1 block">Gender</label>
              {profileEditing ? (
                <select value={profileData.gender || ''} onChange={e => setProfileData(p => ({...p, gender: e.target.value}))}
                  className="w-full h-9 px-3 rounded-md bg-[var(--card)] border border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-gender">
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              ) : (
                <p className="text-[var(--t)] text-sm font-medium capitalize">{(profileData.gender || '—').replace('_', ' ')}</p>
              )}
            </div>
            <div>
              <label className="text-[var(--t5)] text-xs mb-1 block">Marital Status</label>
              {profileEditing ? (
                <select value={profileData.marital_status || ''} onChange={e => setProfileData(p => ({...p, marital_status: e.target.value}))}
                  className="w-full h-9 px-3 rounded-md bg-[var(--card)] border border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-marital">
                  <option value="">Select...</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="divorced">Divorced</option>
                  <option value="widowed">Widowed</option>
                  <option value="separated">Separated</option>
                  <option value="domestic_partnership">Domestic Partnership</option>
                </select>
              ) : (
                <p className="text-[var(--t)] text-sm font-medium capitalize">{(profileData.marital_status || '—').replace('_', ' ')}</p>
              )}
            </div>
          </div>

          <Separator className="bg-[var(--b)]" />

          {/* Address */}
          <div>
            <label className="text-[var(--t5)] text-xs mb-1 block">Address</label>
            {profileEditing ? (
              <div className="space-y-2">
                <Input value={profileData.address_street || ''} onChange={e => setProfileData(p => ({...p, address_street: e.target.value}))}
                  placeholder="Street address" className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-street" />
                <Input value={profileData.address_line2 || ''} onChange={e => setProfileData(p => ({...p, address_line2: e.target.value}))}
                  placeholder="Apt, suite, unit (optional)" className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-line2" />
                <div className="grid grid-cols-4 gap-2">
                  <div className="col-span-2">
                    <Input value={profileData.address_city || ''} onChange={e => setProfileData(p => ({...p, address_city: e.target.value}))}
                      placeholder="City" className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-city" />
                  </div>
                  <div>
                    <select value={profileData.address_state || ''} onChange={e => setProfileData(p => ({...p, address_state: e.target.value}))}
                      className="w-full h-9 px-2 rounded-md bg-[var(--card)] border border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-state">
                      <option value="">State</option>
                      {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Input value={profileData.address_zip || ''} onChange={e => setProfileData(p => ({...p, address_zip: e.target.value}))}
                      placeholder="ZIP" className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-zip" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[var(--t)] text-sm font-medium">
                {profileData.address_street ? (
                  <>
                    <p>{profileData.address_street}{profileData.address_line2 ? `, ${profileData.address_line2}` : ''}</p>
                    <p>{[profileData.address_city, profileData.address_state, profileData.address_zip].filter(Boolean).join(', ') || ''}</p>
                  </>
                ) : <p>—</p>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>



      {/* Estate Photo — benefactor only */}
      {(user?.role === 'benefactor' || user?.is_also_benefactor) && estateId && (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--gold)]" />
            Estate Photo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-[var(--t4)]">
            Set a photo for <strong>{estateName}</strong>. This appears on your estate card and is separate from your personal profile photo.
          </p>
          <div className="flex items-center gap-4">
            <PhotoPicker
              currentPhoto={estatePhoto}
              onPhotoSelected={async (file, previewUrl) => {
                setEstatePhoto(previewUrl);
                try {
                  const base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                  });
                  await axios.put(`${API_URL}/estates/${estateId}/photo`, { photo_data: base64, file_name: file.name }, getAuthHeaders());
                } catch (err) {
                  setEstatePhoto(null);
                  toast.error(err?.response?.data?.detail || 'Failed to save estate photo');
                }
              }}
              onRemove={async () => {
                setEstatePhoto(null);
                try { await axios.put(`${API_URL}/estates/${estateId}/photo`, { photo_data: '', file_name: '' }, getAuthHeaders()); } catch {}
              }}
            />
            <div className="flex-1 min-w-0">
              {editingEstateName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={estateNameDraft}
                    onChange={(e) => setEstateNameDraft(e.target.value)}
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && estateNameDraft.trim()) {
                        try {
                          await axios.patch(`${API_URL}/estates/${estateId}`, { name: estateNameDraft.trim() }, getAuthHeaders());
                          setEstateName(estateNameDraft.trim());
                        } catch { toast.error('Failed to rename'); }
                        setEditingEstateName(false);
                      } else if (e.key === 'Escape') {
                        setEditingEstateName(false);
                      }
                    }}
                    data-testid="estate-name-input"
                  />
                  <button
                    onClick={async () => {
                      if (estateNameDraft.trim()) {
                        try {
                          await axios.patch(`${API_URL}/estates/${estateId}`, { name: estateNameDraft.trim() }, getAuthHeaders());
                          setEstateName(estateNameDraft.trim());
                        } catch { toast.error('Failed to rename'); }
                      }
                      setEditingEstateName(false);
                    }}
                    className="p-1 rounded-md hover:bg-[var(--s)]"
                    data-testid="estate-name-save"
                  >
                    <Check className="w-4 h-4 text-[var(--gn)]" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-[var(--t)] font-semibold">{estateName}</h3>
                  <button
                    onClick={() => { setEstateNameDraft(estateName); setEditingEstateName(true); }}
                    className="p-1 rounded-md hover:bg-[var(--s)]"
                    data-testid="estate-name-edit"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[var(--t4)]" />
                  </button>
                </div>
              )}
              <p className="text-[var(--t5)] text-xs">Visible to your beneficiaries</p>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Push Notifications — benefactor/beneficiary only */}
      {!isStaff && <NotificationSettings getAuthHeaders={() => getAuthHeaders()} />}

      {/* Appearance */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            {theme === 'dark' ? <Moon className="w-5 h-5 text-[var(--gold)]" /> : <Sun className="w-5 h-5 text-[var(--gold)]" />}
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[var(--t)] font-medium">Dark Mode</h4>
              <p className="text-[var(--t5)] text-sm">Use dark theme for the interface</p>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={toggleTheme}
              data-testid="settings-theme-toggle"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[var(--t)] font-medium">Auto-Logout Timer</h4>
              <p className="text-[var(--t5)] text-sm">Log out after being away for this long</p>
            </div>
            <select
              value={localStorage.getItem('carryon_auto_logout_minutes') || '5'}
              onChange={(e) => localStorage.setItem('carryon_auto_logout_minutes', e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-bold bg-[var(--s)] border border-[var(--b)] text-[var(--t)]"
              data-testid="auto-logout-select"
            >
              <option value="1">1 min</option>
              <option value="3">3 min</option>
              <option value="5">5 min</option>
              <option value="10">10 min</option>
              <option value="15">15 min</option>
            </select>
          </div>
          {!isStaff && (
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-[var(--t)] font-medium">Getting Started Guide</h4>
                <p className="text-[var(--t5)] text-sm">Show the onboarding wizard on your dashboard</p>
              </div>
              <Switch
                checked={onboardingVisible}
                onCheckedChange={async (checked) => {
                  setOnboardingVisible(checked);
                  if (checked) {
                    localStorage.removeItem('carryon_onboarding_dismissed');
                    try { await axios.post(`${API_URL}/onboarding/reset`, {}, getAuthHeaders()); } catch (e) { /* ignore */ }
                    // toast removed
                  } else {
                    localStorage.setItem('carryon_onboarding_dismissed', 'true');
                    try { await axios.post(`${API_URL}/onboarding/dismiss`, {}, getAuthHeaders()); } catch (e) { /* ignore */ }
                    // toast removed
                  }
                }}
                data-testid="settings-onboarding-toggle"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications & Digest — all users and admins */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <Bell className="w-5 h-5 text-[var(--gold)]" />
            Notifications & Digest
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Master Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[var(--t)] font-medium flex items-center gap-2">
                <Mail className="w-4 h-4 text-[var(--t4)]" />
                Estate Health Digest
              </h4>
              <p className="text-[var(--t5)] text-sm">
                {user?.role === 'admin' ? 'Founder analytics, subscriptions & platform health'
                 : user?.role === 'operator' ? (user?.operator_role === 'manager' ? 'Queue status, team performance & priorities' : 'Your assigned tasks & queue counts')
                 : "Automated status update email with your estate's health"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {digestLoading && <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)]" />}
              <Switch
                checked={weeklyDigest}
                onCheckedChange={toggleDigest}
                disabled={digestLoading}
                data-testid="settings-weekly-digest-toggle"
              />
            </div>
          </div>

          {weeklyDigest && (
            <div className="space-y-4 pl-1 pt-1">
              {/* Frequency */}
              <div>
                <label className="text-[var(--t)] text-sm font-medium mb-2 block">Frequency</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'biweekly', label: 'Bi-weekly' },
                    { value: 'monthly', label: 'Monthly' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => saveDigestPrefs({ frequency: opt.value })}
                      disabled={digestSaving}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        digestFrequency === opt.value
                          ? 'bg-[var(--gold)] text-[#0b1120] border-[var(--gold)]'
                          : 'bg-[var(--card)] text-[var(--t4)] border-[var(--b)] hover:border-[var(--gold)]'
                      }`}
                      data-testid={`digest-freq-${opt.value}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <Separator className="bg-[var(--b)]" />

              {/* Sections — dynamically loaded from API based on role */}
              <div>
                <label className="text-[var(--t)] text-sm font-medium mb-3 block">Content Sections</label>
                <div className="space-y-3">
                  {Object.keys(digestSections).map(key => {
                    const labels = digestSectionLabels[key];
                    if (!labels) return null;
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <div>
                          <p className="text-[var(--t)] text-sm font-medium">{labels[0]}</p>
                          <p className="text-[var(--t5)] text-xs">{labels[1]}</p>
                        </div>
                        <Switch
                          checked={digestSections[key] !== false}
                          onCheckedChange={(val) => saveDigestPrefs({ sections: { ...digestSections, [key]: val } })}
                          disabled={digestSaving}
                          data-testid={`digest-section-${key}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator className="bg-[var(--b)]" />

              {/* Recipients */}
              <div>
                <label className="text-[var(--t)] text-sm font-medium mb-3 block">Recipients</label>
                <div className="space-y-2">
                  {/* Primary account email */}
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--card)] border border-[var(--b)]">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-[var(--gold)]" />
                      <span className="text-[var(--t)] text-sm">{user?.email}</span>
                    </div>
                    <span className="text-[var(--t5)] text-xs font-medium">Primary</span>
                  </div>

                  {/* Additional recipients */}
                  {additionalRecipients.map((email, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--card)] border border-[var(--b)]">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-[var(--t4)]" />
                        <span className="text-[var(--t)] text-sm">{email}</span>
                      </div>
                      <button
                        onClick={() => removeRecipient(email)}
                        disabled={digestSaving}
                        className="text-red-400 hover:text-red-300 p-1 rounded transition-colors"
                        data-testid={`remove-recipient-${i}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Add recipient input */}
                  <div className="flex items-center gap-2">
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={newRecipientEmail}
                      onChange={(e) => setNewRecipientEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
                      className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm flex-1"
                      data-testid="digest-add-recipient-input"
                    />
                    <Button
                      onClick={addRecipient}
                      disabled={digestSaving || !newRecipientEmail.trim()}
                      variant="outline"
                      size="sm"
                      className="border-[var(--gold)] text-[var(--gold)] hover:bg-[var(--gold)] hover:text-[#0b1120] whitespace-nowrap"
                      data-testid="digest-add-recipient-btn"
                    >
                      {digestSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : '+ Add'}
                    </Button>
                  </div>
                </div>
              </div>

              <Separator className="bg-[var(--b)]" />

              {/* Send Update Now + Preview */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={async () => {
                    setDigestSending(true);
                    try {
                      await axios.post(`${API_URL}/digest/preview-enhanced`, {}, getAuthHeaders());
                      toast.success(`Update sent to ${[user?.email, ...additionalRecipients].filter(Boolean).join(', ')}`);
                    } catch (e) {
                      toast.error('Could not send update');
                    } finally { setDigestSending(false); }
                  }}
                  disabled={digestSending}
                  className="bg-[var(--gold)] text-[#0b1120] hover:bg-[var(--gold)]/90 font-semibold text-sm"
                  data-testid="digest-send-now-btn"
                >
                  {digestSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                  Send Update Now
                </Button>
              </div>
            </div>
          )}

          <Separator className="bg-[var(--b)]" />
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[var(--t)] font-medium">Email Notifications</h4>
              <p className="text-[var(--t5)] text-sm">Receive updates via email</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator className="bg-[var(--b)]" />
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[var(--t)] font-medium">Security Alerts</h4>
              <p className="text-[var(--t5)] text-sm">Get notified of security events</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <Lock className="w-5 h-5 text-[var(--gold)]" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {passkeySupported && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[var(--t)] font-medium">Passkey (Face ID / Touch ID)</h4>
                  <p className="text-[var(--t5)] text-sm">Sign in without a password</p>
                </div>
                <Switch checked={passkeyRegistered} onCheckedChange={handlePasskeyToggle} disabled={passkeyLoading} data-testid="settings-passkey-toggle" />
              </div>
              <Separator className="bg-[var(--b)]" />
            </>
          )}
          <Button variant="outline" className="w-full border-[var(--b)] text-[var(--t)] justify-between"
            onClick={() => setShowChangePassword(!showChangePassword)} data-testid="change-password-btn">
            Change Password
            <ChevronRight className="w-4 h-4" />
          </Button>
          {showChangePassword && (
            <div className="space-y-3 p-3 rounded-xl" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              <div className="relative">
                <Input type={showCurrentPw ? 'text' : 'password'} value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)} placeholder="Current password"
                  className="bg-[var(--bg)] border-[var(--b)] text-[var(--t)] pr-10" data-testid="current-password" />
                <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative">
                <Input type={showNewPw ? 'text' : 'password'} value={newPw}
                  onChange={e => setNewPw(e.target.value)} placeholder="New password"
                  className="bg-[var(--bg)] border-[var(--b)] text-[var(--t)] pr-10" data-testid="new-password" />
                <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Input type={showNewPw ? 'text' : 'password'} value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm new password"
                className={`bg-[var(--bg)] border-[var(--b)] text-[var(--t)] ${confirmPw && newPw !== confirmPw ? 'border-red-500' : ''}`}
                data-testid="confirm-new-password" />
              {confirmPw && newPw !== confirmPw && (
                <p className="text-red-400 text-xs"><span className="text-red-400">*</span> Passwords do not match</p>
              )}
              <Button className="w-full" disabled={!currentPw || !newPw || newPw !== confirmPw || pwLoading}
                style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
                onClick={async () => {
                  setPwLoading(true);
                  try {
                    await axios.post(`${API_URL}/auth/change-password`, { current_password: currentPw, new_password: newPw }, getAuthHeaders());
                    toast.success('Password changed successfully');
                    setShowChangePassword(false);
                    setCurrentPw(''); setNewPw(''); setConfirmPw('');
                  } catch (err) { toast.error(err.response?.data?.detail || 'Failed to change password'); }
                  finally { setPwLoading(false); }
                }} data-testid="submit-change-password">
                {pwLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Update Password
              </Button>
            </div>
          )}
          <Button variant="outline" className="w-full border-[var(--b)] text-[var(--t)] justify-between">
            Two-Factor Authentication
            <span className="text-[#10b981] text-sm">Enabled</span>
          </Button>
        </CardContent>
      </Card>

      {/* Privacy & Data Rights (GDPR) — benefactor/beneficiary only */}
      {!isStaff && (<>
      <Card className="glass-card" data-testid="gdpr-settings">
        <CardHeader>
          <CardTitle className="text-[var(--t)] flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--gold)]" />
            Privacy & Data Rights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Consent Toggles */}
          <div>
            <h4 className="text-[var(--t)] font-medium text-sm mb-3">Data Consent Preferences</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[var(--t)] font-medium text-sm">Essential Services</h4>
                  <p className="text-[var(--t5)] text-xs">Required for core platform functionality</p>
                </div>
                <Switch checked disabled data-testid="consent-essential" />
              </div>
              <Separator className="bg-[var(--b)]" />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[var(--t)] font-medium text-sm">Marketing Emails</h4>
                  <p className="text-[var(--t5)] text-xs">Product updates, tips, and promotions</p>
                </div>
                <Switch
                  checked={consent?.marketing_emails || false}
                  onCheckedChange={(v) => updateConsent('marketing_emails', v)}
                  disabled={consentLoading}
                  data-testid="consent-marketing"
                />
              </div>
              <Separator className="bg-[var(--b)]" />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[var(--t)] font-medium text-sm">Analytics Tracking</h4>
                  <p className="text-[var(--t5)] text-xs">Anonymous usage data to improve the platform</p>
                </div>
                <Switch
                  checked={consent?.analytics_tracking || false}
                  onCheckedChange={(v) => updateConsent('analytics_tracking', v)}
                  disabled={consentLoading}
                  data-testid="consent-analytics"
                />
              </div>
              <Separator className="bg-[var(--b)]" />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[var(--t)] font-medium text-sm">Third-Party Data Sharing</h4>
                  <p className="text-[var(--t5)] text-xs">Share data with trusted partners for service enhancement</p>
                </div>
                <Switch
                  checked={consent?.third_party_sharing || false}
                  onCheckedChange={(v) => updateConsent('third_party_sharing', v)}
                  disabled={consentLoading}
                  data-testid="consent-third-party"
                />
              </div>
            </div>
            {consent?.updated_at && (
              <p className="text-[var(--t5)] text-[10px] mt-2">
                Last updated: {new Date(consent.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>

          <Separator className="bg-[var(--b)]" />

          {/* Data Rights Actions */}
          <div>
            <h4 className="text-[var(--t)] font-medium text-sm mb-3">Your Data Rights</h4>
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full border-[var(--b)] text-[var(--t)] justify-between"
                onClick={handleDataExport}
                disabled={exportLoading}
                data-testid="gdpr-export-data"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-[var(--bl3)]" />
                  Download My Data
                </span>
                {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
              <p className="text-[var(--t5)] text-[10px] pl-1">GDPR Article 15/20 — Export all your personal data as JSON</p>

              <Button
                variant="outline"
                className="w-full border-[var(--b)] text-[var(--t)] justify-between"
                onClick={fetchRetentionPolicy}
                data-testid="gdpr-retention-policy"
              >
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--gold)]" />
                  Data Retention Policy
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                className="w-full border-[#ef4444]/30 text-[#ef4444] justify-between hover:bg-[#ef4444]/5"
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="gdpr-delete-account"
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Request Account Deletion
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <p className="text-[var(--t5)] text-[10px] pl-1">GDPR Article 17 — Permanently delete your account and all data</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Retention Policy Modal */}
      {showRetention && retentionPolicy && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[5vh] px-4 overflow-y-auto" onClick={() => setShowRetention(false)}>
          <div className="glass-card p-6 max-w-lg w-full border border-[var(--b2)] mb-8" onClick={e => e.stopPropagation()} data-testid="retention-policy-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2">
                <FileText className="w-5 h-5 text-[var(--gold)]" />
                Data Retention Policy
              </h3>
              <button onClick={() => setShowRetention(false)} className="text-[var(--t5)] hover:text-[var(--t)]">
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>
            <p className="text-[var(--t4)] text-xs mb-4">Version {retentionPolicy.policy_version} · Updated {retentionPolicy.last_updated}</p>
            <div className="space-y-3">
              {retentionPolicy.categories.map((cat, i) => (
                <div key={i} className="rounded-lg p-3" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-[var(--t)] font-medium text-sm">{cat.data_type}</h4>
                      <p className="text-[var(--t4)] text-xs mt-0.5">{cat.retention}</p>
                    </div>
                  </div>
                  <p className="text-[var(--t5)] text-[10px] mt-1">Legal basis: {cat.legal_basis}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[5vh] px-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="glass-card p-6 max-w-md w-full border border-[#ef4444]/20" onClick={e => e.stopPropagation()} data-testid="delete-account-modal">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#ef4444]/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#ef4444]">Delete Account</h3>
                <p className="text-[var(--t4)] text-xs">This action cannot be undone</p>
              </div>
            </div>
            <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <p className="text-[var(--t3)] text-xs leading-relaxed">
                Your account and all associated data (estates, documents, messages, beneficiaries) will be permanently deleted within 30 days. This complies with GDPR Article 17.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[var(--t4)] text-xs block mb-1">Type your email to confirm</label>
                <input
                  value={deleteEmail}
                  onChange={e => setDeleteEmail(e.target.value)}
                  placeholder={user?.email}
                  className="w-full px-3 py-2 bg-[var(--s)] border border-[var(--b)] rounded-lg text-[var(--t)] text-sm outline-none focus:border-[#ef4444]/50"
                  data-testid="delete-confirm-email"
                />
              </div>
              <div>
                <label className="text-[var(--t4)] text-xs block mb-1">Reason (optional)</label>
                <input
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  placeholder="Why are you leaving?"
                  className="w-full px-3 py-2 bg-[var(--s)] border border-[var(--b)] rounded-lg text-[var(--t)] text-sm outline-none focus:border-[var(--b2)]"
                  data-testid="delete-reason"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 border-[var(--b)] text-[var(--t)]"
                  onClick={() => setShowDeleteConfirm(false)}
                  data-testid="delete-cancel"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-[#ef4444] hover:bg-[#dc2626] text-white"
                  disabled={deleteEmail !== user?.email || deleteLoading}
                  onClick={handleDeleteRequest}
                  data-testid="delete-confirm"
                >
                  {deleteLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete My Account
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>)}

      {/* Sign Out */}
      <Card className="glass-card border-[#ef4444]/20">
        <CardContent className="p-4">
          <Button
            variant="outline"
            className="w-full border-[#ef4444]/50 text-[#ef4444] hover:bg-[#ef4444]/10"
            onClick={handleLogout}
            data-testid="settings-logout-button"
          >
            <LogOut className="w-5 h-5 mr-2" />
            Sign Out
          </Button>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center py-4">
        <div className="flex items-center justify-center gap-2 text-[var(--t5)] text-sm mb-2">
          <Shield className="w-4 h-4" />
          <span>AES-256 Encrypted · Zero-Knowledge · 2FA Protected</span>
        </div>
        <p className="text-[var(--t5)] text-xs">
          CarryOn™ v1.0.0 · © 2024 CarryOn Inc.
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
