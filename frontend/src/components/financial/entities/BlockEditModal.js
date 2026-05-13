/**
 * BlockEditModal — rename + edit-membership for a beneficiary block.
 *
 * Opens via the pencil icon on a named-block tile in EntityOrgChart.
 * Lets the user rename the block AND toggle which beneficiaries /
 * external people / benefactor are in it. PUTs the changes to
 * `/api/financial/beneficiary-blocks/{block_id}` then bubbles
 * `onSaved` so the parent can re-fetch.
 *
 * Members payload mirrors the create endpoint:
 *   members: [{ kind: 'beneficiary' | 'external_person' | 'user', id }]
 *
 * Visual language matches the bulk-add modal in EntityDetailPanel —
 * same teal palette, same opaque var(--bg2) backdrop, same green
 * confirm CTA — so the user has one consistent mental model for
 * everything block-related.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, Users, X } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { API_URL } from '../../../config';

const getAuthHeaders = () => {
  const token = localStorage.getItem('carryon_token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

export default function BlockEditModal({
  block,
  mode = 'edit', // 'edit' | 'convert'
  convert,       // { entityId, memberRelIds, estateId } — only when mode='convert'
  beneficiaries = [],
  externals = [],
  user,
  onClose,
  onSaved,
}) {
  // Seed the form from the block we were handed. Re-runs if the user
  // closes + re-opens with a different block (so stale state can't
  // leak across edit sessions).
  const initialMembers = useMemo(() => {
    const set = new Set();
    let includeBenefactor = false;
    (block?.members || []).forEach((m) => {
      if (m.kind === 'user') includeBenefactor = true;
      else set.add(`${m.kind}:${m.id}`);
    });
    return { set, includeBenefactor };
  }, [block]);

  const [name, setName] = useState(block?.name || '');
  const [memberKeys, setMemberKeys] = useState(initialMembers.set);
  const [includeBenefactor, setIncludeBenefactor] = useState(initialMembers.includeBenefactor);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(block?.name || '');
    setMemberKeys(initialMembers.set);
    setIncludeBenefactor(initialMembers.includeBenefactor);
  }, [block, initialMembers]);

  if (!block) return null;

  const toggle = (key) => {
    const next = new Set(memberKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setMemberKeys(next);
  };

  const handleSave = async () => {
    const trimmed = (name || '').trim();
    if (memberKeys.size === 0 && !includeBenefactor) {
      toast.error('Pick at least one member.');
      return;
    }
    setSaving(true);
    try {
      const members = [
        ...Array.from(memberKeys).map((key) => {
          const [kind, id] = key.split(':');
          return { kind, id };
        }),
        ...(includeBenefactor && user?.id ? [{ kind: 'user', id: user.id }] : []),
      ];

      if (mode === 'convert' && convert) {
        // Auto-cluster → named block upgrade. Three-step sequence:
        //   1) Create the new beneficiary_block with name + members.
        //      Auto-name "Block N" if the user left the field blank,
        //      using the existing block count from the modal payload
        //      isn't reliable here — fall back to a date-stamped
        //      default the user can rename later.
        const blockName = trimmed || `Group ${new Date().toLocaleDateString()}`;
        const created = await axios.post(
          `${API_URL}/financial/beneficiary-blocks`,
          { estate_id: convert.estateId, name: blockName, members },
          getAuthHeaders(),
        );
        const newBlockId = created.data?.id;
        if (!newBlockId) throw new Error('Block create did not return id');
        //   2) Attach the new block to the entity the cluster was on.
        await axios.post(
          `${API_URL}/financial/entity-relationships`,
          {
            estate_id: convert.estateId,
            source_id: newBlockId,
            source_type: 'beneficiary_block',
            target_id: convert.entityId,
            target_type: 'entity',
            role: 'beneficiary',
            ownership_pct: null,
          },
          getAuthHeaders(),
        );
        //   3) Delete the N old flat beneficiary→entity relationships
        //      that constituted the auto-cluster. Done in parallel —
        //      the underlying beneficiary records stay intact, only
        //      the entity-attach edges go.
        await Promise.all((convert.memberRelIds || []).map((relId) => axios.delete(
          `${API_URL}/financial/entity-relationships/${relId}`,
          getAuthHeaders(),
        )));
        toast.success(`Saved "${blockName}".`);
      } else {
        // Plain edit on an existing named block — single PATCH.
        if (!trimmed) { toast.error('Give the block a name.'); setSaving(false); return; }
        await axios.patch(
          `${API_URL}/financial/beneficiary-blocks/${block.id}`,
          { name: trimmed, members },
          getAuthHeaders(),
        );
        toast.success(`Saved "${trimmed}".`);
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      let msg = 'Failed to save block';
      if (typeof detail === 'string') msg = detail;
      else if (Array.isArray(detail)) msg = detail.map((d) => d?.msg || JSON.stringify(d)).join('; ');
      else if (err?.message) msg = err.message;
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={() => !saving && onClose?.()}
      data-testid="block-edit-modal"
    >
      <div
        className="w-full max-w-md rounded-xl border flex flex-col"
        style={{
          background: 'var(--bg2)',
          borderColor: 'var(--b2)',
          maxHeight: '90vh',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-[var(--b2)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-bold text-[var(--t)] flex items-center gap-2">
              <Users className="w-4 h-4" style={{ color: '#22C993' }} />
              {mode === 'convert' ? 'Name this group' : 'Edit group'}
            </div>
            <div className="text-[11px] text-[var(--t4)] mt-0.5">
              {mode === 'convert'
                ? 'Give this group a name and adjust members. It becomes a reusable group you can attach to other entities too.'
                : 'Rename, add or remove members. Saves to every entity this group is attached to.'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose?.()}
            className="p-1 rounded hover:bg-[var(--card)] text-[var(--t4)] hover:text-[var(--t)]"
            data-testid="block-edit-close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
          <Label className="text-[11px] text-[var(--t4)]">Group name{mode === 'convert' ? ' (optional)' : ''}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={mode === 'convert' ? 'e.g. "Kids" — leave blank to auto-name' : 'e.g. "Kids"'}
            className="input-field mt-1"
            data-testid="block-edit-name"
            autoFocus
          />

          <div className="mt-4">
            <Label className="text-[11px] text-[var(--t4)]">Members</Label>
            <div className="mt-1.5 space-y-1.5" data-testid="block-edit-members">
              {/* Benefactor — only checkbox-style; can't pick yourself
                  twice. */}
              {user?.id && (
                <MemberRow
                  checked={includeBenefactor}
                  onChange={() => setIncludeBenefactor((v) => !v)}
                  label={`${user.first_name || ''} ${user.last_name || ''}`.trim() || 'You'}
                  sub="benefactor"
                  testId="block-edit-member-user"
                />
              )}
              {(beneficiaries || []).map((b) => {
                const key = `beneficiary:${b.id}`;
                return (
                  <MemberRow
                    key={key}
                    checked={memberKeys.has(key)}
                    onChange={() => toggle(key)}
                    label={`${b.first_name || b.name || ''} ${b.last_name || ''}`.trim() || 'Beneficiary'}
                    sub="beneficiary"
                    testId={`block-edit-member-${b.id}`}
                  />
                );
              })}
              {(externals || []).map((p) => {
                const key = `external_person:${p.id}`;
                return (
                  <MemberRow
                    key={key}
                    checked={memberKeys.has(key)}
                    onChange={() => toggle(key)}
                    label={`${p.first_name || p.name || ''} ${p.last_name || ''}`.trim() || 'Person'}
                    sub="external person"
                    testId={`block-edit-member-${p.id}`}
                  />
                );
              })}
              {beneficiaries.length === 0 && externals.length === 0 && !user?.id && (
                <div className="text-[12px] text-[var(--t4)] py-4 text-center">
                  No people available on this estate yet.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[var(--b2)] flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => !saving && onClose?.()}
            disabled={saving}
            className="btn-outline-cta"
            data-testid="block-edit-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-semibold"
            style={{ background: '#22C993', color: '#0b1120' }}
            data-testid="block-edit-save"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</>
            ) : (
              `Save group${(memberKeys.size + (includeBenefactor ? 1 : 0)) ? ` · ${memberKeys.size + (includeBenefactor ? 1 : 0)} member${(memberKeys.size + (includeBenefactor ? 1 : 0)) === 1 ? '' : 's'}` : ''}`
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MemberRow({ checked, onChange, label, sub, testId }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="w-full flex items-center gap-3 p-2 rounded-md text-left"
      style={{
        background: checked ? 'rgba(34,201,147,0.12)' : 'var(--card)',
        border: `1px solid ${checked ? '#22C993' : 'var(--b2)'}`,
      }}
      data-testid={testId}
    >
      <span
        className="w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0"
        style={{
          background: checked ? '#22C993' : 'transparent',
          border: `1.5px solid ${checked ? '#22C993' : 'var(--b)'}`,
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5L6.5 12L13 4.5" stroke="#0b1120" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[var(--t)] truncate">{label}</div>
        <div className="text-[11px] text-[var(--t4)] truncate">{sub}</div>
      </div>
    </button>
  );
}
