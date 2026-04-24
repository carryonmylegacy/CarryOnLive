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

const REMINDER_OPTIONS = [10, 7, 5, 3, 1, 0];

const BillForm = ({ estateId, bill, categories, categoryLabels, davEntries, beneficiaries, onSaved, onAddCategory, getAuthHeaders }) => {
  const isEdit = !!bill;
  const [saving, setSaving] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [form, setForm] = useState({
    name: bill?.name || '',
    category: bill?.category || 'other',
    amount: bill?.amount || '',
    is_recurring: bill?.is_recurring ?? true,
    frequency: bill?.frequency || 'monthly',
    due_day: bill?.due_day || '',
    due_date: bill?.due_date || '',
    grace_period_days: bill?.grace_period_days || '',
    late_fee: bill?.late_fee || '',
    payment_method: bill?.payment_method || 'manual_online',
    payment_account: bill?.payment_account || '',
    is_auto_pay: bill?.is_auto_pay ?? false,
    account_number_masked: bill?.account_number_masked || '',
    biller_phone: bill?.biller_phone || '',
    biller_website: bill?.biller_website || '',
    biller_address: bill?.biller_address || '',
    reminder_days: bill?.reminder_days || [10, 7, 5, 1],
    priority: bill?.priority || 'important',
    dav_entry_id: bill?.dav_entry_id || '',
    notes: bill?.notes || '',
    status: bill?.status || 'active',
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
        const res = await axios.post(`${API_URL}/financial/smart-categorize`, { bill_name: name, module: 'bills' }, getAuthHeaders());
        const s = res.data;
        if (s.category && s.category !== 'other') update('category', s.category);
        if (s.biller_phone && !form.biller_phone) update('biller_phone', s.biller_phone);
        if (s.biller_website && !form.biller_website) update('biller_website', s.biller_website);
        if (s.payment_method) update('payment_method', s.payment_method);
        if (s.is_auto_pay != null) update('is_auto_pay', s.is_auto_pay);
        if (s.frequency) update('frequency', s.frequency);
        toast.success('AI auto-filled details');
      } catch { /* silent */ }
      setSmartLoading(false);
    }, 800);
  }, [isEdit, getAuthHeaders]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Bill name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        estate_id: estateId,
        amount: form.amount ? parseFloat(form.amount) : null,
        due_day: form.due_day ? parseInt(form.due_day) : null,
        grace_period_days: form.grace_period_days ? parseInt(form.grace_period_days) : null,
        dav_entry_id: form.dav_entry_id || null,
      };
      const { mutateWithOutbox } = await import('../../utils/offlineMutation');
      const r = await mutateWithOutbox({
        entity_type: 'financial_bill',
        entity_id: isEdit ? bill.id : `local-bill-${Date.now()}`,
        method: isEdit ? 'PUT' : 'POST',
        url: isEdit ? `/financial/bills/${bill.id}` : '/financial/bills',
        body: payload,
        authHeaders: getAuthHeaders(),
      });
      if (!r.ok) throw r.error || new Error('Save failed');
      if (r.queued) toast.success(`Bill ${isEdit ? 'change' : 'saved'} offline — will sync when you reconnect.`);
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save bill');
    }
    setSaving(false);
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const success = await onAddCategory(newCatName.trim());
    if (success) {
      update('category', newCatName.trim());
      setNewCatName('');
      setShowNewCat(false);
    }
  };

  const toggleReminder = (day) => {
    const current = form.reminder_days || [];
    if (current.includes(day)) {
      update('reminder_days', current.filter(d => d !== day));
    } else {
      update('reminder_days', [...current, day].sort((a, b) => b - a));
    }
  };

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Bill Name <span className="text-red-400">*</span></Label>
        <div className="relative">
          <Input value={form.name} onChange={e => update('name', e.target.value)}
            onBlur={e => smartCategorize(e.target.value)}
            placeholder="e.g., Electric Bill - Duke Energy" className="input-field pr-10" data-testid="bill-name-input" />
          {smartLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Sparkles className="w-4 h-4 text-[var(--gold)] animate-pulse" />
            </div>
          )}
          {!smartLoading && !isEdit && form.name.length >= 3 && (
            <button type="button" onClick={() => smartCategorize(form.name)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-[var(--s)] transition-colors"
              title="AI auto-fill" data-testid="smart-categorize-btn">
              <Sparkles className="w-4 h-4 text-[var(--t5)]" />
            </button>
          )}
        </div>
        {!isEdit && <p className="text-[11px] text-[var(--t5)] mt-0.5"><Sparkles className="w-3 h-3 inline mr-0.5 text-[var(--gold)]" />AI will auto-fill category and biller details when you type a name</p>}
      </div>

      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Category</Label>
        {showNewCat ? (
          <div className="flex gap-2">
            <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="New category name" className="input-field" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAddCategory()} data-testid="new-category-input" />
            <Button size="sm" className="gold-button flex-shrink-0" onClick={handleAddCategory} data-testid="save-category-btn">
              <Plus className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="flex-shrink-0" onClick={() => setShowNewCat(false)}>Cancel</Button>
          </div>
        ) : (
          <Select value={form.category} onValueChange={v => { if (v === '__new__') { setShowNewCat(true); } else update('category', v); }}>
            <SelectTrigger className="input-field" data-testid="bill-category-select"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{categoryLabels[cat] || cat}</SelectItem>
              ))}
              <SelectItem value="__new__">
                <span className="flex items-center gap-1 text-[var(--gold)]"><Plus className="w-3 h-3" /> Add New Category</span>
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Amount ($)</Label>
          <Input type="number" step="0.01" value={form.amount} onChange={e => update('amount', e.target.value)} placeholder="142.50" className="input-field" data-testid="bill-amount-input" />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Status</Label>
          <Select value={form.status} onValueChange={v => update('status', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between py-2">
        <Label className="text-[#94a3b8]">Recurring Bill?</Label>
        <Switch checked={form.is_recurring} onCheckedChange={v => update('is_recurring', v)} data-testid="bill-recurring-switch" />
      </div>

      {form.is_recurring ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-[#94a3b8]">Frequency</Label>
            <Select value={form.frequency} onValueChange={v => update('frequency', v)}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="semi_annual">Semi-Annual</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[#94a3b8]">Due Day of Month</Label>
            <Input type="number" min="1" max="31" value={form.due_day} onChange={e => update('due_day', e.target.value)} placeholder="15" className="input-field" data-testid="bill-due-day-input" />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Due Date</Label>
          <Input type="date" value={form.due_date} onChange={e => update('due_date', e.target.value)} className="input-field" data-testid="bill-due-date-input" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Grace Period (days)</Label>
          <Input type="number" value={form.grace_period_days} onChange={e => update('grace_period_days', e.target.value)} placeholder="5" className="input-field" />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Late Fee</Label>
          <Input value={form.late_fee} onChange={e => update('late_fee', e.target.value)} placeholder="$25 or 5%" className="input-field" />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Payment Method</Label>
        <Select value={form.payment_method} onValueChange={v => update('payment_method', v)}>
          <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
            <SelectItem value="auto_pay">Auto-Pay</SelectItem>
            <SelectItem value="manual_online">Manual Online</SelectItem>
            <SelectItem value="check">Check</SelectItem>
            <SelectItem value="phone">Phone</SelectItem>
            <SelectItem value="in_person">In-Person</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Payment Account</Label>
        <Input value={form.payment_account} onChange={e => update('payment_account', e.target.value)} placeholder="Chase Checking ···4892" className="input-field" />
      </div>

      <div className="flex items-center justify-between py-2">
        <Label className="text-[#94a3b8]">Auto-Pay Enabled?</Label>
        <Switch checked={form.is_auto_pay} onCheckedChange={v => update('is_auto_pay', v)} data-testid="bill-autopay-switch" />
      </div>

      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Account Number (last 4)</Label>
        <Input value={form.account_number_masked} onChange={e => update('account_number_masked', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4892" maxLength={4} className="input-field" />
      </div>

      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Biller Phone</Label>
        <Input type="tel" value={form.biller_phone} onChange={e => update('biller_phone', e.target.value)} placeholder="(800) 555-1234" className="input-field" />
      </div>

      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Biller Website / Portal URL</Label>
        <Input value={form.biller_website} onChange={e => update('biller_website', e.target.value)} placeholder="https://pay.duke-energy.com" className="input-field" />
      </div>

      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Biller Mailing Address</Label>
        <Input value={form.biller_address} onChange={e => update('biller_address', e.target.value)} placeholder="P.O. Box 1234, Charlotte, NC" className="input-field" />
      </div>

      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Reminder Schedule</Label>
        <div className="flex flex-wrap gap-2">
          {REMINDER_OPTIONS.map(day => (
            <button key={day} onClick={() => toggleReminder(day)}
              className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
              style={{
                background: form.reminder_days.includes(day) ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${form.reminder_days.includes(day) ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: form.reminder_days.includes(day) ? '#10b981' : '#525C72',
              }}
              data-testid={`reminder-${day}`}
            >
              {day === 0 ? 'Due Day' : `${day} days`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Priority</Label>
        <Select value={form.priority} onValueChange={v => update('priority', v)}>
          <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="important">Important</SelectItem>
            <SelectItem value="optional">Optional</SelectItem>
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
              {davEntries.map(entry => (
                <SelectItem key={entry.id} value={entry.id}>{entry.account_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Notes / Instructions for Beneficiary</Label>
        <Textarea value={form.notes} onChange={e => update('notes', e.target.value)}
          placeholder="e.g., Call to transfer account after transition. Ask for Dept. of Estate Services."
          className="input-field min-h-[100px]" data-testid="bill-notes-input" />
      </div>

      <Button className="gold-button w-full mt-4" onClick={handleSubmit} disabled={saving} data-testid="save-bill-button">
        {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
        {isEdit ? 'Save Changes' : 'Add Bill'}
      </Button>
    </div>
  );
};

export default BillForm;
