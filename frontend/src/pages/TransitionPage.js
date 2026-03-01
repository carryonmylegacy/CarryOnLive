import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  FileKey,
  Upload,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Shield,
  Loader2,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { toast } from '../../utils/toast';
import { Skeleton } from '../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TransitionPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const [estate, setEstate] = useState(null);
  const [transitionStatus, setTransitionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      if (estatesRes.data.length > 0) {
        setEstate(estatesRes.data[0]);
        const statusRes = await axios.get(`${API_URL}/transition/status/${estatesRes.data[0].id}`, getAuthHeaders());
        setTransitionStatus(statusRes.data);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load transition status');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      await axios.post(
        `${API_URL}/transition/upload-certificate?estate_id=${estate.id}`,
        formData,
        {
          ...getAuthHeaders(),
          headers: {
            ...getAuthHeaders().headers,
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      
      // toast removed
      setShowUploadModal(false);
      setSelectedFile(null);
      fetchData();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload certificate');
    } finally {
      setUploading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'text-[#10b981]';
      case 'pending': return 'text-[#f59e0b]';
      case 'rejected': return 'text-[#ef4444]';
      default: return 'text-[#64748b]';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved': return CheckCircle2;
      case 'pending': return Clock;
      case 'rejected': return XCircle;
      default: return AlertCircle;
    }
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-[var(--s)]" />
        <Skeleton className="h-64 w-full bg-[var(--s)] rounded-2xl" />
      </div>
    );
  }

  const StatusIcon = transitionStatus?.certificate ? getStatusIcon(transitionStatus.certificate.status) : AlertCircle;

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in" data-testid="estate-transition">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Estate Transition
        </h1>
        <p className="text-[#94a3b8] mt-1">
          Manage the secure transition of your estate to beneficiaries
        </p>
      </div>

      {/* Current Status Card */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-3">
            <Shield className="w-6 h-6 text-[#d4af37]" />
            Estate Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
              estate?.status === 'transitioned' 
                ? 'bg-[#10b981]/20' 
                : 'bg-[#f59e0b]/20'
            }`}>
              {estate?.status === 'transitioned' ? (
                <CheckCircle2 className="w-8 h-8 text-[#10b981]" />
              ) : (
                <Clock className="w-8 h-8 text-[#f59e0b]" />
              )}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white capitalize" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {estate?.status?.replace('-', ' ') || 'Unknown'}
              </h3>
              <p className="text-[#94a3b8]">
                {estate?.status === 'transitioned' 
                  ? 'Your estate has been transitioned to beneficiaries'
                  : 'Your estate is currently being prepared'}
              </p>
            </div>
          </div>

          {estate?.status !== 'transitioned' && (
            <div className="p-4 bg-[var(--s)] rounded-xl border border-[var(--b)]">
              <h4 className="text-white font-medium mb-2">Important Information</h4>
              <p className="text-[#94a3b8] text-sm">
                When the time comes, an executor or family member can upload a death certificate to initiate the estate transition. 
                This will be reviewed by our team before beneficiaries gain access to the estate documents and messages.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Certificate Status */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-3">
            <FileKey className="w-6 h-6 text-[#d4af37]" />
            Death Certificate
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transitionStatus?.certificate ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-[var(--s)] rounded-xl">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  transitionStatus.certificate.status === 'approved' ? 'bg-[#10b981]/20' :
                  transitionStatus.certificate.status === 'pending' ? 'bg-[#f59e0b]/20' : 'bg-[#ef4444]/20'
                }`}>
                  <StatusIcon className={`w-6 h-6 ${getStatusColor(transitionStatus.certificate.status)}`} />
                </div>
                <div>
                  <h4 className="text-white font-medium">{transitionStatus.certificate.file_name}</h4>
                  <p className={`text-sm ${getStatusColor(transitionStatus.certificate.status)}`}>
                    Status: {transitionStatus.certificate.status.charAt(0).toUpperCase() + transitionStatus.certificate.status.slice(1)}
                  </p>
                </div>
              </div>

              {transitionStatus.certificate.status === 'pending' && (
                <div className="p-4 bg-[#f59e0b]/10 rounded-xl border border-[#f59e0b]/20">
                  <div className="flex items-center gap-2 text-[#f59e0b] mb-2">
                    <Clock className="w-4 h-4" />
                    <span className="font-medium">Under Review</span>
                  </div>
                  <p className="text-[#94a3b8] text-sm">
                    Your death certificate is being reviewed by our team. This process typically takes 1-2 business days.
                  </p>
                </div>
              )}

              {transitionStatus.certificate.status === 'approved' && (
                <div className="p-4 bg-[#10b981]/10 rounded-xl border border-[#10b981]/20">
                  <div className="flex items-center gap-2 text-[#10b981] mb-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="font-medium">Certificate Approved</span>
                  </div>
                  <p className="text-[#94a3b8] text-sm">
                    The death certificate has been verified. Beneficiaries now have access to the estate.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-16 h-16 mx-auto text-[#64748b] mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Certificate Uploaded</h3>
              <p className="text-[#94a3b8] mb-6 max-w-md mx-auto">
                When needed, upload a death certificate to initiate the estate transition process. 
                This will allow designated beneficiaries to access the estate.
              </p>
              <Button
                className="gold-button"
                onClick={() => setShowUploadModal(true)}
                data-testid="upload-certificate-button"
              >
                <Upload className="w-5 h-5 mr-2" />
                Upload Death Certificate
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-md !top-[5vh] !translate-y-0">
          <DialogHeader>
            <DialogTitle className="text-white text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Upload Death Certificate
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              This document will be reviewed by our team before the estate transition is completed.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6">
            <div className="border-2 border-dashed border-[var(--b)] rounded-xl p-8 text-center hover:border-[#d4af37]/50 transition-colors">
              <input
                type="file"
                id="certificate-upload"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setSelectedFile(e.target.files[0])}
                data-testid="certificate-file-input"
              />
              <label htmlFor="certificate-upload" className="cursor-pointer">
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="w-6 h-6 text-[#d4af37]" />
                    <span className="text-white">{selectedFile.name}</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 mx-auto text-[#64748b] mb-3" />
                    <p className="text-white">Click to upload death certificate</p>
                    <p className="text-[#64748b] text-sm mt-1">PDF, JPG, or PNG</p>
                  </>
                )}
              </label>
            </div>
            
            <div className="mt-4 p-3 bg-[#f59e0b]/10 rounded-xl">
              <p className="text-[#f59e0b] text-sm">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                This action is irreversible. Please ensure the certificate is valid and authentic.
              </p>
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowUploadModal(false);
                setSelectedFile(null);
              }}
              className="border-[var(--b)] text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              className="gold-button"
              data-testid="submit-certificate-button"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mr-2" />
                  Submit for Review
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TransitionPage;
