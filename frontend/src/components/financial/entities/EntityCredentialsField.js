/**
 * EntityCredentialsField — repeating sub-form for digital credentials
 * (logins/passwords) belonging to a CFP entity. Each row maps 1-to-1
 * with a Digital Access Vault (DAV) entry. Used inside both the
 * EntityWizard (creation) and EntityDetailPanel (editing) so the user
 * can capture LLC/Trust portal logins right next to the entity itself.
 *
 * Each credential row:
 *   { id?, account_name, login_username, password, additional_access,
 *     notes, _dirty, _new }
 *
 * `id` is set for credentials already persisted in the DAV. New rows
 * are flagged with `_new: true` and persisted on save by the parent.
 * `_dirty` flips to true on any field edit so the parent can decide
 * whether to PATCH vs. skip.
 */
import React from 'react';
import { Plus, Trash2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';

export const blankCredential = (defaultName = '') => ({
  _new: true,
  _dirty: false,
  account_name: defaultName,
  login_username: '',
  password: '',
  additional_access: '',
  notes: '',
});

export default function EntityCredentialsField({
  credentials,
  onChange,
  defaultAccountName = '',
}) {
  const [revealed, setRevealed] = React.useState({}); // index -> bool

  const update = (idx, patch) => {
    const next = credentials.map((c, i) =>
      i === idx ? { ...c, ...patch, _dirty: true } : c
    );
    onChange(next);
  };

  const remove = (idx) => {
    // For persisted rows, mark for deletion; for new rows, drop entirely.
    const row = credentials[idx];
    if (row.id) {
      onChange(credentials.map((c, i) => (i === idx ? { ...c, _delete: true } : c)));
    } else {
      onChange(credentials.filter((_, i) => i !== idx));
    }
  };

  const add = () => {
    onChange([...credentials, blankCredential(defaultAccountName)]);
  };

  const visible = credentials.filter((c) => !c._delete);

  return (
    <div className="space-y-3">
      {visible.length === 0 && (
        <div
          className="text-[12px] text-[var(--t5)] italic px-3 py-3 rounded-lg"
          style={{ background: 'var(--card)', border: '1px dashed var(--b)' }}
        >
          No digital credentials saved for this entity yet. Add a portal login,
          tax-filing account, registered-agent dashboard, etc.
        </div>
      )}

      {credentials.map((c, idx) => {
        if (c._delete) return null;
        const show = !!revealed[idx];
        return (
          <div
            key={c.id || `new-${idx}`}
            className="space-y-2 p-3 rounded-xl"
            style={{ background: 'var(--card)', border: '1px solid var(--b)' }}
            data-testid={`entity-credential-row-${idx}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--t5)]">
                <KeyRound className="w-3 h-3" /> Credential {idx + 1}
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="p-1.5 rounded-md text-[var(--t5)] hover:text-[#ef4444] hover:bg-[var(--rdbg)]"
                aria-label="Remove credential"
                data-testid={`entity-credential-remove-${idx}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[var(--t4)] text-xs">Account / portal name</Label>
              <Input
                value={c.account_name || ''}
                onChange={(e) => update(idx, { account_name: e.target.value })}
                placeholder="e.g. Delaware Annual Report Portal"
                className="input-field"
                data-testid={`entity-credential-name-${idx}`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[var(--t4)] text-xs">Username / email</Label>
                <Input
                  value={c.login_username || ''}
                  onChange={(e) => update(idx, { login_username: e.target.value })}
                  placeholder="login@example.com"
                  className="input-field"
                  autoComplete="off"
                  data-testid={`entity-credential-username-${idx}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[var(--t4)] text-xs">Password</Label>
                <div className="relative">
                  <Input
                    type={show ? 'text' : 'password'}
                    value={c.password || ''}
                    onChange={(e) => update(idx, { password: e.target.value })}
                    placeholder="••••••••"
                    className="input-field pr-10"
                    autoComplete="new-password"
                    data-testid={`entity-credential-password-${idx}`}
                  />
                  <button
                    type="button"
                    onClick={() => setRevealed((r) => ({ ...r, [idx]: !r[idx] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--t5)]"
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[var(--t4)] text-xs">2FA / recovery / extra access</Label>
              <Input
                value={c.additional_access || ''}
                onChange={(e) => update(idx, { additional_access: e.target.value })}
                placeholder="Authenticator app, backup codes, security questions, etc."
                className="input-field"
                data-testid={`entity-credential-additional-${idx}`}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[var(--t4)] text-xs">Notes</Label>
              <Textarea
                value={c.notes || ''}
                onChange={(e) => update(idx, { notes: e.target.value })}
                placeholder="Anything your beneficiaries should know."
                className="input-field min-h-[56px]"
                rows={2}
                data-testid={`entity-credential-notes-${idx}`}
              />
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-[var(--gold)] border border-dashed border-[var(--gold)]/40 hover:bg-[var(--gold)]/5"
        data-testid="entity-credential-add"
      >
        <Plus className="w-3.5 h-3.5" /> Add credential
      </button>
    </div>
  );
}
