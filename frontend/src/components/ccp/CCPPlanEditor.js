import React, { useState } from 'react';
import {
  Plus,
  X,
  Loader2,
  ArrowLeft,
  Check,
  ChevronDown,
  FolderLock,
  Heart,
  KeyRound,
} from 'lucide-react';
import AddressAutocomplete from '../AddressAutocomplete';

/**
 * ResourceLinker — collapsible multi-select for linking SDV/FFN/DAV resources to a CCP plan.
 */
function ResourceLinker({ label, icon: Icon, color, available, idField, nameField, subtitleField, selected, onChange }) {
  const [open, setOpen] = useState(false);
  if (!available || available.length === 0) return null;
  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-semibold py-2" style={{ color }} data-testid={`ccp-link-${label.split(' ')[1]?.toLowerCase() || 'res'}`}>
        <Icon className="w-4 h-4" />
        {label} ({selected.length}/{available.length})
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-1 mb-3">
          {available.map(item => {
            const id = item[idField];
            const isSelected = selected.includes(id);
            return (
              <button key={id} onClick={() => toggle(id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all"
                style={{ background: isSelected ? `${color}15` : 'var(--s)', border: `1px solid ${isSelected ? `${color}40` : 'var(--b)'}` }}>
                <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: isSelected ? color : 'var(--s)' }}>
                  {isSelected && <Check className="w-3 h-3" style={{ color: '#080e1a' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--t)' }}>{item[nameField]}</div>
                  {subtitleField && item[subtitleField] && <div className="text-xs" style={{ color: 'var(--t4)' }}>{item[subtitleField]}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * CCPPlanEditor — the plan creation/editing form view for CCP.
 * Extracted from ConnectedProtocolPage.js for maintainability.
 */
export default function CCPPlanEditor({
  editPlan,
  setEditPlan,
  setView,
  savePlan,
  submitting,
  PLAN_TYPE_LABELS,
  estateMembers,
  availableResources,
}) {
  return (
    <div data-testid="ccp-plan-edit" className="w-full max-w-[1400px] mx-auto px-4 lg:px-6 py-6 pb-28 sm:pb-6 space-y-4" style={{ overflowX: 'hidden' }}>
      <button onClick={() => { setEditPlan(null); setView('plans'); }} className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--t4)' }}>
        <ArrowLeft className="w-4 h-4" />Back to Plans
      </button>
      <h2 className="text-lg font-bold" style={{ color: 'var(--t)' }}>{editPlan.id ? 'Edit Plan' : 'New Contingency Protocol'}</h2>

      {/* Plan Name */}
      <div>
        <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Plan Name</label>
        <input value={editPlan.name || ''} onChange={(e) => setEditPlan({ ...editPlan, name: e.target.value })}
          placeholder="e.g., Hurricane Evacuation Plan" className="w-full rounded-xl px-3 py-3 text-base"
          data-testid="ccp-plan-name" style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
      </div>

      {/* Plan Type */}
      <div>
        <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Plan Type</label>
        <select value={editPlan.plan_type || 'custom'} onChange={(e) => setEditPlan({ ...editPlan, plan_type: e.target.value })}
          className="w-full rounded-xl px-3 py-3 text-base" data-testid="ccp-plan-type"
          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }}>
          {Object.entries(PLAN_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Rendezvous Points */}
      <div>
        <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Rendezvous Points</label>
        {(editPlan.rendezvous_points || []).map((rp, i) => (
          <div key={i} className="mb-3 rounded-xl p-3" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <div className="flex gap-2 mb-2">
              <input value={rp.name || ''} onChange={(e) => { const arr = [...(editPlan.rendezvous_points || [])]; arr[i] = { ...arr[i], name: e.target.value }; setEditPlan({ ...editPlan, rendezvous_points: arr }); }}
                placeholder="Name" className="flex-1 rounded-xl px-3 py-2.5 text-base"
                data-testid={`ccp-rendezvous-name-${i}`}
                style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
              <button onClick={() => { const arr = (editPlan.rendezvous_points || []).filter((_, j) => j !== i); setEditPlan({ ...editPlan, rendezvous_points: arr }); }}
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(240,82,82,0.1)' }}>
                <X className="w-4 h-4" style={{ color: '#F05252' }} />
              </button>
            </div>
            <AddressAutocomplete value={rp.address || ''} onChange={(e) => { const arr = [...(editPlan.rendezvous_points || [])]; arr[i] = { ...arr[i], address: e.target.value }; setEditPlan({ ...editPlan, rendezvous_points: arr }); }}
              onSelect={({ street, city, state, zip }) => { const full = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', '); const arr = [...(editPlan.rendezvous_points || [])]; arr[i] = { ...arr[i], address: full }; setEditPlan({ ...editPlan, rendezvous_points: arr }); }}
              placeholder="Address" className="w-full rounded-xl px-3 py-2.5 text-base"
              data-testid={`ccp-rendezvous-address-${i}`}
              style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
          </div>
        ))}
        <button onClick={() => setEditPlan({ ...editPlan, rendezvous_points: [...(editPlan.rendezvous_points || []), { name: '', address: '', notes: '' }] })}
          className="text-sm font-semibold flex items-center gap-1 py-2" data-testid="ccp-add-rendezvous" style={{ color: '#3B7BF7' }}>
          <Plus className="w-4 h-4" />Add Rendezvous Point
        </button>
      </div>

      {/* Communication Plan */}
      <div>
        <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Communication Plan</label>
        <textarea value={editPlan.communication_plan || ''} onChange={(e) => setEditPlan({ ...editPlan, communication_plan: e.target.value })}
          placeholder="e.g., Text first, then call home phone, then radio channel 14"
          rows={3} className="w-full rounded-xl px-3 py-3 text-base resize-none"
          data-testid="ccp-comm-plan"
          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
      </div>

      {/* Resource Locations */}
      <div>
        <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Resource / Supply Locations</label>
        {(editPlan.resource_locations || []).map((rl, i) => (
          <div key={i} className="mb-3 rounded-xl p-3" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <div className="flex gap-2 mb-2">
              <input value={rl.name || ''} onChange={(e) => { const arr = [...(editPlan.resource_locations || [])]; arr[i] = { ...arr[i], name: e.target.value }; setEditPlan({ ...editPlan, resource_locations: arr }); }}
                placeholder="Name / What" className="flex-1 rounded-xl px-3 py-2.5 text-base"
                data-testid={`ccp-resource-name-${i}`}
                style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
              <button onClick={() => { const arr = (editPlan.resource_locations || []).filter((_, j) => j !== i); setEditPlan({ ...editPlan, resource_locations: arr }); }}
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(240,82,82,0.1)' }}>
                <X className="w-4 h-4" style={{ color: '#F05252' }} />
              </button>
            </div>
            <AddressAutocomplete value={rl.location || ''} onChange={(e) => { const arr = [...(editPlan.resource_locations || [])]; arr[i] = { ...arr[i], location: e.target.value }; setEditPlan({ ...editPlan, resource_locations: arr }); }}
              onSelect={({ street, city, state, zip }) => { const full = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', '); const arr = [...(editPlan.resource_locations || [])]; arr[i] = { ...arr[i], location: full }; setEditPlan({ ...editPlan, resource_locations: arr }); }}
              placeholder="Address" className="w-full rounded-xl px-3 py-2.5 text-base"
              data-testid={`ccp-resource-address-${i}`}
              style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
          </div>
        ))}
        <button onClick={() => setEditPlan({ ...editPlan, resource_locations: [...(editPlan.resource_locations || []), { name: '', location: '', notes: '' }] })}
          className="text-sm font-semibold flex items-center gap-1 py-2" data-testid="ccp-add-resource" style={{ color: '#3B7BF7' }}>
          <Plus className="w-4 h-4" />Add Resource Location
        </button>
      </div>

      {/* Instructions */}
      <div>
        <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--t4)' }}>Instructions</label>
        <textarea value={editPlan.instructions || ''} onChange={(e) => setEditPlan({ ...editPlan, instructions: e.target.value })}
          placeholder="Step-by-step instructions for family members"
          rows={4} className="w-full rounded-xl px-3 py-3 text-base resize-none"
          data-testid="ccp-instructions"
          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }} />
      </div>

      {/* Assign to Beneficiaries */}
      {estateMembers.filter(m => m.role_in_estate === 'beneficiary').length > 0 && (
        <div>
          <label className="text-xs font-bold mb-2 block" style={{ color: 'var(--t4)' }}>Assign to Beneficiaries</label>
          <p className="text-xs mb-3" style={{ color: 'var(--t5)' }}>Choose which beneficiaries this plan applies to. All are selected by default.</p>
          <div className="space-y-2">
            {estateMembers.filter(m => m.role_in_estate === 'beneficiary').map(member => {
              const assignedIds = editPlan.assigned_beneficiary_ids;
              const isSelected = assignedIds === null || assignedIds === undefined || assignedIds.includes(member.id);
              return (
                <button
                  key={member.id}
                  onClick={() => {
                    const beneficiaryIds = estateMembers.filter(m => m.role_in_estate === 'beneficiary').map(m => m.id);
                    let current = editPlan.assigned_beneficiary_ids;
                    if (current === null || current === undefined) {
                      current = beneficiaryIds.filter(id => id !== member.id);
                    } else if (current.includes(member.id)) {
                      const next = current.filter(id => id !== member.id);
                      current = next.length > 0 ? next : current;
                    } else {
                      current = [...current, member.id];
                      if (current.length === beneficiaryIds.length) current = null;
                    }
                    setEditPlan({ ...editPlan, assigned_beneficiary_ids: current });
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl transition-all"
                  data-testid={`ccp-assign-beneficiary-${member.id}`}
                  style={{
                    background: isSelected ? 'rgba(59,123,247,0.08)' : 'var(--s)',
                    border: `1px solid ${isSelected ? 'rgba(59,123,247,0.25)' : 'var(--b)'}`,
                  }}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: isSelected ? 'rgba(59,123,247,0.15)' : 'var(--s)', color: isSelected ? '#3B7BF7' : 'var(--t5)' }}>
                    {member.photo_url ? (
                      <img src={member.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      (member.name || '?').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-semibold" style={{ color: isSelected ? 'var(--t)' : 'var(--t4)' }}>{member.name || 'Unknown'}</div>
                    {member.relation && <div className="text-xs" style={{ color: 'var(--t5)' }}>{member.relation}</div>}
                  </div>
                  <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{
                    background: isSelected ? '#3B7BF7' : 'var(--s)',
                    border: `2px solid ${isSelected ? '#3B7BF7' : 'var(--b)'}`,
                  }}>
                    {isSelected && <Check className="w-3.5 h-3.5" style={{ color: '#fff' }} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Link Resources */}
      <ResourceLinker
        label="Link Documents (SDV)" icon={FolderLock} color="#3B7BF7"
        available={availableResources.documents} idField="id" nameField="name" subtitleField="category"
        selected={editPlan.linked_document_ids || []}
        onChange={(ids) => setEditPlan({ ...editPlan, linked_document_ids: ids })}
      />
      <ResourceLinker
        label="Link Contacts (FFN)" icon={Heart} color="#22C993"
        available={availableResources.ffn_contacts} idField="id" nameField="name" subtitleField="relationship"
        selected={editPlan.linked_ffn_contact_ids || []}
        onChange={(ids) => setEditPlan({ ...editPlan, linked_ffn_contact_ids: ids })}
      />
      <ResourceLinker
        label="Link Credentials (DAV)" icon={KeyRound} color="#B794F6"
        available={availableResources.dav_entries} idField="id" nameField="account_name" subtitleField="category"
        selected={editPlan.linked_dav_entry_ids || []}
        onChange={(ids) => setEditPlan({ ...editPlan, linked_dav_entry_ids: ids })}
      />

      {/* Save */}
      <button onClick={savePlan} disabled={submitting || !editPlan.name?.trim()}
        className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97]"
        data-testid="ccp-save-plan"
        style={{ background: editPlan.name?.trim() ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'var(--s)', color: editPlan.name?.trim() ? '#080e1a' : 'var(--t5)' }}>
        {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Save Plan'}
      </button>
    </div>
  );
}
