import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield,
  Users,
  FileKey,
  Clock,
  CheckCircle2,
  XCircle,
  Trash2,
  Loader2,
  FolderLock,
  MessageSquare,
  Search,
  BarChart3,
  UserCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Skeleton } from '../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AdminPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [approving, setApproving] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const [usersRes, statsRes, certsRes] = await Promise.all([
        axios.get(`${API_URL}/admin/users`, getAuthHeaders()),
        axios.get(`${API_URL}/admin/stats`, getAuthHeaders()),
        axios.get(`${API_URL}/transition/certificates`, getAuthHeaders()).catch(() => ({ data: [] })),
      ]);
      setUsers(usersRes.data);
      setStats(statsRes.data);
      setCertificates(certsRes.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load admin data');
    } finally { setLoading(false); }
  };

  const handleApprove = async (certId) => {
    setApproving(certId);
    try {
      await axios.post(`${API_URL}/transition/approve/${certId}`, {}, getAuthHeaders());
      toast.success('Certificate approved — estate transitioned');
      setCertificates(prev => prev.filter(c => c.id !== certId));
      fetchAll();
    } catch (err) { toast.error('Failed to approve'); }
    finally { setApproving(null); }
  };

  const handleDeleteUser = async (userId, name) => {
    if (!confirm(`Permanently delete user "${name}"? This cannot be undone.`)) return;
    setDeleting(userId);
    try {
      await axios.delete(`${API_URL}/admin/users/${userId}`, getAuthHeaders());
      toast.success(`User "${name}" deleted`);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete'); }
    finally { setDeleting(null); }
  };

  const filteredUsers = users
    .filter(u => roleFilter === 'all' || u.role === roleFilter)
    .filter(u => !searchQuery || u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.email?.toLowerCase().includes(searchQuery.toLowerCase()));

  const roleColors = { benefactor: { bg: 'rgba(37,99,235,0.1)', color: '#60A5FA', border: 'rgba(37,99,235,0.2)' }, beneficiary: { bg: 'rgba(139,92,246,0.1)', color: '#B794F6', border: 'rgba(139,92,246,0.2)' }, admin: { bg: 'rgba(224,173,43,0.1)', color: '#F0C95C', border: 'rgba(224,173,43,0.2)' } };

  if (user?.role !== 'admin') {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 animate-fade-in">
        <Card className="glass-card"><CardContent className="p-12 text-center">
          <Shield className="w-16 h-16 mx-auto text-[#ef4444] mb-4" />
          <h3 className="text-xl font-bold text-[var(--t)] mb-2">Access Denied</h3>
          <p className="text-[var(--t4)]">You do not have permission to access the admin panel.</p>
        </CardContent></Card>
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6"><Skeleton className="h-12 w-64 bg-[var(--s)]" /><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 bg-[var(--s)] rounded-2xl" />)}</div></div>;
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="admin-dashboard">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--gold)]/20 flex items-center justify-center">
          <Shield className="w-5 h-5 text-[var(--gold)]" />
        </div>
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Admin Dashboard</h1>
          <p className="text-xs text-[var(--t5)]">Platform administration · Full database access</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { v: stats.users.total, l: 'Total Users', icon: Users, color: '#60A5FA' },
            { v: stats.users.benefactors, l: 'Benefactors', icon: UserCircle, color: '#60A5FA' },
            { v: stats.users.beneficiaries, l: 'Beneficiaries', icon: UserCircle, color: '#B794F6' },
            { v: stats.estates.total, l: 'Estates', icon: FolderLock, color: '#22C993' },
            { v: stats.pending_certificates, l: 'Pending Certs', icon: FileKey, color: '#F59E0B' },
          ].map(s => (
            <div key={s.l} className="glass-card p-4 text-center">
              <s.icon className="w-5 h-5 mx-auto mb-2" style={{ color: s.color }} />
              <div className="text-2xl font-bold text-[var(--t)]">{s.v}</div>
              <div className="text-xs text-[var(--t4)]">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'users', label: 'All Users', icon: Users },
          { key: 'certificates', label: 'Transition Certificates', icon: FileKey },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === t.key ? 'bg-[var(--gold)] text-[#0F1629]' : 'bg-[var(--s)] text-[var(--t4)] hover:text-[var(--t)]'
            }`}
            data-testid={`admin-tab-${t.key}`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="space-y-4">
          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              <Search className="w-4 h-4 text-[var(--t5)]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or email..."
                className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]"
                data-testid="admin-user-search"
              />
            </div>
            <div className="flex gap-2">
              {['all', 'benefactor', 'beneficiary', 'admin'].map(r => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                    roleFilter === r ? 'bg-[var(--gold)] text-[#0F1629]' : 'bg-[var(--s)] text-[var(--t4)]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* User Count */}
          <p className="text-xs text-[var(--t5)]">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} found</p>

          {/* User Table */}
          <div className="space-y-2">
            {filteredUsers.map(u => {
              const rc = roleColors[u.role] || roleColors.benefactor;
              const initials = u.name ? u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';
              return (
                <div key={u.id} className="glass-card p-4 flex items-center gap-4" data-testid={`admin-user-${u.id}`}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: rc.bg, color: rc.color }}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[var(--t)] text-sm truncate">{u.name || 'No name'}</div>
                    <div className="text-xs text-[var(--t4)] truncate">{u.email}</div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-md font-bold capitalize flex-shrink-0" style={{ background: rc.bg, color: rc.color, border: `1px solid ${rc.border}` }}>
                    {u.role}
                  </span>
                  <div className="text-xs text-[var(--t5)] hidden sm:block flex-shrink-0">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}
                  </div>
                  {u.id !== user.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[var(--rd)] hover:bg-[var(--rdbg)] flex-shrink-0"
                      onClick={() => handleDeleteUser(u.id, u.name)}
                      disabled={deleting === u.id}
                      data-testid={`admin-delete-${u.id}`}
                    >
                      {deleting === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Certificates Tab */}
      {tab === 'certificates' && (
        <div className="space-y-4">
          {certificates.length === 0 ? (
            <Card className="glass-card"><CardContent className="p-12 text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto text-[var(--gn2)] mb-4" />
              <h3 className="font-bold text-[var(--t)] mb-2">No Pending Certificates</h3>
              <p className="text-sm text-[var(--t4)]">All transition certificates have been reviewed.</p>
            </CardContent></Card>
          ) : (
            certificates.map(cert => (
              <Card key={cert.id} className="glass-card" data-testid={`admin-cert-${cert.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#f59e0b]/20 flex items-center justify-center flex-shrink-0">
                      <FileKey className="w-6 h-6 text-[#f59e0b]" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-[var(--t)]">Death Certificate</h3>
                      <p className="text-sm text-[var(--t4)]">Estate: {cert.estate_id}</p>
                      <p className="text-sm text-[var(--t4)]">Uploaded by: {cert.uploaded_by}</p>
                      <p className="text-sm text-[var(--t4)]">File: {cert.file_name}</p>
                      <p className="text-xs text-[var(--t5)] mt-1">{new Date(cert.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        className="gold-button"
                        size="sm"
                        onClick={() => handleApprove(cert.id)}
                        disabled={approving === cert.id}
                      >
                        {approving === cert.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                        Approve
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPage;
