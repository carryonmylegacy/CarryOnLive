import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MessageCircle, Headphones, UserCircle, Loader2, Send, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const SupportTab = ({ getAuthHeaders }) => {
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [convMessages, setConvMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API_URL}/support/conversations`, getAuthHeaders());
      setConversations(res.data);
    } catch (err) { console.error('Error fetching conversations:', err); }
  };

  const fetchConversationMessages = async (convId) => {
    try {
      const res = await axios.get(`${API_URL}/support/messages/${convId}`, getAuthHeaders());
      setConvMessages(res.data);
    } catch (err) { console.error('Error fetching messages:', err); }
  };

  const sendSupportMessage = async () => {
    if (!newMessage.trim() || !selectedConv) return;
    setSendingMessage(true);
    try {
      const res = await axios.post(`${API_URL}/support/messages`, {
        content: newMessage.trim(),
        conversation_id: selectedConv.conversation_id
      }, getAuthHeaders());
      setConvMessages(prev => [...prev, res.data]);
      setNewMessage('');
      fetchConversations();
    } catch (err) {
      toast.error('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedConv) {
      fetchConversationMessages(selectedConv.conversation_id);
      const interval = setInterval(() => fetchConversationMessages(selectedConv.conversation_id), 10000);
      return () => clearInterval(interval);
    }
  }, [selectedConv]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (conv.user_name || '').toLowerCase().includes(q) ||
      (conv.user_email || '').toLowerCase().includes(q) ||
      (conv.latest_message || '').toLowerCase().includes(q) ||
      (conv.user_role || '').toLowerCase().includes(q);
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-20rem)]" data-testid="admin-support-tab">
      {/* Conversations List */}
      <div className="glass-card overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[var(--b)]">
          <h3 className="font-bold text-[var(--t)] flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-[var(--gn2)]" />
            Conversations
          </h3>
          <p className="text-xs text-[var(--t5)]">{filteredConversations.length} {searchQuery ? 'matching' : 'active'}</p>
        </div>
        <div className="p-3 border-b border-[var(--b)]">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <Search className="w-3.5 h-3.5 text-[var(--t5)]" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search conversations..." className="flex-1 bg-transparent border-none text-[var(--t)] text-xs outline-none placeholder:text-[var(--t5)]" data-testid="support-search" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-[var(--t5)]">
              <Headphones className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No conversations yet</p>
            </div>
          ) : (
            filteredConversations.map(conv => (
              <div
                key={conv.conversation_id}
                onClick={() => setSelectedConv(conv)}
                className={`p-4 border-b border-[var(--b)] cursor-pointer hover:bg-[var(--s)] transition-colors ${
                  selectedConv?.conversation_id === conv.conversation_id ? 'bg-[var(--s)]' : ''
                }`}
                data-testid={`conv-${conv.conversation_id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--t)] truncate">{conv.user_name || 'Unknown'}</span>
                      {conv.unread_count > 0 && (
                        <span className="bg-[var(--rd)] text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--t5)] truncate">{conv.user_email}</p>
                    <p className="text-sm text-[var(--t4)] truncate mt-1">
                      {conv.sender_role === 'admin' ? 'You: ' : ''}{conv.latest_message}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--t5)] whitespace-nowrap">
                    {new Date(conv.latest_time).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="lg:col-span-2 glass-card overflow-hidden flex flex-col">
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center text-center p-6">
            <div>
              <Headphones className="w-16 h-16 mx-auto text-[var(--t5)] mb-4" />
              <h3 className="text-lg font-bold text-[var(--t)] mb-2">Customer Support Team</h3>
              <p className="text-sm text-[var(--t4)]">Select a conversation from the left to view and respond</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-[var(--b)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--s)] flex items-center justify-center">
                  <UserCircle className="w-6 h-6 text-[var(--bl3)]" />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--t)]">{selectedConv.user_name}</h3>
                  <p className="text-xs text-[var(--t5)]">{selectedConv.user_email} · {selectedConv.user_role}</p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--bg2)]">
              {convMessages.map((msg, idx) => {
                const isSupport = msg.sender_role === 'admin';
                return (
                  <div key={msg.id || idx} className={`flex ${isSupport ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      isSupport ? 'bg-[var(--gold)] text-[#1a1a2e]' : 'glass-card'
                    }`}>
                      {isSupport && (
                        <p className="text-xs font-bold mb-1 opacity-70">CarryOn Support</p>
                      )}
                      <p className={`text-sm ${isSupport ? 'text-[#1a1a2e]' : 'text-[var(--t)]'}`}>{msg.content}</p>
                      <p className={`text-xs mt-1 ${isSupport ? 'text-[#1a1a2e]/60' : 'text-[var(--t5)]'}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-[var(--b)]">
              <div className="flex gap-2">
                <Input
                  className="input-field flex-1"
                  placeholder="Type your response..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendSupportMessage()}
                  disabled={sendingMessage}
                  data-testid="admin-support-message-input"
                />
                <Button
                  onClick={sendSupportMessage}
                  className="gold-button px-4"
                  disabled={sendingMessage || !newMessage.trim()}
                  data-testid="admin-send-support-message"
                >
                  {sendingMessage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
