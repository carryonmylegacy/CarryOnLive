import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../../utils/apiClient';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';
import { User, Pencil, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import AddressAutocomplete from '../AddressAutocomplete';
import { formatPhoneUS } from '../../utils/phoneFormat';
import DateMaskInput from '../DateMaskInput';
import { getLocalProfile, upsertLocalProfile, updateLocalProfile } from '../../offline/repos/profileRepo';
import { enqueue as enqueueOutbox } from '../../offline/outbox';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const PersonalInfoCard = ({ initialEditAddress = false }) => {
  const { user, getAuthHeaders } = useAuth();
  const saveBtnRef = useRef(null);

  const [profileData, setProfileData] = useState({});
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [editAddressMode, setEditAddressMode] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // Offline-first paint: seed from local cache first, regardless of
    // the offline-mode flag. warmUpAfterLogin always writes the
    // profile row to IndexedDB on every login, so the cache is the
    // fastest + most reliable first paint. Previously gated on
    // `getOfflineMode() === 'on'`, which meant fields rendered as
    // dashes after a PWA reinstall (flag defaults to 'off' until the
    // founder re-flips the admin toggle, which itself needs to have
    // hydrated from the server — a chicken-and-egg that stranded
    // every cached field).
    (async () => {
      try {
        const local = await getLocalProfile();
        if (local && !cancelled) setProfileData(local);
      } catch { /* ignore */ }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      try {
        const res = await apiClient.get(`${API_URL}/auth/profile`, getAuthHeaders());
        if (cancelled) return;
        setProfileData(res.data || {});
        upsertLocalProfile(res.data || {}).catch(() => {});
      } catch { /* swallow — keep local paint if any */ }
    })();
    return () => { cancelled = true; };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialEditAddress) {
      setProfileEditing(true);
      setEditAddressMode(true);
      setTimeout(() => {
        const el = document.querySelector('[data-testid="settings-address-section"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
    }
  }, [initialEditAddress]);

  const saveProfile = async () => {
    setProfileSaving(true);
    const payload = profileData;
    // Offline path (flag-agnostic): patch local mirror, enqueue PUT for
    // replay, toast "queued", and short-circuit without a failing
    // network call.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      try {
        await updateLocalProfile(payload);
        await enqueueOutbox({
          entity_type: 'profile',
          entity_id: 'current',
          method: 'PUT',
          url: '/auth/profile',
          body: payload,
        });
        toast.success('Profile saved offline — will sync when you reconnect.');
        setProfileEditing(false);
      } catch (_err) {
        toast.error('Could not save profile offline.');
      } finally { setProfileSaving(false); }
      return;
    }
    try {
      await apiClient.put(`${API_URL}/auth/profile`, payload, getAuthHeaders());
      // Refresh local mirror so next cold boot reflects the new values.
      updateLocalProfile(payload).catch(() => {});
      toast.success('Profile updated');
      setProfileEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update profile');
    } finally { setProfileSaving(false); }
  };

  return (
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
            <div className="flex gap-2" ref={saveBtnRef}>
              <Button variant="outline" size="sm" onClick={() => { setProfileEditing(false); setEditAddressMode(false); }}
                className="border-[var(--b)] text-[var(--t4)]">Cancel</Button>
              <Button size="sm" onClick={() => { saveProfile(); setEditAddressMode(false); }} disabled={profileSaving}
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
              <Input type="tel" value={formatPhoneUS(profileData.phone || '')} onChange={e => setProfileData(p => ({...p, phone: formatPhoneUS(e.target.value)}))}
                placeholder="(555) 123-4567" className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-phone" />
            ) : (
              <p className="text-[var(--t)] text-sm font-medium">{formatPhoneUS(profileData.phone) || '—'}</p>
            )}
          </div>
          <div>
            <label className="text-[var(--t5)] text-xs mb-1 block">Date of Birth</label>
            {profileEditing ? (
              <DateMaskInput value={profileData.date_of_birth || ''} onChange={e => setProfileData(p => ({...p, date_of_birth: e.target.value}))}
                className="flex h-9 w-full rounded-md px-3 py-1 text-sm bg-[var(--card)] border border-[var(--b)] text-[var(--t)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]" data-testid="profile-dob" />
            ) : (
              <p className="text-[var(--t)] text-sm font-medium">{profileData.date_of_birth ? profileData.date_of_birth.replace(/(\d{4})-(\d{2})-(\d{2})/, (_, y, m, d) => `${m}/${d}/${y}`) : '—'}</p>
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
                className="select-themed w-full h-9 px-3 rounded-md bg-[var(--card)] border border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-gender">
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
                className="select-themed w-full h-9 px-3 rounded-md bg-[var(--card)] border border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-marital">
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
        <div data-testid="settings-address-section">
          <label className="text-[var(--t5)] text-xs mb-1 block">Address</label>
          {profileEditing ? (
            <div className={`space-y-2 transition-all duration-300 ${editAddressMode ? 'border-2 border-[var(--gold)] rounded-xl bg-[var(--gold)]/5 p-4' : ''}`}
              data-testid="address-fields-wrapper">
              {editAddressMode && (
                <p className="text-[var(--gold)] text-xs font-medium mb-1" data-testid="address-highlight-label">
                  Please enter your address below
                </p>
              )}
              <AddressAutocomplete
                value={profileData.address_street || ''}
                onChange={e => setProfileData(p => ({...p, address_street: e.target.value}))}
                onSelect={({ street, city, state, zip }) => {
                  setProfileData(p => ({
                    ...p,
                    address_street: street,
                    address_city: city,
                    address_state: state,
                    address_zip: zip,
                  }));
                }}
                placeholder="Street address"
                className="w-full h-9 px-3 rounded-md bg-[var(--card)] border border-[var(--b)] text-[var(--t)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
                style={{ fontSize: '16px' }}
                data-testid="profile-street"
              />
              <Input value={profileData.address_line2 || ''} onChange={e => setProfileData(p => ({...p, address_line2: e.target.value}))}
                placeholder="Apt, suite, unit (optional)" className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-line2" />
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-2">
                  <Input value={profileData.address_city || ''} onChange={e => setProfileData(p => ({...p, address_city: e.target.value}))}
                    placeholder="City" className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-city" />
                </div>
                <div>
                  <select value={profileData.address_state || ''} onChange={e => setProfileData(p => ({...p, address_state: e.target.value}))}
                    className="select-themed w-full h-9 px-2 rounded-md bg-[var(--card)] border border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-state">
                    <option value="">State</option>
                    {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Input value={profileData.address_zip || ''} onChange={e => setProfileData(p => ({...p, address_zip: e.target.value}))}
                    placeholder="ZIP" className="bg-[var(--card)] border-[var(--b)] text-[var(--t)] text-sm" data-testid="profile-zip"
                    onBlur={() => {
                      if (editAddressMode && saveBtnRef.current) {
                        setTimeout(() => {
                          saveBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 200);
                      }
                    }} />
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
  );
};

export default PersonalInfoCard;
