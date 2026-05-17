import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { Heart, FileText, ShieldCheck, Plus, Users, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';

/**
 * EssentialOfflineSlots — 4 gold-outlined placeholder cards at the top
 * of the benefactor's SDV.
 *
 * One slot per essential offline document:
 *   • Living Will
 *   • Healthcare Directive
 *   • General Power of Attorney
 *   • Financial Power of Attorney
 *
 * Each slot is either EMPTY (gold dashed outline + "Upload" CTA) or
 * OCCUPIED (gold solid outline + doc tile + "Available offline to: N
 * beneficiaries" badge + "Manage offline access" button).
 *
 * Per-beneficiary designation defaults to NOBODY when the benefactor
 * uploads to a slot for the first time — they must explicitly tap
 * "Manage offline access" and pick. This is a deliberate privacy
 * default (e.g. a 2-year-old child shouldn't auto-receive a POA).
 */

const SLOT_ICONS = {
  living_will: Heart,
  healthcare_directive: ShieldCheck,
  general_poa: FileText,
  financial_poa: FileText,
};

const EssentialOfflineSlots = ({
  estateId,
  beneficiaries,
  getAuthHeaders,
  onUploadClick,
  onManageDesignation,
  refreshKey,
}) => {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSlots = useCallback(async () => {
    if (!estateId) return;
    try {
      const res = await apiClient.get(`${API_URL}/documents/${estateId}/essential-slots`, getAuthHeaders());
      setSlots(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      // Quiet failure — slots gracefully render empty if the endpoint
      // isn't reachable (offline / pre-deploy). The rest of the SDV
      // still works.
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [estateId, getAuthHeaders]);

  useEffect(() => { fetchSlots(); }, [fetchSlots, refreshKey]);

  // Resolve beneficiary names from the parent's beneficiaries list so
  // the "Available offline to: …" badge renders the actual people.
  const beneficiaryName = (id) => {
    const b = (beneficiaries || []).find((x) => x.id === id);
    if (!b) return id?.slice(0, 6) || 'Unknown';
    return [b.first_name, b.last_name].filter(Boolean).join(' ') || b.email || 'Beneficiary';
  };

  const renderRecipients = (slot) => {
    const list = slot.designated_beneficiaries || [];
    if (!list.length) {
      return (
        <div className="flex items-center gap-1.5 text-[12px]" style={{ color: '#fbbf24' }} data-testid={`essential-slot-${slot.slot}-recipients-empty`}>
          <AlertCircle className="w-3.5 h-3.5" />
          <span><strong>No beneficiaries yet</strong> — tap to designate</span>
        </div>
      );
    }
    if (list.includes('all')) {
      return (
        <div className="flex items-center gap-1.5 text-[12px]" style={{ color: '#34d399' }} data-testid={`essential-slot-${slot.slot}-recipients-all`}>
          <Users className="w-3.5 h-3.5" />
          <span>Available offline to <strong>all beneficiaries</strong></span>
        </div>
      );
    }
    const names = list.map(beneficiaryName).slice(0, 3);
    const more = list.length - names.length;
    return (
      <div className="flex items-center gap-1.5 text-[12px]" style={{ color: '#34d399' }} data-testid={`essential-slot-${slot.slot}-recipients`}>
        <Users className="w-3.5 h-3.5" />
        <span>Offline to: <strong>{names.join(', ')}{more > 0 ? ` +${more}` : ''}</strong></span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5" data-testid="essential-slots-loading">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[112px] rounded-2xl animate-pulse"
            style={{ background: 'rgba(212,175,55,0.06)', border: '1px dashed rgba(212,175,55,0.3)' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="mb-5" data-testid="essential-offline-slots">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[12px] font-bold tracking-wide uppercase" style={{ color: 'var(--gold, #d4af37)' }}>
          Essential Offline Documents
        </span>
        <span className="text-[11px]" style={{ color: 'var(--t3)' }}>
          — auto-cached on designated beneficiaries&rsquo; devices
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {slots.map((slot) => {
          const Icon = SLOT_ICONS[slot.slot] || FileText;
          const occupied = !!slot.document;
          const isPlaceholder = !occupied;

          return (
            <div
              key={slot.slot}
              data-testid={`essential-slot-${slot.slot}`}
              className="rounded-2xl p-4 transition-all hover:scale-[1.01]"
              style={{
                background: occupied
                  ? 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(212,175,55,0.04))'
                  : 'rgba(212,175,55,0.03)',
                border: occupied
                  ? '2px solid rgba(212,175,55,0.55)'
                  : '2px dashed rgba(212,175,55,0.4)',
                cursor: 'pointer',
              }}
              onClick={() => {
                if (isPlaceholder) {
                  onUploadClick && onUploadClick(slot.slot);
                } else {
                  onManageDesignation && onManageDesignation(slot.document, slot);
                }
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(212,175,55,0.18)' }}>
                  <Icon className="w-5 h-5" style={{ color: 'var(--gold, #d4af37)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-[14px] truncate" style={{ color: 'var(--t)' }}>
                      {slot.label}
                    </h4>
                    {isPlaceholder ? (
                      <Plus className="w-4 h-4" style={{ color: 'var(--gold)' }} />
                    ) : null}
                  </div>
                  {isPlaceholder ? (
                    <>
                      <p className="text-[12px] mt-0.5 line-clamp-2" style={{ color: 'var(--t3)' }}>
                        {slot.description}
                      </p>
                      <p className="text-[11px] mt-2 font-bold" style={{ color: 'var(--gold)' }}>
                        Tap to upload
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--t2)' }}>
                        {slot.document?.name || 'Untitled'}
                      </p>
                      <div className="mt-2">
                        {renderRecipients(slot)}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1.5 h-7 px-2 text-[11px] font-bold"
                        style={{ color: 'var(--gold)' }}
                        data-testid={`essential-slot-${slot.slot}-manage`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onManageDesignation && onManageDesignation(slot.document, slot);
                        }}
                      >
                        Manage offline access →
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EssentialOfflineSlots;
