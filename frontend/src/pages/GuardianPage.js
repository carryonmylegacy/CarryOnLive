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
  ChevronDown
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
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

// Simple markdown renderer for AI responses
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

const ExportPDFButton = () => {
  const { getAuthHeaders } = useAuth();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const headers = getAuthHeaders()?.headers;
      const estatesRes = await axios.get(`${API_URL}/estates`, { headers });
      if (!estatesRes.data.length) { toast.error('No estate found'); setExporting(false); return; }
      const estateId = estatesRes.data[0].id;
      const res = await axios.get(`${API_URL}/estate/${estateId}/export-pdf`, { headers, responseType: 'blob' });
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

  return (
    <button onClick={handleExport} disabled={exporting}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:opacity-80"
      style={{ background: 'rgba(212,175,55,0.12)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.2)' }}
      data-testid="export-pdf-btn">
      {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
      <span className="hidden sm:inline">Export PDF</span>
    </button>
  );
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
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchEstate();
    setMessages([{
      role: 'assistant',
      content: `Hello ${user?.name?.split(' ')[0] || 'there'}! I'm the Estate Guardian — your AI estate planning specialist.\n\nI can **analyze your Document Vault**, **generate a personalized Action Checklist**, and **evaluate your Estate Readiness Score**.\n\nHow can I help you today?`
    }]);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) el.scrollTop = el.scrollHeight;
    }
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

  const actionButtons = [
    { key: 'analyze_vault', label: 'Analyze Vault', icon: FileSearch, color: '#2563eb' },
    { key: 'generate_checklist', label: 'Generate Checklist', icon: ListChecks, color: '#22c993' },
    { key: 'analyze_readiness', label: 'Analyze Readiness', icon: Gauge, color: '#f59e0b' },
  ];

  return (
    <div className="p-0 lg:p-4 h-[calc(100vh-4rem)] lg:h-screen flex flex-col pt-16 lg:pt-4" data-testid="estate-guardian">
      <SectionLockBanner sectionId="guardian" />

      {/* Minimal Header */}
      <div className="flex items-center justify-between px-4 lg:px-2 py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#d4af37] to-[#fcd34d] flex items-center justify-center shadow-[0_4px_16px_rgba(212,175,55,0.3)]">
            <Bot className="w-4.5 h-4.5 text-[#0b1120]" />
          </div>
          <div>
            <h1 className="text-base lg:text-lg font-bold text-[var(--t)] leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>Estate Guardian</h1>
            <p className="text-[var(--t5)] text-[10px] flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> AI estate specialist
            </p>
          </div>
        </div>
        <ExportPDFButton />
      </div>

      {/* Chat Area — maximized */}
      <div className="flex-1 flex flex-col min-h-0 mx-0 lg:mx-2 rounded-none lg:rounded-2xl overflow-hidden" style={{
        background: 'linear-gradient(180deg, rgba(26,36,64,0.6) 0%, rgba(20,28,51,0.8) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 8px 32px -4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
        <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
          <div className="space-y-3 max-w-3xl mx-auto">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-fade-in`}
                style={{ animationDelay: `${index * 50}ms` }}
                data-testid={`chat-message-${index}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-[var(--gold)]/20 text-[var(--gold)]'
                    : 'bg-gradient-to-br from-[#d4af37] to-[#fcd34d] text-[#0b1120]'
                }`}>
                  {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
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
                        { label: 'Docs', score: msg.readiness.documents.score, color: '#2563eb' },
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

            {loading && (
              <div className="flex gap-2.5 animate-fade-in">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#d4af37] to-[#fcd34d] flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-[#0b1120]" />
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
          </div>
        </ScrollArea>

        {/* Input Area — clean and compact */}
        <div className="px-3 pb-3 pt-2 relative">
          {/* Popover: Helpful Questions */}
          {showQuestions && (
            <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl overflow-hidden animate-fade-in" style={{
              background: 'rgba(20,28,51,0.98)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
            }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-xs font-bold text-[var(--t3)]">Helpful Questions</span>
                <button onClick={() => setShowQuestions(false)} className="text-[var(--t5)] hover:text-[var(--t)]"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
                {suggestedQuestions.map((q, i) => (
                  <button key={i} onClick={() => sendMessage(q)}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-[var(--t3)] hover:bg-[var(--gold)]/10 hover:text-[var(--gold)] transition-colors"
                    data-testid={`suggested-question-${i}`}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Popover: Actions */}
          {showActions && (
            <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl overflow-hidden animate-fade-in" style={{
              background: 'rgba(20,28,51,0.98)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
            }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-xs font-bold text-[var(--t3)]">Guardian Actions</span>
                <button onClick={() => setShowActions(false)} className="text-[var(--t5)] hover:text-[var(--t)]"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="p-2 space-y-1">
                {actionButtons.map(({ key, label, icon: Icon, color }) => (
                  <button key={key} onClick={() => { sendMessage('', key); setShowActions(false); }}
                    disabled={loading}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-[var(--t3)] hover:bg-white/[0.04] transition-colors"
                    data-testid={`guardian-action-${key}`}>
                    {actionLoading === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" style={{ color }} />}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer — minimal */}
          <div className="flex items-center gap-1 justify-center mb-2">
            <Info className="w-2.5 h-2.5 text-[var(--t5)]" />
            <span className="text-[9px] text-[var(--t5)]">Not legal advice. Consult a licensed attorney.</span>
          </div>

          {/* Input Row */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            {/* Quick action buttons */}
            <button type="button" onClick={() => { setShowActions(!showActions); setShowQuestions(false); }}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:scale-105"
              style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)' }}
              title="Guardian Actions"
              data-testid="actions-toggle">
              <Sparkles className="w-4 h-4 text-[#d4af37]" />
            </button>
            <button type="button" onClick={() => { setShowQuestions(!showQuestions); setShowActions(false); }}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:scale-105"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              title="Helpful Questions"
              data-testid="questions-toggle">
              <HelpCircle className="w-4 h-4 text-[var(--t4)]" />
            </button>

            {/* Text input */}
            <div className="flex-1 flex items-center rounded-xl px-3 py-2" style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything..."
                className="flex-1 bg-transparent text-sm text-[var(--t)] placeholder:text-[var(--t5)] outline-none"
                disabled={loading}
                data-testid="guardian-input"
              />
            </div>

            {/* Send button */}
            <Button type="submit" disabled={loading || !input.trim()}
              className="gold-button w-9 h-9 p-0 rounded-xl flex-shrink-0"
              data-testid="guardian-send-button">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default GuardianPage;
