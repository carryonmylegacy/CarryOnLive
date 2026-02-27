import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, Users, FileKey, Clock, CheckCircle2, XCircle, Trash2, Loader2,
  FolderLock, Search, UserCircle, Eye, Package, Lock, DollarSign, Mail, Flame,
  ChevronRight, AlertTriangle, Settings, Headphones, Send, MessageCircle, CreditCard, ToggleLeft,
  Activity, FileUp, UserPlus, ChevronDown, X
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Skeleton } from '../components/ui/skeleton';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const typeIcons = { delivery: Package, account_closure: Lock, financial: DollarSign, communication: Mail, destruction: Flame };
const confColors = { full: '#F98080', partial: '#FFCB57', timed: '#7AABFD' };
const statusColors = { submitted: 'var(--bl3)', quoted: 'var(--yw)', approved: 'var(--gn2)', ready: 'var(--gn2)', executed: '#B794F6', destroyed: 'var(--t5)' };

const AdminPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pathTab = location.pathname === '/admin/transition' ? 'transition' 
    : location.pathname === '/admin/dts' ? 'dts' 
    : location.pathname === '/admin/dev-switcher' ? 'dev-switcher'
    : location.pathname === '/admin/support' ? 'support'
    : location.pathname === '/admin/subscriptions' ? 'subscriptions'
    : location.pathname === '/admin/verifications' ? 'verifications'
    : location.pathname === '/admin/analytics' ? 'analytics'
    : location.pathname === '/admin/activity' ? 'activity'
    : 'users';
  const tab = pathTab;
  const setTab = (v) => navigate(
    v === 'users' ? '/admin' : `/admin/${v}`
  );
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [dtsTasks, setDtsTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState(null);
  const [selectedDts, setSelectedDts] = useState(null);
  const [quoteItems, setQuoteItems] = useState([{ description: '', cost: '' }]);
  
  // Support chat state
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [convMessages, setConvMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [roleChanging, setRoleChanging] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, []);

  // Tab is computed directly from pathname via pathTab

  const fetchAll = async () => {
    try {
      const [usersRes, statsRes, certsRes, dtsRes] = await Promise.all([
        axios.get(`${API_URL}/admin/users`, getAuthHeaders()),
        axios.get(`${API_URL}/admin/stats`, getAuthHeaders()),
        axios.get(`${API_URL}/transition/certificates/all`, getAuthHeaders()).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/dts/tasks/all`, getAuthHeaders()).catch(() => ({ data: [] })),
      ]);
      setUsers(usersRes.data);
      setStats(statsRes.data);
      setCertificates(certsRes.data);
      setDtsTasks(dtsRes.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Support functions
  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API_URL}/support/conversations`, getAuthHeaders());
      setConversations(res.data);
    } catch (err) { console.error('Error fetching conversations:', err); }
  };

  const fetchConversationMessages = async (convId) => {
    try {
      const res = await axios.get(`${API_URL}/support/messages/${convId}`, getAuthHeaders());
      setConvMessages(res.data);
    } catch (err) { console.error('Error fetching messages:', err); }
  };

  const sendSupportMessage = async () => {
    if (!newMessage.trim() || !selectedConv) return;
    setSendingMessage(true);
    try {
      const res = await axios.post(`${API_URL}/support/messages`, {
        content: newMessage.trim(),
        conversation_id: selectedConv.conversation_id
      }, getAuthHeaders());
      setConvMessages(prev => [...prev, res.data]);
      setNewMessage('');
      fetchConversations();
    } catch (err) {
      toast.error('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

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

  const fetchActivityLog = async () => {
    setActivityLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/activity`, getAuthHeaders());
      setActivityLog(res.data);
    } catch (err) { console.error('Error fetching activity:', err); }
    finally { setActivityLoading(false); }
  };

  // Fetch conversations when support tab is selected
  useEffect(() => {
    if (tab === 'support') {
      fetchConversations();
      const interval = setInterval(fetchConversations, 15000);
      return () => clearInterval(interval);
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch activity log when activity tab is selected
  useEffect(() => {
    if (tab === 'activity') fetchActivityLog();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch messages when conversation is selected
  useEffect(() => {
    if (selectedConv) {
      fetchConversationMessages(selectedConv.conversation_id);
      const interval = setInterval(() => fetchConversationMessages(selectedConv.conversation_id), 10000);
      return () => clearInterval(interval);
    }
  }, [selectedConv]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApproveCert = async (certId) => {
    setActionLoading(certId);
    try {
      await axios.post(`${API_URL}/transition/approve/${certId}`, {}, getAuthHeaders());
      toast.success('Certificate approved — benefactor sealed, beneficiary access granted');
      fetchAll();
    } catch (err) { toast.error('Failed to approve'); }
    finally { setActionLoading(null); }
  };

  const handleBeginReview = async (certId) => {
    setActionLoading(certId);
    try {
      await axios.post(`${API_URL}/transition/begin-review/${certId}`, {}, getAuthHeaders());
      toast.success('Review started — beneficiary can now see you are reviewing');
      fetchAll();
    } catch (err) { toast.error('Failed to begin review'); }
    finally { setActionLoading(null); }
  };

  const handleRejectCert = async (certId) => {
    if (!confirm('Reject this death certificate?')) return;
    setActionLoading(certId);
    try {
      await axios.post(`${API_URL}/transition/reject/${certId}`, {}, getAuthHeaders());
      toast.success('Certificate rejected');
      fetchAll();
    } catch (err) { toast.error('Failed to reject'); }
    finally { setActionLoading(null); }
  };

  const handleDeleteUser = async (userId, name) => {
    if (!confirm(`Permanently delete "${name}"?`)) return;
    setActionLoading(userId);
    try {
      await axios.delete(`${API_URL}/admin/users/${userId}`, getAuthHeaders());
      toast.success(`User "${name}" deleted`);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setActionLoading(null); }
  };

  const handleSubmitQuote = async (taskId) => {
    const items = quoteItems.filter(i => i.description && i.cost);
    if (items.length === 0) { toast.error('Add at least one line item'); return; }
    setActionLoading(taskId);
    try {
      await axios.post(`${API_URL}/dts/tasks/${taskId}/quote`, {
        task_id: taskId,
        line_items: items.map(i => ({ description: i.description, cost: parseFloat(i.cost) })),
      }, getAuthHeaders());
      toast.success('Quote submitted to benefactor');
      setSelectedDts(null);
      setQuoteItems([{ description: '', cost: '' }]);
      fetchAll();
    } catch (err) { toast.error('Failed to submit quote'); }
    finally { setActionLoading(null); }
  };

  const handleUpdateDtsStatus = async (taskId, status) => {
    setActionLoading(taskId);
    try {
      await axios.post(`${API_URL}/dts/tasks/${taskId}/status?status=${status}`, {}, getAuthHeaders());
      toast.success(`Status updated to ${status}`);
      fetchAll();
    } catch (err) { toast.error('Failed'); }
    finally { setActionLoading(null); }
  };

  const filteredUsers = users.filter(u => roleFilter === 'all' || u.role === roleFilter)
    .filter(u => !searchQuery || u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.email?.toLowerCase().includes(searchQuery.toLowerCase()));

  const roleColors = { benefactor: { bg: 'rgba(37,99,235,0.1)', color: '#60A5FA' }, beneficiary: { bg: 'rgba(139,92,246,0.1)', color: '#B794F6' }, admin: { bg: 'rgba(224,173,43,0.1)', color: '#F0C95C' } };

  if (user?.role !== 'admin') {
    return <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 animate-fade-in"><Card className="glass-card"><CardContent className="p-12 text-center"><Shield className="w-16 h-16 mx-auto text-[#ef4444] mb-4" /><h3 className="text-xl font-bold text-[var(--t)] mb-2">Access Denied</h3></CardContent></Card></div>;
  }

  if (loading) return <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6"><Skeleton className="h-12 w-64 bg-[var(--s)]" /></div>;

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in max-w-full overflow-x-hidden" data-testid="admin-dashboard">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--gold)]/20 flex items-center justify-center">
          <Shield className="w-5 h-5 text-[var(--gold)]" />
        </div>
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Admin Dashboard</h1>
          <p className="text-xs text-[var(--t5)]">Platform administration · Transition verification · DTS management</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { v: stats.users.total, l: 'Total Users', icon: Users, color: '#60A5FA' },
            { v: stats.estates.total, l: 'Estates', icon: FolderLock, color: '#22C993' },
            { v: stats.documents, l: 'Documents', icon: FileUp, color: '#B794F6' },
            { v: stats.pending_certificates, l: 'Pending Certs', icon: FileKey, color: '#F59E0B' },
          ].map(s => (
            <div key={s.l} className="glass-card p-3 text-center">
              <s.icon className="w-4 h-4 mx-auto mb-1" style={{ color: s.color }} />
              <div className="text-xl font-bold text-[var(--t)]">{s.v}</div>
              <div className="text-[10px] text-[var(--t4)]">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {[
          { key: 'users', label: 'All Users', icon: Users, path: '/admin' },
          { key: 'transition', label: 'Transition Verification', icon: FileKey, path: '/admin/transition' },
          { key: 'dts', label: 'DTS Management', icon: Shield, path: '/admin/dts' },
          { key: 'support', label: 'Customer Support', icon: Headphones, path: '/admin/support' },
          { key: 'subscriptions', label: 'Subscriptions', icon: CreditCard, path: '/admin/subscriptions' },
          { key: 'verifications', label: 'Verifications', icon: FileKey, path: '/admin/verifications' },
          { key: 'analytics', label: 'Analytics', icon: Activity, path: '/admin/analytics' },
          { key: 'activity', label: 'Activity Log', icon: Activity, path: '/admin/activity' },
          { key: 'dev-switcher', label: 'Dev Switcher', icon: Settings, path: '/admin/dev-switcher' },
        ].map(t => (
          <button key={t.key} onClick={() => navigate(t.path)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
              tab === t.key ? 'bg-[var(--gold)] text-[#0F1629]' : 'bg-[var(--s)] text-[var(--t4)]'
            }`} data-testid={`admin-tab-${t.key}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ============ USERS TAB ============ */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              <Search className="w-4 h-4 text-[var(--t5)]" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]" />
            </div>
            <div className="flex gap-1">
              {['all', 'benefactor', 'beneficiary', 'admin'].map(r => (
                <button key={r} onClick={() => setRoleFilter(r)} className={`px-3 py-2 rounded-lg text-xs font-bold capitalize ${roleFilter === r ? 'bg-[var(--gold)] text-[#0F1629]' : 'bg-[var(--s)] text-[var(--t4)]'}`}>{r}</button>
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
                      disabled={u.id === user.id || roleChanging === u.id}
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
                  {u.id !== user.id && (
                    <Button variant="ghost" size="sm" className="text-[var(--rd)] hover:bg-[var(--rdbg)]" onClick={() => handleDeleteUser(u.id, u.name)} disabled={actionLoading === u.id}>
                      {actionLoading === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ TRANSITION VERIFICATION TAB ============ */}
      {tab === 'transition' && (
        <div className="space-y-4">
          <div className="rounded-xl p-4" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <h3 className="font-bold text-[var(--pr2)] mb-2">Transition Verification Team</h3>
            <p className="text-sm text-[var(--t3)] leading-relaxed">
              Review uploaded death certificates. Upon approval, the benefactor's account is immutably sealed and all designated beneficiary access is granted as specified.
            </p>
          </div>

          {certificates.length === 0 ? (
            <Card className="glass-card"><CardContent className="p-12 text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto text-[var(--gn2)] mb-4" />
              <h3 className="font-bold text-[var(--t)] mb-2">No Certificates to Review</h3>
              <p className="text-sm text-[var(--t4)]">All transition certificates have been processed.</p>
            </CardContent></Card>
          ) : (
            certificates.map(cert => (
              <Card key={cert.id} className="glass-card" data-testid={`cert-${cert.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cert.status === 'pending' ? 'rgba(245,158,11,0.2)' : cert.status === 'approved' ? 'rgba(16,185,129,0.2)' : 'rgba(240,82,82,0.2)' }}>
                      <FileKey className="w-6 h-6" style={{ color: cert.status === 'pending' ? '#F59E0B' : cert.status === 'approved' ? '#22C993' : '#ef4444' }} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-[var(--t)]">{cert.estate_name || 'Unknown Estate'}</h3>
                      <p className="text-sm text-[var(--t4)]">Uploaded by: {cert.uploader_name || cert.uploaded_by}</p>
                      <p className="text-sm text-[var(--t4)]">File: {cert.file_name}</p>
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
                    {cert.status === 'pending' && (
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <Button size="sm" className="text-xs" style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)', color: 'white' }}
                          onClick={() => handleBeginReview(cert.id)} disabled={actionLoading === cert.id}>
                          {actionLoading === cert.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />} Begin Review
                        </Button>
                        <a href={`${API_URL}/transition/certificate/${cert.id}/document`} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-[var(--bl3)] hover:underline justify-center">
                          <Eye className="w-3 h-3" /> View Document
                        </a>
                      </div>
                    )}
                    {cert.status === 'reviewing' && (
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <Button size="sm" className="text-xs" style={{ background: 'linear-gradient(135deg, #22C993, #16a34a)', color: 'white' }}
                          onClick={() => handleApproveCert(cert.id)} disabled={actionLoading === cert.id}>
                          {actionLoading === cert.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />} Approve & Transition
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs border-[var(--rd)]/30 text-[var(--rd)]"
                          onClick={() => handleRejectCert(cert.id)} disabled={actionLoading === cert.id}>
                          <XCircle className="w-4 h-4 mr-1" /> Reject
                        </Button>
                        <a href={`${API_URL}/transition/certificate/${cert.id}/document`} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-[var(--bl3)] hover:underline justify-center">
                          <Eye className="w-3 h-3" /> View Document
                        </a>
                      </div>
                    )}
                  </div>

                  {/* What happens on approval */}
                  {cert.status === 'pending' && (
                    <div className="mt-4 rounded-xl p-3" style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.12)' }}>
                      <p className="text-xs text-[#7AABFD] leading-relaxed">
                        Click "Begin Review" to let the beneficiary know you are actively reviewing their submission. They will see this update in real time on their status page.
                      </p>
                    </div>
                  )}
                  {cert.status === 'reviewing' && (
                    <div className="mt-4 rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
                      <p className="text-xs text-[var(--yw)] leading-relaxed">
                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                        Upon approval: Benefactor account immutably sealed · All immediate messages delivered · Beneficiary access granted to vault, checklist, messages, and Estate Guardian. The beneficiary sees each step happen in real time.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ============ DTS MANAGEMENT TAB ============ */}
      {tab === 'dts' && !selectedDts && (
        <div className="space-y-4">
          <div className="rounded-xl p-4" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <h3 className="font-bold text-[var(--pr2)] mb-2">DTS Team Portal</h3>
            <p className="text-sm text-[var(--t3)] leading-relaxed">
              Review incoming Designated Trustee Service requests. Research feasibility and costs, then submit itemized quotes to benefactors.
            </p>
          </div>

          {dtsTasks.length === 0 ? (
            <Card className="glass-card"><CardContent className="p-12 text-center">
              <Shield className="w-12 h-12 mx-auto text-[var(--t5)] mb-4" />
              <h3 className="font-bold text-[var(--t)] mb-2">No DTS Requests</h3>
              <p className="text-sm text-[var(--t4)]">No pending trustee service requests.</p>
            </CardContent></Card>
          ) : (
            dtsTasks.map(task => {
              const TypeIcon = typeIcons[task.task_type] || Shield;
              return (
                <Card key={task.id} className="glass-card cursor-pointer hover:border-[var(--b2)]" onClick={() => { setSelectedDts(task); setQuoteItems([{ description: '', cost: '' }]); }} data-testid={`dts-admin-${task.id}`}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.08)' }}>
                      <TypeIcon className="w-5 h-5" style={{ color: confColors[task.confidential] || '#B794F6' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[var(--t)] text-sm truncate">{task.title}</div>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-md font-bold" style={{ background: 'var(--s)', color: statusColors[task.status] }}>{task.status}</span>
                        <span className="text-xs text-[var(--t5)]">{task.task_type?.replace(/_/g, ' ')}</span>
                        {task.line_items?.length > 0 && <span className="text-xs font-bold text-[var(--gold2)]">${task.line_items.reduce((s, i) => s + (i.approved !== false ? i.cost : 0), 0).toLocaleString()}</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[var(--t5)]" />
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ============ DTS TASK DETAIL ============ */}
      {tab === 'dts' && selectedDts && (
        <div className="space-y-4">
          <Button variant="outline" size="sm" className="border-[var(--b)] text-[var(--t3)]" onClick={() => setSelectedDts(null)}>
            ← All Tasks
          </Button>

          <Card className="glass-card"><CardContent className="p-5">
            <h2 className="text-lg font-bold text-[var(--t)] mb-2">{selectedDts.title}</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="text-xs px-2 py-1 rounded-md font-bold" style={{ background: 'var(--s)', color: statusColors[selectedDts.status] }}>{selectedDts.status}</span>
              <span className="text-xs px-2 py-1 rounded-md" style={{ background: confColors[selectedDts.confidential] + '20', color: confColors[selectedDts.confidential] }}>{selectedDts.confidential}</span>
              <span className="text-xs text-[var(--t5)]">{selectedDts.task_type?.replace(/_/g, ' ')}</span>
            </div>
            <p className="text-sm text-[var(--t2)] leading-relaxed whitespace-pre-wrap mb-4">{selectedDts.description}</p>
            <div className="text-xs text-[var(--t5)]">Created: {new Date(selectedDts.created_at).toLocaleString()}</div>
            {selectedDts.beneficiary && <div className="text-xs text-[var(--t4)] mt-1">Beneficiary: {selectedDts.beneficiary}</div>}
          </CardContent></Card>

          {/* Existing line items */}
          {selectedDts.line_items?.length > 0 && (
            <Card className="glass-card"><CardContent className="p-5">
              <h3 className="font-bold text-[var(--t)] mb-3">Quote Line Items</h3>
              {selectedDts.line_items.map((li, i) => (
                <div key={li.id || i} className="flex items-center gap-3 py-2" style={{ borderBottom: i < selectedDts.line_items.length - 1 ? '1px solid var(--b)' : 'none' }}>
                  <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${li.approved === true ? 'bg-[var(--gnbg)]' : li.approved === false ? 'bg-[var(--rdbg)]' : 'bg-[var(--s)]'}`}>
                    {li.approved === true ? <CheckCircle2 className="w-3 h-3 text-[var(--gn2)]" /> : li.approved === false ? <XCircle className="w-3 h-3 text-[var(--rd)]" /> : <Clock className="w-3 h-3 text-[var(--t5)]" />}
                  </div>
                  <span className="text-sm text-[var(--t)] flex-1">{li.description}</span>
                  <span className="text-sm font-bold text-[var(--gold2)]">${li.cost?.toLocaleString()}</span>
                </div>
              ))}
            </CardContent></Card>
          )}

          {/* Submit Quote (for submitted tasks) */}
          {selectedDts.status === 'submitted' && (
            <Card className="glass-card"><CardContent className="p-5">
              <h3 className="font-bold text-[var(--t)] mb-3">Create Quote</h3>
              <p className="text-sm text-[var(--t4)] mb-4">Research this request and provide an itemized quote with costs.</p>
              {quoteItems.map((item, i) => (
                <div key={i} className="flex gap-3 mb-3">
                  <Input className="input-field flex-1" placeholder="Line item description" value={item.description} onChange={e => { const n = [...quoteItems]; n[i].description = e.target.value; setQuoteItems(n); }} />
                  <Input className="input-field w-28" placeholder="Cost $" type="number" value={item.cost} onChange={e => { const n = [...quoteItems]; n[i].cost = e.target.value; setQuoteItems(n); }} />
                  {quoteItems.length > 1 && <Button variant="ghost" size="sm" className="text-[var(--rd)]" onClick={() => setQuoteItems(prev => prev.filter((_, j) => j !== i))}>×</Button>}
                </div>
              ))}
              <Button variant="outline" size="sm" className="border-[var(--b)] text-[var(--t3)] mb-4" onClick={() => setQuoteItems(prev => [...prev, { description: '', cost: '' }])}>+ Add Line Item</Button>
              <Button className="w-full gold-button" onClick={() => handleSubmitQuote(selectedDts.id)} disabled={actionLoading === selectedDts.id}>
                {actionLoading === selectedDts.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Submit Quote to Benefactor
              </Button>
            </CardContent></Card>
          )}

          {/* Status Actions */}
          <Card className="glass-card"><CardContent className="p-5">
            <h3 className="font-bold text-[var(--t)] mb-3">Update Status</h3>
            <div className="flex flex-wrap gap-2">
              {['submitted', 'quoted', 'approved', 'ready', 'executed', 'destroyed'].map(s => (
                <Button key={s} size="sm" variant={selectedDts.status === s ? 'default' : 'outline'}
                  className={`text-xs capitalize ${selectedDts.status === s ? 'gold-button' : 'border-[var(--b)] text-[var(--t3)]'}`}
                  onClick={() => handleUpdateDtsStatus(selectedDts.id, s)} disabled={selectedDts.status === s}>
                  {s}
                </Button>
              ))}
            </div>
          </CardContent></Card>
        </div>
      )}

      {/* ============ CUSTOMER SUPPORT TAB ============ */}
      {tab === 'support' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-20rem)]">
          {/* Conversations List */}
          <div className="glass-card overflow-hidden flex flex-col">
            <div className="p-4 border-b border-[var(--b)]">
              <h3 className="font-bold text-[var(--t)] flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-[var(--gn2)]" />
                Conversations
              </h3>
              <p className="text-xs text-[var(--t5)]">{conversations.length} active</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-6 text-center text-[var(--t5)]">
                  <Headphones className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No conversations yet</p>
                </div>
              ) : (
                conversations.map(conv => (
                  <div
                    key={conv.conversation_id}
                    onClick={() => setSelectedConv(conv)}
                    className={`p-4 border-b border-[var(--b)] cursor-pointer hover:bg-[var(--s)] transition-colors ${
                      selectedConv?.conversation_id === conv.conversation_id ? 'bg-[var(--s)]' : ''
                    }`}
                    data-testid={`conv-${conv.conversation_id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--t)] truncate">{conv.user_name || 'Unknown'}</span>
                          {conv.unread_count > 0 && (
                            <span className="bg-[var(--rd)] text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--t5)] truncate">{conv.user_email}</p>
                        <p className="text-sm text-[var(--t4)] truncate mt-1">
                          {conv.sender_role === 'admin' ? 'You: ' : ''}{conv.latest_message}
                        </p>
                      </div>
                      <span className="text-xs text-[var(--t5)] whitespace-nowrap">
                        {new Date(conv.latest_time).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div className="lg:col-span-2 glass-card overflow-hidden flex flex-col">
            {!selectedConv ? (
              <div className="flex-1 flex items-center justify-center text-center p-6">
                <div>
                  <Headphones className="w-16 h-16 mx-auto text-[var(--t5)] mb-4" />
                  <h3 className="text-lg font-bold text-[var(--t)] mb-2">Customer Support Team</h3>
                  <p className="text-sm text-[var(--t4)]">Select a conversation from the left to view and respond</p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-[var(--b)]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--s)] flex items-center justify-center">
                      <UserCircle className="w-6 h-6 text-[var(--bl3)]" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[var(--t)]">{selectedConv.user_name}</h3>
                      <p className="text-xs text-[var(--t5)]">{selectedConv.user_email} · {selectedConv.user_role}</p>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--bg2)]">
                  {convMessages.map((msg, idx) => {
                    const isSupport = msg.sender_role === 'admin';
                    return (
                      <div key={msg.id || idx} className={`flex ${isSupport ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          isSupport ? 'bg-[var(--gold)] text-[#1a1a2e]' : 'glass-card'
                        }`}>
                          {isSupport && (
                            <p className="text-xs font-bold mb-1 opacity-70">CarryOn Support</p>
                          )}
                          <p className={`text-sm ${isSupport ? 'text-[#1a1a2e]' : 'text-[var(--t)]'}`}>{msg.content}</p>
                          <p className={`text-xs mt-1 ${isSupport ? 'text-[#1a1a2e]/60' : 'text-[var(--t5)]'}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Message Input */}
                <div className="p-4 border-t border-[var(--b)]">
                  <div className="flex gap-2">
                    <Input
                      className="input-field flex-1"
                      placeholder="Type your response..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendSupportMessage()}
                      disabled={sendingMessage}
                      data-testid="admin-support-message-input"
                    />
                    <Button
                      onClick={sendSupportMessage}
                      className="gold-button px-4"
                      disabled={sendingMessage || !newMessage.trim()}
                      data-testid="admin-send-support-message"
                    >
                      {sendingMessage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============ SUBSCRIPTIONS TAB ============ */}
      {tab === 'subscriptions' && (
        <SubscriptionsAdmin getAuthHeaders={getAuthHeaders} users={users} />
      )}

      {/* ============ VERIFICATIONS TAB ============ */}
      {tab === 'verifications' && (
        <VerificationsAdmin getAuthHeaders={getAuthHeaders} />
      )}

      {/* ============ ACTIVITY LOG TAB ============ */}
      {tab === 'activity' && (
        <div className="space-y-4" data-testid="admin-activity-log">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--t4)]">Recent platform activity</p>
            <Button variant="outline" size="sm" onClick={fetchActivityLog} disabled={activityLoading}
              className="text-xs border-[var(--b)] text-[var(--t4)]" data-testid="admin-refresh-activity">
              {activityLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Activity className="w-3 h-3 mr-1" />}
              Refresh
            </Button>
          </div>
          {activityLoading && activityLog.length === 0 ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 bg-[var(--s)]" />)}</div>
          ) : activityLog.length === 0 ? (
            <Card className="glass-card"><CardContent className="p-12 text-center">
              <Activity className="w-12 h-12 mx-auto text-[var(--t5)] mb-4" />
              <h3 className="font-bold text-[var(--t)] mb-2">No Activity Yet</h3>
              <p className="text-sm text-[var(--t4)]">Platform activity will appear here.</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-1">
              {activityLog.map((a, i) => {
                const iconMap = {
                  'user-plus': UserPlus, 'folder-lock': FolderLock, 'file-up': FileUp, 'shield': Shield
                };
                const colorMap = {
                  user_registered: '#60A5FA', estate_created: '#22C993', document_uploaded: '#B794F6',
                  role_change: '#F59E0B', admin_action: '#F59E0B',
                };
                const Icon = iconMap[a.icon] || Activity;
                const color = colorMap[a.type] || '#7B879E';
                const timeStr = a.timestamp ? new Date(a.timestamp).toLocaleString() : '';
                return (
                  <div key={i} className="glass-card p-3 flex items-center gap-3" data-testid={`activity-item-${i}`}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}15` }}>
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--t)] truncate">{a.description}</p>
                      <p className="text-[10px] text-[var(--t5)]">{timeStr}</p>
                    </div>
                    {a.status && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-bold capitalize"
                        style={{ background: 'rgba(34,201,147,0.1)', color: '#22C993' }}>{a.status}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============ DEV SWITCHER TAB ============ */}
      {tab === 'dev-switcher' && (
        <DevSwitcherConfig users={users} getAuthHeaders={getAuthHeaders} />
      )}
    </div>
  );
};

// Dev Switcher Configuration Component
const DevSwitcherConfig = ({ users, getAuthHeaders }) => {
  const [config, setConfig] = useState({
    benefactor_email: '',
    benefactor_password: '',
    beneficiary_email: '',
    beneficiary_password: '',
    enabled: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchConfig = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/dev-switcher`, getAuthHeaders());
      setConfig(prev => ({
        ...prev,
        benefactor_email: res.data.benefactor_email || '',
        beneficiary_email: res.data.beneficiary_email || '',
        enabled: res.data.enabled
      }));
    } catch (err) {
      console.error('Failed to fetch config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/admin/dev-switcher`, config, getAuthHeaders());
      toast.success('Dev switcher config saved! The dev panel will now use these accounts.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const benefactors = users.filter(u => u.role === 'benefactor');
  const beneficiaries = users.filter(u => u.role === 'beneficiary');
  
  // Check if the saved email exists in the user list, or show it anyway
  const savedBenefactorExists = !config.benefactor_email || benefactors.some(u => u.email === config.benefactor_email);
  const savedBeneficiaryExists = !config.beneficiary_email || beneficiaries.some(u => u.email === config.beneficiary_email);

  if (loading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Settings className="w-6 h-6 text-[var(--gold)]" />
        <div>
          <h2 className="text-xl font-bold text-[var(--t)]">Dev Switcher Configuration</h2>
          <p className="text-sm text-[var(--t5)]">Configure which accounts appear in the DEV portal switcher</p>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="p-6 space-y-6">
          {/* Benefactor Selection */}
          <div className="space-y-3">
            <Label className="text-[var(--t3)] font-semibold flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              Benefactor Account
            </Label>
            {benefactors.length === 0 ? (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-400">
                No benefactor accounts found. Create a benefactor account first via /signup.
                {config.benefactor_email && (
                  <div className="mt-2 text-xs text-[var(--t5)]">
                    Previously configured: {config.benefactor_email}
                  </div>
                )}
              </div>
            ) : (
              <select
                value={config.benefactor_email}
                onChange={(e) => setConfig(prev => ({ ...prev, benefactor_email: e.target.value, benefactor_password: '' }))}
                className="w-full p-3 rounded-lg bg-[var(--s)] border border-[var(--b)] text-[var(--t)] text-sm"
              >
                <option value="">Select a benefactor...</option>
                {benefactors.map(u => (
                  <option key={u.id} value={u.email}>{u.name} ({u.email})</option>
                ))}
              </select>
            )}
            {config.benefactor_email && benefactors.length > 0 && (
              <div className="space-y-2">
                <Label className="text-[var(--t5)] text-sm">Password for {config.benefactor_email}</Label>
                <Input
                  type="password"
                  value={config.benefactor_password}
                  onChange={(e) => setConfig(prev => ({ ...prev, benefactor_password: e.target.value }))}
                  placeholder="Enter password for quick switch"
                  className="input-field"
                />
              </div>
            )}
          </div>

          {/* Beneficiary Selection */}
          <div className="space-y-3">
            <Label className="text-[var(--t3)] font-semibold flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              Beneficiary Account
            </Label>
            {beneficiaries.length === 0 ? (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-400">
                No beneficiary accounts found. Invite a beneficiary from the Beneficiaries page.
                {config.beneficiary_email && (
                  <div className="mt-2 text-xs text-[var(--t5)]">
                    Previously configured: {config.beneficiary_email}
                  </div>
                )}
              </div>
            ) : (
              <>
                <select
                  value={config.beneficiary_email}
                  onChange={(e) => setConfig(prev => ({ ...prev, beneficiary_email: e.target.value, beneficiary_password: '' }))}
                  className="w-full p-3 rounded-lg bg-[var(--s)] border border-[var(--b)] text-[var(--t)] text-sm"
                >
                  <option value="">Select a beneficiary...</option>
                  {beneficiaries.map(u => (
                    <option key={u.id} value={u.email}>{u.name} ({u.email})</option>
                  ))}
                </select>
                {config.beneficiary_email && (
                  <div className="space-y-2">
                    <Label className="text-[var(--t5)] text-sm">Password for {config.beneficiary_email}</Label>
                    <Input
                      type="password"
                      value={config.beneficiary_password}
                      onChange={(e) => setConfig(prev => ({ ...prev, beneficiary_password: e.target.value }))}
                      placeholder="Enter password for quick switch"
                      className="input-field"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--s)]">
            <div>
              <p className="font-semibold text-[var(--t)]">Enable Dev Switcher</p>
              <p className="text-sm text-[var(--t5)]">Show the DEV button for quick portal switching</p>
            </div>
            <button
              onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={`w-12 h-6 rounded-full transition-colors relative ${config.enabled ? 'bg-[var(--gold)]' : 'bg-[var(--s2)]'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${config.enabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {/* Info Box */}
          <div className="p-4 rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/5">
            <p className="text-sm text-[var(--t3)]">
              <strong className="text-[var(--gold)]">Note:</strong> The passwords you enter here are stored securely and used only for the dev switcher to bypass OTP during testing. 
              The Admin account is always available in the switcher by default.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="gold-button w-full">
            {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Settings className="w-5 h-5 mr-2" />}
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      {/* No Accounts Warning */}
      {benefactors.length === 0 && beneficiaries.length === 0 && (
        <Card className="glass-card border-yellow-500/30">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
            <h3 className="font-bold text-[var(--t)] mb-2">No Accounts Available</h3>
            <p className="text-sm text-[var(--t5)]">
              Register some benefactor and beneficiary accounts first, then return here to configure the dev switcher.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ===================== SUBSCRIPTIONS ADMIN =====================

const SubscriptionsAdmin = ({ getAuthHeaders, users }) => {
  const [settings, setSettings] = useState(null);
  const [userSubs, setUserSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState(null);
  const [newPrice, setNewPrice] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [discountInput, setDiscountInput] = useState('');

  const headers = getAuthHeaders()?.headers || {};

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const [settingsRes, usersRes] = await Promise.all([
        axios.get(`${API_URL}/admin/subscription-settings`, { headers }),
        axios.get(`${API_URL}/admin/user-subscriptions`, { headers }),
      ]);
      setSettings(settingsRes.data);
      setUserSubs(usersRes.data);
    } catch (err) { toast.error('Failed to load subscription data'); }
    setLoading(false);
  };

  const toggleBeta = async () => {
    try {
      await axios.put(`${API_URL}/admin/subscription-settings`, { beta_mode: !settings.beta_mode }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      toast.success(settings.beta_mode ? 'Beta mode OFF - subscriptions required' : 'Beta mode ON - all features free');
      fetchData();
    } catch (err) { toast.error('Failed to update'); }
  };

  const updatePrice = async (planId) => {
    try {
      const formData = new FormData();
      formData.append('price', parseFloat(newPrice));
      await axios.put(`${API_URL}/admin/plans/${planId}/price`, formData, { headers });
      toast.success('Price updated');
      setEditingPrice(null);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update price'); }
  };

  const updateUserOverride = async (userId, data) => {
    try {
      await axios.put(`${API_URL}/admin/user-subscription/${userId}`, data, { headers: { ...headers, 'Content-Type': 'application/json' } });
      toast.success('User override updated');
      fetchData();
    } catch (err) { toast.error('Failed to update'); }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>;

  return (
    <div className="space-y-6" data-testid="subscriptions-admin">
      {/* Beta Mode Toggle */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2">
                <ToggleLeft className="w-5 h-5 text-[var(--gold)]" />
                Beta Mode
              </h3>
              <p className="text-sm text-[var(--t4)] mt-1">
                {settings?.beta_mode ? 'All features are FREE for all users. Turn off to require subscriptions.' : 'Subscriptions are ACTIVE. Users must pay to access the platform.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-bold ${settings?.beta_mode ? 'text-[var(--gn2)]' : 'text-[var(--rd2)]'}`}>
                {settings?.beta_mode ? 'ON (Free)' : 'OFF (Paid)'}
              </span>
              <Switch checked={settings?.beta_mode || false} onCheckedChange={toggleBeta} data-testid="beta-mode-toggle" />
            </div>
          </div>
          {/* Stats */}
          <div className="flex gap-3 mt-4 text-sm flex-wrap">
            <div className="px-3 py-1.5 rounded-lg bg-[var(--s)]">
              <span className="text-[var(--t4)]">Active Subs: </span>
              <span className="font-bold text-[var(--t)]">{settings?.stats?.active_subscriptions || 0}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-[var(--s)]">
              <span className="text-[var(--t4)]">Free Access: </span>
              <span className="font-bold text-[var(--t)]">{settings?.stats?.free_access_users || 0}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-[var(--s)]">
              <span className="text-[var(--t4)]">Discounted: </span>
              <span className="font-bold text-[var(--t)]">{settings?.stats?.discounted_users || 0}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Family Plan Toggle */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2">
                <Users className="w-5 h-5 text-[var(--gold)]" />
                Family Plan
              </h3>
              <p className="text-sm text-[var(--t4)] mt-1">
                {settings?.family_plan_enabled
                  ? 'Family plans are visible to users. FPOs get $1/mo discount for added benefactors, flat $3.49/mo for beneficiaries.'
                  : 'Family plans are hidden from all users. Toggle ON when ready to launch (recommended L+3 to L+4 months).'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-bold ${settings?.family_plan_enabled ? 'text-[var(--gn2)]' : 'text-[var(--t5)]'}`}>
                {settings?.family_plan_enabled ? 'Visible' : 'Hidden'}
              </span>
              <Switch
                checked={settings?.family_plan_enabled || false}
                onCheckedChange={async () => {
                  try {
                    await axios.put(`${API_URL}/admin/family-plan-settings`, {}, { headers });
                    toast.success(settings?.family_plan_enabled ? 'Family plans hidden' : 'Family plans visible to users');
                    fetchData();
                  } catch (err) { toast.error('Failed to update'); }
                }}
                data-testid="family-plan-toggle"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Management */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-[var(--gold)]" />
            Plan Pricing
          </h3>
          <div className="space-y-2">
            {(settings?.plans || []).map(plan => (
              <div key={plan.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--s)]" data-testid={`plan-row-${plan.id}`}>
                <div>
                  <span className="font-bold text-[var(--t)]">{plan.name}</span>
                  {plan.note && <span className="text-xs text-[var(--t5)] ml-2">({plan.note})</span>}
                </div>
                <div className="flex items-center gap-3">
                  {editingPrice === plan.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--t4)]">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={newPrice}
                        onChange={e => setNewPrice(e.target.value)}
                        className="input-field w-20 text-sm"
                        autoFocus
                      />
                      <Button size="sm" className="gold-button text-xs" onClick={() => updatePrice(plan.id)}>Save</Button>
                      <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => setEditingPrice(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-[var(--gold)] font-bold text-lg">${plan.price?.toFixed(2)}</span>
                      <span className="text-xs text-[var(--t5)]">/mo</span>
                      {plan.adjustable !== false && (
                        <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--t4)]" onClick={() => { setEditingPrice(plan.id); setNewPrice(plan.price?.toString() || ''); }}>
                          Edit
                        </Button>
                      )}
                      {plan.adjustable === false && <span className="text-[10px] text-[var(--t5)]">Fixed</span>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Per-User Overrides */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <h3 className="text-lg font-bold text-[var(--t)] flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-[var(--gold)]" />
            User Subscription Overrides
          </h3>
          <div className="space-y-2">
            {userSubs.filter(u => u.role !== 'admin').map(u => {
              const override = u.override || {};
              const sub = u.subscription;
              return (
                <div key={u.id} className="p-3 rounded-xl bg-[var(--s)]" data-testid={`user-sub-${u.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[var(--t)] text-sm">{u.name || u.email}</span>
                      <span className="text-xs text-[var(--t5)] ml-2">{u.email}</span>
                      <span className="text-xs ml-2 px-1.5 py-0.5 rounded bg-[var(--b)] text-[var(--t4)]">{u.role}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {sub && <span className="text-xs text-[var(--gn2)]">{sub.plan_name}</span>}
                      {override.free_access && <span className="text-xs bg-[var(--gn2)]/10 text-[var(--gn2)] px-2 py-0.5 rounded-full font-bold">Free</span>}
                      {override.custom_discount > 0 && <span className="text-xs bg-[var(--yw)]/10 text-[var(--yw)] px-2 py-0.5 rounded-full font-bold">{override.custom_discount}% off</span>}
                    </div>
                  </div>
                  {editingUser === u.id ? (
                    <div className="mt-3 flex items-center gap-3 pt-3 flex-wrap" style={{ borderTop: '1px solid var(--b)' }}>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-[var(--t4)]">Free Access</Label>
                        <Switch
                          checked={override.free_access || false}
                          onCheckedChange={(v) => updateUserOverride(u.id, { free_access: v })}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-[var(--t4)]">Discount %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={discountInput || override.custom_discount || ''}
                          onChange={e => setDiscountInput(e.target.value)}
                          className="input-field w-16 text-sm"
                        />
                        <Button size="sm" className="text-xs gold-button" onClick={() => { updateUserOverride(u.id, { custom_discount: parseFloat(discountInput || '0') }); setEditingUser(null); }}>
                          Apply
                        </Button>
                      </div>
                      <Button size="sm" variant="outline" className="text-xs border-[var(--b)]" onClick={() => setEditingUser(null)}>Done</Button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingUser(u.id); setDiscountInput(override.custom_discount?.toString() || ''); }} className="text-xs text-[var(--bl3)] mt-1 font-bold">
                      Manage
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const VerificationsAdmin = ({ getAuthHeaders }) => {
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState('');
  const [viewingDoc, setViewingDoc] = useState(null);

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

  return (
    <div className="space-y-4" data-testid="verifications-admin">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-[var(--t)]">Tier Verification Requests</h3>
        <Button variant="outline" size="sm" onClick={fetchVerifications} className="text-xs border-[var(--b)] text-[var(--t4)]" data-testid="refresh-verifications">
          <Activity className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {verifications.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-12 text-center">
          <FileKey className="w-12 h-12 mx-auto text-[var(--t5)] mb-4" />
          <h3 className="font-bold text-[var(--t)] mb-2">No Verification Requests</h3>
          <p className="text-sm text-[var(--t4)]">Pending Military/First Responder and Hospice verification requests will appear here.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {verifications.map(v => (
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

export default AdminPage;