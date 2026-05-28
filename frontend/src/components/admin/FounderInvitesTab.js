import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Trash2, Loader2, Link2, CheckCircle, XCircle, Plus, UserCheck, UserX, Eye, EyeOff, Clock, ShieldCheck, Ban, Sparkles } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

import apiClient from '../../utils/apiClient';
export const FounderInvitesTab = ({ onPendingChange }) => {
  const [invites, setInvites] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState('');
  const [copiedToken, setCopiedToken] = useState(null);
  const [approvePasswords, setApprovePasswords] = useState({});
  const [showPasswords, setShowPasswords] = useState({});
  const [approving, setApproving] = useState({});
  // In-app confirmation modal. `window.confirm` is silently blocked
  // inside iOS PWAs — the tap appears to do nothing and the delete
  // call never fires. Modal replaces it.
  // Shape: { kind: 'single'|'bulk', requestId?, name?, count? } | null
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const getAuth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('carryon_token')}` } });

  const fetchData = useCallback(async () => {
    try {
      const [invRes, reqRes] = await Promise.all([
        apiClient.get(`${API_URL}/founder/invites`, getAuth()),
        apiClient.get(`${API_URL}/founder/requests`, getAuth()),
      ]);
      setInvites(invRes.data);
      setRequests(reqRes.data);
    } catch {
      toast.error('Failed to load founder access data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Invite Link Actions ───
  const createInvite = async () => {
    setCreating(true);
    try {
      const res = await apiClient.post(`${API_URL}/founder/invites`, { note }, getAuth());
      setInvites(prev => [res.data, ...prev]);
      setNote('');
      toast.success('Invite link created');
    } catch { toast.error('Failed to create invite'); }
    finally { setCreating(false); }
  };

  const revokeInvite = async (inviteToken) => {
    try {
      await apiClient.delete(`${API_URL}/founder/invites/${inviteToken}`, getAuth());
      setInvites(prev => prev.map(inv => inv.token === inviteToken ? { ...inv, revoked: true } : inv));
      toast.success('Invite revoked');
    } catch { toast.error('Failed to revoke invite'); }
  };

  // Remove a single revoked invite (opens confirm modal).
  const deleteInvite = (invite) => {
    setDeleteConfirm({ kind: 'single', target: 'invite', token: invite.token, name: invite.note || invite.token.slice(0, 8) });
  };

  // Bulk-clear every revoked invite (opens confirm modal).
  const clearRevokedInvites = () => {
    const count = invites.filter(i => i.revoked).length;
    if (count === 0) return;
    setDeleteConfirm({ kind: 'bulk', target: 'invite', count });
  };

  const copyLink = (inviteToken) => {
    const url = `${window.location.origin}/founder-about/${inviteToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(inviteToken);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopiedToken(null), 2000);
    }).catch(() => toast.error('Failed to copy'));
  };

  // ─── Access Request Actions ───
  const approveRequest = async (requestId) => {
    const pw = approvePasswords[requestId];
    if (!pw || pw.length < 4) { toast.error('Password must be at least 4 characters'); return; }
    setApproving(prev => ({ ...prev, [requestId]: true }));
    try {
      await apiClient.post(`${API_URL}/founder/requests/${requestId}/approve`, { password: pw }, getAuth());
      setRequests(prev => {
        const updated = prev.map(r => r.request_id === requestId ? { ...r, status: 'approved' } : r);
        onPendingChange?.(updated.filter(r => r.status === 'pending').length);
        return updated;
      });
      setApprovePasswords(prev => { const n = { ...prev }; delete n[requestId]; return n; });
      toast.success('Access approved — share the password with the requester');
    } catch { toast.error('Failed to approve'); }
    finally { setApproving(prev => ({ ...prev, [requestId]: false })); }
  };

  const denyRequest = async (requestId) => {
    try {
      await apiClient.post(`${API_URL}/founder/requests/${requestId}/deny`, {}, getAuth());
      setRequests(prev => {
        const updated = prev.map(r => r.request_id === requestId ? { ...r, status: 'denied' } : r);
        onPendingChange?.(updated.filter(r => r.status === 'pending').length);
        return updated;
      });
      toast.success('Request denied');
    } catch { toast.error('Failed to deny'); }
  };

  const revokeAccess = async (requestId) => {
    try {
      await apiClient.post(`${API_URL}/founder/requests/${requestId}/revoke`, {}, getAuth());
      setRequests(prev => {
        const updated = prev.map(r => r.request_id === requestId ? { ...r, status: 'revoked' } : r);
        onPendingChange?.(updated.filter(r => r.status === 'pending').length);
        return updated;
      });
      toast.success('Access revoked');
    } catch { toast.error('Failed to revoke'); }
  };

  // Delete a single revoked/denied request permanently (opens confirm modal).
  const deleteRequest = (req) => {
    setDeleteConfirm({ kind: 'single', target: 'request', requestId: req.request_id, name: req.name || req.email });
  };

  // Bulk-clear every revoked + denied request (opens confirm modal).
  const clearInactiveRequests = () => {
    const count = requests.filter(r => ['revoked', 'denied'].includes(r.status)).length;
    if (count === 0) return;
    setDeleteConfirm({ kind: 'bulk', target: 'request', count });
  };

  // Actually perform the confirmed action (handles both invite + request targets).
  const runConfirmedDelete = async () => {
    if (!deleteConfirm) return;
    setConfirmBusy(true);
    try {
      const { kind, target } = deleteConfirm;
      if (target === 'invite') {
        if (kind === 'single') {
          await apiClient.delete(`${API_URL}/founder/invites/${deleteConfirm.token}/permanent`, getAuth());
          setInvites(prev => prev.filter(i => i.token !== deleteConfirm.token));
          toast.success('Invite removed');
        } else {
          const res = await apiClient.post(`${API_URL}/founder/invites/clear-revoked`, {}, getAuth());
          setInvites(prev => prev.filter(i => !i.revoked));
          toast.success(`Removed ${res.data.deleted} revoked invite${res.data.deleted === 1 ? '' : 's'}`);
        }
      } else {
        // target === 'request'
        if (kind === 'single') {
          await apiClient.delete(`${API_URL}/founder/requests/${deleteConfirm.requestId}`, getAuth());
          setRequests(prev => prev.filter(r => r.request_id !== deleteConfirm.requestId));
          toast.success('Request removed');
        } else {
          const res = await apiClient.post(`${API_URL}/founder/requests/clear-inactive`, {}, getAuth());
          setRequests(prev => prev.filter(r => !['revoked', 'denied'].includes(r.status)));
          toast.success(`Removed ${res.data.deleted} inactive request${res.data.deleted === 1 ? '' : 's'}`);
        }
      }
      setDeleteConfirm(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to remove');
    } finally {
      setConfirmBusy(false);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    catch { return '—'; }
  };

  const getRequestBadge = (status) => {
    const cfg = {
      pending: { bg: 'rgba(234,179,8,0.12)', color: '#eab308', icon: Clock, label: 'Pending' },
      approved: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', icon: ShieldCheck, label: 'Approved' },
      denied: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', icon: XCircle, label: 'Denied' },
      revoked: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', icon: Ban, label: 'Revoked' },
    }[status] || { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8', icon: Clock, label: status };
    const Icon = cfg.icon;
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold" style={{ background: cfg.bg, color: cfg.color }}>
        <Icon className="w-3 h-3" /> {cfg.label}
      </span>
    );
  };

  const activeInvites = invites.filter(i => !i.revoked).length;
  const revokedInvitesCount = invites.filter(i => i.revoked).length;
  const totalInviteViews = invites.reduce((s, i) => s + (i.views || 0), 0);
  const pendingRequests = requests.filter(r => r.status === 'pending').length;
  const approvedRequests = requests.filter(r => r.status === 'approved').length;
  const inactiveRequests = requests.filter(r => ['revoked', 'denied'].includes(r.status)).length;

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#d4af37] animate-spin" /></div>;
  }

  return (
    <div className="space-y-8" data-testid="founder-invites-tab">

      {/* ═══ SECTION 1: INVITE LINKS ═══ */}
      <div>
        <h2 className="text-[var(--t)] text-sm font-bold mb-3 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-[#d4af37]" /> Invite Links
          <span className="text-[var(--t4)] text-xs font-normal ml-1">— shareable, reusable until revoked</span>
        </h2>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Total', value: invites.length, color: '#94a3b8' },
            { label: 'Active', value: activeInvites, color: '#d4af37' },
            { label: 'Views', value: totalInviteViews, color: '#4ade80' },
          ].map(({ label, value, color }) => (
            <Card key={label} className="border-0" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <CardContent className="p-3 text-center">
                <p className="text-xs font-medium" style={{ color: 'var(--t4)' }}>{label}</p>
                <p className="text-xl font-bold" style={{ color }}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Create */}
        <Card className="border-0 mb-3" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
          <CardContent className="p-4">
            <div className="flex gap-2">
              <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note (e.g., recipient name)"
                className="flex-1 px-3 py-2 rounded-lg text-base text-[var(--t)] placeholder-[var(--t5)]" style={{ background: 'var(--bg)', border: '1px solid var(--b)' }} data-testid="invite-note-input" />
              <button onClick={createInvite} disabled={creating}
                className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
                style={{ background: '#d4af37', color: '#0d1b2a' }} data-testid="create-invite-btn">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Bulk clear revoked invites — appears only when there are
            revoked invites cluttering the list. */}
        {revokedInvitesCount > 0 && (
          <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
            <span className="text-[var(--t3)] text-xs">
              <span className="text-[#f87171] font-semibold">{revokedInvitesCount}</span> revoked invite{revokedInvitesCount === 1 ? '' : 's'} cluttering the list.
            </span>
            <button
              onClick={clearRevokedInvites}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all hover:brightness-110 active:scale-95"
              style={{ background: 'rgba(239,68,68,0.18)', color: '#f87171' }}
              data-testid="clear-revoked-invites-btn"
            >
              <Sparkles className="w-3.5 h-3.5" /> Clear all
            </button>
          </div>
        )}

        {/* List */}
        {invites.length === 0 ? (
          <div className="text-center py-8"><Link2 className="w-8 h-8 text-[var(--t5)] mx-auto mb-2" /><p className="text-[var(--t4)] text-xs">No invite links yet.</p></div>
        ) : (
          <div className="space-y-2">
            {invites.map(invite => (
              <Card key={invite.token} className="border-0" style={{ background: 'var(--bg2)', border: '1px solid var(--b)', opacity: invite.revoked ? 0.6 : 1 }}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {invite.revoked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}><XCircle className="w-3 h-3" /> Revoked</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(var(--gold-rgb), 0.12)', color: '#d4af37' }}><CheckCircle className="w-3 h-3" /> Active</span>
                        )}
                        {invite.note && <span className="text-[var(--t)] text-xs font-medium truncate">{invite.note}</span>}
                      </div>
                      <p className="text-[var(--t5)] text-[11px] font-mono truncate">{invite.token}</p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-[var(--t4)] text-[11px]">Created {formatDate(invite.created_at)}</span>
                        {(invite.views || 0) > 0 && <span className="text-[var(--t4)] text-[11px]">{invite.views} view{invite.views !== 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!invite.revoked && (
                        <button onClick={() => copyLink(invite.token)} className="p-2 rounded-lg transition-colors hover:bg-white/5" title="Copy invite link" data-testid={`copy-invite-${invite.token}`}>
                          {copiedToken === invite.token ? <CheckCircle className="w-4 h-4 text-[#4ade80]" /> : <Copy className="w-4 h-4 text-[var(--t4)]" />}
                        </button>
                      )}
                      {!invite.revoked && (
                        <button onClick={() => revokeInvite(invite.token)} className="p-2 rounded-lg transition-colors hover:bg-red-500/10" title="Revoke invite" data-testid={`revoke-invite-${invite.token}`} aria-label="Revoke invite">
                          <Trash2 className="w-4 h-4 text-[var(--t4)] hover:text-red-400" />
                        </button>
                      )}
                      {invite.revoked && (
                        <button onClick={() => deleteInvite(invite)} className="p-2 rounded-lg transition-colors hover:bg-white/5" title="Remove from list permanently" data-testid={`delete-invite-${invite.token}`} aria-label="Remove from list permanently">
                          <Trash2 className="w-4 h-4 text-[var(--t4)] hover:text-[#f87171]" />
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ═══ SECTION 2: ACCESS REQUESTS ═══ */}
      <div>
        <h2 className="text-[var(--t)] text-sm font-bold mb-3 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-[#d4af37]" /> Access Requests
          <span className="text-[var(--t4)] text-xs font-normal ml-1">— visitors who requested access</span>
          {pendingRequests > 0 && (
            <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
              {pendingRequests} pending
            </span>
          )}
        </h2>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Total', value: requests.length, color: '#94a3b8' },
            { label: 'Pending', value: pendingRequests, color: '#eab308' },
            { label: 'Approved', value: approvedRequests, color: '#4ade80' },
          ].map(({ label, value, color }) => (
            <Card key={label} className="border-0" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <CardContent className="p-3 text-center">
                <p className="text-xs font-medium" style={{ color: 'var(--t4)' }}>{label}</p>
                <p className="text-xl font-bold" style={{ color }}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bulk clear — only appears when there's inactive clutter to
            clean up. Lets the founder wipe all revoked + denied rows
            in one tap after running demos. */}
        {inactiveRequests > 0 && (
          <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
            <span className="text-[var(--t3)] text-xs">
              <span className="text-[#f87171] font-semibold">{inactiveRequests}</span> revoked/denied request{inactiveRequests === 1 ? '' : 's'} cluttering the list.
            </span>
            <button
              onClick={clearInactiveRequests}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all hover:brightness-110 active:scale-95"
              style={{ background: 'rgba(239,68,68,0.18)', color: '#f87171' }}
              data-testid="clear-inactive-requests-btn"
            >
              <Sparkles className="w-3.5 h-3.5" /> Clear all
            </button>
          </div>
        )}

        {/* List */}
        {requests.length === 0 ? (
          <div className="text-center py-8"><UserCheck className="w-8 h-8 text-[var(--t5)] mx-auto mb-2" /><p className="text-[var(--t4)] text-xs">No access requests yet.</p></div>
        ) : (
          <div className="space-y-2">
            {requests.map(req => (
              <Card key={req.request_id} className="border-0" style={{
                background: req.status === 'pending' ? 'var(--bg2)' : 'var(--bg2)',
                border: req.status === 'pending' ? '1px solid rgba(234,179,8,0.15)' : '1px solid var(--b)',
                opacity: ['denied', 'revoked'].includes(req.status) ? 0.6 : 1,
              }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getRequestBadge(req.status)}
                        <span className="text-[var(--t)] text-sm font-semibold truncate">{req.name}</span>
                      </div>
                      <p className="text-[var(--t4)] text-xs">{req.email}</p>
                      {req.message && <p className="text-[var(--t3)] text-xs mt-1.5 italic">&ldquo;{req.message}&rdquo;</p>}
                      <div className="flex gap-3 mt-1.5">
                        <span className="text-[var(--t5)] text-[11px]">Requested {formatDate(req.created_at)}</span>
                        {(req.views || 0) > 0 && <span className="text-[var(--t5)] text-[11px]">{req.views} view{req.views !== 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Pending: Approve/Deny actions */}
                  {req.status === 'pending' && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--b)' }}>
                      <div className="flex gap-2 mb-2">
                        <div className="relative flex-1">
                          <input
                            type={showPasswords[req.request_id] ? 'text' : 'password'}
                            value={approvePasswords[req.request_id] || ''}
                            onChange={e => setApprovePasswords(prev => ({ ...prev, [req.request_id]: e.target.value }))}
                            placeholder="Set a password for this person"
                            className="w-full px-3 py-2 rounded-lg text-sm text-[var(--t)] placeholder-[var(--t5)] pr-9"
                            style={{ background: 'var(--bg)', border: '1px solid var(--b)' }}
                            data-testid={`approve-password-${req.request_id}`}
                          />
                          <button type="button" onClick={() => setShowPasswords(prev => ({ ...prev, [req.request_id]: !prev[req.request_id] }))}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--t4)] hover:text-[var(--t)] transition-colors">
                            {showPasswords[req.request_id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => approveRequest(req.request_id)} disabled={!approvePasswords[req.request_id] || approving[req.request_id]}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
                          style={{ background: '#22c55e', color: '#052e16' }} data-testid={`approve-req-${req.request_id}`}>
                          {approving[req.request_id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />} Approve
                        </button>
                        <button onClick={() => denyRequest(req.request_id)}
                          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all hover:brightness-110 active:scale-95"
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }} data-testid={`deny-req-${req.request_id}`}>
                          <UserX className="w-3.5 h-3.5" /> Deny
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Approved: Revoke action */}
                  {req.status === 'approved' && (
                    <div className="mt-3 pt-3 flex justify-end" style={{ borderTop: '1px solid var(--b)' }}>
                      <button onClick={() => revokeAccess(req.request_id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:brightness-110"
                        style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }} data-testid={`revoke-access-${req.request_id}`}>
                        <Ban className="w-3.5 h-3.5" /> Revoke Access
                      </button>
                    </div>
                  )}

                  {/* Revoked or denied: permanent delete */}
                  {['revoked', 'denied'].includes(req.status) && (
                    <div className="mt-3 pt-3 flex justify-end" style={{ borderTop: '1px solid var(--b)' }}>
                      <button onClick={() => deleteRequest(req)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:brightness-110 active:scale-95"
                        style={{ background: 'rgba(100,116,139,0.15)', color: '#94a3b8' }} data-testid={`delete-req-${req.request_id}`}>
                        <Trash2 className="w-3.5 h-3.5" /> Remove from list
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation modal — replaces window.confirm which is blocked
          inside iOS PWAs. */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => !confirmBusy && setDeleteConfirm(null)}
          data-testid="founder-delete-confirm-overlay"
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 overflow-y-auto"
            style={{ background: 'var(--bg2, #0f1a2e)', border: '1px solid rgba(239,68,68,0.18)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)' }}>
                <Trash2 className="w-4 h-4" style={{ color: '#f87171' }} />
              </div>
              <h3 className="text-[var(--t)] font-bold text-base">
                {deleteConfirm.kind === 'bulk'
                  ? (deleteConfirm.target === 'invite' ? 'Clear revoked invites?' : 'Clear inactive requests?')
                  : (deleteConfirm.target === 'invite' ? 'Remove invite?' : 'Remove request?')}
              </h3>
            </div>
            <p className="text-[var(--t3)] text-sm leading-relaxed mb-5">
              {deleteConfirm.kind === 'bulk' && deleteConfirm.target === 'invite' && (
                <>This will permanently remove <strong style={{ color: '#f87171' }}>{deleteConfirm.count}</strong> revoked invite{deleteConfirm.count === 1 ? '' : 's'} from the list. This cannot be undone.</>
              )}
              {deleteConfirm.kind === 'bulk' && deleteConfirm.target === 'request' && (
                <>This will permanently remove <strong style={{ color: '#f87171' }}>{deleteConfirm.count}</strong> revoked/denied request{deleteConfirm.count === 1 ? '' : 's'} from the list. This cannot be undone.</>
              )}
              {deleteConfirm.kind === 'single' && deleteConfirm.target === 'invite' && (
                <>Permanently remove the revoked invite <strong className="text-[var(--t)]">{deleteConfirm.name}</strong>? This cannot be undone.</>
              )}
              {deleteConfirm.kind === 'single' && deleteConfirm.target === 'request' && (
                <>Permanently remove the request from <strong className="text-[var(--t)]">{deleteConfirm.name}</strong>? This cannot be undone.</>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={confirmBusy}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
                style={{ background: 'rgba(148,163,184,0.12)', color: '#cbd5e1' }}
                data-testid="founder-delete-cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={runConfirmedDelete}
                disabled={confirmBusy}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: '#ef4444', color: '#fff' }}
                data-testid="founder-delete-confirm-btn"
              >
                {confirmBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleteConfirm.kind === 'bulk' ? 'Clear all' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
