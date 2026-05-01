import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { cachedGet } from '../utils/apiCache';
import { formatPhoneUS } from '../utils/phoneFormat';
import { getOfflineMode } from '../offline/featureFlag';
import { getLocalBeneficiaries, upsertLocalBeneficiaries, updateLocalBeneficiary, deleteLocalBeneficiary, insertLocalBeneficiary, generateTempId } from '../offline/repos/beneficiariesRepo';
import { prefetchPhotosFrom } from '../offline/prefetchPhotos';
import { enqueue as enqueueOutbox } from '../offline/outbox';
import { ReturnPopup } from '../components/GuidedActivation';
import { useDraftState } from '../hooks/useDraftState';
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
  ArrowLeft,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { toast } from '../utils/toast';
import { Switch } from '../components/ui/switch';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';
import { PhotoPicker } from '../components/PhotoPicker';
import { AvatarCircle } from '../components/AvatarCircle';
import AddressAutocomplete from '../components/AddressAutocomplete';
import DateMaskInput from '../components/DateMaskInput';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import SlidePanel from '../components/SlidePanel';
import FamilyTree from '../components/FamilyTree';
import { API_URL } from '../config';

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

// Succession hierarchy labels — position 0 = Primary, 1 = Secondary, etc.
const SUCCESSION_LABELS = [
  'Primary', 'Secondary', 'Tertiary', 'Quaternary', 'Quinary',
  'Senary', 'Septenary', 'Octonary', 'Nonary', 'Denary',
];
const getSuccessionLabel = (index) => SUCCESSION_LABELS[index] || `#${index + 1}`;
const SUCCESSION_COLORS = {
  0: { bg: 'rgba(34,201,147,0.15)', color: '#22C993', border: '1px solid rgba(34,201,147,0.3)' },
  1: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' },
  2: { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' },
};

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
  const location = useLocation();
  const fromGettingStarted = location.state?.fromGettingStarted;
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  // Draft persistence — Beneficiaries Add/Edit modal. Per-estate keyed.
  // Sensitive (ssnLastFour) and binary (photoFile, photoPreview) fields
  // are NOT persisted — see exclusions below. Read estate id sync from
  // localStorage so the draft key is stable on first render.
  const benEstateId = (typeof localStorage !== 'undefined' && localStorage.getItem('selected_estate_id')) || null;
  const benDraftBase = benEstateId ? `ben_form:${benEstateId}` : null;
  const [showAddModal, setShowAddModal, clearShowAddModalDraft] = useDraftState(benDraftBase ? `${benDraftBase}:open` : null, false);
  const [showPrimaryPopup, setShowPrimaryPopup] = useState(false);
  const [showBenAddedPopup, setShowBenAddedPopup] = useState(false);
  const [adding, setAdding] = useState(false);
  // Synchronous double-submit guard — see handleAddOrEdit. iter_105
  // pattern fix; React's setAdding async state propagation lets a rapid
  // second tap slip past disabled={adding} on the gold button.
  const addInFlightRef = useRef(false);
  const [sendingInvite, setSendingInvite] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  const [editingBeneficiary, setEditingBeneficiary, clearEditingBenDraft] = useDraftState(benDraftBase ? `${benDraftBase}:editing` : null, null);
  const [copiedLink, setCopiedLink] = useState(null);
  const [treeAnimKey, setTreeAnimKey] = useState(0);
  
  // Form state - enhanced demographics. Persisted per-estate; clears on
  // save success and explicit cancel via clearBenDraft().
  const [firstName, setFirstName, clearFirstNameDraft] = useDraftState(benDraftBase ? `${benDraftBase}:firstName` : null, '');
  const [middleName, setMiddleName, clearMiddleNameDraft] = useDraftState(benDraftBase ? `${benDraftBase}:middleName` : null, '');
  const [lastName, setLastName, clearLastNameDraft] = useDraftState(benDraftBase ? `${benDraftBase}:lastName` : null, '');
  const [suffix, setSuffix, clearSuffixDraft] = useDraftState(benDraftBase ? `${benDraftBase}:suffix` : null, '');
  const [email, setEmail, clearEmailDraft] = useDraftState(benDraftBase ? `${benDraftBase}:email` : null, '');
  const [phone, setPhone, clearPhoneDraft] = useDraftState(benDraftBase ? `${benDraftBase}:phone` : null, '');
  const [relation, setRelation, clearRelationDraft] = useDraftState(benDraftBase ? `${benDraftBase}:relation` : null, '');
  const [dateOfBirth, setDateOfBirth, clearDOBDraft] = useDraftState(benDraftBase ? `${benDraftBase}:dob` : null, '');
  const [gender, setGender, clearGenderDraft] = useDraftState(benDraftBase ? `${benDraftBase}:gender` : null, '');
  const [addressStreet, setAddressStreet, clearStreetDraft] = useDraftState(benDraftBase ? `${benDraftBase}:street` : null, '');
  const [addressCity, setAddressCity, clearCityDraft] = useDraftState(benDraftBase ? `${benDraftBase}:city` : null, '');
  const [addressState, setAddressState, clearStateDraft] = useDraftState(benDraftBase ? `${benDraftBase}:state` : null, '');
  const [addressZip, setAddressZip, clearZipDraft] = useDraftState(benDraftBase ? `${benDraftBase}:zip` : null, '');
  const [addressLine2, setAddressLine2, clearLine2Draft] = useDraftState(benDraftBase ? `${benDraftBase}:line2` : null, '');
  // ssnLastFour is intentionally NOT persisted — sensitive PII. The
  // user has to re-enter the last 4 of SSN on resume. avatarColor is
  // cosmetic and re-randomizes; photo file is binary and not eligible
  // for sessionStorage.
  const [ssnLastFour, setSsnLastFour] = useState('');
  const [notes, setNotes, clearNotesDraft] = useDraftState(benDraftBase ? `${benDraftBase}:notes` : null, '');
  // Aggregator: clears all persisted draft fields. Called on save
  // success and the X / Cancel paths in the Add/Edit modal. Also
  // clears the :open flag so a canceled draft doesn't leave the
  // modal stuck "open" in storage (verified gap from iter 113).
  const clearBenDraft = () => {
    clearShowAddModalDraft();
    clearEditingBenDraft();
    clearFirstNameDraft();
    clearMiddleNameDraft();
    clearLastNameDraft();
    clearSuffixDraft();
    clearEmailDraft();
    clearPhoneDraft();
    clearRelationDraft();
    clearDOBDraft();
    clearGenderDraft();
    clearStreetDraft();
    clearCityDraft();
    clearStateDraft();
    clearZipDraft();
    clearLine2Draft();
    clearNotesDraft();
  };
  const [avatarColor, setAvatarColor] = useState(avatarColors[0]);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [, setUploadingPhoto] = useState(null);
  const [accessRequests, setAccessRequests] = useState([]);
  const [handlingRequest, setHandlingRequest] = useState(null);
  const [sectionPerms, setSectionPerms] = useState({});
  const [savingPerms, setSavingPerms] = useState(null);
  const [benEstates, setBenEstates] = useState([]);
  const [quickUploadBenId, setQuickUploadBenId] = useState(null);
  const quickFileRef = React.useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name } for admin delete dialog
  const [expandedTiles, setExpandedTiles] = useState(new Set());
  const isAdmin = user?.role === 'admin';
  const autoOpenedRef = useRef(false);

  const SECTION_LABELS = {
    messages: 'Milestone Messages (MM)',
    guardian: 'Estate Guardian AI (EGA)',
    vault: 'Secure Document Vault (SDV)',
    checklist: 'Immediate Action Checklist (IAC)',
    ffn: 'Family & Friends Notification (FFN)',
    digital_wallet: 'Digital Access Vault (DAV)',
    dts: 'Designated Trustee Services (DTS)',
  };

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh on reconnect so the user doesn't have to manually
  // navigate off-and-back after airplane mode. Also re-paint from the
  // local mirror when going offline so the list survives any render
  // that might otherwise clear it (iOS PWA lifecycle quirks, SW cache
  // races, etc.). Apr 24, 2026 airplane-mode regression fix.
  useEffect(() => {
    const onOnline = () => { fetchData(); };
    const onOffline = () => { fetchData(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open add form when arriving from Getting Started with no beneficiaries
  useEffect(() => {
    if (!loading && fromGettingStarted && !autoOpenedRef.current && beneficiaries.length === 0 && estate) {
      autoOpenedRef.current = true;
      setShowAddModal(true);
    }
  }, [loading, fromGettingStarted, beneficiaries.length, estate]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    // PHASE 1 — Read-through. The offline flag formerly gated this
    // behavior; as of Apr 24, 2026 we always read from and write to
    // the local Dexie mirror so iOS installed-PWA re-mounts survive
    // airplane-mode toggling without needing any opt-in.

    // ── Hard airplane-mode short-circuit ──────────────────────────────
    // Apr 24, 2026 fix: when the device is offline we must NEVER let the
    // server fetch run, regardless of the offline flag. Previously, when
    // flag='off' or 'shadow', fetchData would fall through to axios on
    // a re-trigger (focus, route-bounce, lifecycle), axios would throw,
    // the catch handler would fire toast.error('Failed to load…') and —
    // crucially — `setBeneficiaries(bensRes.data)` up-stream might have
    // run against a stale/partial response and wiped the visible list.
    // Short-circuit here so every possible trigger of fetchData while
    // offline paints from local mirror (if any) and otherwise simply
    // preserves whatever state is already on screen.
    const isDeviceOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isDeviceOffline) {
      try {
        // Even when flag='off' we try the mirror — it will no-op and
        // return [] if nothing was ever cached, which is harmless and
        // lets the UI keep the state it already had.
        const localEstates = await import('../offline/repos/estatesRepo').then(m => m.getLocalEstates().catch(() => []));
        if (Array.isArray(localEstates) && localEstates.length > 0) {
          const savedId = localStorage.getItem('selected_estate_id');
          const ownedLocal = localEstates.filter(e => e.user_role_in_estate === 'owner' || (!e.user_role_in_estate && !e.is_beneficiary_estate));
          const selectedLocal = (savedId && ownedLocal.find(e => e.id === savedId)) || ownedLocal[0];
          if (selectedLocal) {
            setEstate(selectedLocal);
            const bLocal = localEstates.filter(e => e.user_role_in_estate === 'beneficiary' || e.is_beneficiary_estate);
            setBenEstates(bLocal);
            const localBens = await getLocalBeneficiaries(selectedLocal.id);
            if (localBens.length > 0) setBeneficiaries(localBens);
          }
        }
      } catch { /* best-effort; keep whatever is on screen */ }
      setLoading(false);
      return;
    }

    try {
      const estatesRes = await cachedGet(axios, `${API_URL}/estates`, getAuthHeaders());
      const allEstates = estatesRes.data;
      // Mirror the estates list unconditionally so the airplane-mode
      // short-circuit above can rehydrate `estate` + `benEstates` even
      // for users who never flipped the offline flag to 'on'.
      try {
        const { upsertLocalEstates } = await import('../offline/repos/estatesRepo');
        upsertLocalEstates(allEstates).catch(() => {});
      } catch { /* non-fatal */ }
      // Find the owned estate (benefactor context)
      const ownedEstate = (() => {
        const owned = allEstates.filter(e => e.user_role_in_estate === 'owner' || (!e.user_role_in_estate && !e.is_beneficiary_estate));
        const savedId = localStorage.getItem('selected_estate_id');
        return (savedId && owned.find(e => e.id === savedId)) || owned[0];
      })();
      // Beneficiary estates (for family tree)
      const bEstates = allEstates.filter(e => e.user_role_in_estate === 'beneficiary' || e.is_beneficiary_estate);
      setBenEstates(bEstates);
      if (ownedEstate) {
        setEstate(ownedEstate);

        // ── Paint from local cache FIRST for instant feedback, then
        // fetch from server and reconcile. Flag-agnostic: even if the
        // user has never enabled offline mode, if the mirror happens
        // to have data (e.g. from an earlier session with the flag
        // on, or from this session's previous page load), we'll paint
        // from it first. If there's no local data yet, the block is
        // harmless — the user sees the same loading spinner they would
        // have seen before.
        try {
          const local = await getLocalBeneficiaries(ownedEstate.id);
          if (local.length > 0) {
            setBeneficiaries(local);
            setLoading(false); // unblock the UI immediately
          }
        } catch { /* non-fatal */ }

        const [bensRes, requestsRes, permsRes] = await Promise.all([
          axios.get(`${API_URL}/beneficiaries/${ownedEstate.id}`, getAuthHeaders()),
          axios.get(`${API_URL}/beneficiaries/access-requests/${ownedEstate.id}`, getAuthHeaders()).catch(() => ({ data: [] })),
          axios.get(`${API_URL}/estate/${ownedEstate.id}/section-permissions`, getAuthHeaders()).catch(() => ({ data: [] })),
        ]);
        // Guard against empty-list clobbering: if the response is empty
        // BUT we already have populated state, keep the visible list.
        // That covers SW returning a cached empty response during an
        // airplane-mode transition. A legitimate "all beneficiaries
        // deleted" case is still handled because we enter this branch
        // only when `navigator.onLine === true` and a real server
        // response came back empty, which is the same condition online
        // users expect to trigger the empty state. The guard only kicks
        // in when we were ALREADY showing rows — a transient empty
        // response during airplane-mode transitions is the only thing
        // that violates that invariant.
        if (Array.isArray(bensRes.data) && (bensRes.data.length > 0 || beneficiaries.length === 0)) {
          setBeneficiaries(bensRes.data);
        }
        setAccessRequests(requestsRes.data || []);
        const permsMap = {};
        for (const p of (permsRes.data || [])) {
          permsMap[p.beneficiary_id] = p.sections;
        }
        setSectionPerms(permsMap);

        // ── Always mirror the server's canonical list into IndexedDB
        // (Apr 24, 2026 hardening). Previously this was gated on
        // `mode !== 'off'`, but iOS installed PWAs can hard re-mount
        // the page on airplane-mode toggle, wiping React state back to
        // `useState([])` — which left flag-off users staring at the
        // empty "Add your first beneficiary" CTA. Always populating
        // the mirror guarantees the offline short-circuit at the top
        // of fetchData has something to rehydrate from.
        upsertLocalBeneficiaries(ownedEstate.id, bensRes.data).catch(() => {});
        // Pre-warm every photo into the SW IMAGE_CACHE while online so
        // airplane-mode visits paint with real avatars instead of
        // broken-image placeholders.
        prefetchPhotosFrom(bensRes.data);
        prefetchPhotosFrom(allEstates);
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
    if (addInFlightRef.current) return;
    addInFlightRef.current = true;
    if (!firstName) { toast.error('First Name is required'); addInFlightRef.current = false; return; }
    if (!lastName) { toast.error('Last Name is required'); addInFlightRef.current = false; return; }
    if (!email) { toast.error('Email Address is required'); addInFlightRef.current = false; return; }
    if (email && !/\S+@\S+\.\S+/.test(email)) { toast.error('Please enter a valid email address'); addInFlightRef.current = false; return; }
    if (!relation) { toast.error('Relationship is required'); addInFlightRef.current = false; return; }

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
        // Offline write-through for EDIT — flag-agnostic. When we're
        // offline, apply the patch locally, enqueue the PUT in the
        // outbox for replay on reconnect, and short-circuit.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          await updateLocalBeneficiary(editingBeneficiary.id, payload);
          await enqueueOutbox({
            entity_type: 'beneficiary',
            entity_id: editingBeneficiary.id,
            method: 'PUT',
            url: `/beneficiaries/${editingBeneficiary.id}`,
            body: payload,
          });
          toast.success('Change queued — will sync when you reconnect.');
          setShowAddModal(false);
          setEditingBeneficiary(null);
          resetForm();
          await fetchData();
          return;
        }
        const res = await axios.put(`${API_URL}/beneficiaries/${editingBeneficiary.id}`, payload, getAuthHeaders());
        if (photoRemoved && !photoFile) {
          await axios.delete(`${API_URL}/beneficiaries/${editingBeneficiary.id}/photo`, getAuthHeaders());
        }
        if (photoFile) await uploadPhoto(editingBeneficiary.id);
        // If email changed, prompt user to resend invite
        if (res.data?.email_changed) {
          setShowAddModal(false);
          setEditingBeneficiary(null);
          resetForm();
          await fetchData();
          // Ask if they want to resend the invite
          const benName = `${payload.first_name} ${payload.last_name}`.trim();
          const shouldResend = window.confirm(
            `You changed ${benName}'s email to ${payload.email}.\n\nWould you like to send an invitation to this new email address?`
          );
          if (shouldResend) {
            const benId = res.data.id || editingBeneficiary.id;
            await handleSendInvitation(benId);
          }
          return;
        }
      } else {
        // Offline write-through for CREATE — flag-agnostic. When we're
        // offline, generate a client-side temp id, insert the
        // beneficiary locally so the UI reflects it immediately, and
        // enqueue the POST for replay on reconnect. After drain, the
        // outbox swaps the temp id for the server's canonical id.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          const tempId = generateTempId();
          const localRow = {
            ...payload,
            id: tempId,
            estate_id: estate?.id,
            created_at: new Date().toISOString(),
          };
          await insertLocalBeneficiary(localRow);
          await enqueueOutbox({
            entity_type: 'beneficiary',
            entity_id: tempId,
            method: 'POST',
            url: '/beneficiaries',
            body: payload,
          });
          toast.success('New beneficiary queued — will sync when you reconnect.');
          setShowAddModal(false);
          setEditingBeneficiary(null);
          resetForm();
          await fetchData();
          setAdding(false);
          addInFlightRef.current = false;
          return;
        }
        const res = await axios.post(`${API_URL}/beneficiaries`, payload, getAuthHeaders());
        if (photoFile && res.data?.id) await uploadPhoto(res.data.id);
        if (res.data?.auto_invited) {
          toast.success('Invitation email sent');
        }
        // Show return popup when adding beneficiary from Getting Started flow
        if (fromGettingStarted) {
          setShowAddModal(false);
          setEditingBeneficiary(null);
          resetForm();
          await fetchData();
          setShowBenAddedPopup(true);
          setAdding(false);
          addInFlightRef.current = false;
          return;
        }
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
      addInFlightRef.current = false;
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

  const handleDelete = async (beneficiaryId, deleteFromAll = false) => {
    // For admin users, show the custom dialog first (handled by onClick)
    // For benefactors, use simple confirm
    if (!isAdmin) {
      if (!window.confirm('Are you sure you want to permanently delete this beneficiary? This cannot be undone.')) return;
    }

    try {
      const params = deleteFromAll ? '?delete_from_all=true' : '';
      // Offline write-through for DELETE — flag-agnostic. When offline,
      // remove locally, enqueue the DELETE for replay, and short-circuit.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await deleteLocalBeneficiary(beneficiaryId);
        await enqueueOutbox({
          entity_type: 'beneficiary',
          entity_id: beneficiaryId,
          method: 'DELETE',
          url: `/beneficiaries/${beneficiaryId}${params}`,
          body: null,
        });
        setBeneficiaries(beneficiaries.filter(b => b.id !== beneficiaryId));
        toast.success('Deletion queued — will sync when you reconnect.');
        setDeleteTarget(null);
        return;
      }
      await axios.delete(`${API_URL}/beneficiaries/${beneficiaryId}${params}`, getAuthHeaders());
      setBeneficiaries(beneficiaries.filter(b => b.id !== beneficiaryId));
      toast.success('Beneficiary permanently deleted');
      setDeleteTarget(null);
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(error.response?.data?.detail || 'Failed to delete beneficiary');
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
    clearBenDraft();
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
    setPhotoRemoved(false);
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
    // Notify if the primary beneficiary changed
    const wasPrimary = beneficiaries[0];
    const nowPrimary = reordered[0];
    if (wasPrimary?.id !== nowPrimary?.id) {
      toast.success(`${nowPrimary.name} is now your Primary Beneficiary`);
    }
    try {
      await axios.put(`${API_URL}/beneficiaries/reorder/${estate?.id}`, {
        ordered_ids: reordered.map(b => b.id),
      }, getAuthHeaders());
    } catch { toast.error('Failed to save order'); }
  }, [beneficiaries, estate?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleSuccession = useCallback(async (benId, benName) => {
    try {
      const res = await axios.put(`${API_URL}/beneficiaries/${benId}/toggle-succession`, {}, getAuthHeaders());
      if (res.data.in_succession) {
        toast.success(`${benName} added to succession hierarchy`);
      } else {
        toast.success(`${benName} removed from succession hierarchy`);
      }
      fetchData();
    } catch {
      toast.error('Failed to update succession');
    }
  }, [estate?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* Getting Started context banner */}
      {fromGettingStarted && (
        <div className="flex items-center gap-3 rounded-2xl p-4" data-testid="getting-started-banner"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <Users className="w-5 h-5 text-[#22c55e]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--t)]">Getting Started — Add a Beneficiary</p>
            <p className="text-xs text-[var(--t4)]">Add someone you want to protect. Just a first name and relationship is enough to start.</p>
          </div>
          <button onClick={() => navigate('/dashboard')}
            className="flex-shrink-0 text-xs font-bold text-[var(--t4)] px-3 py-2 rounded-xl transition-colors hover:bg-[var(--s)]"
            data-testid="back-to-dashboard-btn">
            <ArrowLeft className="w-4 h-4 inline mr-1" />Back
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.15))' }}>
            <Users className="w-5 h-5 text-[#4EDBA8]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
              Beneficiaries
            </h1>
            <p className="text-xs text-[var(--t5)]">
              {beneficiaries.length} configured · Drag to set succession order
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
                <Users className="w-3.5 h-3.5 text-[var(--gold)]" />
              </div>
              <h3 className="text-sm font-bold text-[var(--t)] flex-1" style={{ fontFamily: 'var(--sans)' }}>{user?.first_name || user?.name?.split(' ')[0] || 'My'}'s Estate Tree</h3>
              <span className="text-[11px] italic leading-tight text-right max-w-[140px]" style={{ color: 'var(--gold)' }}>Tap any estate icon to visit your Beneficiary Portal</span>
            </div>
            <FamilyTree
              key={treeAnimKey}
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
          </div>

          {/* RIGHT: Succession Hierarchy — drag to reorder */}
          <div>
            {/* Succession explainer */}
            <div className="mb-3 p-3 rounded-xl flex items-start gap-2.5" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.12)' }} data-testid="succession-explainer">
              <Shield className="w-4 h-4 text-[var(--gold)] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-[var(--t)] font-semibold">Succession Hierarchy</p>
                <p className="text-xs text-[var(--t3)] leading-relaxed mt-0.5">
                  Drag to set succession order. Top position = Primary Beneficiary (trustee).
                </p>
              </div>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={beneficiaries.map(b => b.id)} strategy={rectSortingStrategy}>
            <div className="space-y-3" data-testid="beneficiary-tiles">
              {beneficiaries.map((ben, index) => {
                // Compute succession rank only among opted-in beneficiaries
                const isInSuccession = ben.succession_order !== null && ben.succession_order !== undefined;
                const succRank = isInSuccession ? beneficiaries.filter((b, i) => i < index && b.succession_order !== null && b.succession_order !== undefined).length : null;
                const succStyle = isInSuccession
                  ? (SUCCESSION_COLORS[succRank] || { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' })
                  : { bg: 'rgba(100,116,139,0.08)', color: '#64748b', border: '1px solid rgba(100,116,139,0.15)' };
                const isTileExpanded = expandedTiles.has(ben.id);
                return (
                <SortableCard key={ben.id} id={ben.id}>
                <Card className="glass-card group" data-testid={`beneficiary-${ben.id}`}>
                  <CardContent className="p-4 sm:p-5">
                    {/* Collapsed header — always visible */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="drag-handle cursor-grab active:cursor-grabbing flex items-center text-[var(--t5)] hover:text-[var(--t3)] transition-colors touch-none" data-testid={`drag-handle-${ben.id}`}>
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <AvatarCircle
                        photo={ben.photo_url}
                        cacheKey={ben.id ? `beneficiary:${ben.id}:photo` : undefined}
                        initials={ben.initials || (ben.first_name && ben.last_name 
                          ? (ben.first_name[0] + ben.last_name[0]).toUpperCase()
                          : ben.name?.split(' ').map(n => n[0]).join('').toUpperCase())}
                        color={ben.avatar_color}
                        size={44}
                        isPrimary={index === 0}
                        onUpload={() => {
                          setQuickUploadBenId(ben.id);
                          setTimeout(() => quickFileRef.current?.click(), 50);
                        }}
                        testId={`ben-avatar-${ben.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm sm:text-base truncate" style={{ color: isInSuccession ? succStyle.color : 'var(--t)' }}>{ben.name}</h3>
                        <p className="text-[var(--gold)] text-xs truncate">{ben.relation}</p>
                        {!ben.photo_url && (
                          <p className="text-[11px] text-[var(--t5)] mt-0.5 cursor-pointer hover:text-[var(--t4)] transition-colors"
                            onClick={() => { setQuickUploadBenId(ben.id); setTimeout(() => quickFileRef.current?.click(), 50); }}
                            data-testid={`photo-hint-${ben.id}`}
                          >
                            Tap avatar to add photo
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span
                          className="flex items-center gap-1 text-[11px] font-bold whitespace-nowrap px-2 py-1 rounded-md"
                          style={{ background: succStyle.bg, color: succStyle.color, border: succStyle.border }}
                          data-testid={`succession-badge-${ben.id}`}
                        >
                          <Shield className="w-3 h-3 flex-shrink-0" /> {isInSuccession ? getSuccessionLabel(succRank).toUpperCase() : 'NOT IN SUCCESSION'}
                        </span>
                        <button
                          onClick={() => setExpandedTiles(prev => {
                            const next = new Set(prev);
                            next.has(ben.id) ? next.delete(ben.id) : next.add(ben.id);
                            return next;
                          })}
                          className="h-7 w-7 flex items-center justify-center rounded-md text-[var(--t4)] hover:text-[var(--t)] hover:bg-[var(--s)] transition-colors"
                          data-testid={`expand-tile-${ben.id}`}
                        >
                          {isTileExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isTileExpanded && (
                      <div className="mt-3 pt-3 border-t border-[var(--b)] animate-fade-in">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {ben.is_stub && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--ywbg)] text-[var(--yw)] mr-1">NEEDS INFO</span>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[#3b82f6] transition-opacity h-7 w-7 p-0"
                              onClick={() => openEditModal(ben)}
                              data-testid={`edit-beneficiary-${ben.id}`}
                              aria-label={`Edit ${ben.first_name} ${ben.last_name}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[#ef4444] transition-opacity h-7 w-7 p-0"
                              onClick={() => isAdmin ? setDeleteTarget({ id: ben.id, name: `${ben.first_name} ${ben.last_name}`.trim() }) : handleDelete(ben.id)}
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
                              <span>{formatPhoneUS(ben.phone)}</span>
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
                              className="text-xs text-[var(--gold)] flex items-center gap-1 hover:underline"
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
                          {/* Succession Participation Toggle */}
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-[11px] text-[var(--t5)] uppercase tracking-wider font-bold">Succession Chain</p>
                              <p className="text-[11px] text-[var(--t5)] mt-0.5">{isInSuccession ? `Rank #${succRank + 1} in hierarchy` : 'Not participating'}</p>
                            </div>
                            <Switch
                              checked={isInSuccession}
                              onCheckedChange={() => handleToggleSuccession(ben.id, ben.name)}
                              data-testid={`succession-toggle-${ben.id}`}
                            />
                          </div>

                          {/* Section Access Permissions — what this beneficiary sees after transition */}
                          <div className="mb-3">
                            <p className="text-[11px] text-[var(--t5)] uppercase tracking-wider font-bold mb-2">Post-Transition Access</p>
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
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
                </SortableCard>
              );
          })}
        </div>
        </SortableContext>
        </DndContext>
          </div>
        </div>
      )}

      {/* Add/Edit Beneficiary Panel */}
      <SlidePanel
        open={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingBeneficiary(null); resetForm(); setTreeAnimKey(k => k + 1); }}
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
                onRemove={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoRemoved(true); }}
              />
            </div>
            <p className="text-center text-xs text-[#64748b]">Tap to take or choose a photo</p>

            {/* Name Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-[var(--gold)] uppercase tracking-wide">Personal Information</h3>
              
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
              <h3 className="text-sm font-medium text-[var(--gold)] uppercase tracking-wide">Contact Information</h3>
              
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
                  onChange={(e) => setPhone(formatPhoneUS(e.target.value))}
                  placeholder="(123) 456-7890"
                  className="input-field"
                />
              </div>
            </div>

            {/* Address Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-[var(--gold)] uppercase tracking-wide">Address</h3>
              
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
                  autoComplete="one-time-code"
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
                <p className="text-[var(--gold)] text-[11px] leading-relaxed flex items-start gap-2">
                  <Shield className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  Address is encrypted and stored securely. It's only used for estate law analysis and is never shared.
                </p>
              </div>
            </div>

            {/* Additional Info Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-[var(--gold)] uppercase tracking-wide">Additional Information</h3>
              
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
          
          <div className="flex items-center gap-3 pt-4 border-t border-[var(--b)]">
            {editingBeneficiary && (
              <Button
                variant="ghost"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingBeneficiary(null);
                  resetForm();
                  if (isAdmin) {
                    setDeleteTarget({ id: editingBeneficiary.id, name: `${firstName} ${lastName}`.trim() });
                  } else {
                    handleDelete(editingBeneficiary.id);
                  }
                }}
                className="h-10 px-3 text-[#ef4444] hover:bg-[rgba(239,68,68,0.1)]"
                data-testid="beneficiary-delete-from-edit"
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> Delete
              </Button>
            )}
            <div className="flex-1" />
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
            <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2 mb-4" style={{ fontFamily: 'var(--sans)' }}>
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

      </SectionLockedOverlay>
      {showPrimaryPopup && (
        <ReturnPopup step="primary" onReturn={() => { setShowPrimaryPopup(false); navigate('/dashboard'); }} />
      )}
      {showBenAddedPopup && (
        <ReturnPopup
          step="beneficiary"
          onReturn={() => { setShowBenAddedPopup(false); navigate('/dashboard'); }}
          onAddAnother={() => { setShowBenAddedPopup(false); setShowAddModal(true); }}
        />
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

      {/* Admin: Delete beneficiary dialog with "delete from all estates" option */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[var(--t)]">Delete Beneficiary</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--t4)]">
              You are about to permanently delete <strong className="text-[var(--t)]">{deleteTarget?.name}</strong>.
              Do you want to remove them from <strong>all connected estates</strong>, or only this estate?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel
              className="text-[var(--t4)] border-[var(--b)] hover:bg-[var(--s)]"
              data-testid="delete-ben-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(deleteTarget?.id, false)}
              className="font-bold"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}
              data-testid="delete-ben-this-estate"
            >
              This Estate Only
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => handleDelete(deleteTarget?.id, true)}
              className="font-bold"
              style={{ background: '#EF4444', color: '#fff' }}
              data-testid="delete-ben-all-estates"
            >
              All Estates
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BeneficiariesPage;
