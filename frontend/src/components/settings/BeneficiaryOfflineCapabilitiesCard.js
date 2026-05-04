import React from 'react';
import { Card, CardContent } from '../ui/card';
import { CheckCircle2, AlertCircle, WifiOff } from 'lucide-react';

/**
 * BeneficiaryOfflineCapabilitiesCard — Settings → Offline (beneficiary)
 *
 * Mirror of OfflineCapabilitiesCard but scoped to what a beneficiary
 * actually does in the app: READ designated content from every estate
 * they're connected to (Vault metadata, Milestone Messages, Checklist,
 * Financial designations). Beneficiary write actions are intentionally
 * blocked offline — see "Requires connection" below.
 *
 * Source of truth: this card pairs with the multi-estate localStorage
 * cache populated by each beneficiary page on a successful online
 * fetch (`beneficiary:dashboard:<estateId>` etc.).
 */

const WORKS_OFFLINE = [
  { feature: 'Estate switching', detail: 'Switch between every estate you are a beneficiary of — all cached locally' },
  { feature: 'Milestone Messages', detail: 'Read text + watch any messages already cached from a prior online visit' },
  { feature: 'Checklist (read-only)', detail: 'View your immediate-action checklist items, contact info, and notes' },
  { feature: 'Vault directory', detail: 'See the list of documents designated for you, with names and categories' },
  { feature: 'Essential documents (pinned)', detail: 'Open the gold-outlined Living Will, Healthcare Directive, and POAs you tapped "Make available offline" — full file, no connection needed (25 MB cap each)' },
  { feature: 'Financial designations', detail: 'View bills, debts, accounts, and property assigned to you' },
  { feature: 'Profile & contact info', detail: 'View your account details, primary-beneficiary status, and family connections' },
];

const ONLINE_ONLY = [
  { feature: 'Transition notification', detail: 'Live transition alerts and any newly-released content require a connection' },
  { feature: 'Non-pinned document downloads', detail: 'Documents you have not tapped "Make available offline" still require the network to open' },
  { feature: 'Checklist updates', detail: 'Toggling items complete or accepting AI suggestions queues only when online' },
  { feature: 'AI Guardian chat', detail: 'Conversations with the AI assistant require the AI service' },
  { feature: 'Account creation & login', detail: 'First-time login on a new device requires the server' },
];

export default function BeneficiaryOfflineCapabilitiesCard() {
  return (
    <Card className="glass-card" data-testid="beneficiary-offline-capabilities-card">
      <CardContent className="pt-5 pb-4 space-y-4">
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4" style={{ color: 'var(--gold, #d4af37)' }} />
          <h3 className="font-bold text-[14px]" style={{ color: 'var(--t)' }}>What works offline</h3>
        </div>
        <p className="text-[12px]" style={{ color: 'var(--t2)' }}>
          Once you turn on offline access below, CarryOn caches every estate you&rsquo;re
          connected to so you can read your loved one&rsquo;s plans on a plane, in a
          basement, or anywhere your signal drops. New documents and live transition
          alerts still need a connection — here&rsquo;s the precise scope.
        </p>

        {/* Works fully offline */}
        <div data-testid="ben-offline-cap-works-list" className="space-y-2">
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
                data-testid={`ben-offline-cap-works-${row.feature.replace(/\s+/g, '-').toLowerCase()}`}
              >
                <span aria-hidden style={{ position: 'absolute', left: '-0.95rem', top: 0, color: '#34d399' }}>•</span>
                <strong>{row.feature}</strong>
                <span style={{ color: 'var(--t2)' }}> — {row.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Requires connection */}
        <div data-testid="ben-offline-cap-online-list" className="space-y-2 pt-1">
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
                data-testid={`ben-offline-cap-online-${row.feature.replace(/\s+/g, '-').toLowerCase()}`}
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
          <strong style={{ color: 'var(--t)' }}>Tip:</strong> visit each estate&rsquo;s
          Dashboard, Vault, Messages, and Checklist while online once — that&rsquo;s how
          we cache the readable copy for offline use. Re-visit anytime to refresh.
        </div>
      </CardContent>
    </Card>
  );
}
