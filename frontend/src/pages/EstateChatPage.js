import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import { toast } from '../utils/toast';
import NewChatModal from '../components/chat/NewChatModal';
import {
  MessageCircle, Send, Plus, Users, Hash, User, ArrowLeft, Trash2,
  Circle, Loader2, X, Check, CheckCheck, ChevronDown, ChevronRight,
  Pin, Paperclip, FileText, Image, Download, Search, Shield, Lock,
  Mic, Square, Play, Pause, CheckSquare2, UserPlus, Pencil, Copy,
  TextSelect, MapPin, Delete,
} from 'lucide-react';
import { platformDownload } from '../utils/downloadFile';
import useVoiceRecorder from '../components/estate-chat/useVoiceRecorder';
import VoiceMessagePlayer from '../components/estate-chat/VoiceMessagePlayer';
import { AuthImage, AuthVideo, AuthFileLink, prefetchMedia } from '../components/estate-chat/AuthMedia';
import ECTSecurityIntro from '../components/estate-chat/ECTSecurityIntro';
import ImagePreviewModal from '../components/estate-chat/ImagePreviewModal';
import ECTActionMenu from '../components/estate-chat/ECTActionMenu';
import { getRecentEmojis, addRecentEmoji, displayEmoji, LEGACY_EMOJI_MAP, EmojiPickerGrid, EmojiPickerButton, EmojiPickerButtonSmall } from '../components/estate-chat/EmojiLibrary';

// ── Extracted hooks ────────────────────────────────────────────────────────
import useECTChannelList from '../components/estate-chat/useECTChannelList';
import useECTSearch from '../components/estate-chat/useECTSearch';
import useECTMessageActions from '../components/estate-chat/useECTMessageActions';
import useECTMedia from '../components/estate-chat/useECTMedia';
import { ECTDeleteConfirmDialog, ECTBulkDeleteConfirmDialog } from '../components/estate-chat/ECTConfirmDialogs';

const ECT_POLL_INTERVAL = 8000;

// Legacy key→display map — kept for backward-compatible rendering of old reactions
const REACTION_EMOJIS = {
  thumbs_up: { display: '\uD83D\uDC4D', label: 'Thumbs Up' },
  heart:     { display: '\u2764\uFE0F', label: 'Heart' },
  laugh:     { display: '\uD83D\uDE02', label: 'Laugh' },
  sad:       { display: '\uD83D\uDE22', label: 'Sad' },
  fire:      { display: '\uD83D\uDD25', label: 'Fire' },
  check:     { display: '\u2705',       label: 'Check' },
};

export default function EstateChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const token = localStorage.getItem('carryon_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ── Shared refs (keyboard + scroll — NEVER move these) ────────────────────
  // iOS keyboard: position:fixed inset:0 handles viewport naturally. Zero JS manipulation.
  const messagesEndRef    = useRef(null);
  const inputRef          = useRef(null);
  const fileInputRef      = useRef(null);
  const activeChannelRef  = useRef(null);
  const scrollContainerRef = useRef(null);
  const previewGuardRef   = useRef(false); // blocks phantom touches after image preview closes
  // Ref to break circular TDZ dependency: hooks need fetchMessages before it's const-initialized
  const fetchMessagesRef  = useRef(null);

  // ── Voice recorder ────────────────────────────────────────────────────────
  const voiceRecorder = useVoiceRecorder();

  // ── Core page state ───────────────────────────────────────────────────────
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [showSecurityIntro, setShowSecurityIntro] = useState(() => !localStorage.getItem('ect_security_seen'));
  const [introStep, setIntroStep] = useState(1);
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [recentEmojis, setRecentEmojis] = useState(() => getRecentEmojis());
  const [showDraftEmojiPicker, setShowDraftEmojiPicker] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [newChatEstate, setNewChatEstate] = useState('');
  const [newChatType, setNewChatType] = useState('direct');
  const lastTypingSentRef = useRef(0);

  // ── Extracted hooks ───────────────────────────────────────────────────────
  const channelList = useECTChannelList({ token, navigate, user });
  const {
    channels, setChannels, activeChannel, setActiveChannel,
    showChannelList, setShowChannelList,
    swipedChannel, setSwipedChannel,
    deleteConfirm, setDeleteConfirm,
    selectMode, setSelectMode, selectedChannels, setSelectedChannels,
    bulkDeleting, bulkDeleteConfirm, setBulkDeleteConfirm,
    showHeaderMembers, setShowHeaderMembers,
    showListMembersId, setShowListMembersId, listMembersPosRef,
    fetchChannels, openChannel: _openChannel, handleBackOut: _handleBackOut,
    deleteChannel, bulkDeleteChannels,    toggleChannelSelection, toggleSelectAll, exitSelectMode,
    handleTouchStart, handleTouchMove, handleTouchEnd,
  } = channelList;

  // Wrap openChannel to inject the refs it needs and manage msgLoading/typers
  const openChannel = (ch) => {
    // Blur any focused input to prevent stray cursor on iOS
    if (document.activeElement) document.activeElement.blur();
    setActiveChannel(ch);
    setShowChannelList(false);
    setMsgLoading(true);
    setTypers([]);
    setSwipedChannel(null);
    setShowListMembersId(null);
    setShowHeaderMembers(false);
    fetchMessages(ch.id).then(() => {
      setMsgLoading(false);
      const sc = scrollContainerRef.current;
      if (sc) sc.scrollTop = sc.scrollHeight;
      let lastH = sc?.scrollHeight || 0;
      const check = setInterval(() => {
        const s = scrollContainerRef.current;
        if (!s) { clearInterval(check); return; }
        if (s.scrollHeight !== lastH) { lastH = s.scrollHeight; s.scrollTop = s.scrollHeight; }
      }, 100);
      setTimeout(() => clearInterval(check), 3000);
    });
  };

  const handleBackOut = () => {
    if (activeChannel) {
      if (document.activeElement) document.activeElement.blur();
      setActiveChannel(null);
      setShowChannelList(true);
      setInputFocused(false);
      setSwipedChannel(null);
      setShowHeaderMembers(false);
      fetchChannels();
    } else {
      navigate(-1);
    }
  };

  const msgActions = useECTMessageActions({
    token, user, messages, activeChannel,
    fetchMessages: (...args) => fetchMessagesRef.current?.(...args),
    fetchChannels,
    scrollContainerRef, inputRef, previewGuardRef,
  });
  const {
    msgActionId, menuPosition, menuReady, menuOpenedAtRef,
    reactingMsgId, setReactingMsgId,
    reactionDetailId, setReactionDetailId,
    showActionEmojiPicker, setShowActionEmojiPicker,
    showInlineEmojiPicker, setShowInlineEmojiPicker,
    replyTo, setReplyTo, editingMsg, setEditingMsg,
    poppingMsgId, setPoppingMsgId,
    readStatus, setReadStatus, pinnedMsgs, setPinnedMsgs,
    showPinned, setShowPinned, typers, setTypers,
    msgLongPressTriggered,
    openMsgAction, closeMsgAction,
    togglePin, handleEditMessage, handleDeleteMessage: _handleDeleteMessage,
    onMsgTouchStart, onMsgTouchMove, onMsgTouchEnd,
  } = msgActions;

  // Wrap toggleReaction to update recentEmojis locally
  const toggleReaction = async (messageId, emoji) => {
    const result = await msgActions.toggleReaction(messageId, emoji);
    if (result?.added) setRecentEmojis(addRecentEmoji(emoji));
  };

  // Wrap handleDeleteMessage to update local messages state
  const handleDeleteMessage = async (messageId) => {
    const result = await _handleDeleteMessage(messageId);
    if (result?.deleted) setMessages(prev => prev.filter(m => m.id !== result.deleted));
  };

  const media = useECTMedia({
    token, activeChannel,
    fetchMessages: (...args) => fetchMessagesRef.current?.(...args),
    fetchChannels,
    voiceRecorder, scrollContainerRef,
  });
  const {
    uploading, pendingFiles, setPendingFiles,
    voicePreview, setVoicePreview,
    uploadMultipleFiles, sendVoiceMessage, stopAndPreview, discardPreview,
  } = media;

  const search = useECTSearch({
    token, channels,
    openChannel,
    scrollContainerRef,
    fetchMessages: (...args) => fetchMessagesRef.current?.(...args),
  });
  const {
    searchQuery, searchResults, searching, showSearch, setShowSearch,
    handleSearch, jumpToMessage,
  } = search;

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/estate-chat/contacts`, { headers });
      if (res.ok) setContacts(await res.json());
    } catch {} // eslint-disable-line no-empty
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        const fileIds = [];
        data.forEach(m => {
          if (m.attachment?.file_id) fileIds.push(m.attachment.file_id);
          if (m.attachments) m.attachments.forEach(a => { if (a.file_id) fileIds.push(a.file_id); });
        });
        if (fileIds.length) prefetchMedia(fileIds);
      }
      if (readRes.ok) setReadStatus(await readRes.json());
      if (pinRes.ok) setPinnedMsgs(await pinRes.json());
    } catch {} // eslint-disable-line no-empty
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Wire ref so hooks with the early-bound wrapper resolve to the real implementation
  fetchMessagesRef.current = fetchMessages;

  // ── Lifecycle effects ─────────────────────────────────────────────────────
  useEffect(() => {
    document.body.classList.add('ect-active');
    return () => {
      document.body.classList.remove('ect-active');
      document.body.classList.remove('ect-chat-active');
    };
  }, []);

  useEffect(() => {
    if (activeChannel) {
      document.body.classList.add('ect-chat-active');
    } else {
      document.body.classList.remove('ect-chat-active');
    }
  }, [activeChannel]);

  useEffect(() => {
    if (!showHeaderMembers && !showListMembersId) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('[data-testid="ect-header-members-dropdown"]') &&
          !e.target.closest('[data-testid="ect-header-members-link"]') &&
          !e.target.closest('[data-testid^="ect-list-members-dropdown-"]') &&
          !e.target.closest('[data-testid^="ect-list-members-link-"]')) {
        setShowHeaderMembers(false);
        setShowListMembersId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showHeaderMembers, showListMembersId]); // eslint-disable-line react-hooks/exhaustive-deps

  // iOS keyboard: no JS viewport manipulation — position:fixed inset:0 is the baseline.
  useEffect(() => {
    if (inputRef.current) {
      const el = inputRef.current;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, [draft, inputFocused]);

  useEffect(() => {
    if (!reactingMsgId) return;
    setTimeout(() => {
      const picker = document.querySelector(`[data-testid="reaction-picker-${reactingMsgId}"]`);
      if (picker) picker.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    }, 50);
  }, [reactingMsgId]);

  useEffect(() => {
    activeChannelRef.current = activeChannel;
    if (!activeChannel) setInputFocused(false);
  }, [activeChannel]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchChannels(), fetchContacts()]);
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeChannel) return;
    if (inputRef.current) inputRef.current.blur();
    fetchMessages(activeChannel.id).then(() => {
      const sc = scrollContainerRef.current;
      if (sc) sc.scrollTop = sc.scrollHeight;
      let lastH = sc?.scrollHeight || 0;
      const check = setInterval(() => {
        const s = scrollContainerRef.current;
        if (!s) { clearInterval(check); return; }
        if (s.scrollHeight !== lastH) { lastH = s.scrollHeight; s.scrollTop = s.scrollHeight; }
      }, 100);
      setTimeout(() => clearInterval(check), 3000);
    });
    let msgCount = 0;
    const poll = setInterval(() => {
      fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/typing`, { headers })
        .then(r => r.ok ? r.json() : [])
        .then(d => setTypers(d || []))
        .catch(() => {});
      msgCount++;
      if (msgCount % 4 === 0) {
        fetchMessages(activeChannel.id).then(() => {
          requestAnimationFrame(scrollToBottomIfNear);
          setTimeout(scrollToBottomIfNear, 200);
        });
        fetchChannels();
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [activeChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (contacts.length === 1 && !newChatEstate) setNewChatEstate(contacts[0].estate_id);
  }, [contacts, newChatEstate]);

  // ── Scroll helpers ────────────────────────────────────────────────────────
  const scrollToBottomIfNear = () => {
    const sc = scrollContainerRef.current;
    if (!sc) return;
    const distFromBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
    if (distFromBottom < 150) sc.scrollTop = sc.scrollHeight;
  };

  // ── Typing heartbeat ──────────────────────────────────────────────────────
  const sendTypingHeartbeat = () => {
    if (!activeChannel) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;
    fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/typing`, { method: 'POST', headers }).catch(() => {});
  };

  const handleDraftChange = (e) => {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    sendTypingHeartbeat();
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!draft.trim() || !activeChannel || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/messages`, {
        method: 'POST', headers, body: JSON.stringify({ content: draft.trim(), reply_to: replyTo?.id || null }),
      });
      if (res.ok) {
        setDraft('');
        setReplyTo(null);
        if (inputRef.current) {
          inputRef.current.value = '';
          inputRef.current.style.height = 'auto';
        }
        await fetchMessages(activeChannel.id);
        await fetchChannels();
        const doScroll = () => { const sc = scrollContainerRef.current; if (sc) sc.scrollTop = sc.scrollHeight; };
        requestAnimationFrame(doScroll);
        setTimeout(doScroll, 250);
      }
    } catch {} finally { setSending(false); } // eslint-disable-line no-empty
  };

  // ── Create channel ────────────────────────────────────────────────────────
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
    } catch {} // eslint-disable-line no-empty
  };

  // ── Member helpers ────────────────────────────────────────────────────────
  const addMemberToChannel = async (channelId, memberId, estateId) => {
    try {
      const channel = channels.find(c => c.id === channelId);
      if (!channel) return;
      const newMembers = [...new Set([...(channel.members || []), memberId])];
      await fetch(`${API_URL}/estate-chat/channels/${channelId}/members`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_ids: newMembers }),
      });
      await fetchChannels();
      if (activeChannel?.id === channelId) {
        setActiveChannel(prev => prev ? { ...prev, members: newMembers } : prev);
      }
      toast.success('Member added');
    } catch {
      toast.error('Failed to add member');
    }
  };

  const getNonChannelMembers = (channelMembers, estateId) => {
    const estate = contacts.find(c => c.estate_id === estateId);
    if (!estate) return [];
    return (estate.members || []).filter(m => !(channelMembers || []).includes(m.id));
  };

  const resolveChannelMembers = useCallback((memberIds, estateId) => {
    const estate = contacts.find(c => c.estate_id === estateId);
    const members = (estate?.members || []);
    const resolved = [];
    for (const mid of memberIds) {
      const found = members.find(m => m.id === mid);
      if (found) {
        resolved.push(found);
      } else if (mid === user?.id) {
        resolved.push({ id: mid, name: user?.name || 'You', photo_url: user?.photo_url || '', role_in_estate: user?.role || '', relation: '' });
      } else {
        resolved.push({ id: mid, name: 'Unknown', photo_url: '', role_in_estate: '', relation: '' });
      }
    }
    return resolved;
  }, [contacts, user]);

  const toggleMember = (id) => {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const getChannelIcon = (type) => {
    if (type === 'circle') return <Circle className="w-4 h-4" style={{ color: '#d4af37' }} />;
    if (type === 'group') return <Hash className="w-4 h-4" style={{ color: '#3B7BF7' }} />;
    return <User className="w-4 h-4" style={{ color: '#22C993' }} />;
  };

  const isBenefactor = user?.role === 'benefactor' || user?.is_also_benefactor;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#d4af37' }} />
      </div>
    );
  }

  // ── New Chat Modal ─────────────────────────────────────────────────────────
  const newChatModal = (
    <NewChatModal
      showNewChat={showNewChat} setShowNewChat={setShowNewChat}
      newChatType={newChatType} setNewChatType={setNewChatType}
      newChatEstate={newChatEstate} setNewChatEstate={setNewChatEstate}
      groupName={groupName} setGroupName={setGroupName}
      contacts={contacts} selectedMembers={selectedMembers}
      setSelectedMembers={setSelectedMembers} toggleMember={toggleMember}
      isBenefactor={isBenefactor} createChannel={createChannel}
    />
  );

  // ── Channel List Panel ─────────────────────────────────────────────────────
  const channelPanel = (
    <div
      className={`${showChannelList || !activeChannel ? 'flex' : 'hidden'} lg:flex flex-col h-full`}
      style={{ width: '100%', maxWidth: '100%', borderRight: '1px solid var(--b)' }}
    >
      {/* Desktop-only back-to-app bar — invisible on mobile (platform header handles that) */}
      <div className="hidden lg:flex items-center px-4 pt-3 pb-1">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-xs font-semibold transition-colors hover:opacity-80"
          data-testid="ect-back-to-dashboard"
          style={{ color: 'var(--t4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          aria-label="Back to Dashboard"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </button>
      </div>

      {/* ECT-own header */}
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--b)' }}>
        <div className="flex items-center gap-3">
          {selectMode ? (
            <button onClick={exitSelectMode} className="w-9 h-9 rounded-full flex items-center justify-center" data-testid="ect-select-cancel" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <X className="w-4 h-4" style={{ color: 'var(--t4)' }} />
            </button>
          ) : (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,123,247,0.12)', boxShadow: '0 0 12px rgba(59,123,247,0.25)' }}>
              <MessageCircle className="w-5 h-5" style={{ color: '#3B7BF7' }} />
            </div>
          )}
          <h2 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--t)', fontFamily: 'var(--sans)' }}>
            {selectMode ? `${selectedChannels.size} Selected` : 'Estate Comms (ECT)'}
          </h2>
        </div>
        <div className="flex gap-2">
          {selectMode ? (
            <>
              <button onClick={toggleSelectAll} className="h-10 px-3 rounded-full flex items-center justify-center gap-1.5 transition-all" data-testid="ect-select-all-btn"
                style={{ background: selectedChannels.size === channels.length ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${selectedChannels.size === channels.length ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                <span className="text-xs font-semibold" style={{ color: selectedChannels.size === channels.length ? '#d4af37' : 'var(--t4)' }}>
                  {selectedChannels.size === channels.length ? 'Deselect All' : 'Select All'}
                </span>
              </button>
              <button onClick={() => { if (selectedChannels.size > 0) setBulkDeleteConfirm(true); }} disabled={selectedChannels.size === 0}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all" data-testid="ect-bulk-delete-btn"
                style={{ background: selectedChannels.size > 0 ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selectedChannels.size > 0 ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.06)'}`, cursor: selectedChannels.size > 0 ? 'pointer' : 'not-allowed' }}>
                <Trash2 className="w-5 h-5" style={{ color: selectedChannels.size > 0 ? '#dc2626' : 'var(--t5)' }} />
              </button>
            </>
          ) : (
            <>
              {channels.length > 0 && (
                <button onClick={() => { setSelectMode(true); setSwipedChannel(null); }} className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105" data-testid="ect-select-mode-btn" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <CheckSquare2 className="w-5 h-5" style={{ color: 'var(--t4)' }} />
                </button>
              )}
              <button onClick={() => search.setShowSearch(!showSearch)} className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105" data-testid="ect-search-btn" style={{ background: showSearch ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.06)' }}>
                <Search className="w-5 h-5" style={{ color: showSearch ? '#d4af37' : 'var(--t4)' }} />
              </button>
              <button onClick={() => setShowNewChat(true)} className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105" data-testid="ect-new-chat-btn" style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }}>
                <Plus className="w-5 h-5" style={{ color: '#080e1a' }} />
              </button>
            </>
          )}
        </div>
      </div>
      {showSearch && (
        <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <input value={searchQuery} onChange={(e) => handleSearch(e.target.value)} placeholder="Search messages..." autoFocus
            className="w-full rounded-xl px-3 py-2.5 text-base" data-testid="ect-search-input"
            style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px', outline: 'none' }} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2">
        <button onClick={() => setShowSecurityInfo(!showSecurityInfo)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl mb-2 transition-all" data-testid="ect-security-info-toggle"
          style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}>
          <Shield className="w-4 h-4" style={{ color: '#d4af37' }} />
          <span className="text-xs font-bold" style={{ color: '#d4af37' }}>Why ECT is different</span>
          <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${showSecurityInfo ? 'rotate-180' : ''}`} style={{ color: '#d4af37' }} />
        </button>
        {showSecurityInfo && (
          <div className="mb-3 rounded-xl p-3 space-y-2" style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.1)' }}>
            {[
              ['Closed Network', 'Only estate members can message you'],
              ['No Phone Required', 'No numbers exposed, no contact scanning'],
              ['Owner Controls Access', 'Benefactor decides who is in and out'],
              ['Zero Data Mining', 'No ads, no tracking, no metadata sold'],
              ['Trusted Contacts', 'FFN contacts receive via email/SMS'],
            ].map(([t, d], i) => (
              <div key={i} className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#22C993' }} />
                <div><span className="text-xs font-bold" style={{ color: 'var(--t)' }}>{t}</span><span className="text-xs" style={{ color: 'var(--t4)' }}> — {d}</span></div>
              </div>
            ))}
            <button onClick={() => setShowSecurityIntro(true)} className="w-full py-2 mt-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97]" data-testid="ect-show-full-security"
              style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}>Learn More</button>
          </div>
        )}
        {showSearch && searchQuery.trim() ? (
          <div>
            {searching && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4af37' }} /></div>}
            {!searching && searchResults.length === 0 && searchQuery.trim() && (
              <div className="text-center py-8"><Search className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--t5)' }} /><p className="text-sm" style={{ color: 'var(--t4)' }}>No messages found</p></div>
            )}
            {searchResults.map(sr => (
              <button key={sr.id} onClick={() => jumpToMessage(sr)} className="w-full text-left p-3 rounded-xl mb-1 transition-all" data-testid={`search-result-${sr.id}`}
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  {getChannelIcon(sr.channel_type)}
                  <span className="text-[11px] font-semibold" style={{ color: '#d4af37' }}>{sr.channel_name || 'Chat'}</span>
                  <span className="text-[11px] ml-auto" style={{ color: 'var(--t5)' }}>{new Date(sr.created_at).toLocaleDateString()}</span>
                </div>
                <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--t4)' }}>{sr.sender_name}</div>
                <p className="text-sm truncate" style={{ color: 'var(--t)' }}>{sr.content}</p>
              </button>
            ))}
          </div>
        ) : (
          <>
            {channels.length === 0 && (
              <div className="text-center py-12 px-4">
                <MessageCircle className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--t5)' }} />
                <p className="text-sm" style={{ color: 'var(--t4)' }}>No conversations yet</p>
                <p className="text-xs mt-1" style={{ color: 'var(--t5)' }}>Tap + to start chatting</p>
              </div>
            )}
            {channels.map(ch => (
              <div key={ch.id} className={`relative rounded-xl mb-1 ${showListMembersId === ch.id ? '' : 'overflow-hidden'}`}
                onTouchStart={(e) => !selectMode && handleTouchStart(e, ch.id)}
                onTouchMove={(e) => !selectMode && handleTouchMove(e)}
                onTouchEnd={(e) => !selectMode && handleTouchEnd(e, ch.id)}>
                {!selectMode && (
                  <div className="absolute inset-y-0 right-0 flex items-center" style={{ width: '72px', background: '#dc2626', justifyContent: 'center', borderRadius: '12px', opacity: swipedChannel === ch.id ? 1 : 0, transition: 'opacity 0.15s ease' }}>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(ch); }} data-testid={`ect-channel-delete-${ch.id}`} className="w-full h-full flex items-center justify-center">
                      <Trash2 className="w-5 h-5" style={{ color: '#fff' }} />
                    </button>
                  </div>
                )}
                <button onClick={() => { if (selectMode) { toggleChannelSelection(ch.id); } else if (swipedChannel === ch.id) { setSwipedChannel(null); } else { openChannel(ch); } }}
                  className="w-full flex items-center gap-3 p-3 transition-transform text-left relative" data-testid={`ect-channel-${ch.id}`}
                  style={{ background: selectMode && selectedChannels.has(ch.id) ? 'rgba(220,38,38,0.08)' : activeChannel?.id === ch.id ? 'rgba(212,175,55,0.1)' : 'var(--bg, #0B1120)', border: selectMode && selectedChannels.has(ch.id) ? '1px solid rgba(220,38,38,0.25)' : activeChannel?.id === ch.id ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent', borderRadius: '12px', transform: !selectMode && swipedChannel === ch.id ? 'translateX(-72px)' : 'translateX(0)', transition: 'transform 0.2s ease' }}>
                  {selectMode && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-all" style={{ background: selectedChannels.has(ch.id) ? '#dc2626' : 'rgba(255,255,255,0.06)', border: `2px solid ${selectedChannels.has(ch.id) ? '#dc2626' : 'rgba(255,255,255,0.15)'}` }}>
                      {selectedChannels.has(ch.id) && <Check className="w-3.5 h-3.5" style={{ color: '#fff' }} />}
                    </div>
                  )}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-sm font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}>
                    {ch.type === 'direct' && ch.photo_url ? <img src={ch.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = ch.name?.charAt(0)?.toUpperCase() || '?'; }} />
                      : ch.estate_photo_url ? <img src={ch.estate_photo_url} alt="" className="w-10 h-10 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = (ch.estate_name || ch.name)?.charAt(0)?.toUpperCase() || '?'; }} />
                      : ch.type === 'direct' ? (ch.name?.charAt(0)?.toUpperCase() || '?') : getChannelIcon(ch.type)}
                  </div>
                  <div className="flex-1 min-w-0 relative" style={{ zIndex: showListMembersId === ch.id ? 50 : 'auto' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--t)' }}>{ch.type === 'direct' ? ch.name : `${ch.estate_name || ch.name} Members`}</span>
                      {ch.unread_count > 0 && <span className="ml-2 min-w-[20px] h-5 rounded-full flex items-center justify-center text-[11px] font-bold px-1.5" style={{ background: '#d4af37', color: '#080e1a' }}>{ch.unread_count}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded cursor-pointer flex-shrink-0 whitespace-nowrap" data-testid={`ect-list-members-link-${ch.id}`}
                        onClick={(e) => { e.stopPropagation(); if (showListMembersId === ch.id) { setShowListMembersId(null); } else { const rect = e.currentTarget.getBoundingClientRect(); listMembersPosRef.current = { top: rect.bottom + 4, left: rect.left }; setShowListMembersId(ch.id); } }}
                        style={{ background: 'rgba(212,175,55,0.08)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.15)' }}>{ch.estate_name}</span>
                      {ch.last_message && <span className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--t5)' }}>{ch.last_message.content}</span>}
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );

  // ── Message Area ───────────────────────────────────────────────────────────
  const messageArea = activeChannel && (
    <div className={`${!showChannelList || activeChannel ? 'flex' : 'hidden'} lg:flex flex-col flex-1`} style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={handleBackOut} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" data-testid="ect-back-btn" style={{ background: 'rgba(255,255,255,0.06)' }} aria-label="Back to conversations">
          <ArrowLeft className="w-4 h-4" style={{ color: 'var(--t4)' }} />
        </button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-sm font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}>
          {activeChannel.type === 'direct' && activeChannel.photo_url ? <img src={activeChannel.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = activeChannel.name?.charAt(0)?.toUpperCase() || '?'; }} />
            : activeChannel.estate_photo_url ? <img src={activeChannel.estate_photo_url} alt="" className="w-9 h-9 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = (activeChannel.estate_name || activeChannel.name)?.charAt(0)?.toUpperCase() || '?'; }} />
            : activeChannel.type === 'direct' ? (activeChannel.name?.charAt(0)?.toUpperCase() || '?') : getChannelIcon(activeChannel.type)}
        </div>
        <div className="flex-1 min-w-0 relative">
          <div className="text-sm font-bold truncate" style={{ color: 'var(--t)' }}>{activeChannel.type === 'direct' ? activeChannel.name : `${activeChannel.estate_name || activeChannel.name} Members`}</div>
          <button onClick={(e) => { e.stopPropagation(); setShowHeaderMembers(!showHeaderMembers); }} className="text-[11px] cursor-pointer" data-testid="ect-header-members-link"
            style={{ color: '#d4af37', background: 'none', border: 'none', padding: 0, font: 'inherit', textDecoration: 'none' }}>
            {activeChannel.type === 'circle' ? 'All estate members' : activeChannel.type === 'group' ? `${activeChannel.members?.length || 0} members` : 'Direct message'}
          </button>
          {showHeaderMembers && (
            <div className="absolute left-0 top-full mt-1 rounded-xl overflow-hidden z-50" data-testid="ect-header-members-dropdown"
              style={{ background: '#1A2238', border: '1px solid rgba(212,175,55,0.25)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: '220px', maxWidth: '280px', maxHeight: '300px', overflowY: 'auto' }}>
              <div className="px-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}><span className="text-[11px] font-semibold" style={{ color: 'var(--t4)' }}>Members</span></div>
              {resolveChannelMembers(activeChannel.members || [], activeChannel.estate_id).map(m => {
                const initials = m.name ? m.name.split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() : '?';
                const isYou = m.id === user?.id;
                return (
                  <div key={m.id} className="flex items-center gap-2.5 px-3 py-2" data-testid={`header-member-${m.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-xs font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>
                      {m.photo_url ? <img src={m.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = initials; }} /> : initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: 'var(--t)' }}>{m.name}{isYou ? ' (You)' : ''}</div>
                      {(m.relation || m.role_in_estate) && <div className="text-[11px] truncate" style={{ color: 'var(--t4)' }}>{m.relation || m.role_in_estate}</div>}
                    </div>
                  </div>
                );
              })}
              {activeChannel.type === 'group' && (() => {
                const available = getNonChannelMembers(activeChannel.members, activeChannel.estate_id);
                if (!available.length) return null;
                return (
                  <>
                    <div className="px-3 py-1.5" style={{ borderTop: '1px solid rgba(212,175,55,0.15)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}><span className="text-[11px] font-semibold" style={{ color: '#d4af37' }}>Add to Chat</span></div>
                    {available.map(m => {
                      const initials = m.name ? m.name.split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() : '?';
                      return (
                        <button key={m.id} onClick={(e) => { e.stopPropagation(); addMemberToChannel(activeChannel.id, m.id, activeChannel.estate_id); }} className="flex items-center gap-2.5 px-3 py-2 w-full text-left hover:bg-white/5 transition-colors" data-testid={`header-add-member-${m.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-xs font-bold" style={{ background: 'rgba(76,175,80,0.15)', color: '#4CAF50' }}>
                            {m.photo_url ? <img src={m.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = initials; }} /> : initials}
                          </div>
                          <div className="flex-1 min-w-0"><div className="text-xs font-semibold truncate" style={{ color: 'var(--t)' }}>{m.name}</div>{(m.relation || m.role_in_estate) && <div className="text-[11px] truncate" style={{ color: 'var(--t4)' }}>{m.relation || m.role_in_estate}</div>}</div>
                          <UserPlus className="w-4 h-4 flex-shrink-0" style={{ color: '#4CAF50' }} />
                        </button>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          )}
        </div>
        {pinnedMsgs.length > 0 && (
          <button onClick={() => setShowPinned(!showPinned)} className="h-8 px-2.5 rounded-full flex items-center gap-1.5" data-testid="ect-header-pinned-btn"
            style={{ background: showPinned ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)', border: showPinned ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent' }}>
            <Pin className="w-3.5 h-3.5" style={{ color: '#d4af37' }} />
            <span className="text-xs font-bold" style={{ color: '#d4af37' }}>{pinnedMsgs.length}</span>
          </button>
        )}
        {activeChannel.type === 'group' && isBenefactor && (
          <button onClick={() => deleteChannel(activeChannel.id)} className="w-8 h-8 rounded-full flex items-center justify-center" data-testid="ect-delete-channel" style={{ background: 'rgba(240,82,82,0.1)' }}>
            <Trash2 className="w-4 h-4" style={{ color: '#F05252' }} />
          </button>
        )}
      </div>

      {/* Messages scroll container */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
        <div className="px-4 pt-4 pb-1 space-y-3" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          {/* Pinned messages panel */}
          {showPinned && pinnedMsgs.length > 0 && (
            <div className="mb-3 rounded-2xl overflow-hidden" style={{ background: 'rgba(30,40,60,0.95)', border: '1px solid rgba(212,175,55,0.25)', WebkitBackdropFilter: 'blur(20px)', backdropFilter: 'blur(20px)' }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(212,175,55,0.15)' }}>
                <Pin className="w-4 h-4" style={{ color: '#d4af37' }} />
                <span className="text-xs font-bold flex-1" style={{ color: '#d4af37' }}>Pinned Messages</span>
                <button onClick={() => setShowPinned(false)} className="p-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}><X className="w-3.5 h-3.5" style={{ color: 'var(--t4)' }} /></button>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {pinnedMsgs.map(pm => (
                  <div key={pm.id} className="flex items-start gap-3 px-4 py-2.5" data-testid={`pinned-msg-${pm.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-semibold" style={{ color: '#d4af37' }}>{pm.sender_name}</span>
                      <p className="text-sm" style={{ color: '#D8DEE9' }}>{pm.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {msgLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#d4af37' }} /></div>}
          {!msgLoading && messages.length === 0 && (
            <div className="text-center py-12"><MessageCircle className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--t5)' }} /><p className="text-sm" style={{ color: 'var(--t4)' }}>No messages yet. Say hello!</p></div>
          )}
          {messages.map((msg, msgIdx) => {
            const isMe = msg.sender_id === user?.id;
            const isDM = activeChannel?.type === 'direct';
            const totalOthers = readStatus.length;
            let receiptStatus = 'sent';
            if (isMe && totalOthers > 0) {
              let readByCount = 0;
              let deliveredToCount = 0;
              const deliveredTo = msg.delivered_to || [];
              for (const r of readStatus) {
                if (r.last_read_at && r.last_read_at >= msg.created_at) readByCount++;
                if (deliveredTo.includes(r.user_id)) deliveredToCount++;
              }
              if (readByCount > 0) { receiptStatus = readByCount >= totalOthers ? 'read_all' : 'read_partial'; }
              else if (deliveredToCount > 0) { receiptStatus = deliveredToCount >= totalOthers ? 'delivered_all' : 'delivered_partial'; }
              msg._readByCount = readByCount;
              msg._deliveredToCount = deliveredToCount;
            }
            const msgDate = new Date(msg.created_at);
            const prevMsg = msgIdx > 0 ? messages[msgIdx - 1] : null;
            const prevDate = prevMsg ? new Date(prevMsg.created_at) : null;
            const showDateSep = !prevDate || msgDate.toLocaleDateString() !== prevDate.toLocaleDateString();
            const isToday = msgDate.toLocaleDateString() === new Date().toLocaleDateString();
            const isYesterday = msgDate.toLocaleDateString() === new Date(Date.now() - 86400000).toLocaleDateString();
            const dateLabel = isToday ? 'Today' : isYesterday ? 'Yesterday' : msgDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
            const reactionGroups = (msg.reactions || []).reduce((acc, r) => { acc[r.emoji] = (acc[r.emoji] || []); acc[r.emoji].push(r); return acc; }, {});
            const hasReactions = Object.keys(reactionGroups).length > 0;

            return (
              <React.Fragment key={msg.id}>
                {showDateSep && (
                  <div className="flex items-center justify-center py-2">
                    <span className="text-[11px] font-semibold px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}>{dateLabel}</span>
                  </div>
                )}
                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`} style={poppingMsgId === msg.id ? { animation: 'msgPop 0.35s ease-out forwards' } : undefined}>
                  <div className="max-w-[80%]">
                    {!isMe && <div className="text-[11px] font-semibold mb-1 ml-1" style={{ color: '#d4af37' }}>{msg.sender_name}</div>}
                    {editingMsg && editingMsg.id === msg.id ? (
                      <div className="flex flex-col gap-1.5 rounded-2xl px-3 py-2" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)' }}>
                        <input autoFocus value={editingMsg.content} onChange={(e) => setEditingMsg({ ...editingMsg, content: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleEditMessage(); } if (e.key === 'Escape') setEditingMsg(null); }}
                          className="w-full rounded-lg px-3 py-2 text-sm" data-testid="edit-message-input"
                          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px', outline: 'none' }} />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingMsg(null)} className="text-xs px-3 py-1 rounded-lg" style={{ color: 'var(--t4)', background: 'rgba(255,255,255,0.06)' }} data-testid="edit-cancel-btn">Cancel</button>
                          <button onClick={handleEditMessage} className="text-xs px-3 py-1 rounded-lg font-semibold" style={{ color: '#080e1a', background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }} data-testid="edit-save-btn">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        {hasReactions && reactingMsgId !== msg.id && (
                          <button className="absolute z-10 flex items-center" style={{ top: '-10px', left: '-4px' }}
                            onClick={(e) => { e.stopPropagation(); setReactionDetailId(reactionDetailId === msg.id ? null : msg.id); }} data-testid={`reaction-stack-${msg.id}`}>
                            {Object.entries(reactionGroups).map(([emoji, reactors], i) => {
                              const cfg = REACTION_EMOJIS[emoji];
                              return <span key={emoji} className="text-base" style={{ marginLeft: i > 0 ? '-6px' : '0', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>{cfg?.display || emoji}</span>;
                            })}
                          </button>
                        )}
                        {msg.pinned && <div className="absolute z-10" style={{ top: '-8px', right: '-6px' }}><Pin className="w-3.5 h-3.5" style={{ color: '#d4af37', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} /></div>}
                        <div className="px-4 py-2.5 rounded-2xl text-sm cursor-pointer" data-testid={`msg-bubble-${msg.id}`}
                          onClick={() => { if (msgLongPressTriggered.current) { msgLongPressTriggered.current = false; return; } if (previewGuardRef.current) return; setReactingMsgId(reactingMsgId === msg.id ? null : msg.id); closeMsgAction(); }}
                          onTouchStart={(e) => onMsgTouchStart(e, msg.id)} onTouchMove={onMsgTouchMove} onTouchEnd={(e) => onMsgTouchEnd(e, msg.id)}
                          onContextMenu={(e) => { e.preventDefault(); if (previewGuardRef.current) return; openMsgAction(msg.id); setReactingMsgId(null); }}
                          style={{ background: isMe ? 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(212,175,55,0.1))' : 'rgba(255,255,255,0.05)', border: `1px solid ${isMe ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)'}`, color: 'var(--t)', borderTopRightRadius: isMe ? '6px' : '18px', borderTopLeftRadius: isMe ? '18px' : '6px', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none', marginTop: hasReactions ? '10px' : '0' }}>
                          {msg.reply_to && (
                            <div className="mb-1.5 px-2.5 py-1.5 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.06)', borderLeft: '2px solid #d4af37' }}>
                              <div className="font-semibold" style={{ color: '#d4af37' }}>{msg.reply_to.sender_name}</div>
                              <div className="truncate" style={{ color: 'var(--t4)' }}>{msg.reply_to.content}</div>
                            </div>
                          )}
                          {msg.attachments && msg.attachments.length > 1 ? (
                            <div className="grid gap-1" style={{ gridTemplateColumns: msg.attachments.length === 2 ? '1fr 1fr' : 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                              {msg.attachments.map((att) => {
                                const ext = (att.file_name || '').split('.').pop().toLowerCase();
                                const isImage = att.file_type?.startsWith('image/') || ['jpg','jpeg','png','gif','webp','heic','heif'].includes(ext);
                                const isVideo = att.file_type?.startsWith('video/') || ['mp4','mov','webm','m4v'].includes(ext);
                                if (isImage) return <AuthImage key={att.file_id} fileId={att.file_id} fileName={att.file_name} msgId={msg.id} onPreview={(s, n, fid) => { if (previewGuardRef.current) return; previewGuardRef.current = true; setPreviewImage({ src: s, name: n, fileId: fid }); }} />;
                                if (isVideo) return <AuthVideo key={att.file_id} fileId={att.file_id} fileName={att.file_name} />;
                                return <AuthFileLink key={att.file_id} fileId={att.file_id} fileName={att.file_name} fileSize={att.file_size} msgId={msg.id} />;
                              })}
                            </div>
                          ) : msg.attachment ? (() => {
                            const ext = (msg.attachment.file_name || '').split('.').pop().toLowerCase();
                            const isImage = msg.attachment.file_type?.startsWith('image/') || ['jpg','jpeg','png','gif','webp','heic','heif'].includes(ext) || msg.message_type === 'image';
                            const isVideo = msg.attachment.file_type?.startsWith('video/') || ['mp4','mov','webm','m4v'].includes(ext);
                            if (msg.message_type === 'voice') return <VoiceMessagePlayer fileId={msg.attachment.file_id} />;
                            if (isVideo) return <AuthVideo fileId={msg.attachment.file_id} fileName={msg.attachment.file_name} />;
                            if (isImage) return <AuthImage fileId={msg.attachment.file_id} fileName={msg.attachment.file_name} msgId={msg.id} onPreview={(s, n, fid) => { if (previewGuardRef.current) return; previewGuardRef.current = true; setPreviewImage({ src: s, name: n, fileId: fid }); }} />;
                            return <AuthFileLink fileId={msg.attachment.file_id} fileName={msg.attachment.file_name} fileSize={msg.attachment.file_size} msgId={msg.id} />;
                          })() : (() => {
                            const content = msg.content || '';
                            const urlRegex = /(https?:\/\/[^\s]+)/g;
                            const parts = content.split(urlRegex);
                            if (parts.length <= 1) return content;
                            return parts.map((part, pi) => urlRegex.test(part)
                              ? <a key={pi} href={part} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline break-all" style={{ color: '#5BA3F5' }}>{part.includes('maps.google.com') ? <><MapPin className="w-3.5 h-3.5 inline mr-1" />Open in Maps</> : part}</a>
                              : <React.Fragment key={pi}>{part}</React.Fragment>);
                          })()}
                        </div>
                        {reactionDetailId === msg.id && hasReactions && (
                          <div className={`mt-1.5 rounded-xl overflow-hidden ${isMe ? 'ml-auto' : ''}`} style={{ background: 'rgba(30,40,60,0.95)', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '220px', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)' }}>
                            {(msg.reactions || []).map((r, ri) => {
                              const cfg = REACTION_EMOJIS[r.emoji];
                              return (
                                <div key={ri} className="flex items-center gap-2.5 px-3 py-2" style={{ borderBottom: ri < (msg.reactions || []).length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-[11px] font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>{r.user_name?.charAt(0)?.toUpperCase() || '?'}</div>
                                  <span className="text-xs flex-1 truncate" style={{ color: 'var(--t)' }}>{r.user_name || 'Unknown'}</span>
                                  <span className="text-base">{cfg?.display || r.emoji}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {reactingMsgId === msg.id && (
                          <>
                            <div className="fixed inset-0 z-[50]" onTouchEnd={(e) => { e.preventDefault(); setReactingMsgId(null); setShowInlineEmojiPicker(null); }} onClick={() => { setReactingMsgId(null); setShowInlineEmojiPicker(null); }} />
                            <div style={{ position: 'relative', height: showInlineEmojiPicker === msg.id ? 'auto' : '36px' }}>
                              <div className="absolute z-[51] flex gap-1" style={{ top: '4px', whiteSpace: 'nowrap', ...(isMe ? { right: 0 } : { left: 0 }) }} data-testid={`reaction-picker-${msg.id}`}>
                                {recentEmojis.slice(0, 5).map((emoji) => {
                                  const myReaction = (msg.reactions || []).some(r => (r.emoji === emoji || displayEmoji(r.emoji) === emoji) && r.user_id === user?.id);
                                  return (
                                    <button key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, emoji); }}
                                      className="w-8 h-8 rounded-lg flex items-center justify-center text-base transition-all hover:scale-110 active:scale-95"
                                      style={{ background: myReaction ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)', border: myReaction ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent' }}>{emoji}</button>
                                  );
                                })}
                                <EmojiPickerButtonSmall onClick={() => setShowInlineEmojiPicker(showInlineEmojiPicker === msg.id ? null : msg.id)} />
                                {isBenefactor && (
                                  <button onClick={(e) => { e.stopPropagation(); togglePin(msg.id); }} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                                    data-testid={`pin-btn-${msg.id}`} style={{ background: msg.pinned ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)', border: msg.pinned ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent' }} title={msg.pinned ? 'Unpin' : 'Pin'}>
                                    <Pin className="w-4 h-4" style={{ color: msg.pinned ? '#d4af37' : 'var(--t4)' }} />
                                  </button>
                                )}
                              </div>
                              {showInlineEmojiPicker === msg.id && (
                                <div className="relative z-[52] pt-10" style={{ ...(isMe ? { marginLeft: 'auto', width: 'fit-content' } : { width: 'fit-content' }) }}>
                                  <EmojiPickerGrid onSelect={(emoji) => { toggleReaction(msg.id, emoji); setShowInlineEmojiPicker(null); }} onClose={() => setShowInlineEmojiPicker(null)} isOwn={isMe} />
                                </div>
                              )}
                            </div>
                          </>
                        )}
                        <div className={`text-[11px] mt-0.5 flex items-center gap-1.5 ${isMe ? 'justify-end mr-1' : 'ml-1'}`} style={{ color: 'var(--t5)' }}>
                          {msg.edited_at && <span className="italic" style={{ color: 'var(--t4)' }}>Edited</span>}
                          <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {isMe && (receiptStatus === 'read_all' || receiptStatus === 'read_partial') && (
                            <span className="flex items-center gap-0.5" data-testid="receipt-read">
                              <CheckCheck className="w-3.5 h-3.5" style={{ color: '#3B7BF7' }} />
                              {!isDM && receiptStatus === 'read_partial' && <span className="text-[11px]" style={{ color: '#3B7BF7' }}>{msg._readByCount}</span>}
                              {!isDM && receiptStatus === 'read_all' && totalOthers > 1 && <span className="text-[11px] font-semibold" style={{ color: '#3B7BF7' }}>All</span>}
                            </span>
                          )}
                          {isMe && (receiptStatus === 'delivered_all' || receiptStatus === 'delivered_partial') && (
                            <span className="flex items-center gap-0.5" data-testid="receipt-delivered">
                              <CheckCheck className="w-3.5 h-3.5" style={{ color: 'var(--t4)' }} />
                              {!isDM && receiptStatus === 'delivered_partial' && <span className="text-[11px]" style={{ color: 'var(--t4)' }}>{msg._deliveredToCount}</span>}
                            </span>
                          )}
                          {isMe && receiptStatus === 'sent' && <span data-testid="receipt-sent" style={{ color: 'var(--t5)' }}><Check className="w-3 h-3" /></span>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input Bar — keyboard-critical section: DO NOT REORGANIZE ── */}
      <div className="flex-shrink-0" style={{ background: 'var(--bg)', borderTop: '1px solid var(--bg)', paddingBottom: '4px', position: 'relative', zIndex: 10 }}
        onTouchStart={(e) => { e.currentTarget._touchY = e.touches[0].clientY; }}
        onTouchMove={(e) => { const dy = e.touches[0].clientY - (e.currentTarget._touchY || 0); if (dy > 30) { inputRef.current?.blur(); } }}>
        {typers.length > 0 && (
          <div className="px-4 pt-2 pb-1 flex items-center gap-1.5" data-testid="typing-indicator">
            <div className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#d4af37', animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#d4af37', animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#d4af37', animationDelay: '300ms' }} />
            </div>
            <span className="text-xs" style={{ color: 'var(--t4)' }}>{typers.length === 1 ? `${typers[0].user_name} is typing...` : `${typers.map(t => t.user_name).join(', ')} are typing...`}</span>
          </div>
        )}
        {replyTo && (
          <div className="flex items-center gap-2 px-3 py-2 mx-3 mb-1 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)', borderLeft: '3px solid #d4af37' }}>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold" style={{ color: '#d4af37' }}>{replyTo.sender_name}</div>
              <div className="text-xs truncate" style={{ color: 'var(--t4)' }}>{replyTo.content}</div>
            </div>
            <button onClick={() => setReplyTo(null)} className="flex-shrink-0 p-1" data-testid="cancel-reply-btn"><X className="w-4 h-4" style={{ color: 'var(--t4)' }} /></button>
          </div>
        )}
        {pendingFiles.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 mx-3 mb-1 rounded-xl" style={{ background: 'var(--s)', border: '1px solid rgba(212,175,55,0.3)' }}>
            <div className="flex gap-2 flex-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {pendingFiles.map((pf, idx) => (
                <div key={idx} className="relative flex-shrink-0">
                  {pf.previewUrl && pf.file.type.startsWith('video/') ? (
                    <div className="w-14 h-14 rounded-lg overflow-hidden relative" style={{ background: '#000' }}>
                      <video src={pf.previewUrl} className="w-full h-full object-cover" muted playsInline />
                      <div className="absolute inset-0 flex items-center justify-center"><Play className="w-5 h-5 text-white/80" /></div>
                    </div>
                  ) : pf.previewUrl ? (
                    <img src={pf.previewUrl} alt="Preview" className="w-14 h-14 rounded-lg object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg flex flex-col items-center justify-center" style={{ background: 'rgba(212,175,55,0.1)' }}>
                      <FileText className="w-4 h-4 text-[var(--gold)]" />
                      <span className="text-[11px] text-[var(--t5)] mt-0.5 truncate max-w-[50px]">{pf.file.name.split('.').pop()}</span>
                    </div>
                  )}
                  <button onClick={() => { if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl); setPendingFiles(prev => prev.filter((_, i) => i !== idx)); }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#ef4444' }}>
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center gap-1 flex-shrink-0 ml-1">
              <button onClick={() => { pendingFiles.forEach(pf => { if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl); }); setPendingFiles([]); }}
                className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)' }} data-testid="ect-attach-cancel" aria-label="Cancel attachments">
                <X className="w-4 h-4 text-red-400" />
              </button>
              <button onClick={() => { uploadMultipleFiles(pendingFiles); pendingFiles.forEach(pf => { if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl); }); setPendingFiles([]); }}
                disabled={uploading} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#d4af37' }} data-testid="ect-attach-send" aria-label="Send attachments">
                {uploading ? <Loader2 className="w-5 h-5 animate-spin text-[#0F1629]" /> : <Send className="w-5 h-5 text-[#0F1629]" />}
              </button>
            </div>
          </div>
        )}
        <div className="flex items-end gap-2 px-3 py-1">
          <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,video/*,.pdf,.doc,.docx,.txt"
            onChange={(e) => {
              const selected = Array.from(e.target.files || []);
              if (!selected.length) return;
              const maxTotal = 5;
              const currentCount = pendingFiles.length;
              const allowed = selected.slice(0, maxTotal - currentCount);
              if (selected.length > allowed.length) toast.error(`Maximum ${maxTotal} files. ${selected.length - allowed.length} file(s) skipped.`);
              const videoSizeLimit = 25 * 1024 * 1024;
              const fileSizeLimit = 10 * 1024 * 1024;
              const validated = [];
              for (const file of allowed) {
                const isVideo = file.type.startsWith('video/');
                const limit = isVideo ? videoSizeLimit : fileSizeLimit;
                if (file.size > limit) { const mb = Math.round(limit / (1024 * 1024)); toast.error(`${file.name} exceeds ${mb}MB limit`); continue; }
                const previewUrl = (file.type.startsWith('image/') || file.type.startsWith('video/')) ? URL.createObjectURL(file) : null;
                validated.push({ file, previewUrl });
              }
              if (validated.length) setPendingFiles(prev => [...prev, ...validated]);
              e.target.value = '';
            }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading || voiceRecorder.recording}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-[3px]" data-testid="ect-attach-btn" style={{ background: 'var(--ect-btn-bg)' }} aria-label="Attach file">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4af37' }} /> : <Paperclip className="w-5 h-5" style={{ color: 'var(--ect-btn-icon)' }} />}
          </button>

          {/* Input area — keyboard-critical: DO NOT REORGANIZE THESE HANDLERS */}
          <div className="flex-1 relative" style={{ minWidth: 0, overflow: 'hidden' }}>
            {inputFocused && (
              <button type="button" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { if (inputRef.current) inputRef.current.blur(); setInputFocused(false); }}
                className="lg:hidden absolute top-1 right-1 z-10 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(212,175,55,0.18)', border: '1px solid rgba(212,175,55,0.35)' }}
                data-testid="ect-dismiss-keyboard-btn" aria-label="Dismiss keyboard">
                <ChevronDown className="w-3.5 h-3.5" style={{ color: '#d4af37' }} strokeWidth={3} />
              </button>
            )}
            <textarea ref={inputRef} value={draft} onChange={handleDraftChange}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                const imageFiles = [];
                for (let i = 0; i < items.length; i++) { if (items[i].type.startsWith('image/')) { const blob = items[i].getAsFile(); if (blob) imageFiles.push(blob); } }
                if (!imageFiles.length) return;
                e.preventDefault();
                const maxTotal = 5;
                const currentCount = pendingFiles.length;
                const allowed = imageFiles.slice(0, maxTotal - currentCount);
                if (imageFiles.length > allowed.length) toast.error(`Maximum ${maxTotal} files. ${imageFiles.length - allowed.length} file(s) skipped.`);
                const validated = allowed.map(file => ({ file, previewUrl: URL.createObjectURL(file) }));
                if (validated.length) setPendingFiles(prev => [...prev, ...validated]);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  if (window.innerWidth > 1024) { e.preventDefault(); sendMessage(); }
                  else { e.preventDefault(); if (inputRef.current) inputRef.current.blur(); setInputFocused(false); }
                }
              }}
              onInput={(e) => {
                if (window.innerWidth <= 1024) {
                  const v = e.target.value;
                  if (v.includes('\n')) { e.target.value = v.replace(/\n+$/g, ''); setDraft(v.replace(/\n+$/g, '')); if (inputRef.current) inputRef.current.blur(); setInputFocused(false); }
                }
              }}
              onFocus={() => {
                setInputFocused(true);
                const scrollInput = () => { try { inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} };
                setTimeout(scrollInput, 100); setTimeout(scrollInput, 300); setTimeout(scrollInput, 600);
                const doScroll = () => { const sc = scrollContainerRef.current; if (sc) sc.scrollTop = sc.scrollHeight; };
                requestAnimationFrame(doScroll); setTimeout(doScroll, 150); setTimeout(doScroll, 400); setTimeout(doScroll, 700);
              }}
              onTouchStart={() => {
                if (document.activeElement === inputRef.current) {
                  setTimeout(() => { try { inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} }, 300);
                }
              }}
              onBlur={() => {
                setInputFocused(false);
                const doScroll = () => { const sc = scrollContainerRef.current; if (sc) sc.scrollTop = sc.scrollHeight; };
                setTimeout(doScroll, 100); setTimeout(doScroll, 350);
              }}
              enterKeyHint="done" rows={1} placeholder="Type a message..." className="w-full rounded-2xl px-4 py-2 text-base"
              data-testid="ect-message-input" aria-label="Type a message"
              style={{ background: 'var(--ect-input-bg)', border: 'none', outline: 'none', resize: 'none', overflowY: 'auto', maxHeight: '120px', minHeight: '40px', color: (voiceRecorder.recording || voicePreview) ? 'transparent' : 'var(--ect-input-text)', fontSize: '16px', caretColor: (voiceRecorder.recording || voicePreview) ? 'transparent' : 'var(--ect-input-text)', lineHeight: '1.4' }} />
            {voiceRecorder.recording && (
              <div className="absolute inset-0 flex items-center gap-3 rounded-2xl px-4" style={{ background: '#2A1519', border: '1px solid #5C2A2A' }}>
                <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--t)' }}>{Math.floor(voiceRecorder.duration / 60)}:{(voiceRecorder.duration % 60).toString().padStart(2, '0')}</span>
                <span className="text-xs" style={{ color: 'var(--t4)' }}>Recording...</span>
                <button onMouseDown={(e) => e.preventDefault()} onClick={stopAndPreview} className="ml-auto p-2 rounded-full" style={{ background: '#1A1F2E' }} data-testid="ect-voice-stop" aria-label="Stop recording"><Square className="w-4 h-4" style={{ color: 'var(--t)' }} /></button>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => { voiceRecorder.cancel(); inputRef.current?.focus(); }} className="p-2 rounded-full" style={{ background: '#1A1F2E' }} data-testid="ect-voice-cancel" aria-label="Cancel recording"><X className="w-4 h-4" style={{ color: '#ef4444' }} /></button>
              </div>
            )}
            {!voiceRecorder.recording && voicePreview && (
              <div className="absolute inset-0 flex items-center gap-2 rounded-2xl px-3" style={{ background: '#1A2235', border: '1px solid #3A4560' }}>
                <audio src={voicePreview.url} controls className="h-8 flex-1" style={{ maxWidth: '100%', filter: 'invert(1) hue-rotate(180deg)', opacity: 0.8 }} />
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => { discardPreview(); inputRef.current?.focus(); }} className="p-2 rounded-full flex-shrink-0" style={{ background: '#1A1F2E' }} data-testid="ect-voice-discard" aria-label="Discard recording"><X className="w-4 h-4" style={{ color: '#ef4444' }} /></button>
              </div>
            )}
          </div>

          {draft.trim() ? (
            <button onMouseDown={(e) => e.preventDefault()} onClick={sendMessage} disabled={sending}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-[3px]" data-testid="ect-send-btn" style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }} aria-label="Send message">
              {sending ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#080e1a' }} /> : <Send className="w-5 h-5" style={{ color: '#080e1a' }} />}
            </button>
          ) : voiceRecorder.recording ? (
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => sendVoiceMessage()}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-[3px]" data-testid="ect-voice-send" aria-label="Send voice message" style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }}>
              <Send className="w-5 h-5" style={{ color: '#080e1a' }} />
            </button>
          ) : voicePreview ? (
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => sendVoiceMessage(voicePreview.blob)} disabled={uploading}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-[3px]" data-testid="ect-voice-preview-send" aria-label="Send voice message" style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }}>
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#080e1a' }} /> : <Send className="w-5 h-5" style={{ color: '#080e1a' }} />}
            </button>
          ) : (
            <button onClick={() => { if (inputRef.current) inputRef.current.blur(); setInputFocused(false); voiceRecorder.start(); }}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-[3px]" data-testid="ect-voice-btn" style={{ background: 'var(--ect-btn-bg)' }} aria-label="Record voice message">
              <Mic className="w-5 h-5" style={{ color: 'var(--ect-btn-icon)' }} />
            </button>
          )}
        </div>
        {!inputFocused && (
          <div className="flex items-center justify-center gap-1 px-2 pt-0.5 pb-0.5" style={{ background: 'transparent', touchAction: 'none', paddingBottom: 'max(2px, env(safe-area-inset-bottom, 2px))' }}>
            {recentEmojis.map(emoji => (
              <button key={emoji} onMouseDown={(e) => e.preventDefault()} onClick={() => setDraft(prev => prev + emoji)}
                className="flex-1 h-9 rounded-full flex items-center justify-center text-lg active:scale-90 transition-transform" style={{ background: 'var(--s)', maxWidth: '40px' }} data-testid={`quick-emoji-${emoji}`}>{emoji}</button>
            ))}
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => setDraft(prev => prev.length > 0 ? [...prev].slice(0, -1).join('') : '')}
              className="flex-1 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform" style={{ background: 'rgba(255,255,255,0.06)', maxWidth: '40px' }} data-testid="quick-backspace-btn">
              <Delete className="w-5 h-5" style={{ color: 'var(--t4)' }} />
            </button>
            <EmojiPickerButton onClick={() => setShowDraftEmojiPicker(v => !v)} />
          </div>
        )}
        {!inputFocused && showDraftEmojiPicker && (
          <>
            <div className="fixed inset-0 z-[15]" onClick={() => setShowDraftEmojiPicker(false)} onTouchEnd={(e) => { e.preventDefault(); setShowDraftEmojiPicker(false); }} />
            <div className="fixed z-[16]" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', right: '12px' }}>
              <EmojiPickerGrid onSelect={(emoji) => { setDraft(prev => prev + emoji); setRecentEmojis(addRecentEmoji(emoji)); }} onClose={() => setShowDraftEmojiPicker(false)} searchPosition="bottom" />
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ── Root render ────────────────────────────────────────────────────────────
  return (
    <>
      <div id="ect-root" data-testid="estate-chat-page" className="flex flex-col"
        style={{ background: 'var(--bg)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 45, overflow: 'hidden' }}>
        <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 56px)', flexShrink: 0 }} />
        <div className="hidden lg:flex flex-1 min-h-0">
          <div style={{ width: 340, minWidth: 340 }}>{channelPanel}</div>
          <div className="flex-1 flex flex-col">{activeChannel ? messageArea : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <MessageCircle className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--t5)' }} />
                <p className="text-base font-semibold" style={{ color: 'var(--t4)' }}>Select a conversation</p>
                <p className="text-sm mt-1" style={{ color: 'var(--t5)' }}>or start a new one</p>
              </div>
            </div>
          )}</div>
        </div>
        <div className="flex flex-col lg:hidden flex-1 min-h-0">
          {showChannelList && !activeChannel ? channelPanel : messageArea}
        </div>
      </div>

      {newChatModal}

      {/* Channel list members dropdown — outside transform stacking context */}
      {showListMembersId && (() => {
        const ch = channels.find(c => c.id === showListMembersId);
        if (!ch) return null;
        const pos = listMembersPosRef.current;
        return (
          <>
            <div className="fixed inset-0" style={{ zIndex: 200 }} onClick={() => setShowListMembersId(null)} onTouchEnd={(e) => { e.preventDefault(); setShowListMembersId(null); }} />
            <div className="fixed rounded-xl overflow-hidden" data-testid={`ect-list-members-dropdown-${ch.id}`}
              style={{ zIndex: 201, background: '#1A2238', border: '1px solid rgba(212,175,55,0.25)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', minWidth: '220px', maxWidth: '280px', maxHeight: '300px', overflowY: 'auto', left: `${pos.left}px`, top: `${pos.top}px` }}>
              <div className="px-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}><span className="text-[11px] font-semibold" style={{ color: 'var(--t4)' }}>Members</span></div>
              {resolveChannelMembers(ch.members || [], ch.estate_id).map(m => {
                const initials = m.name ? m.name.split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() : '?';
                const isYou = m.id === user?.id;
                return (
                  <div key={m.id} className="flex items-center gap-2.5 px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-[11px] font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>
                      {m.photo_url ? <img src={m.photo_url} alt="" className="w-7 h-7 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = initials; }} /> : initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--t)' }}>{m.name}{isYou ? ' (You)' : ''}</div>
                      {(m.relation || m.role_in_estate) && <div className="text-[11px] truncate" style={{ color: 'var(--t4)' }}>{m.relation || m.role_in_estate}</div>}
                    </div>
                  </div>
                );
              })}
              {ch.type === 'group' && (() => {
                const available = getNonChannelMembers(ch.members, ch.estate_id);
                if (!available.length) return null;
                return (
                  <>
                    <div className="px-3 py-1.5" style={{ borderTop: '1px solid rgba(212,175,55,0.15)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}><span className="text-[11px] font-semibold" style={{ color: '#d4af37' }}>Add to Chat</span></div>
                    {available.map(m => {
                      const initials = m.name ? m.name.split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() : '?';
                      return (
                        <button key={m.id} onClick={(e) => { e.stopPropagation(); addMemberToChannel(ch.id, m.id, ch.estate_id); }} className="flex items-center gap-2.5 px-3 py-2 w-full text-left hover:bg-white/5 transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-[11px] font-bold" style={{ background: 'rgba(76,175,80,0.15)', color: '#4CAF50' }}>
                            {m.photo_url ? <img src={m.photo_url} alt="" className="w-7 h-7 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = initials; }} /> : initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--t)' }}>{m.name}</div>
                            {(m.relation || m.role_in_estate) && <div className="text-[11px] truncate" style={{ color: 'var(--t4)' }}>{m.relation || m.role_in_estate}</div>}
                          </div>
                          <UserPlus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#4CAF50' }} />
                        </button>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </>
        );
      })()}

      {/* Long-press action menu */}
      <ECTActionMenu
        msgActionId={msgActionId} menuPosition={menuPosition} menuReady={menuReady}
        messages={messages} user={user} isBenefactor={isBenefactor}
        recentEmojis={recentEmojis} showActionEmojiPicker={showActionEmojiPicker}
        setShowActionEmojiPicker={setShowActionEmojiPicker}
        toggleReaction={toggleReaction} togglePin={togglePin}
        handleDeleteMessage={handleDeleteMessage} closeMsgAction={closeMsgAction}
        setReplyTo={setReplyTo} setEditingMsg={setEditingMsg} inputRef={inputRef}
        token={token} activeChannel={activeChannel} fetchMessages={fetchMessages}
        scrollContainerRef={scrollContainerRef} menuOpenedAtRef={menuOpenedAtRef}
      />

      {/* Confirmation dialogs (extracted pure components) */}
      <ECTDeleteConfirmDialog
        channel={deleteConfirm}
        onConfirm={deleteChannel}
        onCancel={() => { setDeleteConfirm(null); setSwipedChannel(null); }}
      />
      {bulkDeleteConfirm && (
        <ECTBulkDeleteConfirmDialog
          count={selectedChannels.size}
          loading={bulkDeleting}
          onConfirm={bulkDeleteChannels}
          onCancel={() => setBulkDeleteConfirm(false)}
        />
      )}

      {/* Security intro */}
      {showSecurityIntro && (
        <ECTSecurityIntro
          introStep={introStep} setIntroStep={setIntroStep}
          onDismiss={() => { setShowSecurityIntro(false); localStorage.setItem('ect_security_seen', '1'); setIntroStep(1); }}
          onBack={() => { setShowSecurityIntro(false); localStorage.setItem('ect_security_seen', '1'); setIntroStep(1); navigate(-1); }}
        />
      )}

      {/* Photo preview */}
      <ImagePreviewModal previewImage={previewImage} onClose={() => { setPreviewImage(null); setTimeout(() => { previewGuardRef.current = false; }, 300); }} />
    </>
  );
}
