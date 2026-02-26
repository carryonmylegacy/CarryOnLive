import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Users,
  Plus,
  Trash2,
  Mail,
  Phone,
  UserCircle,
  Loader2,
  Send,
  CheckCircle,
  Clock,
  MapPin,
  Calendar,
  ChevronDown,
  ChevronUp,
  Edit2,
  Camera
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { SectionLockBanner } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const relations = [
  'Spouse', 'Son', 'Daughter', 'Parent', 'Sibling', 'Grandchild', 'Friend', 'Other'
];

const avatarColors = [
  '#d4af37', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#ec4899', '#06b6d4'
];

const usStates = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

const BeneficiariesPage = () => {
  const { getAuthHeaders } = useAuth();
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  const [editingBeneficiary, setEditingBeneficiary] = useState(null);
  
  // Form state - enhanced demographics
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressState, setAddressState] = useState('');
  const [addressZip, setAddressZip] = useState('');
  const [ssnLastFour, setSsnLastFour] = useState('');
  const [notes, setNotes] = useState('');
  const [avatarColor, setAvatarColor] = useState(avatarColors[0]);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      if (estatesRes.data.length > 0) {
        setEstate(estatesRes.data[0]);
        const bensRes = await axios.get(`${API_URL}/beneficiaries/${estatesRes.data[0].id}`, getAuthHeaders());
        setBeneficiaries(bensRes.data);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load beneficiaries');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
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
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const uploadPhoto = async (beneficiaryId) => {
    if (!photoFile) return;
    setUploadingPhoto(beneficiaryId);
    try {
      const formData = new FormData();
      formData.append('file', photoFile);
      await axios.post(`${API_URL}/beneficiaries/${beneficiaryId}/photo`, formData, {
        ...getAuthHeaders(),
        headers: { ...getAuthHeaders().headers, 'Content-Type': 'multipart/form-data' }
      });
    } catch (err) {
      console.error('Photo upload error:', err);
      toast.error('Photo saved but face upload failed — you can retry from edit');
    } finally {
      setUploadingPhoto(null);
    }
  };

  const handleAddOrEdit = async () => {
    if (!firstName || !lastName || !email || !relation) {
      toast.error('Please fill all required fields (First Name, Last Name, Email, Relationship)');
      return;
    }
    
    setAdding(true);
    try {
      const payload = {
        estate_id: estate.id,
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        suffix: suffix || null,
        email,
        phone: phone || null,
        relation,
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        address_street: addressStreet || null,
        address_city: addressCity || null,
        address_state: addressState || null,
        address_zip: addressZip || null,
        ssn_last_four: ssnLastFour || null,
        notes: notes || null,
        avatar_color: avatarColor
      };

      if (editingBeneficiary) {
        await axios.put(`${API_URL}/beneficiaries/${editingBeneficiary.id}`, payload, getAuthHeaders());
        if (photoFile) await uploadPhoto(editingBeneficiary.id);
        toast.success('Beneficiary updated');
      } else {
        const res = await axios.post(`${API_URL}/beneficiaries`, payload, getAuthHeaders());
        if (photoFile && res.data?.id) await uploadPhoto(res.data.id);
        toast.success('Beneficiary added successfully');
      }
      
      setShowAddModal(false);
      setEditingBeneficiary(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error.response?.data?.detail || 'Failed to save beneficiary');
    } finally {
      setAdding(false);
    }
  };

  const openEditModal = (ben) => {
    setEditingBeneficiary(ben);
    setFirstName(ben.first_name || ben.name?.split(' ')[0] || '');
    setMiddleName(ben.middle_name || '');
    setLastName(ben.last_name || ben.name?.split(' ').slice(-1)[0] || '');
    setSuffix(ben.suffix || '');
    setEmail(ben.email || '');
    setPhone(ben.phone || '');
    setRelation(ben.relation || '');
    setDateOfBirth(ben.date_of_birth || '');
    setGender(ben.gender || '');
    setAddressStreet(ben.address_street || '');
    setAddressCity(ben.address_city || '');
    setAddressState(ben.address_state || '');
    setAddressZip(ben.address_zip || '');
    setSsnLastFour(ben.ssn_last_four || '');
    setNotes(ben.notes || '');
    setAvatarColor(ben.avatar_color || avatarColors[0]);
    setPhotoFile(null);
    setPhotoPreview(ben.photo_url || null);
    setShowAddModal(true);
  };

  const handleSendInvitation = async (beneficiaryId) => {
    setSendingInvite(beneficiaryId);
    try {
      await axios.post(`${API_URL}/beneficiaries/${beneficiaryId}/invite`, {}, getAuthHeaders());
      toast.success('Invitation sent successfully');
      fetchData();
    } catch (error) {
      console.error('Invite error:', error);
      toast.error(error.response?.data?.detail || 'Failed to send invitation');
    } finally {
      setSendingInvite(null);
    }
  };

  const handleDelete = async (beneficiaryId) => {
    if (!confirm('Are you sure you want to remove this beneficiary?')) return;
    
    try {
      await axios.delete(`${API_URL}/beneficiaries/${beneficiaryId}`, getAuthHeaders());
      toast.success('Beneficiary removed');
      setBeneficiaries(beneficiaries.filter(b => b.id !== beneficiaryId));
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to remove beneficiary');
    }
  };

  const resetForm = () => {
    setFirstName('');
    setMiddleName('');
    setLastName('');
    setSuffix('');
    setEmail('');
    setPhone('');
    setRelation('');
    setDateOfBirth('');
    setGender('');
    setAddressStreet('');
    setAddressCity('');
    setAddressState('');
    setAddressZip('');
    setSsnLastFour('');
    setNotes('');
    setAvatarColor(avatarColors[0]);
  };

  const getInvitationStatusBadge = (ben) => {
    if (ben.user_id || ben.invitation_status === 'accepted') {
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[#10b981]/20 text-[#10b981]">
          <CheckCircle className="w-3 h-3" />
          Account Linked
        </span>
      );
    }
    if (ben.invitation_status === 'sent') {
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[#3b82f6]/20 text-[#3b82f6]">
          <Mail className="w-3 h-3" />
          Invitation Sent
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[#f59e0b]/20 text-[#f59e0b]">
        <Clock className="w-3 h-3" />
        Pending Invite
      </span>
    );
  };

  const displayName = firstName && lastName 
    ? `${firstName}${middleName ? ' ' + middleName : ''} ${lastName}${suffix ? ' ' + suffix : ''}`
    : '';

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-white/5" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48 bg-white/5 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="beneficiaries-page"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(34,197,94,0.12), transparent 55%), radial-gradient(ellipse at bottom right, rgba(22,163,74,0.06), transparent 55%)' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.15))' }}>
            <Users className="w-5 h-5 text-[#4EDBA8]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Beneficiaries
            </h1>
            <p className="text-xs text-[var(--t5)]">
              {beneficiaries.length} configured · Manage your family members
            </p>
          </div>
        </div>
        <Button
          className="gold-button w-full sm:w-auto"
          onClick={() => setShowAddModal(true)}
          data-testid="add-beneficiary-button"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Beneficiary
        </Button>
      </div>

      {/* Section Lock */}
      <SectionLockBanner sectionId="beneficiaries" />

      {/* Invitation info */}
      <div className="rounded-xl p-3" style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.1)' }}>
        <p className="text-xs text-[var(--bl3)] leading-relaxed">
          When you send an invitation, the beneficiary will receive an email with a link to create their CarryOn™ account. 
          They will NOT be told any details about your estate, documents, or messages until the appropriate time.
        </p>
      </div>

      {/* Beneficiaries Grid */}
      {beneficiaries.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Users className="w-16 h-16 mx-auto text-[#64748b] mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No beneficiaries yet</h3>
            <p className="text-[#94a3b8] mb-6">
              Add family members who will receive access to your estate
            </p>
            <Button className="gold-button" onClick={() => setShowAddModal(true)}>
              <Plus className="w-5 h-5 mr-2" />
              Add Your First Beneficiary
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {beneficiaries.map((ben) => (
            <Card key={ben.id} className="glass-card group" data-testid={`beneficiary-${ben.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
                      style={{
                        backgroundColor: ben.avatar_color + '30',
                        color: ben.avatar_color
                      }}
                    >
                      {ben.initials || (ben.first_name && ben.last_name 
                        ? (ben.first_name[0] + ben.last_name[0]).toUpperCase()
                        : ben.name?.split(' ').map(n => n[0]).join('').toUpperCase())}
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-lg">{ben.name}</h3>
                      <p className="text-[#d4af37] text-sm">{ben.relation}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[#3b82f6] opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => openEditModal(ben)}
                      data-testid={`edit-beneficiary-${ben.id}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[#ef4444] opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(ben.id)}
                      data-testid={`delete-beneficiary-${ben.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-[#94a3b8]">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{ben.email}</span>
                  </div>
                  {ben.phone && (
                    <div className="flex items-center gap-2 text-[#94a3b8]">
                      <Phone className="w-4 h-4" />
                      <span>{ben.phone}</span>
                    </div>
                  )}
                  {ben.date_of_birth && (
                    <div className="flex items-center gap-2 text-[#94a3b8]">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(ben.date_of_birth).toLocaleDateString()}</span>
                    </div>
                  )}
                  {(ben.address_city || ben.address_state) && (
                    <div className="flex items-center gap-2 text-[#94a3b8]">
                      <MapPin className="w-4 h-4" />
                      <span>{[ben.address_city, ben.address_state].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                </div>

                {/* Expandable Details */}
                {(ben.address_street || ben.notes || ben.ssn_last_four) && (
                  <div className="mt-3">
                    <button
                      onClick={() => setExpandedCard(expandedCard === ben.id ? null : ben.id)}
                      className="text-xs text-[#d4af37] flex items-center gap-1 hover:underline"
                    >
                      {expandedCard === ben.id ? (
                        <>Less details <ChevronUp className="w-3 h-3" /></>
                      ) : (
                        <>More details <ChevronDown className="w-3 h-3" /></>
                      )}
                    </button>
                    
                    {expandedCard === ben.id && (
                      <div className="mt-2 pt-2 border-t border-white/5 space-y-1 text-xs text-[#94a3b8]">
                        {ben.address_street && (
                          <p><span className="text-[#64748b]">Address:</span> {ben.address_street}, {ben.address_city}, {ben.address_state} {ben.address_zip}</p>
                        )}
                        {ben.ssn_last_four && (
                          <p><span className="text-[#64748b]">SSN:</span> ***-**-{ben.ssn_last_four}</p>
                        )}
                        {ben.notes && (
                          <p><span className="text-[#64748b]">Notes:</span> {ben.notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                  {getInvitationStatusBadge(ben)}
                  
                  {ben.invitation_status !== 'accepted' && !ben.user_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[#d4af37]/30 text-[#d4af37] hover:bg-[#d4af37]/10"
                      onClick={() => handleSendInvitation(ben.id)}
                      disabled={sendingInvite === ben.id}
                      data-testid={`send-invite-${ben.id}`}
                    >
                      {sendingInvite === ben.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-3 h-3 mr-1" />
                          {ben.invitation_status === 'sent' ? 'Resend' : 'Send Invite'}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Beneficiary Modal - Enhanced */}
      <Dialog open={showAddModal} onOpenChange={(open) => {
        setShowAddModal(open);
        if (!open) {
          setEditingBeneficiary(null);
          resetForm();
        }
      }}>
        <DialogContent className="glass-card border-white/10 sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {editingBeneficiary ? 'Edit Beneficiary' : 'Add Beneficiary'}
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              {editingBeneficiary ? 'Update the details for this beneficiary' : 'Add a family member or loved one to your estate plan'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Avatar Preview */}
            <div className="flex justify-center">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold transition-colors"
                style={{
                  backgroundColor: avatarColor + '30',
                  color: avatarColor
                }}
              >
                {firstName && lastName 
                  ? (firstName[0] + lastName[0]).toUpperCase() 
                  : <UserCircle className="w-10 h-10" />}
              </div>
            </div>
            
            {/* Color Picker */}
            <div className="flex justify-center gap-2">
              {avatarColors.map((color) => (
                <button
                  key={color}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    avatarColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0f1d35] scale-110' : ''
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setAvatarColor(color)}
                />
              ))}
            </div>

            {/* Name Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-[#d4af37] uppercase tracking-wide">Personal Information</h3>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">First Name *</Label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    className="input-field"
                    data-testid="beneficiary-first-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Middle Name</Label>
                  <Input
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    placeholder="Michael"
                    className="input-field"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Last Name *</Label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Mitchell"
                    className="input-field"
                    data-testid="beneficiary-last-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Suffix</Label>
                  <Select value={suffix} onValueChange={(val) => setSuffix(val === 'none' ? '' : val)}>
                    <SelectTrigger className="input-field">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2440] border-white/10">
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="Jr.">Jr.</SelectItem>
                      <SelectItem value="Sr.">Sr.</SelectItem>
                      <SelectItem value="II">II</SelectItem>
                      <SelectItem value="III">III</SelectItem>
                      <SelectItem value="IV">IV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Relationship *</Label>
                  <Select value={relation} onValueChange={setRelation}>
                    <SelectTrigger className="input-field" data-testid="beneficiary-relation-select">
                      <SelectValue placeholder="Select relationship" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2440] border-white/10">
                      {relations.map((rel) => (
                        <SelectItem key={rel} value={rel}>{rel}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Gender</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger className="input-field" data-testid="beneficiary-gender-select">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2440] border-white/10">
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">Date of Birth</Label>
                <Input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="input-field"
                  data-testid="beneficiary-dob-input"
                />
              </div>
            </div>

            {/* Contact Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-[#d4af37] uppercase tracking-wide">Contact Information</h3>
              
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">Email Address *</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@email.com"
                  className="input-field"
                  data-testid="beneficiary-email-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">Phone Number</Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1-555-0123"
                  className="input-field"
                />
              </div>
            </div>

            {/* Address Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-[#d4af37] uppercase tracking-wide">Address</h3>
              
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">Street Address</Label>
                <Input
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  placeholder="123 Main Street, Apt 4B"
                  className="input-field"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">City</Label>
                  <Input
                    value={addressCity}
                    onChange={(e) => setAddressCity(e.target.value)}
                    placeholder="San Diego"
                    className="input-field"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">State</Label>
                  <Select value={addressState} onValueChange={setAddressState}>
                    <SelectTrigger className="input-field">
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A2440] border-white/10 max-h-48">
                      {usStates.map((st) => (
                        <SelectItem key={st} value={st}>{st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">ZIP Code</Label>
                  <Input
                    value={addressZip}
                    onChange={(e) => setAddressZip(e.target.value)}
                    placeholder="92101"
                    className="input-field"
                    maxLength={10}
                  />
                </div>
              </div>
            </div>

            {/* Additional Info Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-[#d4af37] uppercase tracking-wide">Additional Information</h3>
              
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">SSN (Last 4 digits)</Label>
                <Input
                  value={ssnLastFour}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setSsnLastFour(val);
                  }}
                  placeholder="1234"
                  className="input-field"
                  maxLength={4}
                />
                <p className="text-xs text-[#64748b]">
                  Optional. May be needed for certain estate planning documents.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">Notes / Special Instructions</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special notes about this beneficiary..."
                  className="input-field min-h-[80px]"
                  rows={3}
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddModal(false);
                setEditingBeneficiary(null);
                resetForm();
              }}
              className="border-white/10 text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddOrEdit}
              disabled={adding || !firstName || !lastName || !email || !relation}
              className="gold-button"
              data-testid="beneficiary-submit-button"
            >
              {adding ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {editingBeneficiary ? 'Saving...' : 'Adding...'}
                </>
              ) : (
                <>
                  {editingBeneficiary ? <Edit2 className="w-5 h-5 mr-2" /> : <Plus className="w-5 h-5 mr-2" />}
                  {editingBeneficiary ? 'Save Changes' : 'Add Beneficiary'}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BeneficiariesPage;
