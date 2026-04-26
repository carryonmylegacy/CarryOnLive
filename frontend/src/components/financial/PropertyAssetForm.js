import React from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useFinancialForm } from '../../hooks/useFinancialForm';
import { PassdownNotes } from './PassdownNotes';
import { VisibilityTimingPills } from './VisibilityTimingPills';

const CATEGORIES = [
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'jewelry', label: 'Jewelry' },
  { value: 'artwork', label: 'Artwork' },
  { value: 'collectible', label: 'Collectible' },
  { value: 'business_entity', label: 'Business Entity' },
  { value: 'other', label: 'Other' },
];

const ENTITY_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'llc', label: 'LLC' },
  { value: 'corporation', label: 'Corporation' },
  { value: 's_corp', label: 'S-Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'sole_prop', label: 'Sole Proprietorship' },
  { value: 'trust', label: 'Trust' },
];

const OWNERSHIP_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'joint', label: 'Joint' },
  { value: 'trust', label: 'Trust' },
  { value: 'community_property', label: 'Community Property' },
  { value: 'llc_owned', label: 'LLC-Owned' },
  { value: 'corporate', label: 'Corporate' },
];

const PropertyAssetForm = ({ estateId, asset, davEntries, onSaved, getAuthHeaders }) => {
  const {
    form, update, saving, handleSubmit, isEdit,
  } = useFinancialForm({
    entityType: 'financial_property',
    module: 'property',
    urlBase: '/financial/property',
    entityLabel: 'Asset',
    existing: asset,
    estateId,
    getAuthHeaders,
    onSaved,
    // PropertyAssetForm has no custom-category creation flow — pass a
    // no-op so the hook's handleAddCategory just resolves false.
    onAddCategory: async () => false,
    buildDefaults: () => ({
      name: '', category: 'real_estate', estimated_value: '', value_last_updated: '',
      location_address: '', acquisition_date: '', ownership_type: 'individual',
      joint_owner: '', entity_type: 'none', entity_state: '', entity_ein: '',
      appraised_by: '', appraisal_date: '', insurance_policy: '', serial_or_vin: '',
      description: '', dav_entry_id: '', priority: 'important',
      notes: '', notes_first_action: '', notes_gotchas: '', notes_who_to_call: '',
      status: 'active', visibility_timing: { pre: false, post: true },
    }),
    validate: (f, { parseMoney }) => {
      const errs = [];
      if (!f.name.trim()) errs.push('Asset Name');
      const val = parseMoney(f.estimated_value);
      if (!String(f.estimated_value ?? '').trim()) errs.push('Estimated Value');
      else if (!val.ok) errs.push('Estimated Value (must be a number)');
      return errs;
    },
    buildPayload: (f, { parseMoney }) => ({
      ...f,
      estimated_value: parseMoney(f.estimated_value).value,
      dav_entry_id: f.dav_entry_id || null,
      entity_type: f.entity_type && f.entity_type !== 'none' ? f.entity_type : null,
      entity_state: f.entity_state || null,
      entity_ein: f.entity_ein || null,
    }),
    applyAiSuggestion: () => { /* no AI auto-fill for property/assets */ },
  });
  const isBusiness = form.category === 'business_entity';

  return (
    <div className="space-y-4 py-4">
      <VisibilityTimingPills
        timing={form.visibility_timing}
        onChange={(t) => update('visibility_timing', t)}
        recordKind="asset"
      />
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Asset Name <span className="text-red-400">*</span></Label>
        <Input value={form.name} onChange={e => update('name', e.target.value)}
          placeholder={isBusiness ? 'e.g., Smith Holdings LLC' : 'e.g., Primary Residence'} className="input-field" data-testid="property-name-input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Category</Label>
          <Select value={form.category} onValueChange={v => update('category', v)}>
            <SelectTrigger className="input-field" data-testid="property-category-select"><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Estimated Value <span className="text-red-400">*</span></Label>
          <Input type="text" inputMode="decimal" value={form.estimated_value} onChange={e => update('estimated_value', e.target.value)}
            placeholder="0.00" className="input-field" data-testid="property-value-input" />
        </div>
      </div>

      {/* Location / Address */}
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">{isBusiness ? 'Business Address' : 'Location / Address'}</Label>
        <Input value={form.location_address} onChange={e => update('location_address', e.target.value)}
          placeholder={isBusiness ? 'e.g., 123 Main St, Suite 200' : 'e.g., 123 Oak Lane, Austin, TX'} className="input-field" />
      </div>

      {/* Ownership */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Ownership Type</Label>
          <Select value={form.ownership_type} onValueChange={v => update('ownership_type', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>{OWNERSHIP_TYPES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {(form.ownership_type === 'joint' || form.ownership_type === 'community_property') && (
          <div className="space-y-2">
            <Label className="text-[#94a3b8]">Joint Owner</Label>
            <Input value={form.joint_owner} onChange={e => update('joint_owner', e.target.value)} placeholder="Co-owner name" className="input-field" />
          </div>
        )}
      </div>

      {/* Business Entity Fields */}
      {isBusiness && (
        <div className="rounded-xl p-3 space-y-3" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
          <div className="text-xs font-bold text-[#10b981] uppercase tracking-wider">Business Entity Details</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Entity Type</Label>
              <Select value={form.entity_type} onValueChange={v => update('entity_type', v)}>
                <SelectTrigger className="input-field" data-testid="property-entity-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{ENTITY_TYPES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">State of Formation</Label>
              <Input value={form.entity_state} onChange={e => update('entity_state', e.target.value)} placeholder="e.g., Delaware" className="input-field" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[#94a3b8]">EIN (last 4 digits)</Label>
            <Input value={form.entity_ein} onChange={e => update('entity_ein', e.target.value.slice(0, 4))} placeholder="XXXX" maxLength={4} className="input-field" />
          </div>
        </div>
      )}

      {/* Vehicle / Collectible specific */}
      {(form.category === 'vehicle' || form.category === 'collectible' || form.category === 'jewelry' || form.category === 'artwork') && (
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">{form.category === 'vehicle' ? 'VIN' : 'Serial / ID Number'}</Label>
          <Input value={form.serial_or_vin} onChange={e => update('serial_or_vin', e.target.value)} placeholder={form.category === 'vehicle' ? 'Vehicle Identification Number' : 'Serial or identification number'} className="input-field" />
        </div>
      )}

      {/* Appraisal */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Appraised By</Label>
          <Input value={form.appraised_by} onChange={e => update('appraised_by', e.target.value)} placeholder="Appraiser / firm name" className="input-field" />
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Appraisal Date</Label>
          <Input type="date" value={form.appraisal_date} onChange={e => update('appraisal_date', e.target.value)} className="input-field" />
        </div>
      </div>

      {/* Insurance */}
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Insurance Policy</Label>
        <Input value={form.insurance_policy} onChange={e => update('insurance_policy', e.target.value)} placeholder="Policy number or carrier" className="input-field" />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label className="text-[#94a3b8]">Description</Label>
        <Textarea value={form.description} onChange={e => update('description', e.target.value)}
          placeholder="Detailed description of the asset" className="input-field min-h-[60px]" />
      </div>

      {/* DAV Link */}
      {davEntries && davEntries.length > 0 && (
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Link to Digital Access Vault</Label>
          <Select value={form.dav_entry_id} onValueChange={v => update('dav_entry_id', v === 'none' ? '' : v)}>
            <SelectTrigger className="input-field"><SelectValue placeholder="Link a DAV entry" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Link</SelectItem>
              {davEntries.map(d => <SelectItem key={d.id} value={d.id}>{d.account_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Priority</Label>
          <Select value={form.priority} onValueChange={v => update('priority', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="important">Important</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-[#94a3b8]">Status</Label>
          <Select value={form.status} onValueChange={v => update('status', v)}>
            <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="sold">Sold</SelectItem>
              <SelectItem value="transferred">Transferred</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Pass-down notes — three structured prompts (replaces single
          "Notes for Beneficiaries" textarea). */}
      <PassdownNotes form={form} update={update} />

      <Button onClick={handleSubmit} disabled={saving || !form.name.trim()} className="w-full gold-btn" data-testid="save-property-btn">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        {isEdit ? 'Update Asset' : 'Add Asset'}
      </Button>
    </div>
  );
};

export default PropertyAssetForm;
