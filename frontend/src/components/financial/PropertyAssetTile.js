import React, { useState } from 'react';
import { Edit2, Trash2, Users, ChevronDown, ChevronUp, Home, Car, Gem, Palette, Building2, Package } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { computePassdownScore, passdownColor, passdownLabel } from '../../utils/passdownScore';
import { DavSyncedPill } from './DavSyncedPill';

const CATEGORY_ICONS = {
  real_estate: Home,
  vehicle: Car,
  jewelry: Gem,
  artwork: Palette,
  business_entity: Building2,
  collectible: Package,
  other: Package,
};

const CATEGORY_LABELS = {
  real_estate: 'Real Estate',
  vehicle: 'Vehicle',
  jewelry: 'Jewelry',
  artwork: 'Artwork',
  collectible: 'Collectible',
  business_entity: 'Business Entity',
  other: 'Other',
};

const ENTITY_LABELS = {
  llc: 'LLC',
  corporation: 'Corporation',
  s_corp: 'S-Corp',
  partnership: 'Partnership',
  sole_prop: 'Sole Proprietorship',
  trust: 'Trust',
};

const PropertyAssetTile = ({ asset, beneficiaries, onEdit, onDelete, onDesignationUpdate, highlightId }) => {
  const [expanded, setExpanded] = useState(false);
  const CatIcon = CATEGORY_ICONS[asset.category] || Package;
  const catLabel = CATEGORY_LABELS[asset.category] || asset.category;
  const designated = asset.designated_beneficiaries || ['all'];
  const benCount = designated.includes('all') ? beneficiaries.length : designated.length;
  const statusColors = { active: '#10b981', sold: '#64748b', transferred: '#f59e0b', pending: '#3b82f6' };

  const toggleBeneficiary = (benId) => {
    let newDesignated = [...(asset.designated_beneficiaries || ['all'])];
    let newTiming = { ...(asset.visibility_timing || {}) };
    if (newDesignated.includes('all')) {
      newDesignated = beneficiaries.map(b => b.id).filter(id => id !== benId);
      beneficiaries.forEach(b => { if (!newTiming[b.id]) newTiming[b.id] = { pre: false, post: true }; });
    } else if (newDesignated.includes(benId)) {
      newDesignated = newDesignated.filter(id => id !== benId);
    } else {
      newDesignated.push(benId);
    }
    if (newDesignated.length === beneficiaries.length) newDesignated = ['all'];
    if (newDesignated.length === 0) newDesignated = ['all'];
    onDesignationUpdate(asset.id, newDesignated, newTiming);
  };

  const toggleTiming = (benId, phase) => {
    const timing = { ...(asset.visibility_timing || {}) };
    const current = timing[benId] || { pre: false, post: true };
    timing[benId] = { ...current, [phase]: !current[phase] };
    onDesignationUpdate(asset.id, asset.designated_beneficiaries || ['all'], timing);
  };

  return (
    <Card
      className="glass-card relative overflow-hidden group transition-all duration-500"
      data-testid={`property-tile-${asset.id}`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '120px', ...(asset.id === highlightId ? { boxShadow: '0 0 0 2px var(--gold), 0 0 24px rgba(var(--gold-rgb), 0.45)' } : {}) }}
    >
      <CardContent className="p-4">
        {/* ── Collapsed header — name, value, status, actions ── */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <CatIcon className="w-4 h-4" style={{ color: '#10b981' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[var(--t)] truncate">{asset.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {asset.estimated_value != null && (
                <span className="text-sm font-bold text-[var(--t)]">${asset.estimated_value.toLocaleString()}</span>
              )}
              {asset.status && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{
                  background: `${statusColors[asset.status] || '#64748b'}20`,
                  color: statusColors[asset.status] || '#64748b',
                }}>{asset.status}</span>
              )}
              <DavSyncedPill linked={!!asset.dav_entry_id} davEntryId={asset.dav_entry_id} testId={`property-dav-pill-${asset.id}`} />
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onEdit(asset); }} className="p-1.5 rounded-lg hover:bg-[var(--s)] transition-colors text-[var(--gold)]" data-testid={`edit-property-${asset.id}`} aria-label="Edit property">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }} className="p-1.5 rounded-lg hover:bg-[var(--s)] transition-colors text-[#ef4444]" data-testid={`delete-property-${asset.id}`} aria-label="Delete property">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setExpanded(v => !v)} className="p-1.5 rounded-lg hover:bg-[var(--s)] transition-colors text-[var(--t4)]" data-testid={`expand-property-${asset.id}`} aria-label={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* ── Expanded body ── */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-[var(--b)] space-y-3" data-testid={`property-detail-${asset.id}`}>
            <p className="text-xs text-[var(--t4)]">{catLabel}</p>

            <div className="text-xs space-y-1">
              {asset.location_address && (
                <div><span className="text-[var(--t5)]">Location: </span><span className="text-[var(--t)]">{asset.location_address}</span></div>
              )}
              {asset.entity_type && (
                <div><span className="text-[var(--t5)]">Entity: </span><span className="text-[var(--t)]">{ENTITY_LABELS[asset.entity_type] || asset.entity_type}</span></div>
              )}
              {asset.entity_state && (
                <div><span className="text-[var(--t5)]">State: </span><span className="text-[var(--t)]">{asset.entity_state}</span></div>
              )}
              {asset.ownership_type && asset.ownership_type !== 'individual' && (
                <div><span className="text-[var(--t5)]">Ownership: </span><span className="text-[var(--t)]">{asset.ownership_type.replace(/_/g, ' ')}</span></div>
              )}
              {asset.joint_owner && (
                <div><span className="text-[var(--t5)]">Joint w/: </span><span className="text-[var(--t)]">{asset.joint_owner}</span></div>
              )}
              {asset.serial_or_vin && (
                <div><span className="text-[var(--t5)]">ID/VIN: </span><span className="text-[var(--t)]">{asset.serial_or_vin}</span></div>
              )}
              {asset.description && (
                <div><span className="text-[var(--t5)]">Description: </span><span className="text-[var(--t)]">{asset.description}</span></div>
              )}
              {asset.notes && (
                <div className="pt-1"><span className="text-[var(--t5)]">Notes: </span><span className="text-[var(--t)] italic">{asset.notes}</span></div>
              )}
            </div>

            {(() => {
              const pdScore = computePassdownScore(asset, 'asset');
              const pdColor = passdownColor(pdScore);
              return (
                <div data-testid={`passdown-bar-${asset.id}`} title={`${passdownLabel(pdScore)} — ${pdScore}% of pass-down details captured`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--t5)]">Pass-down readiness</span>
                    <span className="text-[11px] font-bold" style={{ color: pdColor }}>{pdScore}%</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full transition-all duration-500" style={{ width: `${pdScore}%`, background: pdColor }} />
                  </div>
                </div>
              );
            })()}

            {beneficiaries.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="w-3 h-3 text-[var(--t4)]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--t5)]">Visible to {benCount} of {beneficiaries.length}</span>
                </div>
                <div className="space-y-1.5">
                  {beneficiaries.map(ben => {
                    const isAll = designated.includes('all');
                    const isOn = isAll || designated.includes(ben.id);
                    const timing = asset.visibility_timing?.[ben.id] || { pre: false, post: true };
                    const initials = `${ben.first_name?.charAt(0) || ''}${ben.last_name?.charAt(0) || ''}`;
                    return (
                      <div key={ben.id} className="rounded-xl overflow-hidden" style={{
                        background: isOn ? 'rgba(var(--gold-rgb), 0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isOn ? 'rgba(var(--gold-rgb), 0.2)' : 'rgba(255,255,255,0.06)'}`,
                      }}>
                        <div className="flex items-center gap-3 px-3 py-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{
                            background: isOn ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(255,255,255,0.08)',
                            color: isOn ? '#080e1a' : '#7B879E',
                          }}>{initials}</div>
                          <div className="flex-1 min-w-0"><div className="text-xs font-semibold truncate text-[var(--t)]">{ben.first_name} {ben.last_name}</div></div>
                          <button onClick={() => toggleBeneficiary(ben.id)} className="w-9 h-5 rounded-full flex-shrink-0 relative transition-all"
                            style={{ background: isOn ? '#d4af37' : 'rgba(255,255,255,0.12)' }}>
                            <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: isOn ? '18px' : '2px' }} />
                          </button>
                        </div>
                        {isOn && (
                          <div className="flex gap-2 px-3 pb-2">
                            <button onClick={() => toggleTiming(ben.id, 'pre')} className="flex-1 py-1 rounded-lg text-[11px] font-bold text-center"
                              style={{ background: timing.pre ? 'rgba(34,201,147,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${timing.pre ? 'rgba(34,201,147,0.4)' : 'rgba(255,255,255,0.08)'}`, color: timing.pre ? '#22C993' : '#525C72' }}>
                              {timing.pre ? '\u2713 ' : ''}Pre-Transition</button>
                            <button onClick={() => toggleTiming(ben.id, 'post')} className="flex-1 py-1 rounded-lg text-[11px] font-bold text-center"
                              style={{ background: timing.post ? 'rgba(59,123,247,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${timing.post ? 'rgba(59,123,247,0.4)' : 'rgba(255,255,255,0.08)'}`, color: timing.post ? '#3B7BF7' : '#525C72' }}>
                              {timing.post ? '\u2713 ' : ''}Post-Transition</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PropertyAssetTile;
