import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  Users, Trash2, Loader2, Plus, Eye, EyeOff, Phone, Mail, Briefcase,
  Crown, Wrench, Pencil, Shield, ChevronDown, ChevronRight
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RoleBadge = ({ role }) => {
  const isManager = role === 'manager';
  const label = isManager ? 'Manager' : 'Team Member';
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{
        background: isManager ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)',
        color: isManager ? '#F59E0B' : '#3B82F6',
        border: `1px solid ${isManager ? 'rgba(245,158,11,0.25)' : 'rgba(59,130,246,0.25)'}`,
      }}
      data-testid={`role-badge-${role}`}
    >
      {label}
    </span>
  );
};

export const OperatorsTab = ({ getAuthHeaders }) => {
  const { user } = useAuth();
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    username: '', password: '', first_name: '', last_name: '',
    email: '', phone: '', title: '', notes: '', operator_role: 'worker',
  });
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editing, setEditing] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  const isFounder = user?.role === 'admin';
  const isManager = user?.role === 'operator' && user?.operator_role === 'manager';

  const fetchOperators = async () => {
    try {
      const res = await axios.get(`${API_URL}/founder/operators`, getAuthHeaders());
      setOperators(res.data);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchOperators(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!form.username || !form.password || !form.first_name || !form.last_name) {
      toast.error('Username, password, first name, and last name are required');
      return;
    }
    setCreating(true);
    try {
      await axios.post(`${API_URL}/founder/operators`, form, getAuthHeaders());
      toast.success(`${form.operator_role === 'manager' ? 'Manager' : 'Team Member'} account created`);
      setShowCreate(false);
      setForm({
        username: '', password: '', first_name: '', last_name: '',
        email: '', phone: '', title: '', notes: '', operator_role: 'worker',
      });
      fetchOperators();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setCreating(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !deletePassword) return;
    setDeleting(true);
    try {
      await axios.delete(
        `${API_URL}/founder/operators/${deleteTarget.id}?admin_password=${encodeURIComponent(deletePassword)}`,
        getAuthHeaders()
      );
      toast.success('Operator removed');
      setDeleteTarget(null);
      setDeletePassword('');
      fetchOperators();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setDeleting(false); }
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    setEditing(true);
    try {
      await axios.put(
        `${API_URL}/founder/operators/${editTarget.id}`,
        editForm,
        getAuthHeaders()
      );
      toast.success('Operator updated');
      setEditTarget(null);
      setEditForm({});
      fetchOperators();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setEditing(false); }
  };

  const openEdit = (op) => {
    setEditTarget(op);
    setEditForm({
      username: op.email || '',
      first_name: op.first_name || '',
      last_name: op.last_name || '',
      email: op.contact_email || '',
      phone: op.phone || '',
      title: op.title || '',
      notes: op.notes || '',
      password: '',
    });
    setShowEditPassword(false);
  };

  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const ef = (k) => (e) => setEditForm({ ...editForm, [k]: e.target.value });

  const managers = operators.filter(op => op.operator_role === 'manager');
  const workers = operators.filter(op => op.operator_role !== 'manager');

  return (
    <div className="space-y-4" data-testid="operators-tab">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--t)] uppercase tracking-wider">Operations Team</h3>
        <Button size="sm" className="text-xs" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
          onClick={() => setShowCreate(true)} data-testid="add-operator-btn">
          <Plus className="w-3 h-3 mr-1" /> Add {isFounder ? 'Operator' : 'Team Member'}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>
      ) : operators.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-6 text-center text-[var(--t4)] text-sm">
          No operators yet. Create one to delegate operations tasks.
        </CardContent></Card>
      ) : (
        <div className="space-y-5">
          {/* Managers Section — visible to Founder and Managers */}
          {(isFounder || isManager) && managers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-4 h-4 text-[#F59E0B]" />
                <span className="text-xs font-bold text-[var(--t)] uppercase tracking-wider">Operations Managers</span>
                <span className="text-[10px] text-[var(--t5)]">({managers.length})</span>
              </div>
              <div className="space-y-2">
                {managers.map(op => (
                  <OperatorCard key={op.id} op={op} expandedId={expandedId} setExpandedId={setExpandedId}
                    onEdit={() => openEdit(op)} onDelete={() => setDeleteTarget(op)}
                    canDelete={isFounder} canEdit={isFounder} />
                ))}
              </div>
            </div>
          )}

          {/* Workers Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="w-4 h-4 text-[#3B82F6]" />
              <span className="text-xs font-bold text-[var(--t)] uppercase tracking-wider">Operations Team Members</span>
              <span className="text-[10px] text-[var(--t5)]">({workers.length})</span>
            </div>
            {workers.length === 0 ? (
              <Card className="glass-card"><CardContent className="p-4 text-center text-[var(--t5)] text-xs">
                No team members yet. Add team members to handle daily operations.
              </CardContent></Card>
            ) : (
              <div className="space-y-2">
                {workers.map(op => (
                  <OperatorCard key={op.id} op={op} expandedId={expandedId} setExpandedId={setExpandedId}
                    onEdit={() => openEdit(op)} onDelete={() => setDeleteTarget(op)}
                    canDelete={isFounder || isManager} canEdit={isFounder || isManager} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Operator Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="glass-card max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[var(--t)]">
              Create {form.operator_role === 'manager' ? 'Manager' : 'Team Member'} Account
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {/* Role selector — Founder can choose manager/worker, Managers can only create workers */}
            {isFounder && (
              <div>
                <label className="text-[10px] text-[var(--t5)] uppercase tracking-wider font-bold mb-1.5 block">Account Type</label>
                <Select value={form.operator_role} onValueChange={(v) => setForm({ ...form, operator_role: v })}>
                  <SelectTrigger className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" data-testid="role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Operations Manager</SelectItem>
                    <SelectItem value="worker">Operations Team Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="First name *" value={form.first_name} onChange={f('first_name')}
                className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" data-testid="create-first-name" />
              <Input placeholder="Last name *" value={form.last_name} onChange={f('last_name')}
                className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" data-testid="create-last-name" />
            </div>
            <Input placeholder="Username * (login credential)" value={form.username} onChange={f('username')}
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" data-testid="create-username" />
            <div className="relative">
              <Input placeholder="Password *" type={showFormPassword ? 'text' : 'password'} value={form.password}
                onChange={f('password')}
                className="bg-[var(--s)] border-[var(--b)] text-[var(--t)] pr-10" data-testid="create-password" />
              <button type="button" onClick={() => setShowFormPassword(!showFormPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                {showFormPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="pt-1 pb-1">
              <p className="text-[10px] text-[var(--t5)] uppercase tracking-wider font-bold mb-2">Contact Information</p>
            </div>
            <Input placeholder="Email (for OTP verification)" type="email" value={form.email} onChange={f('email')}
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" />
            <Input placeholder="Phone number" type="tel" value={form.phone} onChange={f('phone')}
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" />
            <div className="pt-1 pb-1">
              <p className="text-[10px] text-[var(--t5)] uppercase tracking-wider font-bold mb-2">Role Details</p>
            </div>
            <Input placeholder="Title (e.g. TVT Reviewer, Support Lead)" value={form.title} onChange={f('title')}
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" />
            <textarea placeholder="Notes (internal reference only)" value={form.notes} onChange={f('notes')}
              className="w-full h-20 px-3 py-2 rounded-lg text-sm bg-[var(--s)] border border-[var(--b)] text-[var(--t)] resize-none" />
            <Button className="w-full" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
              disabled={creating} onClick={handleCreate} data-testid="create-operator-submit">
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Create {form.operator_role === 'manager' ? 'Manager' : 'Team Member'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Operator Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="glass-card max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[var(--t)]">Edit Operator — {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="First name" value={editForm.first_name || ''} onChange={ef('first_name')}
                className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" data-testid="edit-first-name" />
              <Input placeholder="Last name" value={editForm.last_name || ''} onChange={ef('last_name')}
                className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" data-testid="edit-last-name" />
            </div>

            {/* Login Credentials Section */}
            <div className="pt-1 pb-1">
              <p className="text-[10px] text-[var(--t5)] uppercase tracking-wider font-bold mb-2">Login Credentials</p>
            </div>
            <Input placeholder="Username (login credential)" value={editForm.username || ''} onChange={ef('username')}
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" data-testid="edit-username" />
            <div className="relative">
              <Input placeholder="New password (leave blank to keep)" type={showEditPassword ? 'text' : 'password'}
                value={editForm.password || ''} onChange={ef('password')}
                className="bg-[var(--s)] border-[var(--b)] text-[var(--t)] pr-10" data-testid="edit-password" />
              <button type="button" onClick={() => setShowEditPassword(!showEditPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Contact Information Section */}
            <div className="pt-1 pb-1">
              <p className="text-[10px] text-[var(--t5)] uppercase tracking-wider font-bold mb-2">Contact Information</p>
            </div>
            <Input placeholder="Email (for OTP verification)" type="email" value={editForm.email || ''} onChange={ef('email')}
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" data-testid="edit-email" />
            <Input placeholder="Phone" type="tel" value={editForm.phone || ''} onChange={ef('phone')}
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" data-testid="edit-phone" />

            {/* Role Details Section */}
            <div className="pt-1 pb-1">
              <p className="text-[10px] text-[var(--t5)] uppercase tracking-wider font-bold mb-2">Role Details</p>
            </div>
            <Input placeholder="Title" value={editForm.title || ''} onChange={ef('title')}
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)]" data-testid="edit-title" />
            <textarea placeholder="Notes" value={editForm.notes || ''} onChange={ef('notes')}
              className="w-full h-16 px-3 py-2 rounded-lg text-sm bg-[var(--s)] border border-[var(--b)] text-[var(--t)] resize-none" />
            <div className="flex gap-3 mt-2">
              <Button variant="outline" className="flex-1 border-[var(--b)] text-[var(--t)]"
                onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button className="flex-1" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
                disabled={editing} onClick={handleEdit} data-testid="edit-operator-submit">
                {editing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Pencil className="w-4 h-4 mr-1" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeletePassword(''); } }}>
        <DialogContent className="glass-card border-[var(--rd)]/30 max-w-md">
          <DialogHeader><DialogTitle className="text-[var(--t)]">Remove Operator</DialogTitle></DialogHeader>
          <p className="text-sm text-[var(--t4)]">
            Remove <strong>{deleteTarget?.name}</strong> (username: {deleteTarget?.email})?
            Enter your password to confirm.
          </p>
          <div className="relative mt-2">
            <Input type={showDeletePassword ? 'text' : 'password'} value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)} placeholder="Your password"
              className="bg-[var(--s)] border-[var(--b)] text-[var(--t)] pr-10" data-testid="delete-password" />
            <button type="button" onClick={() => setShowDeletePassword(!showDeletePassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
              {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex gap-3 mt-3">
            <Button variant="outline" className="flex-1 border-[var(--b)] text-[var(--t)]"
              onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="flex-1 bg-[var(--rd)] hover:bg-[var(--rd)]/90 text-white"
              disabled={!deletePassword || deleting} onClick={handleDelete} data-testid="confirm-delete-btn">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />} Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Individual operator card
const OperatorCard = ({ op, expandedId, setExpandedId, onEdit, onDelete, canDelete = true, canEdit = true }) => {
  const isExpanded = expandedId === op.id;
  const isManager = op.operator_role === 'manager';

  return (
    <Card className="glass-card" data-testid={`operator-card-${op.id}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer flex-1"
            onClick={() => setExpandedId(isExpanded ? null : op.id)}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: isManager ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)',
                border: `1px solid ${isManager ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)'}`,
              }}>
              {isManager
                ? <Crown className="w-5 h-5 text-[#F59E0B]" />
                : <Wrench className="w-5 h-5 text-[#3B82F6]" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-[var(--t)]">{op.name || `${op.first_name} ${op.last_name}`}</p>
                <RoleBadge role={op.operator_role || 'worker'} />
              </div>
              <p className="text-xs text-[var(--t5)]">
                @{op.email}{op.title ? ` · ${op.title}` : ''}
              </p>
            </div>
            {isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--t5)]" /> : <ChevronRight className="w-4 h-4 text-[var(--t5)]" />}
          </div>
          <div className="flex gap-1.5 ml-2 flex-shrink-0">
            {canEdit && (
            <Button size="sm" variant="outline" className="text-xs border-[var(--b)] text-[var(--t4)]"
              onClick={onEdit} data-testid={`edit-op-${op.id}`}>
              <Pencil className="w-3 h-3" />
            </Button>
            )}
            {canDelete && (
            <Button size="sm" variant="outline" className="text-xs border-[var(--rd)]/30 text-[var(--rd)]"
              onClick={onDelete} data-testid={`delete-op-${op.id}`}>
              <Trash2 className="w-3 h-3" />
            </Button>
            )}
          </div>
        </div>
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-[var(--b)] grid grid-cols-2 gap-2 text-xs">
            {op.contact_email && (
              <div className="flex items-center gap-1.5 text-[var(--t4)]">
                <Mail className="w-3 h-3 text-[var(--t5)]" /> {op.contact_email}
              </div>
            )}
            {op.phone && (
              <div className="flex items-center gap-1.5 text-[var(--t4)]">
                <Phone className="w-3 h-3 text-[var(--t5)]" /> {op.phone}
              </div>
            )}
            {op.title && (
              <div className="flex items-center gap-1.5 text-[var(--t4)]">
                <Briefcase className="w-3 h-3 text-[var(--t5)]" /> {op.title}
              </div>
            )}
            <div className="text-[var(--t5)]">
              Created: {new Date(op.created_at).toLocaleDateString()}
            </div>
            {op.last_login_at && (
              <div className="text-[var(--t5)]">
                Last login: {new Date(op.last_login_at).toLocaleString()}
              </div>
            )}
            {op.notes && <div className="col-span-2 text-[var(--t4)] mt-1">{op.notes}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
