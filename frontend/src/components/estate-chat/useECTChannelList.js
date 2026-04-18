/**
 * useECTChannelList — manages the channel list, selection mode, swipe-to-delete,
 * bulk operations, navigation, and all channel-level API calls.
 *
 * ALL logic here is moved from EstateChatPage.js with zero behavioural changes.
 * Do not add any DOM refs or keyboard interactions here.
 */
import { useState, useCallback, useRef } from 'react';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

export default function useECTChannelList({ token, navigate, user }) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ── Core channel state ────────────────────────────────────────────────────
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [showChannelList, setShowChannelList] = useState(true);

  // ── Delete / selection state ──────────────────────────────────────────────
  const [swipedChannel, setSwipedChannel] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // ── Member dropdown state ─────────────────────────────────────────────────
  const [showHeaderMembers, setShowHeaderMembers] = useState(false);
  const [showListMembersId, setShowListMembersId] = useState(null);
  const listMembersPosRef = useRef({ top: 200, left: 24 });

  // ── Touch refs for swipe + long-press ────────────────────────────────────
  const touchStartRef = useRef({ x: 0, y: 0 });
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  // ── API calls ─────────────────────────────────────────────────────────────
  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/estate-chat/channels`, { headers });
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
      } else {
        console.error('fetchChannels failed:', res.status);
      }
    } catch (err) { console.error('fetchChannels error:', err); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openChannel = (ch, { fetchMessages, scrollContainerRef, inputRef }) => {
    // Blur any focused input to prevent stray cursor on iOS
    if (document.activeElement) document.activeElement.blur();
    setActiveChannel(ch);
    setShowChannelList(false);
    setSwipedChannel(null);
    setShowListMembersId(null);
    setShowHeaderMembers(false);
    fetchMessages(ch.id).then(() => {
      // Keep scroll pinned to bottom as images/content load (up to 3s)
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

  const handleBackOut = ({ fetchMessages, scrollContainerRef, inputRef }) => {
    if (activeChannel) {
      if (document.activeElement) document.activeElement.blur();
      setActiveChannel(null);
      setShowChannelList(true);
      setSwipedChannel(null);
      setShowHeaderMembers(false);
      fetchChannels();
    } else {
      navigate(-1);
    }
  };

  const deleteChannel = async (chId) => {
    try {
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
        if (result.failed.length > 0) toast.error(`${result.failed.length} could not be deleted`);
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

  // ── Selection helpers ─────────────────────────────────────────────────────
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

  // ── Swipe + long-press touch handlers ────────────────────────────────────
  const handleTouchStart = (e, channelId) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    longPressTriggeredRef.current = false;
    if (!selectMode) {
      longPressTimerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true;
        setSelectMode(true);
        setSelectedChannels(new Set([channelId]));
        setSwipedChannel(null);
        if (navigator.vibrate) navigator.vibrate(30);
      }, 500);
    }
  };

  const handleTouchMove = (e) => {
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
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx < -60) {
      setSwipedChannel(channelId);
    } else if (dx > 30) {
      setSwipedChannel(null);
    }
  };

  return {
    // State
    channels, setChannels,
    activeChannel, setActiveChannel,
    showChannelList, setShowChannelList,
    swipedChannel, setSwipedChannel,
    deleteConfirm, setDeleteConfirm,
    selectMode, setSelectMode,
    selectedChannels, setSelectedChannels,
    bulkDeleting,
    bulkDeleteConfirm, setBulkDeleteConfirm,
    showHeaderMembers, setShowHeaderMembers,
    showListMembersId, setShowListMembersId,
    listMembersPosRef,
    // Handlers
    fetchChannels,
    openChannel,
    handleBackOut,
    deleteChannel,
    bulkDeleteChannels,
    toggleChannelSelection,
    toggleSelectAll,
    exitSelectMode,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
