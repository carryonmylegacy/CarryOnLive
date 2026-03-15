import React, { useState } from 'react';
import axios from 'axios';
import { Search, Users, Trash2, Loader2, ChevronDown, ChevronRight, KeyRound, Unlock, GitBranch, User, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from '../../utils/toast';
import { DeleteUserModal } from './DeleteUserModal';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const roleColors = {
  benefactor: { bg: 'rgba(37,99,235,0.1)', color: '#60A5FA' },
  beneficiary: { bg: 'rgba(139,92,246,0.1)', color: '#B794F6' },
  admin: { bg: 'rgba(224,173,43,0.1)', color: '#F0C95C' },
};

const statusColors = {
  draft: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444' },
  pending: { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B' },
  sent: { bg: 'rgba(139,92,246,0.12)', color: '#8B5CF6' },
  accepted: { bg: 'rgba(34,201,147,0.12)', color: '#22C993' },
};

export const UsersTab = ({ users, setUsers, currentUserId, getAuthHeaders, operatorMode = false }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [viewMode, setViewMode] = useState('tree'); // 'list' | 'tree'
  const [unlockUserId, setUnlockUserId] = useState(null);
  const [masterKeyInput, setMasterKeyInput] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name, role }
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePw, setShowDeletePw] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filteredUsers = users
    .filter(u => operatorMode ? (u.role !== 'admin' && u.role !== 'operator') : true)
    .filter(u => roleFilter === 'all' || u.role === roleFilter || (roleFilter === 'benefactor' && u.is_also_benefactor))
    .filter(u => !searchQuery || u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.email?.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // Admins always on top in the All Estates view
      if (roleFilter === 'all') {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (b.role === 'admin' && a.role !== 'admin') return 1;
      }
      // When viewing a specific role tab, sort alphabetically by name
      if (roleFilter !== 'all') return (a.name || '').localeCompare(b.name || '');
      return 0;
    });

  const toggleExpand = (userId) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
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
        <div className={`glass-card p-3 flex flex-wrap items-center gap-2 sm:gap-3 ${indent ? 'ml-6 sm:ml-8 border-l-2 border-[var(--b)]' : ''}`} data-testid={`admin-user-${u.id}`}>
          {/* Tree toggle for benefactors with beneficiaries (tree mode only) */}
          {viewMode === 'tree' && !indent && (u.role === 'benefactor' || u.is_also_benefactor) && (
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

          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold flex-shrink-0" style={{ background: rc.bg, color: rc.color }}>
            {u.name ? u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[var(--t)] text-xs sm:text-sm truncate">{u.name || 'No name'}</div>
            <div className="text-[10px] sm:text-xs text-[var(--t4)] truncate">{u.email}</div>
            {u.subscription?.plan_id && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold capitalize" style={{ background: 'rgba(212,175,55,0.1)', color: '#d4af37' }}>
                  {u.subscription.plan_name || u.subscription.plan_id}
                </span>
                <span className="text-[10px] text-[var(--t5)] capitalize hidden sm:inline">{u.subscription.billing_cycle || 'monthly'}</span>
                {u.subscription.beta_plan && <span className="text-[10px] text-purple-400 hidden sm:inline">(beta)</span>}
              </div>
            )}
            {viewMode === 'tree' && !indent && hasBens && (
              <div className="flex items-center gap-1 mt-0.5">
                <GitBranch className="w-3 h-3 text-[var(--t5)]" />
                <span className="text-[10px] text-[var(--t5)]">{u.linked_beneficiaries.length} ben{u.linked_beneficiaries.length === 1 ? '' : 's'}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span
              className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md font-bold capitalize"
              style={{ background: rc.bg, color: rc.color }}
              data-testid={`admin-role-badge-${u.id}`}
            >
              {u.role}
            </span>
            {u.is_also_beneficiary && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-md font-bold hidden sm:inline"
                style={{ background: 'rgba(139,92,246,0.1)', color: '#B794F6' }}
              >
                + ben
              </span>
            )}
            {u.is_also_benefactor && u.role === 'beneficiary' && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-md font-bold hidden sm:inline"
                style={{ background: 'rgba(37,99,235,0.1)', color: '#60A5FA' }}
              >
                + bnf
              </span>
            )}
          </div>
          {u.id !== currentUserId && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {(u.role === 'benefactor' || u.role === 'beneficiary') && (
                <Button variant="ghost" size="sm" className="text-[var(--t5)] h-7 w-7 p-0 sm:h-8 sm:w-8"
                  onClick={() => { setUnlockUserId(unlockUserId === u.id ? null : u.id); setMasterKeyInput(''); }}
                  title="Vault Unlock" data-testid={`vault-unlock-${u.id}`}>
                  <KeyRound className="w-3.5 h-3.5" />
                </Button>
              )}
              {!operatorMode && (
              <Button variant="ghost" size="sm" className="text-[var(--rd)] hover:bg-[var(--rdbg)] h-7 w-7 p-0 sm:h-8 sm:w-8" onClick={() => { setDeleteTarget({ id: u.id, name: u.name, role: u.role }); setDeletePassword(''); setShowDeletePw(false); }} data-testid={`admin-delete-user-${u.id}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
              )}
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
          {ben.invitation_status || 'draft'}
        </span>
      </div>
    );
  };

  // Helper: calculate age from DOB
  const getAge = (dob) => {
    if (!dob) return 999;
    const d = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    return age;
  };

  // Tree view: group by ESTATE, benefactors at top sorted by age, beneficiaries indented below sorted by age
  const renderTreeView = () => {
    const benefactors = filteredUsers.filter(u => u.role === 'benefactor' || u.is_also_benefactor);
    const beneficiaryUsers = filteredUsers.filter(u => u.role === 'beneficiary' && !u.is_also_benefactor);
    const admins = filteredUsers.filter(u => u.role === 'admin');

    // Build estate map: estate -> { owner, beneficiaries[] }
    const estateMap = new Map();
    const benUserByEmail = new Map();
    beneficiaryUsers.forEach(u => { if (u.email) benUserByEmail.set(u.email.toLowerCase(), u); });

    benefactors.forEach(owner => {
      const bens = owner.linked_beneficiaries || [];
      estateMap.set(owner.id, {
        owner,
        estateName: `${owner.name || 'Unknown'}'s Estate`,
        beneficiaries: bens,
        linkedUsers: bens
          .map(b => b.email ? benUserByEmail.get(b.email.toLowerCase()) : null)
          .filter(Boolean),
      });
    });

    // Track shown beneficiary user IDs so we can show orphans
    const shownBenIds = new Set();
    estateMap.forEach(estate => {
      estate.linkedUsers.forEach(u => shownBenIds.add(u.id));
    });
    const orphans = beneficiaryUsers.filter(u => !shownBenIds.has(u.id));

    // Sort benefactors by age (youngest first)
    const sortedEstates = [...estateMap.values()].sort((a, b) => {
      const ageA = getAge(a.owner.date_of_birth);
      const ageB = getAge(b.owner.date_of_birth);
      return ageA - ageB;
    });

    return (
      <div className="space-y-3">
        {admins.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2">Administrators</p>
            <div className="space-y-2">
              {admins.map(u => <UserRow key={u.id} u={u} />)}
            </div>
          </div>
        )}

        {sortedEstates.map(({ owner, estateName, beneficiaries: bens, linkedUsers }) => {
          const isExpanded = expandedUsers.has(owner.id);

          // Sort linked beneficiaries by age
          const sortedLinkedUsers = [...linkedUsers].sort((a, b) => getAge(a.date_of_birth) - getAge(b.date_of_birth));
          const linkedEmails = new Set(linkedUsers.map(u => u.email?.toLowerCase()));
          const nonUserBens = bens
            .filter(b => !b.email || !linkedEmails.has(b.email.toLowerCase()))
            .sort((a, b) => getAge(a.date_of_birth || a.dob) - getAge(b.date_of_birth || b.dob));

          return (
            <div key={owner.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)', background: 'rgba(255,255,255,0.01)' }}>
              {/* Estate header */}
              <button
                onClick={() => toggleExpand(owner.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--s)]"
                data-testid={`estate-header-${owner.id}`}
              >
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--gold)]" /> : <ChevronRight className="w-4 h-4 text-[var(--t5)]" />}
                </div>
                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.1)' }}>
                  <Users className="w-3.5 h-3.5 text-[var(--gold)]" />
                </div>
                <span className="text-xs font-bold text-[var(--gold)] flex-1">{estateName}</span>
                <span className="text-[10px] text-[var(--t5)] px-2 py-0.5 rounded-full" style={{ background: 'var(--s)' }}>
                  {bens.length} beneficiar{bens.length === 1 ? 'y' : 'ies'}
                </span>
              </button>

              {/* Always show the benefactor row */}
              <div className="px-2 pb-1">
                <UserRow u={owner} />
              </div>

              {/* Expanded: show beneficiaries indented with tree connectors */}
              {isExpanded && (
                <div className="px-2 pb-2">
                  {sortedLinkedUsers.map((bu, idx) => (
                    <div key={bu.id} className="flex" data-testid={`tree-child-${bu.id}`}>
                      {/* Tree connector */}
                      <div className="flex flex-col items-center ml-6 mr-1 flex-shrink-0" style={{ width: 20 }}>
                        <div style={{ width: 1, height: '50%', background: 'var(--b)' }} />
                        <div style={{ width: 12, height: 1, background: 'var(--b)', alignSelf: 'flex-start', marginLeft: 1 }} />
                        {idx < sortedLinkedUsers.length + nonUserBens.length - 1 && (
                          <div style={{ width: 1, height: '50%', background: 'var(--b)' }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="glass-card p-2.5 flex items-center gap-2.5 mb-1" style={{ fontSize: '0.85em' }}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                            style={{ background: roleColors.beneficiary.bg, color: roleColors.beneficiary.color }}>
                            {bu.name ? bu.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-[var(--t)] text-xs truncate">{bu.name || 'No name'}</div>
                            <div className="text-[10px] text-[var(--t5)] truncate">{bu.email}</div>
                          </div>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: roleColors.beneficiary.bg, color: roleColors.beneficiary.color }}>
                            beneficiary
                          </span>
                          {bu.id !== currentUserId && !operatorMode && (
                            <Button variant="ghost" size="sm" className="text-[var(--rd)] hover:bg-[var(--rdbg)] h-6 w-6 p-0" onClick={() => { setDeleteTarget({ id: bu.id, name: bu.name, role: bu.role }); setDeletePassword(''); setShowDeletePw(false); }}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {nonUserBens.map((ben, idx) => (
                    <div key={ben.id} className="flex" data-testid={`tree-stub-${ben.id}`}>
                      <div className="flex flex-col items-center ml-6 mr-1 flex-shrink-0" style={{ width: 20 }}>
                        <div style={{ width: 1, height: '50%', background: 'var(--b)' }} />
                        <div style={{ width: 12, height: 1, background: 'var(--b)', alignSelf: 'flex-start', marginLeft: 1 }} />
                        {idx < nonUserBens.length - 1 && (
                          <div style={{ width: 1, height: '50%', background: 'var(--b)' }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <BeneficiaryLeaf ben={ben} />
                      </div>
                    </div>
                  ))}
                  {bens.length === 0 && (
                    <div className="ml-8 pl-4 py-2 text-xs text-[var(--t5)] italic">
                      No beneficiaries enrolled yet
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Orphan beneficiary users */}
        {orphans.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2 mt-4">
              Unlinked Beneficiaries ({orphans.length})
            </p>
            <div className="space-y-2">
              {orphans.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(u => <UserRow key={u.id} u={u} />)}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Graph view: HTML/CSS-based visual family tree per estate (matches Estate Health style)
  const renderGraphView = () => {
    const benefactors = filteredUsers.filter(u => u.role === 'benefactor' || u.is_also_benefactor);
    const beneficiaryUsers = filteredUsers.filter(u => u.role === 'beneficiary' && !u.is_also_benefactor);
    const admins = filteredUsers.filter(u => u.role === 'admin');
    const benUserByEmail = new Map();
    beneficiaryUsers.forEach(u => { if (u.email) benUserByEmail.set(u.email.toLowerCase(), u); });

    const estates = benefactors.map(owner => {
      const bens = owner.linked_beneficiaries || [];
      return { owner, bens };
    }).sort((a, b) => getAge(a.owner.date_of_birth) - getAge(b.owner.date_of_birth));

    const getInit = (n) => n?.name ? n.name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2) : '??';
    const benAge = (b) => { const a = getAge(b.date_of_birth || b.dob); return a < 999 ? a : null; };

    // Status badge overlay for beneficiary nodes
    const getBenStatusBadge = (ben) => {
      const linked = ben.email && benUserByEmail.has(ben.email.toLowerCase());
      if (linked) return { bg: statusColors.accepted.color, label: 'accepted' };
      const s = ben.invitation_status || 'draft';
      const sc = statusColors[s] || statusColors.draft;
      return { bg: sc.color, label: s };
    };

    const getBenNodeColor = (ben) => {
      const linked = ben.email && benUserByEmail.has(ben.email.toLowerCase());
      if (linked) return statusColors.accepted.color;
      const s = ben.invitation_status || 'draft';
      return (statusColors[s] || statusColors.draft).color;
    };

    // Graph node with status badge
    const GraphNode = ({ initials, color, size = 44, label, sublabel, statusBadge, extra }) => (
      <div className="flex flex-col items-center gap-0.5">
        <div className="relative">
          <div
            className="rounded-full flex items-center justify-center font-bold"
            style={{
              width: size, height: size,
              background: `${color}20`,
              fontSize: size * 0.3,
              color: color,
              border: `2px solid ${color}`,
              boxShadow: `0 0 10px ${color}30`,
            }}
          >
            {initials}
          </div>
          {statusBadge && (
            <div className="absolute -bottom-0.5 -right-0.5 px-1 py-px rounded-full text-[7px] font-black uppercase"
              style={{ background: statusBadge.bg, color: '#080e1a', lineHeight: '1.1' }}>
              {statusBadge.label === 'accepted' ? '✓' : statusBadge.label[0].toUpperCase()}
            </div>
          )}
        </div>
        {label && <span className="text-[10px] font-semibold text-[var(--t)] text-center leading-tight">{label}</span>}
        {sublabel && <span className="text-[8px] text-[#64748B] text-center leading-tight">{sublabel}</span>}
        {extra && <span className="text-[8px] text-center leading-tight" style={{ color: statusBadge?.bg || '#64748B' }}>{extra}</span>}
      </div>
    );

    return (
      <div className="space-y-4">
        {admins.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2">Administrators</p>
            <div className="space-y-2">
              {admins.map(u => <UserRow key={u.id} u={u} />)}
            </div>
          </div>
        )}

        {estates.map(({ owner, bens }) => {
          const sortedBens = [...bens].sort((a, b) => getAge(a.date_of_birth || a.dob) - getAge(b.date_of_birth || b.dob));
          const linked = sortedBens.filter(b => b.email && benUserByEmail.has(b.email.toLowerCase())).length;
          const invited = sortedBens.filter(b => b.invitation_status === 'sent' || b.invitation_status === 'accepted').length;

          return (
            <div key={owner.id} className="glass-card p-4 rounded-xl" data-testid={`graph-estate-${owner.id}`}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.1)' }}>
                  <Users className="w-3 h-3 text-[var(--gold)]" />
                </div>
                <span className="text-xs font-bold text-[var(--gold)] flex-1">{owner.name}'s Estate</span>
                <span className="text-[10px] text-[var(--t5)]">{bens.length} beneficiar{bens.length === 1 ? 'y' : 'ies'}</span>
              </div>

              {/* Summary stats */}
              <div className="flex items-center gap-3 mb-3 ml-7">
                <span className="text-[10px]" style={{ color: linked === bens.length && bens.length > 0 ? '#22C993' : '#F5A623' }}>
                  {linked}/{bens.length} linked
                </span>
                <span className="text-[10px]" style={{ color: invited > 0 ? '#8B5CF6' : '#64748B' }}>
                  {invited} invited
                </span>
                {owner.subscription?.plan_id && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(212,175,55,0.1)', color: '#d4af37' }}>
                    {owner.subscription.plan_name || owner.subscription.plan_id}
                  </span>
                )}
              </div>

              {/* Tree visualization */}
              <div className="flex flex-col items-center">
                <GraphNode
                  initials={getInit(owner)}
                  color="#d4af37"
                  size={52}
                  label={owner.name?.split(' ')[0] || 'Owner'}
                  sublabel={owner.email}
                />

                {sortedBens.length > 0 && (
                  <div className="flex flex-col items-center">
                    <div style={{ width: 2, height: 18, background: '#d4af37', opacity: 0.5 }} />
                    {sortedBens.length > 1 ? (
                      <div className="relative w-full flex justify-center" style={{ minWidth: sortedBens.length * 80 }}>
                        <div className="absolute top-0 left-[10%] right-[10%]" style={{ height: 2, background: '#d4af37', opacity: 0.25 }} />
                        <div className="flex gap-4 justify-center pt-1 flex-wrap">
                          {sortedBens.map(ben => {
                            const color = getBenNodeColor(ben);
                            const age = benAge(ben);
                            const badge = getBenStatusBadge(ben);
                            const benInitials = ben.first_name && ben.last_name
                              ? ben.first_name[0] + ben.last_name[0]
                              : ben.name ? ben.name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2) : '??';
                            return (
                              <div key={ben.id} className="flex flex-col items-center">
                                <div style={{ width: 2, height: 12, background: color, opacity: 0.4 }} />
                                <GraphNode
                                  initials={benInitials}
                                  color={color}
                                  size={40}
                                  label={ben.first_name || ben.name?.split(' ')[0] || ''}
                                  sublabel={`${ben.relation || ''}${age !== null ? ` · ${age}` : ''}`}
                                  statusBadge={badge}
                                  extra={ben.email || 'No email'}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      sortedBens.map(ben => {
                        const color = getBenNodeColor(ben);
                        const age = benAge(ben);
                        const badge = getBenStatusBadge(ben);
                        const benInitials = ben.first_name && ben.last_name
                          ? ben.first_name[0] + ben.last_name[0]
                          : ben.name ? ben.name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2) : '??';
                        return (
                          <div key={ben.id} className="flex flex-col items-center">
                            <div style={{ width: 2, height: 12, background: color, opacity: 0.4 }} />
                            <GraphNode
                              initials={benInitials}
                              color={color}
                              size={40}
                              label={ben.first_name || ben.name?.split(' ')[0] || ''}
                              sublabel={`${ben.relation || ''}${age !== null ? ` · ${age}` : ''}`}
                              statusBadge={badge}
                              extra={ben.email || 'No email'}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {sortedBens.length === 0 && (
                  <p className="text-[10px] text-[var(--t5)] mt-2 italic">No beneficiaries</p>
                )}
              </div>
            </div>
          );
        })}

        {/* Orphan beneficiary users (no estate link) */}
        {(() => {
          const shownBenIds = new Set();
          estates.forEach(({ bens }) => {
            bens.forEach(b => { if (b.email) { const u = benUserByEmail.get(b.email.toLowerCase()); if (u) shownBenIds.add(u.id); }});
          });
          const orphans = beneficiaryUsers.filter(u => !shownBenIds.has(u.id));
          if (orphans.length === 0) return null;
          return (
            <div>
              <p className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2 mt-4">Unlinked Beneficiaries ({orphans.length})</p>
              <div className="space-y-2">{orphans.map(u => <UserRow key={u.id} u={u} />)}</div>
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
          {['all', 'benefactor', 'beneficiary'].map(r => (
            <button key={r} onClick={() => {
              const mainEl = document.querySelector('.main-content');
              const savedPos = mainEl ? mainEl.scrollTop : 0;
              // Disable smooth scroll to prevent flash
              const html = document.documentElement;
              if (mainEl) { mainEl.style.scrollBehavior = 'auto'; html.style.scrollBehavior = 'auto'; }
              setRoleFilter(r);
              setViewMode(r === 'all' ? 'tree' : 'list');
              if (mainEl) {
                const force = () => { mainEl.scrollTop = savedPos; };
                mainEl.addEventListener('scroll', force);
                force();
                requestAnimationFrame(force);
                requestAnimationFrame(() => requestAnimationFrame(force));
                setTimeout(force, 0);
                setTimeout(force, 50);
                setTimeout(() => {
                  mainEl.removeEventListener('scroll', force);
                  mainEl.style.scrollBehavior = '';
                  html.style.scrollBehavior = '';
                }, 200);
              }
            }} className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap flex-shrink-0 ${roleFilter === r ? 'bg-[var(--gold)] text-[#0F1629]' : 'bg-[var(--s)] text-[var(--t4)]'}`} data-testid={`admin-role-filter-${r}`}>{r === 'all' ? 'All Estates' : r === 'beneficiary' ? 'Beneficiaries' : 'Benefactors'}</button>
          ))}
          <div className="w-px bg-[var(--b)] mx-1" />
          <button
            onClick={() => {
              const mainEl = document.querySelector('.main-content');
              const savedPos = mainEl ? mainEl.scrollTop : 0;
              const html = document.documentElement;
              if (mainEl) { mainEl.style.scrollBehavior = 'auto'; html.style.scrollBehavior = 'auto'; }
              setViewMode(viewMode === 'list' ? 'tree' : viewMode === 'tree' ? 'graph' : 'list');
              if (mainEl) {
                const force = () => { mainEl.scrollTop = savedPos; };
                mainEl.addEventListener('scroll', force);
                force();
                requestAnimationFrame(force);
                setTimeout(force, 0);
                setTimeout(force, 50);
                setTimeout(() => {
                  mainEl.removeEventListener('scroll', force);
                  mainEl.style.scrollBehavior = '';
                  html.style.scrollBehavior = '';
                }, 200);
              }
            }}
            className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${viewMode !== 'list' ? 'bg-[var(--gold)] text-[#0F1629]' : 'bg-[var(--s)] text-[var(--t4)]'}`}
            data-testid="toggle-tree-view"
          >
            <GitBranch className="w-3.5 h-3.5" /> {viewMode === 'tree' ? 'Tree' : viewMode === 'graph' ? 'Graph' : 'List'}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-[var(--t5)]">{filteredUsers.length} users</p>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap" data-testid="status-key">
          {[
            { label: 'Draft', desc: 'No email', color: statusColors.draft },
            { label: 'Pending', desc: 'Has email', color: statusColors.pending },
            { label: 'Sent', desc: 'Invite sent', color: statusColors.sent },
            { label: 'Accepted', desc: 'Portal active', color: statusColors.accepted },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color.color }} />
              <span className="text-[9px] sm:text-[10px] font-semibold" style={{ color: s.color.color }}>{s.label}</span>
              <span className="text-[10px] text-[var(--t5)] hidden sm:inline">— {s.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {viewMode === 'tree' ? renderTreeView() : viewMode === 'graph' ? renderGraphView() : (
        <div className="space-y-2">
          {filteredUsers.map(u => <UserRow key={u.id} u={u} />)}
        </div>
      )}

      {/* Delete Confirmation Modal — Founder only */}
      {!operatorMode && (
        <DeleteUserModal
          deleteTarget={deleteTarget}
          deletePassword={deletePassword}
          setDeletePassword={setDeletePassword}
          showDeletePw={showDeletePw}
          setShowDeletePw={setShowDeletePw}
          handleDeleteUser={handleDeleteUser}
          deleting={deleting}
          onCancel={() => { setDeleteTarget(null); setDeletePassword(''); }}
        />
      )}
    </div>
  );
};
