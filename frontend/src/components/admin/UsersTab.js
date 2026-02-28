import React, { useState } from 'react';
import axios from 'axios';
import { Search, Users, Trash2, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const roleColors = {
  benefactor: { bg: 'rgba(37,99,235,0.1)', color: '#60A5FA' },
  beneficiary: { bg: 'rgba(139,92,246,0.1)', color: '#B794F6' },
  admin: { bg: 'rgba(224,173,43,0.1)', color: '#F0C95C' },
};

export const UsersTab = ({ users, setUsers, currentUserId, getAuthHeaders }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState(null);
  const [roleChanging, setRoleChanging] = useState(null);

  const filteredUsers = users
    .filter(u => roleFilter === 'all' || u.role === roleFilter)
    .filter(u => !searchQuery || u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.email?.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleRoleChange = async (userId, userName, newRole) => {
    setRoleChanging(userId);
    try {
      await axios.put(`${API_URL}/admin/users/${userId}/role`, { role: newRole }, getAuthHeaders());
      toast.success(`${userName}'s role changed to ${newRole}`);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change role');
    } finally {
      setRoleChanging(null);
    }
  };

  const handleDeleteUser = async (userId, name) => {
    if (!window.confirm(`Permanently delete "${name}"?`)) return;
    setActionLoading(userId);
    try {
      await axios.delete(`${API_URL}/admin/users/${userId}`, getAuthHeaders());
      toast.success(`User "${name}" deleted`);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setActionLoading(null);
    }
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
        </div>
      </div>
      <p className="text-xs text-[var(--t5)]">{filteredUsers.length} users</p>
      <div className="space-y-2">
        {filteredUsers.map(u => {
          const rc = roleColors[u.role] || roleColors.benefactor;
          return (
            <div key={u.id} className="glass-card p-3 flex items-center gap-3" data-testid={`admin-user-${u.id}`}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: rc.bg, color: rc.color }}>
                {u.name ? u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[var(--t)] text-sm truncate">{u.name || 'No name'}</div>
                <div className="text-xs text-[var(--t4)] truncate">{u.email}</div>
              </div>
              <div className="relative">
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, u.name, e.target.value)}
                  disabled={u.id === currentUserId || roleChanging === u.id}
                  className="text-xs px-2 py-1 pr-6 rounded-md font-bold capitalize appearance-none cursor-pointer border-0 outline-none"
                  style={{ background: rc.bg, color: rc.color }}
                  data-testid={`admin-role-select-${u.id}`}
                >
                  <option value="benefactor">benefactor</option>
                  <option value="beneficiary">beneficiary</option>
                  <option value="admin">admin</option>
                </select>
                {roleChanging === u.id ? (
                  <Loader2 className="w-3 h-3 animate-spin absolute right-1 top-1/2 -translate-y-1/2" style={{ color: rc.color }} />
                ) : (
                  <ChevronDown className="w-3 h-3 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: rc.color }} />
                )}
              </div>
              <div className="text-xs text-[var(--t5)] hidden sm:block">{u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}</div>
              {u.id !== currentUserId && (
                <Button variant="ghost" size="sm" className="text-[var(--rd)] hover:bg-[var(--rdbg)]" onClick={() => handleDeleteUser(u.id, u.name)} disabled={actionLoading === u.id} data-testid={`admin-delete-user-${u.id}`}>
                  {actionLoading === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
