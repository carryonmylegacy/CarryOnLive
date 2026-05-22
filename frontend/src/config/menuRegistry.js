/**
 * Shared source of truth for the feature-section of the navigation menu.
 *
 * Sidebar.js (desktop), MobileNav.js (hamburger), and MenuOrderCustomizer
 * (the user-facing reorder UI in Settings) all read from here so there's
 * exactly one list per role.
 *
 * IMPORTANT — what this file IS NOT:
 *  - It does NOT perform tier gating. Callers must run the returned array
 *    through `filterNavByFeatures(items, enabledFeatures)` just like the
 *    existing code does. The admin's per-tier feature config remains the
 *    source of truth for *which* routes a user can see.
 *  - It does NOT include "Account" items (Settings / Subscription /
 *    Security Settings / Support / Sign Out). Those are anchored below the
 *    divider in each nav component and are not user-reorderable.
 */

import {
  LayoutDashboard, Home, Users, MessageSquare, CheckSquare, FolderLock,
  Sparkles, Heart, KeyRound, Shield, Clock, MessageCircle, DollarSign, Gift,
} from 'lucide-react';

/**
 * Canonical platform feature order — the SINGLE source of truth.
 *
 * Every surface that lists features (sidebar, mobile hamburger, home
 * page pillars, paywall tiers, admin Subs tab, "menu reset to default")
 * sorts through this. Features missing from a user's tier collapse out
 * silently; the order above is preserved.
 *
 * Audit-only surfaces (e.g., Estate Plan Timeline) are appended AFTER
 * the 12 canonical features in this registry so they still render in
 * places that include them, but never push canonical items down.
 */
export const BENEFACTOR_FEATURE_REGISTRY = [
  { to: '/dashboard',            icon: LayoutDashboard, iconMobile: Home, label: 'Dashboard' },
  { to: '/beneficiaries',        icon: Users,           label: 'Beneficiaries' },
  { to: '/messages',             icon: MessageSquare,   label: 'Milestone Messages (MM)' },
  { to: '/vault',                icon: FolderLock,      label: 'Secure Document Vault (SDV)' },
  { to: '/checklist',            icon: CheckSquare,     label: 'Immediate Action Checklist (IAC)' },
  { to: '/guardian',             icon: Sparkles,        label: 'Estate Guardian AI (EGA)' },
  { to: '/financial',            icon: DollarSign,      label: 'CarryOn Financial Picture (CFP)' },
  { to: '/digital-wallet',       icon: KeyRound,        label: 'Digital Access Vault (DAV)' },
  { to: '/ffn',                  icon: Heart,           label: 'Friends & Family Notification (FFN)' },
  { to: '/connected-protocol',   icon: Shield,          label: 'CarryOn Contingency Protocols (CCP)' },
  { to: '/estate-chat',          icon: MessageCircle,   label: 'Estate Comms Tool (ECT)', hasBadge: 'ectUnread' },
  { to: '/trustee',              icon: Shield,          label: 'Designated Trustee Services (DTS)' },
  // ── Audit-only / non-pillar surfaces ──────────────────────────────
  // Below this line are NOT user pillars and never appear in paywall
  // tiers or the home page pillar list. They render in the side menu
  // only when access is granted (e.g., admin enables audit tools).
  { to: '/timeline',             icon: Clock,           label: 'Estate Plan Timeline (EPT)' },
];

export const BENEFICIARY_FEATURE_REGISTRY = [
  { to: '/beneficiary',                     icon: LayoutDashboard, iconMobile: Home, label: 'Dashboard' },
  { to: '/beneficiary/messages',            icon: MessageSquare,   label: 'Milestone Messages (MM)' },
  { to: '/beneficiary/vault',               icon: FolderLock,      label: 'Secure Document Vault (SDV)' },
  { to: '/beneficiary/checklist',           icon: CheckSquare,     label: 'Immediate Action Checklist (IAC)' },
  { to: '/beneficiary/guardian',            icon: Sparkles,        label: 'Estate Guardian (EGA)' },
  { to: '/beneficiary/financial',           icon: DollarSign,      label: 'CarryOn Financial Picture (CFP)' },
  { to: '/beneficiary/connected-protocol',  icon: Shield,          label: 'CarryOn Contingency Protocols (CCP)' },
  { to: '/beneficiary/estate-chat',         icon: MessageCircle,   label: 'Estate Comms Tool (ECT)', hasBadge: 'ectUnread' },
  { to: '/beneficiary/milestone',           icon: Gift,            iconDesktop: Home, label: 'Report Milestone' },
];

/**
 * Canonical pillar key order — for surfaces that key by feature_id
 * rather than route (paywall tiles, admin Subs tab, FeatureGate's
 * not-on-plan hint). Sort any list of pillar keys through this.
 */
export const CANONICAL_PILLAR_ORDER = [
  'beneficiaries', // Beneficiaries
  'mm',            // Milestone Messages
  'sdv',           // Secure Document Vault
  'iac',           // Immediate Action Checklist
  'ega',           // Estate Guardian AI
  'cfp',           // CarryOn Financial Picture
  'ces',           // CarryOn Entities & Structures
  'dav',           // Digital Access Vault
  'ffn',           // Friends & Family Notification
  'ccp',           // CarryOn Contingency Protocols
  'ect',           // Estate Comms Tool
  'dts',           // Designated Trustee Services
];

/** Stable-sort a list of pillar objects by `CANONICAL_PILLAR_ORDER`. */
export const sortByCanonicalPillarOrder = (items, keyOf = (x) => x.id || x.key) => {
  const idx = new Map(CANONICAL_PILLAR_ORDER.map((k, i) => [k, i]));
  return [...items].sort((a, b) => {
    const ai = idx.has(keyOf(a)) ? idx.get(keyOf(a)) : 999;
    const bi = idx.has(keyOf(b)) ? idx.get(keyOf(b)) : 999;
    return ai - bi;
  });
};

/**
 * Apply the user's saved menu order (from GET /api/user-preferences/menu-order)
 * to an already-tier-filtered list of menu items. This is the ONLY reorder
 * step — gating happens before this runs.
 *
 *  - Items in `savedOrder` keep their saved position (if still accessible).
 *  - Items NOT in `savedOrder` (newly-granted features) are appended
 *    at the bottom in their registry order.
 *  - Items in `savedOrder` but no longer accessible (revoked features)
 *    are silently dropped — no broken links.
 */
export const applyUserMenuOrder = (items, savedOrder) => {
  if (!Array.isArray(savedOrder) || savedOrder.length === 0) return items;
  const byRoute = new Map(items.map((i) => [i.to, i]));
  const seen = new Set();
  const ordered = [];
  for (const route of savedOrder) {
    const item = byRoute.get(route);
    if (item && !seen.has(route)) {
      ordered.push(item);
      seen.add(route);
    }
  }
  for (const item of items) {
    if (!seen.has(item.to)) ordered.push(item);
  }
  return ordered;
};
