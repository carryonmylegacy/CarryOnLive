import React from 'react';
import { Loader2, Plus, Link2, Sparkles, Lock } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { useFinancialForm } from '../../hooks/useFinancialForm';
import { PassdownNotes } from './PassdownNotes';
import { VisibilityTimingPills } from './VisibilityTimingPills';

const REMINDER_OPTIONS = [10, 7, 5, 3, 1, 0];

const BillForm = ({ estateId, bill, categories, categoryLabels, davEntries, beneficiaries: _beneficiaries, onSaved, onAddCategory, getAuthHeaders }) => {
  const {
    form, update, saving, smartLoading, smartCategorize,
    handleSubmit, showNewCat, setShowNewCat, newCatName, setNewCatName,
    handleAddCategory, isEdit,
  } = useFinancialForm({
    entityType: 'financial_bill',
    module: 'bills',
    urlBase: '/financial/bills',
    entityLabel: 'Bill',
    existing: bill,
    estateId,
    getAuthHeaders,
    onSaved,
    onAddCategory,
    buildDefaults: () => ({
      name: '', category: 'other', amount: '', is_recurring: true, frequency: 'monthly',
      due_day: '', due_date: '', grace_period_days: '', late_fee: '',
      late_fee_amount: '', late_fee_percent: '',
      payment_method: 'manual_online', payment_account: '', is_auto_pay: false,
      account_number_masked: '', biller_phone: '', biller_website: '', biller_address: '',
      reminder_days: [10, 7, 5, 1], priority: 'important', dav_entry_id: '',
      // DAV-credential auto-link fields. Backend strips these out of the
      // bill doc and routes them into a linked Digital Access Vault row.
      dav_login_username: '', dav_login_password: '',
      notes: '', notes_first_action: '', notes_gotchas: '', notes_who_to_call: '',
      status: 'active', visibility_timing: { pre: false, post: true },
    }),
    validate: (f, { parseMoney }) => {
      const errs = [];
      if (!f.name.trim()) errs.push('Bill Name');
      const amt = parseMoney(f.amount);
      if (!String(f.amount ?? '').trim()) errs.push('Amount');
      else if (!amt.ok) errs.push('Amount (must be a number)');
      if (f.is_recurring) {
        if (!String(f.due_day ?? '').trim()) errs.push('Due Day of Month');
        else {
          const d = parseInt(f.due_day, 10);
          if (Number.isNaN(d) || d < 1 || d > 31) errs.push('Due Day of Month (1–31)');
        }
      } else if (!f.due_date) {
        errs.push('Due Date');
      }
      return errs;
    },
    buildPayload: (f, { parseMoney }) => ({
      ...f,
      amount: parseMoney(f.amount).value,
      due_day: f.due_day ? parseInt(f.due_day, 10) : null,
      grace_period_days: f.grace_period_days ? parseInt(f.grace_period_days, 10) : null,
      late_fee_amount: parseMoney(f.late_fee_amount).value,
      late_fee_percent: parseMoney(f.late_fee_percent).value,
      // Clear legacy free-form string when the user has populated the
      // structured fields, so we don't ship contradicting data.
      late_fee: (f.late_fee_amount || f.late_fee_percent) ? null : (f.late_fee || null),
      dav_entry_id: f.dav_entry_id || null,
    }),
    applyAiSuggestion: (s, f, set) => {
      if (s.category && s.category !== 'other') set('category', s.category);
      if (s.biller_phone && !f.biller_phone) set('biller_phone', s.biller_phone);
      if (s.biller_website && !f.biller_website) set('biller_website', s.biller_website);
      if (s.payment_method) set('payment_method', s.payment_method);
      if (s.is_auto_pay != null) set('is_auto_pay', s.is_auto_pay);
      if (s.frequency) set('frequency', s.frequency);
    },
    migrateExisting: (f) => {
      // Parse legacy free-form `late_fee` strings ("$25", "5%", "$25 + 5%")
      // into the new structured fields when the user opens an old bill.
      // We only auto-fill blanks — never overwrite explicit numeric input.
      if (f.late_fee && typeof f.late_fee === 'string') {
        const dollarMatch = f.late_fee.match(/\$?\s*([0-9]+(?:\.[0-9]+)?)/);
        const percentMatch = f.late_fee.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
        if (dollarMatch && (f.late_fee_amount === '' || f.late_fee_amount == null)) {
          // The dollar capture also matches a leading number in "5%", so
          // only adopt it if the original string actually contained a $
          // OR there's no % token at all.
          if (f.late_fee.includes('$') || !percentMatch) {
            f.late_fee_amount = parseFloat(dollarMatch[1]);
          }
        }
        if (percentMatch && (f.late_fee_percent === '' || f.late_fee_percent == null)) {
          f.late_fee_percent = parseFloat(percentMatch[1]);
        }
      }
      return f;
    },
  });

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
      <VisibilityTimingPills
        timing={form.visibility_timing}
        onChange={(t) => update('visibility_timing', t)}
        recordKind="bill"
      />
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
          <Label className="text-[#94a3b8]">Amount ($) <span className="text-red-400">*</span></Label>
          <Input type="text" inputMode="decimal" value={form.amount} onChange={e => update('amount', e.target.value)} placeholder="142.50" className="input-field" data-testid="bill-amount-input" />
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
            <Label className="text-[#94a3b8]">Due Day of Month <span className="text-red-400">*</span></Label>
            <Input type="text" inputMode="numeric" value={form.due_day} onChange={e => update('due_day', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="15" className="input-field" data-testid="bill-due-day-input" />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Due Date <span className="text-red-400">*</span></Label>
          <Input type="date" value={form.due_date} onChange={e => update('due_date', e.target.value)} className="input-field" data-testid="bill-due-date-input" />
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Grace Period (days)</Label>
          <Input type="text" inputMode="numeric" value={form.grace_period_days} onChange={e => update('grace_period_days', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="5" className="input-field" />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Late Fee ($)</Label>
          <Input
            type="text"
            inputMode="decimal"
            value={form.late_fee_amount ?? ''}
            onChange={e => update('late_fee_amount', e.target.value)}
            placeholder="25"
            className="input-field"
            data-testid="bill-late-fee-amount-input"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Late Fee (%)</Label>
          <Input
            type="text"
            inputMode="decimal"
            value={form.late_fee_percent ?? ''}
            onChange={e => update('late_fee_percent', e.target.value)}
            placeholder="5"
            className="input-field"
            data-testid="bill-late-fee-percent-input"
          />
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

      {/*
        DAV auto-link block. Anything entered here is materialised on save
        as a Digital Access Vault row linked to this bill — beneficiaries
        get the credentials in the right place, no manual DAV step.
      */}
      <div className="rounded-xl p-3" style={{ background: 'rgba(var(--gold-rgb), 0.04)', border: '1px solid rgba(var(--gold-rgb), 0.18)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-bold text-[var(--gold)] uppercase tracking-wider">
            Beneficiary login (auto-saved to Digital Access Vault)
          </div>
          {(form.dav_login_username || form.dav_login_password || form.biller_website) && (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)' }}
              data-testid="dav-auto-secured-pill"
            >
              <Lock className="w-3 h-3" style={{ color: '#10b981' }} />
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#10b981' }}>
                Auto-secured
              </span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[#94a3b8] text-xs">Login username / email</Label>
            <Input
              value={form.dav_login_username}
              onChange={e => update('dav_login_username', e.target.value)}
              placeholder="user@example.com"
              autoComplete="off"
              className="input-field text-sm"
              data-testid="bill-dav-username-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#94a3b8] text-xs">Login password</Label>
            <Input
              type="password"
              value={form.dav_login_password}
              onChange={e => update('dav_login_password', e.target.value)}
              placeholder="•••••••••"
              autoComplete="new-password"
              className="input-field text-sm"
              data-testid="bill-dav-password-input"
            />
          </div>
        </div>
        <p className="text-[11px] text-[var(--t4)] mt-2 leading-snug">
          Password is encrypted at rest and only ever shown to you. On save,
          a linked DAV credential row is created/updated using the biller
          website above.
        </p>
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

      <PassdownNotes form={form} update={update} />

      <Button className="gold-button w-full mt-4" onClick={handleSubmit} disabled={saving} data-testid="save-bill-button">
        {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
        {isEdit ? 'Save Changes' : 'Add Bill'}
      </Button>
    </div>
  );
};

export default BillForm;
