import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../../utils/apiClient';
import { MessageSquare, Send, Hash, User, Loader2, Plus, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL, BASE_URL } from '../../config';

const CHANNEL_ICONS = {
  general: '#d4af37',
  ops: '#22C993',
  finance: '#3B82F6',
  marketing: '#B794F6',
  compliance: '#F59E0B',
  platform: '#ef4444',
};

const ROLE_BADGES = {
  admin: { label: 'Admin', color: '#d4af37' },
  manager: { label: 'Manager', color: '#3B82F6' },
  worker: { label: 'Worker', color: '#22C993' },
};

export const TeamChatTab = ({ getAuthHeaders }) => {
  const { user, token } = useAuth();
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [staff, setStaff] = useState([]);
  const [showNewDM, setShowNewDM] = useState(false);
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);
  const inputRef = useRef(null);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await apiClient.get(`${API_URL}/team/channels`, getAuthHeaders());
      setChannels(res.data);
    } catch { /* silent */ }
  }, [getAuthHeaders]);

  const fetchMessages = useCallback(async (channelId) => {
    try {
      const res = await apiClient.get(`${API_URL}/team/messages/${channelId}`, getAuthHeaders());
      setMessages(res.data);
    } catch {
      toast.error('Failed to load messages');
    }
  }, [getAuthHeaders]);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await apiClient.get(`${API_URL}/team/staff`, getAuthHeaders());
      setStaff(res.data);
    } catch { /* silent */ }
  }, [getAuthHeaders]);

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchChannels(), fetchStaff()]);
      setLoading(false);
    };
    init();
  }, [fetchChannels, fetchStaff]);

  useEffect(() => {
    if (activeChannel) {
      fetchMessages(activeChannel);
    }
  }, [activeChannel, fetchMessages]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // WebSocket for real-time chat
  useEffect(() => {
    if (!token) return;

    const wsProtocol = BASE_URL.startsWith('https') ? 'wss' : 'ws';
    const wsHost = BASE_URL.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}://${wsHost}/api/ws/notifications?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat_message' && data.message) {
          if (data.channel_id === activeChannel && data.message.sender_id !== user?.id) {
            setMessages(prev => [...prev, data.message]);
          }
          fetchChannels();
        }
      } catch { /* ignore */ }
    };

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, 25000);

    return () => {
      clearInterval(pingInterval);
      ws.close();
    };
  }, [token, activeChannel, user?.id, fetchChannels]);

  const handleSend = async () => {
    if (!newMessage.trim() || !activeChannel) return;

    setSending(true);
    try {
      const res = await apiClient.post(
        `${API_URL}/team/messages`,
        { channel_id: activeChannel, content: newMessage.trim() },
        getAuthHeaders()
      );
      setMessages(prev => [...prev, res.data]);
      setNewMessage('');
      fetchChannels();
      inputRef.current?.focus();
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startDirectMessage = async (recipientId) => {
    try {
      const res = await apiClient.post(
        `${API_URL}/team/channels/direct`,
        { recipient_id: recipientId },
        getAuthHeaders()
      );
      setShowNewDM(false);
      await fetchChannels();
      setActiveChannel(res.data.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create DM');
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  const activeChannelData = channels.find(c => c.id === activeChannel);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--t5)]" />
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-280px)] min-h-[400px]" data-testid="team-chat-tab">
      {/* Channel List */}
      <Card className="glass-card w-64 flex-shrink-0 flex flex-col overflow-hidden">
        <div className="px-3 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--b)' }}>
          <span className="text-sm font-bold text-[var(--t)]">Channels</span>
          <button
            onClick={() => setShowNewDM(!showNewDM)}
            className="p-1 rounded hover:bg-[var(--s)] transition-colors"
            data-testid="new-dm-btn"
            title="New Direct Message"
          >
            <Plus className="w-4 h-4 text-[var(--t4)]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* System Channels */}
          <div className="px-2 py-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--t5)] px-2">Teams</span>
          </div>
          {channels.filter(c => c.type === 'system').map(ch => (
            <button
              key={ch.id}
              onClick={() => { setActiveChannel(ch.id); setShowNewDM(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                activeChannel === ch.id ? 'bg-[var(--gold)]/10' : 'hover:bg-[var(--s)]'
              }`}
              data-testid={`channel-${ch.id}`}
            >
              <Hash className="w-3.5 h-3.5 flex-shrink-0" style={{ color: CHANNEL_ICONS[ch.id] || 'var(--t5)' }} />
              <span className={`text-sm flex-1 truncate ${activeChannel === ch.id ? 'font-bold text-[var(--t)]' : 'text-[var(--t4)]'}`}>
                {ch.name}
              </span>
              {ch.unread_count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[11px] font-bold text-white bg-[#ef4444] leading-none">
                  {ch.unread_count}
                </span>
              )}
            </button>
          ))}

          {/* Direct Messages */}
          {channels.filter(c => c.type === 'direct').length > 0 && (
            <>
              <div className="px-2 py-1.5 mt-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--t5)] px-2">Direct Messages</span>
              </div>
              {channels.filter(c => c.type === 'direct').map(ch => (
                <button
                  key={ch.id}
                  onClick={() => { setActiveChannel(ch.id); setShowNewDM(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                    activeChannel === ch.id ? 'bg-[var(--gold)]/10' : 'hover:bg-[var(--s)]'
                  }`}
                  data-testid={`channel-${ch.id}`}
                >
                  <User className="w-3.5 h-3.5 flex-shrink-0 text-[var(--t5)]" />
                  <span className={`text-sm flex-1 truncate ${activeChannel === ch.id ? 'font-bold text-[var(--t)]' : 'text-[var(--t4)]'}`}>
                    {ch.name}
                  </span>
                  {ch.unread_count > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[11px] font-bold text-white bg-[#ef4444] leading-none">
                      {ch.unread_count}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}

          {/* New DM Panel */}
          {showNewDM && (
            <div className="px-2 py-2 mt-2" style={{ borderTop: '1px solid var(--b)' }}>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--t5)] px-2">New Message To</span>
              <div className="mt-1 space-y-0.5">
                {staff.map(s => (
                  <button
                    key={s.id}
                    onClick={() => startDirectMessage(s.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-[var(--s)] transition-colors"
                    data-testid={`dm-staff-${s.id}`}
                  >
                    <User className="w-3.5 h-3.5 text-[var(--t5)]" />
                    <span className="text-sm text-[var(--t4)] truncate flex-1">{s.name}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded" style={{
                      color: ROLE_BADGES[s.operator_role || s.role]?.color || '#888',
                      background: `${ROLE_BADGES[s.operator_role || s.role]?.color || '#888'}15`,
                    }}>
                      {ROLE_BADGES[s.operator_role || s.role]?.label || s.role}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Message Area */}
      <Card className="glass-card flex-1 flex flex-col overflow-hidden">
        {activeChannel ? (
          <>
            {/* Channel Header */}
            <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--b)' }}>
              <button
                onClick={() => setActiveChannel(null)}
                className="lg:hidden p-1 rounded hover:bg-[var(--s)]"
              >
                <ArrowLeft className="w-4 h-4 text-[var(--t4)]" />
              </button>
              {activeChannelData?.type === 'direct' ? (
                <User className="w-4 h-4 text-[var(--t5)]" />
              ) : (
                <Hash className="w-4 h-4" style={{ color: CHANNEL_ICONS[activeChannel] || 'var(--t5)' }} />
              )}
              <div>
                <span className="text-sm font-bold text-[var(--t)]">{activeChannelData?.name || activeChannel}</span>
                {activeChannelData?.description && (
                  <p className="text-[11px] text-[var(--t5)]">{activeChannelData.description}</p>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <MessageSquare className="w-10 h-10 mx-auto text-[var(--t5)] opacity-30 mb-2" />
                    <p className="text-sm text-[var(--t5)]">No messages yet</p>
                    <p className="text-xs text-[var(--t5)] opacity-60">Start the conversation</p>
                  </div>
                </div>
              ) : (
                messages.map(msg => {
                  const isOwn = msg.sender_id === user?.id;
                  const badge = ROLE_BADGES[msg.sender_role] || { label: msg.sender_role, color: '#888' };
                  return (
                    <div key={msg.id} className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`} data-testid={`message-${msg.id}`}>
                      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                        <div className={`flex items-center gap-2 mb-0.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
                          <span className="text-[11px] font-bold text-[var(--t4)]">{msg.sender_name}</span>
                          <span className="text-[11px] px-1 py-0.5 rounded" style={{
                            color: badge.color,
                            background: `${badge.color}15`,
                          }}>
                            {badge.label}
                          </span>
                          <span className="text-[11px] text-[var(--t5)]">{formatTime(msg.created_at)}</span>
                        </div>
                        <div
                          className="px-3 py-2 rounded-xl text-sm"
                          style={{
                            background: isOwn ? 'var(--gold)' : 'var(--s)',
                            color: isOwn ? '#0F1629' : 'var(--t)',
                            borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          }}
                        >
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--b)' }}>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${activeChannelData?.name || ''}...`}
                  className="flex-1 px-3 py-2 rounded-lg text-sm bg-[var(--s)] text-[var(--t)] placeholder-[var(--t5)]"
                  style={{ border: '1px solid var(--b)', fontSize: '16px' }}
                  maxLength={2000}
                  data-testid="chat-input"
                />
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sending}
                  className="px-3 py-2 rounded-lg font-bold text-sm transition-all disabled:opacity-40"
                  style={{ background: 'var(--gold)', color: '#0F1629' }}
                  data-testid="chat-send-btn"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <CardContent className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto text-[var(--t5)] opacity-30 mb-3" />
              <p className="text-base font-bold text-[var(--t4)]">Team Chat</p>
              <p className="text-sm text-[var(--t5)] mt-1">
                Select a channel or start a direct message
              </p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};
