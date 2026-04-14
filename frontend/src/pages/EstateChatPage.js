import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import { toast } from '../utils/toast';
import NewChatModal from '../components/chat/NewChatModal';
import {
  MessageCircle,
  Send,
  Plus,
  Users,
  Hash,
  User,
  ArrowLeft,
  Trash2,
  Circle,
  Loader2,
  X,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Pin,
  Paperclip,
  FileText,
  Image,
  Download,
  Search,
  Shield,
  Lock,
  Mic,
  Square,
  Play,
  Pause,
  CheckSquare2,
  UserPlus,
  Pencil,
  Copy,
  TextSelect,
  MapPin,
} from 'lucide-react';
import { platformDownload } from '../utils/downloadFile';
import useVoiceRecorder from '../components/estate-chat/useVoiceRecorder';
import VoiceMessagePlayer from '../components/estate-chat/VoiceMessagePlayer';
import { AuthImage, AuthVideo, AuthFileLink, prefetchMedia } from '../components/estate-chat/AuthMedia';
import ECTSecurityIntro from '../components/estate-chat/ECTSecurityIntro';
import ImagePreviewModal from '../components/estate-chat/ImagePreviewModal';

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
  const navigate = useNavigate();
  const token = localStorage.getItem('carryon_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [channels, setChannels] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSecurityIntro, setShowSecurityIntro] = useState(() => !localStorage.getItem('ect_security_seen'));
  const [introStep, setIntroStep] = useState(1);
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);
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
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchTimerRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeChannelRef = useRef(null);

  const voiceRecorder = useVoiceRecorder();
  const [voicePreview, setVoicePreview] = useState(null); // {blob, url}
  const [pendingFiles, setPendingFiles] = useState([]); // [{file, previewUrl}]
  const [inputFocused, setInputFocused] = useState(false);
  const [swipedChannel, setSwipedChannel] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [showHeaderMembers, setShowHeaderMembers] = useState(false);
  const [showListMembersId, setShowListMembersId] = useState(null);
  const [msgActionId, setMsgActionId] = useState(null); // message ID for long-press action menu
  const [msgActionPos, setMsgActionPos] = useState(null); // { top, right, left, above } for fixed positioning
  const [reactionDetailId, setReactionDetailId] = useState(null); // message ID for reaction detail dropdown
  const [replyTo, setReplyTo] = useState(null); // { id, content, sender_name } for reply-to
  const [editingMsg, setEditingMsg] = useState(null); // {id, content} when editing
  const [poppingMsgId, setPoppingMsgId] = useState(null); // message ID being deleted (pop animation)
  const [previewImage, setPreviewImage] = useState(null); // {src, name, fileId} for fullscreen photo preview
  const msgLongPressTimer = useRef(null);
  const msgLongPressTriggered = useRef(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  // ── Always hide the platform header in ECT; hide dock only inside a conversation ──
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

  // ── Close member dropdowns on outside tap ──
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
  }, [showHeaderMembers, showListMembersId]);

  // ── Visual Viewport sizing — keeps ECT root exactly within visible area ──
  // This prevents content from sitting behind the iOS keyboard accessory bar
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const root = document.getElementById('ect-root');
      if (root) {
        root.style.height = (vv.height - 8) + 'px';
        root.style.top = vv.offsetTop + 'px';
      }
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // ── Auto-resize textarea after re-renders (focus change, keyboard dismiss) ──
  useEffect(() => {
    if (inputRef.current) {
      const el = inputRef.current;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, [draft, inputFocused]);

  // ── Add member to channel ──
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

  // Get estate members not in the channel
  const getNonChannelMembers = (channelMembers, estateId) => {
    const estate = contacts.find(c => c.estate_id === estateId);
    if (!estate) return [];
    return (estate.members || []).filter(m => !(channelMembers || []).includes(m.id));
  };

  // ── Keep ref in sync with activeChannel state ──
  useEffect(() => {
    activeChannelRef.current = activeChannel;
    // When leaving a chat (going back to channel list), force-reset all inline styles
    if (!activeChannel) {
      setInputFocused(false);
    }
  }, [activeChannel]);

  // ── iOS keyboard: ZERO JavaScript manipulation ──
  // Root uses position:fixed + inset:0, which shrinks naturally with the viewport.
  // iOS handles keyboard by shrinking the viewport — the flex layout adapts.
  // DO NOT add scroll listeners, viewport handlers, or any JS that fights iOS.

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/estate-chat/channels`, { headers });
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
      } else {
        console.error('fetchChannels failed:', res.status);
      }
    } catch (err) { console.error('fetchChannels error:', err); } // eslint-disable-line no-empty
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        const el = messagesEndRef.current?.parentElement;
        const isNearBottom = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 150);
        setMessages(data);
        // Always scroll to bottom — on initial load and when near bottom
        setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, 80);
        setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, 400);
        // Prefetch media attachments for faster image loading
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchChannels(), fetchContacts()]);
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeChannel) return;
    fetchMessages(activeChannel.id);
    let msgCount = 0;
    const poll = setInterval(() => {
      fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/typing`, { headers })
        .then(r => r.ok ? r.json() : [])
        .then(d => setTypers(d || []))
        .catch(() => {});
      msgCount++;
      if (msgCount % 4 === 0) {
        fetchMessages(activeChannel.id);
        fetchChannels();
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [activeChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (contacts.length === 1 && !newChatEstate) setNewChatEstate(contacts[0].estate_id);
  }, [contacts, newChatEstate]);

  const openChannel = (ch) => {
    setActiveChannel(ch);
    setShowChannelList(false);
    setMsgLoading(true);
    setTypers([]);
    setSwipedChannel(null);
    setShowListMembersId(null);
    setShowHeaderMembers(false);
    fetchMessages(ch.id).then(() => {
      setMsgLoading(false);
      // Scroll to most recent message after load
      setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, 200);
      setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, 600);
    });
  };

  const sendTypingHeartbeat = () => {
    if (!activeChannel) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;
    fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/typing`, { method: 'POST', headers }).catch(() => {});
  };

  const handleDraftChange = (e) => {
    setDraft(e.target.value);
    // Auto-grow textarea up to ~5 lines
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    sendTypingHeartbeat();
  };

  const toggleReaction = async (messageId, emoji) => {
    try {
      await fetch(`${API_URL}/estate-chat/messages/${messageId}/react`, {
        method: 'POST', headers, body: JSON.stringify({ emoji }),
      });
      setReactingMsgId(null);
      if (activeChannel) await fetchMessages(activeChannel.id);
    } catch {} // eslint-disable-line no-empty
  };

  const togglePin = async (messageId) => {
    try {
      await fetch(`${API_URL}/estate-chat/messages/${messageId}/pin`, { method: 'POST', headers });
      setReactingMsgId(null);
      if (activeChannel) await fetchMessages(activeChannel.id);
    } catch {} // eslint-disable-line no-empty
  };

  const uploadFile = async (file) => {
    if (!activeChannel || !file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        await fetchMessages(activeChannel.id);
        await fetchChannels();
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.detail || 'Failed to send attachment');
      }
    } catch {
      toast.error('Failed to send attachment');
    } finally { setUploading(false); }
  };

  const uploadMultipleFiles = async (fileList) => {
    if (!activeChannel || !fileList.length) return;
    setUploading(true);
    try {
      const endpoint = fileList.length === 1 ? 'upload' : 'upload-multi';
      const fd = new FormData();
      if (fileList.length === 1) {
        fd.append('file', fileList[0].file);
      } else {
        fileList.forEach(({ file }) => fd.append('files', file));
      }
      const res = await fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        await fetchMessages(activeChannel.id);
        await fetchChannels();
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.detail || 'Failed to send attachments');
      }
    } catch {
      toast.error('Failed to send attachments');
    } finally { setUploading(false); }
  };

  const handleSearch = (value) => {
    setSearchQuery(value);
    clearTimeout(searchTimerRef.current);
    if (!value.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/estate-chat/search?q=${encodeURIComponent(value.trim())}`, { headers });
        if (res.ok) setSearchResults(await res.json());
      } catch {} finally { setSearching(false); } // eslint-disable-line no-empty
    }, 400);
  };

  const jumpToMessage = (msg) => {
    const ch = channels.find(c => c.id === msg.channel_id);
    if (ch) {
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      openChannel(ch);
    }
  };

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
        // Force-clear the DOM input value to prevent iOS keyboard buffer from restoring it
        if (inputRef.current) {
          inputRef.current.value = '';
          inputRef.current.style.height = 'auto';
        }
        await fetchMessages(activeChannel.id);
        await fetchChannels();
        // Scroll to the newly sent message
        setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, 250);
      }
    } catch {} finally { setSending(false); } // eslint-disable-line no-empty
  };

  const handleEditMessage = async () => {
    if (!editingMsg) return;
    const content = editingMsg.content.trim();
    if (!content) return;
    try {
      const res = await fetch(`${API_URL}/estate-chat/messages/${editingMsg.id}`, {
        method: 'PUT', headers, body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setEditingMsg(null);
        await fetchMessages(activeChannel.id);
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.detail || 'Failed to edit message');
      }
    } catch { toast.error('Failed to edit message'); } // eslint-disable-line no-empty
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      // Trigger pop animation
      setPoppingMsgId(messageId);
      setMsgActionId(null);
      // Wait for animation to play
      await new Promise(r => setTimeout(r, 350));
      const res = await fetch(`${API_URL}/estate-chat/messages/${messageId}`, {
        method: 'DELETE', headers,
      });
      if (res.ok) {
        // Optimistically remove from local state
        setMessages(prev => prev.filter(m => m.id !== messageId));
        setPoppingMsgId(null);
        fetchChannels(); // refresh channel previews in background
      } else {
        setPoppingMsgId(null);
        const errData = await res.json().catch(() => null);
        toast.error(errData?.detail || 'Failed to delete message');
      }
    } catch {
      setPoppingMsgId(null);
      toast.error('Failed to delete message');
    } // eslint-disable-line no-empty
  };

  const onMsgTouchStart = (e, msgId) => {
    msgLongPressTriggered.current = false;
    msgLongPressTimer.current = setTimeout(() => {
      msgLongPressTriggered.current = true;
      // Clear any native text selection that iOS may have started
      window.getSelection()?.removeAllRanges();
      setReactingMsgId(null);
      // Measure bubble position for fixed menu overlay
      const bubbleEl = document.querySelector(`[data-testid="msg-bubble-${msgId}"]`);
      if (bubbleEl) {
        const r = bubbleEl.getBoundingClientRect();
        const viewH = window.visualViewport?.height || window.innerHeight;
        const above = r.bottom > viewH * 0.5;
        setMsgActionPos({
          above,
          top: above ? null : r.bottom + 4,
          bottom: above ? (viewH - r.top + 4) : null,
          right: window.innerWidth - r.right,
          left: r.left,
          isMe: r.right > window.innerWidth / 2,
        });
      }
      setMsgActionId(msgId);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 500);
  };

  const onMsgTouchMove = (e) => {
    if (msgLongPressTimer.current) {
      clearTimeout(msgLongPressTimer.current);
      msgLongPressTimer.current = null;
    }
  };

  const onMsgTouchEnd = () => {
    clearTimeout(msgLongPressTimer.current);
    msgLongPressTimer.current = null;
  };

  const sendVoiceMessage = async (previewBlob) => {
    const blob = previewBlob || await voiceRecorder.stop();
    if (!blob || !activeChannel) return;
    if (voicePreview) { URL.revokeObjectURL(voicePreview.url); setVoicePreview(null); }
    setUploading(true);
    try {
      const ext = blob.type.includes('mp4') || blob.type.includes('m4a') || blob.type.includes('aac') ? 'm4a' : 'webm';
      const formData = new FormData();
      formData.append('file', blob, `voice-message.${ext}`);
      const res = await fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        await fetchMessages(activeChannel.id);
        await fetchChannels();
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Voice upload failed:', res.status, errData);
      }
    } catch (err) { console.error('Voice send error:', err); } finally { setUploading(false); } // eslint-disable-line no-empty
  };

  const stopAndPreview = async () => {
    const blob = await voiceRecorder.stop();
    if (blob) {
      const url = URL.createObjectURL(blob);
      setVoicePreview({ blob, url });
    }
  };

  const discardPreview = () => {
    if (voicePreview) { URL.revokeObjectURL(voicePreview.url); setVoicePreview(null); }
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
    } catch {} // eslint-disable-line no-empty
  };

  const deleteChannel = async (chId) => {
    try {
      // Use minimal headers for DELETE (no Content-Type avoids CORS preflight)
      const res = await fetch(`${API_URL}/estate-chat/channels/${chId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setChannels(prev => prev.filter(c => c.id !== chId));
        setActiveChannel(null);
        setShowChannelList(true);
        setDeleteConfirm(null);
        setSwipedChannel(null);
        toast.success('Conversation deleted');
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Delete channel API error:', res.status, err);
        toast.error(err.detail || `Cannot delete (${res.status})`);
        setDeleteConfirm(null);
        setSwipedChannel(null);
      }
    } catch (e) {
      console.error('Delete channel error:', e);
      toast.error('Connection error — try again');
      setDeleteConfirm(null);
      setSwipedChannel(null);
    }
  };

  const bulkDeleteChannels = async () => {
    if (selectedChannels.size === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch(`${API_URL}/estate-chat/channels/batch-delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ channel_ids: Array.from(selectedChannels) }),
      });
      if (res.ok) {
        const result = await res.json();
        setChannels(prev => prev.filter(c => !result.deleted.includes(c.id)));
        toast.success(`Deleted ${result.deleted.length} conversation${result.deleted.length !== 1 ? 's' : ''}`);
        if (result.failed.length > 0) {
          toast.error(`${result.failed.length} could not be deleted`);
        }
      } else {
        toast.error('Failed to delete conversations');
      }
    } catch {
      toast.error('Connection error — try again');
    } finally {
      setBulkDeleting(false);
      setBulkDeleteConfirm(false);
      setSelectMode(false);
      setSelectedChannels(new Set());
    }
  };

  const toggleChannelSelection = (chId) => {
    setSelectedChannels(prev => {
      const next = new Set(prev);
      if (next.has(chId)) next.delete(chId);
      else next.add(chId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedChannels.size === channels.length) {
      setSelectedChannels(new Set());
    } else {
      setSelectedChannels(new Set(channels.map(c => c.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedChannels(new Set());
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

  const handleBackOut = () => {
    if (activeChannel) {
      // Force blur any focused input first (closes iOS keyboard)
      if (document.activeElement) document.activeElement.blur();
      setActiveChannel(null);
      setShowChannelList(true);
      setInputFocused(false);
      setSwipedChannel(null);
      setShowHeaderMembers(false);
      // Style cleanup happens in the activeChannel ref sync effect
      // Refresh channel list to show latest messages/new chats
      fetchChannels();
    } else {
      navigate(-1);
    }
  };

  const handleTouchStart = (e, channelId) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    longPressTriggeredRef.current = false;
    // Start long-press timer (500ms) — only when NOT already in select mode
    if (!selectMode) {
      longPressTimerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true;
        setSelectMode(true);
        setSelectedChannels(new Set([channelId]));
        setSwipedChannel(null);
        // Haptic feedback if available
        if (navigator.vibrate) navigator.vibrate(30);
      }, 500);
    }
  };

  const handleTouchMove = (e) => {
    // Cancel long-press if finger moves too much
    if (longPressTimerRef.current) {
      const dx = Math.abs(e.touches[0].clientX - touchStartRef.current.x);
      const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y);
      if (dx > 10 || dy > 10) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleTouchEnd = (e, channelId) => {
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    // If long-press just triggered select mode, don't also process as swipe/tap
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll, ignore
    if (dx < -60) {
      setSwipedChannel(channelId);
    } else if (dx > 30) {
      setSwipedChannel(null);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100vh' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#d4af37' }} />
      </div>
    );
  }

  // ── New Chat Modal ──
  const newChatModal = (
    <NewChatModal
      showNewChat={showNewChat}
      setShowNewChat={setShowNewChat}
      newChatType={newChatType}
      setNewChatType={setNewChatType}
      newChatEstate={newChatEstate}
      setNewChatEstate={setNewChatEstate}
      groupName={groupName}
      setGroupName={setGroupName}
      contacts={contacts}
      selectedMembers={selectedMembers}
      setSelectedMembers={setSelectedMembers}
      toggleMember={toggleMember}
      isBenefactor={isBenefactor}
      createChannel={createChannel}
    />
  );

  // ── Channel List ──
  const channelPanel = (
    <div
      className={`${showChannelList || !activeChannel ? 'flex' : 'hidden'} lg:flex flex-col h-full`}
      style={{ width: '100%', maxWidth: '100%', borderRight: '1px solid var(--b)' }}
    >
      {/* ECT-own header */}
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--b)' }}>
        <div className="flex items-center gap-3">
          {selectMode ? (
            <button
              onClick={exitSelectMode}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              data-testid="ect-select-cancel"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <X className="w-4 h-4" style={{ color: 'var(--t4)' }} />
            </button>
          ) : (
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              data-testid="ect-back-nav"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <ArrowLeft className="w-4 h-4" style={{ color: 'var(--t4)' }} />
            </button>
          )}
          <h2 className="text-lg font-bold" style={{ color: 'var(--t)' }}>
            {selectMode ? `${selectedChannels.size} Selected` : 'Estate Comms'}
          </h2>
        </div>
        <div className="flex gap-2">
          {selectMode ? (
            <>
              <button
                onClick={toggleSelectAll}
                className="h-10 px-3 rounded-full flex items-center justify-center gap-1.5 transition-all"
                data-testid="ect-select-all-btn"
                style={{
                  background: selectedChannels.size === channels.length ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${selectedChannels.size === channels.length ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                <span className="text-xs font-semibold" style={{ color: selectedChannels.size === channels.length ? '#d4af37' : 'var(--t4)' }}>
                  {selectedChannels.size === channels.length ? 'Deselect All' : 'Select All'}
                </span>
              </button>
              <button
                onClick={() => { if (selectedChannels.size > 0) setBulkDeleteConfirm(true); }}
                disabled={selectedChannels.size === 0}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                data-testid="ect-bulk-delete-btn"
                style={{
                  background: selectedChannels.size > 0 ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${selectedChannels.size > 0 ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  cursor: selectedChannels.size > 0 ? 'pointer' : 'not-allowed',
                }}
              >
                <Trash2 className="w-5 h-5" style={{ color: selectedChannels.size > 0 ? '#dc2626' : 'var(--t5)' }} />
              </button>
            </>
          ) : (
            <>
              {channels.length > 0 && (
                <button
                  onClick={() => { setSelectMode(true); setSwipedChannel(null); }}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105"
                  data-testid="ect-select-mode-btn"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <CheckSquare2 className="w-5 h-5" style={{ color: 'var(--t4)' }} />
                </button>
              )}
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105"
                data-testid="ect-search-btn"
                style={{ background: showSearch ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.06)' }}
              >
                <Search className="w-5 h-5" style={{ color: showSearch ? '#d4af37' : 'var(--t4)' }} />
              </button>
              <button
                onClick={() => setShowNewChat(true)}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105"
                data-testid="ect-new-chat-btn"
                style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }}
              >
                <Plus className="w-5 h-5" style={{ color: '#080e1a' }} />
              </button>
            </>
          )}
        </div>
      </div>
      {showSearch && (
        <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search messages..."
            autoFocus
            className="w-full rounded-xl px-3 py-2.5 text-base"
            data-testid="ect-search-input"
            style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px', outline: 'none' }}
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2">
        <button onClick={() => setShowSecurityInfo(!showSecurityInfo)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl mb-2 transition-all"
          data-testid="ect-security-info-toggle"
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
            <button
              onClick={() => setShowSecurityIntro(true)}
              className="w-full py-2 mt-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
              data-testid="ect-show-full-security"
              style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}
            >Learn More</button>
          </div>
        )}
        {showSearch && searchQuery.trim() ? (
          <div>
            {searching && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4af37' }} /></div>}
            {!searching && searchResults.length === 0 && searchQuery.trim() && (
              <div className="text-center py-8">
                <Search className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--t5)' }} />
                <p className="text-sm" style={{ color: 'var(--t4)' }}>No messages found</p>
              </div>
            )}
            {searchResults.map(sr => (
              <button key={sr.id} onClick={() => jumpToMessage(sr)}
                className="w-full text-left p-3 rounded-xl mb-1 transition-all"
                data-testid={`search-result-${sr.id}`}
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  {getChannelIcon(sr.channel_type)}
                  <span className="text-[11px] font-semibold" style={{ color: '#d4af37' }}>{sr.channel_name || 'Chat'}</span>
                  <span className="text-[11px] ml-auto" style={{ color: 'var(--t5)' }}>
                    {new Date(sr.created_at).toLocaleDateString()}
                  </span>
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
              <div
                key={ch.id}
                className={`relative rounded-xl mb-1 ${showListMembersId === ch.id ? '' : 'overflow-hidden'}`}
                onTouchStart={(e) => !selectMode && handleTouchStart(e, ch.id)}
                onTouchMove={(e) => !selectMode && handleTouchMove(e)}
                onTouchEnd={(e) => !selectMode && handleTouchEnd(e, ch.id)}
              >
                {/* Delete action (behind the card) — hidden in select mode */}
                {!selectMode && (
                <div className="absolute inset-y-0 right-0 flex items-center" style={{
                  width: '72px',
                  background: '#dc2626',
                  justifyContent: 'center',
                  borderRadius: '12px',
                  opacity: swipedChannel === ch.id ? 1 : 0,
                  transition: 'opacity 0.15s ease',
                }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(ch); }}
                    data-testid={`ect-channel-delete-${ch.id}`}
                    className="w-full h-full flex items-center justify-center"
                  >
                    <Trash2 className="w-5 h-5" style={{ color: '#fff' }} />
                  </button>
                </div>
                )}
                {/* Channel card */}
                <button
                  onClick={() => {
                    if (selectMode) {
                      toggleChannelSelection(ch.id);
                    } else if (swipedChannel === ch.id) {
                      setSwipedChannel(null);
                    } else {
                      openChannel(ch);
                    }
                  }}
                  className="w-full flex items-center gap-3 p-3 transition-transform text-left relative"
                  data-testid={`ect-channel-${ch.id}`}
                  style={{
                    background: selectMode && selectedChannels.has(ch.id)
                      ? 'rgba(220,38,38,0.08)'
                      : activeChannel?.id === ch.id
                        ? 'rgba(212,175,55,0.1)'
                        : 'var(--bg, #0B1120)',
                    border: selectMode && selectedChannels.has(ch.id)
                      ? '1px solid rgba(220,38,38,0.25)'
                      : activeChannel?.id === ch.id
                        ? '1px solid rgba(212,175,55,0.2)'
                        : '1px solid transparent',
                    borderRadius: '12px',
                    transform: !selectMode && swipedChannel === ch.id ? 'translateX(-72px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                  }}
                >
                {/* Selection checkbox */}
                {selectMode && (
                  <div className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-all" style={{
                    background: selectedChannels.has(ch.id) ? '#dc2626' : 'rgba(255,255,255,0.06)',
                    border: `2px solid ${selectedChannels.has(ch.id) ? '#dc2626' : 'rgba(255,255,255,0.15)'}`,
                  }}>
                    {selectedChannels.has(ch.id) && <Check className="w-3.5 h-3.5" style={{ color: '#fff' }} />}
                  </div>
                )}
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-sm font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}>
                  {ch.type === 'direct' && ch.photo_url
                    ? <img src={ch.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = ch.name?.charAt(0)?.toUpperCase() || '?'; }} />
                    : ch.type === 'direct'
                      ? (ch.name?.charAt(0)?.toUpperCase() || '?')
                      : getChannelIcon(ch.type)}
                </div>
                <div className="flex-1 min-w-0 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--t)' }}>{ch.name}</span>
                    {ch.unread_count > 0 && (
                      <span className="ml-2 min-w-[20px] h-5 rounded-full flex items-center justify-center text-[11px] font-bold px-1.5" style={{ background: '#d4af37', color: '#080e1a' }}>
                        {ch.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="text-[11px] font-medium px-1.5 py-0.5 rounded cursor-pointer"
                      data-testid={`ect-list-members-link-${ch.id}`}
                      onClick={(e) => { e.stopPropagation(); setShowListMembersId(showListMembersId === ch.id ? null : ch.id); }}
                      style={{ background: 'rgba(212,175,55,0.08)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.15)' }}
                    >{ch.estate_name}</span>
                    {ch.last_message && (
                      <span className="text-xs truncate" style={{ color: 'var(--t5)' }}>{ch.last_message.content}</span>
                    )}
                  </div>
                  {showListMembersId === ch.id && (
                    <div
                      className="absolute left-0 top-full mt-1 rounded-xl overflow-hidden z-50"
                      data-testid={`ect-list-members-dropdown-${ch.id}`}
                      style={{
                        background: '#1A2238',
                        border: '1px solid rgba(212,175,55,0.25)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        minWidth: '220px',
                        maxWidth: '280px',
                        maxHeight: '300px',
                        overflowY: 'auto',
                      }}
                    >
                      <div className="px-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <span className="text-[11px] font-semibold" style={{ color: 'var(--t4)' }}>Members</span>
                      </div>
                      {resolveChannelMembers(ch.members || [], ch.estate_id).map(m => {
                        const initials = m.name ? m.name.split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() : '?';
                        const isYou = m.id === user?.id;
                        return (
                          <div key={m.id} className="flex items-center gap-2.5 px-3 py-2" data-testid={`list-member-${ch.id}-${m.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-[11px] font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>
                              {m.photo_url
                                ? <img src={m.photo_url} alt="" className="w-7 h-7 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = initials; }} />
                                : initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--t)' }}>
                                {m.name}{isYou ? ' (You)' : ''}
                              </div>
                              {(m.relation || m.role_in_estate) && (
                                <div className="text-[11px] truncate" style={{ color: 'var(--t4)' }}>{m.relation || m.role_in_estate}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {ch.type === 'group' && (() => {
                        const available = getNonChannelMembers(ch.members, ch.estate_id);
                        if (!available.length) return null;
                        return (
                          <>
                            <div className="px-3 py-1.5" style={{ borderTop: '1px solid rgba(212,175,55,0.15)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                              <span className="text-[11px] font-semibold" style={{ color: '#d4af37' }}>Add to Chat</span>
                            </div>
                            {available.map(m => {
                              const initials = m.name ? m.name.split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() : '?';
                              return (
                                <button
                                  key={m.id}
                                  onClick={(e) => { e.stopPropagation(); addMemberToChannel(ch.id, m.id, ch.estate_id); }}
                                  className="flex items-center gap-2.5 px-3 py-2 w-full text-left hover:bg-white/5 transition-colors"
                                  data-testid={`list-add-member-${ch.id}-${m.id}`}
                                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                                >
                                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-[11px] font-bold" style={{ background: 'rgba(76,175,80,0.15)', color: '#4CAF50' }}>
                                    {m.photo_url
                                      ? <img src={m.photo_url} alt="" className="w-7 h-7 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = initials; }} />
                                      : initials}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--t)' }}>{m.name}</div>
                                    {(m.relation || m.role_in_estate) && (
                                      <div className="text-[11px] truncate" style={{ color: 'var(--t4)' }}>{m.relation || m.role_in_estate}</div>
                                    )}
                                  </div>
                                  <UserPlus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#4CAF50' }} />
                                </button>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );

  // ── Message Area ──
  const messageArea = activeChannel && (
    <div className={`${!showChannelList || activeChannel ? 'flex' : 'hidden'} lg:flex flex-col flex-1`} style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleBackOut}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          data-testid="ect-back-btn"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <ArrowLeft className="w-4 h-4" style={{ color: 'var(--t4)' }} />
        </button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-sm font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}>
          {activeChannel.type === 'direct' && activeChannel.photo_url
            ? <img src={activeChannel.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = activeChannel.name?.charAt(0)?.toUpperCase() || '?'; }} />
            : activeChannel.type === 'direct'
              ? (activeChannel.name?.charAt(0)?.toUpperCase() || '?')
              : getChannelIcon(activeChannel.type)}
        </div>
        <div className="flex-1 min-w-0 relative">
          <div className="text-sm font-bold truncate" style={{ color: 'var(--t)' }}>{activeChannel.name}</div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowHeaderMembers(!showHeaderMembers); }}
            className="text-[11px] cursor-pointer"
            data-testid="ect-header-members-link"
            style={{ color: '#d4af37', background: 'none', border: 'none', padding: 0, font: 'inherit', textDecoration: 'none' }}
          >
            {activeChannel.type === 'circle' ? 'All estate members' : activeChannel.type === 'group' ? `${activeChannel.members?.length || 0} members` : 'Direct message'}
          </button>
          {showHeaderMembers && (
            <div
              className="absolute left-0 top-full mt-1 rounded-xl overflow-hidden z-50"
              data-testid="ect-header-members-dropdown"
              style={{
                background: '#1A2238',
                border: '1px solid rgba(212,175,55,0.25)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                minWidth: '220px',
                maxWidth: '280px',
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              <div className="px-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--t4)' }}>Members</span>
              </div>
              {resolveChannelMembers(activeChannel.members || [], activeChannel.estate_id).map(m => {
                const initials = m.name ? m.name.split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() : '?';
                const isYou = m.id === user?.id;
                return (
                  <div key={m.id} className="flex items-center gap-2.5 px-3 py-2" data-testid={`header-member-${m.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-xs font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>
                      {m.photo_url
                        ? <img src={m.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = initials; }} />
                        : initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: 'var(--t)' }}>
                        {m.name}{isYou ? ' (You)' : ''}
                      </div>
                      {(m.relation || m.role_in_estate) && (
                        <div className="text-[11px] truncate" style={{ color: 'var(--t4)' }}>{m.relation || m.role_in_estate}</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {activeChannel.type === 'group' && (() => {
                const available = getNonChannelMembers(activeChannel.members, activeChannel.estate_id);
                if (!available.length) return null;
                return (
                  <>
                    <div className="px-3 py-1.5" style={{ borderTop: '1px solid rgba(212,175,55,0.15)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="text-[11px] font-semibold" style={{ color: '#d4af37' }}>Add to Chat</span>
                    </div>
                    {available.map(m => {
                      const initials = m.name ? m.name.split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() : '?';
                      return (
                        <button
                          key={m.id}
                          onClick={(e) => { e.stopPropagation(); addMemberToChannel(activeChannel.id, m.id, activeChannel.estate_id); }}
                          className="flex items-center gap-2.5 px-3 py-2 w-full text-left hover:bg-white/5 transition-colors"
                          data-testid={`header-add-member-${m.id}`}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-xs font-bold" style={{ background: 'rgba(76,175,80,0.15)', color: '#4CAF50' }}>
                            {m.photo_url
                              ? <img src={m.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = initials; }} />
                              : initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate" style={{ color: 'var(--t)' }}>{m.name}</div>
                            {(m.relation || m.role_in_estate) && (
                              <div className="text-[11px] truncate" style={{ color: 'var(--t4)' }}>{m.relation || m.role_in_estate}</div>
                            )}
                          </div>
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
          <button
            onClick={() => setShowPinned(!showPinned)}
            className="h-8 px-2.5 rounded-full flex items-center gap-1.5"
            data-testid="ect-header-pinned-btn"
            style={{ background: showPinned ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)', border: showPinned ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent' }}
          >
            <Pin className="w-3.5 h-3.5" style={{ color: '#d4af37' }} />
            <span className="text-xs font-bold" style={{ color: '#d4af37' }}>{pinnedMsgs.length}</span>
          </button>
        )}
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
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }} />
        {/* Pinned messages panel — slides down from header */}
        {showPinned && pinnedMsgs.length > 0 && (
          <div className="mb-3 rounded-2xl overflow-hidden" style={{ background: 'rgba(30,40,60,0.95)', border: '1px solid rgba(212,175,55,0.25)', WebkitBackdropFilter: 'blur(20px)', backdropFilter: 'blur(20px)' }}>
            <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(212,175,55,0.15)' }}>
              <Pin className="w-4 h-4" style={{ color: '#d4af37' }} />
              <span className="text-xs font-bold flex-1" style={{ color: '#d4af37' }}>Pinned Messages</span>
              <button onClick={() => setShowPinned(false)} className="p-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <X className="w-3.5 h-3.5" style={{ color: 'var(--t4)' }} />
              </button>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {pinnedMsgs.map(pm => (
                <div key={pm.id} className="flex items-start gap-3 px-4 py-2.5"
                  data-testid={`pinned-msg-${pm.id}`}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
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
          <div className="text-center py-12">
            <MessageCircle className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--t5)' }} />
            <p className="text-sm" style={{ color: 'var(--t4)' }}>No messages yet. Say hello!</p>
          </div>
        )}
        {messages.map((msg, msgIdx) => {
          const isMe = msg.sender_id === user?.id;
          const isDM = activeChannel?.type === 'direct';
          const totalOthers = readStatus.length;

          // Receipt status for every outgoing message
          let receiptStatus = 'sent'; // default: single gray check
          if (isMe && totalOthers > 0) {
            let readByCount = 0;
            let deliveredToCount = 0;
            const deliveredTo = msg.delivered_to || [];
            for (const r of readStatus) {
              if (r.last_read_at && r.last_read_at >= msg.created_at) readByCount++;
              if (deliveredTo.includes(r.user_id)) deliveredToCount++;
            }
            if (readByCount > 0) {
              receiptStatus = readByCount >= totalOthers ? 'read_all' : 'read_partial';
            } else if (deliveredToCount > 0) {
              receiptStatus = deliveredToCount >= totalOthers ? 'delivered_all' : 'delivered_partial';
            }
            msg._readByCount = readByCount;
            msg._deliveredToCount = deliveredToCount;
          }

          // Date separator — show when day changes between messages
          const msgDate = new Date(msg.created_at);
          const prevMsg = msgIdx > 0 ? messages[msgIdx - 1] : null;
          const prevDate = prevMsg ? new Date(prevMsg.created_at) : null;
          const showDateSep = !prevDate || msgDate.toLocaleDateString() !== prevDate.toLocaleDateString();
          const isToday = msgDate.toLocaleDateString() === new Date().toLocaleDateString();
          const isYesterday = msgDate.toLocaleDateString() === new Date(Date.now() - 86400000).toLocaleDateString();
          const dateLabel = isToday ? 'Today' : isYesterday ? 'Yesterday' : msgDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

          // Reaction groups
          const reactionGroups = (msg.reactions || []).reduce((acc, r) => { acc[r.emoji] = (acc[r.emoji] || []); acc[r.emoji].push(r); return acc; }, {});
          const hasReactions = Object.keys(reactionGroups).length > 0;

          return (
            <React.Fragment key={msg.id}>
              {/* Date separator */}
              {showDateSep && (
                <div className="flex items-center justify-center py-2">
                  <span className="text-[11px] font-semibold px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}>{dateLabel}</span>
                </div>
              )}
              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                style={poppingMsgId === msg.id ? { animation: 'msgPop 0.35s ease-out forwards' } : undefined}
              >
                <div className="max-w-[80%]">
                  {!isMe && (
                    <div className="text-[11px] font-semibold mb-1 ml-1" style={{ color: '#d4af37' }}>{msg.sender_name}</div>
                  )}
                  {/* Inline edit mode */}
                  {editingMsg && editingMsg.id === msg.id ? (
                    <div className="flex flex-col gap-1.5 rounded-2xl px-3 py-2" style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)' }}>
                      <input
                        autoFocus
                        value={editingMsg.content}
                        onChange={(e) => setEditingMsg({ ...editingMsg, content: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleEditMessage(); } if (e.key === 'Escape') setEditingMsg(null); }}
                        className="w-full rounded-lg px-3 py-2 text-sm"
                        data-testid="edit-message-input"
                        style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px', outline: 'none' }}
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingMsg(null)} className="text-xs px-3 py-1 rounded-lg" style={{ color: 'var(--t4)', background: 'rgba(255,255,255,0.06)' }} data-testid="edit-cancel-btn">Cancel</button>
                        <button onClick={handleEditMessage} className="text-xs px-3 py-1 rounded-lg font-semibold" style={{ color: '#080e1a', background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }} data-testid="edit-save-btn">Save</button>
                      </div>
                    </div>
                  ) : (
                  <div className="relative">
                    {/* Emoji reactions — stacked upper-left (or upper-right for own messages) */}
                    {hasReactions && reactingMsgId !== msg.id && (
                      <button
                        className="absolute z-10 flex items-center"
                        style={{ top: '-10px', [isMe ? 'left' : 'left']: '-4px' }}
                        onClick={(e) => { e.stopPropagation(); setReactionDetailId(reactionDetailId === msg.id ? null : msg.id); }}
                        data-testid={`reaction-stack-${msg.id}`}
                      >
                        {Object.entries(reactionGroups).map(([emoji, reactors], i) => {
                          const cfg = REACTION_EMOJIS[emoji];
                          return (
                            <span key={emoji} className="text-base" style={{ marginLeft: i > 0 ? '-6px' : '0', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
                              {cfg?.display || emoji}
                            </span>
                          );
                        })}
                      </button>
                    )}
                    {/* Pin icon — upper-right corner */}
                    {msg.pinned && (
                      <div className="absolute z-10" style={{ top: '-8px', right: '-6px' }}>
                        <Pin className="w-3.5 h-3.5" style={{ color: '#d4af37', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
                      </div>
                    )}
                    {/* Message bubble */}
                    <div
                      className="px-4 py-2.5 rounded-2xl text-sm cursor-pointer"
                      data-testid={`msg-bubble-${msg.id}`}
                      onClick={() => { if (msgLongPressTriggered.current) return; setReactingMsgId(reactingMsgId === msg.id ? null : msg.id); setMsgActionId(null); }}
                      onTouchStart={(e) => onMsgTouchStart(e, msg.id)}
                      onTouchMove={onMsgTouchMove}
                      onTouchEnd={onMsgTouchEnd}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        const r = e.currentTarget.getBoundingClientRect();
                        const viewH = window.visualViewport?.height || window.innerHeight;
                        const above = r.bottom > viewH * 0.5;
                        setMsgActionPos({ above, top: above ? null : r.bottom + 4, bottom: above ? (viewH - r.top + 4) : null, right: window.innerWidth - r.right, left: r.left, isMe });
                        setMsgActionId(msg.id); setReactingMsgId(null);
                      }}
                      style={{
                        background: isMe ? 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(212,175,55,0.1))' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${isMe ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)'}`,
                        color: 'var(--t)',
                        borderTopRightRadius: isMe ? '6px' : '18px',
                        borderTopLeftRadius: isMe ? '18px' : '6px',
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                        marginTop: hasReactions ? '10px' : '0',
                      }}
                    >
                      {/* Quoted reply */}
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
                            if (isImage) return <AuthImage key={att.file_id} fileId={att.file_id} fileName={att.file_name} msgId={msg.id} onPreview={(s, n, fid) => setPreviewImage({ src: s, name: n, fileId: fid })} />;
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
                        if (isImage) return <AuthImage fileId={msg.attachment.file_id} fileName={msg.attachment.file_name} msgId={msg.id} onPreview={(s, n, fid) => setPreviewImage({ src: s, name: n, fileId: fid })} />;
                        return <AuthFileLink fileId={msg.attachment.file_id} fileName={msg.attachment.file_name} fileSize={msg.attachment.file_size} msgId={msg.id} />;
                      })() : (() => {
                        // Render message content with tappable links
                        const content = msg.content || '';
                        const urlRegex = /(https?:\/\/[^\s]+)/g;
                        const parts = content.split(urlRegex);
                        if (parts.length <= 1) return content;
                        return parts.map((part, pi) => urlRegex.test(part)
                          ? <a key={pi} href={part} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                              className="underline break-all" style={{ color: '#5BA3F5' }}>{part.includes('maps.google.com') ? <><MapPin className="w-3.5 h-3.5 inline mr-1" />Open in Maps</> : part}</a>
                          : <React.Fragment key={pi}>{part}</React.Fragment>
                        );
                      })()}
                    </div>
                  </div>
                  )}
                  {/* Reaction detail dropdown */}
                  {reactionDetailId === msg.id && hasReactions && (
                    <div className={`mt-1.5 rounded-xl overflow-hidden ${isMe ? 'ml-auto' : ''}`} style={{ background: 'rgba(30,40,60,0.95)', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '220px', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)' }}>
                      {(msg.reactions || []).map((r, ri) => {
                        const cfg = REACTION_EMOJIS[r.emoji];
                        return (
                          <div key={ri} className="flex items-center gap-2.5 px-3 py-2" style={{ borderBottom: ri < (msg.reactions || []).length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-[11px] font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>
                              {r.user_name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <span className="text-xs flex-1 truncate" style={{ color: 'var(--t)' }}>{r.user_name || 'Unknown'}</span>
                            <span className="text-base">{cfg?.display || r.emoji}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Reaction picker (tap on bubble) */}
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
                          <Pin className="w-4 h-4" style={{ color: msg.pinned ? '#d4af37' : 'var(--t4)' }} />
                        </button>
                      )}
                    </div>
                  )}
                  {/* Bottom: time + edited + read status */}
                  <div className={`text-[11px] mt-0.5 flex items-center gap-1.5 ${isMe ? 'justify-end mr-1' : 'ml-1'}`} style={{ color: 'var(--t5)' }}>
                    {msg.edited_at && <span className="italic" style={{ color: 'var(--t4)' }}>Edited</span>}
                    <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {isMe && (receiptStatus === 'read_all' || receiptStatus === 'read_partial') && (
                      <span className="flex items-center gap-0.5" data-testid="receipt-read">
                        <CheckCheck className="w-3.5 h-3.5" style={{ color: '#3B7BF7' }} />
                        {!isDM && receiptStatus === 'read_partial' && (
                          <span className="text-[11px]" style={{ color: '#3B7BF7' }}>{msg._readByCount}</span>
                        )}
                        {!isDM && receiptStatus === 'read_all' && totalOthers > 1 && (
                          <span className="text-[11px] font-semibold" style={{ color: '#3B7BF7' }}>All</span>
                        )}
                      </span>
                    )}
                    {isMe && (receiptStatus === 'delivered_all' || receiptStatus === 'delivered_partial') && (
                      <span className="flex items-center gap-0.5" data-testid="receipt-delivered">
                        <CheckCheck className="w-3.5 h-3.5" style={{ color: 'var(--t4)' }} />
                        {!isDM && receiptStatus === 'delivered_partial' && (
                          <span className="text-[11px]" style={{ color: 'var(--t4)' }}>{msg._deliveredToCount}</span>
                        )}
                      </span>
                    )}
                    {isMe && receiptStatus === 'sent' && (
                      <span data-testid="receipt-sent" style={{ color: 'var(--t5)' }}><Check className="w-3 h-3" /></span>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Fixed Action Menu Overlay — outside scroll flow ── */}
      {msgActionId && msgActionPos && (() => {
        const msg = messages.find(m => m.id === msgActionId);
        if (!msg) return null;
        const isMe = msg.sender_id === user?.id;
        const pos = msgActionPos;
        return (
          <>
            <div className="fixed inset-0 z-[60]" style={{ background: 'rgba(0,0,0,0.4)', WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)' }}
              onClick={() => setMsgActionId(null)} />
            <div className="fixed z-[61] flex flex-col items-center justify-center inset-0 px-4 pointer-events-none">
              <div className="pointer-events-auto max-h-[85vh] overflow-y-auto" style={{ maxWidth: '280px', width: '100%' }} data-testid={`msg-action-menu-${msg.id}`}>
              <div className="flex gap-1.5 mb-2 justify-center">
                {Object.entries(REACTION_EMOJIS).map(([key, val]) => {
                  const myReaction = (msg.reactions || []).some(r => r.emoji === key && r.user_id === user?.id);
                  return (
                    <button key={key} onClick={() => { toggleReaction(msg.id, key); setMsgActionId(null); }}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xl active:scale-90 transition-transform"
                      style={{ background: myReaction ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.1)' }}
                    >{val.display}</button>
                  );
                })}
              </div>
              <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(30,40,60,0.95)', border: '1px solid rgba(255,255,255,0.1)', minWidth: '180px', WebkitBackdropFilter: 'blur(20px)', backdropFilter: 'blur(20px)' }}>
                <button onClick={() => { setReplyTo({ id: msg.id, content: (msg.content || '').slice(0, 100), sender_name: msg.sender_name }); setMsgActionId(null); inputRef.current?.focus(); }}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/10" data-testid={`reply-msg-btn-${msg.id}`} style={{ color: '#E8ECF0' }}>
                  <ArrowLeft className="w-4 h-4" style={{ color: '#8E9AAF', transform: 'scaleX(-1)' }} /> Reply
                </button>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                <button onClick={() => { navigator.clipboard.writeText(msg.content || '').then(() => toast.success('Copied')).catch(() => {}); setMsgActionId(null); }}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/10" data-testid={`copy-msg-btn-${msg.id}`} style={{ color: '#E8ECF0' }}>
                  <Copy className="w-4 h-4" style={{ color: '#8E9AAF' }} /> Copy
                </button>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                <button onClick={() => { setMsgActionId(null); const bubble = document.querySelector(`[data-testid="msg-bubble-${msg.id}"]`); if (bubble) { bubble.style.webkitUserSelect = 'text'; bubble.style.userSelect = 'text'; const sel = window.getSelection(); const range = document.createRange(); range.selectNodeContents(bubble); sel.removeAllRanges(); sel.addRange(range); } }}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/10" data-testid={`select-all-msg-btn-${msg.id}`} style={{ color: '#E8ECF0' }}>
                  <TextSelect className="w-4 h-4" style={{ color: '#8E9AAF' }} /> Select
                </button>
                {isMe && !msg.attachment && !(msg.attachments && msg.attachments.length) && msg.message_type !== 'voice' && (
                  <><div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                  <button onClick={() => { setEditingMsg({ id: msg.id, content: msg.content || '' }); setMsgActionId(null); }}
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/10" data-testid={`edit-msg-btn-${msg.id}`} style={{ color: '#d4af37' }}>
                    <Pencil className="w-4 h-4" style={{ color: '#d4af37' }} /> Edit
                  </button></>
                )}
                {isBenefactor && (
                  <><div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                  <button onClick={() => { togglePin(msg.id); setMsgActionId(null); }}
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/10" data-testid={`pin-msg-btn-${msg.id}`} style={{ color: '#d4af37' }}>
                    <Pin className="w-4 h-4" style={{ color: '#d4af37' }} /> {msg.pinned ? 'Unpin' : 'Pin'}
                  </button></>
                )}
                {(isMe || isBenefactor) && (
                  <><div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                  <button onClick={() => { if (window.confirm('Delete this message?')) handleDeleteMessage(msg.id); setMsgActionId(null); }}
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/10" data-testid={`delete-msg-btn-${msg.id}`} style={{ color: '#ef4444' }}>
                    <Trash2 className="w-4 h-4" style={{ color: '#ef4444' }} /> Delete
                  </button></>
                )}
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                <button onClick={async () => {
                  const channelId = activeChannel.id;
                  setMsgActionId(null);
                  if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
                  toast('Getting your location...');
                  navigator.geolocation.getCurrentPosition(
                    async (p) => {
                      const mapUrl = `https://maps.google.com/?q=${p.coords.latitude},${p.coords.longitude}`;
                      try {
                        const res = await fetch(`${API_URL}/estate-chat/channels/${channelId}/messages`, { method: 'POST', headers, body: JSON.stringify({ content: mapUrl }) });
                        if (res.ok) { await fetchMessages(channelId); toast.success('Location sent'); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' }), 300); }
                      } catch { toast.error('Failed to send location'); }
                    },
                    () => toast.error('Location access denied'),
                    { enableHighAccuracy: true, timeout: 10000 }
                  );
                }}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/10" data-testid="send-location-btn" style={{ color: '#4CAF50' }}>
                  <MapPin className="w-4 h-4" style={{ color: '#4CAF50' }} /> Send My Location
                </button>
              </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Input Bar — transparent, floating over messages ── */}
      <div className="flex-shrink-0" style={{
        position: 'relative',
        zIndex: 10,
      }}
        onTouchStart={(e) => { e.currentTarget._touchY = e.touches[0].clientY; }}
        onTouchMove={(e) => {
          const dy = e.touches[0].clientY - (e.currentTarget._touchY || 0);
          if (dy > 30) { inputRef.current?.blur(); }
        }}
      >
        {/* Typing indicator */}
        {typers.length > 0 && (
          <div className="px-4 pt-2 pb-1 flex items-center gap-1.5" data-testid="typing-indicator">
            <div className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#d4af37', animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#d4af37', animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#d4af37', animationDelay: '300ms' }} />
            </div>
            <span className="text-xs" style={{ color: 'var(--t4)' }}>
              {typers.length === 1 ? `${typers[0].user_name} is typing...` : `${typers.map(t => t.user_name).join(', ')} are typing...`}
            </span>
          </div>
        )}
        {/* Reply-to preview banner */}
        {replyTo && (
          <div className="flex items-center gap-2 px-3 py-2 mx-3 mb-1 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)', borderLeft: '3px solid #d4af37' }}>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold" style={{ color: '#d4af37' }}>{replyTo.sender_name}</div>
              <div className="text-xs truncate" style={{ color: 'var(--t4)' }}>{replyTo.content}</div>
            </div>
            <button onClick={() => setReplyTo(null)} className="flex-shrink-0 p-1" data-testid="cancel-reply-btn">
              <X className="w-4 h-4" style={{ color: 'var(--t4)' }} />
            </button>
          </div>
        )}
        {/* Pending file attachment preview */}
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
                  <button
                    onClick={() => {
                      if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
                      setPendingFiles(prev => prev.filter((_, i) => i !== idx));
                    }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: '#ef4444' }}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center gap-1 flex-shrink-0 ml-1">
              <button
                onClick={() => { pendingFiles.forEach(pf => { if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl); }); setPendingFiles([]); }}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.15)' }}
                data-testid="ect-attach-cancel"
              >
                <X className="w-4 h-4 text-red-400" />
              </button>
              <button
                onClick={() => { uploadMultipleFiles(pendingFiles); pendingFiles.forEach(pf => { if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl); }); setPendingFiles([]); }}
                disabled={uploading}
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: '#d4af37' }}
                data-testid="ect-attach-send"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin text-[#0F1629]" /> : <Send className="w-5 h-5 text-[#0F1629]" />}
              </button>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-1">
          <input type="file" ref={fileInputRef} className="hidden" multiple
            accept="image/*,video/*,.pdf,.doc,.docx,.txt"
            onChange={(e) => {
              const selected = Array.from(e.target.files || []);
              if (!selected.length) return;
              const maxTotal = 5;
              const currentCount = pendingFiles.length;
              const allowed = selected.slice(0, maxTotal - currentCount);
              if (selected.length > allowed.length) {
                toast.error(`Maximum ${maxTotal} files. ${selected.length - allowed.length} file(s) skipped.`);
              }
              const videoSizeLimit = 25 * 1024 * 1024;
              const fileSizeLimit = 10 * 1024 * 1024;
              const validated = [];
              for (const file of allowed) {
                const isVideo = file.type.startsWith('video/');
                const limit = isVideo ? videoSizeLimit : fileSizeLimit;
                if (file.size > limit) {
                  const mb = Math.round(limit / (1024 * 1024));
                  toast.error(`${file.name} exceeds ${mb}MB limit`);
                  continue;
                }
                const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) :
                                   file.type.startsWith('video/') ? URL.createObjectURL(file) : null;
                validated.push({ file, previewUrl });
              }
              if (validated.length) setPendingFiles(prev => [...prev, ...validated]);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || voiceRecorder.recording}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0"
            data-testid="ect-attach-btn"
            style={{ background: '#222B42' }}
          >
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4af37' }} /> : <Paperclip className="w-5 h-5" style={{ color: '#C8D0E0' }} />}
          </button>

          {/* Input area with recording/preview overlay */}
          <div className="flex-1 relative" style={{ minWidth: 0 }}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={handleDraftChange}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                const imageFiles = [];
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.startsWith('image/')) {
                    const blob = items[i].getAsFile();
                    if (blob) imageFiles.push(blob);
                  }
                }
                if (!imageFiles.length) return;
                e.preventDefault();
                const maxTotal = 5;
                const currentCount = pendingFiles.length;
                const allowed = imageFiles.slice(0, maxTotal - currentCount);
                if (imageFiles.length > allowed.length) {
                  toast.error(`Maximum ${maxTotal} files. ${imageFiles.length - allowed.length} file(s) skipped.`);
                }
                const validated = allowed.map(file => ({
                  file,
                  previewUrl: URL.createObjectURL(file),
                }));
                if (validated.length) setPendingFiles(prev => [...prev, ...validated]);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 1024) { e.preventDefault(); sendMessage(); } }}
              onFocus={() => {
                setInputFocused(true);
                // Scroll to bottom when keyboard opens
                setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, 350);
                setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, 600);
                // Force visualViewport update for keyboard open
                const vv = window.visualViewport;
                if (vv) {
                  setTimeout(() => {
                    const root = document.getElementById('ect-root');
                    if (root) { root.style.height = (vv.height - 8) + 'px'; root.style.top = vv.offsetTop + 'px'; }
                  }, 350);
                }
              }}
              onBlur={() => setInputFocused(false)}
              enterKeyHint="return"
              rows={1}
              placeholder="Type a message..."
              className="w-full rounded-2xl px-4 py-2.5 text-base"
              data-testid="ect-message-input"
              style={{
                background: '#2C4A6B',
                border: 'none',
                outline: 'none',
                resize: 'none',
                overflowY: 'auto',
                maxHeight: '120px',
                color: (voiceRecorder.recording || voicePreview) ? 'transparent' : '#ffffff',
                fontSize: '16px',
                caretColor: (voiceRecorder.recording || voicePreview) ? 'transparent' : '#ffffff',
                lineHeight: '1.4',
              }}
            />
            {voiceRecorder.recording && (
              <div className="absolute inset-0 flex items-center gap-3 rounded-2xl px-4" style={{
                background: '#2A1519',
                border: '1px solid #5C2A2A',
              }}>
                <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--t)' }}>
                  {Math.floor(voiceRecorder.duration / 60)}:{(voiceRecorder.duration % 60).toString().padStart(2, '0')}
                </span>
                <span className="text-xs" style={{ color: 'var(--t4)' }}>Recording...</span>
                <button onMouseDown={(e) => e.preventDefault()} onClick={stopAndPreview} className="ml-auto p-2 rounded-full" style={{ background: '#1A1F2E' }} data-testid="ect-voice-stop">
                  <Square className="w-4 h-4" style={{ color: 'var(--t)' }} />
                </button>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => { voiceRecorder.cancel(); inputRef.current?.focus(); }} className="p-2 rounded-full" style={{ background: '#1A1F2E' }} data-testid="ect-voice-cancel">
                  <X className="w-4 h-4" style={{ color: '#ef4444' }} />
                </button>
              </div>
            )}
            {!voiceRecorder.recording && voicePreview && (
              <div className="absolute inset-0 flex items-center gap-2 rounded-2xl px-3" style={{
                background: '#1A2235',
                border: '1px solid #3A4560',
              }}>
                <audio src={voicePreview.url} controls className="h-8 flex-1" style={{ maxWidth: '100%', filter: 'invert(1) hue-rotate(180deg)', opacity: 0.8 }} />
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => { discardPreview(); inputRef.current?.focus(); }} className="p-2 rounded-full flex-shrink-0" style={{ background: '#1A1F2E' }} data-testid="ect-voice-discard">
                  <X className="w-4 h-4" style={{ color: '#ef4444' }} />
                </button>
              </div>
            )}
          </div>

          {/* Send / Voice toggle */}
          {draft.trim() ? (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={sendMessage}
              disabled={sending}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0"
              data-testid="ect-send-btn"
              style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }}
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#080e1a' }} /> : <Send className="w-5 h-5" style={{ color: '#080e1a' }} />}
            </button>
          ) : voiceRecorder.recording ? (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => sendVoiceMessage()}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0"
              data-testid="ect-voice-send"
              style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }}
            >
              <Send className="w-5 h-5" style={{ color: '#080e1a' }} />
            </button>
          ) : voicePreview ? (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => sendVoiceMessage(voicePreview.blob)}
              disabled={uploading}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0"
              data-testid="ect-voice-preview-send"
              style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }}
            >
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#080e1a' }} /> : <Send className="w-5 h-5" style={{ color: '#080e1a' }} />}
            </button>
          ) : (
            <button
              onClick={() => {
                if (inputRef.current) inputRef.current.blur();
                setInputFocused(false);
                voiceRecorder.start();
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0"
              data-testid="ect-voice-btn"
              style={{ background: '#222B42' }}
            >
              <Mic className="w-5 h-5" style={{ color: '#C8D0E0' }} />
            </button>
          )}
        </div>
        {/* Quick actions strip — emojis when idle, hidden when keyboard open */}
        {!inputFocused && (
          <div className="flex items-center gap-1 px-3 pt-1 pb-1" style={{ background: 'var(--bg2)', touchAction: 'none', paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0.25rem))' }}>
              {['👍', '❤️', '😂', '🙏', '🔥', '👏'].map(emoji => (
                <button
                  key={emoji}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setDraft(prev => prev + emoji)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-lg active:scale-90 transition-transform"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                  data-testid={`quick-emoji-${emoji}`}
                >{emoji}</button>
              ))}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setDraft(prev => prev.length > 0 ? [...prev].slice(0, -1).join('') : '')}
                className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{ background: 'rgba(255,255,255,0.06)' }}
                data-testid="quick-backspace-btn"
              >
                <X className="w-4 h-4" style={{ color: 'var(--t4)' }} />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="w-9 h-9 rounded-full flex items-center justify-center ml-auto active:scale-90 transition-transform"
                style={{ background: 'rgba(255,255,255,0.06)' }}
                data-testid="quick-photo-btn"
              >
                <Image className="w-4 h-4" style={{ color: '#d4af37' }} />
              </button>
          </div>
        )}
      </div>
      {/* Safe-area handled by emoji strip paddingBottom when keyboard closed */}
    </div>
  );

  return (
    <>
    <div id="ect-root" data-testid="estate-chat-page" className="flex flex-col" style={{
      background: 'var(--bg)',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 45,
      overflow: 'hidden',
    }}>
      {/* Pad for status bar on native */}
      <div style={{ height: 'env(safe-area-inset-top, 0px)', flexShrink: 0 }} />

      {/* Desktop: side-by-side layout */}
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
      {/* Mobile: toggle between list and messages */}
      <div className="flex flex-col lg:hidden flex-1 min-h-0">
        {showChannelList && !activeChannel ? channelPanel : messageArea}
      </div>
    </div>
    {newChatModal}
    {/* Delete Confirmation */}
    {deleteConfirm && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
        <div className="w-full max-w-xs rounded-2xl p-6 text-center" style={{ background: '#0F1629', border: '1px solid rgba(255,255,255,0.1)' }}>
          <Trash2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#dc2626' }} />
          <h3 className="text-base font-bold mb-1" style={{ color: 'var(--t)' }}>Delete Conversation</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--t4)' }}>
            Delete <strong style={{ color: 'var(--t)' }}>{deleteConfirm.name}</strong>? This removes all messages and cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { setDeleteConfirm(null); setSwipedChannel(null); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              data-testid="ect-delete-cancel"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}
            >Cancel</button>
            <button
              onClick={() => deleteChannel(deleteConfirm.id)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold"
              data-testid="ect-delete-confirm"
              style={{ background: '#dc2626', color: '#fff' }}
            >Delete</button>
          </div>
        </div>
      </div>
    )}
    {/* Bulk Delete Confirmation */}
    {bulkDeleteConfirm && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
        <div className="w-full max-w-xs rounded-2xl p-6 text-center" style={{ background: '#0F1629', border: '1px solid rgba(255,255,255,0.1)' }}>
          <Trash2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#dc2626' }} />
          <h3 className="text-base font-bold mb-1" style={{ color: 'var(--t)' }}>Delete {selectedChannels.size} Conversation{selectedChannels.size !== 1 ? 's' : ''}</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--t4)' }}>
            This will permanently delete {selectedChannels.size} conversation{selectedChannels.size !== 1 ? 's' : ''} and all their messages. This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setBulkDeleteConfirm(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              data-testid="ect-bulk-delete-cancel"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}
            >Cancel</button>
            <button
              onClick={bulkDeleteChannels}
              disabled={bulkDeleting}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              data-testid="ect-bulk-delete-confirm"
              style={{ background: '#dc2626', color: '#fff' }}
            >
              {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {bulkDeleting ? 'Deleting...' : `Delete ${selectedChannels.size}`}
            </button>
          </div>
        </div>
      </div>
    )}
    {/* Security Intro */}
    {showSecurityIntro && (
      <ECTSecurityIntro
        introStep={introStep}
        setIntroStep={setIntroStep}
        onDismiss={() => { setShowSecurityIntro(false); localStorage.setItem('ect_security_seen', '1'); setIntroStep(1); }}
        onBack={() => { setShowSecurityIntro(false); localStorage.setItem('ect_security_seen', '1'); setIntroStep(1); navigate(-1); }}
      />
    )}
    {/* Photo Preview */}
    <ImagePreviewModal previewImage={previewImage} onClose={() => setPreviewImage(null)} />
    </>
  );
}

