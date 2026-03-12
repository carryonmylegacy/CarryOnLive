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
// Unified CarryOn brand:
//   Dark mode → gold border, navy bg, green/red/gold text
//   Light mode → navy border, warm gold bg, green/red/navy text
const getTheme = () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

const TYPE_CONFIG = {
  error: {
    icon: XCircle,
    label: 'Error',
    textColor: { dark: '#EF4444', light: '#DC2626' },
  },
  success: {
    icon: CheckCircle2,
    label: 'Success',
    textColor: { dark: '#10B981', light: '#059669' },
  },
  info: {
    icon: Info,
    label: 'Info',
    textColor: { dark: '#d4af37', light: '#0f1629' },
  },
  warning: {
    icon: AlertTriangle,
    label: 'Attention',
    textColor: { dark: '#F59E0B', light: '#B45309' },
  },
  push: {
    icon: Bell,
    label: 'CarryOn',
    textColor: { dark: '#d4af37', light: '#0f1629' },
  },
  critical: {
    icon: AlertTriangle,
    label: 'Urgent',
    textColor: { dark: '#EF4444', light: '#DC2626' },
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
  const theme = getTheme();
  const textColor = config.textColor[theme];

  // Unified brand colors per theme
  const isDark = theme === 'dark';
  const cardBg = isDark ? 'rgba(12, 19, 38, 0.95)' : 'rgba(255, 248, 230, 0.97)';
  const cardBorder = isDark ? '#d4af37' : '#0f1629';
  const labelColor = isDark ? '#d4af37' : '#0f1629';
  const timeColor = isDark ? 'rgba(212,175,55,0.5)' : 'rgba(15,22,41,0.45)';
  const msgColor = textColor;
  const iconBg = isDark ? 'rgba(212,175,55,0.1)' : 'rgba(15,22,41,0.08)';
  const pillColor = isDark ? 'rgba(212,175,55,0.25)' : 'rgba(15,22,41,0.15)';
  const shadow = isDark
    ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(212,175,55,0.15)'
    : '0 8px 32px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(15,22,41,0.1)';

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
      if (navigator.vibrate) navigator.vibrate([20, 60, 20]);
    }
  }, [notification.type]);

  // Touch handling for swipe-up dismiss
  const onTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
    dragging.current = true;
    clearTimeout(timerRef.current);
  };

  const onTouchMove = (e) => {
    if (!dragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta < 0) setDragY(delta);
  };

  const onTouchEnd = () => {
    dragging.current = false;
    if (dragY < -40) {
      dismiss();
    } else {
      setDragY(0);
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
          background: cardBg,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: '16px',
          border: `1.5px solid ${cardBorder}`,
          padding: '14px 16px',
          maxWidth: '420px',
          margin: '0 auto',
          boxShadow: shadow,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          {/* Icon */}
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: '1px',
            }}
          >
            <Icon style={{ width: '16px', height: '16px', color: msgColor }} />
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{
                fontSize: '13px',
                fontWeight: 700,
                color: labelColor,
                letterSpacing: '0.01em',
              }}>
                {notification.title || config.label}
              </span>
              <span style={{
                fontSize: '11px',
                color: timeColor,
                fontWeight: 500,
              }}>
                now
              </span>
            </div>
            <div style={{
              fontSize: '13px',
              lineHeight: '1.45',
              color: msgColor,
              fontWeight: 600,
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
                  border: `1px solid ${cardBorder}`,
                  background: iconBg,
                  color: labelColor,
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
          background: pillColor,
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
