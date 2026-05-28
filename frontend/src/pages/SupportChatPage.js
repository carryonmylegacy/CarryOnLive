import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import {
  MessageCircle, Send, Loader2, Headphones, Plus, ChevronLeft, ArrowLeft,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from '../utils/toast';
import { API_URL } from '../config';

/**
 * CarryOn Customer Support (CCS) — two-pane chat UI modeled on the
 * Estate Comms Tool (ECT).
 *
 * Left pane  : list of topic threads. User can create a new one.
 * Right pane : the active thread's messages + input composer.
 *
 * On mobile the two panes stack: showing the list takes the full screen;
 * opening a thread slides the chat in over it. A back button returns to
 * the list.
 *
 * The acronym is not accidental — "CCS" across from the user in every
 * message bubble keeps it obvious who they're talking to.
 */

const CCS_LABEL = 'CarryOn Customer Support (CCS)';

const SupportChatPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();

  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [activeThreadTitle, setActiveThreadTitle] = useState('');

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [showNewThread, setShowNewThread] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadFirstMsg, setNewThreadFirstMsg] = useState('');
  const [creating, setCreating] = useState(false);

  const [_headerHeight, setHeaderHeight] = useState(56);
  const [emergencySent, setEmergencySent] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const header = document.querySelector('.mobile-header');
    if (header) setHeaderHeight(header.offsetHeight);
  }, []);

  // Auto-trigger P1 emergency if URL has priority=p1 — keeps the original behaviour.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const priority = params.get('priority');
    const reason = params.get('reason');
    if (priority === 'p1' && reason && !emergencySent) {
      (async () => {
        try {
          await apiClient.post(`${API_URL}/support/p1-emergency`, { reason }, getAuthHeaders());
          setEmergencySent(true);
          toast.success('Emergency alert sent to the CarryOn team. Someone will contact you immediately.');
          window.history.replaceState({}, '', window.location.pathname);
          fetchThreads();
          // P1 always lands in the default thread.
          openThread('default', 'Priority 1 Emergency');
        } catch {
          toast.error('Failed to send emergency alert. Please call the number below.');
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await apiClient.get(`${API_URL}/support/threads`, getAuthHeaders());
      setThreads(res.data || []);
    } catch (err) {
      console.error('Error fetching threads', err);
    } finally {
      setThreadsLoading(false);
    }
  }, [getAuthHeaders]);

  const fetchMessages = useCallback(async (threadId) => {
    if (!threadId) return;
    try {
      setMessagesLoading(true);
      const res = await apiClient.get(`${API_URL}/support/messages`, {
        ...getAuthHeaders(),
        params: { thread_id: threadId },
      });
      setMessages(res.data || []);
    } catch (err) {
      console.error('Error fetching messages', err);
    } finally {
      setMessagesLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Poll threads (for unread + new admin replies) + active messages.
  useEffect(() => {
    const interval = setInterval(() => {
      fetchThreads();
      if (activeThreadId) fetchMessages(activeThreadId);
    }, 10000);
    return () => clearInterval(interval);
  }, [activeThreadId, fetchThreads, fetchMessages]);

  useEffect(() => {
    if (activeThreadId) fetchMessages(activeThreadId);
  }, [activeThreadId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openThread = (threadId, title) => {
    setActiveThreadId(threadId);
    setActiveThreadTitle(title);
  };

  const backToList = () => {
    setActiveThreadId(null);
    setActiveThreadTitle('');
    setMessages([]);
    fetchThreads();
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeThreadId) return;
    setSending(true);
    try {
      const res = await apiClient.post(`${API_URL}/support/messages`, {
        content: newMessage.trim(),
        thread_id: activeThreadId,
      }, getAuthHeaders());
      setMessages((prev) => [...prev, res.data]);
      setNewMessage('');
      inputRef.current?.focus();
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const createThread = async (e) => {
    e.preventDefault();
    const title = newThreadTitle.trim();
    const firstMsg = newThreadFirstMsg.trim();
    if (!title || !firstMsg) {
      toast.error('Please add a topic and your first message');
      return;
    }
    setCreating(true);
    try {
      const t = await apiClient.post(`${API_URL}/support/threads`, { title }, getAuthHeaders());
      const threadId = t.data.thread_id;
      await apiClient.post(`${API_URL}/support/messages`, {
        content: firstMsg,
        thread_id: threadId,
      }, getAuthHeaders());
      toast.success('Conversation started');
      setShowNewThread(false);
      setNewThreadTitle('');
      setNewThreadFirstMsg('');
      await fetchThreads();
      openThread(threadId, title);
    } catch {
      toast.error('Failed to start conversation');
    } finally {
      setCreating(false);
    }
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' '
         + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className="fixed inset-0 flex flex-col bg-[var(--bg)] z-10 ccs-root"
      style={{
        // Mirror the ECT top-offset pattern so the platform header AND the
        // red "You're offline" banner both push this page down. Uses
        // `--cy-header-safe-top` so we don't double-count the iOS status
        // bar inset when the offline banner has already absorbed it.
        top: 'calc(var(--cy-header-safe-top, env(safe-area-inset-top, 0px)) + 56px + var(--cy-offline-banner-h, 0px))',
        bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        left: 0,
      }}
      data-testid="support-chat-page"
    >
      <style>{`
        @media (min-width: 1024px) {
          .ccs-root {
            left: var(--sb-offset, var(--sidebar-width, 260px)) !important;
            top: var(--cy-offline-banner-h, 0px) !important;
            bottom: 0 !important;
            flex-direction: row;
          }
          .ccs-list { width: 320px; border-right: 1px solid var(--b); display: flex !important; }
          .ccs-chat { flex: 1 1 auto; display: flex !important; }
        }
        @media (max-width: 1023px) {
          .ccs-list { flex: 1 1 auto; }
        }
      `}</style>

      {/* ───── LEFT PANE: threads list ───── */}
      <div
        className={`ccs-list flex-col ${activeThreadId ? 'hidden lg:flex' : 'flex'}`}
        data-testid="ccs-threads-list"
      >
        <div className="flex-shrink-0 p-4 border-b border-[var(--b)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.15))' }}>
            <Headphones className="w-5 h-5 text-[var(--gn2)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-[var(--t)] truncate" style={{ fontFamily: 'var(--sans)' }}>
              {CCS_LABEL}
            </h1>
            <p className="text-xs text-[var(--t4)]">Topic-based threads — we&rsquo;ll reply within a few hours</p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="hidden lg:flex px-3 py-1.5 rounded-lg text-xs font-bold transition-transform hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
            data-testid="support-back-button"
          >
            Back
          </button>
          <button
            onClick={() => navigate(-1)}
            className="lg:hidden p-2 rounded-lg"
            style={{ background: 'var(--s)' }}
            data-testid="support-back-button-mobile"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--t)]" />
          </button>
        </div>

        <div className="flex-shrink-0 p-3 border-b border-[var(--b)]">
          <Button
            type="button"
            className="gold-button w-full flex items-center justify-center gap-2"
            onClick={() => setShowNewThread(true)}
            data-testid="ccs-new-thread-button"
          >
            <Plus className="w-4 h-4" />
            New conversation
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {threadsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" />
            </div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-6">
              <MessageCircle className="w-10 h-10 text-[var(--t5)] mb-3" />
              <p className="text-sm text-[var(--t4)]">No conversations yet. Tap &ldquo;New conversation&rdquo; to start talking with CCS.</p>
            </div>
          ) : (
            threads.map((t) => {
              const isActive = t.thread_id === activeThreadId;
              return (
                <button
                  key={t.thread_id}
                  onClick={() => openThread(t.thread_id, t.title)}
                  className={`w-full text-left p-4 border-b border-[var(--b)] transition-colors ${isActive ? 'bg-[var(--s)]' : 'hover:bg-[var(--s)]'}`}
                  data-testid={`ccs-thread-${t.thread_id}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-[var(--t)] truncate">{t.title}</h3>
                    {t.unread_count > 0 && (
                      <span className="flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: '#d4af37', color: '#080e1a' }}>
                        {t.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--t4)] truncate">
                    <span className="font-medium">
                      {t.latest_sender_role === 'admin' ? 'CCS: ' : 'You: '}
                    </span>
                    {t.latest_message}
                  </p>
                  <p className="text-[11px] text-[var(--t5)] mt-1">{formatTime(t.latest_time)}</p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ───── RIGHT PANE: active thread ───── */}
      <div
        className={`ccs-chat flex-col ${activeThreadId ? 'flex' : 'hidden lg:flex'}`}
        data-testid="ccs-chat-pane"
      >
        {activeThreadId ? (
          <>
            {/* Thread header */}
            <div className="flex-shrink-0 p-4 border-b border-[var(--b)] flex items-center gap-3 bg-[var(--bg)]">
              <button
                onClick={backToList}
                className="lg:hidden p-2 -ml-2 rounded-lg"
                data-testid="ccs-thread-back"
                aria-label="Back to list"
              >
                <ChevronLeft className="w-5 h-5 text-[var(--t)]" />
              </button>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                   style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.15))' }}>
                <Headphones className="w-5 h-5 text-[var(--gn2)]" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-[var(--t)] truncate">{activeThreadTitle}</h2>
                <p className="text-xs text-[var(--t5)]">with {CCS_LABEL}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--bg2)]">
              {messagesLoading && messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--gold)]" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-center px-4">
                  <p className="text-sm text-[var(--t4)]">No messages yet in this thread.</p>
                </div>
              ) : (
                <>
                  {messages.map((msg, idx) => {
                    const isMe = msg.sender_id === user?.id;
                    return (
                      <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] lg:max-w-[60%] rounded-2xl px-4 py-3 ${isMe ? 'bg-[var(--gold)] text-[#1a1a2e]' : 'glass-card'}`}>
                          {!isMe && (
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-[var(--gn2)]">CCS</span>
                            </div>
                          )}
                          <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isMe ? 'text-[#1a1a2e]' : 'text-[var(--t)]'}`}>
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

            {/* Composer */}
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
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </Button>
              </form>
            </div>
          </>
        ) : (
          // Desktop empty-state
          <div className="hidden lg:flex flex-col items-center justify-center h-full text-center p-8">
            <MessageCircle className="w-14 h-14 text-[var(--t5)] mb-4" />
            <h3 className="text-lg font-bold text-[var(--t)] mb-2">Pick a conversation</h3>
            <p className="text-sm text-[var(--t4)] max-w-sm">
              Select a topic on the left to continue chatting, or tap &ldquo;New conversation&rdquo; to start a fresh one with {CCS_LABEL}.
            </p>
          </div>
        )}
      </div>

      {/* New-thread dialog */}
      {showNewThread && (
        <div
          className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center bg-black/60"
          onClick={() => !creating && setShowNewThread(false)}
          data-testid="ccs-new-thread-modal"
        >
          <div
            className="w-full lg:max-w-md lg:rounded-2xl rounded-t-2xl p-5 space-y-4"
            style={{ background: 'var(--bg)', border: '1px solid var(--b)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-[var(--t)]">Start a new conversation</h3>
            <form onSubmit={createThread} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--t4)] mb-1 block">
                  Topic
                </label>
                <Input
                  className="input-field"
                  placeholder="Billing question, feature request, bug report…"
                  value={newThreadTitle}
                  onChange={(e) => setNewThreadTitle(e.target.value)}
                  maxLength={120}
                  disabled={creating}
                  data-testid="ccs-new-thread-title"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--t4)] mb-1 block">
                  Your first message
                </label>
                <textarea
                  className="input-field w-full min-h-[110px] resize-y"
                  placeholder="Tell CCS what you need help with…"
                  value={newThreadFirstMsg}
                  onChange={(e) => setNewThreadFirstMsg(e.target.value)}
                  disabled={creating}
                  data-testid="ccs-new-thread-message"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  className="flex-1"
                  variant="outline"
                  onClick={() => setShowNewThread(false)}
                  disabled={creating}
                  data-testid="ccs-new-thread-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="gold-button flex-1"
                  disabled={creating || !newThreadTitle.trim() || !newThreadFirstMsg.trim()}
                  data-testid="ccs-new-thread-submit"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start conversation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportChatPage;
