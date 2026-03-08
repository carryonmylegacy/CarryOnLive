import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Shield, Phone, Mail, MessageSquare, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Sealed Account Screen — shown when a transitioned benefactor tries to log in.
 * This is their ONLY lifeline if they've been "digitally buried alive."
 * No menu, no navigation, just the sealed notice and Priority 1 Contact Support.
 */
const SealedAccountScreen = ({ transitionedAt, onBack }) => {
  const [p1Contact, setP1Contact] = useState({
    email: 'founder@carryon.us',
    phone: '(808) 585-1156',
    chat_enabled: true,
  });

  useEffect(() => {
    // Fetch P1 contact settings (public — no auth needed for this critical safety feature)
    axios.get(`${API_URL}/founder/p1-contact-settings-public`)
      .then(res => setP1Contact(res.data))
      .catch(() => {});
  }, []);

  const formattedDate = transitionedAt
    ? new Date(transitionedAt).toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })
    : 'an unknown date';

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(180deg, #060a14 0%, #0a1128 50%, #0d1530 100%)',
      }}
      data-testid="sealed-account-screen"
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle at 25% 25%, #d4af37 1px, transparent 1px), radial-gradient(circle at 75% 75%, #d4af37 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <div className="relative w-full max-w-lg">
        {/* Main sealed tile */}
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'rgba(15, 22, 41, 0.8)',
            border: '1px solid rgba(212, 175, 55, 0.15)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
          }}
          data-testid="sealed-notice-card"
        >
          {/* Shield icon */}
          <div className="mx-auto mb-6 w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.2)' }}>
            <Shield className="w-8 h-8" style={{ color: '#d4af37' }} />
          </div>

          <h1 className="text-xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Account Sealed
          </h1>

          <p className="text-sm text-[#94A3B8] leading-relaxed mb-6">
            This account was transitioned on{' '}
            <span className="text-white font-medium">{formattedDate}</span>{' '}
            and is therefore immutably sealed.
          </p>

          <div className="w-full h-px mb-6" style={{ background: 'rgba(212, 175, 55, 0.15)' }} />

          {/* Priority 1 Contact Section */}
          <div
            className="rounded-xl p-5 mb-4 text-left"
            style={{
              background: 'rgba(239, 68, 68, 0.06)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
            data-testid="p1-contact-section"
          >
            <p className="text-xs font-bold text-[#F87171] uppercase tracking-wider mb-3">
              Priority 1 Contact Support
            </p>
            <p className="text-xs text-[#94A3B8] mb-4 leading-relaxed">
              If this was done in error, please contact the CarryOn team immediately
              using any of the options below. This is a{' '}
              <span className="text-[#F87171] font-bold">Priority 1 emergency</span> and
              will be handled with the highest urgency.
            </p>

            <div className="space-y-2">
              {/* Live Chat */}
              {p1Contact.chat_enabled && (
                <a
                  href="/support?priority=p1&reason=sealed_account"
                  className="flex items-center gap-3 p-3 rounded-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                  }}
                  data-testid="p1-live-chat-btn"
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
                    <MessageSquare className="w-4 h-4 text-[#F87171]" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Live Chat</div>
                    <div className="text-[10px] text-[#94A3B8]">Priority 1 — Immediate response</div>
                  </div>
                </a>
              )}

              {/* Email */}
              <a
                href={`mailto:${p1Contact.email}?subject=PRIORITY%201%3A%20Sealed%20Account%20Emergency&body=My%20account%20has%20been%20sealed%20in%20error.%20Please%20help%20immediately.`}
                className="flex items-center gap-3 p-3 rounded-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                }}
                data-testid="p1-email-btn"
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(59, 130, 246, 0.15)' }}>
                  <Mail className="w-4 h-4 text-[#60A5FA]" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Email</div>
                  <div className="text-[10px] text-[#94A3B8]">{p1Contact.email}</div>
                </div>
              </a>

              {/* Phone */}
              <a
                href={`tel:${p1Contact.phone.replace(/[^\d+]/g, '')}`}
                className="flex items-center gap-3 p-3 rounded-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                }}
                data-testid="p1-phone-btn"
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
                  <Phone className="w-4 h-4 text-[#34D399]" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Call</div>
                  <div className="text-[10px] text-[#94A3B8]">{p1Contact.phone}</div>
                </div>
              </a>
            </div>
          </div>

          {/* Back to login */}
          <Button
            variant="ghost"
            className="text-xs text-[#64748B] hover:text-white mt-2"
            onClick={onBack}
            data-testid="sealed-back-btn"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Back to login
          </Button>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-[#334155] mt-6">
          CarryOn™ · AES-256-GCM Encrypted · Zero-Knowledge Architecture
        </p>
      </div>
    </div>
  );
};

export default SealedAccountScreen;
