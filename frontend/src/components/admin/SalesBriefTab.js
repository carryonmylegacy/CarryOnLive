import React, { useMemo, useState } from 'react';
import { Copy, ExternalLink, Mail, Check, FileText } from 'lucide-react';

/**
 * SalesBriefTab — Admin → Marketing → Sales Brief.
 *
 * Surfaces the public, shareable Partner Brief URL so the founder can
 * copy it into emails, DMs, calendar invites, or hand it to the
 * marketing team / assistant. The brief itself lives at
 * /partner-brief (public, no auth).
 */
export default function SalesBriefTab() {
  const [copied, setCopied] = useState(null);

  const briefUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/partner-brief';
    return `${window.location.origin}/partner-brief`;
  }, []);

  const emailSubject = encodeURIComponent('CarryOn — Partner Brief');
  const emailBody = encodeURIComponent(
    `Hi,\n\nThanks for your interest in a CarryOn partnership. Here is a brief overview of the platform and how it tends to map to partners in your space:\n\n${briefUrl}\n\nWhen you've had a chance to read it, my team will set up a short discovery call so I can walk you through it on the live platform.\n\nBest,\n`
  );

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="sales-brief-tab">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-[var(--t)] mb-1" style={{ fontFamily: 'var(--sans)' }}>
          Sales Brief
        </h1>
        <p className="text-sm text-[var(--t4)] leading-relaxed">
          A public, shareable overview of CarryOn for B2B partners — built for your assistant to use as a screening reference and for you to forward to anyone who reaches out about partnerships.
          The link is public; anyone with it can read the brief. No login required.
        </p>
      </div>

      {/* Primary card — copy link */}
      <div className="glass-card p-5 lg:p-6" style={{ borderLeft: '3px solid var(--gold)' }}>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-5 h-5 text-[var(--gold)]" />
          <h2 className="text-lg font-bold text-[var(--t)]">Shareable link</h2>
        </div>
        <p className="text-xs text-[var(--t5)] mb-3">
          Paste this URL into an email, DM, or calendar invite. It opens a clean, branded page anyone can read on phone or desktop.
        </p>

        {/* URL display + copy */}
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3"
          style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
        >
          <code
            className="flex-1 text-xs lg:text-sm font-mono text-[var(--t2)] truncate"
            data-testid="sales-brief-url"
          >
            {briefUrl}
          </code>
          <button
            onClick={() => copy(briefUrl, 'url')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0"
            style={{
              background: copied === 'url' ? 'rgba(34,197,94,0.18)' : 'linear-gradient(135deg,#d4af37,#b8962e)',
              color: copied === 'url' ? '#86efac' : '#080e1a',
              border: copied === 'url' ? '1px solid rgba(34,197,94,0.4)' : 'none',
            }}
            data-testid="sales-brief-copy-link"
          >
            {copied === 'url' ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy link</>}
          </button>
        </div>

        {/* Action row */}
        <div className="flex flex-wrap gap-2">
          <a
            href={briefUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
            style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.35)', color: '#60A5FA' }}
            data-testid="sales-brief-open"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open brief
          </a>
          <a
            href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
            style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.35)', color: '#A78BFA' }}
            data-testid="sales-brief-email"
          >
            <Mail className="w-3.5 h-3.5" /> Compose email
          </a>
          <button
            onClick={() => copy(`${decodeURIComponent(emailBody)}`, 'body')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
            style={{ background: 'var(--s)', border: '1px solid var(--b2)', color: 'var(--t3)' }}
            data-testid="sales-brief-copy-body"
          >
            {copied === 'body' ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy email body</>}
          </button>
        </div>
      </div>

      {/* What’s in the brief */}
      <div className="glass-card p-5">
        <h3 className="font-bold text-[var(--t)] mb-2 text-sm">What the brief covers</h3>
        <ul className="text-xs text-[var(--t3)] leading-relaxed space-y-1.5 list-disc pl-5">
          <li>One-sentence positioning every team member can use verbatim.</li>
          <li>The Nine Pillars of Family Readiness with plain-language descriptions (canonical names only — no paraphrasing).</li>
          <li>Use-case playbooks for life insurance, financial planners, funeral homes, and estate-planning attorneys.</li>
          <li>Adjacent verticals: employee-benefits brokers, hospice, faith communities, military / veteran orgs, senior living.</li>
          <li>Screening posture, qualifying questions, capture checklist, and the list of topics escalated only to the founder.</li>
          <li>Quick-reference elevator one-liners for each pillar.</li>
        </ul>
      </div>

      {/* Source-of-truth note */}
      <div className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
        <p className="text-xs text-[var(--t5)] leading-relaxed">
          <strong className="text-[var(--t3)]">Source of truth:</strong> the canonical pillar names are stored in
          <code className="text-[var(--gold)] mx-1">memory/AGENT_RULES.md</code>. To update the brief’s content,
          edit <code className="text-[var(--gold)] mx-1">frontend/src/pages/PartnerBriefPage.js</code>. The page is
          a critical pathway — do not delete the route or component without explicit confirmation.
        </p>
      </div>
    </div>
  );
}
