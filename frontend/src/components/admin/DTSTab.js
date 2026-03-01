import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Shield, Clock, CheckCircle2, XCircle, Loader2, Package, Lock,
  DollarSign, Mail, Flame, ChevronRight, Search
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const typeIcons = { delivery: Package, account_closure: Lock, financial: DollarSign, communication: Mail, destruction: Flame };
const confColors = { full: '#F98080', partial: '#FFCB57', timed: '#7AABFD' };
const statusColors = { submitted: 'var(--bl3)', quoted: 'var(--yw)', approved: 'var(--gn2)', ready: 'var(--gn2)', executed: '#B794F6', destroyed: 'var(--t5)' };

export const DTSTab = ({ getAuthHeaders }) => {
  const [dtsTasks, setDtsTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDts, setSelectedDts] = useState(null);
  const [quoteItems, setQuoteItems] = useState([{ description: '', cost: '' }]);
  const [actionLoading, setActionLoading] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchTasks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTasks = async () => {
    try {
      const res = await axios.get(`${API_URL}/dts/tasks/all`, getAuthHeaders());
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
      await axios.post(`${API_URL}/dts/tasks/${taskId}/status?status=${status}`, {}, getAuthHeaders());
      // toast removed
      fetchTasks();
    } catch (err) { toast.error('Failed'); }
    finally { setActionLoading(null); }
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
        <h3 className="font-bold text-[var(--pr2)] mb-2">DTS Team Portal</h3>
        <p className="text-sm text-[var(--t3)] leading-relaxed">
          Review incoming DTS requests. Research feasibility and costs, then submit itemized quotes to benefactors.
        </p>
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
  );
};
