import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { MessageCircle, Send, Loader2, Headphones } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from '../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SupportChatPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(56);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const header = document.querySelector('.mobile-header');
    if (header) setHeaderHeight(header.offsetHeight);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    fetchMessages();
    // Poll for new messages every 10 seconds
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const res = await axios.get(`${API_URL}/support/messages`, getAuthHeaders());
      setMessages(res.data);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      const res = await axios.post(`${API_URL}/support/messages`, {
        content: newMessage.trim()
      }, getAuthHeaders());
      
      setMessages(prev => [...prev, res.data]);
      setNewMessage('');
      inputRef.current?.focus();
    } catch (err) {
      console.error('Error sending message:', err);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + 
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[var(--bg)] z-10 lg:relative lg:inset-auto" style={{ top: headerHeight + 'px', bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }} data-testid="support-chat-page">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-[var(--b)] bg-[var(--bg)]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.15))' }}>
            <Headphones className="w-6 h-6 text-[var(--gn2)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              CarryOn™ Support
            </h1>
            <p className="text-xs text-[var(--t4)]">
              We typically respond within a few hours
            </p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--bg2)]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--gold)]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(34,197,94,0.1)' }}>
              <MessageCircle className="w-10 h-10 text-[var(--gn2)]" />
            </div>
            <h3 className="text-lg font-bold text-[var(--t)] mb-2">Start a Conversation</h3>
            <p className="text-sm text-[var(--t4)] max-w-sm">
              Have questions about your estate plan, need help with features, or want to provide feedback? We're here to help!
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => {
              const isMe = msg.sender_id === user?.id;
              const isSupport = msg.sender_role === 'admin';
              
              return (
                <div
                  key={msg.id || idx}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] lg:max-w-[60%] rounded-2xl px-4 py-3 ${
                      isMe
                        ? 'bg-[var(--gold)] text-[#1a1a2e]'
                        : 'glass-card'
                    }`}
                  >
                    {!isMe && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-[var(--gn2)]">
                          CarryOn Support
                        </span>
                      </div>
                    )}
                    <p className={`text-sm leading-relaxed ${isMe ? 'text-[#1a1a2e]' : 'text-[var(--t)]'}`}>
                      {msg.content}
                    </p>
                    <p className={`text-xs mt-1 ${isMe ? 'text-[#1a1a2e]/60' : 'text-[var(--t5)]'}`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input */}
      <div className="flex-shrink-0 p-4 border-t border-[var(--b)] bg-[var(--bg)]">
        <form onSubmit={sendMessage} className="flex gap-2">
          <Input
            ref={inputRef}
            className="input-field flex-1"
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={sending}
            data-testid="support-message-input"
          />
          <Button
            type="submit"
            className="gold-button px-4"
            disabled={sending || !newMessage.trim()}
            data-testid="send-support-message-button"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default SupportChatPage;
