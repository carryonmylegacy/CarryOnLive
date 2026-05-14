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
 *
 * UX (added per user request):
 *   • Persisted rows render as a compact READ-ONLY summary with a
 *     pencil (edit) and trashcan (delete) icon. Tapping the pencil
 *     expands that row into the full edit form. Tapping it again (or
 *     "Done") collapses it back. New (unsaved) rows always start in
 *     the expanded form so the user can fill them in immediately.
 */
import React from 'react';
import { Plus, Trash2, Eye, EyeOff, KeyRound, Pencil, Check, Link2, Lock, Hourglass } from 'lucide-react';
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
  beneficiary_visibility: 'private',
});

export default function EntityCredentialsField({
  credentials,
  onChange,
  defaultAccountName = '',
  davEntries = [],
}) {
  const [revealed, setRevealed] = React.useState({}); // index -> bool
  // Per-row expansion. Persisted rows default collapsed; new rows expand
  // automatically so the user can fill them in.
  const [expanded, setExpanded] = React.useState({}); // index -> bool

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
    // Prepend so the new credential editor opens at the TOP of the list
    // (under the "Add credential" button the user just tapped) rather
    // than slipping off the bottom of the screen on long entity forms.
    const next = [blankCredential(defaultAccountName), ...credentials];
    onChange(next);
    // Auto-expand the new row (now at index 0). Existing expand keys
    // referenced numeric indices that just shifted +1; resetting the
    // map is cleaner than trying to remap every key.
    setExpanded({ 0: true });
  };

  const toggleExpanded = (idx) =>
    setExpanded((e) => ({ ...e, [idx]: !e[idx] }));

  const isExpanded = (idx, c) => {
    if (idx in expanded) return expanded[idx];
    // Default: new rows (no persisted id) start expanded; persisted rows
    // start collapsed.
    return !c.id;
  };

  const visible = credentials.filter((c) => !c._delete);

  // Build a quick lookup for DAV duplicates by normalized login.
  // Used to surface the inline "Link to existing" hint on each row.
  const davByLogin = React.useMemo(() => {
    const map = new Map();
    (davEntries || []).forEach((e) => {
      const key = (e.login_username || '').trim().toLowerCase();
      if (key) map.set(key, e);
    });
    return map;
  }, [davEntries]);

  const findDavDuplicate = (row) => {
    // Skip if the row is already persisted as this DAV entry, already
    // linked, blank, or marked for deletion.
    if (!row || row._delete || row._link_to_id) return null;
    const key = (row.login_username || '').trim().toLowerCase();
    if (!key) return null;
    const match = davByLogin.get(key);
    if (!match) return null;
    if (row.id && match.id === row.id) return null; // editing the same one
    return match;
  };

  const linkRowToExistingDav = (idx, davEntry) => {
    onChange(credentials.map((c, i) => i === idx ? {
      ...c,
      _link_to_id: davEntry.id,
      _link_to_name: davEntry.account_name,
      _link_to_login: davEntry.login_username,
      _new: false, // no longer a fresh insert; persistEntityCredentials will PATCH instead
      _dirty: false,
    } : c));
  };

  const unlinkRow = (idx) => {
    onChange(credentials.map((c, i) => i === idx ? {
      ...c,
      _link_to_id: undefined,
      _link_to_name: undefined,
      _link_to_login: undefined,
      _new: !c.id, // restore "new row" state if it had no DAV id of its own
    } : c));
  };

  return (
    <div className="space-y-3">
      {/* Add button at the TOP — when tapped, prepends a blank row and
          auto-expands it, so the editor appears directly below the
          button instead of off-screen at the bottom of long entity
          forms. */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold text-[var(--gold)] whitespace-nowrap border border-[var(--gold)]/70 bg-[rgba(212,165,55,0.10)] hover:bg-[rgba(212,165,55,0.20)] hover:border-[var(--gold)] transition-colors"
          data-testid="entity-credential-add"
        >
          <Plus className="w-3.5 h-3.5" /> Add credential
        </button>
      </div>

      {visible.length === 0 && (
        <div
          className="text-[12px] text-[var(--t5)] italic px-3 py-3 rounded-lg"
          style={{ background: 'var(--card)', border: '1px dashed var(--b2)' }}
        >
          No digital credentials saved for this entity yet. Add a portal login,
          tax-filing account, registered-agent dashboard, etc.
        </div>
      )}

      {credentials.map((c, idx) => {
        if (c._delete) return null;
        const show = !!revealed[idx];
        const open = isExpanded(idx, c);
        const summaryTitle =
          (c.account_name || '').trim() || `Credential ${idx + 1}`;
        const summarySub = (c.login_username || '').trim();
        const dupMatch = findDavDuplicate(c);

        // ── Linked to existing DAV entry — compact display, no edit form ──
        if (c._link_to_id) {
          return (
            <div
              key={`linked-${c._link_to_id}-${idx}`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{
                background: 'rgba(212,165,55,0.08)',
                border: '1px solid rgba(212,165,55,0.45)',
              }}
              data-testid={`entity-credential-linked-${idx}`}
            >
              <Link2 className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-[var(--t)] truncate font-medium">
                  Linked to {c._link_to_name || 'existing DAV entry'}
                </div>
                {c._link_to_login && (
                  <div className="text-[11px] text-[var(--t5)] truncate">
                    {c._link_to_login}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => unlinkRow(idx)}
                className="text-[11px] font-bold px-2 py-1 rounded-md text-[var(--t4)] hover:text-[var(--t)] hover:bg-[var(--s)]"
                data-testid={`entity-credential-unlink-${idx}`}
              >
                Unlink
              </button>
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
          );
        }

        // ── Collapsed read-only summary row ──────────────────────────
        if (!open) {
          return (
            <div
              key={c.id || `new-${idx}`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'var(--card)', border: '1px solid var(--b2)' }}
              data-testid={`entity-credential-row-${idx}`}
            >
              <KeyRound className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-[var(--t)] truncate font-medium">
                  {summaryTitle}
                </div>
                {summarySub && (
                  <div className="text-[11px] text-[var(--t5)] truncate">
                    {summarySub}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggleExpanded(idx)}
                className="p-1.5 rounded-md text-[var(--t5)] hover:text-[var(--gold)] hover:bg-[var(--rdbg)]"
                aria-label="Edit credential"
                data-testid={`entity-credential-edit-${idx}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
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
          );
        }

        // ── Expanded full edit form ──────────────────────────────────
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
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleExpanded(idx)}
                  className="p-1.5 rounded-md text-[var(--t5)] hover:text-[var(--gold)] hover:bg-[var(--rdbg)]"
                  aria-label="Collapse credential"
                  data-testid={`entity-credential-collapse-${idx}`}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
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

            {/* Duplicate-DAV hint — appears when the typed username
                matches an existing DAV entry. Offers a one-tap link
                instead of creating a duplicate row. */}
            {dupMatch && (
              <div
                className="rounded-lg p-2.5 flex items-start gap-2"
                style={{
                  background: 'rgba(212,165,55,0.08)',
                  border: '1px solid rgba(212,165,55,0.45)',
                }}
                data-testid={`entity-credential-dup-hint-${idx}`}
              >
                <Link2 className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-[var(--t)] leading-snug">
                    A DAV entry with this login already exists
                    {dupMatch.account_name ? ` ("${dupMatch.account_name}")` : ''}.
                    Link this entity to that entry instead of creating a duplicate?
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => linkRowToExistingDav(idx, dupMatch)}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-md flex-shrink-0"
                  style={{
                    background: 'var(--gold)',
                    color: '#0b1120',
                  }}
                  data-testid={`entity-credential-link-existing-${idx}`}
                >
                  Link
                </button>
              </div>
            )}

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

            {/* ── Beneficiary visibility chip ──────────────────────────
                Three-state cycle controlling whether (and when) this
                credential is revealed in the read-only beneficiary
                E&S view. Default = private. The backend gates "show
                now" against the global E&S share toggle, so the user
                can pick this state freely here regardless of the
                global setting. */}
            {(() => {
              const vis = c.beneficiary_visibility || 'private';
              const STATES = [
                { id: 'private',          label: 'Private',         Icon: Lock,      bg: 'transparent', fg: 'var(--t5)', border: 'var(--b)' },
                { id: 'posthumous_only',  label: 'Posthumous only', Icon: Hourglass, bg: 'rgba(212,165,55,0.08)', fg: 'var(--gold)', border: 'rgba(212,165,55,0.45)' },
                { id: 'show_now',         label: 'Show now',        Icon: Eye,       bg: 'var(--gold)', fg: '#0b1120', border: 'var(--gold)' },
              ];
              const cur = STATES.find((s) => s.id === vis) || STATES[0];
              const idxCur = STATES.indexOf(cur);
              const next = STATES[(idxCur + 1) % STATES.length];
              return (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="text-[10.5px] uppercase tracking-wide font-bold text-[var(--t5)]">
                    Beneficiary visibility
                  </div>
                  <button
                    type="button"
                    onClick={() => update(idx, { beneficiary_visibility: next.id })}
                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full transition-all"
                    style={{ background: cur.bg, color: cur.fg, border: `1px solid ${cur.border}` }}
                    data-testid={`entity-credential-visibility-${idx}`}
                    aria-label={`Beneficiary visibility: ${cur.label}. Tap to cycle.`}
                    title={
                      cur.id === 'private' ? 'Beneficiaries never see this credential.'
                        : cur.id === 'posthumous_only' ? 'Beneficiaries see this only after you transition.'
                          : 'Beneficiaries see this now (only for those you selected via the E&S Share toggle).'
                    }
                  >
                    <cur.Icon className="w-3 h-3" />
                    {cur.label}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}
