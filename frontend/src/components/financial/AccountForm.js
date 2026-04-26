import React, { useState, useRef, useCallback } from 'react';
import { Loader2, Plus, Link2, Sparkles } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from '../../utils/toast';
import axios from 'axios';
import { API_URL } from '../../config';
import { parseMoney, formatPydanticError } from '../../utils/financialFormHelpers';

const AccountForm = ({ estateId, account, categories, categoryLabels, davEntries, beneficiaries, bills, onSaved, onAddCategory, getAuthHeaders }) => {
  const isEdit = !!account;
  const [saving, setSaving] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [form, setForm] = useState({
    name: account?.name || '',
    category: account?.category || 'checking',
    approximate_balance: account?.approximate_balance ?? '',
    balance_last_updated: account?.balance_last_updated || '',
    interest_rate: account?.interest_rate ?? '',
    institution_name: account?.institution_name || '',
    account_number_masked: account?.account_number_masked || '',
    routing_number: account?.routing_number || '',
    institution_phone: account?.institution_phone || '',
    institution_website: account?.institution_website || '',
    branch_address: account?.branch_address || '',
    ownership_type: account?.ownership_type || 'individual',
    joint_owner: account?.joint_owner || '',
    named_beneficiary_at_institution: account?.named_beneficiary_at_institution || '',
    beneficiary_on_account: account?.beneficiary_on_account || '',
    dav_entry_id: account?.dav_entry_id || '',
    linked_bill_ids: account?.linked_bill_ids || [],
    priority: account?.priority || 'important',
    notes: account?.notes || '',
    status: account?.status || 'active',
  });
  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));
  const [smartLoading, setSmartLoading] = useState(false);
  const smartTimerRef = useRef(null);

  const smartCategorize = useCallback(async (name) => {
    if (!name || name.length < 3 || isEdit) return;
    clearTimeout(smartTimerRef.current);
    smartTimerRef.current = setTimeout(async () => {
      setSmartLoading(true);
      try {
        const res = await axios.post(`${API_URL}/financial/smart-categorize`, { bill_name: name, module: 'accounts' }, getAuthHeaders());
        const s = res.data;
        if (s.category && s.category !== 'other') update('category', s.category);
        if (s.biller_phone && !form.institution_phone) update('institution_phone', s.biller_phone);
        if (s.biller_website && !form.institution_website) update('institution_website', s.biller_website);
        toast.success('AI auto-filled details');
      } catch { /* silent */ }
      setSmartLoading(false);
    }, 800);
  }, [isEdit, getAuthHeaders]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    const errs = [];
    if (!form.name.trim()) errs.push('Account Name');
    const bal = parseMoney(form.approximate_balance);
    if (!String(form.approximate_balance ?? '').trim()) errs.push('Approx. Balance');
    else if (!bal.ok) errs.push('Approx. Balance (must be a number)');
    if (errs.length) { toast.error(`Please fill in: ${errs.join(', ')}`); return; }
    setSaving(true);
    try {
      const ir = parseMoney(form.interest_rate);
      const payload = {
        ...form, estate_id: estateId,
        approximate_balance: bal.value,
        interest_rate: ir.value,
        dav_entry_id: form.dav_entry_id || null,
      };
      const { mutateWithOutbox } = await import('../../utils/offlineMutation');
      const r = await mutateWithOutbox({
        entity_type: 'financial_account',
        entity_id: isEdit ? account.id : `local-account-${Date.now()}`,
        method: isEdit ? 'PUT' : 'POST',
        url: isEdit ? `/financial/accounts/${account.id}` : '/financial/accounts',
        body: payload,
        authHeaders: getAuthHeaders(),
      });
      if (!r.ok) throw r.error || new Error('Save failed');
      if (r.queued) toast.success(`Account ${isEdit ? 'change' : 'saved'} offline — will sync when you reconnect.`);
      onSaved();
    } catch (err) { toast.error(formatPydanticError(err, 'Failed to save account')); }
    setSaving(false);
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const success = await onAddCategory(newCatName.trim());
    if (success) { update('category', newCatName.trim()); setNewCatName(''); setShowNewCat(false); }
  };

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Account Name <span className="text-red-400">*</span></Label>
        <div className="relative">
          <Input value={form.name} onChange={e => update('name', e.target.value)}
            onBlur={e => smartCategorize(e.target.value)}
            placeholder="e.g., Primary Checking - Chase" className="input-field pr-10" data-testid="account-name-input" />
          {smartLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2"><Sparkles className="w-4 h-4 text-[var(--gold)] animate-pulse" /></div>}
          {!smartLoading && !isEdit && form.name.length >= 3 && (
            <button type="button" onClick={() => smartCategorize(form.name)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-[var(--s)]" title="AI auto-fill" aria-label="AI auto-categorize">
              <Sparkles className="w-4 h-4 text-[var(--t5)]" />
            </button>
          )}
        </div>
        {!isEdit && <p className="text-[11px] text-[var(--t5)] mt-0.5"><Sparkles className="w-3 h-3 inline mr-0.5 text-[var(--gold)]" />AI will auto-fill category and institution details</p>}
      </div>
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Category</Label>
        {showNewCat ? (
          <div className="flex gap-2">
            <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="New category" className="input-field" autoFocus onKeyDown={e => e.key === 'Enter' && handleAddCategory()} />
            <Button size="sm" className="gold-button flex-shrink-0" onClick={handleAddCategory}><Plus className="w-4 h-4" /></Button>
            <Button size="sm" variant="ghost" className="flex-shrink-0" onClick={() => setShowNewCat(false)}>Cancel</Button>
          </div>
        ) : (
          <Select value={form.category} onValueChange={v => { if (v === '__new__') setShowNewCat(true); else update('category', v); }}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
              {categories.map(cat => <SelectItem key={cat} value={cat}>{categoryLabels[cat] || cat}</SelectItem>)}
              <SelectItem value="__new__"><span className="flex items-center gap-1 text-[var(--gold)]"><Plus className="w-3 h-3" /> Add New Category</span></SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Approx. Balance ($) <span className="text-red-400">*</span></Label>
          <Input type="text" inputMode="decimal" value={form.approximate_balance} onChange={e => update('approximate_balance', e.target.value)} placeholder="12,450" className="input-field" />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Status</Label>
          <Select value={form.status} onValueChange={v => update('status', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="frozen">Frozen</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Interest/Yield Rate (%)</Label>
          <Input type="text" inputMode="decimal" value={form.interest_rate} onChange={e => update('interest_rate', e.target.value)} placeholder="4.25" className="input-field" />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Balance Last Updated</Label>
          <Input type="date" value={form.balance_last_updated} onChange={e => update('balance_last_updated', e.target.value)} className="input-field" />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Institution Name</Label>
        <Input value={form.institution_name} onChange={e => update('institution_name', e.target.value)} placeholder="Chase, Fidelity, Vanguard..." className="input-field" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Account Number (last 4)</Label>
          <Input value={form.account_number_masked} onChange={e => update('account_number_masked', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="7823" maxLength={4} className="input-field" />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Routing Number</Label>
          <Input value={form.routing_number} onChange={e => update('routing_number', e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="021000021" maxLength={9} className="input-field" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Institution Phone</Label>
          <Input type="tel" value={form.institution_phone} onChange={e => update('institution_phone', e.target.value)} className="input-field" />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Institution Website</Label>
          <Input value={form.institution_website} onChange={e => update('institution_website', e.target.value)} className="input-field" />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Branch Address</Label>
        <Input value={form.branch_address} onChange={e => update('branch_address', e.target.value)} placeholder="123 Main St, Charlotte, NC" className="input-field" />
      </div>
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Ownership Type</Label>
        <Select value={form.ownership_type} onValueChange={v => update('ownership_type', v)}>
          <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
            <SelectItem value="individual">Individual</SelectItem>
            <SelectItem value="joint_jtwros">Joint (JTWROS)</SelectItem>
            <SelectItem value="joint_tic">Joint (Tenants in Common)</SelectItem>
            <SelectItem value="trust">Trust-Held</SelectItem>
            <SelectItem value="pod_tod">POD/TOD</SelectItem>
            <SelectItem value="community_property">Community Property</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {(form.ownership_type.startsWith('joint') || form.ownership_type === 'community_property') && (
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Joint Owner</Label>
          <Input value={form.joint_owner} onChange={e => update('joint_owner', e.target.value)} placeholder="Sarah Mitchell" className="input-field" />
        </div>
      )}
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Named Beneficiary at Institution</Label>
        <Input value={form.named_beneficiary_at_institution} onChange={e => update('named_beneficiary_at_institution', e.target.value)} placeholder="TOD/POD beneficiary listed at bank" className="input-field" />
      </div>
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Priority</Label>
        <Select value={form.priority} onValueChange={v => update('priority', v)}>
          <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
            <SelectItem value="critical">Critical (Primary Bill-Pay)</SelectItem>
            <SelectItem value="important">Important</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {davEntries && davEntries.length > 0 && (
        <div className="space-y-2">
          <Label className="text-[#94a3b8]"><Link2 className="w-3 h-3 inline mr-1" />Link to Digital Access Vault</Label>
          <Select value={form.dav_entry_id || 'none'} onValueChange={v => update('dav_entry_id', v === 'none' ? '' : v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
              <SelectItem value="none">No link</SelectItem>
              {davEntries.map(e => <SelectItem key={e.id} value={e.id}>{e.account_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Notes / Instructions for Beneficiary</Label>
        <Textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="e.g., This is the primary bill-pay account. Do NOT close until all auto-pay bills are transferred." className="input-field min-h-[100px]" />
      </div>
      <Button className="gold-button w-full mt-4" onClick={handleSubmit} disabled={saving} data-testid="save-account-button">
        {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
        {isEdit ? 'Save Changes' : 'Add Account'}
      </Button>
    </div>
  );
};

export default AccountForm;
