/**
 * Constants extracted from TrusteePage.js (Feb 2026 monolith reduction).
 *
 * No state, no React hooks — safe to import from anywhere.
 */
import { Bell, DollarSign, Flame, Lock, Mail, Package } from 'lucide-react';

export const HOW_IT_WORKS = [
  '1. Submit a request describing your task',
  '2. DTS team reviews & sends itemized quote',
  '3. You approve/reject each line item',
  '4. Provide payment (charged only upon transition)',
  '5. Add any required credentials',
  '6. Task executes after verified transition',
];

// Stripe Card Element styles
export const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      '::placeholder': {
        color: '#64748b',
      },
      backgroundColor: 'transparent',
    },
    invalid: {
      color: '#ef4444',
    },
  },
};

export const typeConfig = {
  delivery: { icon: Package, label: 'Delivery / Mailing', desc: 'Send packages, letters, cash, or items to a recipient', color: '#8b5cf6' },
  account_closure: { icon: Lock, label: 'Account Closure', desc: 'Close online accounts, delete data, terminate billing', color: '#f97316' },
  financial: { icon: DollarSign, label: 'Financial Transfer', desc: 'Wire transfers, payments, or fund distributions', color: '#22c993' },
  communication: { icon: Mail, label: 'Communication', desc: 'Send messages, emails, or notifications on your behalf', color: '#3b82f6' },
  transition_notification: { icon: Bell, label: 'Transition Notification', desc: 'Confidentially notify a specific person of your passing', color: '#d4af37' },
  destruction: { icon: Flame, label: 'Data / Asset Destruction', desc: 'Destroy physical materials, devices, or digital data', color: '#ef4444' },
};

export const confConfig = {
  full: { label: 'Fully Confidential', desc: 'No one you have not named will be told about this task.', color: '#F98080', bg: 'rgba(240,82,82,0.1)' },
  partial: { label: 'Partial Disclosure', desc: 'Specific individuals you name will be notified upon completion.', color: '#FFCB57', bg: 'rgba(245,166,35,0.1)' },
  timed: { label: 'Timed Release', desc: 'Confidential for a set period, then disclosed to designated people.', color: '#7AABFD', bg: 'rgba(59,123,247,0.1)' },
};

export const statusConfig = {
  submitted: { label: 'Submitted — Awaiting Quote', color: 'var(--bl3)', bg: 'var(--blbg)' },
  quoted: { label: 'Quote Ready — Review Required', color: 'var(--yw)', bg: 'var(--ywbg)' },
  approved: { label: 'Approved — Payment Set', color: 'var(--gn2)', bg: 'var(--gnbg)' },
  ready: { label: 'Ready for Execution', color: 'var(--gn2)', bg: 'var(--gnbg)' },
};
