import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ShieldX, Lock } from 'lucide-react';
import { API_URL } from '../config';

const FounderAboutPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // verifying | valid | invalid
  const [reason, setReason] = useState('');
  const iframeRef = useRef(null);
  const markedUsed = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      setReason('no_token');
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch(`${API_URL}/founder-about/verify/${token}`);
        const data = await res.json();
        if (data.valid) {
          setStatus('valid');
          // Mark as used (single-use) — fire and forget
          if (!markedUsed.current) {
            markedUsed.current = true;
            fetch(`${API_URL}/founder-about/use/${token}`, { method: 'POST' }).catch(() => {});
          }
        } else {
          setStatus('invalid');
          setReason(data.reason || 'unknown');
        }
      } catch {
        setStatus('invalid');
        setReason('error');
      }
    };
    verify();
  }, [token]);

  if (status === 'verifying') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#0d1b2a' }} data-testid="founder-page-loading">
        <Loader2 className="w-10 h-10 text-[#d4af37] animate-spin mb-4" />
        <p className="text-[#9aa5b4] text-sm">Verifying your invitation...</p>
      </div>
    );
  }

  if (status === 'invalid') {
    const messages = {
      not_found: 'This invitation link is not valid.',
      revoked: 'This invitation has been revoked by the Founder.',
      already_used: 'This invitation has already been used. Each link is single-use.',
      no_token: 'No invitation token provided.',
      error: 'Unable to verify your invitation. Please try again.',
    };

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#0d1b2a' }} data-testid="founder-page-denied">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)' }}>
            {reason === 'already_used' ? <Lock className="w-9 h-9 text-[#d4af37]" /> : <ShieldX className="w-9 h-9 text-[#d4af37]" />}
          </div>
          <h1 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>Access Restricted</h1>
          <p className="text-[#9aa5b4] text-base mb-8 leading-relaxed">{messages[reason] || messages.error}</p>
          <button
            onClick={() => navigate('/about')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all hover:brightness-110 active:scale-95"
            style={{ background: '#d4af37', color: '#0d1b2a' }}
            data-testid="founder-page-back-btn"
          >
            Visit About CarryOn
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#0d1b2a' }} data-testid="founder-page-content">
      <iframe
        ref={iframeRef}
        src="/founder-story.html"
        title="About the Founder"
        className="w-full border-0"
        style={{ minHeight: '100vh', height: '100%' }}
        onLoad={() => {
          // Auto-resize iframe to content height
          try {
            const iframe = iframeRef.current;
            if (iframe?.contentDocument?.body) {
              iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px';
            }
          } catch {
            // Cross-origin — fallback to viewport height
            if (iframeRef.current) iframeRef.current.style.height = '100vh';
          }
        }}
      />
    </div>
  );
};

export default FounderAboutPage;
