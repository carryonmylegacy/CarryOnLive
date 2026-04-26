import React, { useState, useRef, useCallback } from 'react';
import { Loader2, Plus, Link2, Sparkles } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { toast } from '../../utils/toast';
import axios from 'axios';
import { API_URL } from '../../config';
import { parseMoney, parseInteger, formatPydanticError } from '../../utils/financialFormHelpers';
import { PassdownNotes } from './PassdownNotes';
import { VisibilityTimingPills } from './VisibilityTimingPills';

const DebtForm = ({ estateId, debt, categories, categoryLabels, davEntries, beneficiaries, onSaved, onAddCategory, getAuthHeaders }) => {
  const isEdit = !!debt;
  const [saving, setSaving] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [form, setForm] = useState({
    name: debt?.name || '',
    category: debt?.category || 'other',
    outstanding_balance: debt?.outstanding_balance ?? '',
    original_amount: debt?.original_amount ?? '',
    interest_rate: debt?.interest_rate ?? '',
    monthly_payment: debt?.monthly_payment ?? '',
    minimum_payment: debt?.minimum_payment ?? '',
    loan_term_months: debt?.loan_term_months ?? '',
    origination_date: debt?.origination_date || '',
    estimated_payoff_date: debt?.estimated_payoff_date || '',
    account_number_masked: debt?.account_number_masked || '',
    lender_name: debt?.lender_name || '',
    lender_phone: debt?.lender_phone || '',
    lender_website: debt?.lender_website || '',
    lender_address: debt?.lender_address || '',
    collateral: debt?.collateral || '',
    co_signer: debt?.co_signer || '',
    has_life_insurance: debt?.has_life_insurance ?? false,
    life_insurance_policy: debt?.life_insurance_policy || '',
    dav_entry_id: debt?.dav_entry_id || '',
    priority: debt?.priority || 'important',
    notes: debt?.notes || '',
    notes_first_action: debt?.notes_first_action || '',
    notes_gotchas: debt?.notes_gotchas || '',
    notes_who_to_call: debt?.notes_who_to_call || '',
    status: debt?.status || 'active',
    visibility_timing: debt?.visibility_timing || { pre: false, post: true },
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
        const res = await axios.post(`${API_URL}/financial/smart-categorize`, { bill_name: name, module: 'debts' }, getAuthHeaders());
        const s = res.data;
        if (s.category && s.category !== 'other') update('category', s.category);
        if (s.biller_phone && !form.lender_phone) update('lender_phone', s.biller_phone);
        if (s.biller_website && !form.lender_website) update('lender_website', s.biller_website);
        toast.success('AI auto-filled details');
      } catch { /* silent */ }
      setSmartLoading(false);
    }, 800);
  }, [isEdit, getAuthHeaders]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    const errs = [];
    if (!form.name.trim()) errs.push('Debt Name');
    const bal = parseMoney(form.outstanding_balance);
    if (!String(form.outstanding_balance ?? '').trim()) errs.push('Outstanding Balance');
    else if (!bal.ok) errs.push('Outstanding Balance (must be a number)');
    if (errs.length) { toast.error(`Please fill in: ${errs.join(', ')}`); return; }
    setSaving(true);
    try {
      const orig = parseMoney(form.original_amount);
      const ir = parseMoney(form.interest_rate);
      const mp = parseMoney(form.monthly_payment);
      const minp = parseMoney(form.minimum_payment);
      const term = parseInteger(form.loan_term_months);
      const payload = {
        ...form, estate_id: estateId,
        outstanding_balance: bal.value,
        original_amount: orig.value,
        interest_rate: ir.value,
        monthly_payment: mp.value,
        minimum_payment: minp.value,
        loan_term_months: term.value,
        dav_entry_id: form.dav_entry_id || null,
      };
      const { mutateWithOutbox } = await import('../../utils/offlineMutation');
      const r = await mutateWithOutbox({
        entity_type: 'financial_debt',
        entity_id: isEdit ? debt.id : `local-debt-${Date.now()}`,
        method: isEdit ? 'PUT' : 'POST',
        url: isEdit ? `/financial/debts/${debt.id}` : '/financial/debts',
        body: payload,
        authHeaders: getAuthHeaders(),
      });
      if (!r.ok) throw r.error || new Error('Save failed');
      if (r.queued) toast.success(`Debt ${isEdit ? 'change' : 'saved'} offline — will sync when you reconnect.`);
      onSaved();
    } catch (err) { toast.error(formatPydanticError(err, 'Failed to save debt')); }
    setSaving(false);
  };
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const success = await onAddCategory(newCatName.trim());
    if (success) { update('category', newCatName.trim()); setNewCatName(''); setShowNewCat(false); }
  };

  return (
    <div className="space-y-4 py-4">
      <VisibilityTimingPills
        timing={form.visibility_timing}
        onChange={(t) => update('visibility_timing', t)}
        recordKind="debt"
      />
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Debt Name <span className="text-red-400">*</span></Label>
        <div className="relative">
          <Input value={form.name} onChange={e => update('name', e.target.value)}
            onBlur={e => smartCategorize(e.target.value)}
            placeholder="e.g., Home Mortgage - Wells Fargo" className="input-field pr-10" data-testid="debt-name-input" />
          {smartLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2"><Sparkles className="w-4 h-4 text-[var(--gold)] animate-pulse" /></div>}
          {!smartLoading && !isEdit && form.name.length >= 3 && (
            <button type="button" onClick={() => smartCategorize(form.name)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-[var(--s)]" title="AI auto-fill" aria-label="AI auto-categorize">
              <Sparkles className="w-4 h-4 text-[var(--t5)]" />
            </button>
          )}
        </div>
        {!isEdit && <p className="text-[11px] text-[var(--t5)] mt-0.5"><Sparkles className="w-3 h-3 inline mr-0.5 text-[var(--gold)]" />AI will auto-fill category and lender details</p>}
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
          <Label className="text-[#94a3b8]">Outstanding Balance ($) <span className="text-red-400">*</span></Label>
          <Input type="text" inputMode="decimal" value={form.outstanding_balance} onChange={e => update('outstanding_balance', e.target.value)} placeholder="287,450" className="input-field" />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Original Amount ($)</Label>
          <Input type="text" inputMode="decimal" value={form.original_amount} onChange={e => update('original_amount', e.target.value)} placeholder="320,000" className="input-field" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Interest Rate (%)</Label>
          <Input type="text" inputMode="decimal" value={form.interest_rate} onChange={e => update('interest_rate', e.target.value)} placeholder="3.25" className="input-field" />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Monthly Payment ($)</Label>
          <Input type="text" inputMode="decimal" value={form.monthly_payment} onChange={e => update('monthly_payment', e.target.value)} placeholder="1,842" className="input-field" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Minimum Payment ($)</Label>
          <Input type="text" inputMode="decimal" value={form.minimum_payment} onChange={e => update('minimum_payment', e.target.value)} placeholder="25" className="input-field" />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Loan Term (months)</Label>
          <Input type="text" inputMode="numeric" value={form.loan_term_months} onChange={e => update('loan_term_months', e.target.value)} placeholder="360" className="input-field" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Origination Date</Label>
          <Input type="date" value={form.origination_date} onChange={e => update('origination_date', e.target.value)} className="input-field" />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Est. Payoff Date</Label>
          <Input type="date" value={form.estimated_payoff_date} onChange={e => update('estimated_payoff_date', e.target.value)} className="input-field" />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Status</Label>
        <Select value={form.status} onValueChange={v => update('status', v)}>
          <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paid_off">Paid Off</SelectItem>
            <SelectItem value="forbearance">In Forbearance</SelectItem>
            <SelectItem value="collections">In Collections</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Account Number (last 4)</Label>
        <Input value={form.account_number_masked} onChange={e => update('account_number_masked', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="7823" maxLength={4} className="input-field" />
      </div>
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Lender Name</Label>
        <Input value={form.lender_name} onChange={e => update('lender_name', e.target.value)} placeholder="Wells Fargo" className="input-field" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Lender Phone</Label>
          <Input type="tel" value={form.lender_phone} onChange={e => update('lender_phone', e.target.value)} className="input-field" />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Lender Website</Label>
          <Input value={form.lender_website} onChange={e => update('lender_website', e.target.value)} className="input-field" />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Collateral / Secured By</Label>
        <Input value={form.collateral} onChange={e => update('collateral', e.target.value)} placeholder="123 Main St" className="input-field" />
      </div>
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Co-Signer</Label>
        <Input value={form.co_signer} onChange={e => update('co_signer', e.target.value)} placeholder="Jane Doe" className="input-field" />
      </div>
      <div className="flex items-center justify-between py-2">
        <Label className="text-[#94a3b8]">Life Insurance Tied?</Label>
        <Switch checked={form.has_life_insurance} onCheckedChange={v => update('has_life_insurance', v)} />
      </div>
      {form.has_life_insurance && (
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Life Insurance Policy</Label>
          <Input value={form.life_insurance_policy} onChange={e => update('life_insurance_policy', e.target.value)} placeholder="Mortgage Protection - Policy #123" className="input-field" />
        </div>
      )}
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Priority</Label>
        <Select value={form.priority} onValueChange={v => update('priority', v)}>
          <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
            <SelectItem value="critical">Critical (Secured)</SelectItem>
            <SelectItem value="important">Important</SelectItem>
            <SelectItem value="low">Low (Negotiable)</SelectItem>
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
      <PassdownNotes form={form} update={update} />
      <Button className="gold-button w-full mt-4" onClick={handleSubmit} disabled={saving} data-testid="save-debt-button">
        {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
        {isEdit ? 'Save Changes' : 'Add Debt'}
      </Button>
    </div>
  );
};

export default DebtForm;
