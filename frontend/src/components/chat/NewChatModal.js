import React from 'react';
import { X, Check } from 'lucide-react';

const NewChatModal = ({
  showNewChat,
  setShowNewChat,
  newChatType,
  setNewChatType,
  newChatEstate,
  setNewChatEstate,
  groupName,
  setGroupName,
  contacts,
  selectedMembers,
  setSelectedMembers,
  toggleMember,
  isBenefactor,
  createChannel,
}) => {
  if (!showNewChat) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)', padding: '16px', paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="w-full max-w-md rounded-2xl flex flex-col" style={{ background: 'var(--bg2)', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '80vh' }}>
        <div className="flex items-center justify-between p-6 pb-4 flex-shrink-0">
          <h3 className="text-lg font-bold" style={{ color: 'var(--t)' }}>New Conversation</h3>
          <button onClick={() => { setShowNewChat(false); setSelectedMembers([]); setGroupName(''); }} data-testid="ect-new-chat-close">
            <X className="w-5 h-5" style={{ color: 'var(--t4)' }} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 min-h-0">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setNewChatType('direct'); setSelectedMembers([]); }}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            data-testid="ect-type-direct"
            style={{
              background: newChatType === 'direct' ? 'rgba(34,201,147,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${newChatType === 'direct' ? 'rgba(34,201,147,0.4)' : 'rgba(255,255,255,0.07)'}`,
              color: newChatType === 'direct' ? '#22C993' : 'var(--t4)',
            }}
          >Direct Message</button>
          {isBenefactor && (
            <button
              onClick={() => { setNewChatType('group'); setSelectedMembers([]); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
              data-testid="ect-type-group"
              style={{
                background: newChatType === 'group' ? 'rgba(59,123,247,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${newChatType === 'group' ? 'rgba(59,123,247,0.4)' : 'rgba(255,255,255,0.07)'}`,
                color: newChatType === 'group' ? '#3B7BF7' : 'var(--t4)',
              }}
            >Group Chat</button>
          )}
        </div>
        {contacts.length > 1 && (
          <div className="mb-4">
            <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--t4)' }}>Estate</label>
            <select
              value={newChatEstate}
              onChange={(e) => { setNewChatEstate(e.target.value); setSelectedMembers([]); }}
              className="w-full rounded-xl px-3 py-2.5 text-base"
              data-testid="ect-estate-select"
              style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }}
            >
              <option value="">Select estate...</option>
              {contacts.map(c => <option key={c.estate_id} value={c.estate_id}>{c.estate_name}</option>)}
            </select>
          </div>
        )}
        {newChatType === 'group' && (
          <div className="mb-4">
            <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--t4)' }}>Group Name</label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g., Financial Planning"
              className="w-full rounded-xl px-3 py-2.5 text-base"
              data-testid="ect-group-name"
              style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }}
            />
          </div>
        )}
        {(newChatEstate || contacts.length === 1) && (
          <div className="mb-4">
            <label className="text-xs font-bold mb-2 block" style={{ color: 'var(--t4)' }}>
              {newChatType === 'direct' ? 'Select a person' : 'Select members'}
            </label>
            {(contacts.find(c => c.estate_id === (newChatEstate || contacts[0]?.estate_id))?.members || []).map(m => {
              const isSelected = selectedMembers.includes(m.id);
              const initials = m.name ? m.name.split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() : '?';
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    if (newChatType === 'direct') setSelectedMembers([m.id]);
                    else toggleMember(m.id);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl mb-2 transition-all"
                  data-testid={`ect-member-${m.id}`}
                  style={{
                    background: isSelected ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isSelected ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden" style={{
                    background: isSelected ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(255,255,255,0.08)',
                    color: isSelected ? '#080e1a' : 'var(--t4)',
                  }}>
                    {m.photo_url
                      ? <img src={m.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = initials; }} />
                      : initials}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--t)' }}>{m.name}</span>
                      {m.is_ffn && (
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,166,35,0.15)', color: '#F5A623' }}>EXTERNAL</span>
                      )}
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--t4)' }}>{m.relation || m.role_in_estate}</div>
                  </div>
                  {isSelected && <Check className="w-5 h-5 flex-shrink-0" style={{ color: '#d4af37' }} />}
                </button>
              );
            })}
          </div>
        )}
        </div>
        <div className="p-6 pt-4 flex-shrink-0">
        <button
          onClick={createChannel}
          disabled={!selectedMembers.length || (newChatType === 'group' && !groupName.trim())}
          className="w-full py-3 rounded-xl text-base font-bold transition-all"
          data-testid="ect-create-channel-btn"
          style={{
            background: selectedMembers.length ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'rgba(255,255,255,0.06)',
            color: selectedMembers.length ? '#080e1a' : 'var(--t5)',
            cursor: selectedMembers.length ? 'pointer' : 'not-allowed',
          }}
        >Start Conversation</button>
        </div>
      </div>
    </div>
  );
};

export default NewChatModal;
