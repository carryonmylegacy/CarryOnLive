import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Bell, CheckCheck, X } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const NotificationBell = ({ collapsed }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  const token = localStorage.getItem('carryon_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // Poll unread count every 30s
  useEffect(() => {
    if (!token) return;
    const fetchCount = async () => {
      try {
        const res = await axios.get(`${API_URL}/notifications/unread-count`, { headers });
        setUnreadCount(res.data.unread_count);
      } catch {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/notifications?limit=20`, { headers });
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unread_count);
    } catch {}
    finally { setLoading(false); }
  };

  const handleOpen = () => {
    if (!open) fetchNotifications();
    setOpen(!open);
  };

  const markRead = async (id) => {
    try {
      await axios.post(`${API_URL}/notifications/${id}/read`, {}, { headers });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await axios.post(`${API_URL}/notifications/read-all`, {}, { headers });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
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
        onClick={handleOpen}
        className={`sb-pill w-full ${collapsed ? 'justify-center' : ''} relative`}
        title={collapsed ? `Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}` : undefined}
        data-testid="notification-bell"
      >
        <Bell className="w-[18px] h-[18px]" />
        {!collapsed && <span>Notifications</span>}
        {unreadCount > 0 && (
          <span
            className="absolute flex items-center justify-center text-[10px] font-bold text-white rounded-full"
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

      {/* Notification Panel — grows upward from button */}
      {open && (
        <div
          className="absolute z-[200] rounded-xl overflow-hidden right-0 lg:right-auto lg:left-0"
          style={{
            width: 340,
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: 'min(420px, 60vh)',
            bottom: 'calc(100% + 8px)',
            ...(collapsed ? { left: 48, right: 'auto' } : {}),
            background: 'var(--bg2, #0F1629)',
            border: '1px solid var(--b)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}
          data-testid="notification-panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--b)' }}>
            <span className="text-xs font-bold text-[var(--t)] uppercase tracking-wider">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] text-[var(--gold)] hover:underline font-bold"
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

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
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
                      <div className="text-[10px] text-[var(--t5)] mt-1">
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
      )}
    </div>
  );
};

export default NotificationBell;
