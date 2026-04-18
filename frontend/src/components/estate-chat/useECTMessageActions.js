/**
 * useECTMessageActions — manages message interactions:
 * long-press action menu, reactions, pins, edit, delete, reply-to,
 * reaction detail dropdown.
 *
 * All logic moved verbatim from EstateChatPage.js.
 * CRITICAL: does not touch inputRef, scrollContainerRef, or any keyboard state.
 */
import { useState, useRef } from 'react';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';
import { addRecentEmoji } from './EmojiLibrary';

export default function useECTMessageActions({
  token, user, messages, activeChannel,
  fetchMessages, fetchChannels,
  scrollContainerRef, inputRef,
  previewGuardRef,
}) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ── Action menu ───────────────────────────────────────────────────────────
  const [msgActionId, setMsgActionId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [menuReady, setMenuReady] = useState(false);
  const menuOpenedAtRef = useRef(0);

  // ── Reactions + picking ───────────────────────────────────────────────────
  const [reactingMsgId, setReactingMsgId] = useState(null);
  const [reactionDetailId, setReactionDetailId] = useState(null);
  const [showActionEmojiPicker, setShowActionEmojiPicker] = useState(false);
  const [showInlineEmojiPicker, setShowInlineEmojiPicker] = useState(null);

  // ── Reply + edit + delete animation ──────────────────────────────────────
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [poppingMsgId, setPoppingMsgId] = useState(null);

  // ── Read status + pinned ──────────────────────────────────────────────────
  const [readStatus, setReadStatus] = useState([]);
  const [pinnedMsgs, setPinnedMsgs] = useState([]);
  const [showPinned, setShowPinned] = useState(false);
  const [typers, setTypers] = useState([]);

  // ── Long-press touch refs ─────────────────────────────────────────────────
  const msgLongPressTimer = useRef(null);
  const msgLongPressTriggered = useRef(false);
  const touchStartRef = useRef({ x: 0, y: 0 });

  // ── Action menu open/close ────────────────────────────────────────────────
  const openMsgAction = (msgId) => {
    if (previewGuardRef.current) return;
    if (document.activeElement) document.activeElement.blur();
    setReactingMsgId(null);
    menuOpenedAtRef.current = Date.now();
    setMenuReady(false);
    setTimeout(() => setMenuReady(true), 500);
    setTimeout(() => {
      const container = scrollContainerRef.current;
      const bubbleEl = container
        ? container.querySelector(`[data-testid="msg-bubble-${msgId}"]`)
        : document.querySelector(`[data-testid="msg-bubble-${msgId}"]`);
      if (bubbleEl) {
        const rect = bubbleEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const viewH = window.visualViewport?.height || window.innerHeight;
          const msgObj = messages.find(m => m.id === msgId);
          const isOwn = msgObj?.sender_id === user?.id;
          const showAbove = rect.top > viewH * 0.45;
          setMenuPosition({
            top: rect.top, bottom: rect.bottom,
            left: rect.left, right: rect.right,
            isOwn, showAbove,
          });
        }
      }
      setMsgActionId(msgId);
    }, 100);
  };

  const closeMsgAction = () => {
    setMsgActionId(null);
    setMenuPosition(null);
    setShowActionEmojiPicker(false);
    setMenuReady(false);
  };

  // ── Reactions ─────────────────────────────────────────────────────────────
  const toggleReaction = async (messageId, emoji) => {
    try {
      const res = await fetch(`${API_URL}/estate-chat/messages/${messageId}/react`, {
        method: 'POST', headers, body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.action === 'added') {
          // Caller must handle updating recentEmojis
          return { added: true, emoji };
        }
      }
      setReactingMsgId(null);
      setShowInlineEmojiPicker(null);
      if (activeChannel) await fetchMessages(activeChannel.id);
    } catch {} // eslint-disable-line no-empty
    return { added: false };
  };

  // ── Pin ───────────────────────────────────────────────────────────────────
  const togglePin = async (messageId) => {
    try {
      console.log('[ECT pin] calling pin for', messageId, 'channel:', activeChannel?.id);
      const res = await fetch(`${API_URL}/estate-chat/messages/${messageId}/pin`, { method: 'POST', headers });
      console.log('[ECT pin] response status:', res.status);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('[ECT pin] FAILED:', errData);
        toast.error(errData.detail || `Pin failed (${res.status})`);
        return;
      }
      const data = await res.json();
      console.log('[ECT pin] SUCCESS:', data);
      toast.success(data.pinned ? 'Message pinned ✓' : 'Message unpinned ✓');
      setReactingMsgId(null);
      if (activeChannel) {
        console.log('[ECT pin] refreshing messages for channel', activeChannel.id);
        await fetchMessages(activeChannel.id);
        console.log('[ECT pin] messages refreshed');
      } else {
        console.warn('[ECT pin] activeChannel is null — cannot refresh');
      }
    } catch (err) {
      console.error('[ECT pin] exception:', err);
      toast.error('Could not pin message — check connection');
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
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
    } catch { toast.error('Failed to edit message'); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDeleteMessage = async (messageId) => {
    try {
      setPoppingMsgId(messageId);
      closeMsgAction();
      await new Promise(r => setTimeout(r, 350));
      const res = await fetch(`${API_URL}/estate-chat/messages/${messageId}`, {
        method: 'DELETE', headers,
      });
      if (res.ok) {
        // Optimistic remove — caller's setMessages handles the update
        setPoppingMsgId(null);
        fetchChannels();
        return { deleted: messageId };
      } else {
        setPoppingMsgId(null);
        const errData = await res.json().catch(() => null);
        toast.error(errData?.detail || 'Failed to delete message');
      }
    } catch {
      setPoppingMsgId(null);
      toast.error('Failed to delete message');
    }
    return null;
  };

  // ── Touch handlers for long-press on messages ─────────────────────────────
  const onMsgTouchStart = (e, msgId) => {
    if (e.target.closest('a')) return;
    if (previewGuardRef.current) return;
    msgLongPressTriggered.current = false;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    msgLongPressTimer.current = setTimeout(() => {
      msgLongPressTriggered.current = true;
      window.getSelection()?.removeAllRanges();
      setReactingMsgId(null);
      openMsgAction(msgId);
    }, 500);
  };

  const onMsgTouchMove = (e) => {
    if (!msgLongPressTimer.current) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartRef.current.x);
    const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(msgLongPressTimer.current);
      msgLongPressTimer.current = null;
    }
  };

  const onMsgTouchEnd = (e, msgId) => {
    if (e.target.closest('a')) return;
    if (previewGuardRef.current) return;
    clearTimeout(msgLongPressTimer.current);
    msgLongPressTimer.current = null;
    if (msgLongPressTriggered.current) {
      e.preventDefault();
      return;
    } else {
      e.preventDefault();
      if (msgActionId) {
        closeMsgAction();
      } else {
        setReactingMsgId(reactingMsgId === msgId ? null : msgId);
      }
    }
  };

  return {
    // State
    msgActionId, setMsgActionId,
    menuPosition, setMenuPosition,
    menuReady, setMenuReady,
    menuOpenedAtRef,
    reactingMsgId, setReactingMsgId,
    reactionDetailId, setReactionDetailId,
    showActionEmojiPicker, setShowActionEmojiPicker,
    showInlineEmojiPicker, setShowInlineEmojiPicker,
    replyTo, setReplyTo,
    editingMsg, setEditingMsg,
    poppingMsgId, setPoppingMsgId,
    readStatus, setReadStatus,
    pinnedMsgs, setPinnedMsgs,
    showPinned, setShowPinned,
    typers, setTypers,
    msgLongPressTriggered,
    // Handlers
    openMsgAction,
    closeMsgAction,
    toggleReaction,
    togglePin,
    handleEditMessage,
    handleDeleteMessage,
    onMsgTouchStart,
    onMsgTouchMove,
    onMsgTouchEnd,
  };
}
