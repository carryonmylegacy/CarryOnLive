import React from 'react';
import {
  Send, Loader2, X, Paperclip, ChevronDown, Mic, Square, Play, FileText, Delete,
} from 'lucide-react';
import { toast } from '../../utils/toast';
import {
  EmojiPickerButton, EmojiPickerGrid, addRecentEmoji,
} from './EmojiLibrary';

/**
 * ECTMessageInput — pure presentational composer + emoji bar.
 *
 * Owns NO state. Every value (draft, pendingFiles, voicePreview, focus
 * state…) is supplied by the parent. Every callback (sendMessage,
 * uploadMultipleFiles, voiceRecorder.start, etc.) is supplied by the
 * parent. This was lifted verbatim from EstateChatPage.js (Apr 2026
 * refactor) to shrink the monolith without touching real-time logic.
 *
 * `scrollEl` is a function passed in by the parent that resolves the
 * actual scrollable element behind an OverlayScrollbars host — we keep
 * the closure on the parent side rather than duplicate that 6-line
 * helper across files.
 *
 * KEYBOARD-CRITICAL: the focus/blur/scrollIntoView dance below was
 * tuned by hand (ECT-001 thru ECT-007) to keep iOS keyboards from
 * eating messages. Do NOT collapse handlers, change setTimeout
 * intervals, or "tidy up" the rAF + setTimeout chain.
 */
const ECTMessageInput = ({
  typers,
  replyTo, setReplyTo,
  pendingFiles, setPendingFiles,
  uploadMultipleFiles, uploading,
  fileInputRef, inputRef,
  voiceRecorder, voicePreview, stopAndPreview, discardPreview, sendVoiceMessage,
  draft, setDraft, handleDraftChange,
  inputFocused, setInputFocused,
  sending, sendMessage,
  scrollEl, scrollContainerRef,
  recentEmojis, setRecentEmojis,
  showDraftEmojiPicker, setShowDraftEmojiPicker,
}) => (
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
            const doScroll = () => { const sc = scrollEl(scrollContainerRef); if (sc) sc.scrollTop = sc.scrollHeight; };
            requestAnimationFrame(doScroll); setTimeout(doScroll, 150); setTimeout(doScroll, 400); setTimeout(doScroll, 700);
          }}
          onTouchStart={() => {
            if (document.activeElement === inputRef.current) {
              setTimeout(() => { try { inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} }, 300);
            }
          }}
          onBlur={() => {
            setInputFocused(false);
            const doScroll = () => { const sc = scrollEl(scrollContainerRef); if (sc) sc.scrollTop = sc.scrollHeight; };
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
);

export default ECTMessageInput;
