import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import { toast } from '../utils/toast';
import NewChatModal from '../components/chat/NewChatModal';
import {
  MessageCircle, User, Hash, Circle,
  Loader2, Check, CheckCheck,
  Pin, FileText, Image, Download,
  Play, Pause, UserPlus, Pencil, Copy,
  TextSelect, MapPin,
} from 'lucide-react';
import { platformDownload } from '../utils/downloadFile';
import useVoiceRecorder from '../components/estate-chat/useVoiceRecorder';
import useOverlayScrollbars from '../hooks/useOverlayScrollbars';
import { OverlayScrollbars } from 'overlayscrollbars';

/**
 * Resolve the actual scrollable element for a ref that may be attached to
 * an OverlayScrollbars host. The HOST element has overflow:hidden; setting
 * scrollTop on it is a no-op. The real scroller is the internal viewport.
 * When OverlayScrollbars isn't attached (or library is absent), fall back
 * to the host element so this helper works in both cases.
 */
const _scrollEl = (ref) => {
  const host = ref?.current;
  if (!host) return null;
  try {
    const inst = OverlayScrollbars(host);
    return inst?.elements?.()?.viewport || host;
  } catch {
    return host;
  }
};
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
import ECTChannelList from '../components/estate-chat/ECTChannelList';
import ECTMessageHeader from '../components/estate-chat/ECTMessageHeader';
import ECTMessageInput from '../components/estate-chat/ECTMessageInput';
import { getOfflineMode } from '../offline/featureFlag';
import {
  getLocalMessages,
  upsertLocalMessages,
  insertLocalMessage,
  generateTempMessageId,
  getLocalContacts,
  upsertLocalContacts,
} from '../offline/repos/chatRepo';
import { enqueue as enqueueOutbox } from '../offline/outbox';

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

  // `stickToBottomRef` drives the iMessage-style auto-follow behaviour:
  // - TRUE  → new messages / typing indicators pull us to the bottom.
  // - FALSE → restored-scroll state; polling must not snap us to the
  //           bottom even when we're visually close (which short chats
  //           always are — scrollHeight ≲ 2× clientHeight means distance
  //           from bottom is tiny for any scrollTop).
  // Updated by the channel-open effect on mount (jumpToBottom ⇒ true)
  // and by the user's own scroll events (see scroll listener).
  const stickToBottomRef = useRef(true);
  // Holds the ResizeObserver tied to the current channel's content so we
  // can tear it down in the effect cleanup.
  const resizeObsRef = useRef(null);

  // ── Chat auto-scroll-to-latest threshold (minutes) ──────────────────────
  // User-configurable in Settings → "Jump-to-latest in chat". When the
  // channel was last opened > threshold minutes ago, we scroll to the
  // most recent message; otherwise we restore the previous scrollTop.
  // Per-channel last-visit timestamp + scroll offset are persisted in
  // localStorage (see `_autoscrollKey` helpers in the channel-open effect).
  //
  // IMPORTANT: we hold the threshold in a REF (not a deps-tracked state)
  // so the async fetch on mount does NOT re-trigger the channel-open
  // effect — otherwise opening a channel races with the fetch, the effect
  // re-runs mid-paint, its cleanup stamps a fresh visit timestamp, and
  // the second run then switches to "restore scroll" mode, leaving the
  // user stranded where the scroll happened to be when threshold loaded.
  //
  // SEED THE REF SYNCHRONOUSLY from the localStorage mirror written by
  // ChatAutoscrollCard. Otherwise a freshly-loaded page falls back to the
  // 240-minute default and a chat reopened past the user's actual
  // threshold (e.g. 30 min) but under 240 fails to jump to bottom.
  const autoscrollThresholdMinRef = useRef((() => {
    try {
      const raw = parseInt(localStorage.getItem('carryon_chat_autoscroll_min') || '', 10);
      if (Number.isFinite(raw) && raw >= 1 && raw <= 1440) return raw;
    } catch { /* localStorage blocked */ }
    return 240;
  })());
  useEffect(() => {
    fetch(`${API_URL}/user-preferences/chat-autoscroll`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.threshold_minutes) {
          autoscrollThresholdMinRef.current = d.threshold_minutes;
          // Refresh the localStorage mirror so subsequent page loads /
          // tabs pick up the latest server value without another race.
          try { localStorage.setItem('carryon_chat_autoscroll_min', String(d.threshold_minutes)); } catch { /* quota */ }
        }
      })
      .catch(() => { /* keep cached / default */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Extracted hooks ───────────────────────────────────────────────────────
  const channelList = useECTChannelList({ token, navigate, user });
  const {
    channels, setChannels, activeChannel, setActiveChannel,
    showChannelList, setShowChannelList,
    swipedChannel, setSwipedChannel,
    deleteConfirm, setDeleteConfirm,
    selectMode, setSelectMode, selectedChannels, setSelectedChannels,
    bulkDeleting, bulkDeleteConfirm, setBulkDeleteConfirm, showHeaderMembers, setShowHeaderMembers,
    showListMembersId, setShowListMembersId, listMembersPosRef,
    fetchChannels, openChannel: _openChannel, handleBackOut: _handleBackOut,
    deleteChannel, bulkDeleteChannels,    toggleChannelSelection, toggleSelectAll, exitSelectMode,
    handleTouchStart, handleTouchMove, handleTouchEnd,
  } = channelList;

  // Attach iOS-like overlay scrollbar to the chat message list.
  // Re-attaches when the active channel changes, since the scroll container
  // only mounts once a channel is selected.
  useOverlayScrollbars(scrollContainerRef, [activeChannel?.id]);

  // Wrap openChannel to inject the refs it needs and manage msgLoading/typers
  const openChannel = (ch) => {
    // Blur any focused input to prevent stray cursor on iOS
    if (document.activeElement) document.activeElement.blur();
    setActiveChannel(ch);
    setShowChannelList(false);
    setTypers([]);
    setSwipedChannel(null);
    setShowListMembersId(null);
    setShowHeaderMembers(false);
    // NOTE: scroll positioning + message fetch + msgLoading state are
    // owned EXCLUSIVELY by the activeChannel-scoped useEffect below. We
    // used to duplicate a `fetchMessages().then(() => sc.scrollTop = ...)`
    // block here too, and its 3-second setInterval pinned to bottom —
    // stomping the restore logic on every re-entry and causing a
    // visible "2-second wiggle" from the pin repeating.
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
    onMsgMouseDown, onMsgMouseMove, onMsgMouseUp, onMsgMouseLeave,
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
    // Hard airplane-mode short-circuit — must precede every raw `fetch()`
    // call because (unlike axios) raw fetch is NOT intercepted by the
    // global offline guard in index.js. Without this, the SW would
    // happily serve a stale/empty `/estate-chat/contacts` response and
    // `setContacts(data)` would wipe the visible chat list. See Apr 24,
    // 2026 airplane-mode regression.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      try {
        const local = await getLocalContacts();
        if (local.length > 0) setContacts(local);
      } catch { /* non-fatal */ }
      return;
    }
    const mode = getOfflineMode();
    if (mode === 'on') {
      try {
        const local = await getLocalContacts();
        if (local.length > 0) setContacts(local);
      } catch { /* non-fatal */ }
    }
    try {
      const res = await fetch(`${API_URL}/estate-chat/contacts`, { headers });
      if (res.ok) {
        const data = await res.json();
        // Guard against the SW replaying an empty cached response as
        // "ok:200" while the device is actually transitioning offline.
        if (Array.isArray(data) && (data.length > 0 || contacts.length === 0)) {
          setContacts(data);
          upsertLocalContacts(data).catch(() => {});
        }
      }
    } catch {} // eslint-disable-line no-empty
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMessages = useCallback(async (channelId) => {
    // Hard airplane-mode short-circuit — see fetchContacts.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      try {
        const local = await getLocalMessages(channelId);
        if (local.length > 0) setMessages(local);
      } catch { /* non-fatal */ }
      return;
    }
    const mode = getOfflineMode();
    // Offline-first paint: seed the transcript from the local mirror
    // IMMEDIATELY so the user sees history without waiting on the network.
    if (mode === 'on') {
      try {
        const local = await getLocalMessages(channelId);
        if (local.length > 0) setMessages(local);
      } catch { /* non-fatal */ }
    }
    try {
      const [msgRes, readRes, pinRes] = await Promise.all([
        fetch(`${API_URL}/estate-chat/channels/${channelId}/messages`, { headers }),
        fetch(`${API_URL}/estate-chat/channels/${channelId}/read-status`, { headers }),
        fetch(`${API_URL}/estate-chat/channels/${channelId}/pinned`, { headers }),
      ]);
      if (msgRes.ok) {
        const data = await msgRes.json();
        // Never replace populated state with an empty list — that's the
        // SW-returns-empty-cache race on airplane-mode toggle.
        if (Array.isArray(data) && (data.length > 0 || messages.length === 0)) {
          // Idempotent setMessages: skip the state update entirely when
          // the polled response is content-identical to current state.
          // Without this, every 8s poll forced a full bubble re-render —
          // which (a) interrupted in-flight long-press gestures and
          // (b) caused subtle layout flicker. Compare ids + updated_at +
          // length so any real change still triggers an update.
          setMessages(prev => {
            if (prev.length !== data.length) return data;
            for (let i = 0; i < data.length; i++) {
              const a = prev[i], b = data[i];
              if (!a || a.id !== b.id || (a.updated_at || a.created_at) !== (b.updated_at || b.created_at)) {
                return data;
              }
            }
            return prev; // identical — bail to keep object identity stable
          });
          upsertLocalMessages(channelId, data).catch(() => {});
          // Prefetch ONLY the most recent 10 image/file attachments rather
          // than the entire scroll-back. A long conversation can contain
          // hundreds of attachments the user will never scroll to; the
          // IntersectionObserver in AuthImage will fetch the rest on demand.
          const recentFileIds = [];
          const recent = data.slice(-40); // last ~40 messages covers the first screenful on most devices
          recent.forEach(m => {
            if (m.attachment?.file_id) recentFileIds.push(m.attachment.file_id);
            if (m.attachments) m.attachments.forEach(a => { if (a.file_id) recentFileIds.push(a.file_id); });
          });
          if (recentFileIds.length) prefetchMedia(recentFileIds.slice(-10));
        }
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

  // Auto-refresh on reconnect + re-paint from local on disconnect so the
  // chat list + active transcript survive airplane-mode toggling instead
  // of going blank. Apr 24, 2026 regression fix.
  useEffect(() => {
    const refetch = () => {
      fetchChannels();
      fetchContacts();
      const ch = activeChannelRef.current;
      if (ch?.id) fetchMessages(ch.id);
    };
    window.addEventListener('online', refetch);
    window.addEventListener('offline', refetch);
    return () => {
      window.removeEventListener('online', refetch);
      window.removeEventListener('offline', refetch);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Visibility gate: keep the messages wrapper opacity 0 until we've
  // applied the correct scroll position once, then fade in. Eliminates
  // the visible "flash at top then jump to bottom" on channel open.
  const [ectMsgsVisible, setEctMsgsVisible] = useState(false);

  useEffect(() => {
    if (!activeChannel) return;
    if (inputRef.current) inputRef.current.blur();

    // Reset the visibility gate + loading state whenever we switch channels.
    setEctMsgsVisible(false);
    setMsgLoading(true);

    // Auto-scroll threshold gate — if it's been longer than the user-set
    // minutes since we last opened THIS channel, jump to the bottom.
    // Otherwise restore the previous scrollTop (iMessage-like).
    const chId = activeChannel.id;
    const visitKey = `carryon_chat_last_visited_${chId}`;
    const scrollKey = `carryon_chat_scroll_${chId}`;
    const lastVisitedMs = parseInt(localStorage.getItem(visitKey) || '0', 10);
    const savedScrollTop = parseInt(localStorage.getItem(scrollKey) || '0', 10);
    const ageMin = lastVisitedMs ? (Date.now() - lastVisitedMs) / 60000 : Infinity;
    // Within-threshold + visited-before = ALWAYS restore. Previously we
    // also treated savedScrollTop <= 0 as "no valid save" — but a user
    // who scrolled to the literal top of a short chat then left has a
    // legitimate savedScrollTop of 0, and that case was mis-classified
    // as "first visit" and got snapped back to the bottom on return.
    const jumpToBottom = !lastVisitedMs || ageMin > autoscrollThresholdMinRef.current;

    // On first-open / past-threshold we follow the bottom for new
    // messages. On restore we DO NOT — the user intentionally parked
    // themselves mid-thread and must stay there until they scroll.
    stickToBottomRef.current = jumpToBottom;

    // Eager save: every user-initiated scroll updates the stored scroll
    // position. Debounced to 250 ms so we don't hammer localStorage on
    // rapid wheel events. This makes the restore-on-reopen behaviour
    // robust even if the effect cleanup fires in a funky order.
    let saveTimer = null;
    const scheduleSave = () => {
      // Update stickToBottom intent on every scroll — within 60 px of the
      // bottom means the user is tracking the live thread; otherwise they
      // want to stay where they are. Pixel-threshold guards against
      // floating-point off-by-one on some browsers.
      try {
        const s = _scrollEl(scrollContainerRef);
        if (s) {
          const distFromBottom = s.scrollHeight - s.scrollTop - s.clientHeight;
          stickToBottomRef.current = distFromBottom < 60;
        }
      } catch { /* non-fatal */ }
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          const s = _scrollEl(scrollContainerRef);
          if (s) localStorage.setItem(scrollKey, String(Math.max(0, Math.round(s.scrollTop))));
        } catch { /* non-fatal */ }
      }, 250);
    };
    // Bind the scroll listener once the viewport exists (may be right
    // now or after fetchMessages paints). We re-bind in the fetchMessages
    // .then() callback below to guarantee it's attached.
    let scrollElForListener = null;
    const bindScrollListener = () => {
      const s = _scrollEl(scrollContainerRef);
      if (!s || scrollElForListener === s) return;
      scrollElForListener = s;
      s.addEventListener('scroll', scheduleSave, { passive: true });
    };

    fetchMessages(chId).then(() => {
      setMsgLoading(false);
      const sc = _scrollEl(scrollContainerRef);
      if (!sc) return;
      let target;
      if (jumpToBottom) {
        target = sc.scrollHeight;
        sc.scrollTop = target;
      } else {
        target = Math.min(savedScrollTop, Math.max(0, sc.scrollHeight - sc.clientHeight));
        sc.scrollTop = target;
      }
      // Bind scroll listener. Reveal the messages ONLY after the scroll
      // position has settled (scrollHeight stable for 2 consecutive frames
      // AND we're at the target) — otherwise the user sees a visible
      // "ratchet" as images load and the enforcement loop snaps to the
      // new bottom each frame.
      bindScrollListener();

      // Actively enforce the target scroll position for a short window to
      // defeat ANY stray `scrollTop = scrollHeight` writes that might fire
      // during message paint-in (images loading, content growing, other
      // components dispatching scroll). Release the enforcement as soon
      // as the user initiates their own scroll (wheel / touch / key).
      let userScrolling = false;
      const onUserIntent = () => { userScrolling = true; };
      sc.addEventListener('wheel', onUserIntent, { passive: true });
      sc.addEventListener('touchstart', onUserIntent, { passive: true });
      sc.addEventListener('keydown', onUserIntent, { passive: true });

      const enforceStart = Date.now();
      let prevH = -1;
      let stableFrames = 0;
      let revealed = false;
      const reveal = () => {
        if (revealed) return;
        revealed = true;
        setEctMsgsVisible(true);
      };
      const enforce = () => {
        const elapsed = Date.now() - enforceStart;
        if (userScrolling || elapsed > 1500) {
          sc.removeEventListener('wheel', onUserIntent);
          sc.removeEventListener('touchstart', onUserIntent);
          sc.removeEventListener('keydown', onUserIntent);
          reveal();
          return;
        }
        const s = _scrollEl(scrollContainerRef);
        if (!s) { reveal(); return; }
        if (jumpToBottom) {
          if (Math.abs(s.scrollTop - (s.scrollHeight - s.clientHeight)) > 2) {
            s.scrollTop = s.scrollHeight;
          }
          target = s.scrollHeight;
        } else {
          const newTarget = Math.min(savedScrollTop, Math.max(0, s.scrollHeight - s.clientHeight));
          if (Math.abs(s.scrollTop - newTarget) > 2) {
            s.scrollTop = newTarget;
          }
          target = newTarget;
        }
        // Count consecutive frames where scrollHeight hasn't changed —
        // after ~3 stable frames (≈50 ms) we can safely reveal because
        // the paint-in is done.
        if (s.scrollHeight === prevH) {
          stableFrames++;
        } else {
          stableFrames = 0;
          prevH = s.scrollHeight;
        }
        if (!revealed && stableFrames >= 3 && elapsed > 80) {
          reveal();
        }
        requestAnimationFrame(enforce);
      };
      requestAnimationFrame(enforce);

      // Long-lived safety net: a ResizeObserver on the content element
      // that re-snaps to bottom whenever it grows (image finishes
      // loading, late message paints in) BUT only when the user's intent
      // is "follow the bottom" (stickToBottomRef = true). This covers
      // growth that happens AFTER the 1.5 s enforcement window ends,
      // which otherwise left the newest message hidden below the input.
      let resizeObs = null;
      try {
        const inner = _scrollEl(scrollContainerRef)?.firstElementChild;
        if (inner && typeof ResizeObserver !== 'undefined') {
          resizeObs = new ResizeObserver(() => {
            if (!stickToBottomRef.current) return;
            const s = _scrollEl(scrollContainerRef);
            if (!s) return;
            const distFromBottom = s.scrollHeight - s.scrollTop - s.clientHeight;
            // Only snap if we're ACTUALLY near-ish the bottom — don't
            // override a user who has scrolled way up while stick was
            // still true (scheduleSave will flip it false next tick).
            if (distFromBottom < 200) s.scrollTop = s.scrollHeight;
          });
          resizeObs.observe(inner);
        }
      } catch { /* ResizeObserver unavailable — fall back to existing poll */ }
      // Register cleanup for the observer
      resizeObsRef.current = resizeObs;
    });
    let msgCount = 0;
    const poll = setInterval(() => {
      fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/typing`, { headers })
        .then(r => r.ok ? r.json() : [])
        .then(d => {
          // Avoid spurious re-renders when the typer list is unchanged —
          // typing polls run every 2s and normally return an empty array,
          // so a naive setTypers([]) would trigger a re-render every tick
          // (new array identity !== old), causing visible layout churn.
          setTypers(prev => {
            const next = d || [];
            if (prev.length === next.length && prev.every((p, i) => p?.user_id === next[i]?.user_id)) {
              return prev; // identity-stable — React bails on re-render
            }
            return next;
          });
        })
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

    // Cleanup: final save + unbind listener. Eager-save ran on every
    // scroll, so the stored scrollTop should already be current; this is
    // just a belt-and-suspenders write + always-fresh visit timestamp.
    return () => {
      clearInterval(poll);
      if (saveTimer) clearTimeout(saveTimer);
      try {
        if (resizeObsRef.current) {
          resizeObsRef.current.disconnect();
          resizeObsRef.current = null;
        }
        const sc = _scrollEl(scrollContainerRef);
        if (sc) {
          localStorage.setItem(scrollKey, String(Math.max(0, Math.round(sc.scrollTop))));
          if (scrollElForListener) scrollElForListener.removeEventListener('scroll', scheduleSave);
        }
        localStorage.setItem(visitKey, String(Date.now()));
      } catch { /* storage quota / private mode — non-fatal */ }
    };
  }, [activeChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist last-visit timestamp + scroll offset when the tab/window is
  // hidden or unloaded (user closes tab, switches app, backgrounds iOS,
  // etc.). The channel-open useEffect's cleanup only fires on channel
  // switch or page unmount — this covers the remaining escape hatches.
  useEffect(() => {
    const save = () => {
      const ch = activeChannelRef.current;
      if (!ch) return;
      try {
        const sc = _scrollEl(scrollContainerRef);
        if (sc) localStorage.setItem(`carryon_chat_scroll_${ch.id}`, String(Math.max(0, Math.round(sc.scrollTop))));
        localStorage.setItem(`carryon_chat_last_visited_${ch.id}`, String(Date.now()));
      } catch { /* non-fatal */ }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    if (contacts.length === 1 && !newChatEstate) setNewChatEstate(contacts[0].estate_id);
  }, [contacts, newChatEstate]);

  // ── Scroll helpers ────────────────────────────────────────────────────────
  // Always go through `_scrollEl(scrollContainerRef)` — the ref is attached
  // to an OverlayScrollbars HOST element. The host has overflow:hidden; the
  // real scroller is the internal viewport. Writing scrollTop on the host
  // is silently a no-op.
  const scrollToBottomIfNear = () => {
    // iMessage-style gate: only auto-follow the bottom when the user is
    // genuinely tracking the live thread (stickToBottomRef = true). If
    // they intentionally scrolled up or we restored a mid-thread position,
    // the 150 px "near" heuristic is NOT enough — a short chat (less than
    // two viewport heights) always appears "near" the bottom for any
    // scrollTop, which would fight the restore.
    if (!stickToBottomRef.current) return;
    const sc = _scrollEl(scrollContainerRef);
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
    const content = draft.trim();
    const replyToId = replyTo?.id || null;
    const mode = getOfflineMode();

    // Airplane-mode path (flag-agnostic): stamp the transcript with an
    // optimistic local message, enqueue the POST in the outbox, and
    // clear the composer so the user can keep typing. The outbox drains
    // when connectivity returns and swaps the temp id for the server's
    // canonical message.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      try {
        const tempId = generateTempMessageId();
        const optimistic = {
          id: tempId,
          channel_id: activeChannel.id,
          sender_id: user?.id || null,
          sender_name: user?.name || user?.first_name || 'You',
          content,
          reply_to: replyToId,
          created_at: new Date().toISOString(),
          _local_pending: true,
        };
        await insertLocalMessage(activeChannel.id, optimistic);
        setMessages(prev => [...prev, optimistic]);
        await enqueueOutbox({
          entity_type: 'chat_message',
          entity_id: tempId,
          method: 'POST',
          url: `/estate-chat/channels/${activeChannel.id}/messages`,
          body: { content, reply_to: replyToId },
        });
        setDraft('');
        setReplyTo(null);
        if (inputRef.current) {
          inputRef.current.value = '';
          inputRef.current.style.height = 'auto';
        }
        toast.success('Message queued — will send when you reconnect.');
        const doScroll = () => { const sc = _scrollEl(scrollContainerRef); if (sc) sc.scrollTop = sc.scrollHeight; };
        requestAnimationFrame(doScroll);
      } catch (err) {
        toast.error('Could not queue message offline.');
      } finally { setSending(false); }
      return;
    }

    try {
      const res = await fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/messages`, {
        method: 'POST', headers, body: JSON.stringify({ content, reply_to: replyToId }),
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
        const doScroll = () => { const sc = _scrollEl(scrollContainerRef); if (sc) sc.scrollTop = sc.scrollHeight; };
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
  const canPin = isBenefactor || user?.role === 'admin'; // admins can also pin

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
  // Pure presentational extract; all state/refs/handlers stay in this file
  // and are passed in explicitly. See ECTChannelList.js for the rendering.
  const channelPanel = (
    <ECTChannelList
      showChannelList={showChannelList}
      activeChannel={activeChannel}
      onBackToDashboard={() => navigate('/dashboard')}
      selectMode={selectMode}
      exitSelectMode={exitSelectMode}
      selectedChannels={selectedChannels}
      toggleSelectAll={toggleSelectAll}
      setBulkDeleteConfirm={setBulkDeleteConfirm}
      setSelectMode={setSelectMode}
      toggleChannelSelection={toggleChannelSelection}
      setShowNewChat={setShowNewChat}
      showSearch={showSearch}
      setShowSearch={setShowSearch}
      searchQuery={searchQuery}
      handleSearch={handleSearch}
      searching={searching}
      searchResults={searchResults}
      jumpToMessage={jumpToMessage}
      showSecurityInfo={showSecurityInfo}
      setShowSecurityInfo={setShowSecurityInfo}
      setShowSecurityIntro={setShowSecurityIntro}
      channels={channels}
      openChannel={openChannel}
      swipedChannel={swipedChannel}
      setSwipedChannel={setSwipedChannel}
      handleTouchStart={handleTouchStart}
      handleTouchMove={handleTouchMove}
      handleTouchEnd={handleTouchEnd}
      setDeleteConfirm={setDeleteConfirm}
      showListMembersId={showListMembersId}
      setShowListMembersId={setShowListMembersId}
      listMembersPosRef={listMembersPosRef}
      getChannelIcon={getChannelIcon}
    />
  );

  // ── Message Area ───────────────────────────────────────────────────────────
  const messageArea = activeChannel && (
    <div className={`${!showChannelList || activeChannel ? 'flex' : 'hidden'} lg:flex flex-col flex-1`} style={{ minHeight: 0 }}>
      <ECTMessageHeader
        activeChannel={activeChannel}
        user={user}
        handleBackOut={handleBackOut}
        getChannelIcon={getChannelIcon}
        showHeaderMembers={showHeaderMembers}
        setShowHeaderMembers={setShowHeaderMembers}
        resolveChannelMembers={resolveChannelMembers}
        getNonChannelMembers={getNonChannelMembers}
        addMemberToChannel={addMemberToChannel}
        pinnedMsgs={pinnedMsgs}
        showPinned={showPinned}
        setShowPinned={setShowPinned}
        scrollContainerRef={scrollContainerRef}
        isBenefactor={isBenefactor}
        deleteChannel={deleteChannel}
      />

      {/* Messages scroll container */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', opacity: ectMsgsVisible ? 1 : 0, transition: 'opacity 120ms ease-out' }}>
        <div className="px-4 pt-4 pb-1 space-y-3" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
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
                          onMouseDown={(e) => onMsgMouseDown(e, msg.id)} onMouseMove={onMsgMouseMove} onMouseUp={onMsgMouseUp} onMouseLeave={onMsgMouseLeave}
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
                                {canPin && (
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

      <ECTMessageInput
        typers={typers}
        replyTo={replyTo}
        setReplyTo={setReplyTo}
        pendingFiles={pendingFiles}
        setPendingFiles={setPendingFiles}
        uploadMultipleFiles={uploadMultipleFiles}
        uploading={uploading}
        fileInputRef={fileInputRef}
        inputRef={inputRef}
        voiceRecorder={voiceRecorder}
        voicePreview={voicePreview}
        stopAndPreview={stopAndPreview}
        discardPreview={discardPreview}
        sendVoiceMessage={sendVoiceMessage}
        draft={draft}
        setDraft={setDraft}
        handleDraftChange={handleDraftChange}
        inputFocused={inputFocused}
        setInputFocused={setInputFocused}
        sending={sending}
        sendMessage={sendMessage}
        scrollEl={_scrollEl}
        scrollContainerRef={scrollContainerRef}
        recentEmojis={recentEmojis}
        setRecentEmojis={setRecentEmojis}
        showDraftEmojiPicker={showDraftEmojiPicker}
        setShowDraftEmojiPicker={setShowDraftEmojiPicker}
      />
    </div>
  );

  // ── Root render ────────────────────────────────────────────────────────────
  return (
    <>
      <div id="ect-root" data-testid="estate-chat-page" className="flex flex-col lg:ect-desktop-inset"
        style={{ background: 'var(--bg)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 45, overflow: 'hidden' }}>
        {/* Spacer that matches the platform header height. MOBILE ONLY.
            On desktop (lg+), the `.lg:ect-desktop-inset` CSS rule already
            sets `top: var(--cy-offline-banner-h, 0px)` so there is no
            platform header to clear — rendering this spacer on desktop
            caused a large empty gap above the ECT column.

            Must use `--cy-header-safe-top` (NOT raw `env(safe-area-inset-top)`)
            so when the offline banner is showing — and absorbing the iOS
            status-bar inset itself — we don't double-count that inset and
            also don't under-count it. Mirrors the `.main-content`
            padding-top formula in index.css for pixel parity. 56px matches
            the inner `min-h-[3rem] py-1` of the platform mobile header. */}
        <div className="lg:hidden" style={{ height: 'calc(var(--cy-header-safe-top, env(safe-area-inset-top, 0px)) + 56px + var(--cy-offline-banner-h, 0px))', flexShrink: 0 }} />
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
        canPin={canPin}
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
