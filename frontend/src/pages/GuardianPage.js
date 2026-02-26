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
  CheckCircle2
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
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
    // Bold
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

    // Headers
    if (trimmed.startsWith('### ')) {
      flushList(i);
      elements.push(<h4 key={i} className="font-bold text-[var(--t)] mt-3 mb-1 text-sm">{formatInline(trimmed.slice(4))}</h4>);
    } else if (trimmed.startsWith('## ')) {
      flushList(i);
      elements.push(<h3 key={i} className="font-bold text-[var(--t)] mt-4 mb-1 text-base">{formatInline(trimmed.slice(3))}</h3>);
    } else if (trimmed.startsWith('# ')) {
      flushList(i);
      elements.push(<h2 key={i} className="font-bold text-[var(--t)] mt-4 mb-2 text-lg">{formatInline(trimmed.slice(2))}</h2>);
    }
    // Numbered lists
    else if (/^\d+[\.\)]\s/.test(trimmed)) {
      flushList(i);
      const text = trimmed.replace(/^\d+[\.\)]\s/, '');
      elements.push(
        <div key={i} className="flex gap-2 my-1 ml-2">
          <span className="text-[var(--gold)] font-bold text-sm flex-shrink-0">{trimmed.match(/^\d+/)[0]}.</span>
          <span className="text-sm leading-relaxed">{formatInline(text)}</span>
        </div>
      );
    }
    // Bullet lists
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList = true;
      listItems.push(trimmed.slice(2));
    }
    // Empty lines
    else if (trimmed === '') {
      flushList(i);
      elements.push(<div key={i} className="h-2" />);
    }
    // Regular paragraphs
    else {
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
  const scrollRef = useRef(null);

  useEffect(() => {
    fetchEstate();
    setMessages([{
      role: 'assistant',
      content: `Hello ${user?.name?.split(' ')[0] || 'there'}! I'm the Estate Guardian — your AI estate planning specialist with expertise in the estate laws of all 50 states.\n\nI can **analyze your Document Vault**, **generate a personalized Immediate Action Checklist**, and **evaluate your Estate Readiness Score** with specific recommendations.\n\nUse the action buttons below or just ask me anything about your estate plan.`
    }]);
  }, [user]);

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
    } catch (err) { console.error('Estate fetch error:', err); }
  };

  const sendMessage = async (messageText, action = null) => {
    if (!messageText.trim() && !action) return;

    const displayText = action
      ? { analyze_vault: 'Analyze my Document Vault', generate_checklist: 'Generate my Immediate Action Checklist', analyze_readiness: 'Analyze my Estate Readiness Score' }[action] || messageText
      : messageText;

    const userMessage = { role: 'user', content: displayText };
    setMessages(prev => [...prev, userMessage]);
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

      // Handle action results
      if (response.data.action_result) {
        const result = response.data.action_result;
        if (result.action === 'checklist_generated') {
          assistantMsg.actionBadge = `${result.items_added} checklist items added`;
          toast.success(`${result.items_added} checklist items generated and added!`);
        } else if (result.action === 'readiness_analyzed' && result.readiness) {
          assistantMsg.readiness = result.readiness;
        }
      }

      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Failed to get response. Please try again.');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I encountered an issue connecting to the AI service. Please try again in a moment.'
      }]);
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
    <div className="p-4 lg:p-6 h-[calc(100vh-4rem)] lg:h-screen flex flex-col animate-fade-in pt-20 lg:pt-6" data-testid="estate-guardian">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#d4af37] to-[#fcd34d] flex items-center justify-center gold-glow">
            <Bot className="w-6 h-6 text-[#0b1120]" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Estate Guardian
            </h1>
            <p className="text-[var(--t4)] text-sm flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              AI estate law specialist — all 50 states
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mb-3">
        {actionButtons.map(({ key, label, icon: Icon, color }) => (
          <Button
            key={key}
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => sendMessage('', key)}
            className="border-white/10 text-[var(--t3)] hover:text-[var(--t)] transition-all text-xs lg:text-sm"
            style={{ borderColor: color + '40' }}
            data-testid={`guardian-action-${key}`}
          >
            {actionLoading === key ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Icon className="w-4 h-4 mr-1.5" style={{ color }} />
            )}
            {label}
          </Button>
        ))}
      </div>

      {/* Legal Disclaimer */}
      <div className="rounded-xl p-3 mb-1" style={{ background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.15)' }}>
        <div className="text-xs font-bold text-[#F5A623] mb-1">Legal Disclaimer</div>
        <div className="text-xs text-[var(--t4)] leading-relaxed">
          By using Estate Guardian, you acknowledge that CarryOn™ maintains a strict policy against the Unauthorized Practice of Law (UPL). Estate Guardian does not provide legal advice. All analysis, recommendations, and action items are intended as informational starting points only. You are solely responsible for consulting with licensed attorneys, financial advisors, or other qualified professionals before acting on any information provided here.
        </div>
      </div>

      {/* Chat Container */}
      <Card className="glass-card flex-1 flex flex-col overflow-hidden min-h-0">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                data-testid={`chat-message-${index}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-[var(--gold)]/20 text-[var(--gold)]'
                    : 'bg-gradient-to-br from-[#d4af37] to-[#fcd34d] text-[#0b1120]'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-[var(--gold)] text-[#0b1120]'
                    : 'bg-[var(--s)] text-[var(--t2)]'
                }`}>
                  {msg.role === 'assistant' ? (
                    <MarkdownText content={msg.content} />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                  {msg.actionBadge && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#22c993]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {msg.actionBadge}
                    </div>
                  )}
                  {msg.readiness && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[
                        { label: 'Docs', score: msg.readiness.documents.score, color: '#2563eb' },
                        { label: 'Messages', score: msg.readiness.messages.score, color: '#8b5cf6' },
                        { label: 'Checklist', score: msg.readiness.checklist.score, color: '#f97316' },
                      ].map(({ label, score, color }) => (
                        <div key={label} className="bg-[var(--b)] rounded-lg p-2 text-center">
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
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#d4af37] to-[#fcd34d] flex items-center justify-center">
                  <Bot className="w-4 h-4 text-[#0b1120]" />
                </div>
                <div className="bg-[var(--s)] rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 text-[var(--t4)]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">
                      {actionLoading === 'analyze_vault' ? 'Analyzing vault documents...' :
                       actionLoading === 'generate_checklist' ? 'Generating checklist items...' :
                       actionLoading === 'analyze_readiness' ? 'Analyzing readiness score...' :
                       'Thinking...'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Suggested Questions */}
        {messages.length <= 1 && (
          <div className="px-4 pb-2">
            <p className="text-[var(--t5)] text-xs mb-2">Suggested questions:</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((q, index) => (
                <button
                  key={index}
                  onClick={() => sendMessage(q)}
                  className="text-xs px-3 py-1.5 rounded-full bg-[var(--s)] text-[var(--t4)] hover:bg-[var(--s)]/80 hover:text-[var(--t)] transition-colors"
                  data-testid={`suggested-question-${index}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-white/5">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about estate law, your documents, or get recommendations..."
              className="input-field flex-1"
              disabled={loading}
              data-testid="guardian-input"
            />
            <Button
              type="submit"
              disabled={loading || !input.trim()}
              className="gold-button px-4"
              data-testid="guardian-send-button"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
};

export default GuardianPage;
