import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

/**
 * Beneficiary login capture that materialises / refreshes a linked Digital
 * Access Vault credential row on save (audit d5a54f5e P0 — bi-directional
 * CFP <-> DAV sync). Reused across Account / Debt / Property forms. The
 * password is sent once to the backend, encrypted at rest, and never read
 * back into the form — so editing an item shows an empty password field.
 */
export const DavCredentialFields = ({ form, update, idPrefix = 'item' }) => {
  const [show, setShow] = useState(false);
  const hasValue = form.dav_login_username || form.dav_login_password;
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'rgba(var(--gold-rgb), 0.04)', border: '1px solid rgba(var(--gold-rgb), 0.18)' }}
      data-testid={`${idPrefix}-dav-credential-fields`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold text-[var(--gold)] uppercase tracking-wider">
          Beneficiary login (auto-saved to Digital Access Vault)
        </div>
        {hasValue && (
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)' }}
            data-testid={`${idPrefix}-dav-auto-secured-pill`}
          >
            <Lock className="w-3 h-3" style={{ color: '#10b981' }} />
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#10b981' }}>
              Auto-secured
            </span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[#94a3b8] text-xs">Login username / email</Label>
          <Input
            value={form.dav_login_username || ''}
            onChange={(e) => update('dav_login_username', e.target.value)}
            placeholder="user@example.com"
            autoComplete="off"
            className="input-field text-sm"
            data-testid={`${idPrefix}-dav-username-input`}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[#94a3b8] text-xs">Login password</Label>
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              value={form.dav_login_password || ''}
              onChange={(e) => update('dav_login_password', e.target.value)}
              placeholder="•••••••••"
              autoComplete="new-password"
              className="input-field text-sm pr-10"
              data-testid={`${idPrefix}-dav-password-input`}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94a3b8]"
              aria-label={show ? 'Hide password' : 'Show password'}
              data-testid={`${idPrefix}-dav-password-toggle`}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-[var(--t4)] mt-2 leading-snug">
        Password is encrypted at rest and only ever shown to you. On save, a linked
        DAV credential row is created or updated for the beneficiary.
      </p>
    </div>
  );
};

export default DavCredentialFields;
