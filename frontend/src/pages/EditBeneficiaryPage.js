import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Camera, Loader2, Save, UserCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toast } from '../utils/toast';
import { cachedGet } from '../utils/apiCache';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';
import AddressAutocomplete from '../components/AddressAutocomplete';
import DateMaskInput from '../components/DateMaskInput';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const relations = [
  'Spouse',
  'Son',
  'Daughter',
  'Parent',
  'Sibling',
  'Grandchild',
  'Friend',
  'Other',
];

const avatarColors = [
  '#d4af37',
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#ef4444',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
];

const usStates = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

const emptyForm = {
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  email: '',
  phone: '',
  relation: '',
  dateOfBirth: '',
  gender: '',
  addressStreet: '',
  addressCity: '',
  addressState: '',
  addressZip: '',
  addressLine2: '',
  ssnLastFour: '',
  notes: '',
  avatarColor: avatarColors[0],
};

const mapBeneficiaryToForm = (beneficiary) => ({
  firstName: beneficiary.first_name || beneficiary.name?.split(' ')[0] || '',
  middleName: beneficiary.middle_name || '',
  lastName: beneficiary.last_name || beneficiary.name?.split(' ').slice(-1)[0] || '',
  suffix: beneficiary.suffix || '',
  email: beneficiary.email || '',
  phone: beneficiary.phone || '',
  relation: beneficiary.relation || '',
  dateOfBirth: beneficiary.date_of_birth || '',
  gender: beneficiary.gender || '',
  addressStreet: beneficiary.address_street || '',
  addressCity: beneficiary.address_city || '',
  addressState: beneficiary.address_state || '',
  addressZip: beneficiary.address_zip || '',
  addressLine2: beneficiary.address_line2 || '',
  ssnLastFour: beneficiary.ssn_last_four || '',
  notes: beneficiary.notes || '',
  avatarColor: beneficiary.avatar_color || avatarColors[0],
});

export default function EditBeneficiaryPage() {
  const { beneficiaryId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const { getAuthHeaders } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [beneficiary, setBeneficiary] = useState(location.state?.beneficiary || null);
  const [form, setForm] = useState(location.state?.beneficiary ? mapBeneficiaryToForm(location.state.beneficiary) : emptyForm);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(location.state?.beneficiary?.photo_url || null);

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    const fetchBeneficiary = async () => {
      try {
        const estatesRes = await cachedGet(axios, `${API_URL}/estates`, getAuthHeaders());
        const estateId = estatesRes.data?.[0]?.id;
        if (!estateId) {
          toast.error('Estate not found');
          navigate('/beneficiaries', { replace: true });
          return;
        }
        const beneficiariesRes = await axios.get(`${API_URL}/beneficiaries/${estateId}`, getAuthHeaders());
        const target = beneficiariesRes.data.find((item) => item.id === beneficiaryId);
        if (!target) {
          toast.error('Beneficiary not found');
          navigate('/beneficiaries', { replace: true });
          return;
        }
        setBeneficiary(target);
        setForm(mapBeneficiaryToForm(target));
        setPhotoPreview(target.photo_url || null);
      } catch (error) {
        console.error('Fetch beneficiary error:', error);
        toast.error('Failed to load beneficiary details');
        navigate('/beneficiaries', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    fetchBeneficiary();
  }, [beneficiaryId, getAuthHeaders, navigate]);

  const displayName = useMemo(() => {
    if (!form.firstName && !form.lastName) return 'Beneficiary';
    return `${form.firstName}${form.middleName ? ` ${form.middleName}` : ''} ${form.lastName}${form.suffix ? ` ${form.suffix}` : ''}`.trim();
  }, [form.firstName, form.middleName, form.lastName, form.suffix]);

  const handlePhotoSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Photo must be under 10MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (loadEvent) => setPhotoPreview(loadEvent.target?.result || null);
    reader.readAsDataURL(file);
  };

  const resetSelectedPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(beneficiary?.photo_url || null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadPhoto = async () => {
    if (!photoFile) return;
    const formData = new FormData();
    formData.append('file', photoFile);
    await axios.post(`${API_URL}/beneficiaries/${beneficiaryId}/photo`, formData, {
      ...getAuthHeaders(),
      headers: { ...getAuthHeaders().headers, 'Content-Type': 'multipart/form-data' },
    });
  };

  const handleSave = async () => {
    if (!form.firstName) { toast.error('First Name is required'); return; }
    if (!form.lastName) { toast.error('Last Name is required'); return; }
    if (!form.email) { toast.error('Email Address is required'); return; }
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) { toast.error('Please enter a valid email address'); return; }
    if (!form.relation) { toast.error('Relationship is required'); return; }

    setSaving(true);
    try {
      await axios.put(`${API_URL}/beneficiaries/${beneficiaryId}`, {
        estate_id: beneficiary?.estate_id,
        first_name: form.firstName,
        middle_name: form.middleName || null,
        last_name: form.lastName,
        suffix: form.suffix || null,
        email: form.email,
        phone: form.phone ? `+1${form.phone.replace(/\D/g, '')}` : null,
        relation: form.relation,
        date_of_birth: form.dateOfBirth || null,
        gender: form.gender || null,
        address_street: form.addressStreet || null,
        address_city: form.addressCity || null,
        address_state: form.addressState || null,
        address_zip: form.addressZip || null,
        address_line2: form.addressLine2 || null,
        ssn_last_four: form.ssnLastFour || null,
        notes: form.notes || null,
        avatar_color: form.avatarColor,
      }, getAuthHeaders());

      await uploadPhoto();
      toast.success('Beneficiary updated');
      navigate('/beneficiaries', { replace: true });
    } catch (error) {
      console.error('Save beneficiary error:', error);
      toast.error(error.response?.data?.detail || 'Failed to save beneficiary');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6" data-testid="edit-beneficiary-loading-page">
        <Skeleton className="h-12 w-60 bg-[var(--s)]" />
        <Skeleton className="h-64 rounded-3xl bg-[var(--s)]" />
        <Skeleton className="h-80 rounded-3xl bg-[var(--s)]" />
      </div>
    );
  }

  return (
    <div
      className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-slide-in-right"
      data-testid="edit-beneficiary-page"
      style={{
        background: 'radial-gradient(ellipse at top left, rgba(34,197,94,0.12), transparent 55%), radial-gradient(ellipse at bottom right, rgba(22,163,74,0.06), transparent 55%)',
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Button
            variant="ghost"
            className="w-fit px-0 text-[var(--t3)] hover:bg-transparent hover:text-[var(--t)]"
            onClick={() => navigate('/beneficiaries')}
            data-testid="edit-beneficiary-back-button"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Beneficiaries
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.22), rgba(22,163,74,0.14))' }}>
              <UserCircle className="h-6 w-6 text-[#4EDBA8]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="edit-beneficiary-title">
                Edit Beneficiary
              </h1>
              <p className="text-sm text-[var(--t5)]" data-testid="edit-beneficiary-subtitle">
                Update {displayName}'s details
              </p>
            </div>
          </div>
        </div>
        <Button className="gold-button w-full sm:w-auto" onClick={handleSave} disabled={saving} data-testid="edit-beneficiary-save-top-button">
          {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
          Save Changes
        </Button>
      </div>

      <SectionLockBanner sectionId="beneficiaries" />

      <SectionLockedOverlay sectionId="beneficiaries">
        <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
          <Card className="glass-card h-fit animate-bounce-tile" data-testid="edit-beneficiary-profile-card">
            <CardContent className="space-y-6 p-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="relative group">
                  <div
                    className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border cursor-pointer transition-opacity"
                    style={{
                      backgroundColor: photoPreview ? 'transparent' : `${form.avatarColor}30`,
                      borderColor: 'rgba(255,255,255,0.08)',
                      color: form.avatarColor,
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="edit-beneficiary-photo-preview"
                  >
                    {photoPreview ? (
                      <img src={photoPreview} alt={displayName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-3xl font-bold">{displayName.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'B'}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      background: 'linear-gradient(135deg, #d4af37, #b8962e)',
                      borderColor: 'var(--bg2, #0f1d35)',
                      color: '#080e1a',
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="edit-beneficiary-photo-button"
                    aria-label="Change photo"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoSelect}
                    data-testid="edit-beneficiary-photo-input"
                  />
                </div>
                {photoFile && (
                  <button type="button" className="text-xs text-[var(--t5)] hover:text-[var(--t)] underline underline-offset-2" onClick={resetSelectedPhoto} data-testid="edit-beneficiary-photo-reset-button">
                    Reset photo
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d4af37]">Avatar Accent</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {avatarColors.map((color) => {
                    const active = form.avatarColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        className={`h-9 w-9 rounded-full transition-transform ${active ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#0f1d35]' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => updateField('avatarColor', color)}
                        data-testid={`edit-beneficiary-color-${color.replace('#', '')}`}
                        aria-label={`Choose avatar color ${color}`}
                      />
                    );
                  })}
                </div>
              </div>

            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="glass-card animate-bounce-tile" data-testid="edit-beneficiary-personal-card">
              <CardHeader>
                <CardTitle className="text-base text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">First Name <span className="text-red-400">*</span></Label>
                  <Input value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} placeholder="John" className="input-field" data-testid="edit-beneficiary-first-name-input" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Middle Name</Label>
                  <Input value={form.middleName} onChange={(event) => updateField('middleName', event.target.value)} placeholder="Michael" className="input-field" data-testid="edit-beneficiary-middle-name-input" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Last Name <span className="text-red-400">*</span></Label>
                  <Input value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} placeholder="Mitchell" className="input-field" data-testid="edit-beneficiary-last-name-input" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Suffix</Label>
                  <select value={form.suffix} onChange={(event) => updateField('suffix', event.target.value)} className="input-field h-11 w-full rounded-xl px-3" data-testid="edit-beneficiary-suffix-select">
                    <option value="">None</option>
                    <option value="Jr.">Jr.</option>
                    <option value="Sr.">Sr.</option>
                    <option value="II">II</option>
                    <option value="III">III</option>
                    <option value="IV">IV</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Relationship <span className="text-red-400">*</span></Label>
                  <select value={form.relation} onChange={(event) => updateField('relation', event.target.value)} className="input-field h-11 w-full rounded-xl px-3" data-testid="edit-beneficiary-relation-select">
                    <option value="">Select relationship</option>
                    {relations.map((relation) => (
                      <option key={relation} value={relation}>{relation}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Gender</Label>
                  <select value={form.gender} onChange={(event) => updateField('gender', event.target.value)} className="input-field h-11 w-full rounded-xl px-3" data-testid="edit-beneficiary-gender-select">
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-[#94a3b8]">Date of Birth</Label>
                  <DateMaskInput value={form.dateOfBirth} onChange={(event) => updateField('dateOfBirth', event.target.value)} className="input-field" data-testid="edit-beneficiary-dob-input" />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card animate-bounce-tile" data-testid="edit-beneficiary-contact-card">
              <CardHeader>
                <CardTitle className="text-base text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-[#94a3b8]">Email Address <span className="text-red-400">*</span></Label>
                  <Input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="john@email.com" className="input-field" data-testid="edit-beneficiary-email-input" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-[#94a3b8]">Phone Number</Label>
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '').slice(0, 10);
                      let formatted = digits;
                      if (digits.length > 6) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
                      else if (digits.length > 3) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
                      else if (digits.length > 0) formatted = `(${digits}`;
                      updateField('phone', formatted);
                    }}
                    placeholder="(123) 456-7890"
                    className="input-field"
                    data-testid="edit-beneficiary-phone-input"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card animate-bounce-tile" data-testid="edit-beneficiary-address-card">
              <CardHeader>
                <CardTitle className="text-base text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Address</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Street Address</Label>
                  <AddressAutocomplete
                    value={form.addressStreet}
                    onChange={(event) => updateField('addressStreet', event.target.value)}
                    onSelect={({ street, city, state, zip }) => {
                      updateField('addressStreet', street);
                      updateField('addressCity', city);
                      updateField('addressState', state);
                      updateField('addressZip', zip);
                    }}
                    placeholder="Start typing an address..."
                    className="input-field"
                    data-testid="edit-beneficiary-address-autocomplete"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Apt, Suite, Unit (optional)</Label>
                  <Input value={form.addressLine2} onChange={(event) => updateField('addressLine2', event.target.value)} placeholder="Apt 4B, Suite 200, etc." className="input-field" data-testid="edit-beneficiary-address-line2-input" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-[#94a3b8] text-xs">City</Label>
                    <Input value={form.addressCity} onChange={(event) => updateField('addressCity', event.target.value)} placeholder="City" className="input-field" data-testid="edit-beneficiary-city-input" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#94a3b8] text-xs">State</Label>
                    <select value={form.addressState} onChange={(event) => updateField('addressState', event.target.value)} className="input-field h-11 w-full rounded-xl px-3" data-testid="edit-beneficiary-state-select">
                      <option value="">State</option>
                      {usStates.map((state) => (
                        <option key={state} value={state}>{state}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#94a3b8] text-xs">ZIP</Label>
                    <Input value={form.addressZip} onChange={(event) => updateField('addressZip', event.target.value)} placeholder="ZIP" className="input-field" maxLength={10} data-testid="edit-beneficiary-zip-input" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card animate-bounce-tile" data-testid="edit-beneficiary-extra-card">
              <CardHeader>
                <CardTitle className="text-base text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Additional Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">SSN (Last 4 digits)</Label>
                  <Input
                    value={form.ssnLastFour}
                    onChange={(event) => updateField('ssnLastFour', event.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="1234"
                    className="input-field"
                    maxLength={4}
                    data-testid="edit-beneficiary-ssn-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Notes / Special Instructions</Label>
                  <Textarea value={form.notes} onChange={(event) => updateField('notes', event.target.value)} placeholder="Any special notes about this beneficiary..." className="input-field min-h-[120px]" data-testid="edit-beneficiary-notes-input" />
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" className="border-[var(--b)] text-[var(--t)]" onClick={() => navigate('/beneficiaries')} data-testid="edit-beneficiary-cancel-button">
                Cancel
              </Button>
              <Button className="gold-button" onClick={handleSave} disabled={saving} data-testid="edit-beneficiary-save-bottom-button">
                {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </SectionLockedOverlay>
    </div>
  );
}