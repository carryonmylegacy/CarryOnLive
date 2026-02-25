import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield,
  FileKey,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Skeleton } from '../components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AdminPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [confirmApproval, setConfirmApproval] = useState(null);

  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    try {
      const response = await axios.get(`${API_URL}/transition/certificates`, getAuthHeaders());
      setCertificates(response.data);
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load certificates');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (certificateId) => {
    setApproving(certificateId);
    try {
      await axios.post(`${API_URL}/transition/approve/${certificateId}`, {}, getAuthHeaders());
      toast.success('Certificate approved, estate transitioned');
      setCertificates(certificates.filter(c => c.id !== certificateId));
    } catch (error) {
      console.error('Approve error:', error);
      toast.error('Failed to approve certificate');
    } finally {
      setApproving(null);
      setConfirmApproval(null);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 animate-fade-in">
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 mx-auto text-[#ef4444] mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Access Denied</h3>
            <p className="text-[#94a3b8]">
              You do not have permission to access the admin panel.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-white/5" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32 bg-white/5 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in" data-testid="admin-dashboard">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
          <Shield className="w-6 h-6 text-[#d4af37]" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Admin Dashboard
          </h1>
          <p className="text-[#94a3b8]">
            Review and approve estate transitions
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#f59e0b]/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-[#f59e0b]" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{certificates.length}</p>
                <p className="text-[#94a3b8] text-sm">Pending Reviews</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#10b981]/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-[#10b981]" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">--</p>
                <p className="text-[#94a3b8] text-sm">Approved Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#3b82f6]/20 flex items-center justify-center">
                <FileKey className="w-6 h-6 text-[#3b82f6]" />
              </div>
              <div>
                <p className="text-3xl font-bold text-white">--</p>
                <p className="text-[#94a3b8] text-sm">Total Processed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Certificates */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileKey className="w-5 h-5 text-[#d4af37]" />
            Pending Death Certificates
          </CardTitle>
        </CardHeader>
        <CardContent>
          {certificates.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-16 h-16 mx-auto text-[#10b981] mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">All Caught Up!</h3>
              <p className="text-[#94a3b8]">
                No pending certificates to review.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {certificates.map((cert) => (
                <div
                  key={cert.id}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-xl"
                  data-testid={`certificate-${cert.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#f59e0b]/20 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-[#f59e0b]" />
                    </div>
                    <div>
                      <h4 className="text-white font-medium">{cert.file_name}</h4>
                      <p className="text-[#94a3b8] text-sm">
                        Estate ID: {cert.estate_id.substring(0, 8)}... · 
                        Uploaded {new Date(cert.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="border-white/10 text-white">
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </Button>
                    <Button
                      className="gold-button"
                      onClick={() => setConfirmApproval(cert.id)}
                      disabled={approving === cert.id}
                      data-testid={`approve-${cert.id}`}
                    >
                      {approving === cert.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Approve
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmApproval} onOpenChange={() => setConfirmApproval(null)}>
        <AlertDialogContent className="glass-card border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-[#f59e0b]" />
              Confirm Approval
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#94a3b8]">
              Are you sure you want to approve this death certificate? This will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Transition the estate to beneficiaries</li>
                <li>Deliver all immediate messages</li>
                <li>Grant document access to beneficiaries</li>
              </ul>
              <span className="block mt-3 text-[#f59e0b]">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleApprove(confirmApproval)}
              className="gold-button"
            >
              Confirm Approval
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminPage;
