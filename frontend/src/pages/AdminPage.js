import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, Users, FileKey, Clock, CheckCircle2, XCircle, Trash2, Loader2,
  FolderLock, Search, UserCircle, Eye, Package, Lock, DollarSign, Mail, Flame,
  ChevronRight, AlertTriangle
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Skeleton } from '../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const typeIcons = { delivery: Package, account_closure: Lock, financial: DollarSign, communication: Mail, destruction: Flame };
const confColors = { full: '#F98080', partial: '#FFCB57', timed: '#7AABFD' };
const statusColors = { submitted: 'var(--bl3)', quoted: 'var(--yw)', approved: 'var(--gn2)', ready: 'var(--gn2)', executed: '#B794F6', destroyed: 'var(--t5)' };

const AdminPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pathTab = location.pathname === '/admin/transition' ? 'transition' : location.pathname === '/admin/dts' ? 'dts' : 'users';
  const [tab, setTab] = useState(pathTab);
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

  useEffect(() => { fetchAll(); }, []);

  // Sync tab with URL when sidebar nav is clicked
  useEffect(() => {
    const newTab = location.pathname === '/admin/transition' ? 'transition' : location.pathname === '/admin/dts' ? 'dts' : 'users';
    setTab(newTab);
  }, [location.pathname]);

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
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="admin-dashboard">
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { v: stats.users.total, l: 'Users', icon: Users, color: '#60A5FA' },
            { v: stats.users.benefactors, l: 'Benefactors', icon: UserCircle, color: '#60A5FA' },
            { v: stats.users.beneficiaries, l: 'Beneficiaries', icon: UserCircle, color: '#B794F6' },
            { v: stats.estates.total, l: 'Estates', icon: FolderLock, color: '#22C993' },
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
          { key: 'users', label: 'All Users', icon: Users },
          { key: 'transition', label: 'Transition Verification', icon: FileKey },
          { key: 'dts', label: 'DTS Management', icon: Shield },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
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
                  <span className="text-xs px-2 py-0.5 rounded-md font-bold capitalize" style={{ background: rc.bg, color: rc.color }}>{u.role}</span>
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
    </div>
  );
};

export default AdminPage;
