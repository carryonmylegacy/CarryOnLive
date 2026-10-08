import React from 'react';
import { Receipt, CreditCard, Landmark, Home, Plus } from 'lucide-react';
import { rowStyle, inp, Head, Remove, HeardSummary, Field, ExistingBadge, chg, touch, CHANGED } from '../../ai/reviewPrimitives';

const opts = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));
const FREQ = opts({ monthly: 'Monthly', quarterly: 'Quarterly', semi_annual: 'Semi-annual', annual: 'Annual', custom: 'Custom', one_time: 'One-time' });
const PAY = opts({ auto_pay: 'Auto-pay', manual_online: 'Pay online', check: 'Check', phone: 'Phone', in_person: 'In person' });
const BILL_PRI = opts({ critical: 'Critical', important: 'Important', optional: 'Optional' });
const TIER_PRI = opts({ critical: 'Critical', important: 'Important', low: 'Low' });
const ACCT_OWN = opts({ individual: 'Individual', joint_jtwros: 'Joint (survivorship)', joint_tic: 'Joint (in common)', trust: 'Trust', pod_tod: 'POD / TOD', community_property: 'Community property' });
const ASSET_OWN = opts({ individual: 'Individual', joint: 'Joint', trust: 'Trust', community_property: 'Community property', llc_owned: 'LLC-owned', corporate: 'Corporate' });
const ASSET_CAT = opts({ real_estate: 'Real estate', vehicle: 'Vehicle', jewelry: 'Jewelry', artwork: 'Artwork', collectible: 'Collectible', business_entity: 'Business entity', other: 'Other' });

const BLANK = {
  bills: { existing_id: null, changes: [], name: '', category: 'other', amount: null, frequency: 'monthly', due_day: null, is_auto_pay: false, payment_method: 'manual_online', priority: 'important', biller_phone: null, notes: null },
  debts: { existing_id: null, changes: [], name: '', category: 'other', lender_name: null, outstanding_balance: null, monthly_payment: null, interest_rate: null, co_signer: null, priority: 'important', notes: null },
  accounts: { existing_id: null, changes: [], name: '', category: 'checking', institution_name: null, approximate_balance: null, ownership_type: 'individual', joint_owner: null, priority: 'important', notes: null },
  property: { existing_id: null, changes: [], name: '', category: 'other', estimated_value: null, location_address: null, ownership_type: 'individual', joint_owner: null, serial_or_vin: null, description: null, notes: null },
};

// One row. Existing rows stay fully editable: the AI's changes ring amber, and any edit you make also becomes part of the update.
const Row = ({ item, i, bucket, onChange, onRemove, children }) => (
  <div className="p-3 rounded-xl space-y-2" style={rowStyle} data-testid={`cfp-ai-${bucket}-${i}`}>
    <div className="flex items-center gap-2">
      <input className={`${inp} flex-1 font-semibold ${chg(item, 'name') ? CHANGED : ''}`} value={item.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Name" data-testid={`cfp-ai-${bucket}-name-${i}`} />
      {item.existing_id && <ExistingBadge changes={item.changes} testId={`cfp-ai-${bucket}-badge-${i}`} />}
      <Remove onClick={onRemove} testId={`cfp-ai-${bucket}-remove-${i}`} />
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{children}</div>
    <input className={`${inp} w-full ${chg(item, 'notes') ? CHANGED : ''}`} value={item.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || null })} placeholder="Notes (optional)" data-testid={`cfp-ai-${bucket}-notes-${i}`} />
  </div>
);

const AddRow = ({ onClick, label, testId }) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold)] hover:underline mt-1" data-testid={testId}><Plus className="w-3.5 h-3.5" /> {label}</button>
);

// Editable "Here's what I heard" for bills / debts / accounts / property. Every edit flows back via onChange.
export const CFPAIReview = ({ draft, onChange, catalog }) => {
  const upd = (key, i, patch) => onChange({ ...draft, [key]: draft[key].map((x, idx) => (idx === i ? touch(x, patch) : x)) });
  const del = (key, i) => onChange({ ...draft, [key]: draft[key].filter((_, idx) => idx !== i) });
  const add = (key) => onChange({ ...draft, [key]: [...draft[key], { ...BLANK[key] }] });
  const billCats = opts(catalog.bill_categories), debtCats = opts(catalog.debt_categories), acctCats = opts(catalog.account_categories);

  return (
    <div data-testid="cfp-ai-review">
      <HeardSummary summary={draft.summary} questions={draft.questions} idPrefix="cfp-ai" />

      <Head icon={Receipt} testId="cfp-ai-bills-head">Bills ({draft.bills.length})</Head>
      <div className="space-y-2">
        {draft.bills.map((b, i) => (
          <Row key={i} item={b} i={i} bucket="bills" onChange={(p) => upd('bills', i, p)} onRemove={() => del('bills', i)}>
            <Field label="Category" type="select" options={billCats} value={b.category} onChange={(v) => upd('bills', i, { category: v })} testId={`cfp-ai-bills-category-${i}`} changed={chg(b, 'category')} />
            <Field label="Amount $" type="number" step="0.01" value={b.amount} onChange={(v) => upd('bills', i, { amount: v })} testId={`cfp-ai-bills-amount-${i}`} changed={chg(b, 'amount')} />
            <Field label="Frequency" type="select" options={FREQ} value={b.frequency} onChange={(v) => upd('bills', i, { frequency: v })} testId={`cfp-ai-bills-frequency-${i}`} changed={chg(b, 'frequency')} />
            <Field label="Due day" type="number" value={b.due_day} onChange={(v) => upd('bills', i, { due_day: v })} placeholder="1–31" testId={`cfp-ai-bills-dueday-${i}`} changed={chg(b, 'due_day')} />
            <Field label="Paid by" type="select" options={PAY} value={b.payment_method} onChange={(v) => upd('bills', i, { payment_method: v, is_auto_pay: v === 'auto_pay' })} testId={`cfp-ai-bills-pay-${i}`} changed={chg(b, 'payment_method')} />
            <Field label="Priority" type="select" options={BILL_PRI} value={b.priority} onChange={(v) => upd('bills', i, { priority: v })} testId={`cfp-ai-bills-priority-${i}`} changed={chg(b, 'priority')} />
            <Field label="Biller phone" value={b.biller_phone} onChange={(v) => upd('bills', i, { biller_phone: v || null })} className="col-span-2" testId={`cfp-ai-bills-phone-${i}`} changed={chg(b, 'biller_phone')} />
          </Row>
        ))}
      </div>
      <AddRow onClick={() => add('bills')} label="Add a bill" testId="cfp-ai-add-bill" />

      <Head icon={CreditCard} testId="cfp-ai-debts-head">Debts ({draft.debts.length})</Head>
      <div className="space-y-2">
        {draft.debts.map((d, i) => (
          <Row key={i} item={d} i={i} bucket="debts" onChange={(p) => upd('debts', i, p)} onRemove={() => del('debts', i)}>
            <Field label="Category" type="select" options={debtCats} value={d.category} onChange={(v) => upd('debts', i, { category: v })} testId={`cfp-ai-debts-category-${i}`} changed={chg(d, 'category')} />
            <Field label="Lender" value={d.lender_name} onChange={(v) => upd('debts', i, { lender_name: v || null })} testId={`cfp-ai-debts-lender-${i}`} changed={chg(d, 'lender_name')} />
            <Field label="Balance $" type="number" step="0.01" value={d.outstanding_balance} onChange={(v) => upd('debts', i, { outstanding_balance: v })} testId={`cfp-ai-debts-balance-${i}`} changed={chg(d, 'outstanding_balance')} />
            <Field label="Payment $/mo" type="number" step="0.01" value={d.monthly_payment} onChange={(v) => upd('debts', i, { monthly_payment: v })} testId={`cfp-ai-debts-payment-${i}`} changed={chg(d, 'monthly_payment')} />
            <Field label="Rate %" type="number" step="0.01" value={d.interest_rate} onChange={(v) => upd('debts', i, { interest_rate: v })} testId={`cfp-ai-debts-rate-${i}`} changed={chg(d, 'interest_rate')} />
            <Field label="Co-signer" value={d.co_signer} onChange={(v) => upd('debts', i, { co_signer: v || null })} testId={`cfp-ai-debts-cosigner-${i}`} changed={chg(d, 'co_signer')} />
            <Field label="Priority" type="select" options={TIER_PRI} value={d.priority} onChange={(v) => upd('debts', i, { priority: v })} testId={`cfp-ai-debts-priority-${i}`} changed={chg(d, 'priority')} />
          </Row>
        ))}
      </div>
      <AddRow onClick={() => add('debts')} label="Add a debt" testId="cfp-ai-add-debt" />

      <Head icon={Landmark} testId="cfp-ai-accounts-head">Accounts ({draft.accounts.length})</Head>
      <div className="space-y-2">
        {draft.accounts.map((a, i) => (
          <Row key={i} item={a} i={i} bucket="accounts" onChange={(p) => upd('accounts', i, p)} onRemove={() => del('accounts', i)}>
            <Field label="Type" type="select" options={acctCats} value={a.category} onChange={(v) => upd('accounts', i, { category: v })} testId={`cfp-ai-accounts-category-${i}`} changed={chg(a, 'category')} />
            <Field label="Institution" value={a.institution_name} onChange={(v) => upd('accounts', i, { institution_name: v || null })} testId={`cfp-ai-accounts-institution-${i}`} changed={chg(a, 'institution_name')} />
            <Field label="Balance $" type="number" step="0.01" value={a.approximate_balance} onChange={(v) => upd('accounts', i, { approximate_balance: v })} testId={`cfp-ai-accounts-balance-${i}`} changed={chg(a, 'approximate_balance')} />
            <Field label="Ownership" type="select" options={ACCT_OWN} value={a.ownership_type} onChange={(v) => upd('accounts', i, { ownership_type: v })} testId={`cfp-ai-accounts-ownership-${i}`} changed={chg(a, 'ownership_type')} />
            {a.ownership_type !== 'individual' && <Field label="Joint owner" value={a.joint_owner} onChange={(v) => upd('accounts', i, { joint_owner: v || null })} testId={`cfp-ai-accounts-joint-${i}`} changed={chg(a, 'joint_owner')} />}
            <Field label="Priority" type="select" options={TIER_PRI} value={a.priority} onChange={(v) => upd('accounts', i, { priority: v })} testId={`cfp-ai-accounts-priority-${i}`} changed={chg(a, 'priority')} />
          </Row>
        ))}
      </div>
      <AddRow onClick={() => add('accounts')} label="Add an account" testId="cfp-ai-add-account" />

      <Head icon={Home} testId="cfp-ai-property-head">Property ({draft.property.length})</Head>
      <div className="space-y-2">
        {draft.property.map((p, i) => (
          <Row key={i} item={p} i={i} bucket="property" onChange={(patch) => upd('property', i, patch)} onRemove={() => del('property', i)}>
            <Field label="Category" type="select" options={ASSET_CAT} value={p.category} onChange={(v) => upd('property', i, { category: v })} testId={`cfp-ai-property-category-${i}`} changed={chg(p, 'category')} />
            <Field label="Value $" type="number" step="0.01" value={p.estimated_value} onChange={(v) => upd('property', i, { estimated_value: v })} testId={`cfp-ai-property-value-${i}`} changed={chg(p, 'estimated_value')} />
            <Field label="Ownership" type="select" options={ASSET_OWN} value={p.ownership_type} onChange={(v) => upd('property', i, { ownership_type: v })} testId={`cfp-ai-property-ownership-${i}`} changed={chg(p, 'ownership_type')} />
            {['joint', 'community_property'].includes(p.ownership_type) && <Field label="Joint owner" value={p.joint_owner} onChange={(v) => upd('property', i, { joint_owner: v || null })} testId={`cfp-ai-property-joint-${i}`} changed={chg(p, 'joint_owner')} />}
            <Field label="Address / location" value={p.location_address} onChange={(v) => upd('property', i, { location_address: v || null })} className="col-span-2" testId={`cfp-ai-property-address-${i}`} changed={chg(p, 'location_address')} />
            <Field label="VIN / serial" value={p.serial_or_vin} onChange={(v) => upd('property', i, { serial_or_vin: v || null })} testId={`cfp-ai-property-vin-${i}`} changed={chg(p, 'serial_or_vin')} />
          </Row>
        ))}
      </div>
      <AddRow onClick={() => add('property')} label="Add property" testId="cfp-ai-add-property" />
    </div>
  );
};

export default CFPAIReview;
