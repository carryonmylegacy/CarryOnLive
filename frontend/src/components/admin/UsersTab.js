import React, { useState } from 'react';
import axios from 'axios';
import { Search, Users, Trash2, Loader2, ChevronDown, ChevronRight, KeyRound, Unlock, GitBranch, User, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const roleColors = {
  benefactor: { bg: 'rgba(37,99,235,0.1)', color: '#60A5FA' },
  beneficiary: { bg: 'rgba(139,92,246,0.1)', color: '#B794F6' },
  admin: { bg: 'rgba(224,173,43,0.1)', color: '#F0C95C' },
};

const statusColors = {
  pending: { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B' },
  accepted: { bg: 'rgba(34,201,147,0.1)', color: '#22C993' },
  draft: { bg: 'rgba(100,116,139,0.1)', color: '#94A3B8' },
};

export const UsersTab = ({ users, setUsers, currentUserId, getAuthHeaders }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'tree'
  const [actionLoading, setActionLoading] = useState(null);
  const [roleChanging, setRoleChanging] = useState(null);
  const [unlockUserId, setUnlockUserId] = useState(null);
  const [masterKeyInput, setMasterKeyInput] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name, role }
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePw, setShowDeletePw] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filteredUsers = users
    .filter(u => roleFilter === 'all' || u.role === roleFilter)
    .filter(u => !searchQuery || u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.email?.toLowerCase().includes(searchQuery.toLowerCase()));

  const toggleExpand = (userId) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const handleRoleChange = async (userId, userName, newRole) => {
    setRoleChanging(userId);
    try {
      await axios.put(`${API_URL}/admin/users/${userId}/role`, { role: newRole }, getAuthHeaders());
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change role');
    } finally {
      setRoleChanging(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget || !deletePassword.trim()) return;
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/admin/users/${deleteTarget.id}?admin_password=${encodeURIComponent(deletePassword)}`, getAuthHeaders());
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      toast.success(`${deleteTarget.name} and all associated data deleted`);
      setDeleteTarget(null);
      setDeletePassword('');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to delete';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const handleUnlockVault = async (userId) => {
    if (!masterKeyInput.trim()) { toast.error('Enter the master key'); return; }
    setUnlocking(true);
    try {
      const res = await axios.post(`${API_URL}/admin/user/${userId}/unlock-all-documents`,
        { master_key: masterKeyInput },
        { headers: { ...getAuthHeaders()?.headers, 'Content-Type': 'application/json' } }
      );
      toast.error(`Unlocked ${res.data.unlocked_count} document(s). User must re-lock individually.`);
      setMasterKeyInput('');
      setUnlockUserId(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Master key does not match');
    } finally {
      setUnlocking(false);
    }
  };

  // User row component shared between list and tree views
  const UserRow = ({ u, indent = false }) => {
    const rc = roleColors[u.role] || roleColors.benefactor;
    const hasBens = u.linked_beneficiaries?.length > 0;
    const isExpanded = expandedUsers.has(u.id);

    return (
      <React.Fragment key={u.id}>
        <div className={`glass-card p-3 flex items-center gap-3 ${indent ? 'ml-8 border-l-2 border-[var(--b)]' : ''}`} data-testid={`admin-user-${u.id}`}>
          {/* Tree toggle for benefactors with beneficiaries (tree mode only) */}
          {viewMode === 'tree' && !indent && u.role === 'benefactor' && (
            <button
              onClick={() => hasBens && toggleExpand(u.id)}
              className="w-5 h-5 flex items-center justify-center flex-shrink-0"
              style={{ opacity: hasBens ? 1 : 0.2, cursor: hasBens ? 'pointer' : 'default' }}
              data-testid={`tree-toggle-${u.id}`}
            >
              {hasBens ? (
                isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--gold)]" /> : <ChevronRight className="w-4 h-4 text-[var(--t4)]" />
              ) : (
                <User className="w-3 h-3 text-[var(--t5)]" />
              )}
            </button>
          )}

          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: rc.bg, color: rc.color }}>
            {u.name ? u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[var(--t)] text-sm truncate">{u.name || 'No name'}</div>
            <div className="text-xs text-[var(--t4)] truncate">{u.email}</div>
            {u.subscription?.plan_id && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold capitalize" style={{ background: 'rgba(212,175,55,0.1)', color: '#d4af37' }}>
                  {u.subscription.plan_name || u.subscription.plan_id}
                </span>
                <span className="text-[10px] text-[var(--t5)] capitalize">{u.subscription.billing_cycle || 'monthly'}</span>
                {u.subscription.beta_plan && <span className="text-[10px] text-purple-400">(beta)</span>}
              </div>
            )}
            {viewMode === 'tree' && !indent && hasBens && (
              <div className="flex items-center gap-1 mt-0.5">
                <GitBranch className="w-3 h-3 text-[var(--t5)]" />
                <span className="text-[10px] text-[var(--t5)]">{u.linked_beneficiaries.length} beneficiar{u.linked_beneficiaries.length === 1 ? 'y' : 'ies'}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            <span
              className="text-xs px-2 py-1 rounded-md font-bold capitalize"
              style={{ background: rc.bg, color: rc.color }}
              data-testid={`admin-role-badge-${u.id}`}
            >
              {u.role}
            </span>
            {u.created_at && (
              <span className="text-[10px] text-[var(--t5)]">
                {new Date(u.created_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--t5)] hidden sm:block">{u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}</div>
          {u.id !== currentUserId && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {(u.role === 'benefactor' || u.role === 'beneficiary') && (
                <Button variant="ghost" size="sm" className="text-[var(--t5)]"
                  onClick={() => { setUnlockUserId(unlockUserId === u.id ? null : u.id); setMasterKeyInput(''); }}
                  title="Vault Unlock" data-testid={`vault-unlock-${u.id}`}>
                  <KeyRound className="w-4 h-4" />
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-[var(--rd)] hover:bg-[var(--rdbg)]" onClick={() => { setDeleteTarget({ id: u.id, name: u.name, role: u.role }); setDeletePassword(''); setShowDeletePw(false); }} data-testid={`admin-delete-user-${u.id}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
        {unlockUserId === u.id && (
          <div className={`px-3 pb-3 -mt-1 ${indent ? 'ml-8' : ''}`}>
            <div className="p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <p className="text-xs text-[var(--t4)] mb-2">Enter the master key spoken by <strong>{u.name}</strong> to unlock all their vault documents.</p>
              <div className="flex gap-2">
                <Input value={masterKeyInput} onChange={(e) => setMasterKeyInput(e.target.value)}
                  placeholder="Master key" className="input-field text-sm flex-1" data-testid="admin-master-key-input" />
                <Button size="sm" disabled={unlocking || !masterKeyInput.trim()}
                  onClick={() => handleUnlockVault(u.id)}
                  style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white' }}
                  data-testid="admin-unlock-all-btn">
                  {unlocking ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Unlock className="w-3 h-3 mr-1" />}
                  Unlock All
                </Button>
              </div>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  };

  // Beneficiary row in tree view (linked but not yet a user)
  const BeneficiaryLeaf = ({ ben }) => {
    const sc = statusColors[ben.invitation_status] || statusColors.draft;
    return (
      <div className="ml-8 pl-4 py-2 flex items-center gap-3 border-l-2" style={{ borderColor: 'var(--b)' }} data-testid={`tree-ben-${ben.id}`}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
          style={{ background: 'rgba(139,92,246,0.1)', color: '#B794F6' }}>
          {ben.name ? ben.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[var(--t3)] text-xs truncate">{ben.name || 'Unnamed'}</div>
          <div className="text-[10px] text-[var(--t5)] truncate">{ben.email || 'No email'} · {ben.relation || 'beneficiary'}</div>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full font-bold capitalize" style={{ background: sc.bg, color: sc.color }}>
          {ben.is_stub ? 'stub' : ben.invitation_status || 'draft'}
        </span>
      </div>
    );
  };

  // Tree view: group benefactors at top, show their beneficiaries underneath
  const renderTreeView = () => {
    const benefactors = filteredUsers.filter(u => u.role === 'benefactor');
    const beneficiaryUsers = filteredUsers.filter(u => u.role === 'beneficiary');
    const admins = filteredUsers.filter(u => u.role === 'admin');

    // Track beneficiary user emails for matching to linked records
    const benUserEmails = new Set(beneficiaryUsers.map(u => u.email?.toLowerCase()));

    return (
      <div className="space-y-1">
        {admins.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2">Administrators</p>
            <div className="space-y-2">
              {admins.map(u => <UserRow key={u.id} u={u} />)}
            </div>
          </div>
        )}

        {benefactors.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2">
              Benefactors & Their Beneficiaries ({benefactors.length})
            </p>
            <div className="space-y-1">
              {benefactors.map(u => {
                const isExpanded = expandedUsers.has(u.id);
                const bens = u.linked_beneficiaries || [];
                // Find beneficiary *users* that match linked records by email
                const linkedBenUsers = bens
                  .filter(b => b.email && benUserEmails.has(b.email.toLowerCase()))
                  .map(b => beneficiaryUsers.find(bu => bu.email?.toLowerCase() === b.email.toLowerCase()))
                  .filter(Boolean);
                const linkedBenUserIds = new Set(linkedBenUsers.map(b => b.id));
                // Non-user beneficiaries (stub/pending)
                const nonUserBens = bens.filter(b => !b.email || !benUserEmails.has(b.email.toLowerCase()));

                return (
                  <div key={u.id}>
                    <UserRow u={u} />
                    {isExpanded && (
                      <div className="mb-2">
                        {linkedBenUsers.map(bu => (
                          <UserRow key={bu.id} u={bu} indent />
                        ))}
                        {nonUserBens.map(b => (
                          <BeneficiaryLeaf key={b.id} ben={b} />
                        ))}
                        {bens.length === 0 && (
                          <div className="ml-8 pl-4 py-2 text-xs text-[var(--t5)] italic border-l-2" style={{ borderColor: 'var(--b)' }}>
                            No beneficiaries enrolled yet
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Orphan beneficiary users (not linked to any benefactor in tree) */}
        {(() => {
          // Collect all beneficiary user IDs that were shown under a benefactor
          const shownBenIds = new Set();
          filteredUsers.filter(u => u.role === 'benefactor').forEach(u => {
            (u.linked_beneficiaries || []).forEach(b => {
              const match = beneficiaryUsers.find(bu => bu.email?.toLowerCase() === b.email?.toLowerCase());
              if (match) shownBenIds.add(match.id);
            });
          });
          const orphans = beneficiaryUsers.filter(u => !shownBenIds.has(u.id));
          if (orphans.length === 0) return null;
          return (
            <div>
              <p className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2">
                Unlinked Beneficiaries ({orphans.length})
              </p>
              <div className="space-y-2">
                {orphans.map(u => <UserRow key={u.id} u={u} />)}
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="admin-users-tab">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
          <Search className="w-4 h-4 text-[var(--t5)]" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]" data-testid="admin-users-search" />
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          {['all', 'benefactor', 'beneficiary', 'admin'].map(r => (
            <button key={r} onClick={() => setRoleFilter(r)} className={`px-3 py-2 rounded-lg text-xs font-bold capitalize whitespace-nowrap flex-shrink-0 ${roleFilter === r ? 'bg-[var(--gold)] text-[#0F1629]' : 'bg-[var(--s)] text-[var(--t4)]'}`} data-testid={`admin-role-filter-${r}`}>{r === 'all' ? 'All' : r}</button>
          ))}
          <div className="w-px bg-[var(--b)] mx-1" />
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'tree' : 'list')}
            className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${viewMode === 'tree' ? 'bg-[var(--gold)] text-[#0F1629]' : 'bg-[var(--s)] text-[var(--t4)]'}`}
            data-testid="toggle-tree-view"
          >
            <GitBranch className="w-3.5 h-3.5" /> Tree
          </button>
        </div>
      </div>
      <p className="text-xs text-[var(--t5)]">{filteredUsers.length} users</p>

      {viewMode === 'tree' ? renderTreeView() : (
        <div className="space-y-2">
          {filteredUsers.map(u => <UserRow key={u.id} u={u} />)}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-4 animate-fade-in"
            style={{
              background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(15,22,41,0.98) 40%)',
              border: '1.5px solid rgba(212,175,55,0.3)',
              boxShadow: '0 0 40px rgba(212,175,55,0.08)',
            }}
            data-testid="delete-confirm-modal"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>Delete Account</h3>
                <p className="text-[var(--t5)] text-[10px]">This action is irreversible</p>
              </div>
            </div>

            <div className="p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
              <p className="text-sm text-[var(--t3)]">
                Permanently delete <strong className="text-white">{deleteTarget.name}</strong> ({deleteTarget.role})?
              </p>
              <p className="text-[10px] text-red-400/80 mt-1">
                This will remove their account, estate, all documents, messages, beneficiaries, subscriptions, and checklists.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[var(--t4)] text-xs font-medium">Enter your admin password to confirm <span className="text-red-400">*</span></label>
              <div className="relative">
                <Input
                  type={showDeletePw ? 'text' : 'password'}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && deletePassword.trim() && handleDeleteUser()}
                  placeholder="Admin password"
                  className="h-11 bg-[#0b1322] border-[#1a2a42] text-white placeholder:text-[#2d3d55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-xl pr-10"
                  autoFocus
                  data-testid="delete-confirm-password"
                />
                <button type="button" onClick={() => setShowDeletePw(!showDeletePw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a4a63]">
                  {showDeletePw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="ghost"
                className="flex-1 text-[var(--t4)]"
                onClick={() => { setDeleteTarget(null); setDeletePassword(''); }}
                disabled={deleting}
                data-testid="delete-cancel-btn"
              >
                Cancel
              </Button>
              <Button
                className="flex-1 font-bold"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white' }}
                onClick={handleDeleteUser}
                disabled={deleting || !deletePassword.trim()}
                data-testid="delete-confirm-btn"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Delete Permanently
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
