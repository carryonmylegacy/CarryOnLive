import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileKey, Activity, Loader2, X, Search, ToggleLeft, ToggleRight, Bell, Check, Trash2, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const VerificationsTab = ({ getAuthHeaders }) => {
  const { user } = useAuth();
  const isFounder = user?.role === 'admin' && !window.location.pathname.startsWith('/ops');
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState({});
  const [viewingDoc, setViewingDoc] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifying, setNotifying] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const headers = getAuthHeaders()?.headers || {};

  useEffect(() => { fetchVerifications(); }, [showDeleted]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchVerifications = async () => {
    try {
      const url = isFounder && showDeleted
        ? `${API_URL}/admin/verifications?include_deleted=true`
        : `${API_URL}/admin/verifications`;
      const res = await axios.get(url, { headers });
      setVerifications(res.data);
    } catch (err) { toast.error('Failed to load verifications'); }
    setLoading(false);
  };

  const toggleApproval = async (v) => {
    const newAction = v.status === 'approved' ? 'deny' : 'approve';
    try {
      await axios.post(`${API_URL}/admin/verifications/${v.id}/review`, {
        action: newAction,
        notes: reviewNotes[v.id] || '',
      }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      // toast removed
      fetchVerifications();
    } catch (err) { toast.error(err.response?.data?.detail || 'Review failed'); }
  };

  const notifyBenefactor = async (v) => {
    setNotifying(v.id);
    try {
      await axios.post(`${API_URL}/admin/verifications/${v.id}/notify`, {}, { headers });
      // toast removed
      fetchVerifications();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to send notification'); }
    setNotifying(null);
  };

  const viewDocument = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/admin/verifications/${id}/document`, { headers });
      setViewingDoc(res.data);
    } catch (err) { toast.error('Failed to load document'); }
  };

  const tierLabels = { military: 'Military / First Responder', hospice: 'Hospice' };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>;

  const filteredVerifications = verifications.filter(v => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (v.user_name || '').toLowerCase().includes(q) ||
      (v.user_email || '').toLowerCase().includes(q) ||
      (v.tier_requested || '').toLowerCase().includes(q) ||
      (v.status || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4" data-testid="verifications-admin">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-[var(--t)]">Tier Verification Requests</h3>
        <div className="flex items-center gap-2">
          {isFounder && (
            <button
              onClick={() => setShowDeleted(!showDeleted)}
              className="text-[10px] font-bold px-2 py-1 rounded"
              style={{
                background: showDeleted ? 'rgba(239,68,68,0.1)' : 'var(--s)',
                color: showDeleted ? '#ef4444' : 'var(--t5)',
                border: `1px solid ${showDeleted ? 'rgba(239,68,68,0.2)' : 'var(--b)'}`
              }}
              data-testid="verifications-show-deleted-toggle"
            >
              {showDeleted ? 'Showing Deleted' : 'Show Deleted'}
            </button>
          )}
          <Button variant="outline" size="sm" onClick={fetchVerifications} className="text-xs border-[var(--b)] text-[var(--t4)]" data-testid="refresh-verifications">
            <Activity className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {verifications.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
          <Search className="w-4 h-4 text-[var(--t5)]" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name, email, tier, status..." className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]" data-testid="verifications-search" />
        </div>
      )}

      {filteredVerifications.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-12 text-center">
          <FileKey className="w-12 h-12 mx-auto text-[var(--t5)] mb-4" />
          <h3 className="font-bold text-[var(--t)] mb-2">No Verification Requests</h3>
          <p className="text-sm text-[var(--t4)]">Pending Military/First Responder and Hospice verification requests will appear here.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filteredVerifications.map(v => {
            const isApproved = v.status === 'approved';
            const isPending = v.status === 'pending';
            const canNotify = isApproved && !v.notified;
            const isDeleted = v.soft_deleted;

            return (
              <Card key={v.id} className={`glass-card ${isDeleted ? 'opacity-50' : ''}`}
                style={isDeleted ? { background: 'rgba(239,68,68,0.04)' } : {}}
                data-testid={`verification-${v.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-[var(--t)]">{v.user_name || v.user_email}</p>
                        {isDeleted && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--rdbg)] text-[var(--rd)] font-bold">DELETED</span>}
                      </div>
                      <p className="text-xs text-[var(--t5)]">{v.user_email}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold capitalize"
                          style={{
                            background: isApproved ? 'rgba(34,201,147,0.12)' : isPending ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                            color: isApproved ? '#22C993' : isPending ? '#F59E0B' : '#ef4444',
                          }}>
                          {v.status}
                        </span>
                        <span className="text-xs text-[var(--t4)]">{tierLabels[v.tier_requested] || v.tier_requested}</span>
                        <span className="text-xs text-[var(--t5)]">{v.doc_type}</span>
                      </div>
                      <p className="text-[10px] text-[var(--t5)] mt-1">
                        Submitted: {new Date(v.submitted_at).toLocaleString()}
                      </p>
                      {v.review_notes && (
                        <p className="text-xs text-[var(--t4)] mt-1 italic">Notes: {v.review_notes}</p>
                      )}
                      {v.notified && (
                        <p className="text-[10px] text-[#22C993] mt-1 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Benefactor notified
                        </p>
                      )}
                    </div>

                    {/* Actions column */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {isDeleted && isFounder ? (
                        <button
                          onClick={() => {
                            axios.post(`${API_URL}/admin/verifications/${v.id}/restore`, {}, { headers })
                              .then(() => { toast.success('Verification restored'); fetchVerifications(); })
                              .catch(() => toast.error('Failed to restore'));
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-[var(--gn2)] hover:bg-[var(--gnbg)] transition-colors"
                          data-testid={`restore-verification-${v.id}`}
                        >
                          <RotateCcw className="w-3 h-3" /> Restore
                        </button>
                      ) : !isDeleted ? (
                        <>
                          <Button size="sm" variant="outline" className="text-[10px] border-[var(--b)] h-7 px-2"
                            onClick={() => viewDocument(v.id)} data-testid={`view-doc-${v.id}`}>
                            View Doc
                          </Button>

                          {/* Approve/Deny Toggle */}
                          <button
                            onClick={() => toggleApproval(v)}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all text-xs font-bold"
                            style={{
                              background: isApproved ? 'rgba(34,201,147,0.12)' : 'rgba(245,158,11,0.08)',
                              color: isApproved ? '#22C993' : '#F59E0B',
                              border: `1px solid ${isApproved ? 'rgba(34,201,147,0.25)' : 'rgba(245,158,11,0.2)'}`,
                            }}
                            data-testid={`toggle-approval-${v.id}`}
                          >
                            {isApproved ? (
                              <><ToggleRight className="w-4 h-4" /> Approved</>
                            ) : (
                              <><ToggleLeft className="w-4 h-4" /> {isPending ? 'Approve' : 'Re-approve'}</>
                            )}
                          </button>

                          {/* Notify Benefactor — only shows after approval */}
                          {canNotify && (
                            <Button
                              size="sm"
                              onClick={() => notifyBenefactor(v)}
                              disabled={notifying === v.id}
                              className="text-[10px] h-7 px-2 font-bold"
                              style={{ background: 'linear-gradient(135deg, #d4af37, #c9a033)', color: '#0F1629' }}
                              data-testid={`notify-benefactor-${v.id}`}
                            >
                              {notifying === v.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Bell className="w-3 h-3 mr-1" />}
                              Notify Benefactor
                            </Button>
                          )}

                          {/* Delete button */}
                          <button
                            onClick={() => {
                              if (!window.confirm('Delete this verification?')) return;
                              axios.delete(`${API_URL}/admin/verifications/${v.id}`, { headers })
                                .then(() => { toast.success('Verification deleted'); fetchVerifications(); })
                                .catch(() => toast.error('Failed to delete'));
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-[var(--rd)] hover:bg-[var(--rdbg)] transition-colors"
                            data-testid={`delete-verification-${v.id}`}
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* Review notes input for pending */}
                  {isPending && !isDeleted && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--b)' }}>
                      <Input
                        value={reviewNotes[v.id] || ''}
                        onChange={(e) => setReviewNotes(prev => ({ ...prev, [v.id]: e.target.value }))}
                        placeholder="Review notes (optional)..."
                        className="input-field text-sm"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Document Viewer Modal */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setViewingDoc(null)}>
          <div className="bg-[var(--p)] rounded-xl p-4 max-w-lg w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-[var(--t)]">{viewingDoc.file_name}</h3>
              <button onClick={() => setViewingDoc(null)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[var(--t4)] active:scale-90 transition-transform">
                <X className="w-4 h-4" />
              </button>
            </div>
            {viewingDoc.file_data && (
              <img
                src={`data:image/${viewingDoc.file_name?.endsWith('.pdf') ? 'pdf' : 'jpeg'};base64,${viewingDoc.file_data}`}
                alt="Verification document"
                className="w-full rounded-lg"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
