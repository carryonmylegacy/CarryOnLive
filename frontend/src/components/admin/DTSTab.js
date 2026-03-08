import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Shield, Clock, CheckCircle2, XCircle, Loader2, Package, Lock,
  DollarSign, Mail, Flame, ChevronRight, Search, Trash2, AlertTriangle, Eye, EyeOff, RotateCcw, UserPlus
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const typeIcons = { delivery: Package, account_closure: Lock, financial: DollarSign, communication: Mail, destruction: Flame };
const confColors = { full: '#F98080', partial: '#FFCB57', timed: '#7AABFD' };
const statusColors = { submitted: 'var(--bl3)', quoted: 'var(--yw)', approved: 'var(--gn2)', ready: 'var(--gn2)', executed: '#B794F6', destroyed: 'var(--t5)' };

export const DTSTab = ({ getAuthHeaders }) => {
  const { user } = useAuth();
  const isFounder = user?.role === 'admin' && !window.location.pathname.startsWith('/ops');
  const [dtsTasks, setDtsTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDts, setSelectedDts] = useState(null);
  const [quoteItems, setQuoteItems] = useState([{ description: '', cost: '' }]);
  const [actionLoading, setActionLoading] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePw, setShowDeletePw] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [operators, setOperators] = useState([]);
  const [assigning, setAssigning] = useState(null);

  useEffect(() => {
    fetchTasks();
    // Fetch operators for assignment
    const fetchOps = async () => {
      try {
        const res = await axios.get(`${API_URL}/founder/operators`, getAuthHeaders());
        setOperators(res.data || []);
      } catch {}
    };
    fetchOps();
  }, [showDeleted]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTasks = async () => {
    try {
      const url = isFounder && showDeleted
        ? `${API_URL}/dts/tasks/all?include_deleted=true`
        : `${API_URL}/dts/tasks/all`;
      const res = await axios.get(url, getAuthHeaders());
      setDtsTasks(res.data || []);
    } catch (err) {
      console.error('Failed to fetch DTS tasks:', err);
      setDtsTasks([]);
    } finally {
      setLoading(false);
    }
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
      // toast removed
      setSelectedDts(null);
      setQuoteItems([{ description: '', cost: '' }]);
      fetchTasks();
    } catch (err) { toast.error('Failed to submit quote'); }
    finally { setActionLoading(null); }
  };

  const handleUpdateDtsStatus = async (taskId, status) => {
    setActionLoading(taskId);
    try {
      await axios.post(`${API_URL}/dts/tasks/${taskId}/status?task_status=${status}`, {}, getAuthHeaders());
      fetchTasks();
    } catch (err) { toast.error('Failed'); }
    finally { setActionLoading(null); }
  };

  const handleAssignTask = async (taskId, operatorId) => {
    setAssigning(taskId);
    try {
      const res = await axios.post(`${API_URL}/dts/tasks/${taskId}/assign`, { operator_id: operatorId }, getAuthHeaders());
      toast.success(res.data.message || 'Task assigned');
      fetchTasks();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to assign'); }
    finally { setAssigning(null); }
  };

  const handleDeleteDts = async () => {
    if (!deleteTarget || !deletePassword.trim()) return;
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/dts/tasks/${deleteTarget.id}?admin_password=${encodeURIComponent(deletePassword)}`, getAuthHeaders());
      setDtsTasks(prev => prev.filter(t => t.id !== deleteTarget.id));
      toast.success(`DTS request "${deleteTarget.title}" deleted`);
      setDeleteTarget(null);
      setDeletePassword('');
      setSelectedDts(null);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to delete';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  // Delete Confirmation Modal (shared with detail view and list view)
  const renderDeleteModal = () => {
    if (!deleteTarget) return null;
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
        <div className="w-full max-w-sm rounded-2xl p-6 space-y-4 animate-fade-in"
          style={{
            background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(15,22,41,0.98) 40%)',
            border: '1.5px solid rgba(212,175,55,0.3)',
            boxShadow: '0 0 40px rgba(212,175,55,0.08)',
          }}
          data-testid="dts-delete-confirm-modal">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>Delete DTS Request</h3>
              <p className="text-[var(--t5)] text-[10px]">This action is irreversible</p>
            </div>
          </div>

          <div className="p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
            <p className="text-sm text-[var(--t3)]">
              Permanently delete <strong className="text-white">{deleteTarget.title}</strong>?
            </p>
            <p className="text-[10px] text-red-400/80 mt-1">
              This will remove the DTS request, all quote line items, and related activity logs.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[var(--t4)] text-xs font-medium">Enter your admin password to confirm <span className="text-red-400">*</span></label>
            <div className="relative">
              <Input
                type={showDeletePw ? 'text' : 'password'}
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && deletePassword.trim() && handleDeleteDts()}
                placeholder="Admin password"
                className="h-11 bg-[#0b1322] border-[#1a2a42] text-white placeholder:text-[#2d3d55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-xl pr-10"
                autoFocus
                data-testid="dts-delete-confirm-password"
              />
              <button type="button" onClick={() => setShowDeletePw(!showDeletePw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a4a63]">
                {showDeletePw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1 text-[var(--t4)]"
              onClick={() => { setDeleteTarget(null); setDeletePassword(''); }}
              disabled={deleting}
              data-testid="dts-delete-cancel-btn">
              Cancel
            </Button>
            <Button className="flex-1 font-bold"
              style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white' }}
              onClick={handleDeleteDts}
              disabled={deleting || !deletePassword.trim()}
              data-testid="dts-delete-confirm-btn">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete Permanently
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>;

  // DTS Task Detail View
  if (selectedDts) {
    return (
      <div className="space-y-4" data-testid="admin-dts-detail">
        <Button variant="outline" size="sm" className="border-[var(--b)] text-[var(--t3)]" onClick={() => setSelectedDts(null)} data-testid="dts-back-button">
          &larr; All Tasks
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
                {quoteItems.length > 1 && <Button variant="ghost" size="sm" className="text-[var(--rd)]" onClick={() => setQuoteItems(prev => prev.filter((_, j) => j !== i))}>x</Button>}
              </div>
            ))}
            <Button variant="outline" size="sm" className="border-[var(--b)] text-[var(--t3)] mb-4" onClick={() => setQuoteItems(prev => [...prev, { description: '', cost: '' }])}>+ Add Line Item</Button>
            <Button className="w-full gold-button" onClick={() => handleSubmitQuote(selectedDts.id)} disabled={actionLoading === selectedDts.id} data-testid="dts-submit-quote">
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
                onClick={() => handleUpdateDtsStatus(selectedDts.id, s)} disabled={selectedDts.status === s}
                data-testid={`dts-status-${s}`}>
                {s}
              </Button>
            ))}
          </div>
        </CardContent></Card>

        {/* Task Assignment */}
        {(user?.role === 'admin' || user?.operator_role === 'manager') && operators.length > 0 && (
          <Card className="glass-card"><CardContent className="p-5">
            <h3 className="font-bold text-[var(--t)] mb-1">Assign Operator</h3>
            <p className="text-xs text-[var(--t5)] mb-3">Assign this task to a team member for execution.</p>
            {selectedDts.assigned_to && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#22C993]" />
                <span className="text-[var(--t3)]">
                  Currently assigned to: <strong className="text-[var(--t)]">
                    {operators.find(o => o.id === selectedDts.assigned_to)?.name || selectedDts.assigned_to}
                  </strong>
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <Select
                value={selectedDts.assigned_to || ""}
                onValueChange={(v) => handleAssignTask(selectedDts.id, v)}
                disabled={assigning === selectedDts.id}
              >
                <SelectTrigger className="bg-[var(--s)] border-[var(--b)] text-[var(--t)] flex-1" data-testid="dts-assign-select">
                  <SelectValue placeholder="Select operator..." />
                </SelectTrigger>
                <SelectContent>
                  {operators.map(op => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.name} {op.operator_role === 'manager' ? '(Manager)' : ''} {op.title ? `· ${op.title}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent></Card>
        )}

        {/* Delete Request */}
        <Card className="glass-card"><CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-[var(--rd)] mb-1">Danger Zone</h3>
              <p className="text-xs text-[var(--t5)]">Permanently delete this DTS request and all associated data.</p>
            </div>
            <Button size="sm" variant="outline"
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => { setDeleteTarget({ id: selectedDts.id, title: selectedDts.title }); setDeletePassword(''); setShowDeletePw(false); }}
              data-testid="dts-delete-btn">
              <Trash2 className="w-4 h-4 mr-2" /> Delete Request
            </Button>
          </div>
        </CardContent></Card>
        {renderDeleteModal()}
      </div>
    );
  }

  // DTS List View
  const filteredTasks = dtsTasks.filter(task => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (task.title || '').toLowerCase().includes(q) ||
      (task.description || '').toLowerCase().includes(q) ||
      (task.task_type || '').replace(/_/g, ' ').toLowerCase().includes(q) ||
      (task.status || '').toLowerCase().includes(q) ||
      (task.beneficiary || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4" data-testid="admin-dts-tab">
      <div className="rounded-xl p-4" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[var(--pr2)] mb-2">DTS Team Portal</h3>
            <p className="text-sm text-[var(--t3)] leading-relaxed">
              Review incoming DTS requests. Research feasibility and costs, then submit itemized quotes to benefactors.
            </p>
          </div>
          {isFounder && (
            <button
              onClick={() => setShowDeleted(!showDeleted)}
              className="text-[10px] font-bold px-2 py-1 rounded flex-shrink-0"
              style={{
                background: showDeleted ? 'rgba(239,68,68,0.1)' : 'var(--s)',
                color: showDeleted ? '#ef4444' : 'var(--t5)',
                border: `1px solid ${showDeleted ? 'rgba(239,68,68,0.2)' : 'var(--b)'}`
              }}
              data-testid="dts-show-deleted-toggle"
            >
              {showDeleted ? 'Showing Deleted' : 'Show Deleted'}
            </button>
          )}
        </div>
      </div>

      {dtsTasks.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
          <Search className="w-4 h-4 text-[var(--t5)]" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by title, type, status, beneficiary..." className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]" data-testid="dts-search" />
        </div>
      )}

      {filteredTasks.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-12 text-center">
          <Shield className="w-12 h-12 mx-auto text-[var(--t5)] mb-4" />
          <h3 className="font-bold text-[var(--t)] mb-2">No DTS Requests</h3>
          <p className="text-sm text-[var(--t4)]">No pending trustee service requests.</p>
        </CardContent></Card>
      ) : (
        filteredTasks.map(task => {
          const TypeIcon = typeIcons[task.task_type] || Shield;
          const isDeleted = task.soft_deleted;
          return (
            <Card key={task.id} className={`glass-card ${isDeleted ? 'opacity-50' : 'cursor-pointer hover:border-[var(--b2)]'}`}
              style={isDeleted ? { background: 'rgba(239,68,68,0.04)' } : {}}
              onClick={() => { if (!isDeleted) { setSelectedDts(task); setQuoteItems([{ description: '', cost: '' }]); } }}
              data-testid={`dts-admin-${task.id}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.08)' }}>
                  <TypeIcon className="w-5 h-5" style={{ color: confColors[task.confidential] || '#B794F6' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-bold text-[var(--t)] text-sm truncate">{task.title}</div>
                    {isDeleted && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--rdbg)] text-[var(--rd)] font-bold flex-shrink-0">DELETED</span>}
                  </div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-md font-bold" style={{ background: 'var(--s)', color: statusColors[task.status] }}>{task.status}</span>
                    <span className="text-xs text-[var(--t5)]">{task.task_type?.replace(/_/g, ' ')}</span>
                    {task.assigned_to && (
                      <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: 'rgba(34,197,94,0.08)', color: '#22C993' }}>
                        {operators.find(o => o.id === task.assigned_to)?.name || 'Assigned'}
                      </span>
                    )}
                    {task.line_items?.length > 0 && <span className="text-xs font-bold text-[var(--gold2)]">${task.line_items.reduce((s, i) => s + (i.approved !== false ? i.cost : 0), 0).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isDeleted && isFounder ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        axios.post(`${API_URL}/dts/tasks/${task.id}/restore`, {}, getAuthHeaders())
                          .then(() => { toast.success('DTS task restored'); fetchTasks(); })
                          .catch(() => toast.error('Failed to restore'));
                      }}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-[var(--gn2)] hover:bg-[var(--gnbg)] transition-colors"
                      data-testid={`restore-dts-${task.id}`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restore
                    </button>
                  ) : !isDeleted ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: task.id, title: task.title });
                        setDeletePassword('');
                        setShowDeletePw(false);
                      }}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-[var(--rd)] hover:bg-[var(--rdbg)] transition-colors"
                      data-testid={`delete-dts-${task.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                  {!isDeleted && <ChevronRight className="w-5 h-5 text-[var(--t5)]" />}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
      {renderDeleteModal()}
    </div>
  );
};
