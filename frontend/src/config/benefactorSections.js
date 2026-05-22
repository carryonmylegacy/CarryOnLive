// ── Benefactor section registry (single source of truth) ──────────
// Used by Sidebar / MobileNav (to render the 4 expandable section
// pills) and by the new section-styled feature pages (e.g. the new
// Entities & Structures page) to read their per-section accent +
// gradient header colors.
//
// Mirrors the visual format of `adminSections.js` so the benefactor
// portal menu reads like the admin portal: each section is a
// permanently-shaded high-contrast pill, expandable inline to reveal
// its child feature routes.
//
// Created May 22 2026 — Benefactor Portal restructure (4-section IA).
//
// Order preserved exactly as the user specified:
//   ESTATE → VAULT → FINANCIAL → PREPAREDNESS

import {
  Landmark, Lock, Coins, Siren,
  Users, MessageSquare, Heart, Shield, Clock,
  FolderLock, KeyRound, Sparkles,
  DollarSign, Network,
  CheckSquare, MessageCircle,
} from 'lucide-react';

export const BENEFACTOR_SECTIONS = [
  {
    key: 'estate',
    label: 'Legacy',
    icon: Landmark,
    color: '#3B82F6', // blue
    pill: {
      bgLight: 'rgba(219, 234, 254, 0.95)',
      bgLightHover: 'rgba(191, 219, 254, 1)',
      textLight: '#1d4fa8',
      bgDark: 'linear-gradient(135deg, #3B82F6, #2d6ad6)',
      bgDarkHover: 'linear-gradient(135deg, #5097ff, #3f7ee8)',
      textDark: '#06162e',
    },
    blurb: 'People, plan, audit trail',
    tabs: [
      { key: 'beneficiaries', label: 'Beneficiaries', icon: Users, path: '/beneficiaries', featureKey: 'beneficiaries' },
      { key: 'mm', label: 'Milestone Messages (MM)', icon: MessageSquare, path: '/messages', featureKey: 'mm' },
      { key: 'ffn', label: 'Friends & Family Notification (FFN)', icon: Heart, path: '/ffn', featureKey: 'ffn' },
      { key: 'dts', label: 'Designated Trustee Services (DTS)', icon: Shield, path: '/trustee', featureKey: 'dts' },
      { key: 'ept', label: 'Estate Plan Timeline (EPT)', icon: Clock, path: '/timeline', featureKey: 'timeline' },
    ],
  },
  {
    key: 'vault',
    label: 'Vault',
    icon: Lock,
    color: '#d4af37', // brand gold
    pill: {
      bgLight: 'rgba(254, 249, 231, 0.95)',
      bgLightHover: 'rgba(252, 243, 202, 1)',
      textLight: '#7a5c00',
      bgDark: 'linear-gradient(135deg, #d4af37, #b8962e)',
      bgDarkHover: 'linear-gradient(135deg, #e0bd47, #c9a338)',
      textDark: '#080e1a',
    },
    blurb: 'Documents, credentials, AI gap finder',
    tabs: [
      { key: 'sdv', label: 'Secure Document Vault (SDV)', icon: FolderLock, path: '/vault', featureKey: 'sdv' },
      { key: 'dav', label: 'Digital Access Vault (DAV)', icon: KeyRound, path: '/digital-wallet', featureKey: 'dav' },
      { key: 'ega', label: 'Estate Guardian AI (EGA)', icon: Sparkles, path: '/guardian', featureKey: 'ega' },
    ],
  },
  {
    key: 'financial',
    label: 'Financial',
    icon: Coins,
    color: '#22C993', // emerald
    pill: {
      bgLight: 'rgba(220, 252, 231, 0.95)',
      bgLightHover: 'rgba(187, 247, 208, 1)',
      textLight: '#0a614a',
      bgDark: 'linear-gradient(135deg, #22C993, #1ba87d)',
      bgDarkHover: 'linear-gradient(135deg, #2dd4a4, #1fc491)',
      textDark: '#062318',
    },
    blurb: 'Money picture and entity structure',
    tabs: [
      { key: 'cfp', label: 'CarryOn Financial Picture (CFP)', icon: DollarSign, path: '/financial', featureKey: 'cfp' },
      { key: 'ces', label: 'CarryOn Entities & Structures (CES)', icon: Network, path: '/entities', featureKey: 'ces' },
    ],
  },
  {
    key: 'preparedness',
    label: 'Preparedness',
    icon: Siren,
    color: '#B794F6', // purple
    pill: {
      bgLight: 'rgba(243, 232, 255, 0.95)',
      bgLightHover: 'rgba(233, 213, 255, 1)',
      textLight: '#4b25a0',
      bgDark: 'linear-gradient(135deg, #B794F6, #9a72e0)',
      bgDarkHover: 'linear-gradient(135deg, #c4a4ff, #ab85ee)',
      textDark: '#1a0f30',
    },
    blurb: 'Crisis playbook and family hotline',
    tabs: [
      { key: 'iac', label: 'Immediate Action Checklist (IAC)', icon: CheckSquare, path: '/checklist', featureKey: 'iac' },
      { key: 'ccp', label: 'CarryOn Contingency Protocols (CCP)', icon: Shield, path: '/connected-protocol', featureKey: 'ccp' },
      { key: 'ect', label: 'Estate Comms Tool (ECT)', icon: MessageCircle, path: '/estate-chat', featureKey: 'ect' },
    ],
  },
];

// Map child path → parent section key (for resolving the active
// section from the current URL).
export const PATH_TO_SECTION = (() => {
  const m = {};
  BENEFACTOR_SECTIONS.forEach(s => s.tabs.forEach(t => { m[t.path] = s.key; }));
  return m;
})();

// Map child path → section accent color (for child pages that want
// to render a section-style gradient header without importing the
// full registry).
export const PATH_TO_SECTION_META = (() => {
  const m = {};
  BENEFACTOR_SECTIONS.forEach(s =>
    s.tabs.forEach(t => { m[t.path] = { sectionKey: s.key, color: s.color, label: s.label }; })
  );
  return m;
})();

// Hex → "r,g,b" so we can build rgba() strings against CSS variables
// without depending on Chrome's hex serialization. (Mirrors
// `adminSections.js::sectionRgb`.)
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
};

export const sectionRgb = (color) => hexToRgb(color);

// Resolve which section a given route belongs to. Falls back to the
// first section if the route isn't mapped (e.g., Dashboard, Settings).
export const sectionForPath = (pathname) => PATH_TO_SECTION[pathname] || null;
