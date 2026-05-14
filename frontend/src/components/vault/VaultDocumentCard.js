import React from 'react';
import {
  Lock, Unlock, Eye, Download, Loader2, Edit2, Trash2,
  Users, ChevronDown, ChevronUp, Sparkles,
  Building2, Shield as ShieldIcon, Landmark, Home, User as UserIcon, Settings,
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import DocThumbnail from '../DocThumbnail';
import PinForOfflineButton from './PinForOfflineButton';

// Map an entity category → small icon for the SDV thumbnail overlay.
const ENTITY_ICON = {
  business: Building2,
  trust: ShieldIcon,
  charity: Landmark,
  property: Home,
  external_person: UserIcon,
  specialized: Settings,
};
const ENTITY_TINT = {
  business: '#3B82F6',
  trust: '#6366F1',
  charity: '#D4A537',
  property: '#0E7490',
  external_person: '#64748B',
  specialized: '#64748B',
};

const VaultDocumentCard = ({
  doc,
  user,
  downloading,
  expandedDesignation,
  beneficiaries,
  getAuthHeaders,
  formatFileSize,
  handlePreview,
  handleDownload,
  handleDelete,
  openEditModal,
  setSelectedDoc,
  setShowLockModal,
  setShowRemoveLockConfirm,
  setShowSetLockModal,
  setExpandedDesignation,
  toggleBeneficiaryForDoc,
  toggleVisibilityTiming,
  onToggleAIEligible,
}) => {
  return (
    <Card
      className={`glass-card relative overflow-hidden group cursor-pointer ${doc.ai_eligible ? 'ai-eligible-frame' : ''}`}
      onClick={() => doc.is_locked ? (setSelectedDoc(doc), setShowLockModal(true)) : handlePreview(doc)}
      data-testid={`document-${doc.id}`}
      style={doc.ai_eligible ? { boxShadow: '0 0 0 2px var(--gold), 0 8px 24px rgba(212,165,55,0.15)' } : undefined}
    >
      {/* Lock Overlay */}
      {doc.is_locked && (
        <div className="lock-overlay">
          <div className="text-center">
            <Lock className="w-8 h-8 text-[var(--gold)] mx-auto mb-2" />
            <p className="text-white font-medium">Protected Document</p>
            <p className="text-[#94a3b8] text-sm">
              {doc.lock_type === 'password' ? 'Password Required' :
               doc.lock_type === 'voice' ? 'Voice Verification' : 'Backup Key Required'}
            </p>
            <Button
              variant="outline"
              className="mt-4 border-[#d4af37] text-[var(--gold)]"
              onClick={() => {
                setSelectedDoc(doc);
                setShowLockModal(true);
              }}
            >
              Unlock
            </Button>
          </div>
        </div>
      )}
      
      <CardContent className="p-0">
        {/* Thumbnail area */}
        <div className="h-28 w-full rounded-t-xl overflow-hidden relative">
          <DocThumbnail doc={doc} getAuthHeaders={getAuthHeaders} />
          {/* AI-eligible toggle — a small sparkles badge in the top-left
              corner of the thumbnail. Tap to opt this document in /
              out of EGA & IAC AI analyses. When ON, the card gains a
              gold frame (see Card className above) so the user can see
              at a glance which docs feed the AI. Benefactor only. */}
          {onToggleAIEligible && !doc.is_locked && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleAIEligible(doc); }}
              className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full flex items-center justify-center transition-all"
              style={{
                background: doc.ai_eligible ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(10,14,26,0.85)',
                border: `1px solid ${doc.ai_eligible ? '#d4af37' : 'rgba(255,255,255,0.18)'}`,
                color: doc.ai_eligible ? '#080e1a' : '#d4af37',
                boxShadow: doc.ai_eligible ? '0 0 14px rgba(212,165,55,0.55)' : 'none',
              }}
              title={doc.ai_eligible ? 'Included in AI analyses — tap to remove' : 'Include this document in EGA / IAC AI analyses'}
              aria-pressed={!!doc.ai_eligible}
              data-testid={`ai-eligible-toggle-${doc.id}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Entity-link overlay — shows the type of entity this doc is
              linked to (one badge per linked entity, capped at 3). Lets
              the user spot at a glance which docs map to which legal
              structures in the CFP org chart. */}
          {Array.isArray(doc.linked_entities) && doc.linked_entities.length > 0 && (
            <div
              className="absolute top-1.5 right-1.5 flex items-center gap-1"
              data-testid={`doc-entity-overlay-${doc.id}`}
            >
              {doc.linked_entities.slice(0, 3).map((ent) => {
                const Icon = ENTITY_ICON[ent.category] || ShieldIcon;
                const tint = ENTITY_TINT[ent.category] || '#64748B';
                return (
                  <div
                    key={ent.id}
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{
                      background: 'rgba(10,14,26,0.85)',
                      border: `1px solid ${tint}`,
                      color: tint,
                    }}
                    title={`Linked to ${ent.name}`}
                  >
                    <Icon className="w-3 h-3" />
                  </div>
                );
              })}
              {doc.linked_entities.length > 3 && (
                <div
                  className="px-1.5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold"
                  style={{ background: 'rgba(10,14,26,0.85)', border: '1px solid var(--gold)', color: 'var(--gold)' }}
                  title={`${doc.linked_entities.length} linked entities`}
                >
                  +{doc.linked_entities.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="p-4 pt-3">
          <h3 className="text-white font-medium mb-1 truncate text-sm">{doc.name}</h3>
          <p className="text-[#64748b] text-xs mb-3">
            {formatFileSize(doc.file_size)} · {doc.category}
          </p>
          
          <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-[#3b82f6] hover:text-[#60a5fa]"
            onClick={(e) => { e.stopPropagation(); if (doc.is_locked) { setSelectedDoc(doc); setShowLockModal(true); } else { handlePreview(doc); } }}
            title="View"
            aria-label="View document"
            data-testid={`view-document-${doc.id}`}
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-[#94a3b8] hover:text-white"
            onClick={(e) => { e.stopPropagation(); if (doc.is_locked) { setSelectedDoc(doc); setShowLockModal(true); } else { handleDownload(doc); } }}
            disabled={downloading === doc.id}
            title="Download"
            aria-label="Download document"
          >
            {downloading === doc.id ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </Button>
          <PinForOfflineButton doc={doc} getAuthHeaders={getAuthHeaders} />
          {(user?.role === 'benefactor' || user?.is_also_benefactor) && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className={doc.is_locked ? 'text-[#ef4444]' : 'text-[#10b981]'}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDoc(doc);
                  if (doc.is_locked) {
                    setShowRemoveLockConfirm(true);
                  } else {
                    setShowSetLockModal(true);
                  }
                }}
                title={doc.is_locked ? 'Locked — tap to remove lock' : 'Unlocked — tap to set password'}
                aria-label={doc.is_locked ? 'Remove lock' : 'Set lock'}
                data-testid={`lock-toggle-${doc.id}`}
              >
                {doc.is_locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-[var(--gold)] hover:text-[#f5d050]"
                onClick={(e) => { e.stopPropagation(); openEditModal(doc); }}
                title="Edit"
                aria-label="Edit document"
                data-testid={`edit-document-${doc.id}`}
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-[#ef4444] hover:text-[#ef4444]"
                onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                title="Delete"
                aria-label="Delete document"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
        </div>
        {/* Beneficiary Access */}
        {(user?.role === 'benefactor' || user?.is_also_benefactor) && beneficiaries.length > 0 && (
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              className="flex items-center gap-2 w-full px-3 py-2 rounded-full transition-all"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
              onClick={(e) => { e.stopPropagation(); setExpandedDesignation(expandedDesignation === doc.id ? null : doc.id); }}
              data-testid={`designation-toggle-${doc.id}`}
            >
              <Users className="w-4 h-4" style={{ color: 'var(--t4)' }} />
              <span className="text-sm font-semibold" style={{ color: '#D8DEE9' }}>
                {(!doc.designated_beneficiaries || doc.designated_beneficiaries?.includes('all'))
                  ? `All ${beneficiaries.length} Beneficiaries`
                  : `${doc.designated_beneficiaries.length} of ${beneficiaries.length} Beneficiaries`}
              </span>
              {expandedDesignation === doc.id
                ? <ChevronUp className="w-4 h-4 ml-auto" style={{ color: 'var(--t4)' }} />
                : <ChevronDown className="w-4 h-4 ml-auto" style={{ color: 'var(--t4)' }} />}
            </button>
            {expandedDesignation === doc.id && (
              <div className="mt-3 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                {beneficiaries.map(ben => {
                  const designation = doc.designated_beneficiaries || ['all'];
                  const isAll = designation.includes('all');
                  const isOn = isAll || designation.includes(ben.id);
                  const timing = doc.visibility_timing?.[ben.id] || { pre: false, post: true };
                  const initials = `${ben.first_name?.charAt(0) || ''}${ben.last_name?.charAt(0) || ''}`;
                  return (
                    <div key={ben.id} className="rounded-xl overflow-hidden" style={{
                      background: isOn ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isOn ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    }}>
                      {/* Row: avatar + name + on/off switch */}
                      <div className="flex items-center gap-3 px-3 py-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden" style={{
                          background: isOn ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(255,255,255,0.08)',
                          color: isOn ? '#080e1a' : 'var(--t4)',
                        }}>
                          {ben.photo_url
                            ? <img src={ben.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                            : initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: 'var(--t)' }}>{ben.first_name} {ben.last_name}</div>
                        </div>
                        {/* Toggle switch */}
                        <button
                          onClick={() => toggleBeneficiaryForDoc(doc.id, ben.id, doc.designated_beneficiaries, doc)}
                          className="w-11 h-6 rounded-full flex-shrink-0 relative transition-all"
                          data-testid={`designation-ben-${ben.id}-${doc.id}`}
                          style={{
                            background: isOn ? '#d4af37' : 'rgba(255,255,255,0.12)',
                          }}
                        >
                          <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{
                            left: isOn ? '22px' : '2px',
                          }} />
                        </button>
                      </div>
                      {/* Pre / Post row — always visible when ON */}
                      {isOn && (
                        <div className="flex gap-2 px-3 pb-2.5">
                          <button
                            className="flex-1 py-1.5 rounded-lg text-xs font-bold text-center transition-all"
                            onClick={() => toggleVisibilityTiming(doc.id, ben.id, 'pre', doc)}
                            data-testid={`timing-pre-${ben.id}-${doc.id}`}
                            style={{
                              background: timing.pre ? 'rgba(34,201,147,0.15)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${timing.pre ? 'rgba(34,201,147,0.4)' : 'rgba(255,255,255,0.08)'}`,
                              color: timing.pre ? '#22C993' : 'var(--t5)',
                            }}
                          >
                            {timing.pre ? '\u2713 ' : ''}Pre-Transition
                          </button>
                          <button
                            className="flex-1 py-1.5 rounded-lg text-xs font-bold text-center transition-all"
                            onClick={() => toggleVisibilityTiming(doc.id, ben.id, 'post', doc)}
                            data-testid={`timing-post-${ben.id}-${doc.id}`}
                            style={{
                              background: timing.post ? 'rgba(59,123,247,0.15)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${timing.post ? 'rgba(59,123,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
                              color: timing.post ? '#3B7BF7' : 'var(--t5)',
                            }}
                          >
                            {timing.post ? '\u2713 ' : ''}Post-Transition
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VaultDocumentCard;
