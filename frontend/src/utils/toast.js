import { toast as sonnerToast } from 'sonner';
import React from 'react';

/**
 * Custom toast that only shows errors.
 * Errors persist until the user copies the message, then auto-dismiss.
 */
const CopyDismissToast = ({ message, toastId }) => {
  const [copied, setCopied] = React.useState(false);
  
  const handleCopy = async () => {
    try {
      const text = `[CarryOn Error] ${message}\nTime: ${new Date().toISOString()}\nPage: ${window.location.pathname}`;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => sonnerToast.dismiss(toastId), 600);
    } catch {
      // Fallback for iOS
      const ta = document.createElement('textarea');
      ta.value = message;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => sonnerToast.dismiss(toastId), 600);
    }
  };

  return React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' } },
    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
      React.createElement('div', { 
        style: { fontSize: '13px', fontWeight: 700, color: '#F43F5E', marginBottom: '2px' } 
      }, 'Error'),
      React.createElement('div', { 
        style: { fontSize: '12px', lineHeight: '1.4', color: 'var(--t3)', wordBreak: 'break-word' } 
      }, message),
    ),
    React.createElement('button', {
      onClick: handleCopy,
      style: {
        flexShrink: 0,
        padding: '6px 10px',
        borderRadius: '8px',
        fontSize: '11px',
        fontWeight: 700,
        border: '1px solid rgba(244,63,94,0.25)',
        background: copied ? 'rgba(20,184,166,0.15)' : 'rgba(244,63,94,0.08)',
        color: copied ? '#14B8A6' : '#F43F5E',
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
      }
    }, copied ? 'Copied!' : 'Copy & Close')
  );
};

export const toast = {
  error: (message) => {
    const id = `err-${Date.now()}`;
    sonnerToast.custom(
      (t) => React.createElement(CopyDismissToast, { message, toastId: id }),
      { id, duration: Infinity }
    );
  },
  // No-ops for success/info — we only show errors
  success: () => {},
  info: () => {},
};
