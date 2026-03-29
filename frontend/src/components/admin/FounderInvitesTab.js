import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Trash2, Loader2, Link2, CheckCircle, XCircle, Clock, Plus } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';
import axios from 'axios';

export const FounderInvitesTab = () => {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState('');
  const [copiedToken, setCopiedToken] = useState(null);

  const fetchInvites = useCallback(async () => {
    try {
      const token = localStorage.getItem('carryon_token');
      const res = await axios.get(`${API_URL}/founder/invites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInvites(res.data);
    } catch {
      toast.error('Failed to load invites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvites(); }, [fetchInvites]);

  const createInvite = async () => {
    setCreating(true);
    try {
      const token = localStorage.getItem('carryon_token');
      const res = await axios.post(`${API_URL}/founder/invites`, { note }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInvites(prev => [res.data, ...prev]);
      setNote('');
      toast.success('Invite link created');
    } catch {
      toast.error('Failed to create invite');
    } finally {
      setCreating(false);
    }
  };

  const revokeInvite = async (inviteToken) => {
    try {
      const token = localStorage.getItem('carryon_token');
      await axios.delete(`${API_URL}/founder/invites/${inviteToken}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInvites(prev => prev.map(inv =>
        inv.token === inviteToken ? { ...inv, revoked: true } : inv
      ));
      toast.success('Invite revoked');
    } catch {
      toast.error('Failed to revoke invite');
    }
  };

  const copyLink = (inviteToken) => {
    const url = `${window.location.origin}/founder-about/${inviteToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(inviteToken);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopiedToken(null), 2000);
    }).catch(() => toast.error('Failed to copy'));
  };

  const getStatusBadge = (invite) => {
    if (invite.revoked) return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
        <XCircle className="w-3 h-3" /> Revoked
      </span>
    );
    if (invite.used) return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
        <CheckCircle className="w-3 h-3" /> Used
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(212,175,55,0.12)', color: '#d4af37' }}>
        <Clock className="w-3 h-3" /> Active
      </span>
    );
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch { return '—'; }
  };

  const activeCount = invites.filter(i => !i.revoked && !i.used).length;
  const usedCount = invites.filter(i => i.used).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-[#d4af37] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="founder-invites-tab">
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: invites.length, color: '#94a3b8' },
          { label: 'Active', value: activeCount, color: '#d4af37' },
          { label: 'Used', value: usedCount, color: '#4ade80' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="border-0" style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
            <CardContent className="p-3 text-center">
              <p className="text-xs font-medium" style={{ color: '#6b7a90' }}>{label}</p>
              <p className="text-xl font-bold" style={{ color }}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create New Invite */}
      <Card className="border-0" style={{ background: 'rgba(15,26,46,0.65)', border: '1px solid rgba(14,165,233,0.06)' }}>
        <CardContent className="p-4">
          <h3 className="text-white text-sm font-bold mb-3 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[#d4af37]" /> Generate Invite Link
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Optional note (e.g., recipient name)"
              className="flex-1 px-3 py-2 rounded-lg text-sm text-white placeholder-[#4a5568]"
              style={{ background: 'rgba(11,18,33,0.6)', border: '1px solid rgba(14,165,233,0.1)' }}
              data-testid="invite-note-input"
            />
            <button
              onClick={createInvite}
              disabled={creating}
              className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
              style={{ background: '#d4af37', color: '#0d1b2a' }}
              data-testid="create-invite-btn"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Invites List */}
      {invites.length === 0 ? (
        <div className="text-center py-12">
          <Link2 className="w-10 h-10 text-[#3a4a63] mx-auto mb-3" />
          <p className="text-[#6b7a90] text-sm">No invites yet. Generate one above to share the Founder page.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invites.map(invite => (
            <Card key={invite.token} className="border-0" style={{
              background: invite.revoked ? 'rgba(15,26,46,0.35)' : 'rgba(15,26,46,0.65)',
              border: '1px solid rgba(14,165,233,0.06)',
              opacity: invite.revoked ? 0.6 : 1,
            }}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusBadge(invite)}
                      {invite.note && (
                        <span className="text-white text-xs font-medium truncate">{invite.note}</span>
                      )}
                    </div>
                    <p className="text-[#4a5568] text-[10px] font-mono truncate">{invite.token}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-[#6b7a90] text-[10px]">Created {formatDate(invite.created_at)}</span>
                      {invite.used_at && (
                        <span className="text-[#6b7a90] text-[10px]">Used {formatDate(invite.used_at)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!invite.revoked && !invite.used && (
                      <button
                        onClick={() => copyLink(invite.token)}
                        className="p-2 rounded-lg transition-colors hover:bg-white/5"
                        title="Copy invite link"
                        data-testid={`copy-invite-${invite.token}`}
                      >
                        {copiedToken === invite.token ? (
                          <CheckCircle className="w-4 h-4 text-[#4ade80]" />
                        ) : (
                          <Copy className="w-4 h-4 text-[#6b7a90]" />
                        )}
                      </button>
                    )}
                    {!invite.revoked && (
                      <button
                        onClick={() => revokeInvite(invite.token)}
                        className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
                        title="Revoke invite"
                        data-testid={`revoke-invite-${invite.token}`}
                      >
                        <Trash2 className="w-4 h-4 text-[#6b7a90] hover:text-red-400" />
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
  );
};
