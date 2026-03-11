import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { cachedGet } from '../utils/apiCache';
import {
  FileText,
  Upload,
  Lock,
  Unlock,
  Trash2,
  Download,
  FolderOpen,
  Plus,
  X,
  Loader2,
  Shield,
  File,
  FileImage,
  FileVideo,
  FileArchive,
  Key,
  Copy,
  CheckCircle2,
  Eye,
  EyeOff,
  Mic,
  MicOff,
  Volume2,
  Search,
  FolderLock,
  Edit2,
  Heart
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { toast } from '../utils/toast';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';
import DocThumbnail from '../components/DocThumbnail';
import { ReturnPopup } from '../components/GuidedActivation';
import SlidePanel from '../components/SlidePanel';
const PDFViewerModal = lazy(() => import('../components/PDFViewerModal'));

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
  const { user, getAuthHeaders, token } = useAuth();
  const navigate = useNavigate();
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
  const [showVoiceSetupModal, setShowVoiceSetupModal] = useState(false);
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
  const [voicePassphrase, setVoicePassphrase] = useState('');
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
  const dragCounterRef = useRef(0);

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
      if (showUploadModal) return; // Already in upload panel, let the inner handler deal with it
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();
      const allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tiff', 'tif'];
      const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/tiff'];
      if (!allowedMimes.includes(file.type) && !allowedExts.includes(ext)) {
        toast.error('Only PDFs and images accepted. No editable document formats (.doc, .docx, .pages, etc.).');
        return;
      }
      setUploadFile(file);
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setUploadName(nameWithoutExt);
      setShowUploadModal(true);
      toast.success(`"${file.name}" ready — review details and tap Upload`);
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

  const fetchData = async () => {
    try {
      const estatesRes = await cachedGet(axios, `${API_URL}/estates`, getAuthHeaders());
      const estates = Array.isArray(estatesRes.data) ? estatesRes.data : [];
      if (estates.length > 0) {
        setEstate(estates[0]);
        const docsRes = await axios.get(`${API_URL}/documents/${estates[0].id}`, getAuthHeaders()).catch(() => ({ data: [] }));
        setDocuments(Array.isArray(docsRes.data) ? docsRes.data : []);
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



  const handleDownload = async (doc, password = null, backupCode = null) => {
    setDownloading(doc.id);
    try {
      let url = `${API_URL}/documents/${doc.id}/download`;
      const params = [];
      if (password) params.push(`password=${encodeURIComponent(password)}`);
      if (backupCode) params.push(`backup_code=${encodeURIComponent(backupCode)}`);
      if (params.length > 0) url += `?${params.join('&')}`;
      
      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('carryon_token')}` },
        responseType: 'blob'
      });
      
      // Native app: write to filesystem then open share sheet
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        try {
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          const { Share } = await import('@capacitor/share');
          
          // Convert blob to base64
          const reader = new FileReader();
          const base64Data = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(response.data);
          });
          
          // Write to cache directory
          const fileName = doc.name || 'document';
          const result = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache,
          });
          
          // Open native share sheet so user can save/share the file
          await Share.share({
            title: doc.name,
            url: result.uri,
          });
        } catch (nativeErr) {
          console.error('Native download fallback:', nativeErr);
          toast.error('Could not save file. Please try again.');
        }
      } else {
        // Web/PWA: standard blob download
        const blob = new Blob([response.data], { type: doc.file_type });
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = doc.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      }
    } catch (error) {
      console.error('Download error:', error);
      if (error.response?.status === 401) {
        // Need to unlock first
        setSelectedDoc(doc);
        setShowLockModal(true);
      } else {
        toast.error('Failed to download document');
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

  const getFileIcon = (fileType) => {
    if (fileType?.includes('image')) return FileImage;
    if (fileType?.includes('video')) return FileVideo;
    if (fileType?.includes('zip') || fileType?.includes('archive')) return FileArchive;
    return FileText;
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
            <Upload className="w-16 h-16 text-[#d4af37]" />
            <p className="text-xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Drop to Upload</p>
            <p className="text-sm text-[#94a3b8]">Release to add this document to your Secure Vault</p>
          </div>
        </div>
      )}

      {/* Header - matching prototype */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.2), rgba(59,130,246,0.15))' }}>
            <FolderLock className="w-5 h-5 text-[#60A5FA]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Secure Document Vault
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
                <Button className="gold-button text-base px-8 py-3" onClick={() => setShowUploadModal(true)}>
                  <Plus className="w-5 h-5 mr-2" />
                  Upload Your First Estate Document
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocs.map((doc) => {
                return (
                  <Card
                    key={doc.id}
                    className="glass-card relative overflow-hidden group cursor-pointer"
                    onClick={() => doc.is_locked ? (setSelectedDoc(doc), setShowLockModal(true)) : handlePreview(doc)}
                    data-testid={`document-${doc.id}`}
                  >
                    {/* Lock Overlay */}
                    {doc.is_locked && (
                      <div className="lock-overlay">
                        <div className="text-center">
                          <Lock className="w-8 h-8 text-[#d4af37] mx-auto mb-2" />
                          <p className="text-white font-medium">Protected Document</p>
                          <p className="text-[#94a3b8] text-sm">
                            {doc.lock_type === 'password' ? 'Password Required' :
                             doc.lock_type === 'voice' ? 'Voice Verification' : 'Backup Key Required'}
                          </p>
                          <Button
                            variant="outline"
                            className="mt-4 border-[#d4af37] text-[#d4af37]"
                            onClick={() => {
                              setSelectedDoc(doc);
                              setShowLockModal(true);
                            }}
                          >
                            Unlock
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    <CardContent className="p-0">
                      {/* Thumbnail area */}
                      <div className="h-28 w-full rounded-t-xl overflow-hidden relative">
                        <DocThumbnail doc={doc} getAuthHeaders={getAuthHeaders} />
                      </div>
                      
                      <div className="p-4 pt-3">
                        <h3 className="text-white font-medium mb-1 truncate text-sm">{doc.name}</h3>
                        <p className="text-[#64748b] text-xs mb-3">
                          {formatFileSize(doc.file_size)} · {doc.category}
                        </p>
                        
                        <div className="flex items-center gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-[#3b82f6] hover:text-[#60a5fa]"
                          onClick={(e) => { e.stopPropagation(); if (doc.is_locked) { setSelectedDoc(doc); setShowLockModal(true); } else { handlePreview(doc); } }}
                          title="View"
                          aria-label="View document"
                          data-testid={`view-document-${doc.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-[#94a3b8] hover:text-white"
                          onClick={(e) => { e.stopPropagation(); if (doc.is_locked) { setSelectedDoc(doc); setShowLockModal(true); } else { handleDownload(doc); } }}
                          disabled={downloading === doc.id}
                          title="Download"
                          aria-label="Download document"
                        >
                          {downloading === doc.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </Button>
                        {user?.role === 'benefactor' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={doc.is_locked ? 'text-[#ef4444]' : 'text-[#10b981]'}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDoc(doc);
                                if (doc.is_locked) {
                                  setShowRemoveLockConfirm(true);
                                } else {
                                  setShowSetLockModal(true);
                                }
                              }}
                              title={doc.is_locked ? 'Locked — tap to remove lock' : 'Unlocked — tap to set password'}
                              aria-label={doc.is_locked ? 'Remove lock' : 'Set lock'}
                              data-testid={`lock-toggle-${doc.id}`}
                            >
                              {doc.is_locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[#d4af37] hover:text-[#f5d050]"
                              onClick={(e) => { e.stopPropagation(); openEditModal(doc); }}
                              title="Edit"
                              aria-label="Edit document"
                              data-testid={`edit-document-${doc.id}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[#ef4444] hover:text-[#ef4444]"
                              onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                              title="Delete"
                              aria-label="Delete document"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Upload Document Panel */}
      <SlidePanel
        open={showUploadModal}
        onClose={() => { setShowUploadModal(false); resetUploadForm(); }}
        title="Upload Document"
        subtitle="Add a new document to your secure vault"
      >
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Document Name <span className="text-red-400">*</span></Label>
              <Input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g., Last Will & Testament"
                className="input-field"
                data-testid="upload-name-input"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Category <span className="text-red-400">*</span></Label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger className="input-field" data-testid="upload-category-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                  <SelectItem value="will">Will</SelectItem>
                  <SelectItem value="trust">Trust</SelectItem>
                  <SelectItem value="living_will">Living Will / Healthcare Directive</SelectItem>
                  <SelectItem value="life_insurance">Life Insurance</SelectItem>
                  <SelectItem value="deed">Deed / Title</SelectItem>
                  <SelectItem value="poa">Power of Attorney</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="medical">Medical / Healthcare Directive</SelectItem>
                  <SelectItem value="legal">Legal (Other)</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Security Lock (Optional)</Label>
              <Select value={uploadLockType} onValueChange={setUploadLockType}>
                <SelectTrigger className="input-field" data-testid="upload-lock-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                  <SelectItem value="none">No Lock</SelectItem>
                  <SelectItem value="password">Password Protected</SelectItem>
                  <SelectItem value="voice">Voice Verification</SelectItem>
                  <SelectItem value="backup">Backup Key Required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {uploadLockType === 'password' && (
              <div className="space-y-2">
              <Label className="text-[#94a3b8]">Set Document Password <span className="text-red-400">*</span></Label>
                <Input
                  type="password"
                  value={uploadLockPassword}
                  onChange={(e) => setUploadLockPassword(e.target.value)}
                  placeholder="Enter a secure password"
                  className="input-field"
                  data-testid="upload-password-input"
                />
                <p className="text-[#64748b] text-xs">
                  This password will be required to access the document. A backup code will also be generated.
                </p>
              </div>
            )}
            
            {uploadLockType === 'voice' && (
              <div className="space-y-2">
              <Label className="text-[#94a3b8]">Set Voice Passphrase <span className="text-red-400">*</span></Label>
                <Input
                  type="text"
                  value={uploadVoicePassphrase}
                  onChange={(e) => setUploadVoicePassphrase(e.target.value)}
                  placeholder="e.g., 'Open sesame' or 'Family first'"
                  className="input-field"
                  data-testid="upload-voice-passphrase-input"
                />
                <p className="text-[#64748b] text-xs">
                  You'll need to speak this phrase to unlock the document. A backup code will also be generated.
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">File <span className="text-red-400">*</span></Label>
              <div
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#d4af37'; }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = ''; }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = '';
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    const ext = file.name.split('.').pop().toLowerCase();
                    const allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tiff', 'tif'];
                    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/tiff'];
                    if (!allowedMimes.includes(file.type) && !allowedExts.includes(ext)) {
                      toast.error('Only PDFs and images accepted. No editable document formats (.doc, .docx, .pages, etc.).');
                      return;
                    }
                    setUploadFile(file);
                    if (!uploadName) {
                      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
                      setUploadName(nameWithoutExt);
                    }
                    toast.success(`"${file.name}" selected — fill in details and tap Upload`);
                  }
                }}
                className="border-2 border-dashed border-[var(--b)] rounded-xl p-6 text-center transition-colors">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp,image/tiff"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setUploadFile(file);
                      if (!uploadName) {
                        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
                        setUploadName(nameWithoutExt);
                      }
                    }
                  }}
                  data-testid="upload-file-input"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  {uploadFile ? (
                    <div className="flex items-center justify-center gap-2 max-w-full">
                      <FileText className="w-5 h-5 text-[#d4af37] flex-shrink-0" />
                      <span className="text-white text-sm truncate max-w-[200px]">{uploadFile.name}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setUploadFile(null);
                        }}
                        className="text-[#ef4444]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 mx-auto text-[#64748b] mb-2" />
                      <p className="text-white">Click to upload or drag & drop</p>
                      <p className="text-[#64748b] text-sm mt-1">PDF and images only (no editable formats) · Up to 25MB</p>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowUploadModal(false);
                resetUploadForm();
              }}
              className="border-[var(--b)] text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || !uploadFile || !uploadName || (uploadLockType === 'password' && !uploadLockPassword) || (uploadLockType === 'voice' && !uploadVoicePassphrase)}
              className="gold-button"
              data-testid="upload-submit-button"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Encrypting...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </div>
      </SlidePanel>

      {/* Lock Modal */}
      <Dialog open={showLockModal} onOpenChange={(open) => {
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
      }}>
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-md !top-[5vh] !translate-y-0 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Unlock Document
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              {selectedDoc?.lock_type === 'password' && 'Enter the password to access this document'}
              {selectedDoc?.lock_type === 'voice' && 'Speak your passphrase or use backup code'}
              {selectedDoc?.lock_type === 'backup' && 'Enter your backup code'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="text-center">
              <Shield className="w-12 h-12 mx-auto text-[#d4af37] mb-2" />
              <p className="text-white font-medium">{selectedDoc?.name}</p>
              <p className="text-[#64748b] text-sm">
                Protected with {selectedDoc?.lock_type} security
              </p>
            </div>
            
            {selectedDoc?.lock_type === 'password' && (
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">Password <span className="text-red-400">*</span></Label>
                <div className="relative">
                  <Input
                    type={showUnlockPwEye ? 'text' : 'password'}
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    placeholder="Enter document password"
                    className="input-field pr-10"
                    data-testid="unlock-password-input"
                  />
                  <button type="button" onClick={() => setShowUnlockPwEye(!showUnlockPwEye)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                    {showUnlockPwEye ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
            
            {selectedDoc?.lock_type === 'voice' && (
              <div className="space-y-4">
                <div className="p-4 bg-[var(--s)] rounded-xl text-center">
                  <div className="flex justify-center mb-3">
                    <button
                      onClick={isListening ? stopVoiceRecognition : startVoiceRecognition}
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                        isListening 
                          ? 'bg-[#ef4444] animate-pulse' 
                          : 'bg-[#d4af37]/20 hover:bg-[#d4af37]/30'
                      }`}
                    >
                      {isListening ? (
                        <MicOff className="w-8 h-8 text-white" />
                      ) : (
                        <Mic className="w-8 h-8 text-[#d4af37]" />
                      )}
                    </button>
                  </div>
                  
                  <p className="text-white text-sm">
                    {isListening ? 'Listening... Speak now' : 'Click to start voice recognition'}
                  </p>
                  
                  {voiceHint && (
                    <p className="text-[#64748b] text-xs mt-2">
                      Hint: "{voiceHint}"
                    </p>
                  )}
                  
                  {spokenText && (
                    <div className="mt-3 p-2 bg-[#0F1629] rounded-lg">
                      <p className="text-[#94a3b8] text-xs">Heard:</p>
                      <p className="text-white">{spokenText}</p>
                    </div>
                  )}
                </div>
                
                {spokenText && (
                  <Button 
                    onClick={verifyVoice}
                    disabled={unlocking}
                    className="gold-button w-full"
                  >
                    {unlocking ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-5 h-5 mr-2" />
                        Verify Voice
                      </>
                    )}
                  </Button>
                )}
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[var(--b)]"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-[var(--bg2)] px-2 text-[var(--t5)]">Or use backup code</span>
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">
                {selectedDoc?.lock_type === 'password' ? 'Or use Backup Code' : 
                 selectedDoc?.lock_type === 'voice' ? 'Backup Code' : 'Backup Code'}
              </Label>
              <Input
                type="text"
                value={unlockBackupCode}
                onChange={(e) => setUnlockBackupCode(e.target.value)}
                placeholder="e.g., 1234-5678-9012"
                className="input-field"
                data-testid="unlock-backup-input"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowLockModal(false)}
              className="border-[var(--b)] text-white"
            >
              Cancel
            </Button>
            {selectedDoc?.lock_type !== 'voice' && (
              <Button 
                onClick={handleUnlock}
                disabled={unlocking || (!unlockPassword && !unlockBackupCode)}
                className="gold-button"
                data-testid="unlock-submit-button"
              >
                {unlocking ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Unlocking...
                  </>
                ) : (
                  <>
                    <Unlock className="w-5 h-5 mr-2" />
                    Unlock & Download
                  </>
                )}
              </Button>
            )}
            {selectedDoc?.lock_type === 'voice' && unlockBackupCode && (
              <Button 
                onClick={handleUnlock}
                disabled={unlocking}
                className="gold-button"
                data-testid="unlock-submit-button"
              >
                {unlocking ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Unlocking...
                  </>
                ) : (
                  <>
                    <Unlock className="w-5 h-5 mr-2" />
                    Unlock with Backup
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Backup Code Modal */}
      <Dialog open={showBackupCodeModal} onOpenChange={setShowBackupCodeModal}>
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-md !top-[5vh] !translate-y-0">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              <Key className="w-5 h-5 text-[#d4af37]" />
              Save Your Backup Code
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              This code can be used to unlock your document if you forget the password.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="bg-[#0F1629]/50 rounded-xl p-4 text-center mb-4">
              <p className="text-2xl font-mono text-[#d4af37] tracking-wider">{backupCode}</p>
            </div>
            
            <Button
              onClick={copyBackupCode}
              variant="outline"
              className="w-full border-[var(--b)] text-white mb-4"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy to Clipboard
            </Button>
            
            <div className="p-3 bg-[#f59e0b]/10 rounded-xl">
              <p className="text-[#f59e0b] text-sm">
                ⚠️ Store this code securely. It cannot be recovered if lost.
              </p>
            </div>
          </div>
          
          <Button
            onClick={() => setShowBackupCodeModal(false)}
            className="gold-button w-full"
          >
            <CheckCircle2 className="w-5 h-5 mr-2" />
            I've Saved My Code
          </Button>
        </DialogContent>
      </Dialog>

      {/* PDF/Image Viewer Floating Tile */}
      {showPreviewModal && (
        <Suspense fallback={<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"><Loader2 className="w-8 h-8 text-[#d4af37] animate-spin" /></div>}>
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
      <SlidePanel
        open={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingDoc(null); setEditName(''); setEditCategory('legal'); setEditNotes(''); }}
        title="Edit Document"
        subtitle="Update the document metadata"
      >
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Document Name <span className="text-red-400">*</span></Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g., Last Will & Testament"
                className="input-field"
                data-testid="edit-document-name-input"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Category <span className="text-red-400">*</span></Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger className="input-field" data-testid="edit-document-category-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                  <SelectItem value="will">Will</SelectItem>
                  <SelectItem value="trust">Trust</SelectItem>
                  <SelectItem value="living_will">Living Will / Healthcare Directive</SelectItem>
                  <SelectItem value="life_insurance">Life Insurance</SelectItem>
                  <SelectItem value="deed">Deed / Title</SelectItem>
                  <SelectItem value="poa">Power of Attorney</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="medical">Medical / Healthcare Directive</SelectItem>
                  <SelectItem value="legal">Legal (Other)</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Notes (Optional)</Label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add any notes about this document..."
                className="input-field min-h-[80px]"
                rows={3}
                data-testid="edit-document-notes-input"
              />
            </div>
            
            {editingDoc && (
              <div className="p-3 bg-[var(--s)] rounded-xl">
                <p className="text-xs text-[#64748b]">File info</p>
                <p className="text-sm text-white">{editingDoc.file_type} · {editingDoc.file_size ? `${(editingDoc.file_size / 1024).toFixed(1)} KB` : 'Unknown size'}</p>
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowEditModal(false)}
              className="border-[var(--b)] text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditDocument}
              disabled={saving || !editName}
              className="gold-button"
              data-testid="edit-document-submit-button"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Edit2 className="w-5 h-5 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
      </SlidePanel>

      {/* Set Lock Modal */}
      <Dialog open={showSetLockModal} onOpenChange={(open) => { setShowSetLockModal(open); if (!open) { setNewLockPassword(''); setConfirmLockPassword(''); setShowPwEye(false); } }}>
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-sm !top-[10vh] !translate-y-0">
          <DialogHeader>
            <DialogTitle className="text-white text-lg flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              <Lock className="w-5 h-5 text-[#ef4444]" />
              Lock Document
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              Set a password for "{selectedDoc?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-[#94a3b8] text-sm">Password (min 4 characters) <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Input
                  type={showPwEye ? 'text' : 'password'}
                  value={newLockPassword}
                  onChange={(e) => setNewLockPassword(e.target.value)}
                  placeholder="Enter a password"
                  className="input-field pr-10"
                  data-testid="set-lock-password"
                />
                <button type="button" onClick={() => setShowPwEye(!showPwEye)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                  {showPwEye ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#94a3b8] text-sm">Confirm Password <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Input
                  type={showPwEye ? 'text' : 'password'}
                  value={confirmLockPassword}
                  onChange={(e) => setConfirmLockPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="input-field pr-10"
                  data-testid="confirm-lock-password"
                />
                <button type="button" onClick={() => setShowPwEye(!showPwEye)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                  {showPwEye ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {newLockPassword && confirmLockPassword && newLockPassword !== confirmLockPassword && (
              <p className="text-xs text-[#ef4444]">Passwords do not match</p>
            )}
            <Button
              onClick={handleSetLock}
              disabled={lockingDoc || newLockPassword.length < 4 || newLockPassword !== confirmLockPassword}
              className="w-full"
              style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white' }}
              data-testid="confirm-set-lock"
            >
              {lockingDoc ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
              Lock Document
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Lock Confirmation */}
      <Dialog open={showRemoveLockConfirm} onOpenChange={setShowRemoveLockConfirm}>
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white text-lg flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              <Unlock className="w-5 h-5 text-[#10b981]" />
              Remove Lock
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              Remove password protection from "{selectedDoc?.name}"? Anyone with vault access will be able to view it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 border-[var(--b)] text-[var(--t3)]" onClick={() => setShowRemoveLockConfirm(false)}>Cancel</Button>
            <Button
              onClick={handleRemoveLock}
              disabled={lockingDoc}
              className="flex-1"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white' }}
              data-testid="confirm-remove-lock"
            >
              {lockingDoc ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
              Remove Lock
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      </SectionLockedOverlay>

      {/* Invite prompt after first upload */}
      {showReturnPopup && (
        <ReturnPopup step="document" onReturn={() => { setShowReturnPopup(false); navigate('/dashboard'); }}
          onAlternate={() => { setShowReturnPopup(false); setShowUploadModal(true); }} />
      )}

      {showInvitePrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowInvitePrompt(false)} />
          <div className="relative rounded-2xl p-6 max-w-sm w-full text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.2)' }}>
              <Heart className="w-8 h-8 text-[#d4af37]" />
            </div>
            <h3 className="text-xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Your Estate Plan Has Begun</h3>
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
