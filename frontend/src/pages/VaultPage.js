import React, { useState, useEffect } from 'react';
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
  CheckCircle2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
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
  const { user, getAuthHeaders } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showBackupCodeModal, setShowBackupCodeModal] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockBackupCode, setUnlockBackupCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [backupCode, setBackupCode] = useState('');
  
  // Upload form state
  const [uploadName, setUploadName] = useState('');
  const [uploadCategory, setUploadCategory] = useState('legal');
  const [uploadLockType, setUploadLockType] = useState('none');
  const [uploadLockPassword, setUploadLockPassword] = useState('');
  const [uploadFile, setUploadFile] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      if (estatesRes.data.length > 0) {
        setEstate(estatesRes.data[0]);
        const docsRes = await axios.get(`${API_URL}/documents/${estatesRes.data[0].id}`, getAuthHeaders());
        setDocuments(docsRes.data);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load documents');
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
      
      toast.success('Document unlocked! You can now download it.');
      setShowLockModal(false);
      setUnlockPassword('');
      setUnlockBackupCode('');
      
      // Trigger download after unlock
      handleDownload(selectedDoc, unlockPassword, unlockBackupCode);
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

  const copyBackupCode = () => {
    navigator.clipboard.writeText(backupCode);
    toast.success('Backup code copied to clipboard');
  };

  const resetUploadForm = () => {
    setUploadName('');
    setUploadCategory('legal');
    setUploadLockType('none');
    setUploadLockPassword('');
    setUploadFile(null);
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

  const filteredDocs = activeCategory === 'all' 
    ? documents 
    : documents.filter(d => d.category === activeCategory);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-white/5" />
        <Skeleton className="h-12 w-full bg-white/5" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-40 bg-white/5 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in" data-testid="document-vault">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Document Vault
          </h1>
          <p className="text-[#94a3b8] mt-1">
            Securely store and organize your important documents
          </p>
        </div>
        <Button
          className="gold-button"
          onClick={() => setShowUploadModal(true)}
          data-testid="upload-document-button"
        >
          <Upload className="w-5 h-5 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="bg-white/5 p-1">
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
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-[#94a3b8] hover:text-white"
                          onClick={() => doc.is_locked ? (setSelectedDoc(doc), setShowLockModal(true)) : handleDownload(doc)}
                          disabled={downloading === doc.id}
                        >
                          {downloading === doc.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </Button>
                        {user?.role === 'benefactor' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[#ef4444] hover:text-[#ef4444]"
                            onClick={() => handleDelete(doc.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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
        <DialogContent className="glass-card border-white/10 sm:max-w-md">
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
                <SelectContent className="bg-[#0f1d35] border-white/10">
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
                <SelectContent className="bg-[#0f1d35] border-white/10">
                  <SelectItem value="none">No Lock</SelectItem>
                  <SelectItem value="password">Password Protected</SelectItem>
                  <SelectItem value="voice">Voice Verification</SelectItem>
                  <SelectItem value="backup">Backup Key Required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">File</Label>
              <div className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center hover:border-[#d4af37]/50 transition-colors">
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
              className="border-white/10 text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || !uploadFile || !uploadName}
              className="gold-button"
              data-testid="upload-submit-button"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Uploading...
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
      <Dialog open={showLockModal} onOpenChange={setShowLockModal}>
        <DialogContent className="glass-card border-white/10 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Unlock Document
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              {selectedDoc?.lock_type === 'password' && 'Enter the password to access this document'}
              {selectedDoc?.lock_type === 'voice' && 'Use voice verification to unlock'}
              {selectedDoc?.lock_type === 'backup' && 'Enter your backup key'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6 text-center">
            <Shield className="w-16 h-16 mx-auto text-[#d4af37] mb-4" />
            <p className="text-[#94a3b8]">
              This document is protected with {selectedDoc?.lock_type} security.
            </p>
            <Input
              type="password"
              placeholder={selectedDoc?.lock_type === 'password' ? 'Enter password' : 'Enter backup key'}
              className="input-field mt-4"
            />
          </div>
          
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowLockModal(false)}
              className="border-white/10 text-white"
            >
              Cancel
            </Button>
            <Button className="gold-button">
              <Unlock className="w-5 h-5 mr-2" />
              Unlock
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VaultPage;
