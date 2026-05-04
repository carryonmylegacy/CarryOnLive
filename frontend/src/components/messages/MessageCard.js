import React from 'react';
import {
  Video, Mic, Play, Loader2, Users, Pencil, Download, Trash2,
  MessageSquare, Paperclip,
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';

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
  const TriggerIcon = triggerIcons[msg.trigger_type] || MessageSquare;
  return (
    <Card className="glass-card" data-testid={`message-${msg.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              msg.message_type === 'video' ? 'bg-[#8b5cf6]/20' : msg.message_type === 'voice' ? 'bg-[#22c993]/20' : msg.message_type === 'attachment' ? 'bg-[#3b82f6]/20' : 'bg-[#d4af37]/20'
            }`}>
              {msg.message_type === 'video' ? (
                <Video className="w-5 h-5 text-[#8b5cf6]" />
              ) : msg.message_type === 'voice' ? (
                <Mic className="w-5 h-5 text-[#22c993]" />
              ) : msg.message_type === 'attachment' ? (
                <Paperclip className="w-5 h-5 text-[#3b82f6]" />
              ) : (
                <MessageSquare className="w-5 h-5 text-[var(--gold)]" />
              )}
            </div>
            <div>
              <h3 className="text-white font-medium">{msg.title}</h3>
              <p className="text-[#64748b] text-sm flex items-center gap-1">
                <TriggerIcon className="w-3 h-3" />
                {msg.trigger_type === 'immediate' && 'Deliver on transition'}
                {msg.trigger_type === 'age_milestone' && `At age ${msg.trigger_age}`}
                {msg.trigger_type === 'event' && `On ${msg.trigger_value === 'custom' && msg.custom_event_label ? msg.custom_event_label : msg.trigger_value}`}
                {msg.trigger_type === 'specific_date' && `On ${msg.trigger_date || 'specific date'}`}
              </p>
            </div>
          </div>
          
          {msg.is_delivered && (
            <span className="px-2 py-1 bg-[#10b981]/20 text-[#10b981] text-xs rounded-full">
              Delivered
            </span>
          )}
        </div>
        
        <p className="text-[#94a3b8] text-sm line-clamp-3 mb-4">{msg.content}</p>
        
        {msg.message_type === 'video' && msg.video_thumbnail && (
          <div
            className="mb-4 rounded-xl overflow-hidden relative cursor-pointer active:scale-[0.98] transition-transform flex items-center justify-center"
            style={{
              // No fixed aspect — let the recorded video's natural
              // orientation drive the frame so portrait selfies don't
              // get center-cropped into a landscape strip and look
              // squashed (founder report May 3 2026). Caps at a
              // reasonable height so a tall portrait clip doesn't
              // dominate the card.
              maxHeight: 360,
              background: 'rgba(0,0,0,0.4)',
            }}
            onClick={(e) => { e.stopPropagation(); playVideo(msg); }}>
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
          <button onClick={(e) => { e.stopPropagation(); playVideo(msg); }}
            className="mb-4 w-full p-4 rounded-xl flex items-center justify-center gap-2 text-sm text-[#8b5cf6] font-bold active:scale-[0.98] transition-transform"
            style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
            {loadingPlayback ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Play Video
          </button>
        )}
        
        {msg.message_type === 'attachment' && msg.attachment_name && (
          <div className="mb-4 flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
            <Paperclip className="w-5 h-5 text-[#3b82f6] flex-shrink-0" />
            <span className="text-sm text-[var(--t3)] truncate flex-1">{msg.attachment_name}</span>
            <button onClick={(e) => { e.stopPropagation(); downloadAttachment(msg); }}
              className="text-[#3b82f6] hover:text-[#60a5fa]" data-testid={`download-attachment-${msg.id}`}>
              <Download className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[#64748b] text-xs">
            <Users className="w-3 h-3" />
            {msg.recipients?.length || 0} recipients
          </div>
          
          {(user?.role === 'benefactor' || user?.is_also_benefactor) && !msg.is_delivered && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-[#60A5FA]"
                onClick={() => openEdit(msg)}
                data-testid={`edit-message-${msg.id}`}
                aria-label="Edit message"
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
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
              <Button
                variant="ghost"
                size="sm"
                className="text-[#ef4444]"
                onClick={() => handleDelete(msg.id)}
                aria-label="Delete message"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
          {user?.role !== 'benefactor' && (
            <Button
              variant="ghost"
              size="sm"
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
        </div>
      </CardContent>
    </Card>
  );
};

export default MessageCard;
