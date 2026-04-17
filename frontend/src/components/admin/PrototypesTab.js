import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { ExternalLink, Eye, Monitor, Smartphone, LayoutDashboard, Sparkles } from 'lucide-react';

/**
 * Prototypes Tab — Founder-only catalog of isolated UI wireframes.
 *
 * These are static HTML files living in /public/mockups/ and are NOT part of
 * the live React app. They exist so the founder can preview future UX ideas
 * safely, without risking regression on production flows.
 *
 * To add a new mockup:
 *   1. Drop the .html file in /app/frontend/public/mockups/
 *   2. Add an entry to the PROTOTYPES array below.
 */
const PROTOTYPES = [
  {
    key: 'dashboard-v2',
    title: 'Dashboard v2',
    subtitle: 'Varsity-grade home tile layout',
    description:
      'Proposed redesign of the main authenticated dashboard. Calmer hierarchy, trust-signalling typography, and a prioritized action rail.',
    href: '/mockups/dashboard-v2.html',
    icon: LayoutDashboard,
    accent: 'var(--bl)',
    tag: 'Desktop & Tablet',
  },
  {
    key: 'onboarding-v2',
    title: 'Onboarding v2',
    subtitle: 'First-run flow (4 steps)',
    description:
      'End-to-end signup + estate creation wireframe. Shows the trust-building copy, progress rail, and legacy hand-off moment.',
    href: '/mockups/onboarding-v2.html',
    icon: Sparkles,
    accent: 'var(--gold)',
    tag: 'Responsive',
  },
  {
    key: 'mobile-key-screens',
    title: 'Mobile Key Screens',
    subtitle: 'Phone-native surfaces',
    description:
      'Critical mobile views: home, Estate Chat, Secure Document Vault, and Connected Protocol. Reviewed at iPhone 13 mini → 17 Pro Max widths.',
    href: '/mockups/mobile-key-screens.html',
    icon: Smartphone,
    accent: 'var(--gn)',
    tag: 'iOS / Android',
  },
];

export function PrototypesTab() {
  const [preview, setPreview] = useState(null); // key of active preview

  return (
    <div className="space-y-6" data-testid="admin-prototypes-tab">
      {/* Header */}
      <Card style={{ background: 'var(--s)', borderColor: 'var(--b)' }}>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div
              className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'var(--seal-bg)', color: 'var(--gold)' }}
            >
              <Monitor className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-semibold" style={{ color: 'var(--t)' }}>
                UX Prototypes
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--t3)' }}>
                Isolated wireframes for proposed redesigns. These are static HTML
                files served from <code>/mockups/</code> and are not wired to
                any backend. Preview below, or open in a new tab for a full
                device-width rendering.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prototype cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {PROTOTYPES.map((p) => {
          const Icon = p.icon;
          const isOpen = preview === p.key;
          return (
            <Card
              key={p.key}
              className="overflow-hidden"
              style={{
                background: 'var(--s)',
                borderColor: isOpen ? p.accent : 'var(--b)',
                transition: 'border-color var(--motion-standard, 200ms ease)',
              }}
              data-testid={`prototype-card-${p.key}`}
            >
              <CardContent className="p-5 flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      color: p.accent,
                    }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-semibold truncate" style={{ color: 'var(--t)' }}>
                        {p.title}
                      </h3>
                      <span
                        className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--s)', color: 'var(--t3)', border: '1px solid var(--b)' }}
                      >
                        {p.tag}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
                      {p.subtitle}
                    </p>
                  </div>
                </div>

                <p className="text-sm leading-relaxed" style={{ color: 'var(--t2)' }}>
                  {p.description}
                </p>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setPreview(isOpen ? null : p.key)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                    style={{
                      background: isOpen ? p.accent : 'var(--s)',
                      color: isOpen ? 'var(--bg)' : 'var(--t)',
                      border: `1px solid ${isOpen ? p.accent : 'var(--b)'}`,
                    }}
                    data-testid={`prototype-preview-btn-${p.key}`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {isOpen ? 'Hide preview' : 'Preview here'}
                  </button>
                  <a
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                    style={{
                      background: 'transparent',
                      color: 'var(--t2)',
                      border: '1px solid var(--b)',
                    }}
                    data-testid={`prototype-open-btn-${p.key}`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open in new tab
                  </a>
                  <span className="text-[11px] ml-auto" style={{ color: 'var(--t4)' }}>
                    {p.href}
                  </span>
                </div>
              </CardContent>

              {/* Inline iframe preview */}
              {isOpen && (
                <div
                  style={{
                    borderTop: `1px solid ${p.accent}`,
                    background: 'var(--bg2)',
                  }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-wider"
                    style={{ color: 'var(--t4)' }}
                  >
                    <span>Live iframe · {p.href}</span>
                    <span>Wireframe only</span>
                  </div>
                  <iframe
                    src={p.href}
                    title={p.title}
                    style={{
                      width: '100%',
                      height: '720px',
                      border: 'none',
                      background: '#0b1222',
                      display: 'block',
                    }}
                    data-testid={`prototype-iframe-${p.key}`}
                  />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Footer hint */}
      <div
        className="text-xs rounded-lg p-4"
        style={{
          background: 'var(--s)',
          border: '1px dashed var(--b)',
          color: 'var(--t3)',
        }}
      >
        <strong style={{ color: 'var(--t2)' }}>Why isolated?</strong> Wireframes
        live outside the React build so visual experiments never risk breaking
        production. Once a prototype is approved, it gets implemented as real
        components — never shipped as raw HTML.
      </div>
    </div>
  );
}

export default PrototypesTab;
