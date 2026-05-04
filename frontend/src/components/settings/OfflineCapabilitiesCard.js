import React from 'react';
import { Card, CardContent } from '../ui/card';
import { CheckCircle2, AlertCircle, WifiOff } from 'lucide-react';

/**
 * OfflineCapabilitiesCard — Settings → Offline
 *
 * A clear, plain-English list of every product feature classified as
 * "works fully offline" vs "requires an internet connection". Sets
 * user expectations explicitly so they aren't surprised when (e.g.)
 * AI Guardian chat is unavailable on a flight or a Stripe payment
 * can't be set up in airplane mode.
 *
 * Lives at the top of the Offline section of /settings, above the
 * existing Offline Behavior + Offline Access + Sync Status cards
 * which give live state. This card is reference / documentation —
 * the *what*, not the *now*.
 *
 * Source of truth: /app/scripts/audit_offline_mutations.sh — every
 * row below corresponds to a real `mutateWithOutbox` / `enqueue`
 * guard (left column) or a deliberate online-by-design call (right
 * column) verified by the page-level audit (housekeeping check #75).
 */

const WORKS_OFFLINE = [
  { feature: 'Beneficiaries', detail: 'Add, edit, delete, reorder, succession changes, section permissions' },
  { feature: 'Milestone Messages', detail: 'Record video / audio, save, edit, delete (videos upload on reconnect)' },
  { feature: 'Checklist', detail: 'Add tasks, edit, mark active / complete, accept / reject AI suggestions, delete' },
  { feature: 'Trustee Tasks (DTS)', detail: 'Create new request, edit, delete' },
  { feature: 'Financial Portal', detail: 'Add accounts, edit, delete, beneficiary designations, custom categories' },
  { feature: 'Digital Wallet', detail: 'Add accounts, edit, delete' },
  { feature: 'Vault', detail: 'View cached documents, delete documents, change beneficiary access' },
  { feature: 'Profile changes', detail: 'Edit name, contact info, preferences (sync on reconnect)' },
];

const ONLINE_ONLY = [
  { feature: 'New file uploads', detail: 'Vault document uploads & beneficiary photos need a connection — they queue partway then complete on reconnect' },
  { feature: 'AI Guardian chat', detail: 'Live AI conversations require the AI service' },
  { feature: 'Email invitations', detail: 'Sending an invite to a beneficiary or trustee uses the email service' },
  { feature: 'Document lock / unlock', detail: 'Server-side encryption is performed online' },
  { feature: 'Payment setup', detail: 'Stripe payment-method capture for paid Trustee tasks' },
  { feature: 'Account creation & login', detail: 'Sign-up, password reset, and first-time login require the server' },
];

export default function OfflineCapabilitiesCard() {
  return (
    <Card className="glass-card" data-testid="offline-capabilities-card">
      <CardContent className="pt-5 pb-4 space-y-4">
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4" style={{ color: 'var(--gold, #d4af37)' }} />
          <h3 className="font-bold text-[14px]" style={{ color: 'var(--t)' }}>What works offline</h3>
        </div>
        <p className="text-[12px]" style={{ color: 'var(--t2)' }}>
          You can use most of CarryOn on a plane, in a basement, or anywhere your
          signal drops. Changes you make are saved on your device and sync to the
          cloud the moment you reconnect — automatically. Here&rsquo;s the precise
          scope so nothing surprises you.
        </p>

        {/* Works fully offline */}
        <div data-testid="offline-capabilities-works-list" className="space-y-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
            <div className="text-[12px] font-bold" style={{ color: '#34d399' }}>Fully available offline</div>
          </div>
          <ul className="space-y-1.5 pl-5">
            {WORKS_OFFLINE.map((row) => (
              <li
                key={row.feature}
                className="text-[12px]"
                style={{ color: 'var(--t)', listStyleType: 'none', position: 'relative' }}
                data-testid={`offline-cap-works-${row.feature.replace(/\s+/g, '-').toLowerCase()}`}
              >
                <span aria-hidden style={{ position: 'absolute', left: '-0.95rem', top: 0, color: '#34d399' }}>•</span>
                <strong>{row.feature}</strong>
                <span style={{ color: 'var(--t2)' }}> — {row.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Requires connection */}
        <div data-testid="offline-capabilities-online-list" className="space-y-2 pt-1">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} />
            <div className="text-[12px] font-bold" style={{ color: '#fbbf24' }}>Requires an internet connection</div>
          </div>
          <ul className="space-y-1.5 pl-5">
            {ONLINE_ONLY.map((row) => (
              <li
                key={row.feature}
                className="text-[12px]"
                style={{ color: 'var(--t)', listStyleType: 'none', position: 'relative' }}
                data-testid={`offline-cap-online-${row.feature.replace(/\s+/g, '-').toLowerCase()}`}
              >
                <span aria-hidden style={{ position: 'absolute', left: '-0.95rem', top: 0, color: '#fbbf24' }}>•</span>
                <strong>{row.feature}</strong>
                <span style={{ color: 'var(--t2)' }}> — {row.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="mt-2 rounded-lg px-3 py-2 text-[11px]"
          style={{
            background: 'rgba(212,175,55,0.08)',
            border: '1px solid rgba(212,175,55,0.18)',
            color: 'var(--t2)',
          }}
        >
          <strong style={{ color: 'var(--t)' }}>Tip:</strong> when you&rsquo;re offline,
          you&rsquo;ll see a small status pill if anything is queued. When you reconnect,
          everything syncs automatically. The Sync status card below shows live progress
          and any errors.
        </div>
      </CardContent>
    </Card>
  );
}
