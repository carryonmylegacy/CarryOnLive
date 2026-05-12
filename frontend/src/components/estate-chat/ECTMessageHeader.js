import React from 'react';
import { ArrowLeft, Pin, X, Trash2, UserPlus } from 'lucide-react';
import OfflineImage from '../OfflineImage';

/**
 * ECTMessageHeader — pure presentational top-of-conversation bar.
 *
 * Renders: back button, avatar, channel title + members popover, pinned
 * messages dropdown, and the group-channel delete button (benefactor only).
 *
 * Extracted from EstateChatPage.js (Apr 2026 refactor) WITHOUT moving
 * any logic. Hosts no state, owns no fetches. The parent passes in every
 * value and callback explicitly.
 *
 * Sibling to ECTChannelList — same DO NOT TOUCH rule: no state, no
 * effects, no API calls in this file.
 */
const ECTMessageHeader = ({
  activeChannel,
  user,
  handleBackOut,
  getChannelIcon,
  showHeaderMembers, setShowHeaderMembers,
  resolveChannelMembers,
  getNonChannelMembers,
  addMemberToChannel,
  pinnedMsgs,
  showPinned, setShowPinned,
  scrollContainerRef,
  isBenefactor,
  deleteChannel,
}) => (
  <div className="flex items-center gap-3 p-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'relative' }}>
    <button onClick={handleBackOut} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" data-testid="ect-back-btn" style={{ background: 'rgba(255,255,255,0.06)' }} aria-label="Back to conversations">
      <ArrowLeft className="w-4 h-4" style={{ color: 'var(--t4)' }} />
    </button>
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-sm font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}>
      {activeChannel.type === 'direct' && activeChannel.photo_url ? (
        <OfflineImage
          src={activeChannel.photo_url}
          cacheKey={`ect:dm:${activeChannel.id}:photo`}
          alt=""
          className="w-9 h-9 rounded-full object-cover"
          fallback={<span>{activeChannel.name?.charAt(0)?.toUpperCase() || '?'}</span>}
        />
      ) : activeChannel.estate_photo_url ? (
        <OfflineImage
          src={activeChannel.estate_photo_url}
          cacheKey={activeChannel.estate_id ? `estate:${activeChannel.estate_id}:cover` : undefined}
          alt=""
          className="w-9 h-9 rounded-full object-cover"
          fallback={<span>{(activeChannel.estate_name || activeChannel.name)?.charAt(0)?.toUpperCase() || '?'}</span>}
        />
      ) : activeChannel.type === 'direct' ? (activeChannel.name?.charAt(0)?.toUpperCase() || '?') : getChannelIcon(activeChannel.type)}
    </div>
    <div className="flex-1 min-w-0 relative">
      <div className="text-sm font-bold truncate" style={{ color: 'var(--t)' }}>{activeChannel.type === 'direct' ? activeChannel.name : `${activeChannel.estate_name || activeChannel.name} Members`}</div>
      <button onClick={(e) => { e.stopPropagation(); setShowHeaderMembers(!showHeaderMembers); }} className="text-[11px] cursor-pointer" data-testid="ect-header-members-link"
        style={{ color: '#d4af37', background: 'none', border: 'none', padding: 0, font: 'inherit', textDecoration: 'none' }}>
        {activeChannel.type === 'circle' ? 'All estate members' : activeChannel.type === 'group' ? `${activeChannel.members?.length || 0} members` : 'Direct message'}
      </button>
      {showHeaderMembers && (
        <div className="absolute left-0 top-full mt-1 rounded-xl overflow-hidden z-50" data-testid="ect-header-members-dropdown"
          style={{ background: '#1A2238', border: '1px solid rgba(212,175,55,0.25)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: '220px', maxWidth: '280px', maxHeight: '300px', overflowY: 'auto' }}>
          <div className="px-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}><span className="text-[11px] font-semibold" style={{ color: 'var(--t4)' }}>Members</span></div>
          {resolveChannelMembers(activeChannel.members || [], activeChannel.estate_id).map(m => {
            const initials = m.name ? m.name.split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() : '?';
            const isYou = m.id === user?.id;
            return (
              <div key={m.id} className="flex items-center gap-2.5 px-3 py-2" data-testid={`header-member-${m.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-xs font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>
                  {m.photo_url ? (
                    <OfflineImage
                      src={m.photo_url}
                      cacheKey={m.id ? `user:${m.id}:photo` : undefined}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover"
                      fallback={<span>{initials}</span>}
                    />
                  ) : initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: 'var(--t)' }}>{m.name}{isYou ? ' (You)' : ''}</div>
                  {(m.relation || m.role_in_estate) && <div className="text-[11px] truncate" style={{ color: 'var(--t4)' }}>{m.relation || m.role_in_estate}</div>}
                </div>
              </div>
            );
          })}
          {activeChannel.type === 'group' && (() => {
            const available = getNonChannelMembers(activeChannel.members, activeChannel.estate_id);
            if (!available.length) return null;
            return (
              <>
                <div className="px-3 py-1.5" style={{ borderTop: '1px solid rgba(212,175,55,0.15)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}><span className="text-[11px] font-semibold" style={{ color: '#d4af37' }}>Add to Chat</span></div>
                {available.map(m => {
                  const initials = m.name ? m.name.split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() : '?';
                  return (
                    <button key={m.id} onClick={(e) => { e.stopPropagation(); addMemberToChannel(activeChannel.id, m.id, activeChannel.estate_id); }} className="flex items-center gap-2.5 px-3 py-2 w-full text-left hover:bg-white/5 transition-colors" data-testid={`header-add-member-${m.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-xs font-bold" style={{ background: 'rgba(76,175,80,0.15)', color: '#4CAF50' }}>
                        {m.photo_url ? <img src={m.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = initials; }} /> : initials}
                      </div>
                      <div className="flex-1 min-w-0"><div className="text-xs font-semibold truncate" style={{ color: 'var(--t)' }}>{m.name}</div>{(m.relation || m.role_in_estate) && <div className="text-[11px] truncate" style={{ color: 'var(--t4)' }}>{m.relation || m.role_in_estate}</div>}</div>
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
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowPinned(!showPinned)}
          className="h-8 px-2.5 rounded-full flex items-center gap-1.5"
          data-testid="ect-header-pinned-btn"
          style={{
            background: showPinned ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)',
            border: showPinned ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent',
          }}
        >
          <Pin className="w-3.5 h-3.5" style={{ color: '#d4af37' }} />
          <span className="text-xs font-bold" style={{ color: '#d4af37' }}>{pinnedMsgs.length}</span>
        </button>

        {/* Pinned messages dropdown — anchored to this button */}
        {showPinned && (
          <>
            {/* Backdrop to close on outside tap */}
            <div
              className="fixed inset-0 z-[55]"
              onClick={() => setShowPinned(false)}
            />
            <div
              className="absolute z-[56] rounded-2xl overflow-hidden"
              data-testid="ect-pinned-dropdown"
              style={{
                top: 'calc(100% + 8px)',
                right: 0,
                width: 'min(320px, calc(100vw - 32px))',
                background: 'var(--bg2)',
                border: '1px solid rgba(212,175,55,0.3)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                maxHeight: 'calc(100dvh - 64px - 80px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))',
              }}
            >
              {/* Dropdown header */}
              <div
                className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
                style={{ borderBottom: '1px solid rgba(212,175,55,0.15)' }}
              >
                <Pin className="w-4 h-4 flex-shrink-0" style={{ color: '#d4af37' }} />
                <span className="text-xs font-bold flex-1" style={{ color: '#d4af37' }}>
                  {pinnedMsgs.length} Pinned Message{pinnedMsgs.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => setShowPinned(false)}
                  className="p-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Scrollable list */}
              <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {pinnedMsgs.map((pm, idx) => {
                  const ts = pm.created_at
                    ? new Date(pm.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '';
                  return (
                    <button
                      key={pm.id}
                      onClick={() => {
                        setShowPinned(false);
                        // Jump to the message in the chat
                        setTimeout(() => {
                          const el = scrollContainerRef.current?.querySelector(
                            `[data-testid="msg-bubble-${pm.id}"]`
                          );
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.style.transition = 'background 300ms ease';
                            el.style.background = 'rgba(212,175,55,0.18)';
                            setTimeout(() => { el.style.background = ''; }, 1500);
                          }
                        }, 100);
                      }}
                      className="w-full text-left px-4 py-3 transition-colors active:opacity-70"
                      data-testid={`pinned-item-${pm.id}`}
                      style={{
                        borderBottom: idx < pinnedMsgs.length - 1
                          ? '1px solid rgba(255,255,255,0.06)'
                          : 'none',
                        background: 'transparent',
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold" style={{ color: '#d4af37' }}>
                          {pm.sender_name || 'Unknown'}
                        </span>
                        {ts && (
                          <span className="text-[11px]" style={{ color: 'var(--t5)' }}>{ts}</span>
                        )}
                      </div>
                      <p
                        className="text-sm leading-snug"
                        style={{
                          color: 'var(--t)',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {pm.content || (pm.attachment ? '📎 Attachment' : '—')}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    )}
    {activeChannel.type === 'group' && isBenefactor && (
      <button onClick={() => deleteChannel(activeChannel.id)} className="w-8 h-8 rounded-full flex items-center justify-center" data-testid="ect-delete-channel" style={{ background: 'rgba(240,82,82,0.1)' }}>
        <Trash2 className="w-4 h-4" style={{ color: '#F05252' }} />
      </button>
    )}
  </div>
);

export default ECTMessageHeader;
