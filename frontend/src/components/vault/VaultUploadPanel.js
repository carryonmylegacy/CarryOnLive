import React from 'react';
import {
  Upload, FileText, X, Loader2, Eye, EyeOff,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import SlidePanel from '../SlidePanel';
import { toast } from '../../utils/toast';

const VaultUploadPanel = ({
  open,
  onClose,
  uploadName,
  setUploadName,
  uploadCategory,
  setUploadCategory,
  uploadLockType,
  setUploadLockType,
  uploadLockPassword,
  setUploadLockPassword,
  uploadVoicePassphrase,
  setUploadVoicePassphrase,
  uploadFile,
  setUploadFile,
  showPwEye,
  setShowPwEye,
  uploading,
  handleUpload,
  uploadNameRef,
  isFileAllowed,
}) => {
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Upload Document"
      subtitle="Add a new document to your secure vault"
    >
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-[#94a3b8]">Document Name <span className="text-red-400">*</span></Label>
            <Input
              ref={uploadNameRef}
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
                {/* 4 essential offline slots — these are the gold-outlined
                    placeholders in the SDV. Keep their labels in sync with
                    EssentialOfflineSlots.js. */}
                <SelectItem value="living_will">Living Will</SelectItem>
                <SelectItem value="healthcare_directive">Healthcare Directive</SelectItem>
                <SelectItem value="general_poa">General Power of Attorney</SelectItem>
                <SelectItem value="financial_poa">Financial Power of Attorney</SelectItem>
                {/* Other POA variants — regular categories. */}
                <SelectItem value="durable_poa">Durable Power of Attorney</SelectItem>
                <SelectItem value="springing_poa">Springing Power of Attorney</SelectItem>
                <SelectItem value="limited_poa">Limited / Special Power of Attorney</SelectItem>
                {/* Generic / other categories. */}
                <SelectItem value="life_insurance">Life Insurance</SelectItem>
                <SelectItem value="deed">Deed / Title</SelectItem>
                <SelectItem value="poa">Power of Attorney (uncategorized)</SelectItem>
                <SelectItem value="financial">Financial</SelectItem>
                <SelectItem value="medical">Medical</SelectItem>
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
              <div className="relative">
                <Input
                  type={showPwEye ? 'text' : 'password'}
                  value={uploadLockPassword}
                  onChange={(e) => setUploadLockPassword(e.target.value)}
                  placeholder="Enter a secure password"
                  className="input-field pr-10"
                  style={{ fontSize: '16px' }}
                  data-testid="upload-password-input"
                />
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPwEye(!showPwEye)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)] hover:text-[var(--t)] transition-colors"
                  data-testid="upload-password-toggle">
                  {showPwEye ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
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
                  if (!isFileAllowed(file)) {
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
                accept="image/*,.pdf"
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
                    <FileText className="w-5 h-5 text-[var(--gold)] flex-shrink-0" />
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
            onClick={onClose}
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
  );
};

export default VaultUploadPanel;
