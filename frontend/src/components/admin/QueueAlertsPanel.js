import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, AlertTriangle, Clock, X, CheckCircle } from 'lucide-react';
import { API_URL, BASE_URL } from '../../config';
import { useAuth } from '../../contexts/AuthContext';

const ALERT_COLORS = {
  sla_breach: { bg: 'rgba(239,68,68,0.15)', border: '#ef4444', icon: AlertTriangle, iconColor: '#ef4444' },
  queue_overflow: { bg: 'rgba(245,158,11,0.15)', border: '#f59e0b', icon: Clock, iconColor: '#f59e0b' },
  chat_message: { bg: 'rgba(59,130,246,0.15)', border: '#3b82f6', icon: CheckCircle, iconColor: '#3b82f6' },
};

export const QueueAlertsPanel = () => {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const panelRef = useRef(null);
  const reconnectRef = useRef(null);

  const addAlert = useCallback((alert) => {
    if (alert.type === 'chat_message') return;
    setAlerts(prev => [{ ...alert, id: Date.now(), read: false }, ...prev].slice(0, 50));
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!token || wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsProtocol = BASE_URL.startsWith('https') ? 'wss' : 'ws';
    const wsHost = BASE_URL.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}://${wsHost}/api/ws/notifications?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'sla_breach' || data.type === 'queue_overflow') {
          addAlert(data);
        }
      } catch { /* ignore malformed messages */ }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectRef.current = setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, addAlert]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connectWebSocket]);

  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping');
      }
    }, 25000);
    return () => clearInterval(pingInterval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const unreadCount = alerts.filter(a => !a.read).length;

  const markAllRead = () => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  };

  const dismissAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="relative" ref={panelRef} data-testid="queue-alerts-panel">
      <button
        onClick={() => { setOpen(!open); if (!open) markAllRead(); }}
        className="relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors"
        style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
        data-testid="queue-alerts-bell"
        title={connected ? 'Queue alerts (live)' : 'Queue alerts — reconnecting…'}
      >
        <Bell className={`w-5 h-5 ${connected ? 'text-[var(--t4)]' : 'text-[var(--t5)]'}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[11px] font-bold leading-none text-white bg-[#ef4444]" data-testid="alerts-badge">
            {unreadCount}
          </span>
        )}
        {!connected && (
          // Only show the status dot when DISCONNECTED. The old design
          // always showed a green dot when connected, which users kept
          // mistaking for "unread notifications waiting". Silence when
          // everything is fine; speak up only when reconnecting.
          <span
            className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full"
            style={{ background: '#ef4444' }}
            aria-label="Disconnected"
          />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 w-80 sm:w-96 rounded-xl shadow-2xl z-50 overflow-hidden"
          style={{ background: 'var(--bg2)', border: '1px solid var(--b2)' }}
          data-testid="alerts-dropdown"
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--b)' }}>
            <span className="text-sm font-bold text-[var(--t)]">Queue Alerts</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--t5)]">
                {connected ? 'Live' : 'Reconnecting...'}
              </span>
              {alerts.length > 0 && (
                <button
                  onClick={() => setAlerts([])}
                  className="text-[11px] text-[var(--t5)] hover:text-[var(--t3)] transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="w-8 h-8 mx-auto text-[var(--t5)] mb-2 opacity-40" />
                <p className="text-sm text-[var(--t5)]">No alerts</p>
                <p className="text-xs text-[var(--t5)] opacity-60 mt-1">
                  SLA breaches and queue overflow alerts will appear here in real time
                </p>
              </div>
            ) : (
              alerts.map(alert => {
                const style = ALERT_COLORS[alert.type] || ALERT_COLORS.sla_breach;
                const Icon = style.icon;
                return (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--s)]"
                    style={{ borderBottom: '1px solid var(--b)', background: !alert.read ? style.bg : 'transparent' }}
                    data-testid={`alert-item-${alert.id}`}
                  >
                    <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: style.iconColor }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--t)]">{alert.message}</p>
                      <p className="text-[11px] text-[var(--t5)] mt-0.5">
                        {alert.task_type?.toUpperCase()} {formatTime(alert.timestamp)}
                      </p>
                    </div>
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="flex-shrink-0 text-[var(--t5)] hover:text-[var(--t3)] transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
