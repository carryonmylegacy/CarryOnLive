import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ADMIN_SECTIONS, sectionRgb } from '../../config/adminSections';

/**
 * AdminSectionLayout
 * ──────────────────
 * Renders an admin section page with:
 *   • Gradient fade background (top-left, fading down/right) keyed to
 *     the section's accent color — matches the benefactor portal
 *     section header style (MessagesPage / VaultPage etc.).
 *   • Header tile: section icon in a soft gradient chip + section
 *     name (Cormorant-serif sized) + subtle subtitle.
 *   • Horizontal pill tab bar of THIS section's tabs only.
 *   • Tab content area (children).
 *
 * Created May 21 2026 — Admin Portal restructure (Section → Tab IA).
 */
const AdminSectionLayout = ({
  sectionKey,
  activeTabKey,
  scopeParam,
  pendingAccessReqs = 0,
  children,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const section = ADMIN_SECTIONS.find(s => s.key === sectionKey);
  if (!section) return children || null;

  const rgb = sectionRgb(section.color);
  const Icon = section.icon;

  // First tab is the "Overview" landing for the section. When we're at
  // /admin/<sectionKey> exactly, activeTabKey is undefined — light up
  // the first child so the tab bar still shows the user where they are.
  const effectiveTab = activeTabKey || section.tabs[0]?.key;

  return (
    <div
      className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in max-w-full overflow-x-hidden"
      data-testid={`admin-section-${section.key}`}
      style={{
        background: `radial-gradient(ellipse at top left, rgba(${rgb}, 0.18), transparent 55%), radial-gradient(ellipse at bottom right, rgba(${rgb}, 0.07), transparent 55%)`,
      }}
    >
      {/* Section Header — gradient icon chip + serif title */}
      <div className="flex items-center gap-3" data-testid={`section-header-${section.key}`}>
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, rgba(${rgb}, 0.22), rgba(${rgb}, 0.10))`,
            border: `1px solid rgba(${rgb}, 0.25)`,
          }}
        >
          <Icon className="w-5 h-5" style={{ color: section.color }} />
        </div>
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold text-[var(--t)]"
            style={{ fontFamily: 'var(--sans)' }}
          >
            {section.label}
          </h1>
          <p className="text-xs text-[var(--t5)]">
            {section.tabs.length} tab{section.tabs.length === 1 ? '' : 's'} ·{' '}
            {section.key === 'operations' && 'Users, support, verifications, ops queue'}
            {section.key === 'finance' && 'Subscriptions, partners, revenue, trials'}
            {section.key === 'marketing' && 'Funnel, beta, emails, announcements'}
            {section.key === 'compliance' && 'Audit, estate health, activity logs'}
            {section.key === 'platform' && 'System health, integrations, schedules'}
            {section.key === 'admin' && 'Accounts, IP, sessions, maintenance'}
          </p>
        </div>
      </div>

      {/* Section Tab Bar — pills for THIS section only */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide items-center"
        data-testid="admin-section-tab-bar"
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {section.tabs.map(t => {
          const isActive = effectiveTab === t.key;
          const target = scopeParam ? `${t.path}?scope=${scopeParam}` : t.path;
          return (
            <button
              key={t.key}
              onClick={() => navigate(target)}
              className={`flex items-center gap-1.5 rounded-lg font-bold transition-all whitespace-nowrap flex-shrink-0 active:scale-[0.97] px-3 py-2 text-xs ${
                isActive ? 'gold-pill' : 'bg-[var(--s)] text-[var(--t4)]'
              }`}
              data-testid={`admin-tab-${t.key}`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
              {t.key === 'founder-invites' && pendingAccessReqs > 0 && (
                <span
                  className="ml-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold leading-none"
                  style={{ background: '#ef4444', color: '#fff' }}
                >
                  {pendingAccessReqs}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ minHeight: '60vh' }}>{children}</div>
    </div>
  );
};

export default AdminSectionLayout;
