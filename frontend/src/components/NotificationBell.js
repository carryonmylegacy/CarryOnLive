import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import apiClient from '../utils/apiClient';
import { Bell, CheckCheck, X } from 'lucide-react';
import { API_URL } from '../config';
import { syncBadge } from '../utils/pwaBadge';

const NotificationBell = ({ collapsed }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const [panelPos, setPanelPos] = useState({ left: 0, bottom: 0 });

  const token = localStorage.getItem('carryon_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // Poll unread count every 30s + sync PWA badge
  useEffect(() => {
    if (!token) return;
    const fetchCount = async () => {
      try {
        const res = await apiClient.get(`${API_URL}/notifications/unread-count`, { headers });
        const count = res.data.unread_count;
        setUnreadCount(count);
        syncBadge(count);
      } catch {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);

    // Also sync badge when user returns to the app (visibility change)
    const onVisible = () => { if (document.visibilityState === 'visible') fetchCount(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_URL}/notifications?limit=20`, { headers });
      setNotifications(res.data.notifications);
      const count = res.data.unread_count;
      setUnreadCount(count);
      syncBadge(count);
    } catch {}
    finally { setLoading(false); }
  };

  const handleOpen = () => {
    if (!open) {
      fetchNotifications();
      // Calculate position from button for fixed desktop panel
      if (buttonRef.current && window.innerWidth >= 1024) {
        const rect = buttonRef.current.getBoundingClientRect();
        setPanelPos({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
      }
    }
    setOpen(!open);
  };

  const markRead = async (id) => {
    try {
      await apiClient.post(`${API_URL}/notifications/${id}/read`, {}, { headers });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => {
        const next = Math.max(0, prev - 1);
        syncBadge(next);
        return next;
      });
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await apiClient.post(`${API_URL}/notifications/read-all`, {}, { headers });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      syncBadge(0);
    } catch {}
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const priorityColors = {
    critical: '#EF4444',
    high: '#F59E0B',
    normal: '#3B82F6',
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className={`sb-pill w-full ${collapsed ? 'justify-center' : ''} relative`}
        title={collapsed ? `Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}` : undefined}
        data-testid="notification-bell"
      >
        <Bell className="w-[18px] h-[18px]" />
        {!collapsed && <span>Notifications</span>}
        {unreadCount > 0 && (
          <span
            className="absolute flex items-center justify-center text-[12px] font-bold text-white rounded-full"
            style={{
              background: '#EF4444',
              width: 18, height: 18,
              top: collapsed ? 2 : '50%',
              right: collapsed ? 2 : 8,
              transform: collapsed ? 'none' : 'translateY(-50%)',
            }}
            data-testid="notification-badge"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel — fixed on mobile (safe area aware), absolute on desktop */}
      {open && (
        <>
          {/* Mobile backdrop */}
          <div className="fixed inset-0 z-[199] bg-black/30 lg:hidden" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[200] rounded-xl overflow-hidden inset-x-4 lg:inset-x-auto flex flex-col"
            style={{
              // Mobile: fixed within safe areas
              top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
              // Desktop overrides — fixed position so it's not clipped by sidebar overflow
              ...(typeof window !== 'undefined' && window.innerWidth >= 1024 ? {
                position: 'fixed',
                top: 'auto',
                bottom: panelPos.bottom,
                left: panelPos.left,
                right: 'auto',
                width: 360,
                maxWidth: 'calc(100vw - 32px)',
                maxHeight: 'min(420px, 60vh)',
              } : {}),
              background: 'var(--bg2, #0F1629)',
              border: '1px solid var(--b)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
            data-testid="notification-panel"
          >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--b)' }}>
            <span className="text-xs font-bold text-[var(--t)] uppercase tracking-wider">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] text-[var(--gold)] hover:underline font-bold"
                  data-testid="mark-all-read"
                >
                  <CheckCheck className="w-3.5 h-3.5 inline mr-0.5" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-[var(--t5)]">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List — flex-1 + min-h-0 lets the list fill remaining height
              under the parent's max-height cap so overflow-y-auto can
              actually scroll. The previous `maxHeight: calc(100% - 48px)`
              measured against the parent's CONTENT box, but the parent
              only had `max-height` (no determinate height), so the
              percentage collapsed to the inner content's natural size
              and the list never scrolled on desktop. Mobile worked only
              because there `top` and `bottom` are both fixed, giving
              the parent a determinate height. */}
          <div className="overflow-y-auto flex-1 min-h-0">
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-xs text-[var(--t5)]">No notifications yet</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className="px-4 py-3 cursor-pointer transition-colors"
                  style={{
                    background: n.read ? 'transparent' : 'rgba(212,175,55,0.03)',
                    borderBottom: '1px solid var(--b)',
                  }}
                  onClick={() => {
                    if (!n.read) markRead(n.id);
                    if (n.url) window.location.href = n.url;
                  }}
                  data-testid={`notification-item-${n.id}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                        style={{ background: priorityColors[n.priority] || '#3B82F6' }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[var(--t)] truncate">{n.title}</div>
                      <div className="text-[11px] text-[var(--t4)] mt-0.5 line-clamp-2">{n.body}</div>
                      <div className="text-[11px] text-[var(--t5)] mt-1">
                        {new Date(n.created_at).toLocaleString([], {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
