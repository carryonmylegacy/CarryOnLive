/**
 * CarryOn — iOS-Style Notification System
 *
 * Replaces the old Sonner toasts with polished slide-in-from-top notifications
 * that look and feel like native iOS push notifications.
 *
 * Features:
 * - Smooth slide-in from top with spring easing
 * - Auto-dismiss after 4 seconds
 * - Swipe up to dismiss
 * - Quick double vibrate on show
 * - Supports: error, success, info, warning types
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, Bell } from 'lucide-react';
import { haptics } from '../utils/haptics';

// ── Notification Store (pub/sub) ─────────────────────────────────────
let listeners = [];
let notificationQueue = [];
let idCounter = 0;

function subscribe(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

function emit(notification) {
  listeners.forEach(fn => fn(notification));
}

// ── Public API ───────────────────────────────────────────────────────
export const notify = {
  error: (message, options = {}) => dispatch('error', message, options),
  success: (message, options = {}) => dispatch('success', message, options),
  info: (message, options = {}) => dispatch('info', message, options),
  warning: (message, options = {}) => dispatch('warning', message, options),
  /** Push-style notification with app branding */
  push: (title, message, options = {}) => dispatch('push', message, { ...options, title }),
  /** Critical alert — persists longer, stronger vibration */
  critical: (message, options = {}) => dispatch('critical', message, { ...options, duration: 8000 }),
};

function dispatch(type, message, options = {}) {
  const id = ++idCounter;
  const notification = {
    id,
    type,
    message: typeof message === 'string' ? message : String(message || 'Something went wrong'),
    title: options.title || null,
    action: options.action || null,      // { label, onClick }
    duration: options.duration || 4000,
    timestamp: Date.now(),
  };
  emit(notification);
  return id;
}

// ── Type Configurations ──────────────────────────────────────────────
const TYPE_CONFIG = {
  error: {
    icon: XCircle,
    label: 'Error',
    accent: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.08)',
    border: 'rgba(239, 68, 68, 0.2)',
  },
  success: {
    icon: CheckCircle2,
    label: 'Success',
    accent: '#10B981',
    bg: 'rgba(16, 185, 129, 0.08)',
    border: 'rgba(16, 185, 129, 0.2)',
  },
  info: {
    icon: Info,
    label: 'Info',
    accent: '#3B82F6',
    bg: 'rgba(59, 130, 246, 0.08)',
    border: 'rgba(59, 130, 246, 0.2)',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Attention',
    accent: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.08)',
    border: 'rgba(245, 158, 11, 0.2)',
  },
  push: {
    icon: Bell,
    label: 'CarryOn',
    accent: '#d4af37',
    bg: 'rgba(212, 175, 55, 0.08)',
    border: 'rgba(212, 175, 55, 0.2)',
  },
  critical: {
    icon: AlertTriangle,
    label: 'Urgent',
    accent: '#DC2626',
    bg: 'rgba(220, 38, 38, 0.12)',
    border: 'rgba(220, 38, 38, 0.35)',
  },
};

// ── Single Notification Card ─────────────────────────────────────────
const NotificationCard = ({ notification, onDismiss }) => {
  const [state, setState] = useState('entering'); // entering | visible | exiting
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const cardRef = useRef(null);
  const timerRef = useRef(null);

  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.info;
  const Icon = config.icon;

  const dismiss = useCallback(() => {
    if (state === 'exiting') return;
    setState('exiting');
    setTimeout(() => onDismiss(notification.id), 300);
  }, [state, notification.id, onDismiss]);

  // Auto-dismiss timer
  useEffect(() => {
    timerRef.current = setTimeout(dismiss, notification.duration);
    return () => clearTimeout(timerRef.current);
  }, [notification.duration, dismiss]);

  // Enter animation
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setState('visible'));
    });
  }, []);

  // Double vibrate on mount
  useEffect(() => {
    if (notification.type === 'critical') {
      haptics.error();
    } else {
      // Quick double vibrate — distinct pattern
      if (navigator.vibrate) navigator.vibrate([20, 60, 20]);
    }
  }, [notification.type]);

  // Touch handling for swipe-up dismiss
  const onTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
    dragging.current = true;
    clearTimeout(timerRef.current); // Pause auto-dismiss while dragging
  };

  const onTouchMove = (e) => {
    if (!dragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    // Only allow upward swipe
    if (delta < 0) {
      setDragY(delta);
    }
  };

  const onTouchEnd = () => {
    dragging.current = false;
    if (dragY < -40) {
      // Swiped far enough — dismiss
      dismiss();
    } else {
      // Snap back
      setDragY(0);
      // Resume auto-dismiss
      timerRef.current = setTimeout(dismiss, 2000);
    }
  };

  const translateY = state === 'entering' ? -120
    : state === 'exiting' ? -120
    : dragY;

  const opacity = state === 'entering' ? 0
    : state === 'exiting' ? 0
    : dragY < -40 ? 0.3 : 1;

  return (
    <div
      ref={cardRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={dismiss}
      className="cursor-pointer"
      style={{
        transform: `translateY(${translateY}px)`,
        opacity,
        transition: dragging.current ? 'none' : 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease',
        marginBottom: '8px',
        pointerEvents: 'auto',
      }}
      data-testid="app-notification"
    >
      <div
        style={{
          background: 'var(--notification-bg, rgba(20, 28, 51, 0.92))',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: '16px',
          border: `1px solid ${config.border}`,
          padding: '14px 16px',
          maxWidth: '420px',
          margin: '0 auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          {/* Icon */}
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: config.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: '1px',
            }}
          >
            <Icon style={{ width: '16px', height: '16px', color: config.accent }} />
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{
                fontSize: '13px',
                fontWeight: 700,
                color: config.accent,
                letterSpacing: '0.01em',
              }}>
                {notification.title || config.label}
              </span>
              <span style={{
                fontSize: '11px',
                color: 'var(--t4, #64748b)',
                fontWeight: 500,
              }}>
                now
              </span>
            </div>
            <div style={{
              fontSize: '13px',
              lineHeight: '1.45',
              color: 'var(--t, #e2e8f0)',
              wordBreak: 'break-word',
            }}>
              {notification.message}
            </div>

            {/* Action button */}
            {notification.action && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  notification.action.onClick();
                  dismiss();
                }}
                style={{
                  marginTop: '8px',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: `1px solid ${config.accent}`,
                  background: config.bg,
                  color: config.accent,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                }}
                data-testid="notification-action-btn"
              >
                {notification.action.label}
              </button>
            )}
          </div>
        </div>

        {/* Swipe indicator pill */}
        <div style={{
          width: '36px',
          height: '4px',
          borderRadius: '2px',
          background: 'var(--t5, rgba(255,255,255,0.15))',
          margin: '8px auto 0',
        }} />
      </div>
    </div>
  );
};

// ── Notification Container ───────────────────────────────────────────
const MAX_VISIBLE = 3;

const NotificationContainer = () => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    return subscribe((notification) => {
      setNotifications(prev => {
        // Limit visible notifications
        const next = [notification, ...prev].slice(0, MAX_VISIBLE + 2);
        return next;
      });
    });
  }, []);

  const handleDismiss = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  if (notifications.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        pointerEvents: 'none',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        paddingLeft: '12px',
        paddingRight: '12px',
      }}
      data-testid="notification-container"
    >
      {notifications.slice(0, MAX_VISIBLE).map((n) => (
        <NotificationCard
          key={n.id}
          notification={n}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
};

export default NotificationContainer;
