import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
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
  Mic,
  MicOff,
  Volume2,
  Search,
  FolderLock,
  Edit2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const categories = [
  { id: 'all', label: 'All Documents', icon: FolderOpen },
  { id: 'legal', label: 'Legal', icon: FileText },
  { id: 'financial', label: 'Financial', icon: File },
  { id: 'personal', label: 'Personal', icon: FileImage },
  { id: 'medical', label: 'Medical', icon: FileArchive },
];

const VaultPage = () => {
  const { user, getAuthHeaders, token } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showBackupCodeModal, setShowBackupCodeModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showVoiceSetupModal, setShowVoiceSetupModal] = useState(false);
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

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      if (estatesRes.data.length > 0) {
        setEstate(estatesRes.data[0]);
        const docsRes = await axios.get(`${API_URL}/documents/${estatesRes.data[0].id}`, getAuthHeaders()).catch(() => ({ data: [] }));
        setDocuments(Array.isArray(docsRes.data) ? docsRes.data : []);
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadName) {
      toast.error('Please fill all required fields');
      return;
    }
    
    if (uploadLockType === 'password' && !uploadLockPassword) {
      toast.error('Please set a password for the locked document');
      return;
    }
    
    if (uploadLockType === 'voice' && !uploadVoicePassphrase) {
      toast.error('Please set a voice passphrase for voice verification');
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
      
      toast.success('Document uploaded and encrypted successfully');
      
      // Show backup code if provided
      if (response.data.backup_code) {
        setBackupCode(response.data.backup_code);
        setShowBackupCodeModal(true);
      }
      
      setShowUploadModal(false);
      resetUploadForm();
      fetchData();
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
      
      toast.success('Document unlocked! You can now view or download it.');
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

  const handleDownload = async (doc, password = null, backupCode = null) => {
    setDownloading(doc.id);
    try {
      let url = `${API_URL}/documents/${doc.id}/download`;
      const params = [];
      if (password) params.push(`password=${encodeURIComponent(password)}`);
      if (backupCode) params.push(`backup_code=${encodeURIComponent(backupCode)}`);
      if (params.length > 0) url += `?${params.join('&')}`;
      
      const response = await axios.get(url, {
        ...getAuthHeaders(),
        responseType: 'blob'
      });
      
      // Create download link
      const blob = new Blob([response.data], { type: doc.file_type });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      toast.success('Document downloaded');
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
    if (!confirm('Are you sure you want to delete this document?')) return;
    
    try {
      await axios.delete(`${API_URL}/documents/${docId}`, getAuthHeaders());
      toast.success('Document deleted');
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
      
      toast.success('Document updated successfully');
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
    toast.success('Backup code copied to clipboard');
  };

  const resetUploadForm = () => {
    setUploadName('');
    setUploadCategory('legal');
    setUploadLockType('none');
    setUploadLockPassword('');
    setUploadVoicePassphrase('');
    setUploadFile(null);
  };

  // Preview functions
  const handlePreview = async (doc, password = null, backupCode = null) => {
    // Check if file type is previewable
    const previewableTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!previewableTypes.some(type => doc.file_type?.includes(type.split('/')[1]))) {
      toast.error('This file type cannot be previewed. Please download instead.');
      return;
    }
    
    setSelectedDoc(doc);
    setPreviewLoading(true);
    setShowPreviewModal(true);
    
    try {
      let url = `${API_URL}/documents/${doc.id}/preview`;
      const params = [];
      if (password) params.push(`password=${encodeURIComponent(password)}`);
      if (backupCode) params.push(`backup_code=${encodeURIComponent(backupCode)}`);
      if (params.length > 0) url += `?${params.join('&')}`;
      
      const response = await axios.get(url, {
        ...getAuthHeaders(),
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: doc.file_type });
      const objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    } catch (error) {
      console.error('Preview error:', error);
      if (error.response?.status === 401) {
        setShowPreviewModal(false);
        setShowLockModal(true);
      } else {
        toast.error('Failed to preview document');
        setShowPreviewModal(false);
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
      
      toast.success('Voice verified! Downloading document...');
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

  const isPreviewable = (fileType) => {
    return fileType?.includes('pdf') || fileType?.includes('image');
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredDocs = documents
    .filter(d => activeCategory === 'all' || d.category === activeCategory)
    .filter(d => !searchQuery || d.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6">
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
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="document-vault"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(37,99,235,0.15), transparent 55%), radial-gradient(ellipse at bottom right, rgba(59,130,246,0.08), transparent 55%)' }}>
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
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search documents..."
          className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]"
          data-testid="vault-search"
        />
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="bg-[var(--s)] p-1 w-max sm:w-auto">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat.id}
              value={cat.id}
              className="data-[state=active]:bg-[#d4af37] data-[state=active]:text-[#0b1120]"
              data-testid={`category-${cat.id}`}
            >
              <cat.icon className="w-4 h-4 mr-2" />
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>
        </div>
        <TabsContent value={activeCategory} className="mt-6">
          {filteredDocs.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-12 text-center">
                <FolderOpen className="w-16 h-16 mx-auto text-[#64748b] mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No documents yet</h3>
                <p className="text-[#94a3b8] mb-6">
                  Upload your first document to get started
                </p>
                <Button
                  className="gold-button"
                  onClick={() => setShowUploadModal(true)}
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Upload Document
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocs.map((doc) => {
                const FileIcon = getFileIcon(doc.file_type);
                return (
                  <Card
                    key={doc.id}
                    className="glass-card relative overflow-hidden group"
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
                    
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
                          <FileIcon className="w-6 h-6 text-[#d4af37]" />
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.is_locked ? (
                            <Lock className="w-4 h-4 text-[#f59e0b]" />
                          ) : (
                            <Unlock className="w-4 h-4 text-[#10b981]" />
                          )}
                        </div>
                      </div>
                      
                      <h3 className="text-white font-medium mb-1 truncate">{doc.name}</h3>
                      <p className="text-[#64748b] text-sm mb-3">
                        {formatFileSize(doc.file_size)} · {doc.category}
                      </p>
                      
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isPreviewable(doc.file_type) && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-[#3b82f6] hover:text-[#60a5fa]"
                            onClick={() => doc.is_locked ? (setSelectedDoc(doc), setShowLockModal(true)) : handlePreview(doc)}
                            title="Preview"
                            aria-label="Preview document"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-[#94a3b8] hover:text-white"
                          onClick={() => doc.is_locked ? (setSelectedDoc(doc), setShowLockModal(true)) : handleDownload(doc)}
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
                              className="text-[#d4af37] hover:text-[#f5d050]"
                              onClick={() => openEditModal(doc)}
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
                              onClick={() => handleDelete(doc.id)}
                              title="Delete"
                              aria-label="Delete document"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Upload Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-md !top-[5vh] !translate-y-0 max-h-[90vh] overflow-y-scroll">
          <DialogHeader>
            <DialogTitle className="text-white text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Upload Document
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              Add a new document to your secure vault
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Document Name</Label>
              <Input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g., Last Will & Testament"
                className="input-field"
                data-testid="upload-name-input"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Category</Label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger className="input-field" data-testid="upload-category-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2440] border-[var(--b)]">
                  <SelectItem value="legal">Legal</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="medical">Medical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Security Lock (Optional)</Label>
              <Select value={uploadLockType} onValueChange={setUploadLockType}>
                <SelectTrigger className="input-field" data-testid="upload-lock-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2440] border-[var(--b)]">
                  <SelectItem value="none">No Lock</SelectItem>
                  <SelectItem value="password">Password Protected</SelectItem>
                  <SelectItem value="voice">Voice Verification</SelectItem>
                  <SelectItem value="backup">Backup Key Required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {uploadLockType === 'password' && (
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">Set Document Password</Label>
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
                <Label className="text-[#94a3b8]">Set Voice Passphrase</Label>
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
              <Label className="text-[#94a3b8]">File</Label>
              <div className="border-2 border-dashed border-[var(--b)] rounded-xl p-6 text-center hover:border-[#d4af37]/50 transition-colors">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  onChange={(e) => setUploadFile(e.target.files[0])}
                  data-testid="upload-file-input"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  {uploadFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="w-5 h-5 text-[#d4af37]" />
                      <span className="text-white">{uploadFile.name}</span>
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
                      <p className="text-[#64748b] text-sm mt-1">PDF, DOC, JPG, PNG up to 10MB</p>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
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
        </DialogContent>
      </Dialog>

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
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-md !top-[5vh] !translate-y-0 max-h-[90vh] overflow-y-scroll">
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
                <Label className="text-[#94a3b8]">Password</Label>
                <Input
                  type="password"
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  placeholder="Enter document password"
                  className="input-field"
                  data-testid="unlock-password-input"
                />
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
                    <span className="bg-[#1A2440] px-2 text-[#64748b]">Or use backup code</span>
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

      {/* Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={closePreview}>
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-4xl max-h-[90vh] !top-[5vh] !translate-y-0 overflow-y-scroll">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              <Eye className="w-5 h-5 text-[#d4af37]" />
              Document Preview
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              {selectedDoc?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {previewLoading ? (
              <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin text-[#d4af37]" />
              </div>
            ) : previewUrl ? (
              <div className="max-h-[60vh] overflow-auto rounded-xl bg-white">
                {selectedDoc?.file_type?.includes('pdf') ? (
                  <iframe
                    src={previewUrl}
                    className="w-full h-[60vh]"
                    title="Document Preview"
                  />
                ) : selectedDoc?.file_type?.includes('image') ? (
                  <img
                    src={previewUrl}
                    alt={selectedDoc?.name}
                    className="w-full h-auto max-h-[60vh] object-contain"
                  />
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    Preview not available for this file type
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-96 text-[#94a3b8]">
                No preview available
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={closePreview}
              className="border-[var(--b)] text-white"
            >
              Close
            </Button>
            <Button
              onClick={() => {
                closePreview();
                handleDownload(selectedDoc);
              }}
              className="gold-button"
            >
              <Download className="w-5 h-5 mr-2" />
              Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Document Modal */}
      <Dialog open={showEditModal} onOpenChange={(open) => {
        setShowEditModal(open);
        if (!open) {
          setEditingDoc(null);
          setEditName('');
          setEditCategory('legal');
          setEditNotes('');
        }
      }}>
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              <Edit2 className="w-5 h-5 text-[#d4af37]" />
              Edit Document
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              Update the document metadata
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Document Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g., Last Will & Testament"
                className="input-field"
                data-testid="edit-document-name-input"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger className="input-field" data-testid="edit-document-category-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2440] border-[var(--b)]">
                  <SelectItem value="legal">Legal</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="medical">Medical</SelectItem>
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
          
          <div className="flex justify-end gap-3">
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
        </DialogContent>
      </Dialog>
      </SectionLockedOverlay>
    </div>
  );
};

export default VaultPage;
