import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Bot,
  Send,
  User,
  Loader2,
  Sparkles,
  FileSearch,
  ListChecks,
  Gauge,
  CheckCircle2,
  HelpCircle,
  X,
  FileDown,
  Info,
  ArrowLeft,
  MessageSquare,
  Plus,
  Trash2,
  Clock,
  Shield,
  Lock
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { SectionLockBanner } from '../components/security/SectionLock';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const suggestedQuestions = [
  "What documents am I missing for a complete estate plan?",
  "What are my state's probate requirements?",
  "How do I protect my assets for my children?",
  "Review my estate for any legal gaps",
  "What is the difference between a will and a trust?",
];

// ─── Markdown Renderer ───
const MarkdownText = ({ content }) => {
  const lines = content.split('\n');
  const elements = [];
  let inList = false;
  let listItems = [];

  const flushList = (key) => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${key}`} className="list-disc list-inside space-y-1 my-2 ml-2">
          {listItems.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed">{formatInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  const formatInline = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-[var(--t)]">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ')) {
      flushList(i);
      elements.push(<h4 key={i} className="font-bold text-[var(--t)] mt-3 mb-1 text-sm">{formatInline(trimmed.slice(4))}</h4>);
    } else if (trimmed.startsWith('## ')) {
      flushList(i);
      elements.push(<h3 key={i} className="font-bold text-[var(--t)] mt-4 mb-1 text-base">{formatInline(trimmed.slice(3))}</h3>);
    } else if (trimmed.startsWith('# ')) {
      flushList(i);
      elements.push(<h2 key={i} className="font-bold text-[var(--t)] mt-4 mb-2 text-lg">{formatInline(trimmed.slice(2))}</h2>);
    } else if (/^\d+[\.\)]\s/.test(trimmed)) {
      flushList(i);
      const text = trimmed.replace(/^\d+[\.\)]\s/, '');
      elements.push(
        <div key={i} className="flex gap-2 my-1 ml-2">
          <span className="text-[var(--gold)] font-bold text-sm flex-shrink-0">{trimmed.match(/^\d+/)[0]}.</span>
          <span className="text-sm leading-relaxed">{formatInline(text)}</span>
        </div>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList = true;
      listItems.push(trimmed.slice(2));
    } else if (trimmed === '') {
      flushList(i);
      elements.push(<div key={i} className="h-2" />);
    } else {
      flushList(i);
      elements.push(<p key={i} className="text-sm leading-relaxed my-1">{formatInline(trimmed)}</p>);
    }
  });

  flushList('end');
  return <div>{elements}</div>;
};

// ─── Time Ago Helper ───
const timeAgo = (dateStr) => {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ─── Action Buttons Config ───
const actionButtons = [
  { key: 'analyze_vault', label: 'Analyze Vault', icon: FileSearch, color: '#3B7BF7' },
  { key: 'generate_checklist', label: 'Generate Checklist', icon: ListChecks, color: '#22C993' },
  { key: 'analyze_readiness', label: 'Readiness Score', icon: Gauge, color: '#F5A623' },
];

// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════
const GuardianPage = () => {
  const { user, getAuthHeaders } = useAuth();

  // View state: 'landing' or 'chat'
  const [view, setView] = useState('landing');

  // Landing state
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [landingInput, setLandingInput] = useState('');

  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [estateId, setEstateId] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [exporting, setExporting] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const landingInputRef = useRef(null);

  // ─── Data Fetching ───
  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/chat/sessions`, getAuthHeaders());
      setSessions(res.data);
    } catch (err) { /* silent */ }
    finally { setSessionsLoading(false); }
  }, [getAuthHeaders]);

  const fetchEstate = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      if (res.data.length > 0) {
        const savedId = localStorage.getItem('selected_estate_id');
        const estate = res.data.find(e => e.id === savedId) || res.data[0];
        setEstateId(estate.id);
      }
    } catch (err) { /* silent */ }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchSessions();
    fetchEstate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ─── Chat Actions ───
  const startNewChat = (initialMessage = null) => {
    const newId = `chat_${user?.id || 'anon'}_${Date.now().toString(36)}`;
    setSessionId(newId);
    setMessages([{
      role: 'assistant',
      content: `Hello ${user?.name?.split(' ')[0] || 'there'}! I'm the Estate Guardian — your AI estate planning specialist.\n\nI can **analyze your Document Vault**, **generate a personalized Action Checklist**, and **evaluate your Estate Readiness Score**.\n\nHow can I help you today?`
    }]);
    setView('chat');
    setLandingInput('');
    if (initialMessage) {
      setTimeout(() => sendMessage(initialMessage, null, newId), 100);
    }
  };

  const resumeSession = async (sid) => {
    setSessionId(sid);
    setView('chat');
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/chat/history/${sid}`, getAuthHeaders());
      const history = res.data.map(m => ({ role: m.role, content: m.content }));
      setMessages(history.length > 0 ? history : [{
        role: 'assistant',
        content: `Hello ${user?.name?.split(' ')[0] || 'there'}! Resuming our conversation...`
      }]);
    } catch (err) {
      setMessages([{ role: 'assistant', content: 'Could not load conversation history.' }]);
    }
    finally { setLoading(false); }
  };

  const deleteSession = async (e, sid) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API_URL}/chat/sessions/${sid}`, getAuthHeaders());
      setSessions(prev => prev.filter(s => s.session_id !== sid));
      toast.success('Conversation deleted');
    } catch (err) { toast.error('Failed to delete'); }
  };

  const goBackToLanding = () => {
    setView('landing');
    setSessionId(null);
    setMessages([]);
    setShowQuestions(false);
    setShowActions(false);
    fetchSessions();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const headers = getAuthHeaders()?.headers;
      const estatesRes = await axios.get(`${API_URL}/estates`, { headers });
      if (!estatesRes.data.length) { toast.error('No estate found'); setExporting(false); return; }
      const eId = estatesRes.data[0].id;
      const res = await axios.get(`${API_URL}/estate/${eId}/export-pdf`, { headers, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `CarryOn_Estate_Plan_${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Estate Plan PDF downloaded');
    } catch (err) { toast.error('Failed to export PDF'); }
    setExporting(false);
  };

  const sendMessage = async (messageText, action = null, overrideSessionId = null) => {
    if (!messageText?.trim() && !action) return;
    setShowQuestions(false);
    setShowActions(false);

    const activeSessionId = overrideSessionId || sessionId;

    const displayText = action
      ? { analyze_vault: 'Analyze my Document Vault', generate_checklist: 'Generate my Action Checklist', analyze_readiness: 'Analyze my Estate Readiness Score' }[action] || messageText
      : messageText;

    setMessages(prev => [...prev, { role: 'user', content: displayText }]);
    setInput('');
    if (action) setActionLoading(action);
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/chat/guardian`, {
        message: messageText || displayText,
        session_id: activeSessionId,
        estate_id: estateId,
        action
      }, { ...getAuthHeaders(), timeout: 120000 });

      if (!overrideSessionId) setSessionId(response.data.session_id);
      const assistantMsg = { role: 'assistant', content: response.data.response };

      if (response.data.action_result) {
        const result = response.data.action_result;
        if (result.action === 'checklist_generated') {
          assistantMsg.actionBadge = `${result.items_added} checklist items added`;
          toast.success(`${result.items_added} checklist items generated!`);
        } else if (result.action === 'readiness_analyzed' && result.readiness) {
          assistantMsg.readiness = result.readiness;
        }
      }
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      toast.error('Failed to get response');
      setMessages(prev => [...prev, { role: 'assistant', content: 'I encountered an issue. Please try again.' }]);
    } finally {
      setLoading(false);
      setActionLoading(null);
    }
  };

  const handleChatSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleLandingSubmit = (e) => {
    e.preventDefault();
    if (!landingInput.trim()) return;
    startNewChat(landingInput.trim());
  };

  const hasConversation = messages.length > 1;

  // ═══════════════════════════════════════════════
  // LANDING VIEW
  // ═══════════════════════════════════════════════
  if (view === 'landing') {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] lg:h-screen pt-16 lg:pt-0" data-testid="estate-guardian">
        <SectionLockBanner sectionId="guardian" />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 pt-8 pb-24 lg:pb-8">
            {/* Hero Section */}
            <div className="text-center mb-8">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 rounded-2xl" style={{
                  background: 'linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%)',
                  border: '2px solid rgba(212,175,55,0.3)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
                }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Bot className="w-7 h-7 text-[var(--gold)]" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{
                  background: 'linear-gradient(135deg, #22C993, #16a34a)',
                  boxShadow: '0 2px 6px rgba(34,201,147,0.4)',
                }}>
                  <Lock className="w-2.5 h-2.5 text-white" />
                </div>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="guardian-hero-title">
                Estate Guardian
              </h1>
              <p className="text-sm text-[var(--t4)] max-w-md mx-auto mb-4">
                Your AI estate planning specialist — living inside your encrypted vault, trained in the estate law of all 50 U.S. states.
              </p>
              {/* Security Badges */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <span className="flex items-center gap-1.5 text-[10px] text-[var(--t5)] px-2.5 py-1 rounded-full" style={{ background: 'rgba(34,201,147,0.08)', border: '1px solid rgba(34,201,147,0.15)' }}>
                  <Shield className="w-2.5 h-2.5 text-[#22C993]" /> AES-256 Encrypted
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-[var(--t5)] px-2.5 py-1 rounded-full" style={{ background: 'rgba(59,123,247,0.08)', border: '1px solid rgba(59,123,247,0.15)' }}>
                  <Lock className="w-2.5 h-2.5 text-[#3B7BF7]" /> Zero-Knowledge Vault
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-[var(--t5)] px-2.5 py-1 rounded-full" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)' }}>
                  <Shield className="w-2.5 h-2.5 text-[var(--gold)]" /> SOC 2 Compliant
                </span>
              </div>
            </div>

            {/* Ask Anything Input */}
            <form onSubmit={handleLandingSubmit} className="mb-8">
              <div className="flex items-center gap-2 p-2 rounded-2xl" style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 4px 24px -4px rgba(0,0,0,0.3)',
              }}>
                <input
                  ref={landingInputRef}
                  value={landingInput}
                  onChange={(e) => setLandingInput(e.target.value)}
                  placeholder="Ask anything about your estate plan..."
                  className="flex-1 bg-transparent text-sm text-[var(--t)] placeholder:text-[var(--t5)] outline-none px-3 py-2.5"
                  data-testid="landing-input"
                />
                <Button type="submit" disabled={!landingInput.trim()}
                  className="gold-button h-10 w-10 p-0 rounded-xl flex-shrink-0"
                  data-testid="landing-send-button">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </form>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2 justify-center mb-8">
              {actionButtons.map(({ key, label, icon: Icon, color }) => (
                <button key={key} onClick={() => { startNewChat(); setTimeout(() => sendMessage('', key, `chat_${user?.id || 'anon'}_${Date.now().toString(36)}`), 200); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{ background: `${color}12`, border: `1px solid ${color}25`, color }}
                  data-testid={`landing-action-${key}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Recent Sessions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-[var(--t4)] uppercase tracking-wider">Recent Conversations</h2>
                <button onClick={() => startNewChat()} className="flex items-center gap-1.5 text-xs font-bold text-[var(--gold)] hover:text-[var(--gold2)] transition-colors" data-testid="new-chat-btn">
                  <Plus className="w-3.5 h-3.5" /> New Chat
                </button>
              </div>

              {sessionsLoading ? (
                <div className="flex items-center justify-center py-8 text-[var(--t5)]">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-10">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 text-[var(--t5)] opacity-40" />
                  <p className="text-sm text-[var(--t5)]">No conversations yet</p>
                  <p className="text-xs text-[var(--t5)] mt-1">Start a new chat above to get started</p>
                </div>
              ) : (
                <div className="space-y-1.5" data-testid="session-list">
                  {sessions.map((s) => (
                    <div
                      key={s.session_id}
                      onClick={() => resumeSession(s.session_id)}
                      role="button"
                      tabIndex={0}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:bg-white/[0.04] group cursor-pointer"
                      style={{ border: '1px solid rgba(255,255,255,0.05)' }}
                      data-testid={`session-${s.session_id}`}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.12)' }}>
                        <MessageSquare className="w-3.5 h-3.5 text-[var(--gold)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--t2)] truncate">{s.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-[var(--t5)] flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" /> {timeAgo(s.last_message_at)}
                          </span>
                          <span className="text-[10px] text-[var(--t5)]">{s.message_count} msgs</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => deleteSession(e, s.session_id)}
                        className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--t5)] hover:text-red-400 hover:bg-red-400/10 transition-all flex-shrink-0"
                        data-testid={`delete-session-${s.session_id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Legal Disclaimer */}
            <div className="mt-8 p-3 rounded-xl text-center" style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.1)' }}>
              <p className="text-[10px] text-[var(--t5)] leading-relaxed">
                <strong className="text-[var(--gold)]">Not Legal Advice</strong> — Estate Guardian is an AI assistant, not a licensed attorney. For legally binding decisions, always consult a bar-certified attorney licensed in your jurisdiction. Your documents are analyzed within the encrypted vault and are never shared externally.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // CHAT VIEW
  // ═══════════════════════════════════════════════
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] lg:h-screen pt-16 lg:pt-0" data-testid="estate-guardian">
      <SectionLockBanner sectionId="guardian" />

      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div className="flex items-center gap-2">
          <button onClick={goBackToLanding}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]"
            data-testid="back-to-landing-btn">
            <ArrowLeft className="w-4 h-4 text-[var(--t3)]" />
          </button>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #d4af37 0%, #fcd34d 100%)', boxShadow: '0 2px 8px rgba(212,175,55,0.3)' }}>
            <Bot className="w-4 h-4 text-[#0b1120]" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-[var(--t)] leading-none" style={{ fontFamily: 'Outfit, sans-serif' }}>Estate Guardian</h1>
            <span className="text-[var(--t5)] text-[10px]">AI estate specialist</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => startNewChat()} title="New Chat"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]"
            data-testid="chat-new-btn">
            <Plus className="w-3.5 h-3.5 text-[var(--t4)]" />
          </button>
          <button onClick={handleExport} disabled={exporting} title="Export PDF"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]"
            style={{ color: '#d4af37' }}
            data-testid="export-pdf-btn">
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0" data-testid="chat-messages-area">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              style={{ animation: 'fadeIn 0.3s ease-out forwards', animationDelay: `${Math.min(index, 3) * 40}ms` }}
              data-testid={`chat-message-${index}`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                msg.role === 'user' ? 'bg-[var(--gold)]/20 text-[var(--gold)]' : ''
              }`} style={msg.role === 'assistant' ? { background: 'linear-gradient(135deg, #d4af37 0%, #fcd34d 100%)', color: '#0b1120' } : {}}>
                {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>
              <div className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                msg.role === 'user' ? 'bg-[var(--gold)] text-[#0b1120] rounded-tr-md' : 'text-[var(--t2)] rounded-tl-md'
              }`} style={msg.role === 'assistant' ? { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' } : {}}>
                {msg.role === 'assistant' ? <MarkdownText content={msg.content} /> : <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                {msg.actionBadge && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#22c993]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {msg.actionBadge}
                  </div>
                )}
                {msg.readiness && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      { label: 'Docs', score: msg.readiness.documents.score, color: '#3B7BF7' },
                      { label: 'Messages', score: msg.readiness.messages.score, color: '#8b5cf6' },
                      { label: 'Checklist', score: msg.readiness.checklist.score, color: '#f97316' },
                    ].map(({ label, score, color }) => (
                      <div key={label} className="rounded-lg p-2 text-center" style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
                        <div className="text-lg font-bold" style={{ color }}>{score}%</div>
                        <div className="text-[10px] text-[var(--t4)]">{label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Welcome chips — only before first user message */}
          {!hasConversation && !loading && (
            <div className="pt-2 space-y-3" data-testid="welcome-actions">
              <div className="flex flex-wrap gap-2 justify-center">
                {actionButtons.map(({ key, label, icon: Icon, color }) => (
                  <button key={key} onClick={() => sendMessage('', key)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: `${color}12`, border: `1px solid ${color}25`, color }}
                    data-testid={`guardian-action-${key}`}>
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestedQuestions.slice(0, 3).map((q, i) => (
                  <button key={i} onClick={() => sendMessage(q)}
                    className="px-3 py-2 rounded-xl text-xs text-[var(--t4)] transition-all hover:text-[var(--gold)] hover:bg-[var(--gold)]/5"
                    style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                    data-testid={`suggested-question-${i}`}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #d4af37 0%, #fcd34d 100%)', color: '#0b1120' }}>
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="rounded-2xl rounded-tl-md px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2 text-[var(--t4)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">
                    {actionLoading === 'analyze_vault' ? 'Analyzing vault...' :
                     actionLoading === 'generate_checklist' ? 'Generating checklist...' :
                     actionLoading === 'analyze_readiness' ? 'Analyzing readiness...' : 'Thinking...'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2 relative" style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        background: 'linear-gradient(180deg, transparent 0%, rgba(15,22,41,0.5) 100%)',
      }}>
        {showQuestions && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl overflow-hidden z-10" style={{
            background: 'rgba(20,28,51,0.98)', border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)',
          }} data-testid="questions-popover">
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-xs font-bold text-[var(--t3)]">Helpful Questions</span>
              <button onClick={() => setShowQuestions(false)} className="text-[var(--t5)] hover:text-[var(--t)]"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-2 space-y-0.5">
              {suggestedQuestions.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs text-[var(--t3)] hover:bg-[var(--gold)]/10 hover:text-[var(--gold)] transition-colors"
                  data-testid={`suggested-question-popover-${i}`}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {showActions && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl overflow-hidden z-10" style={{
            background: 'rgba(20,28,51,0.98)', border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)',
          }} data-testid="actions-popover">
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-xs font-bold text-[var(--t3)]">Guardian Actions</span>
              <button onClick={() => setShowActions(false)} className="text-[var(--t5)] hover:text-[var(--t)]"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-2 space-y-0.5">
              {actionButtons.map(({ key, label, icon: Icon, color }) => (
                <button key={key} onClick={() => { sendMessage('', key); setShowActions(false); }}
                  disabled={loading}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-[var(--t3)] hover:bg-white/[0.04] transition-colors"
                  data-testid={`guardian-action-popover-${key}`}>
                  {actionLoading === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" style={{ color }} />}
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 justify-center mb-1.5">
          <Info className="w-2.5 h-2.5 text-[var(--t5)]" />
          <span className="text-[9px] text-[var(--t5)]">Not legal advice. Consult a licensed attorney.</span>
        </div>

        <form onSubmit={handleChatSubmit} className="flex items-center gap-2 max-w-3xl mx-auto">
          {hasConversation && (
            <>
              <button type="button" onClick={() => { setShowActions(!showActions); setShowQuestions(false); }}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:scale-105"
                style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.15)' }}
                data-testid="actions-toggle">
                <Sparkles className="w-4 h-4 text-[#d4af37]" />
              </button>
              <button type="button" onClick={() => { setShowQuestions(!showQuestions); setShowActions(false); }}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:scale-105"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                data-testid="questions-toggle">
                <HelpCircle className="w-4 h-4 text-[var(--t4)]" />
              </button>
            </>
          )}
          <div className="flex-1 flex items-center rounded-xl px-3 py-2.5" style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your estate plan..."
              className="flex-1 bg-transparent text-sm text-[var(--t)] placeholder:text-[var(--t5)] outline-none"
              disabled={loading}
              data-testid="guardian-input"
            />
          </div>
          <Button type="submit" disabled={loading || !input.trim()}
            className="gold-button w-9 h-9 p-0 rounded-xl flex-shrink-0"
            data-testid="guardian-send-button">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default GuardianPage;
