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
      // The ECT page renders `messageArea` JSX twice — once inside a
      // `hidden lg:flex` desktop wrapper and once inside an `lg:hidden`
      // mobile wrapper — and both copies bind the SAME `scrollContainerRef`.
      // React commits the ref to whichever copy renders last (the mobile
      // one), so on desktop `scrollContainerRef.current` is a `display:
      // none` scroller whose bubbles all measure 0×0. Querying within it
      // would silently skip `setMenuPosition` and the menu would never
      // appear. Scan the whole document and pick the first bubble that
      // is actually painted (non-zero rect).
      const all = Array.from(
        document.querySelectorAll(`[data-testid="msg-bubble-${msgId}"]`)
      );
      let bubbleEl = null;
      let rect = null;
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          bubbleEl = el;
          rect = r;
          break;
        }
      }
      if (bubbleEl && rect) {
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
      const res = await fetch(`${API_URL}/estate-chat/messages/${messageId}/pin`, { method: 'POST', headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.detail || `Pin failed (${res.status})`);
        return;
      }
      const data = await res.json();
      toast.success(data.pinned ? 'Message pinned ✓' : 'Message unpinned');
      setReactingMsgId(null);
      if (activeChannel) await fetchMessages(activeChannel.id);
    } catch (err) {
      console.error('[ECT pin] error:', err);
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

  // ── Mouse handlers for desktop tap-and-hold ───────────────────────────────
  // Desktop / trackpad users get the same "press and hold" affordance the
  // mobile long-press provides. We only arm on left-button (button === 0)
  // and bail on movement >10px so click-drag selections still work. The
  // separate `onContextMenu` handler in the page already covers right-
  // click — this just adds the gesture parity for users who don't think
  // to right-click on a chat bubble.
  const onMsgMouseDown = (e, msgId) => {
    if (e.button !== 0) return;
    if (e.target.closest('a')) return;
    if (previewGuardRef.current) return;
    msgLongPressTriggered.current = false;
    touchStartRef.current = { x: e.clientX, y: e.clientY };
    msgLongPressTimer.current = setTimeout(() => {
      msgLongPressTriggered.current = true;
      window.getSelection()?.removeAllRanges();
      setReactingMsgId(null);
      openMsgAction(msgId);
    }, 500);
  };

  const onMsgMouseMove = (e) => {
    if (!msgLongPressTimer.current) return;
    const dx = Math.abs(e.clientX - touchStartRef.current.x);
    const dy = Math.abs(e.clientY - touchStartRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(msgLongPressTimer.current);
      msgLongPressTimer.current = null;
    }
  };

  const onMsgMouseUp = () => {
    clearTimeout(msgLongPressTimer.current);
    msgLongPressTimer.current = null;
    // If the long-press already triggered and opened the action menu,
    // refresh `menuOpenedAtRef` so the synthetic `click` that fires
    // on mouseup (now landing on the menu's backdrop overlay) is
    // inside the backdrop's grace window and doesn't slam the menu
    // shut. Without this, a hold of >900ms (very natural for users
    // who want to see the menu before releasing) would flash the
    // menu and immediately close it. After consuming the flag we
    // reset it so subsequent clicks on OTHER bubbles aren't eaten.
    if (msgLongPressTriggered.current) {
      menuOpenedAtRef.current = Date.now();
      msgLongPressTriggered.current = false;
    }
  };

  const onMsgMouseLeave = () => {
    // Treat leaving the bubble while holding as cancelling the gesture
    // — otherwise dragging off the chip would still fire the menu.
    clearTimeout(msgLongPressTimer.current);
    msgLongPressTimer.current = null;
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
    onMsgMouseDown,
    onMsgMouseMove,
    onMsgMouseUp,
    onMsgMouseLeave,
  };
}
