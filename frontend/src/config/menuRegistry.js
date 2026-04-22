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
 * Benefactor feature registry — desktop sidebar uses the LayoutDashboard
 * icon for /dashboard while mobile uses Home. To keep a single registry
 * we expose both and let each consumer pick via `iconDesktop` / `iconMobile`.
 * (For simplicity most items use the same icon across surfaces.)
 */
export const BENEFACTOR_FEATURE_REGISTRY = [
  { to: '/dashboard',            icon: LayoutDashboard, iconMobile: Home, label: 'Dashboard' },
  { to: '/beneficiaries',        icon: Users,           label: 'Beneficiaries' },
  { to: '/messages',             icon: MessageSquare,   label: 'Milestone Messages (MM)' },
  { to: '/vault',                icon: FolderLock,      label: 'Secure Document Vault (SDV)' },
  { to: '/guardian',             icon: Sparkles,        label: 'Estate Guardian AI (EGA)' },
  { to: '/financial',            icon: DollarSign,      label: 'CarryOn Financial Picture (CFP)' },
  { to: '/connected-protocol',   icon: Shield,          label: 'CarryOn Contingency Protocols (CCP)' },
  { to: '/estate-chat',          icon: MessageCircle,   label: 'Estate Comms Tool (ECT)', hasBadge: 'ectUnread' },
  { to: '/checklist',            icon: CheckSquare,     label: 'Immediate Action Checklist (IAC)' },
  { to: '/trustee',              icon: Shield,          label: 'Designated Trustee Services (DTS)' },
  { to: '/ffn',                  icon: Heart,           label: 'Family & Friends Notification (FFN)' },
  { to: '/digital-wallet',       icon: KeyRound,        label: 'Digital Access Vault (DAV)' },
  { to: '/timeline',             icon: Clock,           label: 'Estate Plan Timeline (EPT)' },
];

export const BENEFICIARY_FEATURE_REGISTRY = [
  { to: '/beneficiary',                     icon: LayoutDashboard, iconMobile: Home, label: 'Dashboard' },
  { to: '/beneficiary/vault',               icon: FolderLock,      label: 'Secure Document Vault (SDV)' },
  { to: '/beneficiary/guardian',            icon: Sparkles,        label: 'Estate Guardian (EGA)' },
  { to: '/beneficiary/checklist',           icon: CheckSquare,     label: 'Immediate Action Checklist (IAC)' },
  { to: '/beneficiary/messages',            icon: MessageSquare,   label: 'Milestone Messages (MM)' },
  { to: '/beneficiary/milestone',           icon: Gift,            iconDesktop: Home, label: 'Report Milestone' },
  { to: '/beneficiary/estate-chat',         icon: MessageCircle,   label: 'Estate Comms Tool (ECT)', hasBadge: 'ectUnread' },
  { to: '/beneficiary/connected-protocol',  icon: Shield,          label: 'CarryOn Contingency Protocols (CCP)' },
  { to: '/beneficiary/financial',           icon: DollarSign,      label: 'CarryOn Financial Picture (CFP)' },
];

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
