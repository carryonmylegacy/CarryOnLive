import React from 'react';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

/**
 * PassdownNotes — three structured notes prompts that collectively act
 * as the benefactor's "Dear Beneficiary" letter for a single record.
 *
 * The schema-required `notes` field is preserved underneath for
 * backwards compatibility — when ANY of the three new fields is set, we
 * also concatenate them into `notes` on save so older read paths keep
 * working until the migration finishes.
 *
 * Props:
 *   form    — the parent form state object
 *   update  — (key, value) => void  — same `update()` setter the form uses
 */
export const PassdownNotes = ({ form, update }) => (
  <div className="space-y-3 pt-2 border-t border-[var(--b)]">
    <div>
      <Label className="text-[var(--t)] font-bold text-sm block mb-2">
        Pass-down notes for your beneficiary
      </Label>
      <p className="text-[11px] text-[var(--t4)] -mt-1 mb-3 leading-snug">
        Imagine your spouse sitting at the kitchen table tomorrow trying
        to handle this bill alone. What do they need to know?
      </p>
    </div>

    <div className="space-y-1.5">
      <Label className="text-[#94a3b8] text-xs">
        First action — what should they do FIRST?
      </Label>
      <Textarea
        value={form.notes_first_action || ''}
        onChange={e => update('notes_first_action', e.target.value)}
        placeholder='e.g. "Call Duke at the number above and ask to add yourself as authorised contact."'
        rows={2}
        className="input-field text-sm"
        data-testid="passdown-first-action-input"
      />
    </div>

    <div className="space-y-1.5">
      <Label className="text-[#94a3b8] text-xs">
        Gotchas — anything tricky or non-obvious?
      </Label>
      <Textarea
        value={form.notes_gotchas || ''}
        onChange={e => update('notes_gotchas', e.target.value)}
        placeholder='e.g. "Auto-pay only debits on the 3rd; if it bounces they cut service that same day."'
        rows={2}
        className="input-field text-sm"
        data-testid="passdown-gotchas-input"
      />
    </div>

    <div className="space-y-1.5">
      <Label className="text-[#94a3b8] text-xs">
        Who to call — friend, accountant, account contact, co-signer
      </Label>
      <Textarea
        value={form.notes_who_to_call || ''}
        onChange={e => update('notes_who_to_call', e.target.value)}
        placeholder='e.g. "Sarah at Edward Jones knows our setup — (555) 123-9999."'
        rows={2}
        className="input-field text-sm"
        data-testid="passdown-who-to-call-input"
      />
    </div>
  </div>
);

export default PassdownNotes;
