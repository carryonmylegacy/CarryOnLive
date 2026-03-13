import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { cachedGet } from '../utils/apiCache';
import { ReturnPopup } from '../components/GuidedActivation';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Users,
  Plus,
  Trash2,
  Mail,
  Phone,
  Loader2,
  Send,
  CheckCircle,
  Clock,
  MapPin,
  Calendar,
  ChevronDown,
  ChevronUp,
  Edit2,
  Copy,
  Check,
  Shield,
  AlertTriangle,
  UserCheck,
  XCircle,
  GripVertical,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from '../utils/toast';
import { Switch } from '../components/ui/switch';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';
import { PhotoPicker } from '../components/PhotoPicker';
import { AvatarCircle } from '../components/AvatarCircle';
import AddressAutocomplete from '../components/AddressAutocomplete';
import DateMaskInput from '../components/DateMaskInput';
import SlidePanel from '../components/SlidePanel';
import FamilyTree from '../components/FamilyTree';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Sortable wrapper for beneficiary cards
const SortableCard = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
};

const relations = [
  'Spouse', 'Son', 'Daughter', 'Son-in-law', 'Daughter-in-law', 'Mother', 'Father', 'Mother-in-law', 'Father-in-law', 'Brother', 'Sister', 'Aunt', 'Uncle', 'Grandson', 'Granddaughter', 'Grandmother', 'Grandfather', 'Nephew', 'Niece', 'Great-Grandson', 'Great-Granddaughter', 'Great-Grandmother', 'Great-Grandfather', 'Friend', 'Other'
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
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPrimaryPopup, setShowPrimaryPopup] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  const [editingBeneficiary, setEditingBeneficiary] = useState(null);
  const [copiedLink, setCopiedLink] = useState(null);
  
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
  const [addressLine2, setAddressLine2] = useState('');
  const [ssnLastFour, setSsnLastFour] = useState('');
  const [notes, setNotes] = useState('');
  const [avatarColor, setAvatarColor] = useState(avatarColors[0]);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [, setUploadingPhoto] = useState(null);
  const [settingPrimary, setSettingPrimary] = useState(null);
  const [showPrimaryDisclaimer, setShowPrimaryDisclaimer] = useState(null);
  const [accessRequests, setAccessRequests] = useState([]);
  const [handlingRequest, setHandlingRequest] = useState(null);
  const [changingPrimary, setChangingPrimary] = useState(false);
  const [sectionPerms, setSectionPerms] = useState({});
  const [savingPerms, setSavingPerms] = useState(null);
  const [benEstates, setBenEstates] = useState([]);
  const [quickUploadBenId, setQuickUploadBenId] = useState(null);
  const quickFileRef = React.useRef(null);

  const SECTION_LABELS = {
    vault: 'Secure Document Vault (SDV)',
    messages: 'Milestone Messages (MM)',
    checklist: 'Immediate Action Checklist (IAC)',
    guardian: 'Estate Guardian AI (EGA)',
    digital_wallet: 'Digital Access Vault (DAV)',
    timeline: 'Estate Plan Timeline',
  };

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const estatesRes = await cachedGet(axios, `${API_URL}/estates`, getAuthHeaders());
      const allEstates = estatesRes.data;
      // Find the owned estate (benefactor context)
      const ownedEstate = allEstates.find(e => e.user_role_in_estate === 'owner' || (!e.user_role_in_estate && !e.is_beneficiary_estate));
      // Beneficiary estates (for family tree)
      const bEstates = allEstates.filter(e => e.user_role_in_estate === 'beneficiary' || e.is_beneficiary_estate);
      setBenEstates(bEstates);
      if (ownedEstate) {
        setEstate(ownedEstate);
        const [bensRes, requestsRes, permsRes] = await Promise.all([
          axios.get(`${API_URL}/beneficiaries/${ownedEstate.id}`, getAuthHeaders()),
          axios.get(`${API_URL}/beneficiaries/access-requests/${ownedEstate.id}`, getAuthHeaders()).catch(() => ({ data: [] })),
          axios.get(`${API_URL}/estate/${ownedEstate.id}/section-permissions`, getAuthHeaders()).catch(() => ({ data: [] })),
        ]);
        setBeneficiaries(bensRes.data);
        setAccessRequests(requestsRes.data || []);
        const permsMap = {};
        for (const p of (permsRes.data || [])) {
          permsMap[p.beneficiary_id] = p.sections;
        }
        setSectionPerms(permsMap);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load beneficiaries');
    } finally {
      setLoading(false);
    }
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

  const handleQuickPhotoUpload = async (file, benId) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(`${API_URL}/beneficiaries/${benId}/photo`, formData, {
        ...getAuthHeaders(),
        headers: { ...getAuthHeaders().headers, 'Content-Type': 'multipart/form-data' }
      });
      fetchData();
    } catch {
      toast.error('Photo upload failed — try again from edit');
    }
  };

  const handleAddOrEdit = async () => {
    if (!firstName) { toast.error('First Name is required'); return; }
    if (!lastName) { toast.error('Last Name is required'); return; }
    if (!email) { toast.error('Email Address is required'); return; }
    if (email && !/\S+@\S+\.\S+/.test(email)) { toast.error('Please enter a valid email address'); return; }
    if (!relation) { toast.error('Relationship is required'); return; }
    
    setAdding(true);
    try {
      const payload = {
        estate_id: estate.id,
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        suffix: suffix || null,
        email,
        phone: phone ? `+1${phone.replace(/\D/g, '')}` : null,
        relation,
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        address_street: addressStreet || null,
        address_city: addressCity || null,
        address_state: addressState || null,
        address_zip: addressZip || null,
        address_line2: addressLine2 || null,
        ssn_last_four: ssnLastFour || null,
        notes: notes || null,
        avatar_color: avatarColor
      };

      if (editingBeneficiary) {
        await axios.put(`${API_URL}/beneficiaries/${editingBeneficiary.id}`, payload, getAuthHeaders());
        if (photoFile) await uploadPhoto(editingBeneficiary.id);
        // toast removed
      } else {
        const res = await axios.post(`${API_URL}/beneficiaries`, payload, getAuthHeaders());
        if (photoFile && res.data?.id) await uploadPhoto(res.data.id);
        // toast removed
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
    setPhone(ben.phone ? ben.phone.replace('+1', '') : '');
    setRelation(ben.relation || '');
    setDateOfBirth(ben.date_of_birth || '');
    setGender(ben.gender || '');
    setAddressStreet(ben.address_street || '');
    setAddressCity(ben.address_city || '');
    setAddressState(ben.address_state || '');
    setAddressZip(ben.address_zip || '');
    setAddressLine2(ben.address_line2 || '');
    setSsnLastFour(ben.ssn_last_four || '');
    setNotes(ben.notes || '');
    setAvatarColor(ben.avatar_color || avatarColors[0]);
    setPhotoPreview(ben.photo_url || null);
    setPhotoFile(null);
    setShowAddModal(true);
  };

  const handleSendInvitation = async (beneficiaryId) => {
    setSendingInvite(beneficiaryId);
    try {
      await axios.post(`${API_URL}/beneficiaries/${beneficiaryId}/invite`, {}, getAuthHeaders());
      // toast removed
      fetchData();
    } catch (error) {
      console.error('Invite error:', error);
      toast.error(error.response?.data?.detail || 'Failed to send invitation');
    } finally {
      setSendingInvite(null);
    }
  };

  const handleCopyLink = async (ben) => {
    if (!ben.invitation_token) {
      toast.error('No invitation link available — send an invite first');
      return;
    }
    const link = `${window.location.origin}/accept-invitation/${ben.invitation_token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(ben.id);
      // toast removed
      setTimeout(() => setCopiedLink(null), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleDelete = async (beneficiaryId) => {
    if (!window.confirm('Are you sure you want to remove this beneficiary?')) return;
    
    try {
      await axios.delete(`${API_URL}/beneficiaries/${beneficiaryId}`, getAuthHeaders());
      setBeneficiaries(beneficiaries.filter(b => b.id !== beneficiaryId));
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to remove beneficiary');
    }
  };

  const handleToggleSection = async (beneficiaryId, section, currentValue) => {
    if (!estate) return;
    setSavingPerms(beneficiaryId + section);
    const current = sectionPerms[beneficiaryId] || Object.fromEntries(Object.keys(SECTION_LABELS).map(s => [s, true]));
    const updated = { ...current, [section]: !currentValue };
    try {
      await axios.put(`${API_URL}/estate/${estate.id}/section-permissions`, {
        beneficiary_id: beneficiaryId,
        sections: updated,
      }, getAuthHeaders());
      setSectionPerms(prev => ({ ...prev, [beneficiaryId]: updated }));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update permissions');
    } finally {
      setSavingPerms(null);
    }
  };

  const handleSetPrimary = async (beneficiaryId) => {
    setSettingPrimary(beneficiaryId);
    try {
      await axios.put(`${API_URL}/beneficiaries/${beneficiaryId}/set-primary`, {}, getAuthHeaders());
      toast.success('Primary beneficiary designated');
      setShowPrimaryDisclaimer(null);
      setChangingPrimary(false);
      fetchData();
      // Only show the getting-started popup if user hasn't already graduated onboarding
      try {
        const prog = await axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders());
        if (!prog.data?.already_graduated) setShowPrimaryPopup(true);
      } catch { /* skip popup on error */ }
    } catch (error) {
      console.error('Set primary error:', error);
      toast.error(error.response?.data?.detail || 'Failed to designate primary beneficiary');
    } finally {
      setSettingPrimary(null);
    }
  };

  const handleAccessRequest = async (requestId, action) => {
    setHandlingRequest(requestId);
    try {
      await axios.put(`${API_URL}/beneficiaries/access-requests/${requestId}`, { action }, getAuthHeaders());
      toast.success(`Request ${action}d`);
      fetchData();
    } catch (error) {
      console.error('Access request error:', error);
      toast.error(error.response?.data?.detail || `Failed to ${action} request`);
    } finally {
      setHandlingRequest(null);
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
    setAddressLine2('');
    setSsnLastFour('');
    setNotes('');
    setAvatarColor(avatarColors[0]);
    setPhotoFile(null);
    setPhotoPreview(null);
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

  const primaryBeneficiary = beneficiaries.find(b => b.is_primary);

  // Drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = useCallback(async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = beneficiaries.findIndex(b => b.id === active.id);
    const newIdx = beneficiaries.findIndex(b => b.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(beneficiaries, oldIdx, newIdx);
    setBeneficiaries(reordered);
    try {
      await axios.put(`${API_URL}/beneficiaries/reorder/${estate?.id}`, {
        ordered_ids: reordered.map(b => b.id),
      }, getAuthHeaders());
    } catch { toast.error('Failed to save order'); }
  }, [beneficiaries, estate?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-[var(--s)]" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48 bg-[var(--s)] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="beneficiaries-page"
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

      <SectionLockedOverlay sectionId="beneficiaries">

      {/* Desktop: Tree Left + Tiles Right / Mobile: Tree Top + Tiles Below */}
      {beneficiaries.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Users className="w-16 h-16 mx-auto text-[#64748b] mb-4" />
            <h3 className="text-xl font-semibold text-[var(--t)] mb-2">No beneficiaries yet</h3>
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
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,2fr)_3fr] gap-5">
          {/* LEFT: Family Tree */}
          <div className="glass-card p-4 rounded-2xl" data-testid="family-tree-panel">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.12)' }}>
                <Users className="w-3.5 h-3.5 text-[#d4af37]" />
              </div>
              <h3 className="text-sm font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>{user?.first_name || user?.name?.split(' ')[0] || 'My'}'s Estate Tree</h3>
            </div>
            <FamilyTree
              user={user}
              beneficiaries={beneficiaries}
              beneficiaryEstates={benEstates}
              onSelectBeneficiary={(ben) => {
                openEditModal(ben);
              }}
              onUploadPhoto={(benId) => {
                setQuickUploadBenId(benId);
                setTimeout(() => quickFileRef.current?.click(), 50);
              }}
            />
            {benEstates.length > 0 && (
              <p className="text-[9px] text-[var(--t5)] text-center mt-1">
                Blue nodes = estates where you're a beneficiary (click to view)
              </p>
            )}
          </div>

          {/* RIGHT: Tile Stack (primary first, then age-sorted) */}
          <div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={beneficiaries.map(b => b.id)} strategy={rectSortingStrategy}>
            <div className="space-y-3" data-testid="beneficiary-tiles">
              {beneficiaries.map((ben) => (
                <SortableCard key={ben.id} id={ben.id}>
                <Card className="glass-card group" data-testid={`beneficiary-${ben.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="drag-handle cursor-grab active:cursor-grabbing flex items-center text-[var(--t5)] hover:text-[var(--t3)] transition-colors touch-none" data-testid={`drag-handle-${ben.id}`}>
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <AvatarCircle
                          photo={ben.photo_url}
                          initials={ben.initials || (ben.first_name && ben.last_name 
                            ? (ben.first_name[0] + ben.last_name[0]).toUpperCase()
                            : ben.name?.split(' ').map(n => n[0]).join('').toUpperCase())}
                          color={ben.avatar_color}
                          size={60}
                          isPrimary={ben.is_primary}
                          onUpload={() => {
                            setQuickUploadBenId(ben.id);
                            setTimeout(() => quickFileRef.current?.click(), 50);
                          }}
                          testId={`ben-avatar-${ben.id}`}
                        />
                    <div>
                      <h3 className="text-[var(--t)] font-semibold text-lg">{ben.name}</h3>
                      <p className="text-[#d4af37] text-sm">{ben.relation}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {ben.is_stub && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--ywbg)] text-[var(--yw)] mr-1">NEEDS INFO</span>
                    )}
                    {ben.is_primary && (
                      <span className="flex items-center gap-1 text-[9px] font-bold whitespace-nowrap px-2 py-1 rounded-md" style={{ background: 'rgba(34,201,147,0.15)', color: '#22C993', border: '1px solid rgba(34,201,147,0.3)' }} data-testid={`primary-badge-${ben.id}`}>
                        <Shield className="w-3 h-3 flex-shrink-0" /> PRIMARY
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[#3b82f6] transition-opacity"
                      onClick={() => openEditModal(ben)}
                      data-testid={`edit-beneficiary-${ben.id}`}
                      aria-label={`Edit ${ben.first_name} ${ben.last_name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[#ef4444] transition-opacity"
                      onClick={() => handleDelete(ben.id)}
                      data-testid={`delete-beneficiary-${ben.id}`}
                      aria-label={`Delete ${ben.first_name} ${ben.last_name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2 text-sm">
                  {ben.is_stub && (
                    <button
                      onClick={() => openEditModal(ben)}
                      className="w-full text-left p-2.5 rounded-lg text-xs font-bold text-[var(--yw)] mb-1 transition-transform duration-150 active:scale-[0.98]"
                      style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
                      data-testid={`complete-stub-${ben.id}`}
                    >
                      Tap to complete enrollment — add name, email, and details
                    </button>
                  )}
                  {ben.email && (
                  <div className="flex items-center gap-2 text-[#94a3b8]">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{ben.email}</span>
                  </div>
                  )}
                  {ben.phone && (
                    <div className="flex items-center gap-2 text-[#94a3b8]">
                      <Phone className="w-4 h-4" />
                      <span>{ben.phone}</span>
                    </div>
                  )}
                  {ben.date_of_birth && (
                    <div className="flex items-center gap-2 text-[#94a3b8]">
                      <Calendar className="w-4 h-4" />
                      <span>{ben.date_of_birth.split('T')[0].replace(/(\d{4})-(\d{2})-(\d{2})/, (_, y, m, d) => `${parseInt(m)}/${parseInt(d)}/${y}`)}</span>
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
                      <div className="mt-2 pt-2 border-t border-[var(--b)] space-y-1 text-xs text-[#94a3b8]">
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
                
                <div className="mt-4 pt-3 border-t border-[var(--b)]">
                  {/* Section Access Permissions — what this beneficiary sees after transition */}
                  <div className="mb-3">
                    <p className="text-[10px] text-[var(--t5)] uppercase tracking-wider font-bold mb-2">Post-Transition Access</p>
                    <div className="space-y-1.5">
                      {Object.entries(SECTION_LABELS).map(([key, label]) => {
                        const perms = sectionPerms[ben.id] || {};
                        const enabled = perms[key] !== undefined ? perms[key] : true;
                        return (
                          <div key={key} className="flex items-center justify-between py-1">
                            <span className="text-xs text-[var(--t3)]">{label}</span>
                            <Switch
                              checked={enabled}
                              onCheckedChange={() => handleToggleSection(ben.id, key, enabled)}
                              disabled={savingPerms === ben.id + key}
                              data-testid={`perm-${key}-${ben.id}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    {getInvitationStatusBadge(ben)}
                  </div>
                  
                  {ben.invitation_status !== 'accepted' && !ben.user_id && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[var(--b)] text-[var(--t3)] text-xs w-full"
                        onClick={() => handleCopyLink(ben)}
                        data-testid={`copy-invite-link-${ben.id}`}
                      >
                        {copiedLink === ben.id ? (
                          <><Check className="w-3 h-3 mr-1.5 text-[#10b981]" /> Copied</>
                        ) : (
                          <><Copy className="w-3 h-3 mr-1.5" /> Copy Link</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        className="gold-button text-xs w-full"
                        onClick={() => handleSendInvitation(ben.id)}
                        disabled={sendingInvite === ben.id}
                        data-testid={`send-invite-${ben.id}`}
                      >
                        {sendingInvite === ben.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <><Send className="w-3 h-3 mr-1.5 flex-shrink-0" /> <span className="truncate">{ben.invitation_status === 'sent' ? 'Resend' : 'Invite'}</span></>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Designate Primary */}
                  {ben.is_primary && (
                    <button
                      className="w-full mt-2 text-[10px] text-[var(--t5)] hover:text-[#F59E0B] transition-colors"
                      onClick={() => setChangingPrimary(true)}
                      data-testid={`change-primary-${ben.id}`}
                    >
                      Change Primary Beneficiary
                    </button>
                  )}
                  {!ben.is_primary && !ben.is_stub && (
                    <Button
                      size="sm"
                      variant="outline"
                      className={`w-full mt-2 text-xs border-[var(--b)] ${(primaryBeneficiary && !changingPrimary) ? 'text-[var(--t5)] opacity-50 cursor-not-allowed' : 'text-[#22C993] hover:bg-[#22C993]/10'}`}
                      onClick={() => setShowPrimaryDisclaimer(ben)}
                      disabled={!!primaryBeneficiary && !changingPrimary}
                      data-testid={`designate-primary-${ben.id}`}
                    >
                      <Shield className="w-3 h-3 mr-1.5" /> {(primaryBeneficiary && !changingPrimary) ? 'Primary Already Designated' : 'Designate as Primary'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            </SortableCard>
          ))}
        </div>
        </SortableContext>
        </DndContext>
          </div>
        </div>
      )}

      {/* Add/Edit Beneficiary Panel */}
      <SlidePanel
        open={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingBeneficiary(null); resetForm(); }}
        title={editingBeneficiary ? 'Edit Beneficiary' : 'Add Beneficiary'}
        subtitle={editingBeneficiary ? 'Update the details for this beneficiary' : 'Add a family member or loved one to your estate plan'}
      >
          
          <div className="space-y-6 py-4">
            {/* Avatar Preview — click to pick/crop photo */}
            <div className="flex justify-center">
              <PhotoPicker
                currentPhoto={photoPreview}
                onPhotoSelected={(file, previewUrl) => {
                  setPhotoFile(file);
                  setPhotoPreview(previewUrl);
                }}
                onRemove={() => { setPhotoFile(null); setPhotoPreview(null); }}
              />
            </div>
            <p className="text-center text-xs text-[#64748b]">Tap to take or choose a photo</p>
            
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
                  <Label className="text-[#94a3b8]">First Name <span className="text-red-400">*</span></Label>
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
                  <Label className="text-[#94a3b8]">Last Name <span className="text-red-400">*</span></Label>
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
                    <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
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
                  <Label className="text-[#94a3b8]">Relationship <span className="text-red-400">*</span></Label>
                  <Select value={relation} onValueChange={setRelation}>
                    <SelectTrigger className="input-field" data-testid="beneficiary-relation-select">
                      <SelectValue placeholder="Select relationship" />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
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
                    <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">Date of Birth</Label>
                <DateMaskInput
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
                <Label className="text-[#94a3b8]">Email Address <span className="text-red-400">*</span></Label>
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
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                    let formatted = digits;
                    if (digits.length > 6) formatted = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
                    else if (digits.length > 3) formatted = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
                    else if (digits.length > 0) formatted = `(${digits}`;
                    setPhone(formatted);
                  }}
                  placeholder="(123) 456-7890"
                  className="input-field"
                />
              </div>
            </div>

            {/* Address Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-[#d4af37] uppercase tracking-wide">Address</h3>
              
              <div className="space-y-1.5">
                <Label className="text-[#94a3b8]">Street Address</Label>
                <AddressAutocomplete
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  onSelect={({ street, city, state, zip }) => {
                    setAddressStreet(street);
                    setAddressCity(city);
                    setAddressState(state);
                    setAddressZip(zip);
                  }}
                  placeholder="Start typing an address..."
                  className="input-field"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[#94a3b8]">Apt, Suite, Unit (optional)</Label>
                <Input
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="Apt 4B, Suite 200, etc."
                  className="input-field"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[#94a3b8] text-xs">City</Label>
                  <Input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} placeholder="City" className="input-field" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[#94a3b8] text-xs">State</Label>
                  <Select value={addressState} onValueChange={setAddressState}>
                    <SelectTrigger className="input-field">
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)] max-h-48">
                      {usStates.map((st) => (
                        <SelectItem key={st} value={st}>{st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[#94a3b8] text-xs">ZIP</Label>
                  <Input value={addressZip} onChange={(e) => setAddressZip(e.target.value)} placeholder="ZIP" className="input-field" maxLength={10} />
                </div>
              </div>

              <div className="p-2.5 rounded-xl" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.12)' }}>
                <p className="text-[#d4af37] text-[11px] leading-relaxed flex items-start gap-2">
                  <Shield className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  Address is encrypted and stored securely. It's only used for estate law analysis and is never shared.
                </p>
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
          
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--b)]">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddModal(false);
                setEditingBeneficiary(null);
                resetForm();
              }}
              className="border-[var(--b)] text-[var(--t)]"
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
      </SlidePanel>

      {/* Access Requests Section */}
      {accessRequests.length > 0 && (
        <Card className="glass-card" data-testid="access-requests-section">
          <CardContent className="p-5">
            <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
              Pending Access Requests
            </h3>
            <p className="text-xs text-[var(--t5)] mb-4">
              These individuals are requesting to be added as beneficiaries. As the designated approver, only you can grant or deny access.
            </p>
            <div className="space-y-3">
              {accessRequests.map(req => (
                <div key={req.id} className="p-4 rounded-xl flex items-center justify-between" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }} data-testid={`access-request-${req.id}`}>
                  <div>
                    <p className="text-sm font-bold text-[var(--t)]">{req.requester_name}</p>
                    <p className="text-xs text-[var(--t5)]">{req.requester_email}</p>
                    {req.message && <p className="text-xs text-[var(--t4)] mt-1 italic">"{req.message}"</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      className="text-xs bg-[#22C993] hover:bg-[#1db882] text-white"
                      onClick={() => handleAccessRequest(req.id, 'approve')}
                      disabled={handlingRequest === req.id}
                      data-testid={`approve-request-${req.id}`}
                    >
                      {handlingRequest === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><UserCheck className="w-3 h-3 mr-1" /> Approve</>}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-[var(--rd2)] text-[var(--rd2)]"
                      onClick={() => handleAccessRequest(req.id, 'deny')}
                      disabled={handlingRequest === req.id}
                      data-testid={`deny-request-${req.id}`}
                    >
                      <XCircle className="w-3 h-3 mr-1" /> Deny
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Primary Beneficiary Disclaimer Modal */}
      <Dialog open={!!showPrimaryDisclaimer} onOpenChange={(open) => !open && setShowPrimaryDisclaimer(null)}>
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[var(--t)] text-xl flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              <Shield className="w-5 h-5 text-[#22C993]" />
              Designate Primary Beneficiary
            </DialogTitle>
          </DialogHeader>
          {showPrimaryDisclaimer && (
            <div className="space-y-4 py-2" data-testid="primary-disclaimer-modal">
              <div className="p-4 rounded-xl" style={{ background: 'rgba(34,201,147,0.06)', border: '1px solid rgba(34,201,147,0.15)' }}>
                <p className="text-sm text-[var(--t3)] leading-relaxed">
                  You are about to designate <strong className="text-[#22C993]">{showPrimaryDisclaimer.name}</strong> as the primary beneficiary of your estate.
                </p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <h4 className="text-sm font-bold text-[#F59E0B] flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  Important Disclaimer
                </h4>
                <ul className="text-xs text-[var(--t4)] space-y-2 list-disc pl-4">
                  <li>This person will serve as the <strong>trustee</strong> of your estate after your transition.</li>
                  <li>They will have the <strong>sole authority</strong> to approve or deny new beneficiaries who request access to your estate after you have passed.</li>
                  <li>No other beneficiary will have this power unless you change this designation.</li>
                  <li>You can change your primary beneficiary at any time while your estate is active.</li>
                </ul>
              </div>
              <p className="text-xs text-[var(--t5)] italic text-center">
                By proceeding, you confirm that you understand the responsibilities being granted to this individual.
              </p>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 border-[var(--b)] text-white"
                  onClick={() => setShowPrimaryDisclaimer(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-[#22C993] hover:bg-[#1db882] text-white font-bold"
                  onClick={() => handleSetPrimary(showPrimaryDisclaimer.id)}
                  disabled={settingPrimary === showPrimaryDisclaimer.id}
                  data-testid="confirm-primary-btn"
                >
                  {settingPrimary === showPrimaryDisclaimer.id ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Designating...</>
                  ) : (
                    <><Shield className="w-4 h-4 mr-2" /> Confirm Designation</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </SectionLockedOverlay>
      {showPrimaryPopup && (
        <ReturnPopup step="primary" onReturn={() => { setShowPrimaryPopup(false); navigate('/dashboard'); }} />
      )}
      {/* Hidden file input for quick avatar photo upload */}
      <input
        ref={quickFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && quickUploadBenId) {
            handleQuickPhotoUpload(file, quickUploadBenId);
            setQuickUploadBenId(null);
          }
          e.target.value = '';
        }}
      />
    </div>
  );
};

export default BeneficiariesPage;
