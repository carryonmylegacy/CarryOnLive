/**
 * PartnerGuidePanel — collapsible "how it works" guide on the Partner Portal.
 * Answers the two most common partner questions:
 *  1. How do I get access to a client's account? (You already have it.)
 *  2. How do beneficiary accounts link up to Estate Chat / text & email comms?
 */

import React, { useEffect, useState } from 'react';
import { BookOpen, ChevronDown, KeySquare, Loader2, Mail, MessagesSquare, ShieldOff, CheckCircle2 } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

const SEEN_KEY = 'carryon_partner_guide_seen';

const Step = ({ n, children }) => (
  <li className="flex items-start gap-2.5">
    <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
      style={{ background: 'rgba(var(--gold-rgb),0.16)', color: 'var(--gold)', border: '1px solid rgba(var(--gold-rgb),0.35)' }}>
      {n}
    </span>
    <span className="text-[13px] text-[var(--t3)] leading-relaxed">{children}</span>
  </li>
);

const B = ({ children }) => <span className="font-bold text-[var(--t)]">{children}</span>;

export const PartnerGuidePanel = () => {
  const [open, setOpen] = useState(() => {
    try { return !window.localStorage.getItem(SEEN_KEY); } catch { return false; }
  });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    try { window.localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
  }, []);

  const emailGuide = async () => {
    const email = window.prompt('Email the one-page Partner Guide to which address?', '');
    if (!email || !email.trim()) return;
    setSending(true);
    try {
      const token = window.localStorage.getItem('carryon_manager_token');
      await apiClient.post(`${API_URL}/manager/send-guide`, { email: email.trim() },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
      toast.success(`Guide emailed to ${email.trim()}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send the guide');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="glass-card mb-5 overflow-hidden" data-testid="partner-guide-panel">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
        data-testid="partner-guide-toggle"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5">
          <BookOpen className="w-4 h-4 text-[var(--gold)] flex-shrink-0" />
          <span className="text-sm font-bold text-[var(--t)]">Partner Guide — client access &amp; beneficiary communications</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-[var(--t5)] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-5 grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
          {/* Client access */}
          <div className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
            data-testid="partner-guide-access-section">
            <h4 className="flex items-center gap-2 text-[13px] font-bold text-[var(--t)] mb-2.5">
              <KeySquare className="w-4 h-4 text-[var(--gold)]" /> Working in a client&apos;s account
            </h4>
            <p className="text-[13px] text-[var(--t3)] leading-relaxed mb-2.5">
              <B>You are already authorized for every client on this roster.</B> Tap <B>Enter Portal</B> on
              any client row to work inside their account — upload documents, complete their CarryOn sections,
              add beneficiaries, and prepare everything on their behalf. Your clients never need to grant or
              approve anything; this access comes built into your partnership.
            </p>
            <p className="text-[13px] text-[var(--t3)] leading-relaxed mb-3">
              The <B>Trustee Access</B> card your clients see in their own Settings is a separate feature — it
              lets them invite a family member or personal trustee into their portal. It is not required for
              you and there is nothing your client needs to do there to authorize your help.
            </p>
            <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#fca5a5] mb-1">
                <ShieldOff className="w-3.5 h-3.5" /> Always off-limits in a client&apos;s account
              </p>
              <p className="text-[12px] text-[var(--t4)] leading-relaxed">
                Milestone Messages (personal letters — not even viewable), password / email / 2FA changes,
                billing &amp; subscription changes, and estate deletion. Everything else is open to you, and every
                action you take is recorded in the client&apos;s audit trail.
              </p>
            </div>
          </div>

          {/* Beneficiary comms */}
          <div className="rounded-xl p-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
            data-testid="partner-guide-ecomm-section">
            <h4 className="flex items-center gap-2 text-[13px] font-bold text-[var(--t)] mb-2.5">
              <MessagesSquare className="w-4 h-4 text-[var(--gold)]" /> Beneficiary accounts &amp; communications
            </h4>
            <ul className="space-y-2 mb-3">
              <Step n="1"><B>Enter the client&apos;s portal</B> and open their <B>Beneficiaries</B> section. Add each beneficiary with their email address.</Step>
              <Step n="2">Tap <B>Invite</B> on the beneficiary&apos;s card. They receive an email with a button to create their own CarryOn account.</Step>
              <Step n="3">When they accept, their account links automatically — the card shows <B>Account Linked</B>. From then on they can use <B>Estate Chat</B>, CarryOn&apos;s secure communication tool, and receive notifications in-app and by email.</Step>
            </ul>
            <div className="rounded-lg p-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--gn2)] mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Text &amp; email without an account
              </p>
              <p className="text-[12px] text-[var(--t4)] leading-relaxed">
                For trusted contacts who won&apos;t create an account, add them under <B>Friends &amp; Family
                Notification (FFN)</B> in the client&apos;s portal with a mobile number and email. When they are
                included in an Estate Chat conversation, every message is relayed to them by text and email
                automatically.
              </p>
            </div>
          </div>

          {/* Email-me-this-guide footer */}
          <div className="lg:col-span-2 flex flex-col sm:flex-row sm:items-center gap-2 justify-between rounded-xl p-3"
            style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <p className="text-[12px] text-[var(--t4)]">
              Want a copy for your records or your team? We&apos;ll send this guide as a one-page email.
            </p>
            <button onClick={emailGuide} disabled={sending}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors"
              style={{ color: 'var(--gold)', border: '1px solid rgba(var(--gold-rgb),0.4)', background: 'rgba(var(--gold-rgb),0.08)' }}
              data-testid="partner-guide-email-btn">
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Email me this guide
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartnerGuidePanel;
