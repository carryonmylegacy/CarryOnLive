import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileKey, CheckCircle2, Eye, XCircle, Loader2, AlertTriangle, Search, X, Trash2, EyeOff, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const TransitionTab = ({ getAuthHeaders }) => {
  const { user } = useAuth();
  const isFounder = user?.role === 'admin' && !window.location.pathname.startsWith('/ops');
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingDoc, setViewingDoc] = useState(null);
  const [docLoading, setDocLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  useEffect(() => {
    fetchCertificates();
  }, [showDeleted]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCertificates = async () => {
    try {
      const url = isFounder && showDeleted
        ? `${API_URL}/transition/certificates/all?include_deleted=true`
        : `${API_URL}/transition/certificates/all`;
      const res = await axios.get(url, getAuthHeaders());
      setCertificates(res.data);
    } catch (err) {
      console.error('Failed to fetch certificates:', err);
      setCertificates([]);
    } finally {
      setLoading(false);
    }
  };

  const viewDocument = async (cert) => {
    setDocLoading(true);
    try {
      const res = await axios.get(`${API_URL}/transition/certificate/${cert.id}/document`, {
        ...getAuthHeaders(),
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'image/png' });
      const url = URL.createObjectURL(blob);
      setViewingDoc({ url, name: cert.file_name, type: res.headers['content-type'] });
    } catch (err) {
      console.error('Failed to load document:', err);
      toast.error('Failed to load certificate document');
    } finally {
      setDocLoading(false);
    }
  };

  const closeDocViewer = () => {
    if (viewingDoc?.url) URL.revokeObjectURL(viewingDoc.url);
    setViewingDoc(null);
  };

  const handleBeginReview = async (certId) => {
    setActionLoading(certId);
    try {
      await axios.post(`${API_URL}/transition/begin-review/${certId}`, {}, getAuthHeaders());
      // toast removed
      fetchCertificates();
    } catch (err) { toast.error('Failed to begin review'); }
    finally { setActionLoading(null); }
  };

  const handleApproveCert = async (certId) => {
    setActionLoading(certId);
    try {
      await axios.post(`${API_URL}/transition/approve/${certId}`, {}, getAuthHeaders());
      // toast removed
      fetchCertificates();
    } catch (err) { toast.error('Failed to approve'); }
    finally { setActionLoading(null); }
  };

  const handleRejectCert = async (certId) => {
    if (!window.confirm('Reject this death certificate?')) return;
    setActionLoading(certId);
    try {
      await axios.post(`${API_URL}/transition/reject/${certId}`, {}, getAuthHeaders());
      // toast removed
      fetchCertificates();
    } catch (err) { toast.error('Failed to reject'); }
    finally { setActionLoading(null); }
  };

  const handleDeleteCert = async () => {
    if (!deleteTarget) return;
    // Founder with password = permanent delete (with transition reversal)
    if (isFounder && deletePassword) {
      setDeleteLoading(true);
      try {
        await axios.delete(`${API_URL}/transition/certificates/${deleteTarget.id}?admin_password=${encodeURIComponent(deletePassword)}`, getAuthHeaders());
        toast.success('Certificate permanently deleted — transition reversed');
        setDeleteTarget(null);
        setDeletePassword('');
        fetchCertificates();
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to delete');
      } finally { setDeleteLoading(false); }
    } else {
      // Soft delete (operator or founder without password)
      setDeleteLoading(true);
      try {
        await axios.post(`${API_URL}/transition/certificates/${deleteTarget.id}/soft-delete`, {}, getAuthHeaders());
        toast.success('Certificate deleted');
        setDeleteTarget(null);
        setDeletePassword('');
        fetchCertificates();
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to delete');
      } finally { setDeleteLoading(false); }
    }
  };

  const handleSoftDelete = async (certId) => {
    if (!window.confirm('Delete this certificate?')) return;
    try {
      await axios.post(`${API_URL}/transition/certificates/${certId}/soft-delete`, {}, getAuthHeaders());
      toast.success('Certificate deleted');
      fetchCertificates();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  const handleRestore = async (certId) => {
    try {
      await axios.post(`${API_URL}/transition/certificates/${certId}/restore`, {}, getAuthHeaders());
      toast.success('Certificate restored');
      fetchCertificates();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to restore');
    }
  };


  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>;

  const filtered = certificates.filter(cert => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (cert.estate_name || '').toLowerCase().includes(q) ||
      (cert.uploader_name || cert.uploaded_by || '').toLowerCase().includes(q) ||
      (cert.file_name || '').toLowerCase().includes(q) ||
      (cert.status || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4" data-testid="admin-transition-tab">
      <div className="rounded-xl p-4" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[var(--pr2)] mb-2">Transition Verification Team</h3>
            <p className="text-sm text-[var(--t3)] leading-relaxed">
              Review uploaded death certificates. Upon approval, the benefactor's account is immutably sealed and all designated beneficiary access is granted as specified.
            </p>
          </div>
          {isFounder && (
            <button
              onClick={() => setShowDeleted(!showDeleted)}
              className="text-[10px] font-bold px-2 py-1 rounded flex-shrink-0"
              style={{
                background: showDeleted ? 'rgba(239,68,68,0.1)' : 'var(--s)',
                color: showDeleted ? '#ef4444' : 'var(--t5)',
                border: `1px solid ${showDeleted ? 'rgba(239,68,68,0.2)' : 'var(--b)'}`
              }}
              data-testid="tvt-show-deleted-toggle"
            >
              {showDeleted ? 'Showing Deleted' : 'Show Deleted'}
            </button>
          )}
        </div>
      </div>

      {certificates.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
          <Search className="w-4 h-4 text-[var(--t5)]" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by estate, uploader, file, status..." className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]" data-testid="transition-search" />
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-12 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-[var(--gn2)] mb-4" />
          <h3 className="font-bold text-[var(--t)] mb-2">No Certificates to Review</h3>
          <p className="text-sm text-[var(--t4)]">All transition certificates have been processed.</p>
        </CardContent></Card>
      ) : (
        filtered.map(cert => {
          const isDeleted = cert.soft_deleted;
          return (
          <Card key={cert.id} className={`glass-card ${isDeleted ? 'opacity-50' : ''}`}
            style={isDeleted ? { background: 'rgba(239,68,68,0.04)' } : {}}
            data-testid={`cert-${cert.id}`}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cert.status === 'pending' ? 'rgba(245,158,11,0.2)' : cert.status === 'approved' ? 'rgba(16,185,129,0.2)' : 'rgba(240,82,82,0.2)' }}>
                  <FileKey className="w-6 h-6" style={{ color: cert.status === 'pending' ? '#F59E0B' : cert.status === 'approved' ? '#22C993' : '#ef4444' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-[var(--t)] truncate">{cert.estate_name || 'Unknown Estate'}</h3>
                    {isDeleted && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--rdbg)] text-[var(--rd)] font-bold">DELETED</span>}
                  </div>
                  <p className="text-sm text-[var(--t4)] truncate">Uploaded by: {cert.uploader_name || cert.uploaded_by}</p>
                  <p className="text-sm text-[var(--t4)] truncate">File: {cert.file_name}</p>
                  <p className="text-xs text-[var(--t5)] mt-1">{new Date(cert.created_at).toLocaleString()}</p>
                  <div className="mt-2">
                    <span className={`text-xs px-2 py-1 rounded-md font-bold capitalize ${
                      cert.status === 'pending' ? 'bg-[var(--ywbg)] text-[var(--yw)]' :
                      cert.status === 'approved' ? 'bg-[var(--gnbg)] text-[var(--gn2)]' :
                      'bg-[var(--rdbg)] text-[var(--rd)]'
                    }`}>{cert.status}</span>
                    {cert.estate_status && (
                      <span className="text-xs px-2 py-1 rounded-md font-bold ml-2" style={{ background: 'var(--s)', color: 'var(--t4)' }}>
                        Estate: {cert.estate_status}
                      </span>
                    )}
                  </div>
                </div>
                {isDeleted && isFounder ? (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleRestore(cert.id)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-[var(--gn2)] hover:bg-[var(--gnbg)] transition-colors"
                      data-testid={`restore-cert-${cert.id}`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restore
                    </button>
                  </div>
                ) : !isDeleted && cert.status === 'pending' ? (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button size="sm" className="text-xs" style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)', color: 'white' }}
                      onClick={() => handleBeginReview(cert.id)} disabled={actionLoading === cert.id}>
                      {actionLoading === cert.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />} Begin Review
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--bl3)]"
                      onClick={() => viewDocument(cert)} disabled={docLoading} data-testid={`view-cert-${cert.id}`}>
                      {docLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Eye className="w-3 h-3 mr-1" />} View Document
                    </Button>
                    <button onClick={() => handleSoftDelete(cert.id)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-[var(--rd)] hover:bg-[var(--rdbg)] transition-colors"
                      data-testid={`delete-cert-${cert.id}`}>
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                ) : !isDeleted && cert.status === 'reviewing' ? (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button size="sm" className="text-xs" style={{ background: 'linear-gradient(135deg, #22C993, #16a34a)', color: 'white' }}
                      onClick={() => handleApproveCert(cert.id)} disabled={actionLoading === cert.id}>
                      {actionLoading === cert.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />} Approve & Transition
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs border-[var(--rd)]/30 text-[var(--rd)]"
                      onClick={() => handleRejectCert(cert.id)} disabled={actionLoading === cert.id}>
                      <XCircle className="w-4 h-4 mr-1" /> Reject
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--bl3)]"
                      onClick={() => viewDocument(cert)} disabled={docLoading} data-testid={`view-cert-${cert.id}`}>
                      {docLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Eye className="w-3 h-3 mr-1" />} View Document
                    </Button>
                    <button onClick={() => handleSoftDelete(cert.id)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-[var(--rd)] hover:bg-[var(--rdbg)] transition-colors"
                      data-testid={`delete-cert-${cert.id}`}>
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                ) : !isDeleted && (cert.status === 'rejected' || cert.status === 'approved') ? (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--bl3)]"
                      onClick={() => viewDocument(cert)} disabled={docLoading}>
                      {docLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Eye className="w-3 h-3 mr-1" />} View Document
                    </Button>
                    <button onClick={() => handleSoftDelete(cert.id)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-[var(--rd)] hover:bg-[var(--rdbg)] transition-colors"
                      data-testid={`delete-cert-${cert.id}`}>
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                ) : null}
              </div>

              {!isDeleted && cert.status === 'pending' && (
                <div className="mt-4 rounded-xl p-3" style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.12)' }}>
                  <p className="text-xs text-[#7AABFD] leading-relaxed">
                    Click "Begin Review" to let the beneficiary know you are actively reviewing their submission. They will see this update in real time on their status page.
                  </p>
                </div>
              )}
              {!isDeleted && cert.status === 'reviewing' && (
                <div className="mt-4 rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
                  <p className="text-xs text-[var(--yw)] leading-relaxed">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    Upon approval: Benefactor account immutably sealed · All immediate messages delivered · Beneficiary access granted to vault, IAC, MM, and EGA. The beneficiary sees each step happen in real time.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          );
        })
      )}

      {/* Document Viewer Modal */}
      {viewingDoc && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={closeDocViewer}>
          <div className="bg-[var(--bg2)] rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}
            style={{ border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--b)]">
              <div>
                <h3 className="font-bold text-[var(--t)] text-sm" style={{ fontFamily: 'Outfit, sans-serif' }}>Death Certificate</h3>
                <p className="text-xs text-[var(--t5)]">{viewingDoc.name}</p>
              </div>
              <button onClick={closeDocViewer} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[var(--t4)] active:scale-90 transition-transform">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              {viewingDoc.type?.includes('pdf') ? (
                <iframe src={viewingDoc.url} className="w-full h-[70vh] rounded-lg" title="Certificate" />
              ) : (
                <img src={viewingDoc.url} alt="Death Certificate" className="w-full rounded-lg" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeletePassword(''); setShowDeletePassword(false); } }}>
        <DialogContent className="glass-card border-[var(--rd)]/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[var(--t)] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[var(--rd)]" />
              Delete Certificate
            </DialogTitle>
            <DialogDescription className="text-[var(--t4)]">
              {deleteTarget?.status === 'approved'
                ? 'This will reverse the transition — the benefactor account will be unlocked and all delivered messages will be undelivered.'
                : 'This will permanently delete this death certificate submission.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-[var(--t4)] mb-1 block">Enter your admin password to confirm</label>
              <div className="relative">
                <Input
                  type={showDeletePassword ? 'text' : 'password'}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Admin password"
                  className="bg-[var(--s)] border-[var(--b)] text-[var(--t)] pr-10"
                  data-testid="delete-cert-password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowDeletePassword(!showDeletePassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]"
                >
                  {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 border-[var(--b)] text-[var(--t)]" onClick={() => { setDeleteTarget(null); setDeletePassword(''); }}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-[var(--rd)] hover:bg-[var(--rd)]/90 text-white"
                disabled={!deletePassword || deleteLoading}
                onClick={handleDeleteCert}
                data-testid="confirm-delete-cert"
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
