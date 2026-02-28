import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileKey, Activity, Loader2, X, Search } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const VerificationsTab = ({ getAuthHeaders }) => {
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState('');
  const [viewingDoc, setViewingDoc] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const headers = getAuthHeaders()?.headers || {};

  useEffect(() => { fetchVerifications(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchVerifications = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/verifications`, { headers });
      setVerifications(res.data);
    } catch (err) { toast.error('Failed to load verifications'); }
    setLoading(false);
  };

  const reviewVerification = async (id, action) => {
    try {
      await axios.post(`${API_URL}/admin/verifications/${id}/review`, {
        action,
        notes: reviewNotes,
      }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      toast.success(`Verification ${action}d`);
      setReviewNotes('');
      fetchVerifications();
    } catch (err) { toast.error(err.response?.data?.detail || 'Review failed'); }
  };

  const viewDocument = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/admin/verifications/${id}/document`, { headers });
      setViewingDoc(res.data);
    } catch (err) { toast.error('Failed to load document'); }
  };

  const statusColors = { pending: '#F59E0B', approved: '#22C993', denied: '#ef4444' };
  const tierLabels = { military: 'Military / First Responder', hospice: 'Hospice' };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>;

  const filteredVerifications = verifications.filter(v => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (v.user_name || '').toLowerCase().includes(q) ||
      (v.user_email || '').toLowerCase().includes(q) ||
      (v.tier_requested || '').toLowerCase().includes(q) ||
      (v.status || '').toLowerCase().includes(q) ||
      (v.doc_type || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4" data-testid="verifications-admin">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-[var(--t)]">Tier Verification Requests</h3>
        <Button variant="outline" size="sm" onClick={fetchVerifications} className="text-xs border-[var(--b)] text-[var(--t4)]" data-testid="refresh-verifications">
          <Activity className="w-3 h-3 mr-1" /> Refresh
        </Button>
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
          {filteredVerifications.map(v => (
            <Card key={v.id} className="glass-card" data-testid={`verification-${v.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold text-[var(--t)]">{v.user_name || v.user_email}</p>
                    <p className="text-xs text-[var(--t5)]">{v.user_email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold capitalize"
                        style={{ background: `${statusColors[v.status]}15`, color: statusColors[v.status] }}>
                        {v.status}
                      </span>
                      <span className="text-xs text-[var(--t4)]">{tierLabels[v.tier_requested] || v.tier_requested}</span>
                      <span className="text-xs text-[var(--t5)]">{v.doc_type}</span>
                    </div>
                    <p className="text-[10px] text-[var(--t5)] mt-1">
                      Submitted: {new Date(v.submitted_at).toLocaleString()}
                      {v.reviewed_at && ` · Reviewed: ${new Date(v.reviewed_at).toLocaleString()}`}
                    </p>
                    {v.review_notes && (
                      <p className="text-xs text-[var(--t4)] mt-1 italic">Notes: {v.review_notes}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button size="sm" variant="outline" className="text-xs border-[var(--b)]"
                      onClick={() => viewDocument(v.id)} data-testid={`view-doc-${v.id}`}>
                      View Document
                    </Button>
                    {v.status === 'pending' && (
                      <div className="flex gap-1">
                        <Button size="sm" className="text-xs bg-[#22C993] text-white hover:bg-[#22C993]/80"
                          onClick={() => reviewVerification(v.id, 'approve')} data-testid={`approve-${v.id}`}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                          onClick={() => reviewVerification(v.id, 'deny')} data-testid={`deny-${v.id}`}>
                          Deny
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {v.status === 'pending' && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--b)' }}>
                    <Input
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Review notes (optional)..."
                      className="input-field text-sm"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Document Viewer Modal */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setViewingDoc(null)}>
          <div className="bg-[var(--p)] rounded-xl p-4 max-w-lg w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-[var(--t)]">{viewingDoc.file_name}</h3>
              <button onClick={() => setViewingDoc(null)} className="text-[var(--t5)] hover:text-white">
                <X className="w-5 h-5" />
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
