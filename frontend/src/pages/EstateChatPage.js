import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import { toast } from 'sonner';
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
} from 'lucide-react';
import { platformDownload } from '../utils/downloadFile';

const ECT_POLL_INTERVAL = 8000;

const REACTION_EMOJIS = {
  thumbs_up: { display: '\uD83D\uDC4D', label: 'Thumbs Up' },
  heart: { display: '\u2764\uFE0F', label: 'Heart' },
  laugh: { display: '\uD83D\uDE02', label: 'Laugh' },
  sad: { display: '\uD83D\uDE22', label: 'Sad' },
  fire: { display: '\uD83D\uDD25', label: 'Fire' },
  check: { display: '\u2705', label: 'Check' },
};

/* ── Voice Recorder Hook ── */
function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const options = mimeType ? { mimeType } : {};
      const mr = new MediaRecorder(stream, options);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(200);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch {
      // permission denied or unavailable
    }
  };

  const stop = () => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') { resolve(null); return; }
      clearInterval(timerRef.current);
      mr.onstop = () => {
        const mimeType = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        mr.stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        setDuration(0);
        resolve(blob);
      };
      mr.stop();
    });
  };

  const cancel = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      clearInterval(timerRef.current);
      mr.stream.getTracks().forEach(t => t.stop());
      mr.stop();
    }
    setRecording(false);
    setDuration(0);
    chunksRef.current = [];
  };

  return { recording, duration, start, stop, cancel };
}

/* ── Inline Audio Player ── */
function VoiceMessagePlayer({ fileId }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('carryon_token');
    fetch(`${API_URL}/estate-chat/files/${fileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(blob => setBlobUrl(URL.createObjectURL(blob)))
      .catch(() => {});
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); }
    else { audio.play().catch(() => {}); }
  };

  if (!blobUrl) return <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#d4af37' }} />;

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 min-w-[180px]" onClick={(e) => e.stopPropagation()} data-testid="voice-player">
      <audio
        ref={audioRef}
        src={blobUrl}
        onLoadedMetadata={() => setAudioDuration(audioRef.current?.duration || 0)}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (a && a.duration) setProgress((a.currentTime / a.duration) * 100);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <button
        onClick={togglePlay}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
        style={{ background: 'rgba(212,175,55,0.2)' }}
        data-testid="voice-play-btn"
      >
        {playing
          ? <Pause className="w-4 h-4" style={{ color: '#d4af37' }} />
          : <Play className="w-4 h-4 ml-0.5" style={{ color: '#d4af37' }} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: '#d4af37' }} />
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: '#7B879E' }}>
          {formatTime(audioRef.current?.currentTime || 0)} / {formatTime(audioDuration)}
        </div>
      </div>
    </div>
  );
}

/* ── Authenticated Image ── */
function AuthImage({ fileId, fileName, msgId }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    const token = localStorage.getItem('carryon_token');
    fetch(`${API_URL}/estate-chat/files/${fileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(blob => setSrc(URL.createObjectURL(blob)))
      .catch(() => {});
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!src) return <div className="w-full h-[160px] rounded-xl bg-white/5 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4af37' }} /></div>;

  return (
    <div>
      <img
        src={src}
        alt={fileName}
        className="rounded-xl max-w-full max-h-[240px] object-cover mb-1"
        style={{ cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); window.open(src, '_blank'); }}
        data-testid={`chat-image-${msgId}`}
      />
      <span className="text-xs" style={{ color: '#A0AABF' }}>{fileName}</span>
    </div>
  );
}

/* ── Authenticated File Link ── */
function AuthFileLink({ fileId, fileName, fileSize, msgId }) {
  const handleDownload = async (e) => {
    e.stopPropagation();
    try {
      await platformDownload({
        action: 'ect_file',
        params: { file_id: fileId },
        filename: fileName || 'file',
        onFallback: async () => {
          const token = localStorage.getItem('carryon_token');
          const res = await fetch(`${API_URL}/estate-chat/files/${fileId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(url);
        },
      });
    } catch { /* silent */ }
  };

  return (
    <div className="flex items-center gap-2 py-1 cursor-pointer" onClick={handleDownload} data-testid={`chat-file-${msgId}`}>
      <FileText className="w-5 h-5 flex-shrink-0" style={{ color: '#3B7BF7' }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: '#F1F3F8' }}>{fileName}</div>
        <div className="text-[11px]" style={{ color: '#7B879E' }}>{(fileSize / 1024).toFixed(0)} KB</div>
      </div>
      <Download className="w-4 h-4 flex-shrink-0" style={{ color: '#7B879E' }} />
    </div>
  );
}

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

  const voiceRecorder = useVoiceRecorder();
  const [voicePreview, setVoicePreview] = useState(null); // {blob, url}
  const [inputFocused, setInputFocused] = useState(false);
  const [swipedChannel, setSwipedChannel] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const touchStartRef = useRef({ x: 0, y: 0 });

  // ── Hide bottom nav when in ECT ──
  useEffect(() => {
    document.body.classList.add('ect-active');
    return () => document.body.classList.remove('ect-active');
  }, []);

  // ── iOS PWA: compensate for keyboard scroll ──
  useEffect(() => {
    if (loading) return;
    const root = document.getElementById('ect-root');
    if (!root) return;
    const vv = window.visualViewport;
    if (!vv) return;
    let kbOpen = false;
    const sync = () => {
      const open = vv.height < window.innerHeight * 0.8;
      if (open !== kbOpen) {
        kbOpen = open;
        if (kbOpen) {
          // Override to exact keyboard-visible height
          root.style.height = `${vv.height}px`;
        } else {
          // Reset — let CSS 100dvh handle it
          root.style.height = '';
          root.style.transform = '';
          window.scrollTo(0, 0);
        }
      } else if (kbOpen) {
        // Keyboard still open but height may have changed (e.g., predictive bar)
        root.style.height = `${vv.height}px`;
      }
      // Compensate for iOS page scroll while keyboard is open
      if (kbOpen && window.scrollY > 0) {
        root.style.transform = `translateY(${window.scrollY}px)`;
      }
    };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      root.style.height = '';
      root.style.transform = '';
    };
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-sync viewport when switching channels ──
  useEffect(() => {
    if (!activeChannel) return;
    const r = document.getElementById('ect-root');
    if (r) { r.style.transform = ''; r.style.height = ''; }
    window.scrollTo(0, 0);
    setInputFocused(false);
  }, [activeChannel]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setMessages(data);
        setTimeout(() => { const el = messagesEndRef.current?.parentElement; if (el) el.scrollTop = el.scrollHeight; }, 100);
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
    fetchMessages(ch.id).then(() => setMsgLoading(false));
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
      }
    } catch {} finally { setUploading(false); } // eslint-disable-line no-empty
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
        method: 'POST', headers, body: JSON.stringify({ content: draft.trim() }),
      });
      if (res.ok) {
        setDraft('');
        await fetchMessages(activeChannel.id);
        await fetchChannels();
      }
    } catch {} finally { setSending(false); } // eslint-disable-line no-empty
    inputRef.current?.focus();
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
      const res = await fetch(`${API_URL}/estate-chat/channels/${chId}`, { method: 'DELETE', headers });
      if (res.ok) {
        setChannels(prev => prev.filter(c => c.id !== chId));
        setActiveChannel(null);
        setShowChannelList(true);
        setDeleteConfirm(null);
        setSwipedChannel(null);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Cannot delete this conversation');
        setDeleteConfirm(null);
        setSwipedChannel(null);
      }
    } catch { toast.error('Failed to delete'); setDeleteConfirm(null); setSwipedChannel(null); } // eslint-disable-line no-empty
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

  const handleBackOut = () => {
    if (activeChannel) {
      setActiveChannel(null);
      setShowChannelList(true);
      setInputFocused(false);
      const r = document.getElementById('ect-root');
      if (r) { r.style.transform = ''; r.style.height = ''; }
      window.scrollTo(0, 0);
      // Refresh channel list to show latest messages/new chats
      fetchChannels();
    } else {
      navigate(-1);
    }
  };

  const handleTouchStart = (e, channelId) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e, channelId) => {
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
  const newChatModal = showNewChat && (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)', padding: '16px', paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="w-full max-w-md rounded-2xl flex flex-col" style={{ background: '#0F1629', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '80vh' }}>
        <div className="flex items-center justify-between p-6 pb-4 flex-shrink-0">
          <h3 className="text-lg font-bold" style={{ color: '#F1F3F8' }}>New Conversation</h3>
          <button onClick={() => { setShowNewChat(false); setSelectedMembers([]); setGroupName(''); }} data-testid="ect-new-chat-close">
            <X className="w-5 h-5" style={{ color: '#7B879E' }} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 min-h-0">
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
        {(newChatEstate || contacts.length === 1) && (
          <div className="mb-4">
            <label className="text-xs font-bold mb-2 block" style={{ color: '#A0AABF' }}>
              {newChatType === 'direct' ? 'Select a person' : 'Select members'}
            </label>
            {(contacts.find(c => c.estate_id === (newChatEstate || contacts[0]?.estate_id))?.members || []).map(m => {
              const isSelected = selectedMembers.includes(m.id);
              const initials = m.name ? m.name.split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() : '?';
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
                    background: isSelected ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isSelected ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden" style={{
                    background: isSelected ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(255,255,255,0.08)',
                    color: isSelected ? '#080e1a' : '#A0AABF',
                  }}>
                    {m.photo_url && m.photo_url.startsWith('http')
                      ? <img src={m.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                      : initials}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold truncate" style={{ color: '#F1F3F8' }}>{m.name}</span>
                      {m.is_ffn && (
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,166,35,0.15)', color: '#F5A623' }}>EXTERNAL</span>
                      )}
                    </div>
                    <div className="text-xs truncate" style={{ color: '#7B879E' }}>{m.relation || m.role_in_estate}</div>
                  </div>
                  {isSelected && <Check className="w-5 h-5 flex-shrink-0" style={{ color: '#d4af37' }} />}
                </button>
              );
            })}
          </div>
        )}
        </div>
        <div className="p-6 pt-4 flex-shrink-0">
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
    </div>
  );

  // ── Channel List ──
  const channelPanel = (
    <div
      className={`${showChannelList || !activeChannel ? 'flex' : 'hidden'} lg:flex flex-col h-full`}
      style={{ width: '100%', maxWidth: '100%', borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* ECT-own header */}
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            data-testid="ect-back-nav"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: '#A0AABF' }} />
          </button>
          <h2 className="text-lg font-bold" style={{ color: '#F1F3F8' }}>Estate Comms</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105"
            data-testid="ect-search-btn"
            style={{ background: showSearch ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.06)' }}
          >
            <Search className="w-5 h-5" style={{ color: showSearch ? '#d4af37' : '#7B879E' }} />
          </button>
          <button
            onClick={() => setShowNewChat(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105"
            data-testid="ect-new-chat-btn"
            style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }}
          >
            <Plus className="w-5 h-5" style={{ color: '#080e1a' }} />
          </button>
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
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F1F3F8', fontSize: '16px', outline: 'none' }}
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
                <div><span className="text-xs font-bold" style={{ color: '#F1F3F8' }}>{t}</span><span className="text-xs" style={{ color: '#7B879E' }}> — {d}</span></div>
              </div>
            ))}
          </div>
        )}
        {showSearch && searchQuery.trim() ? (
          <div>
            {searching && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4af37' }} /></div>}
            {!searching && searchResults.length === 0 && searchQuery.trim() && (
              <div className="text-center py-8">
                <Search className="w-8 h-8 mx-auto mb-2" style={{ color: '#525C72' }} />
                <p className="text-sm" style={{ color: '#7B879E' }}>No messages found</p>
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
                  <span className="text-[11px] ml-auto" style={{ color: '#525C72' }}>
                    {new Date(sr.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-xs font-semibold mb-0.5" style={{ color: '#A0AABF' }}>{sr.sender_name}</div>
                <p className="text-sm truncate" style={{ color: '#F1F3F8' }}>{sr.content}</p>
              </button>
            ))}
          </div>
        ) : (
          <>
            {channels.length === 0 && (
              <div className="text-center py-12 px-4">
                <MessageCircle className="w-12 h-12 mx-auto mb-3" style={{ color: '#525C72' }} />
                <p className="text-sm" style={{ color: '#7B879E' }}>No conversations yet</p>
                <p className="text-xs mt-1" style={{ color: '#525C72' }}>Tap + to start chatting</p>
              </div>
            )}
            {channels.map(ch => (
              <div
                key={ch.id}
                className="relative overflow-hidden rounded-xl mb-1"
                onTouchStart={(e) => handleTouchStart(e, ch.id)}
                onTouchEnd={(e) => handleTouchEnd(e, ch.id)}
              >
                {/* Delete action (behind the card) */}
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
                {/* Channel card */}
                <button
                  onClick={() => { if (swipedChannel === ch.id) { setSwipedChannel(null); } else { openChannel(ch); } }}
                  className="w-full flex items-center gap-3 p-3 transition-transform text-left relative"
                  data-testid={`ect-channel-${ch.id}`}
                  style={{
                    background: activeChannel?.id === ch.id ? 'rgba(212,175,55,0.1)' : 'var(--bg, #0B1120)',
                    border: activeChannel?.id === ch.id ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent',
                    borderRadius: '12px',
                    transform: swipedChannel === ch.id ? 'translateX(-72px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                  }}
                >
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-sm font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: '#A0AABF' }}>
                  {ch.type === 'direct' && ch.photo_url && ch.photo_url.startsWith('http')
                    ? <img src={ch.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                    : ch.type === 'direct'
                      ? (ch.name?.charAt(0)?.toUpperCase() || '?')
                      : getChannelIcon(ch.type)}
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
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );

  // ── Message Area ──
  const messageArea = activeChannel && (
    <div className={`${!showChannelList || activeChannel ? 'flex' : 'hidden'} lg:flex flex-col flex-1`} style={{ minHeight: 0, height: '100%' }}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleBackOut}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          data-testid="ect-back-btn"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <ArrowLeft className="w-4 h-4" style={{ color: '#A0AABF' }} />
        </button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-sm font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: '#A0AABF' }}>
          {activeChannel.type === 'direct' && activeChannel.photo_url && activeChannel.photo_url.startsWith('http')
            ? <img src={activeChannel.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
            : activeChannel.type === 'direct'
              ? (activeChannel.name?.charAt(0)?.toUpperCase() || '?')
              : getChannelIcon(activeChannel.type)}
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
        {msgLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#d4af37' }} /></div>}
        {!msgLoading && messages.length === 0 && (
          <div className="text-center py-12">
            <MessageCircle className="w-10 h-10 mx-auto mb-2" style={{ color: '#525C72' }} />
            <p className="text-sm" style={{ color: '#7B879E' }}>No messages yet. Say hello!</p>
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
            // Store counts for label
            msg._readByCount = readByCount;
            msg._deliveredToCount = deliveredToCount;
          }

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
                  {msg.attachment ? (
                    msg.message_type === 'voice' ? (
                      <VoiceMessagePlayer fileId={msg.attachment.file_id} />
                    ) : msg.message_type === 'image' ? (
                      <AuthImage fileId={msg.attachment.file_id} fileName={msg.attachment.file_name} msgId={msg.id} />
                    ) : (
                      <AuthFileLink fileId={msg.attachment.file_id} fileName={msg.attachment.file_name} fileSize={msg.attachment.file_size} msgId={msg.id} />
                    )
                  ) : msg.content}
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
                {/* Timestamp + Receipt indicators */}
                <div className={`text-[11px] mt-0.5 flex items-center gap-1.5 ${isMe ? 'justify-end mr-1' : 'ml-1'}`} style={{ color: '#525C72' }}>
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
                      <CheckCheck className="w-3.5 h-3.5" style={{ color: '#7B879E' }} />
                      {!isDM && receiptStatus === 'delivered_partial' && (
                        <span className="text-[11px]" style={{ color: '#7B879E' }}>{msg._deliveredToCount}</span>
                      )}
                    </span>
                  )}
                  {isMe && receiptStatus === 'sent' && (
                    <span data-testid="receipt-sent" style={{ color: '#525C72' }}><Check className="w-3 h-3" /></span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Bar — solid, elevated, sits above keyboard ── */}
      <div className="flex-shrink-0" style={{
        background: '#151D30',
        paddingBottom: '8px',
      }}>
        {/* Typing indicator */}
        {typers.length > 0 && (
          <div className="px-4 pt-2 pb-1 flex items-center gap-1.5" data-testid="typing-indicator">
            <div className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#d4af37', animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#d4af37', animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#d4af37', animationDelay: '300ms' }} />
            </div>
            <span className="text-xs" style={{ color: '#A0AABF' }}>
              {typers.length === 1 ? `${typers[0].user_name} is typing...` : `${typers.map(t => t.user_name).join(', ')} are typing...`}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-1">
          <input type="file" ref={fileInputRef} className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt"
            onChange={(e) => { if (e.target.files?.[0]) uploadFile(e.target.files[0]); e.target.value = ''; }}
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
            <input
              ref={inputRef}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              onFocus={() => {
                setInputFocused(true);
                window.scrollTo(0, 0);
              }}
              onBlur={() => setInputFocused(false)}
              placeholder="Type a message..."
              className="w-full rounded-2xl px-4 py-2.5 text-base"
              data-testid="ect-message-input"
              style={{
                background: '#1E2840',
                border: '2px solid #4A5575',
                color: (voiceRecorder.recording || voicePreview) ? 'transparent' : '#FFFFFF',
                fontSize: '16px',
                outline: 'none',
                caretColor: (voiceRecorder.recording || voicePreview) ? 'transparent' : undefined,
              }}
            />
            {voiceRecorder.recording && (
              <div className="absolute inset-0 flex items-center gap-3 rounded-2xl px-4" style={{
                background: '#2A1519',
                border: '1px solid #5C2A2A',
              }}>
                <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
                <span className="text-sm font-semibold" style={{ color: '#F1F3F8' }}>
                  {Math.floor(voiceRecorder.duration / 60)}:{(voiceRecorder.duration % 60).toString().padStart(2, '0')}
                </span>
                <span className="text-xs" style={{ color: '#A0AABF' }}>Recording...</span>
                <button onMouseDown={(e) => e.preventDefault()} onClick={stopAndPreview} className="ml-auto p-2 rounded-full" style={{ background: '#1A1F2E' }} data-testid="ect-voice-stop">
                  <Square className="w-4 h-4" style={{ color: '#F1F3F8', fill: '#F1F3F8' }} />
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
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
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
      </div>
      {/* Safe-area bottom fill — solid background when keyboard is closed */}
      {!inputFocused && <div style={{ background: '#151D30', height: 'env(safe-area-inset-bottom, 0px)', flexShrink: 0 }} />}
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
      height: '100dvh',
      zIndex: 45,
      overflow: 'hidden',
    }}>
      {/* Pad for status bar on native */}
      <div style={{ height: 'env(safe-area-inset-top, 0px)', flexShrink: 0 }} />

      {/* Desktop: side-by-side layout */}
      <div className="hidden lg:flex flex-1 min-h-0">
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
      <div className="flex lg:hidden flex-1 min-h-0">
        {showChannelList && !activeChannel ? channelPanel : messageArea}
      </div>
    </div>
    {newChatModal}
    {/* Delete Confirmation */}
    {deleteConfirm && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
        <div className="w-full max-w-xs rounded-2xl p-6 text-center" style={{ background: '#0F1629', border: '1px solid rgba(255,255,255,0.1)' }}>
          <Trash2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#dc2626' }} />
          <h3 className="text-base font-bold mb-1" style={{ color: '#F1F3F8' }}>Delete Conversation</h3>
          <p className="text-sm mb-5" style={{ color: '#7B879E' }}>
            Delete <strong style={{ color: '#F1F3F8' }}>{deleteConfirm.name}</strong>? This removes all messages and cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { setDeleteConfirm(null); setSwipedChannel(null); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
              data-testid="ect-delete-cancel"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#A0AABF' }}
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
    {/* Security Intro Glass Panel */}
    {showSecurityIntro && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', padding: '16px', paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="w-full max-w-md rounded-2xl p-6" data-testid="ect-security-intro" style={{ background: 'rgba(15,22,41,0.95)', border: '1px solid rgba(212,175,55,0.3)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
          <div className="text-center mb-5">
            <Shield className="w-12 h-12 mx-auto mb-3" style={{ color: '#d4af37' }} />
            <h2 className="text-xl font-bold" style={{ color: '#F1F3F8' }}>The Most Private Chat You'll Ever Use</h2>
            <p className="text-sm mt-2" style={{ color: '#A0AABF' }}>Estate Comms isn't like other messaging apps. Here's why.</p>
          </div>
          <div className="space-y-3 mb-6">
            {[
              { icon: Lock, title: 'Closed Network', desc: 'No strangers can ever find you. Only people explicitly connected to your estate can message you.' },
              { icon: Shield, title: 'No Phone Number Needed', desc: 'Your phone number is never exposed. No contact list scanning. No profile discovery by outsiders.' },
              { icon: Users, title: 'Owner-Controlled Access', desc: 'The estate benefactor controls who is in and who is out. No one can add themselves.' },
              { icon: X, title: 'Zero Data Mining', desc: 'No ads. No tracking. No metadata sold to third parties. Your conversations exist for your family.' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <item.icon className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#d4af37' }} />
                <div>
                  <div className="text-sm font-bold" style={{ color: '#F1F3F8' }}>{item.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#7B879E' }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-center mb-4" style={{ color: '#525C72' }}>
            The most private messaging system isn't the one with the strongest lock — it's the one where strangers can never find the door.
          </p>
          <button
            onClick={() => { setShowSecurityIntro(false); localStorage.setItem('ect_security_seen', '1'); }}
            className="w-full py-3 rounded-xl text-base font-bold transition-all active:scale-[0.97]"
            data-testid="ect-security-dismiss"
            style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}
          >I Understand — Start Chatting</button>
        </div>
      </div>
    )}
    </>
  );
}
