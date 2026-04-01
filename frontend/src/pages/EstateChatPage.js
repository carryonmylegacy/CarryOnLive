import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import {
  MessageCircle,
  Send,
  Plus,
  Users,
  Hash,
  User,
  ArrowLeft,
  Trash2,
  Settings,
  Circle,
  Loader2,
  X,
  Check,
  CheckCheck,
  ChevronDown,
  Pin,
} from 'lucide-react';

const ECT_POLL_INTERVAL = 8000;

const REACTION_EMOJIS = {
  thumbs_up: { display: '\uD83D\uDC4D', label: 'Thumbs Up' },
  heart: { display: '\u2764\uFE0F', label: 'Heart' },
  laugh: { display: '\uD83D\uDE02', label: 'Laugh' },
  sad: { display: '\uD83D\uDE22', label: 'Sad' },
  fire: { display: '\uD83D\uDD25', label: 'Fire' },
  check: { display: '\u2705', label: 'Check' },
};

export default function EstateChatPage() {
  const { user } = useAuth();
  const token = localStorage.getItem('carryon_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [channels, setChannels] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showChannelList, setShowChannelList] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [newChatEstate, setNewChatEstate] = useState('');
  const [newChatType, setNewChatType] = useState('direct');
  const [readStatus, setReadStatus] = useState([]);
  const [typers, setTypers] = useState([]);
  const [reactingMsgId, setReactingMsgId] = useState(null);
  const [pinnedMsgs, setPinnedMsgs] = useState([]);
  const [showPinned, setShowPinned] = useState(false);
  const typingTimerRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const pollRef = useRef(null);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/estate-chat/channels`, { headers });
      if (res.ok) setChannels(await res.json());
    } catch {}
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/estate-chat/contacts`, { headers });
      if (res.ok) setContacts(await res.json());
    } catch {}
  }, []);

  const fetchMessages = useCallback(async (channelId) => {
    try {
      const [msgRes, readRes, pinRes] = await Promise.all([
        fetch(`${API_URL}/estate-chat/channels/${channelId}/messages`, { headers }),
        fetch(`${API_URL}/estate-chat/channels/${channelId}/read-status`, { headers }),
        fetch(`${API_URL}/estate-chat/channels/${channelId}/pinned`, { headers }),
      ]);
      if (msgRes.ok) {
        const data = await msgRes.json();
        setMessages(data);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
      if (readRes.ok) {
        setReadStatus(await readRes.json());
      }
      if (pinRes.ok) {
        setPinnedMsgs(await pinRes.json());
      }
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchChannels(), fetchContacts()]);
      setLoading(false);
    })();
  }, []);

  // Poll for new messages when a channel is active
  useEffect(() => {
    if (!activeChannel) return;
    fetchMessages(activeChannel.id);
    // Fast typing poll (every 2s), slower message poll (every 8s)
    let msgCount = 0;
    const poll = setInterval(() => {
      // Fetch typing indicators every tick
      fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/typing`, { headers })
        .then(r => r.ok ? r.json() : [])
        .then(d => setTypers(d || []))
        .catch(() => {});
      // Fetch messages every 4th tick (~8s)
      msgCount++;
      if (msgCount % 4 === 0) {
        fetchMessages(activeChannel.id);
        fetchChannels();
      }
    }, 2000);
    pollRef.current = poll;
    return () => clearInterval(poll);
  }, [activeChannel?.id]);

  // Auto-select estate if only one
  useEffect(() => {
    if (contacts.length === 1 && !newChatEstate) setNewChatEstate(contacts[0].estate_id);
  }, [contacts, newChatEstate]);

  const openChannel = (ch) => {
    setActiveChannel(ch);
    setShowChannelList(false);
    setMsgLoading(true);
    setTypers([]);
    fetchMessages(ch.id).then(() => setMsgLoading(false));
  };

  const sendTypingHeartbeat = () => {
    if (!activeChannel) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 3000) return; // Throttle to every 3s
    lastTypingSentRef.current = now;
    fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/typing`, { method: 'POST', headers }).catch(() => {});
  };

  const handleDraftChange = (e) => {
    setDraft(e.target.value);
    sendTypingHeartbeat();
  };

  const toggleReaction = async (messageId, emoji) => {
    try {
      await fetch(`${API_URL}/estate-chat/messages/${messageId}/react`, {
        method: 'POST', headers, body: JSON.stringify({ emoji }),
      });
      setReactingMsgId(null);
      if (activeChannel) await fetchMessages(activeChannel.id);
    } catch {}
  };

  const togglePin = async (messageId) => {
    try {
      await fetch(`${API_URL}/estate-chat/messages/${messageId}/pin`, { method: 'POST', headers });
      setReactingMsgId(null);
      if (activeChannel) await fetchMessages(activeChannel.id);
    } catch {}
  };

  const sendMessage = async () => {
    if (!draft.trim() || !activeChannel || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/messages`, {
        method: 'POST', headers, body: JSON.stringify({ content: draft.trim() }),
      });
      if (res.ok) {
        setDraft('');
        await fetchMessages(activeChannel.id);
        await fetchChannels();
      }
    } catch {} finally { setSending(false); }
    inputRef.current?.focus();
  };

  const createChannel = async () => {
    if (!newChatEstate) return;
    if (newChatType === 'direct' && selectedMembers.length !== 1) return;
    if (newChatType === 'group' && (selectedMembers.length < 1 || !groupName.trim())) return;
    try {
      const res = await fetch(`${API_URL}/estate-chat/channels`, {
        method: 'POST', headers,
        body: JSON.stringify({
          estate_id: newChatEstate,
          channel_type: newChatType,
          member_ids: selectedMembers,
          name: newChatType === 'group' ? groupName.trim() : undefined,
        }),
      });
      if (res.ok) {
        const ch = await res.json();
        setShowNewChat(false);
        setSelectedMembers([]);
        setGroupName('');
        await fetchChannels();
        openChannel(ch);
      }
    } catch {}
  };

  const deleteChannel = async (chId) => {
    if (!window.confirm('Delete this group channel?')) return;
    try {
      await fetch(`${API_URL}/estate-chat/channels/${chId}`, { method: 'DELETE', headers });
      setActiveChannel(null);
      setShowChannelList(true);
      await fetchChannels();
    } catch {}
  };

  const toggleMember = (id) => {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const getChannelIcon = (type) => {
    if (type === 'circle') return <Circle className="w-4 h-4" style={{ color: '#d4af37' }} />;
    if (type === 'group') return <Hash className="w-4 h-4" style={{ color: '#3B7BF7' }} />;
    return <User className="w-4 h-4" style={{ color: '#22C993' }} />;
  };

  const isBenefactor = user?.role === 'benefactor' || user?.is_also_benefactor;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#d4af37' }} />
      </div>
    );
  }

  // New Chat Modal
  const newChatModal = showNewChat && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 overflow-y-auto" style={{ background: '#0F1629', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '80vh' }}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold" style={{ color: '#F1F3F8' }}>New Conversation</h3>
          <button onClick={() => { setShowNewChat(false); setSelectedMembers([]); setGroupName(''); }} data-testid="ect-new-chat-close">
            <X className="w-5 h-5" style={{ color: '#7B879E' }} />
          </button>
        </div>

        {/* Channel Type Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setNewChatType('direct'); setSelectedMembers([]); }}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            data-testid="ect-type-direct"
            style={{
              background: newChatType === 'direct' ? 'rgba(34,201,147,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${newChatType === 'direct' ? 'rgba(34,201,147,0.4)' : 'rgba(255,255,255,0.07)'}`,
              color: newChatType === 'direct' ? '#22C993' : '#7B879E',
            }}
          >Direct Message</button>
          {isBenefactor && (
            <button
              onClick={() => { setNewChatType('group'); setSelectedMembers([]); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
              data-testid="ect-type-group"
              style={{
                background: newChatType === 'group' ? 'rgba(59,123,247,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${newChatType === 'group' ? 'rgba(59,123,247,0.4)' : 'rgba(255,255,255,0.07)'}`,
                color: newChatType === 'group' ? '#3B7BF7' : '#7B879E',
              }}
            >Group Chat</button>
          )}
        </div>

        {/* Estate Selector */}
        {contacts.length > 1 && (
          <div className="mb-4">
            <label className="text-xs font-bold mb-1.5 block" style={{ color: '#A0AABF' }}>Estate</label>
            <select
              value={newChatEstate}
              onChange={(e) => { setNewChatEstate(e.target.value); setSelectedMembers([]); }}
              className="w-full rounded-xl px-3 py-2.5 text-base"
              data-testid="ect-estate-select"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F1F3F8', fontSize: '16px' }}
            >
              <option value="">Select estate...</option>
              {contacts.map(c => <option key={c.estate_id} value={c.estate_id}>{c.estate_name}</option>)}
            </select>
          </div>
        )}

        {/* Group Name */}
        {newChatType === 'group' && (
          <div className="mb-4">
            <label className="text-xs font-bold mb-1.5 block" style={{ color: '#A0AABF' }}>Group Name</label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g., Financial Planning"
              className="w-full rounded-xl px-3 py-2.5 text-base"
              data-testid="ect-group-name"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F1F3F8', fontSize: '16px' }}
            />
          </div>
        )}

        {/* Member Toggles */}
        {(newChatEstate || contacts.length === 1) && (
          <div className="mb-4">
            <label className="text-xs font-bold mb-2 block" style={{ color: '#A0AABF' }}>
              {newChatType === 'direct' ? 'Select a person' : 'Select members'}
            </label>
            {(contacts.find(c => c.estate_id === (newChatEstate || contacts[0]?.estate_id))?.members || []).map(m => {
              const isSelected = selectedMembers.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    if (newChatType === 'direct') setSelectedMembers([m.id]);
                    else toggleMember(m.id);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl mb-2 transition-all"
                  data-testid={`ect-member-${m.id}`}
                  style={{
                    background: isSelected ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isSelected ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: isSelected ? '#d4af37' : 'rgba(255,255,255,0.08)', color: isSelected ? '#080e1a' : '#A0AABF' }}>
                    {m.name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-semibold" style={{ color: '#F1F3F8' }}>{m.name}</div>
                    <div className="text-xs" style={{ color: '#7B879E' }}>{m.relation || m.role_in_estate}</div>
                  </div>
                  {isSelected && <Check className="w-5 h-5" style={{ color: '#d4af37' }} />}
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={createChannel}
          disabled={!selectedMembers.length || (newChatType === 'group' && !groupName.trim())}
          className="w-full py-3 rounded-xl text-base font-bold transition-all"
          data-testid="ect-create-channel-btn"
          style={{
            background: selectedMembers.length ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(255,255,255,0.06)',
            color: selectedMembers.length ? '#080e1a' : '#525C72',
            cursor: selectedMembers.length ? 'pointer' : 'not-allowed',
          }}
        >Start Conversation</button>
      </div>
    </div>
  );

  // Channel List Panel
  const channelPanel = (
    <div
      className={`${showChannelList || !activeChannel ? 'flex' : 'hidden'} lg:flex flex-col h-full`}
      style={{ width: '100%', maxWidth: '100%', borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h2 className="text-lg font-bold" style={{ color: '#F1F3F8' }}>Estate Chat</h2>
        <button
          onClick={() => setShowNewChat(true)}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105"
          data-testid="ect-new-chat-btn"
          style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }}
        >
          <Plus className="w-5 h-5" style={{ color: '#080e1a' }} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {channels.length === 0 && (
          <div className="text-center py-12 px-4">
            <MessageCircle className="w-12 h-12 mx-auto mb-3" style={{ color: '#525C72' }} />
            <p className="text-sm" style={{ color: '#7B879E' }}>No conversations yet</p>
            <p className="text-xs mt-1" style={{ color: '#525C72' }}>Tap + to start chatting</p>
          </div>
        )}
        {channels.map(ch => (
          <button
            key={ch.id}
            onClick={() => openChannel(ch)}
            className="w-full flex items-center gap-3 p-3 rounded-xl mb-1 transition-all text-left"
            data-testid={`ect-channel-${ch.id}`}
            style={{
              background: activeChannel?.id === ch.id ? 'rgba(212,175,55,0.1)' : 'transparent',
              border: activeChannel?.id === ch.id ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent',
            }}
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {getChannelIcon(ch.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold truncate" style={{ color: '#F1F3F8' }}>{ch.name}</span>
                {ch.unread_count > 0 && (
                  <span className="ml-2 min-w-[20px] h-5 rounded-full flex items-center justify-center text-[11px] font-bold px-1.5" style={{ background: '#d4af37', color: '#080e1a' }}>
                    {ch.unread_count}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: '#7B879E' }}>{ch.estate_name}</span>
                {ch.last_message && (
                  <span className="text-xs truncate" style={{ color: '#525C72' }}>{ch.last_message.content}</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // Message Area
  const messageArea = activeChannel && (
    <div className={`${!showChannelList || activeChannel ? 'flex' : 'hidden'} lg:flex flex-col h-full flex-1`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => { setShowChannelList(true); setActiveChannel(null); }}
          className="lg:hidden w-9 h-9 rounded-full flex items-center justify-center"
          data-testid="ect-back-btn"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <ArrowLeft className="w-4 h-4" style={{ color: '#A0AABF' }} />
        </button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
          {getChannelIcon(activeChannel.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate" style={{ color: '#F1F3F8' }}>{activeChannel.name}</div>
          <div className="text-[11px]" style={{ color: '#7B879E' }}>
            {activeChannel.type === 'circle' ? 'All estate members' : activeChannel.type === 'group' ? `${activeChannel.members?.length || 0} members` : 'Direct message'}
          </div>
        </div>
        {activeChannel.type === 'group' && isBenefactor && (
          <button
            onClick={() => deleteChannel(activeChannel.id)}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            data-testid="ect-delete-channel"
            style={{ background: 'rgba(240,82,82,0.1)' }}
          >
            <Trash2 className="w-4 h-4" style={{ color: '#F05252' }} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Pinned messages banner */}
        {pinnedMsgs.length > 0 && (
          <div className="mb-2">
            <button onClick={() => setShowPinned(!showPinned)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all"
              data-testid="pinned-messages-toggle"
              style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
              <Pin className="w-4 h-4" style={{ color: '#d4af37' }} />
              <span className="text-xs font-bold" style={{ color: '#d4af37' }}>{pinnedMsgs.length} pinned message{pinnedMsgs.length !== 1 ? 's' : ''}</span>
              <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${showPinned ? 'rotate-180' : ''}`} style={{ color: '#d4af37' }} />
            </button>
            {showPinned && (
              <div className="mt-1 space-y-1.5">
                {pinnedMsgs.map(pm => (
                  <div key={pm.id} className="flex items-start gap-2 px-3 py-2 rounded-xl"
                    data-testid={`pinned-msg-${pm.id}`}
                    style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.1)' }}>
                    <Pin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#d4af37' }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-semibold" style={{ color: '#d4af37' }}>{pm.sender_name}</span>
                      <p className="text-sm truncate" style={{ color: '#D8DEE9' }}>{pm.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {msgLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#d4af37' }} />
          </div>
        )}
        {!msgLoading && messages.length === 0 && (
          <div className="text-center py-12">
            <MessageCircle className="w-10 h-10 mx-auto mb-2" style={{ color: '#525C72' }} />
            <p className="text-sm" style={{ color: '#7B879E' }}>No messages yet. Say hello!</p>
          </div>
        )}
        {messages.map((msg, msgIdx) => {
          const isMe = msg.sender_id === user?.id;
          // Read receipt: for my messages, check who has read past this message
          const isLastMyMsg = isMe && (msgIdx === messages.length - 1 || messages[msgIdx + 1]?.sender_id !== user?.id);
          let readByCount = 0;
          let readByNames = [];
          if (isMe && isLastMyMsg && readStatus.length > 0) {
            for (const r of readStatus) {
              if (r.last_read_at && r.last_read_at >= msg.created_at) {
                readByCount++;
                readByNames.push(r.name);
              }
            }
          }
          const totalOthers = readStatus.length;
          const isDM = activeChannel?.type === 'direct';
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[80%]">
                {!isMe && (
                  <div className="text-[11px] font-semibold mb-1 ml-1" style={{ color: '#d4af37' }}>{msg.sender_name}</div>
                )}
                <div
                  className="px-4 py-2.5 rounded-2xl text-sm cursor-pointer relative"
                  onClick={() => setReactingMsgId(reactingMsgId === msg.id ? null : msg.id)}
                  style={{
                    background: isMe ? 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(212,175,55,0.1))' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${isMe ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    color: '#F1F3F8',
                    borderTopRightRadius: isMe ? '6px' : '18px',
                    borderTopLeftRadius: isMe ? '18px' : '6px',
                  }}
                >
                  {msg.pinned && <Pin className="w-3 h-3 inline mr-1" style={{ color: '#d4af37' }} />}
                  {msg.content}
                </div>
                {/* Reaction picker */}
                {reactingMsgId === msg.id && (
                  <div className={`flex gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`} data-testid={`reaction-picker-${msg.id}`}>
                    {Object.entries(REACTION_EMOJIS).map(([key, val]) => {
                      const myReaction = (msg.reactions || []).some(r => r.emoji === key && r.user_id === user?.id);
                      return (
                        <button key={key} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, key); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-base transition-all hover:scale-110 active:scale-95"
                          style={{ background: myReaction ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)', border: myReaction ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent' }}
                          title={val.label}>
                          {val.display}
                        </button>
                      );
                    })}
                    {isBenefactor && (
                      <button onClick={(e) => { e.stopPropagation(); togglePin(msg.id); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        data-testid={`pin-btn-${msg.id}`}
                        style={{ background: msg.pinned ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)', border: msg.pinned ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent' }}
                        title={msg.pinned ? 'Unpin' : 'Pin'}>
                        <Pin className="w-4 h-4" style={{ color: msg.pinned ? '#d4af37' : '#7B879E' }} />
                      </button>
                    )}
                  </div>
                )}
                {/* Reaction pills */}
                {(msg.reactions || []).length > 0 && reactingMsgId !== msg.id && (
                  <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {Object.entries(
                      (msg.reactions || []).reduce((acc, r) => { acc[r.emoji] = (acc[r.emoji] || []); acc[r.emoji].push(r); return acc; }, {})
                    ).map(([emoji, reactors]) => {
                      const myReaction = reactors.some(r => r.user_id === user?.id);
                      const cfg = REACTION_EMOJIS[emoji];
                      return (
                        <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[12px] transition-all"
                          data-testid={`reaction-pill-${emoji}`}
                          style={{
                            background: myReaction ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${myReaction ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.08)'}`,
                          }}>
                          <span>{cfg?.display || emoji}</span>
                          <span className="text-[11px] font-semibold" style={{ color: myReaction ? '#d4af37' : '#7B879E' }}>{reactors.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className={`text-[11px] mt-0.5 flex items-center gap-1.5 ${isMe ? 'justify-end mr-1' : 'ml-1'}`} style={{ color: '#525C72' }}>
                  <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {isMe && isLastMyMsg && readByCount > 0 && (
                    <span className="flex items-center gap-0.5" style={{ color: '#3B7BF7' }} data-testid="read-receipt">
                      <CheckCheck className="w-3.5 h-3.5" />
                      {isDM ? '' : <span className="text-[11px]">{readByCount === totalOthers ? 'All' : readByCount}</span>}
                    </span>
                  )}
                  {isMe && isLastMyMsg && readByCount === 0 && (
                    <span style={{ color: '#525C72' }}><Check className="w-3 h-3" /></span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Typing indicator */}
        {typers.length > 0 && (
          <div className="px-2 pb-1.5 flex items-center gap-1.5" data-testid="typing-indicator">
            <div className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#d4af37', animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#d4af37', animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#d4af37', animationDelay: '300ms' }} />
            </div>
            <span className="text-xs" style={{ color: '#A0AABF' }}>
              {typers.length === 1
                ? `${typers[0].user_name} is typing...`
                : `${typers.map(t => t.user_name).join(', ')} are typing...`
              }
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Type a message..."
            className="flex-1 rounded-xl px-4 py-3 text-base"
            data-testid="ect-message-input"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#F1F3F8', fontSize: '16px', outline: 'none' }}
          />
          <button
            onClick={sendMessage}
            disabled={!draft.trim() || sending}
            className="w-11 h-11 rounded-full flex items-center justify-center transition-all"
            data-testid="ect-send-btn"
            style={{
              background: draft.trim() ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(255,255,255,0.06)',
              cursor: draft.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#080e1a' }} /> : <Send className="w-5 h-5" style={{ color: draft.trim() ? '#080e1a' : '#525C72' }} />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div data-testid="estate-chat-page" className="h-[calc(100vh-64px)] lg:h-[calc(100vh-32px)] flex" style={{ background: 'var(--bg)' }}>
      {/* Desktop: side-by-side layout */}
      <div className="hidden lg:flex w-full">
        <div style={{ width: 340, minWidth: 340 }}>{channelPanel}</div>
        <div className="flex-1">{activeChannel ? messageArea : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 mx-auto mb-4" style={{ color: '#525C72' }} />
              <p className="text-base font-semibold" style={{ color: '#7B879E' }}>Select a conversation</p>
              <p className="text-sm mt-1" style={{ color: '#525C72' }}>or start a new one</p>
            </div>
          </div>
        )}</div>
      </div>
      {/* Mobile: toggle between list and messages */}
      <div className="flex lg:hidden w-full">
        {showChannelList && !activeChannel ? channelPanel : messageArea}
      </div>
      {newChatModal}
    </div>
  );
}
