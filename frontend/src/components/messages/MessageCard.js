import React, { useState } from 'react';
import {
  Video, Mic, Play, Loader2, Users, Pencil, Download, Trash2,
  MessageSquare, Paperclip, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';

/**
 * MessageCard
 * ───────────
 * Collapsed by default — shows just the type-icon, title, trigger
 * summary, and inline pencil/trash actions. Tap the chevron (or any
 * non-action spot on the row) to expand to the full content view
 * (preview text, video thumb, attachment block, recipients row, full
 * action bar). Mirrors the same UX pattern as the CCP Go-Bag list and
 * the Beneficiaries page list — one compact rhythm across the platform.
 */
const MessageCard = ({
  msg,
  user,
  triggerIcons,
  loadingPlayback,
  downloadingId,
  openEdit,
  handleDelete,
  handleDownload,
  playVideo,
  downloadAttachment,
}) => {
  const [expanded, setExpanded] = useState(false);
  const TriggerIcon = triggerIcons[msg.trigger_type] || MessageSquare;
  const canEdit = (user?.role === 'benefactor' || user?.is_also_benefactor) && !msg.is_delivered;

  const TypeIconBlock = (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
      msg.message_type === 'video' ? 'bg-[#8b5cf6]/20' : msg.message_type === 'voice' ? 'bg-[#22c993]/20' : msg.message_type === 'attachment' ? 'bg-[#3b82f6]/20' : 'bg-[#d4af37]/20'
    }`}>
      {msg.message_type === 'video' ? <Video className="w-5 h-5 text-[#8b5cf6]" />
        : msg.message_type === 'voice' ? <Mic className="w-5 h-5 text-[#22c993]" />
        : msg.message_type === 'attachment' ? <Paperclip className="w-5 h-5 text-[#3b82f6]" />
        : <MessageSquare className="w-5 h-5 text-[var(--gold)]" />}
    </div>
  );

  return (
    <Card className="glass-card" data-testid={`message-${msg.id}`}>
      <CardContent className={expanded ? 'p-5' : 'p-3 sm:p-4'}>
        {/* ── COLLAPSED HEADER — always visible ── */}
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setExpanded(v => !v)}
          data-testid={`message-row-${msg.id}`}
        >
          {TypeIconBlock}
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-medium text-sm sm:text-base truncate">{msg.title}</h3>
            <p className="text-[#64748b] text-xs flex items-center gap-1 truncate">
              <TriggerIcon className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">
                {msg.trigger_type === 'immediate' && 'Deliver on transition'}
                {msg.trigger_type === 'age_milestone' && `At age ${msg.trigger_age}`}
                {msg.trigger_type === 'event' && `On ${msg.trigger_value === 'custom' && msg.custom_event_label ? msg.custom_event_label : msg.trigger_value}`}
                {msg.trigger_type === 'specific_date' && `On ${msg.trigger_date || 'specific date'}`}
              </span>
              <span className="text-[var(--t5)]">·</span>
              <span className="flex items-center gap-1"><Users className="w-3 h-3" />{msg.recipients?.length || 0}</span>
            </p>
          </div>

          {msg.is_delivered && (
            <span className="px-2 py-1 bg-[#10b981]/20 text-[#10b981] text-[11px] font-bold rounded-full flex-shrink-0">
              Delivered
            </span>
          )}

          {/* Inline pencil + trash on the collapsed row */}
          {canEdit && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); openEdit(msg); }}
                className="h-8 w-8 flex items-center justify-center rounded-md text-[var(--t4)] hover:text-[#60A5FA] hover:bg-[var(--s)] transition-colors"
                data-testid={`edit-message-${msg.id}`}
                aria-label="Edit message"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(msg.id); }}
                className="h-8 w-8 flex items-center justify-center rounded-md text-[var(--t4)] hover:text-[#ef4444] hover:bg-[var(--s)] transition-colors"
                data-testid={`delete-row-${msg.id}`}
                aria-label="Delete message"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
            className="h-8 w-8 flex items-center justify-center rounded-md text-[var(--t4)] hover:text-[var(--t)] hover:bg-[var(--s)] transition-colors flex-shrink-0"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            data-testid={`expand-row-${msg.id}`}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* ── EXPANDED DETAIL — preview, media, attachments, full action bar ── */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-[var(--b)] animate-fade-in">
            {msg.content && (
              <p className="text-[#94a3b8] text-sm line-clamp-4 mb-4">{msg.content}</p>
            )}

            {msg.message_type === 'video' && msg.video_thumbnail && (
              <div
                className="mb-4 rounded-xl overflow-hidden relative cursor-pointer active:scale-[0.98] transition-transform flex items-center justify-center"
                style={{ maxHeight: 360, background: 'rgba(0,0,0,0.4)' }}
                onClick={(e) => { e.stopPropagation(); playVideo(msg); }}
              >
                <img
                  src={`data:image/jpeg;base64,${msg.video_thumbnail}`}
                  alt="Video thumbnail"
                  className="w-auto h-auto object-contain rounded-xl"
                  style={{ maxHeight: 360, maxWidth: '100%' }}
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
                    {loadingPlayback ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Play className="w-6 h-6 text-white ml-0.5" />}
                  </div>
                </div>
              </div>
            )}
            {msg.message_type === 'video' && !msg.video_thumbnail && msg.video_url && (
              <button
                onClick={(e) => { e.stopPropagation(); playVideo(msg); }}
                className="mb-4 w-full p-4 rounded-xl flex items-center justify-center gap-2 text-sm text-[#8b5cf6] font-bold active:scale-[0.98] transition-transform"
                style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}
              >
                {loadingPlayback ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Play Video
              </button>
            )}

            {msg.message_type === 'attachment' && msg.attachment_name && (
              <div
                className="mb-4 flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}
              >
                <Paperclip className="w-5 h-5 text-[#3b82f6] flex-shrink-0" />
                <span className="text-sm text-[var(--t3)] truncate flex-1">{msg.attachment_name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); downloadAttachment(msg); }}
                  className="text-[#3b82f6] hover:text-[#60a5fa]"
                  data-testid={`download-attachment-${msg.id}`}
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Bottom action bar — keeps download here (less common action) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[#64748b] text-xs">
                <Users className="w-3 h-3" />
                {msg.recipients?.length || 0} recipients
              </div>
              {canEdit && (
                <Button
                  variant="ghost" size="sm"
                  className="text-[#22C993]"
                  disabled={downloadingId === msg.id}
                  onClick={(e) => { e.currentTarget.blur(); handleDownload(msg); }}
                  data-testid={`download-message-${msg.id}`}
                  aria-label="Download message"
                >
                  {downloadingId === msg.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Download className="w-4 h-4" />}
                </Button>
              )}
              {user?.role !== 'benefactor' && (
                <Button
                  variant="ghost" size="sm"
                  className="text-[var(--gold)]"
                  disabled={downloadingId === msg.id}
                  onClick={(e) => { e.currentTarget.blur(); handleDownload(msg); }}
                  aria-label="Download message"
                >
                  {downloadingId === msg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MessageCard;
