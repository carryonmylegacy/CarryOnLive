import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { cachedGet } from '../utils/apiCache';
import {
  FileText,
  Upload,
  FolderOpen,
  Plus,
  Loader2,
  Shield,
  File,
  FileImage,
  FileArchive,
  Search,
  FolderLock,
  Heart,
  ArrowLeft,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from '../utils/toast';
import { platformDownload, downloadFile as legacyDownloadFile } from '../utils/downloadFile';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';
import DocThumbnail from '../components/DocThumbnail';
import { ReturnPopup } from '../components/GuidedActivation';
import { API_URL } from '../config';
import VaultDocumentCard from '../components/vault/VaultDocumentCard';
import VaultUploadPanel from '../components/vault/VaultUploadPanel';
import VaultUnlockModal from '../components/vault/VaultUnlockModal';
import VaultEditPanel from '../components/vault/VaultEditPanel';
import { VaultSetLockModal, VaultRemoveLockModal, VaultBackupCodeModal } from '../components/vault/VaultLockModals';
const PDFViewerModal = lazy(() => import('../components/PDFViewerModal'));

const categories = [
  { id: 'all', label: 'All', icon: FolderOpen },
  { id: 'will', label: 'Will', icon: FileText },
  { id: 'trust', label: 'Trust', icon: FileText },
  { id: 'living_will', label: 'Living Will', icon: Heart },
  { id: 'life_insurance', label: 'Life Insurance', icon: Shield },
  { id: 'deed', label: 'Deed', icon: File },
  { id: 'poa', label: 'Power of Attorney', icon: FileText },
  { id: 'financial', label: 'Financial', icon: File },
  { id: 'medical', label: 'Medical', icon: FileArchive },
  { id: 'legal', label: 'Legal (Other)', icon: FileText },
  { id: 'personal', label: 'Personal', icon: FileImage },
];

const VaultPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromGettingStarted = location.state?.fromGettingStarted;
  const [documents, setDocuments] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimerRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showBackupCodeModal, setShowBackupCodeModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSetLockModal, setShowSetLockModal] = useState(false);
  const [showRemoveLockConfirm, setShowRemoveLockConfirm] = useState(false);
  const [newLockPassword, setNewLockPassword] = useState('');
  const [confirmLockPassword, setConfirmLockPassword] = useState('');
  const [lockingDoc, setLockingDoc] = useState(false);
  const [showPwEye, setShowPwEye] = useState(false);
  const [showUnlockPwEye, setShowUnlockPwEye] = useState(false);
  const [showInvitePrompt, setShowInvitePrompt] = useState(false);
  const [showReturnPopup, setShowReturnPopup] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockBackupCode, setUnlockBackupCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [backupCode, setBackupCode] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Voice verification state
  const [isListening, setIsListening] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const [voiceHint, setVoiceHint] = useState('');
  const recognitionRef = useRef(null);
  
  // Upload form state
  const [uploadName, setUploadName] = useState('');
  const [uploadCategory, setUploadCategory] = useState('legal');
  const [uploadLockType, setUploadLockType] = useState('none');
  const [uploadLockPassword, setUploadLockPassword] = useState('');
  const [uploadVoicePassphrase, setUploadVoicePassphrase] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  
  // Edit form state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('legal');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [globalDragOver, setGlobalDragOver] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [expandedDesignation, setExpandedDesignation] = useState(null);
  const dragCounterRef = useRef(0);
  const uploadNameRef = useRef(null);
  const pendingDropFocusRef = useRef(false);
  const autoOpenedRef = useRef(false);

  // Allowed file types — PDFs and images (multiple MIME variants for cross-browser/OS compat)
  const allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tiff', 'tif'];
  const allowedMimes = [
    'application/pdf', 'application/x-pdf', 'application/acrobat', 'application/vnd.pdf',
    'image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/tiff',
  ];

  const isFileAllowed = (file) => {
    const ext = (file.name.match(/\.([a-z0-9]+)\s*$/i)?.[1] || '').toLowerCase();
    if (allowedExts.includes(ext)) return true;
    if (allowedMimes.includes(file.type)) return true;
    if (!file.type || file.type === 'application/octet-stream') {
      return allowedExts.includes(ext);
    }
    return false;
  };

  // Auto-focus Document Name input after drop opens the upload panel
  useEffect(() => {
    if (showUploadModal && pendingDropFocusRef.current) {
      pendingDropFocusRef.current = false;
      const timer = setTimeout(() => uploadNameRef.current?.focus?.(), 350);
      return () => clearTimeout(timer);
    }
  }, [showUploadModal]);

  // Global drag-and-drop: drop a file anywhere on the page → opens Upload panel
  useEffect(() => {
    const onDragEnter = (e) => {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer?.types?.includes('Files')) setGlobalDragOver(true);
    };
    const onDragLeave = (e) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setGlobalDragOver(false); }
    };
    const onDragOver = (e) => e.preventDefault();
    const onDrop = (e) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setGlobalDragOver(false);
      if (showUploadModal) return;
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!isFileAllowed(file)) {
        toast.error('Only PDFs and images accepted. No editable document formats (.doc, .docx, .pages, etc.).');
        return;
      }
      setUploadFile(file);
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setUploadName(nameWithoutExt);
      pendingDropFocusRef.current = true;
      setShowUploadModal(true);
      toast.success(`"${file.name}" ready — name your document and tap Upload`);
    };
    const el = document.getElementById('main-content') || document.body;
    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragenter', onDragEnter);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
    };
  }, [showUploadModal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open upload panel when arriving from Getting Started with no documents
  useEffect(() => {
    if (!loading && fromGettingStarted && !autoOpenedRef.current && documents.length === 0 && estate) {
      autoOpenedRef.current = true;
      setShowUploadModal(true);
    }
  }, [loading, fromGettingStarted, documents.length, estate]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const estatesRes = await cachedGet(axios, `${API_URL}/estates`, getAuthHeaders());
      const estates = Array.isArray(estatesRes.data) ? estatesRes.data : [];
      if (estates.length > 0) {
        const savedId = localStorage.getItem('selected_estate_id');
        const selected = (savedId && estates.find(e => e.id === savedId)) || estates[0];
        setEstate(selected);
        const docsRes = await axios.get(`${API_URL}/documents/${selected.id}`, getAuthHeaders()).catch(() => ({ data: [] }));
        setDocuments(Array.isArray(docsRes.data) ? docsRes.data : []);
        // Fetch beneficiaries for SDV designation
        try {
          const benRes = await axios.get(`${API_URL}/beneficiaries/${selected.id}`, getAuthHeaders());
          setBeneficiaries(Array.isArray(benRes.data) ? benRes.data : []);
        } catch { setBeneficiaries([]); }
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) { toast.error('Please select a file to upload'); return; }
    if (!uploadName) { toast.error('Document Name is required'); return; }
    
    if (uploadLockType === 'password' && !uploadLockPassword) {
      toast.error('Password is required for a password-protected document');
      return;
    }
    
    if (uploadLockType === 'voice' && !uploadVoicePassphrase) {
      toast.error('Voice passphrase is required for voice-verified documents');
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      
      let url = `${API_URL}/documents/upload?estate_id=${estate.id}&name=${encodeURIComponent(uploadName)}&category=${uploadCategory}`;
      if (uploadLockType !== 'none') {
        url += `&lock_type=${uploadLockType}`;
        if (uploadLockType === 'password' && uploadLockPassword) {
          url += `&lock_password=${encodeURIComponent(uploadLockPassword)}`;
        }
      }
      
      const response = await axios.post(url, formData, {
        ...getAuthHeaders(),
        headers: {
          ...getAuthHeaders().headers,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // If voice lock, set up the passphrase
      if (uploadLockType === 'voice' && uploadVoicePassphrase) {
        await axios.post(
          `${API_URL}/documents/${response.data.id}/voice/setup?passphrase=${encodeURIComponent(uploadVoicePassphrase)}`,
          {},
          getAuthHeaders()
        );
      }
      
      // toast removed
      
      toast.success('Document uploaded successfully');
      if (response.data.backup_code) {
        setBackupCode(response.data.backup_code);
        setShowBackupCodeModal(true);
      }
      
      setShowUploadModal(false);
      resetUploadForm();
      fetchData();

      // Prompt to invite beneficiaries after first document upload
      if (documents.length === 0 && !sessionStorage.getItem('invite_prompt_shown')) {
        sessionStorage.setItem('invite_prompt_shown', 'true');
        setTimeout(() => setShowReturnPopup(true), 500);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleUnlock = async () => {
    if (!selectedDoc) return;
    
    setUnlocking(true);
    try {
      await axios.post(
        `${API_URL}/documents/${selectedDoc.id}/unlock`,
        {
          password: unlockPassword || null,
          backup_code: unlockBackupCode || null
        },
        getAuthHeaders()
      );
      
      // toast removed
      setShowLockModal(false);
      setUnlockPassword('');
      setUnlockBackupCode('');
      
      // Refresh documents list to show updated lock status
      fetchData();
    } catch (error) {
      console.error('Unlock error:', error);
      toast.error(error.response?.data?.detail || 'Failed to unlock document');
    } finally {
      setUnlocking(false);
    }
  };

  const designateDebounceRef = useRef(null);
  const handleDesignateBeneficiaries = async (docId, beneficiaryIds, visibilityTiming) => {
    // Update local state immediately (optimistic)
    setDocuments(prev => prev.map(d =>
      d.id === docId ? { ...d, designated_beneficiaries: beneficiaryIds, visibility_timing: visibilityTiming || d.visibility_timing } : d
    ));
    // Debounce the API call — no toast spam
    clearTimeout(designateDebounceRef.current);
    designateDebounceRef.current = setTimeout(async () => {
      try {
        const payload = { beneficiary_ids: beneficiaryIds };
        if (visibilityTiming) payload.visibility_timing = visibilityTiming;
        await axios.put(`${API_URL}/documents/${docId}/designate-beneficiaries`,
          payload,
          { ...getAuthHeaders(), headers: { ...getAuthHeaders().headers, 'Content-Type': 'application/json' } }
        );
      } catch {
        toast.error('Failed to update beneficiary access');
      }
    }, 800);
  };

  const toggleBeneficiaryForDoc = (docId, benId, currentDesignation, currentDoc) => {
    const current = currentDesignation || ['all'];
    const isAll = current.includes('all');
    if (benId === 'all') {
      handleDesignateBeneficiaries(docId, ['all'], currentDoc?.visibility_timing);
      return;
    }
    let newList;
    if (isAll) {
      // Switching from "all" to specific — select all EXCEPT the one being unchecked
      newList = beneficiaries.map(b => b.id).filter(id => id !== benId);
    } else if (current.includes(benId)) {
      newList = current.filter(id => id !== benId);
      if (newList.length === 0) newList = ['all']; // Can't have empty — default to all
    } else {
      newList = [...current, benId];
      // Don't auto-convert to "all" — keep individual IDs so Pre/Post toggles stay visible
    }
    handleDesignateBeneficiaries(docId, newList, currentDoc?.visibility_timing);
  };

  const toggleVisibilityTiming = (docId, benId, period, currentDoc) => {
    const timing = { ...(currentDoc?.visibility_timing || {}) };
    const benTiming = timing[benId] || { pre: false, post: true };
    timing[benId] = { ...benTiming, [period]: !benTiming[period] };
    // Ensure at least one is true
    if (!timing[benId].pre && !timing[benId].post) {
      timing[benId].post = true;
    }
    handleDesignateBeneficiaries(docId, currentDoc?.designated_beneficiaries || ['all'], timing);
  };




  const handleSetLock = async () => {
    if (!selectedDoc || !newLockPassword || newLockPassword.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }
    if (newLockPassword !== confirmLockPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLockingDoc(true);
    try {
      const res = await axios.post(`${API_URL}/documents/${selectedDoc.id}/lock`, { password: newLockPassword }, getAuthHeaders());
      setBackupCode(res.data.backup_code);
      setShowSetLockModal(false);
      setNewLockPassword('');
      setConfirmLockPassword('');
      setShowBackupCodeModal(true);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to lock document');
    } finally {
      setLockingDoc(false);
    }
  };

  const handleRemoveLock = async () => {
    if (!selectedDoc) return;
    setLockingDoc(true);
    try {
      await axios.post(`${API_URL}/documents/${selectedDoc.id}/remove-lock`, {}, getAuthHeaders());
      setShowRemoveLockConfirm(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to remove lock');
    } finally {
      setLockingDoc(false);
    }
  };

  // Resolve a proper filename with extension from MIME type
  const resolveFileName = (name, mimeType) => {
    const base = name || 'document';
    // If name already has a known extension, keep it
    const extMatch = base.match(/\.(pdf|jpg|jpeg|png|heic|heif|webp|tiff|tif|txt|doc|docx)$/i);
    if (extMatch) return base;
    // Append extension based on MIME
    const mimeMap = {
      'application/pdf': '.pdf',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/heic': '.heic',
      'image/heif': '.heif',
      'image/webp': '.webp',
      'image/tiff': '.tiff',
      'text/plain': '.txt',
    };
    const ext = mimeMap[mimeType] || '';
    return ext ? `${base}${ext}` : base;
  };

  const handleDownload = async (doc, password = null, backupCode = null) => {
    setDownloading(doc.id);
    try {
      const fileName = resolveFileName(doc.name, doc.file_type);
      const dlParams = { document_id: doc.id };
      if (password) dlParams.password = password;
      if (backupCode) dlParams.backup_code = backupCode;

      const result = await platformDownload({
        action: 'document',
        params: dlParams,
        filename: fileName,
        onFallback: async () => {
          // Non-iOS: direct fetch + blob download
          let url = `${API_URL}/documents/${doc.id}/download`;
          const qp = [];
          if (password) qp.push(`password=${encodeURIComponent(password)}`);
          if (backupCode) qp.push(`backup_code=${encodeURIComponent(backupCode)}`);
          if (qp.length > 0) url += `?${qp.join('&')}`;
          const authToken = localStorage.getItem('carryon_token');
          const res = await fetch(url, { headers: { Authorization: `Bearer ${authToken}` } });
          if (!res.ok) {
            const errData = await res.json().catch(() => null);
            throw new Error(errData?.detail || `Server error (${res.status})`);
          }
          const blob = await res.blob();
          await legacyDownloadFile(blob, fileName);
        },
      });

      if (result === 'shared' || result === 'saved') {
        toast.success('Document saved');
      }
    } catch (error) {
      console.error('SDV Download error:', error);
      const msg = error?.message || '';
      if (msg.includes('locked') || msg.includes('Locked') || msg.includes('403')) {
        setSelectedDoc(doc);
        setShowLockModal(true);
      } else if (msg.includes('Not authenticated') || msg.includes('401')) {
        toast.error('Session expired. Please log in again.');
      } else {
        toast.error(msg || 'Download failed — check your connection and try again');
      }
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    
    try {
      await axios.delete(`${API_URL}/documents/${docId}`, getAuthHeaders());
      // toast removed
      setDocuments(documents.filter(d => d.id !== docId));
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete document');
    }
  };

  const openEditModal = (doc) => {
    setEditingDoc(doc);
    setEditName(doc.name || '');
    setEditCategory(doc.category || 'legal');
    setEditNotes(doc.notes || '');
    setShowEditModal(true);
  };

  const handleEditDocument = async () => {
    if (!editingDoc || !editName) {
      toast.error('Document name is required');
      return;
    }
    
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('name', editName);
      formData.append('category', editCategory);
      formData.append('notes', editNotes || '');
      
      await axios.put(`${API_URL}/documents/${editingDoc.id}`, formData, {
        ...getAuthHeaders(),
        headers: {
          ...getAuthHeaders().headers,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // toast removed
      setShowEditModal(false);
      setEditingDoc(null);
      fetchData();
    } catch (error) {
      console.error('Update error:', error);
      toast.error(error.response?.data?.detail || 'Failed to update document');
    } finally {
      setSaving(false);
    }
  };

  const copyBackupCode = () => {
    navigator.clipboard.writeText(backupCode);
    // toast removed
  };

  const resetUploadForm = () => {
    setUploadName('');
    setUploadCategory('legal');
    setUploadLockType('none');
    setUploadLockPassword('');
    setUploadVoicePassphrase('');
    setUploadFile(null);
  };

  // Preview functions — always opens the floating PDF/image viewer
  const handlePreview = async (doc) => {
    const previewable = doc.file_type && (
      doc.file_type.toLowerCase().includes('pdf') ||
      doc.file_type.toLowerCase().includes('image')
    );

    if (!previewable) {
      // toast removed
      handleDownload(doc);
      return;
    }

    setSelectedDoc(doc);
    setPreviewLoading(true);
    setShowPreviewModal(true);
    setPreviewUrl(null);

    try {
      const url = `${API_URL}/documents/${doc.id}/preview`;
      const token = localStorage.getItem('carryon_token');
      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${token}` },
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: doc.file_type });
      const objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    } catch (error) {
      console.error('Preview error:', error);
      if (error.response?.status === 401) {
        setShowPreviewModal(false);
        setSelectedDoc(doc);
        setShowLockModal(true);
      } else if (error.response?.status === 403) {
        toast.error('Vault is locked. Please unlock the Secure Document Vault first.');
        setShowPreviewModal(false);
      } else {
        toast.error('Failed to load document preview');
        // Keep modal open — shows fallback "Download Instead" button
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setShowPreviewModal(false);
    setSelectedDoc(null);
  };

  // Voice verification functions
  const startVoiceRecognition = async () => {
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice recognition is not supported in your browser. Please use Chrome or Edge.');
      return;
    }
    
    // Get voice hint first
    if (selectedDoc) {
      try {
        const hintRes = await axios.get(`${API_URL}/documents/${selectedDoc.id}/voice/hint`, getAuthHeaders());
        setVoiceHint(hintRes.data.hint);
        if (!hintRes.data.has_passphrase) {
          toast.error('Voice passphrase not set up for this document. Use backup code.');
          return;
        }
      } catch (error) {
        console.error('Failed to get voice hint:', error);
      }
    }
    
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';
    
    recognitionRef.current.onstart = () => {
      setIsListening(true);
      setSpokenText('');
    };
    
    recognitionRef.current.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');
      setSpokenText(transcript);
    };
    
    recognitionRef.current.onend = () => {
      setIsListening(false);
    };
    
    recognitionRef.current.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        toast.error('Microphone access denied. Please allow microphone access.');
      }
    };
    
    recognitionRef.current.start();
  };

  const stopVoiceRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const verifyVoice = async () => {
    if (!spokenText || !selectedDoc) {
      toast.error('Please speak your passphrase first');
      return;
    }
    
    setUnlocking(true);
    try {
      await axios.post(
        `${API_URL}/documents/${selectedDoc.id}/voice/verify`,
        { document_id: selectedDoc.id, spoken_text: spokenText },
        getAuthHeaders()
      );
      
      // toast removed
      setShowLockModal(false);
      setSpokenText('');
      
      // Download with voice verification passed (use backup code internally)
      handleDownload(selectedDoc, null, selectedDoc.backup_code);
    } catch (error) {
      console.error('Voice verification failed:', error);
      toast.error(error.response?.data?.detail || 'Voice verification failed. Try again or use backup code.');
    } finally {
      setUnlocking(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredDocs = documents
    .filter(d => activeCategory === 'all' || d.category === activeCategory)
    .filter(d => !debouncedSearch || d.name.toLowerCase().includes(debouncedSearch.toLowerCase()));

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-[var(--s)]" />
        <Skeleton className="h-12 w-full bg-[var(--s)]" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-40 bg-[var(--s)] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in relative" data-testid="document-vault"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(37,99,235,0.15), transparent 55%), radial-gradient(ellipse at bottom right, rgba(59,130,246,0.08), transparent 55%)' }}>

      {/* Global drag overlay */}
      {globalDragOver && !showUploadModal && (
        <div className="fixed inset-0 z-[44] flex items-center justify-center pointer-events-none" data-testid="vault-drag-overlay">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative flex flex-col items-center gap-4 p-10 rounded-3xl border-2 border-dashed border-[#d4af37]"
            style={{ background: 'rgba(15,22,41,0.9)' }}>
            <Upload className="w-16 h-16 text-[var(--gold)]" />
            <p className="text-xl font-bold text-white" style={{ fontFamily: 'var(--sans)' }}>Drop to Upload</p>
            <p className="text-sm text-[#94a3b8]">Release to add this document to your Secure Vault</p>
          </div>
        </div>
      )}

      {/* Header - matching prototype */}
      {fromGettingStarted && (
        <div className="flex items-center gap-3 rounded-2xl p-4" data-testid="getting-started-banner"
          style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.15)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.25)' }}>
            <FolderLock className="w-5 h-5 text-[#3b82f6]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--t)]">Getting Started — Upload a Document</p>
            <p className="text-xs text-[var(--t4)]">Upload any important document (will, insurance, deed). Just pick a file and give it a name.</p>
          </div>
          <button onClick={() => navigate('/dashboard')}
            className="flex-shrink-0 text-xs font-bold text-[var(--t4)] px-3 py-2 rounded-xl transition-colors hover:bg-[var(--s)]"
            data-testid="back-to-dashboard-btn">
            <ArrowLeft className="w-4 h-4 inline mr-1" />Back
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.2), rgba(59,130,246,0.15))' }}>
            <FolderLock className="w-5 h-5 text-[#60A5FA]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
              Secure Document Vault (SDV)
            </h1>
            <p className="text-xs text-[var(--t5)]">
              AES-256 encrypted · {documents.length} documents
            </p>
          </div>
        </div>
        <Button
          className="gold-button w-full sm:w-auto"
          onClick={() => setShowUploadModal(true)}
          data-testid="upload-document-button"
        >
          <Upload className="w-5 h-5 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* Section Lock */}
      <SectionLockBanner sectionId="vault" />

      <SectionLockedOverlay sectionId="vault">
      {/* Search bar */}
      <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--b)' }}>
        <Search className="w-4 h-4 text-[var(--t5)]" />
        <input
          value={searchQuery}
          onChange={(e) => { 
            setSearchQuery(e.target.value);
            clearTimeout(searchTimerRef.current);
            searchTimerRef.current = setTimeout(() => setDebouncedSearch(e.target.value), 250);
          }}
          placeholder="Search documents..."
          className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]"
          data-testid="vault-search"
        />
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="bg-[var(--s)] p-1 flex flex-wrap gap-1 h-auto w-full">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat.id}
              value={cat.id}
              className="data-[state=active]:bg-[#d4af37] data-[state=active]:text-[#0b1120] text-xs sm:text-sm px-2 sm:px-3 py-1.5 flex-shrink-0"
              data-testid={`category-${cat.id}`}
            >
              <cat.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="sm:hidden">{cat.id === 'all' ? 'All' : cat.label}</span>
              <span className="hidden sm:inline">{cat.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        </div>
        <TabsContent value={activeCategory} className="mt-6">
          {filteredDocs.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-12 text-center">
                <FolderOpen className="w-16 h-16 mx-auto text-[#10b981] mb-4 opacity-50" />
                <h3 className="text-xl font-semibold text-white mb-2">Your Vault Awaits</h3>
                <p className="text-[#94a3b8] mb-2">Securely store your wills, trusts, insurance policies, and other critical documents.</p>
                <p className="text-xs text-[#64748b] mb-6">AES-256 encrypted. Only PDFs and images accepted — no editable formats.</p>
                <div className="flex justify-center">
                  <Button className="gold-button text-base px-8 py-3" onClick={() => setShowUploadModal(true)}>
                    <Plus className="w-5 h-5 mr-2" />
                    Upload Your First Estate Document
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocs.map((doc) => {
                return (
                  <VaultDocumentCard
                    key={doc.id}
                    doc={doc}
                    user={user}
                    downloading={downloading}
                    expandedDesignation={expandedDesignation}
                    beneficiaries={beneficiaries}
                    getAuthHeaders={getAuthHeaders}
                    formatFileSize={formatFileSize}
                    handlePreview={handlePreview}
                    handleDownload={handleDownload}
                    handleDelete={handleDelete}
                    openEditModal={openEditModal}
                    setSelectedDoc={setSelectedDoc}
                    setShowLockModal={setShowLockModal}
                    setShowRemoveLockConfirm={setShowRemoveLockConfirm}
                    setShowSetLockModal={setShowSetLockModal}
                    setExpandedDesignation={setExpandedDesignation}
                    toggleBeneficiaryForDoc={toggleBeneficiaryForDoc}
                    toggleVisibilityTiming={toggleVisibilityTiming}
                  />
                );
              })}
            </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Upload Document Panel */}
      <VaultUploadPanel
        open={showUploadModal}
        onClose={() => { setShowUploadModal(false); resetUploadForm(); }}
        uploadName={uploadName}
        setUploadName={setUploadName}
        uploadCategory={uploadCategory}
        setUploadCategory={setUploadCategory}
        uploadLockType={uploadLockType}
        setUploadLockType={setUploadLockType}
        uploadLockPassword={uploadLockPassword}
        setUploadLockPassword={setUploadLockPassword}
        uploadVoicePassphrase={uploadVoicePassphrase}
        setUploadVoicePassphrase={setUploadVoicePassphrase}
        uploadFile={uploadFile}
        setUploadFile={setUploadFile}
        showPwEye={showPwEye}
        setShowPwEye={setShowPwEye}
        uploading={uploading}
        handleUpload={handleUpload}
        uploadNameRef={uploadNameRef}
        isFileAllowed={isFileAllowed}
      />

      {/* Lock Modal */}
      <VaultUnlockModal
        open={showLockModal}
        onOpenChange={(open) => {
          setShowLockModal(open);
          if (!open) {
            setUnlockPassword('');
            setUnlockBackupCode('');
            setSpokenText('');
            setIsListening(false);
            if (recognitionRef.current) {
              recognitionRef.current.stop();
            }
          }
        }}
        selectedDoc={selectedDoc}
        unlockPassword={unlockPassword}
        setUnlockPassword={setUnlockPassword}
        unlockBackupCode={unlockBackupCode}
        setUnlockBackupCode={setUnlockBackupCode}
        showUnlockPwEye={showUnlockPwEye}
        setShowUnlockPwEye={setShowUnlockPwEye}
        isListening={isListening}
        spokenText={spokenText}
        voiceHint={voiceHint}
        startVoiceRecognition={startVoiceRecognition}
        stopVoiceRecognition={stopVoiceRecognition}
        verifyVoice={verifyVoice}
        handleUnlock={handleUnlock}
        unlocking={unlocking}
      />

      {/* Backup Code Modal */}
      <VaultBackupCodeModal
        open={showBackupCodeModal}
        onOpenChange={setShowBackupCodeModal}
        backupCode={backupCode}
        copyBackupCode={copyBackupCode}
      />

      {/* PDF/Image Viewer Floating Tile */}
      {showPreviewModal && (
        <Suspense fallback={<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"><Loader2 className="w-8 h-8 text-[var(--gold)] animate-spin" /></div>}>
          <PDFViewerModal
            open={showPreviewModal}
            onClose={closePreview}
            doc={selectedDoc}
            blobUrl={previewUrl}
            loading={previewLoading}
            onDownload={(d) => {
              closePreview();
              handleDownload(d);
            }}
          />
        </Suspense>
      )}

      {/* Edit Document Panel */}
      <VaultEditPanel
        open={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingDoc(null); setEditName(''); setEditCategory('legal'); setEditNotes(''); }}
        editName={editName}
        setEditName={setEditName}
        editCategory={editCategory}
        setEditCategory={setEditCategory}
        editNotes={editNotes}
        setEditNotes={setEditNotes}
        editingDoc={editingDoc}
        saving={saving}
        handleEditDocument={handleEditDocument}
      />

      {/* Set Lock Modal */}
      <VaultSetLockModal
        open={showSetLockModal}
        onOpenChange={setShowSetLockModal}
        selectedDoc={selectedDoc}
        newLockPassword={newLockPassword}
        setNewLockPassword={setNewLockPassword}
        confirmLockPassword={confirmLockPassword}
        setConfirmLockPassword={setConfirmLockPassword}
        showPwEye={showPwEye}
        setShowPwEye={setShowPwEye}
        lockingDoc={lockingDoc}
        handleSetLock={handleSetLock}
      />

      {/* Remove Lock Confirmation */}
      <VaultRemoveLockModal
        open={showRemoveLockConfirm}
        onOpenChange={setShowRemoveLockConfirm}
        selectedDoc={selectedDoc}
        lockingDoc={lockingDoc}
        handleRemoveLock={handleRemoveLock}
      />

      </SectionLockedOverlay>

      {/* Invite prompt after first upload */}
      {showReturnPopup && (
        <ReturnPopup step="document" onReturn={() => { setShowReturnPopup(false); navigate('/dashboard'); }}
          onAlternate={() => { setShowReturnPopup(false); setShowUploadModal(true); }} />
      )}

      {showInvitePrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowInvitePrompt(false)} />
          <div className="relative rounded-2xl p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.2)' }}>
              <Heart className="w-8 h-8 text-[var(--gold)]" />
            </div>
            <h3 className="text-xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'var(--sans)' }}>Your Estate Plan Has Begun</h3>
            <p className="text-sm text-[var(--t4)] mb-5">Invite someone you trust so they can access your documents when needed.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowInvitePrompt(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold glass-card text-[var(--t4)]">Later</button>
              <button onClick={() => { setShowInvitePrompt(false); navigate('/beneficiaries'); }} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}>
                Invite Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VaultPage;
