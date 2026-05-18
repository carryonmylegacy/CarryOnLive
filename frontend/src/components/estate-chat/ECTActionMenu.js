import React from 'react';
import { ArrowLeft, Copy, Download, Pencil, Pin, Trash2, MapPin } from 'lucide-react';
import { toast } from '../../utils/toast';
import { displayEmoji, EmojiPickerButton, EmojiPickerGrid } from './EmojiLibrary';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * ECTActionMenu — Fixed overlay long-press action menu for chat messages.
 * Extracted from EstateChatPage. Pure prop-passthrough, zero logic changes.
 *
 * PRD MANDATE: This menu is a FIXED OVERLAY outside the scroll container.
 * It is NOT inline in the message loop. This prevents ALL content shifting.
 */
const ECTActionMenu = ({
  msgActionId, menuPosition, menuReady, messages, user,
  isBenefactor, canPin, recentEmojis, showActionEmojiPicker, setShowActionEmojiPicker,
  toggleReaction, togglePin, handleDeleteMessage, closeMsgAction,
  setReplyTo, setEditingMsg, inputRef, token,
  activeChannel, fetchMessages, scrollContainerRef, menuOpenedAtRef,
}) => {
  if (!msgActionId || !menuPosition) return null;

  const actionMsg = messages.find(m => m.id === msgActionId);
  if (!actionMsg) return null;

  const { top, bottom, left, right, isOwn, showAbove } = menuPosition;
  const viewH = window.visualViewport?.height || window.innerHeight;
  const viewW = window.innerWidth;
  const estMenuH = 320;
  let menuTop;
  if (showAbove && top - estMenuH > 60) {
    menuTop = Math.max(60, top - estMenuH);
  } else if (!showAbove && bottom + estMenuH < viewH - 20) {
    menuTop = bottom + 8;
  } else {
    menuTop = Math.max(60, Math.min(viewH - estMenuH - 20, (viewH - estMenuH) / 2));
  }
  const menuStyle = {
    position: 'fixed',
    zIndex: 110,
    maxWidth: Math.min(280, viewW - 24) + 'px',
    top: `${menuTop}px`,
    maxHeight: `${viewH - menuTop - 20}px`,
    overflowY: 'auto',
    ...(isOwn
      ? { right: `${Math.max(12, viewW - right)}px` }
      : { left: `${Math.max(12, left)}px` }
    ),
  };
  const isOwnMsg = actionMsg.sender_id === user?.id;

  return (
    <>
      <div className="fixed inset-0 z-[109]"
        onClick={() => { if (Date.now() - menuOpenedAtRef.current > 400) closeMsgAction(); }}
        onTouchEnd={(e) => { e.preventDefault(); if (Date.now() - menuOpenedAtRef.current > 400) closeMsgAction(); }}
        style={{ background: 'rgba(0,0,0,0.35)' }}
      />
      <div style={{...menuStyle, pointerEvents: menuReady ? 'auto' : 'none'}} data-testid={`msg-action-menu-${msgActionId}`}>
        <div className={`flex gap-1.5 mb-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          {recentEmojis.slice(0, 5).map((emoji) => {
            const myReaction = (actionMsg.reactions || []).some(r => (r.emoji === emoji || displayEmoji(r.emoji) === emoji) && r.user_id === user?.id);
            return (
              <button key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(actionMsg.id, emoji); closeMsgAction(); }}
                className="w-9 h-9 rounded-full flex items-center justify-center text-lg active:scale-90 transition-transform"
                style={{ background: myReaction ? 'rgba(var(--gold-rgb), 0.3)' : 'rgba(30,40,60,0.9)', border: '1px solid rgba(255,255,255,0.1)' }}
                data-testid={`action-reaction-${emoji}`}
              >{emoji}</button>
            );
          })}
          <EmojiPickerButton onClick={() => setShowActionEmojiPicker(!showActionEmojiPicker)} />
        </div>
        {showActionEmojiPicker && (
          <div className="mb-2">
            <EmojiPickerGrid
              onSelect={(emoji) => { toggleReaction(actionMsg.id, emoji); closeMsgAction(); }}
              onClose={() => setShowActionEmojiPicker(false)}
              isOwn={isOwn}
            />
          </div>
        )}
        {!showActionEmojiPicker && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(20,30,50,0.97)', border: '1px solid rgba(255,255,255,0.12)', minWidth: '170px', WebkitBackdropFilter: 'blur(20px)', backdropFilter: 'blur(20px)' }}>
          <button onClick={(e) => { e.stopPropagation(); setReplyTo({ id: actionMsg.id, content: (actionMsg.content || '').slice(0, 100), sender_name: actionMsg.sender_name }); closeMsgAction(); inputRef.current?.focus(); }}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/5" style={{ color: 'var(--t)' }}
            data-testid="action-reply-btn">
            <ArrowLeft className="w-4 h-4" style={{ color: 'var(--t4)', transform: 'scaleX(-1)' }} /> Reply
          </button>
          <div style={{ height: '1px', background: 'var(--b)' }} />
          <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(actionMsg.content || '').then(() => toast.success('Copied')).catch(() => {}); closeMsgAction(); }}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/5" style={{ color: 'var(--t)' }}
            data-testid="action-copy-btn">
            <Copy className="w-4 h-4" style={{ color: 'var(--t4)' }} /> Copy
          </button>
          {(actionMsg.attachment || (actionMsg.attachments && actionMsg.attachments.length > 0)) && (
            <><div style={{ height: '1px', background: 'var(--b)' }} />
            <button onClick={async (e) => {
              e.stopPropagation();
              const att = actionMsg.attachment || (actionMsg.attachments && actionMsg.attachments[0]);
              if (!att?.file_id) { closeMsgAction(); return; }
              closeMsgAction();
              try {
                const url = `${API_URL}/estate-chat/files/${att.file_id}`;
                const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
                const blob = await resp.blob();
                const fileName = att.file_name || 'download';
                const ext = fileName.split('.').pop()?.toLowerCase() || '';
                const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', pdf: 'application/pdf', mp4: 'video/mp4', mov: 'video/quicktime' };
                const mime = mimeMap[ext] || blob.type || 'application/octet-stream';
                const file = new File([blob], fileName, { type: mime });
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                  await navigator.share({ files: [file], title: fileName });
                } else {
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = fileName;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(a.href);
                  toast.success('Downloaded');
                }
              } catch (err) {
                if (err.name !== 'AbortError') toast.error('Download failed');
              }
            }}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/5" style={{ color: '#4CAF50' }}
              data-testid="action-download-btn">
              <Download className="w-4 h-4" style={{ color: '#4CAF50' }} /> Save to Device
            </button></>
          )}
          {isOwnMsg && !actionMsg.attachment && !(actionMsg.attachments && actionMsg.attachments.length) && actionMsg.message_type !== 'voice' && (
            <><div style={{ height: '1px', background: 'var(--b)' }} />
            <button onClick={(e) => { e.stopPropagation(); setEditingMsg({ id: actionMsg.id, content: actionMsg.content || '' }); closeMsgAction(); }}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/5" style={{ color: '#d4af37' }}
              data-testid="action-edit-btn">
              <Pencil className="w-4 h-4" style={{ color: '#d4af37' }} /> Edit
            </button></>
          )}
          {(canPin || isBenefactor) && (
            <><div style={{ height: '1px', background: 'var(--b)' }} />
            <button onClick={(e) => { e.stopPropagation(); togglePin(actionMsg.id); closeMsgAction(); }}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/5" style={{ color: '#d4af37' }}
              data-testid="action-pin-btn">
              <Pin className="w-4 h-4" style={{ color: '#d4af37' }} /> {actionMsg.pinned ? 'Unpin' : 'Pin'}
            </button></>
          )}
          {(isOwnMsg || isBenefactor) && (
            <><div style={{ height: '1px', background: 'var(--b)' }} />
            <button onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this message?')) handleDeleteMessage(actionMsg.id); closeMsgAction(); }}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/5" style={{ color: '#ef4444' }}
              data-testid="action-delete-btn">
              <Trash2 className="w-4 h-4" style={{ color: '#ef4444' }} /> Delete
            </button></>
          )}
          <div style={{ height: '1px', background: 'var(--b)' }} />
          <button onClick={(e) => {
            e.stopPropagation();
            const chId = activeChannel?.id;
            if (!chId) return;
            const authHeaders = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
            const apiUrl = API_URL;
            closeMsgAction();
            if (!navigator.geolocation) { toast.error('Geolocation not supported on this device'); return; }
            navigator.geolocation.getCurrentPosition(
              (p) => {
                toast.info('Sending location...');
                const lat = p.coords.latitude.toFixed(6);
                const lng = p.coords.longitude.toFixed(6);
                const locMsg = 'My location: https://maps.google.com/?q=' + lat + ',' + lng;
                fetch(apiUrl + '/estate-chat/channels/' + chId + '/messages', {
                  method: 'POST', headers: authHeaders,
                  body: JSON.stringify({ content: locMsg }),
                }).then(res => {
                  if (res.ok) {
                    fetchMessages(chId).then(() => {
                      setTimeout(() => { const sc = scrollContainerRef.current; if (sc) sc.scrollTop = sc.scrollHeight; }, 200);
                    });
                  } else { res.text().then(t => toast.error('Send failed: ' + t)); }
                }).catch(() => toast.error('Network error sending location'));
              },
              (err) => { toast.error('Location denied: ' + (err.message || 'Unknown error')); },
              { enableHighAccuracy: true, timeout: 15000 }
            );
          }}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left active:bg-white/5" style={{ color: '#4CAF50' }}
            data-testid="action-location-btn">
            <MapPin className="w-4 h-4" style={{ color: '#4CAF50' }} /> Send My Location
          </button>
        </div>
        )}
      </div>
    </>
  );
};

export default ECTActionMenu;
