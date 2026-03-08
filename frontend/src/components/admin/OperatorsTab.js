import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, Trash2, Loader2, Plus, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const OperatorsTab = ({ getAuthHeaders }) => {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showFormPassword, setShowFormPassword] = useState(false);

  const fetchOperators = async () => {
    try {
      const res = await axios.get(`${API_URL}/founder/operators`, getAuthHeaders());
      setOperators(res.data);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchOperators(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!form.email || !form.password || !form.name) { toast.error('All fields required'); return; }
    setCreating(true);
    try {
      await axios.post(`${API_URL}/founder/operators`, form, getAuthHeaders());
      toast.success('Operator account created');
      setShowCreate(false);
      setForm({ email: '', password: '', name: '' });
      fetchOperators();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setCreating(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !deletePassword) return;
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/founder/operators/${deleteTarget.id}?admin_password=${encodeURIComponent(deletePassword)}`, getAuthHeaders());
      toast.success('Operator deleted');
      setDeleteTarget(null);
      setDeletePassword('');
      fetchOperators();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setDeleting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--t)] uppercase tracking-wider">Operations Team</h3>
        <Button size="sm" className="text-xs" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
          onClick={() => setShowCreate(true)}>
          <Plus className="w-3 h-3 mr-1" /> Add Operator
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>
      ) : operators.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-6 text-center text-[var(--t4)] text-sm">No operators yet. Create one to delegate operations tasks.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {operators.map(op => (
            <Card key={op.id} className="glass-card">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--gold)]/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-[var(--gold)]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--t)]">{op.name}</p>
                    <p className="text-xs text-[var(--t5)]">{op.email}</p>
                    <p className="text-[10px] text-[var(--t5)]">Created: {new Date(op.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="text-xs border-[var(--rd)]/30 text-[var(--rd)]"
                  onClick={() => setDeleteTarget(op)}>
                  <Trash2 className="w-3 h-3 mr-1" /> Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Operator Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="glass-card max-w-md">
          <DialogHeader><DialogTitle className="text-[var(--t)]">Create Operator Account</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input placeholder="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" />
            <Input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" />
            <div className="relative">
              <Input placeholder="Password" type={showFormPassword ? 'text' : 'password'} value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="bg-[var(--s)] border-[var(--b)] text-[var(--t)] pr-10" />
              <button type="button" onClick={() => setShowFormPassword(!showFormPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                {showFormPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button className="w-full" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
              disabled={creating} onClick={handleCreate}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Create Operator
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeletePassword(''); } }}>
        <DialogContent className="glass-card border-[var(--rd)]/30 max-w-md">
          <DialogHeader><DialogTitle className="text-[var(--t)]">Remove Operator</DialogTitle></DialogHeader>
          <p className="text-sm text-[var(--t4)]">Remove <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email})? Enter your password to confirm.</p>
          <div className="relative mt-2">
            <Input type={showDeletePassword ? 'text' : 'password'} value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)} placeholder="Your password"
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)] pr-10" />
            <button type="button" onClick={() => setShowDeletePassword(!showDeletePassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
              {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex gap-3 mt-3">
            <Button variant="outline" className="flex-1 border-[var(--b)] text-[var(--t)]" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="flex-1 bg-[var(--rd)] hover:bg-[var(--rd)]/90 text-white" disabled={!deletePassword || deleting} onClick={handleDelete}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />} Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
