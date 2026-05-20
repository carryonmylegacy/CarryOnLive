import React, { useState, useEffect } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';
import { User, Pencil, ChevronRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { PhotoPicker } from '../PhotoPicker';
import { getLocalProfile, upsertLocalProfile } from '../../offline/repos/profileRepo';
import { fetchAndStoreImageBlob } from '../../offline/imageBlobsRepo';
import { getOfflineMode } from '../../offline/featureFlag';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const ProfileCard = () => {
  const { user, getAuthHeaders, refreshUser } = useAuth();

  const [profilePhoto, setProfilePhoto] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [username, setUsername] = useState('');
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.name || '');
    setEmail(user.email || '');
    // Seed photo + name + username synchronously from the user object —
    // AuthContext's offline hydrate path already merges the cached
    // profile into user via { ...cachedProfile, _offlineHydrated }, so
    // user.photo_url / user.username are present on offline relaunch.
    // Painting from `user` first means the avatar shows in <1ms instead
    // of waiting on an IndexedDB round-trip that might not have data.
    if (user.photo_url) setProfilePhoto(user.photo_url);
    if (user.username) setUsername(user.username);
    let cancelled = false;
    // Then fall back to the explicit cache read for fields user may
    // not include (extended profile data), and finally refresh from
    // the network when online.
    (async () => {
      try {
        const local = await getLocalProfile();
        if (local && !cancelled) {
          if (local.photo_url) setProfilePhoto(local.photo_url);
          if (local.name) setDisplayName(local.name);
          if (local.username) setUsername(local.username);
        }
      } catch { /* ignore */ }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      try {
        const res = await apiClient.get(`${API_URL}/auth/me`, getAuthHeaders());
        if (cancelled) return;
        setProfilePhoto(res.data.photo_url || null);
        setDisplayName(res.data.name || user.name || '');
        setUsername(res.data.username || '');
        setEmail(res.data.email || '');
        // Refresh the cache so the next offline relaunch has the
        // newest photo URL + name. Fire-and-forget, never throws.
        upsertLocalProfile(res.data || {}).catch(() => {});
        // Aggressive write-through of the photo BYTES to the
        // IndexedDB blob store — covers the case where warmup didn't
        // complete (user went offline immediately after login) AND
        // the case where the user just changed their photo and we
        // want the new bytes available offline ASAP. Fire-and-forget;
        // CORS/403 failures swallow silently.
        if (res.data?.photo_url && res.data?.id) {
          fetchAndStoreImageBlob(
            res.data.photo_url,
            `user:${res.data.id}:photo`,
            'photo',
          ).catch(() => {});
        }
      } catch { /* swallow — keep local paint if any */ }
    })();
    return () => { cancelled = true; };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
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
            cacheKey={user?.id ? `user:${user.id}:photo` : undefined}
            onPhotoSelected={async (file, previewUrl) => {
              setProfilePhoto(previewUrl);
              try {
                const reader = new FileReader();
                reader.onload = async () => {
                  const base64 = reader.result.split(',')[1];
                  const res = await apiClient.put(`${API_URL}/auth/profile-photo`, { photo_data: base64, file_name: file.name }, getAuthHeaders());
                  if (res.data?.photo_url) setProfilePhoto(res.data.photo_url);
                  toast.success('Profile photo saved');
                };
                reader.readAsDataURL(file);
              } catch {
                toast.error('Failed to save profile photo');
                setProfilePhoto(null);
              }
            }}
            onRemove={async () => {
              setProfilePhoto(null);
              try { await apiClient.put(`${API_URL}/auth/profile-photo`, { photo_data: '', file_name: '' }, getAuthHeaders()); } catch {}
            }}
          />
          <div>
            {editingName ? (
              <div className="flex flex-col gap-2">
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="h-9 text-base font-semibold"
                  style={{ fontSize: '16px' }}
                  placeholder="Enter your name"
                  autoFocus
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && nameDraft.trim()) {
                      setNameSaving(true);
                      try {
                        await apiClient.put(`${API_URL}/auth/display-name`, { name: nameDraft.trim() }, getAuthHeaders());
                        setDisplayName(nameDraft.trim());
                        setEditingName(false);
                        toast.success('Name updated');
                      } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update name'); }
                      finally { setNameSaving(false); }
                    } else if (e.key === 'Escape') { setEditingName(false); }
                  }}
                  data-testid="display-name-input"
                />
                <div className="flex items-center gap-2">
                  <button
                    disabled={nameSaving}
                    onClick={async () => {
                      if (nameDraft.trim()) {
                        setNameSaving(true);
                        try {
                          await apiClient.put(`${API_URL}/auth/display-name`, { name: nameDraft.trim() }, getAuthHeaders());
                          setDisplayName(nameDraft.trim());
                          toast.success('Name updated');
                        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update name'); }
                        finally { setNameSaving(false); }
                      }
                      setEditingName(false);
                    }}
                    className="h-8 px-4 rounded-md text-sm font-bold btn-gold-cta"
                    data-testid="display-name-save"
                  >
                    {nameSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                  </button>
                  <button onClick={() => setEditingName(false)}
                    className="h-8 px-4 rounded-md text-sm btn-outline-cta">
                    Cancel
                  </button>
                </div>
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
            <p className="text-[var(--t4)] text-sm">{email || user?.email || ''}</p>
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
            <div className="flex flex-col gap-2">
              <Input
                value={usernameDraft}
                onChange={(e) => setUsernameDraft(e.target.value)}
                className="h-9 text-base"
                style={{ fontSize: '16px' }}
                placeholder="Enter a username"
                autoFocus
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && usernameDraft.trim()) {
                    setUsernameSaving(true);
                    try {
                      await apiClient.put(`${API_URL}/auth/username`, { username: usernameDraft.trim() }, getAuthHeaders());
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
              <div className="flex items-center gap-2">
                <button
                  disabled={usernameSaving || !usernameDraft.trim()}
                  onClick={async () => {
                    if (usernameDraft.trim()) {
                      setUsernameSaving(true);
                      try {
                        await apiClient.put(`${API_URL}/auth/username`, { username: usernameDraft.trim() }, getAuthHeaders());
                        setUsername(usernameDraft.trim());
                        toast.success('Username updated');
                      } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update username'); }
                      finally { setUsernameSaving(false); }
                    }
                    setEditingUsername(false);
                  }}
                  className="h-8 px-4 rounded-md text-sm font-bold btn-gold-cta"
                  data-testid="username-save"
                >
                  {usernameSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                </button>
                <button onClick={() => setEditingUsername(false)}
                  className="h-8 px-4 rounded-md text-sm btn-outline-cta">
                  Cancel
                </button>
              </div>
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
        <Separator className="bg-[var(--b)]" />
        <div>
          <h4 className="text-[var(--t)] font-medium text-sm mb-1">Email</h4>
          <p className="text-[var(--t5)] text-xs mb-2">Used for sign-in and notifications. We'll confirm any change at both your old and new address.</p>
          {editingEmail ? (
            <div className="flex flex-col gap-2">
              <Input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                className="h-9 text-base"
                style={{ fontSize: '16px' }}
                placeholder="you@example.com"
                autoFocus
                autoComplete="email"
                inputMode="email"
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && emailDraft.trim()) {
                    setEmailSaving(true);
                    try {
                      const res = await apiClient.put(`${API_URL}/auth/email`, { email: emailDraft.trim() }, getAuthHeaders());
                      setEmail(res.data?.email || emailDraft.trim().toLowerCase());
                      setEditingEmail(false);
                      toast.success('Email updated — confirmation sent to both addresses');
                      try { await refreshUser?.(); } catch { /* ignore */ }
                    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update email'); }
                    finally { setEmailSaving(false); }
                  } else if (e.key === 'Escape') {
                    setEditingEmail(false);
                  }
                }}
                data-testid="email-input"
              />
              <div className="flex items-center gap-2">
                <button
                  disabled={emailSaving || !emailDraft.trim()}
                  onClick={async () => {
                    if (emailDraft.trim()) {
                      setEmailSaving(true);
                      try {
                        const res = await apiClient.put(`${API_URL}/auth/email`, { email: emailDraft.trim() }, getAuthHeaders());
                        setEmail(res.data?.email || emailDraft.trim().toLowerCase());
                        toast.success('Email updated — confirmation sent to both addresses');
                        try { await refreshUser?.(); } catch { /* ignore */ }
                      } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update email'); }
                      finally { setEmailSaving(false); }
                    }
                    setEditingEmail(false);
                  }}
                  className="h-8 px-4 rounded-md text-sm font-bold btn-gold-cta"
                  data-testid="email-save"
                >
                  {emailSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                </button>
                <button onClick={() => setEditingEmail(false)}
                  className="h-8 px-4 rounded-md text-sm btn-outline-cta"
                  data-testid="email-cancel">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[var(--t)] text-sm font-medium break-all">{email || user?.email || <span className="text-[var(--t5)] italic">No email on file</span>}</span>
              <button
                onClick={() => { setEmailDraft(email || user?.email || ''); setEditingEmail(true); }}
                className="p-1 rounded-md hover:bg-[var(--s)]"
                data-testid="email-edit"
              >
                <Pencil className="w-3.5 h-3.5 text-[var(--t4)]" />
              </button>
            </div>
          )}
        </div>
        <Separator className="bg-[var(--b)]" />
        {/* Change Password */}
        <div>
          <Button variant="outline" className="w-full border-[var(--b)] text-[var(--t)] justify-between"
            onClick={() => setShowChangePassword(!showChangePassword)} data-testid="change-password-btn">
            Change Password
            <ChevronRight className={`w-4 h-4 transition-transform ${showChangePassword ? 'rotate-90' : ''}`} />
          </Button>
          {showChangePassword && (
            <div className="space-y-3 p-3 mt-2 rounded-xl" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              <div className="relative">
                <Input type={showCurrentPw ? 'text' : 'password'} value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)} placeholder="Current password"
                  style={{ fontSize: '16px' }}
                  className="bg-[var(--bg)] border-[var(--b)] text-[var(--t)] pr-10" data-testid="current-password" />
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative">
                <Input type={showNewPw ? 'text' : 'password'} value={newPw}
                  onChange={e => setNewPw(e.target.value)} placeholder="New password"
                  style={{ fontSize: '16px' }}
                  className="bg-[var(--bg)] border-[var(--b)] text-[var(--t)] pr-10" data-testid="new-password" />
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Input type={showNewPw ? 'text' : 'password'} value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm new password"
                style={{ fontSize: '16px' }}
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
                    await apiClient.post(`${API_URL}/auth/change-password`, { current_password: currentPw, new_password: newPw }, getAuthHeaders());
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
        </div>
      </CardContent>
    </Card>
  );
};

export default ProfileCard;
