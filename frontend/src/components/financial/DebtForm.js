import React from 'react';
import { Loader2, Plus, Link2, Sparkles } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { useFinancialForm } from '../../hooks/useFinancialForm';
import { PassdownNotes } from './PassdownNotes';
import { VisibilityTimingPills } from './VisibilityTimingPills';

const DebtForm = ({ estateId, debt, categories, categoryLabels, davEntries, beneficiaries: _beneficiaries, onSaved, onAddCategory, getAuthHeaders }) => {
  const {
    form, update, saving, smartLoading, smartCategorize,
    handleSubmit, showNewCat, setShowNewCat, newCatName, setNewCatName,
    handleAddCategory, isEdit,
  } = useFinancialForm({
    entityType: 'financial_debt',
    module: 'debts',
    urlBase: '/financial/debts',
    entityLabel: 'Debt',
    existing: debt,
    estateId,
    getAuthHeaders,
    onSaved,
    onAddCategory,
    buildDefaults: () => ({
      name: '', category: 'other', outstanding_balance: '', original_amount: '',
      interest_rate: '', monthly_payment: '', minimum_payment: '', loan_term_months: '',
      origination_date: '', estimated_payoff_date: '', account_number_masked: '',
      lender_name: '', lender_phone: '', lender_website: '', lender_address: '',
      collateral: '', co_signer: '', has_life_insurance: false, life_insurance_policy: '',
      dav_entry_id: '', priority: 'important',
      notes: '', notes_first_action: '', notes_gotchas: '', notes_who_to_call: '',
      status: 'active', visibility_timing: { pre: false, post: true },
    }),
    validate: (f, { parseMoney }) => {
      const errs = [];
      if (!f.name.trim()) errs.push('Debt Name');
      const bal = parseMoney(f.outstanding_balance);
      if (!String(f.outstanding_balance ?? '').trim()) errs.push('Outstanding Balance');
      else if (!bal.ok) errs.push('Outstanding Balance (must be a number)');
      return errs;
    },
    buildPayload: (f, { parseMoney, parseInteger }) => ({
      ...f,
      outstanding_balance: parseMoney(f.outstanding_balance).value,
      original_amount: parseMoney(f.original_amount).value,
      interest_rate: parseMoney(f.interest_rate).value,
      monthly_payment: parseMoney(f.monthly_payment).value,
      minimum_payment: parseMoney(f.minimum_payment).value,
      loan_term_months: parseInteger(f.loan_term_months).value,
      dav_entry_id: f.dav_entry_id || null,
    }),
    applyAiSuggestion: (s, f, set) => {
      if (s.category && s.category !== 'other') set('category', s.category);
      if (s.biller_phone && !f.lender_phone) set('lender_phone', s.biller_phone);
      if (s.biller_website && !f.lender_website) set('lender_website', s.biller_website);
    },
  });

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
