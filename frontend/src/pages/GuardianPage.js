import React, { useState, useEffect, useRef } from 'react';
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
  RotateCcw
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

const GuardianPage = () => {
  const { user, getAuthHeaders } = useAuth();
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

  useEffect(() => {
    fetchEstate();
    setMessages([{
      role: 'assistant',
      content: `Hello ${user?.name?.split(' ')[0] || 'there'}! I'm the Estate Guardian — your AI estate planning specialist.\n\nI can **analyze your Document Vault**, **generate a personalized Action Checklist**, and **evaluate your Estate Readiness Score**.\n\nHow can I help you today?`
    }]);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const fetchEstate = async () => {
    try {
      const res = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      if (res.data.length > 0) {
        const savedId = localStorage.getItem('selected_estate_id');
        const estate = res.data.find(e => e.id === savedId) || res.data[0];
        setEstateId(estate.id);
      }
    } catch (err) { /* silent */ }
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

  const sendMessage = async (messageText, action = null) => {
    if (!messageText.trim() && !action) return;
    setShowQuestions(false);
    setShowActions(false);

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
        session_id: sessionId,
        estate_id: estateId,
        action
      }, { ...getAuthHeaders(), timeout: 120000 });

      setSessionId(response.data.session_id);
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

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleNewChat = () => {
    setSessionId(null);
    setMessages([{
      role: 'assistant',
      content: `Hello ${user?.name?.split(' ')[0] || 'there'}! I'm the Estate Guardian — your AI estate planning specialist.\n\nI can **analyze your Document Vault**, **generate a personalized Action Checklist**, and **evaluate your Estate Readiness Score**.\n\nHow can I help you today?`
    }]);
  };

  const actionButtons = [
    { key: 'analyze_vault', label: 'Analyze Vault', icon: FileSearch, color: '#3B7BF7' },
    { key: 'generate_checklist', label: 'Generate Checklist', icon: ListChecks, color: '#22C993' },
    { key: 'analyze_readiness', label: 'Readiness Score', icon: Gauge, color: '#F5A623' },
  ];

  const hasConversation = messages.length > 1;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] lg:h-screen pt-16 lg:pt-0" data-testid="estate-guardian">
      <SectionLockBanner sectionId="guardian" />

      {/* Compact Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div className="flex items-center gap-2.5">
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
          <button onClick={handleNewChat} title="New Chat"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]"
            data-testid="new-chat-btn">
            <RotateCcw className="w-3.5 h-3.5 text-[var(--t4)]" />
          </button>
          <button onClick={handleExport} disabled={exporting} title="Export PDF"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]"
            style={{ color: '#d4af37' }}
            data-testid="export-pdf-btn">
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Messages Area — fills all available space */}
      <div className="flex-1 overflow-y-auto min-h-0" data-testid="chat-messages-area">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              style={{ animation: 'fadeIn 0.3s ease-out forwards', animationDelay: `${index * 40}ms` }}
              data-testid={`chat-message-${index}`}
            >
              {/* Avatar */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                msg.role === 'user'
                  ? 'bg-[var(--gold)]/20 text-[var(--gold)]'
                  : ''
              }`} style={msg.role === 'assistant' ? {
                background: 'linear-gradient(135deg, #d4af37 0%, #fcd34d 100%)',
                color: '#0b1120'
              } : {}}>
                {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              {/* Bubble */}
              <div className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-[var(--gold)] text-[#0b1120] rounded-tr-md'
                  : 'text-[var(--t2)] rounded-tl-md'
              }`} style={msg.role === 'assistant' ? {
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
              } : {}}>
                {msg.role === 'assistant' ? (
                  <MarkdownText content={msg.content} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
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

          {/* Welcome Actions — only shown when no conversation yet */}
          {!hasConversation && !loading && (
            <div className="pt-2 space-y-3" data-testid="welcome-actions">
              {/* Quick Action Chips */}
              <div className="flex flex-wrap gap-2 justify-center">
                {actionButtons.map(({ key, label, icon: Icon, color }) => (
                  <button key={key} onClick={() => sendMessage('', key)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: `${color}12`,
                      border: `1px solid ${color}25`,
                      color: color,
                    }}
                    data-testid={`guardian-action-${key}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              {/* Suggested Questions */}
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

          {/* Loading indicator */}
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

      {/* Input Area — pinned to bottom */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2 relative" style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        background: 'linear-gradient(180deg, transparent 0%, rgba(15,22,41,0.5) 100%)',
      }}>
        {/* Popovers */}
        {showQuestions && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl overflow-hidden z-10" style={{
            background: 'rgba(20,28,51,0.98)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(12px)',
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
            background: 'rgba(20,28,51,0.98)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(12px)',
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

        {/* Disclaimer */}
        <div className="flex items-center gap-1 justify-center mb-1.5">
          <Info className="w-2.5 h-2.5 text-[var(--t5)]" />
          <span className="text-[9px] text-[var(--t5)]">Not legal advice. Consult a licensed attorney.</span>
        </div>

        {/* Input Row */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-3xl mx-auto">
          {hasConversation && (
            <>
              <button type="button" onClick={() => { setShowActions(!showActions); setShowQuestions(false); }}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:scale-105"
                style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.15)' }}
                title="Guardian Actions"
                data-testid="actions-toggle">
                <Sparkles className="w-4 h-4 text-[#d4af37]" />
              </button>
              <button type="button" onClick={() => { setShowQuestions(!showQuestions); setShowActions(false); }}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:scale-105"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                title="Helpful Questions"
                data-testid="questions-toggle">
                <HelpCircle className="w-4 h-4 text-[var(--t4)]" />
              </button>
            </>
          )}

          <div className="flex-1 flex items-center rounded-xl px-3 py-2.5" style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
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

      {/* Inline animation keyframe */}
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
