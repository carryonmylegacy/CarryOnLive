import React from 'react';
import {
  MessageCircle, Plus, ArrowLeft, Trash2, Loader2, X, Check,
  Search, Shield, ChevronDown, CheckSquare2,
} from 'lucide-react';

/**
 * ECTChannelList — pure presentational sidebar for the Estate Chat.
 *
 * Extracted from EstateChatPage.js (Apr 2026 refactor) WITHOUT moving any
 * logic. All state, hooks, refs, swipe handlers, and search/select
 * machinery still live in the parent; this component only renders the JSX
 * given an explicit prop bag. The goal is reliability via smaller files,
 * not abstraction.
 *
 * If you find yourself adding `useState` / `useEffect` / data fetching
 * here, STOP — that belongs in the parent or in a dedicated hook in
 * `/components/estate-chat/`. This file should never own state.
 */
const ECTChannelList = ({
  // visibility & navigation
  showChannelList, activeChannel, onBackToDashboard,
  // select mode
  selectMode, exitSelectMode, selectedChannels, toggleSelectAll, setBulkDeleteConfirm,
  setSelectMode, toggleChannelSelection,
  // top-bar actions
  setShowNewChat, showSearch, setShowSearch,
  // search
  searchQuery, handleSearch, searching, searchResults, jumpToMessage,
  // security accordion
  showSecurityInfo, setShowSecurityInfo, setShowSecurityIntro,
  // channels
  channels, openChannel,
  // swipe
  swipedChannel, setSwipedChannel, handleTouchStart, handleTouchMove, handleTouchEnd,
  // delete
  setDeleteConfirm,
  // members popover anchor
  showListMembersId, setShowListMembersId, listMembersPosRef,
  // helpers
  getChannelIcon,
}) => (
  <div
    className={`${showChannelList || !activeChannel ? 'flex' : 'hidden'} lg:flex flex-col h-full`}
    style={{ width: '100%', maxWidth: '100%', borderRight: '1px solid var(--b)' }}
  >
    {/* Desktop-only back-to-app bar — invisible on mobile (platform header handles that) */}
    <div className="hidden lg:flex items-center px-4 pt-3 pb-1">
      <button
        onClick={onBackToDashboard}
        className="flex items-center gap-1.5 text-xs font-semibold transition-colors hover:opacity-80"
        data-testid="ect-back-to-dashboard"
        style={{ color: 'var(--t4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        aria-label="Back to Dashboard"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Dashboard
      </button>
    </div>

    {/* ECT-own header. Explicit `order-*` classes ensure the title stays
        LEFT and action buttons stay RIGHT regardless of any ambient CSS
        (e.g., an RTL wrapper or flex-direction override somewhere up the
        tree). Defensive because a user reported the two halves swapped. */}
    <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--b)' }}>
      <div className="flex items-center gap-3 order-1">
        {selectMode ? (
          <button onClick={exitSelectMode} className="w-9 h-9 rounded-full flex items-center justify-center" data-testid="ect-select-cancel" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <X className="w-4 h-4" style={{ color: 'var(--t4)' }} />
          </button>
        ) : (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,123,247,0.12)', boxShadow: '0 0 12px rgba(59,123,247,0.25)' }}>
            <MessageCircle className="w-5 h-5" style={{ color: '#3B7BF7' }} />
          </div>
        )}
        <h2 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--t)', fontFamily: 'var(--sans)' }}>
          {selectMode ? `${selectedChannels.size} Selected` : 'Estate Comms Tool (ECT)'}
        </h2>
      </div>
      <div className="flex gap-2 order-2">
        {selectMode ? (
          <>
            <button onClick={toggleSelectAll} className="h-10 px-3 rounded-full flex items-center justify-center gap-1.5 transition-all" data-testid="ect-select-all-btn"
              style={{ background: selectedChannels.size === channels.length ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${selectedChannels.size === channels.length ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
              <span className="text-xs font-semibold" style={{ color: selectedChannels.size === channels.length ? '#d4af37' : 'var(--t4)' }}>
                {selectedChannels.size === channels.length ? 'Deselect All' : 'Select All'}
              </span>
            </button>
            <button onClick={() => { if (selectedChannels.size > 0) setBulkDeleteConfirm(true); }} disabled={selectedChannels.size === 0}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all" data-testid="ect-bulk-delete-btn"
              style={{ background: selectedChannels.size > 0 ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selectedChannels.size > 0 ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.06)'}`, cursor: selectedChannels.size > 0 ? 'pointer' : 'not-allowed' }}>
              <Trash2 className="w-5 h-5" style={{ color: selectedChannels.size > 0 ? '#dc2626' : 'var(--t5)' }} />
            </button>
          </>
        ) : (
          <>
            {channels.length > 0 && (
              <button onClick={() => { setSelectMode(true); setSwipedChannel(null); }} className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105" data-testid="ect-select-mode-btn" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <CheckSquare2 className="w-5 h-5" style={{ color: 'var(--t4)' }} />
              </button>
            )}
            <button onClick={() => setShowSearch(!showSearch)} className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105" data-testid="ect-search-btn" style={{ background: showSearch ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.06)' }}>
              <Search className="w-5 h-5" style={{ color: showSearch ? '#d4af37' : 'var(--t4)' }} />
            </button>
            <button onClick={() => setShowNewChat(true)} className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105" data-testid="ect-new-chat-btn" style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)' }}>
              <Plus className="w-5 h-5" style={{ color: '#080e1a' }} />
            </button>
          </>
        )}
      </div>
    </div>
    {showSearch && (
      <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input value={searchQuery} onChange={(e) => handleSearch(e.target.value)} placeholder="Search messages..." autoFocus
          className="w-full rounded-xl px-3 py-2.5 text-base" data-testid="ect-search-input"
          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px', outline: 'none' }} />
      </div>
    )}
    <div className="flex-1 overflow-y-auto p-2">
      <button onClick={() => setShowSecurityInfo(!showSecurityInfo)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl mb-2 transition-all" data-testid="ect-security-info-toggle"
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
              <div><span className="text-xs font-bold" style={{ color: 'var(--t)' }}>{t}</span><span className="text-xs" style={{ color: 'var(--t4)' }}> — {d}</span></div>
            </div>
          ))}
          <button onClick={() => setShowSecurityIntro(true)} className="w-full py-2 mt-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97]" data-testid="ect-show-full-security"
            style={{ background: 'linear-gradient(135deg, #d4af37, #F0C95C)', color: '#080e1a' }}>Learn More</button>
        </div>
      )}
      {showSearch && searchQuery.trim() ? (
        <div>
          {searching && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4af37' }} /></div>}
          {!searching && searchResults.length === 0 && searchQuery.trim() && (
            <div className="text-center py-8"><Search className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--t5)' }} /><p className="text-sm" style={{ color: 'var(--t4)' }}>No messages found</p></div>
          )}
          {searchResults.map(sr => (
            <button key={sr.id} onClick={() => jumpToMessage(sr)} className="w-full text-left p-3 rounded-xl mb-1 transition-all" data-testid={`search-result-${sr.id}`}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                {getChannelIcon(sr.channel_type)}
                <span className="text-[11px] font-semibold" style={{ color: '#d4af37' }}>{sr.channel_name || 'Chat'}</span>
                <span className="text-[11px] ml-auto" style={{ color: 'var(--t5)' }}>{new Date(sr.created_at).toLocaleDateString()}</span>
              </div>
              <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--t4)' }}>{sr.sender_name}</div>
              <p className="text-sm truncate" style={{ color: 'var(--t)' }}>{sr.content}</p>
            </button>
          ))}
        </div>
      ) : (
        <>
          {channels.length === 0 && (
            <div className="text-center py-12 px-4">
              <MessageCircle className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--t5)' }} />
              <p className="text-sm" style={{ color: 'var(--t4)' }}>No conversations yet</p>
              <p className="text-xs mt-1" style={{ color: 'var(--t5)' }}>Tap + to start chatting</p>
            </div>
          )}
          {channels.map(ch => (
            <div key={ch.id} className={`relative rounded-xl mb-1 ${showListMembersId === ch.id ? '' : 'overflow-hidden'}`}
              onTouchStart={(e) => !selectMode && handleTouchStart(e, ch.id)}
              onTouchMove={(e) => !selectMode && handleTouchMove(e)}
              onTouchEnd={(e) => !selectMode && handleTouchEnd(e, ch.id)}>
              {!selectMode && (
                <div className="absolute inset-y-0 right-0 flex items-center" style={{ width: '72px', background: '#dc2626', justifyContent: 'center', borderRadius: '12px', opacity: swipedChannel === ch.id ? 1 : 0, transition: 'opacity 0.15s ease' }}>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(ch); }} data-testid={`ect-channel-delete-${ch.id}`} className="w-full h-full flex items-center justify-center">
                    <Trash2 className="w-5 h-5" style={{ color: '#fff' }} />
                  </button>
                </div>
              )}
              <button onClick={() => { if (selectMode) { toggleChannelSelection(ch.id); } else if (swipedChannel === ch.id) { setSwipedChannel(null); } else { openChannel(ch); } }}
                className="w-full flex items-center gap-3 p-3 transition-transform text-left relative" data-testid={`ect-channel-${ch.id}`}
                style={{ background: selectMode && selectedChannels.has(ch.id) ? 'rgba(220,38,38,0.08)' : activeChannel?.id === ch.id ? 'rgba(212,175,55,0.1)' : 'var(--bg, #0B1120)', border: selectMode && selectedChannels.has(ch.id) ? '1px solid rgba(220,38,38,0.25)' : activeChannel?.id === ch.id ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent', borderRadius: '12px', transform: !selectMode && swipedChannel === ch.id ? 'translateX(-72px)' : 'translateX(0)', transition: 'transform 0.2s ease' }}>
                {selectMode && (
                  <div className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-all" style={{ background: selectedChannels.has(ch.id) ? '#dc2626' : 'rgba(255,255,255,0.06)', border: `2px solid ${selectedChannels.has(ch.id) ? '#dc2626' : 'rgba(255,255,255,0.15)'}` }}>
                    {selectedChannels.has(ch.id) && <Check className="w-3.5 h-3.5" style={{ color: '#fff' }} />}
                  </div>
                )}
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-sm font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t4)' }}>
                  {ch.type === 'direct' && ch.photo_url ? <img src={ch.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = ch.name?.charAt(0)?.toUpperCase() || '?'; }} />
                    : ch.estate_photo_url ? <img src={ch.estate_photo_url} alt="" className="w-10 h-10 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = (ch.estate_name || ch.name)?.charAt(0)?.toUpperCase() || '?'; }} />
                    : ch.type === 'direct' ? (ch.name?.charAt(0)?.toUpperCase() || '?') : getChannelIcon(ch.type)}
                </div>
                <div className="flex-1 min-w-0 relative" style={{ zIndex: showListMembersId === ch.id ? 50 : 'auto' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--t)' }}>{ch.type === 'direct' ? ch.name : `${ch.estate_name || ch.name} Members`}</span>
                    {ch.unread_count > 0 && <span className="ml-2 min-w-[20px] h-5 rounded-full flex items-center justify-center text-[11px] font-bold px-1.5" style={{ background: '#d4af37', color: '#080e1a' }}>{ch.unread_count}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded cursor-pointer flex-shrink-0 whitespace-nowrap" data-testid={`ect-list-members-link-${ch.id}`}
                      onClick={(e) => { e.stopPropagation(); if (showListMembersId === ch.id) { setShowListMembersId(null); } else { const rect = e.currentTarget.getBoundingClientRect(); listMembersPosRef.current = { top: rect.bottom + 4, left: rect.left }; setShowListMembersId(ch.id); } }}
                      style={{ background: 'rgba(212,175,55,0.08)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.15)' }}>{ch.estate_name}</span>
                    {ch.last_message && <span className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--t5)' }}>{ch.last_message.content}</span>}
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

export default ECTChannelList;
