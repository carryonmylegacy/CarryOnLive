/**
 * MobileNav configuration — dock registry, scope utilities, admin portal definitions.
 * Imported by MobileNav.js, DockCustomizer.js, and any other layout consumers.
 */
import {
  FolderLock,
  MessageSquare,
  Users,
  Shield,
  Sparkles,
  CheckSquare,
  Settings,
  Home,
  FileKey,
  Headphones,
  ShieldCheck,
  KeyRound,
  Clock,
  Megaphone,
  HeartPulse,
  AlertTriangle,
  BookOpen,
  Search,
  StickyNote,
  Heart,
  Gift,
  MessageCircle,
  DollarSign,
} from 'lucide-react';

// ── Complete registry of all dock-eligible items by role group ──
// Used by both the dock customizer (settings) and the bottom nav renderer.
// Labels are short acronyms because mobile dock cells are narrow. Full
// names are surfaced in the desktop Sidebar + each page's own H1.
export const DOCK_REGISTRY = {
  benefactor: [
    { to: '/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/beneficiaries', icon: Users, label: 'Benefic.' },
    { to: '/messages', icon: MessageSquare, label: 'MM' },
    { to: '/vault', icon: FolderLock, label: 'SDV' },
    { to: '/guardian', icon: Sparkles, label: 'EGA' },
    { to: '/financial', icon: DollarSign, label: 'CFP' },
    { to: '/connected-protocol', icon: Shield, label: 'CCP' },
    { to: '/estate-chat', icon: MessageCircle, label: 'ECT' },
    { to: '/checklist', icon: CheckSquare, label: 'IAC' },
    { to: '/trustee', icon: Shield, label: 'DTS' },
    { to: '/ffn', icon: Heart, label: 'FFN' },
    { to: '/digital-wallet', icon: KeyRound, label: 'DAV' },
    { to: '/timeline', icon: Clock, label: 'EPT' },
  ],
  beneficiary: [
    { to: '/beneficiary', icon: Home, label: 'Dashboard' },
    { to: '/beneficiary/vault', icon: FolderLock, label: 'SDV' },
    { to: '/beneficiary/concierge', icon: BookOpen, label: 'BEC' },
    { to: '/beneficiary/checklist', icon: CheckSquare, label: 'IAC' },
    { to: '/beneficiary/messages', icon: MessageSquare, label: 'MM' },
    { to: '/beneficiary/milestone', icon: Gift, label: 'Milestone' },
    { to: '/beneficiary/estate-chat', icon: MessageCircle, label: 'ECT' },
    { to: '/beneficiary/connected-protocol', icon: Shield, label: 'CCP' },
    { to: '/beneficiary/financial', icon: DollarSign, label: 'CFP' },
  ],
  admin: [
    { to: '/admin', icon: Home, label: 'Dashboard' },
    { to: '/admin/transition', icon: FileKey, label: 'TVT' },
    { to: '/admin/support', icon: Headphones, label: 'Support' },
    { to: '/admin/dts', icon: Shield, label: 'DTS' },
    { to: '/admin/verifications', icon: ShieldCheck, label: 'Verify' },
    { to: '/admin/announcements', icon: Megaphone, label: 'Announce' },
    { to: '/admin/system-health', icon: HeartPulse, label: 'Health' },
    { to: '/admin/escalations', icon: AlertTriangle, label: 'Escalate' },
    { to: '/admin/knowledge-base', icon: BookOpen, label: 'KB' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ],
  operator: [
    { to: '/ops', icon: Home, label: 'Dashboard' },
    { to: '/ops/transition', icon: FileKey, label: 'TVT' },
    { to: '/ops/support', icon: Headphones, label: 'Support' },
    { to: '/ops/dts', icon: Shield, label: 'DTS' },
    { to: '/ops/verifications', icon: ShieldCheck, label: 'Verify' },
    { to: '/ops/my-activity', icon: Clock, label: 'Activity' },
    { to: '/ops/search', icon: Search, label: 'Search' },
    { to: '/ops/escalations', icon: AlertTriangle, label: 'Escalate' },
    { to: '/ops/shift-notes', icon: StickyNote, label: 'Notes' },
    { to: '/ops/system-health', icon: HeartPulse, label: 'Health' },
    { to: '/ops/estate-health', icon: HeartPulse, label: 'Estates' },
    { to: '/ops/knowledge-base', icon: BookOpen, label: 'SOPs' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ],
};

// ── Scope utilities ──────────────────────────────────────────────────────────
export const scopeArr = (raw) => Array.isArray(raw) ? raw : (raw ? [raw] : []);
export const hasScope = (raw, target) => scopeArr(raw).includes(target);

// ── Admin portal definitions ─────────────────────────────────────────────────
export const ADMIN_PORTALS = [
  { scope: 'founder', label: 'Founder Portal', color: '#d4af37' },
  { scope: 'ops_manager', label: 'Operations Portal', color: '#E87040', altScope: 'ops_team' },
  { scope: 'finance', label: 'Finance Portal', color: '#22C993' },
  { scope: 'compliance', label: 'Compliance Portal', color: '#3B82F6' },
  { scope: 'marketing', label: 'Marketing Portal', color: '#B794F6' },
  { scope: 'platform_health', label: 'Platform Portal', color: '#F59E0B' },
];
