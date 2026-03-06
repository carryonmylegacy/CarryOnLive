import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { ReturnPopup } from '../components/GuidedActivation';
import {
  Send,
  User,
  Users,
  Loader2,
  Sparkles,
  ArrowUp,
  StopCircle,
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
  Copy,
  Mic,
  MicOff
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from '../utils/toast';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';

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

// ─── Thinking Indicator ───
const ThinkingIndicator = ({ actionLoading, onStop }) => {
  const [elapsed, setElapsed] = useState(0);
  const [msgIndex, setMsgIndex] = useState(0);

  const thinkingMessages = actionLoading === 'analyze_vault'
    ? ['Reading your documents...', 'Reviewing legal provisions...', 'Checking for gaps...', 'Preparing analysis...']
    : actionLoading === 'generate_checklist'
    ? ['Reviewing your estate...', 'Identifying action items...', 'Prioritizing by urgency...', 'Building your checklist...']
    : actionLoading === 'analyze_readiness'
    ? ['Scoring your documents...', 'Evaluating messages...', 'Checking your checklist...', 'Calculating readiness...']
    : ['Thinking...', 'Reviewing context...', 'Forming response...'];

  useEffect(() => {
    const timer = setInterval(() => setElapsed(s => s + 1), 1000);
    const msgTimer = setInterval(() => setMsgIndex(i => (i + 1) % thinkingMessages.length), 4000);
    return () => { clearInterval(timer); clearInterval(msgTimer); };
  }, [thinkingMessages.length]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;

  return (
    <div className="flex gap-2.5" data-testid="thinking-indicator">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #d4af37 0%, #fcd34d 100%)', color: '#0b1120' }}>
        <Sparkles className="w-3.5 h-3.5" />
      </div>
      <div className="rounded-2xl rounded-tl-md px-4 py-3 space-y-2" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
        <div className="flex items-center gap-2 text-[var(--t4)]">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)]" />
          <span className="text-sm" style={{ transition: 'opacity 0.3s' }}>{thinkingMessages[msgIndex]}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[var(--t5)] tabular-nums">{timeStr} elapsed</span>
          <button onClick={onStop}
            className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-[var(--rd)] transition-all hover:bg-[var(--rd)]/10"
            style={{ border: '1px solid rgba(239,68,68,0.3)' }}
            data-testid="stop-analysis-btn">
            <X className="w-2.5 h-2.5 inline mr-0.5" /> Stop
          </button>
        </div>
      </div>
    </div>
  );
};
const actionButtons = [
  { key: 'analyze_vault', label: 'Analyze Vault', icon: FileSearch, color: '#3B7BF7' },
  { key: 'generate_checklist', label: 'Generate Checklist', icon: ListChecks, color: '#22C993' },
  { key: 'analyze_readiness', label: 'Readiness Score', icon: Gauge, color: '#F5A623' },
  { key: 'beneficiary_review', label: 'Beneficiary Review', icon: Users, color: '#8b5cf6' },
];

// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════
const GuardianPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const guardianRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(56);
  const [showReturnPopup, setShowReturnPopup] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showOnboardingReturn, setShowOnboardingReturn] = useState(false);
  const recognitionRef = useRef(null);
  const [guidedFlowDone, setGuidedFlowDone] = useState(true);

  // Measure actual header height to position Guardian correctly
  useEffect(() => {
    const header = document.querySelector('.mobile-header');
    if (header) setHeaderHeight(header.offsetHeight);
  }, []);

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
  const [checklistExporting, setChecklistExporting] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const landingInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Voice-to-text using Web Speech API
  const toggleVoiceInput = useCallback((setter, currentValue) => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice input is not supported in this browser');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    let finalTranscript = currentValue || '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? ' ' : '') + event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setter(finalTranscript + (interim ? ' ' + interim : ''));
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

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
    // Check if onboarding is complete to control pulse animation
    axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders())
      .then(res => { if (!res.data?.celebration_shown && !res.data?.all_complete) setGuidedFlowDone(false); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Scroll within the messages container only, not the page
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
  }, [messages, loading]);

  // ─── Chat Actions ───
  const startNewChat = (initialMessage = null) => {
    const newId = `chat_${user?.id || 'anon'}_${Date.now().toString(36)}`;
    setSessionId(newId);
    setMessages([{
      role: 'assistant',
      content: `Hey ${user?.name?.split(' ')[0] || 'there'}! I'm EGA — your AI estate planning specialist working inside your encrypted vault.\n\nI've got eyes on your documents, your beneficiary setup, and your overall readiness. I can **analyze your Vault**, **generate a personalized IAC**, or **break down your Readiness Score**.\n\nWhat's on your mind?`
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
      const history = res.data.map(m => {
        const msg = { role: m.role, content: m.content };
        if (m.action_result?.action === 'readiness_analyzed' && m.action_result?.readiness) {
          msg.readiness = m.action_result.readiness;
        }
        if (m.action_result?.action === 'checklist_generated') {
          msg.actionBadge = `${m.action_result.items_added} checklist items added`;
        }
        return msg;
      });
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
      // toast removed
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

  const handleChecklistExport = async () => {
    setChecklistExporting(true);
    try {
      const headers = getAuthHeaders()?.headers;
      const res = await axios.post(`${API_URL}/guardian/export-checklist`, {}, { headers, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `CarryOn_Checklist_${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      // toast removed
    } catch (err) {
      toast.error(err.response?.status === 404 ? 'No checklist items found — generate one first' : 'Failed to export checklist');
    }
    setChecklistExporting(false);
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
      // toast removed
    } catch (err) { toast.error('Failed to export PDF'); }
    setExporting(false);
  };

  const stopAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setActionLoading(null);
    setMessages(prev => [...prev, { role: 'assistant', content: 'Analysis stopped by user.' }]);
  };

  const sendMessage = async (messageText, action = null, overrideSessionId = null) => {
    if (!messageText?.trim() && !action) return;
    setShowQuestions(false);
    setShowActions(false);

    const activeSessionId = overrideSessionId || sessionId;

    const displayText = action
      ? { analyze_vault: 'Analyze my Document Vault', generate_checklist: 'Generate my Action Checklist', analyze_readiness: 'Analyze my Estate Readiness Score', beneficiary_review: 'Review my beneficiary designations and coverage' }[action] || messageText
      : messageText;

    setMessages(prev => [...prev, { role: 'user', content: displayText }]);
    setInput('');
    if (action) setActionLoading(action);
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await axios.post(`${API_URL}/chat/guardian`, {
        message: messageText || displayText,
        session_id: activeSessionId,
        estate_id: estateId,
        action
      }, { ...getAuthHeaders(), timeout: 120000, signal: controller.signal });

      if (!overrideSessionId) setSessionId(response.data.session_id);
      const assistantMsg = { role: 'assistant', content: response.data.response };

      if (response.data.action_result) {
        const result = response.data.action_result;
        if (result.action === 'checklist_generated') {
          assistantMsg.actionBadge = `${result.items_added} checklist items added`;
        } else if (result.action === 'readiness_analyzed' && result.readiness) {
          assistantMsg.readiness = result.readiness;
          // Show congratulations popup on first EGA analysis (during onboarding)
          if (!sessionStorage.getItem('carryon_ega_popup_shown')) {
            sessionStorage.setItem('carryon_ega_popup_shown', 'true');
            try {
              await axios.post(`${API_URL}/onboarding/complete-step/review_readiness`, {}, getAuthHeaders());
            } catch {}
            // Show persistent return button (not popup) during onboarding
            setShowOnboardingReturn(true);
          }
        }
      }
      setMessages(prev => [...prev, assistantMsg]);
      // Haptic feedback — quick vibration to signal response is ready
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (error) {
      if (axios.isCancel(error) || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        // Already handled by stopAnalysis
        return;
      }
      toast.error('Failed to get response');
      setMessages(prev => [...prev, { role: 'assistant', content: 'I encountered an issue. Please try again.' }]);
    } finally {
      setLoading(false);
      setActionLoading(null);
      abortControllerRef.current = null;
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
      <div ref={guardianRef} className="fixed inset-0 flex flex-col bg-[var(--bg)] z-10 lg:relative lg:inset-auto" style={{ top: headerHeight + 'px', bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', overscrollBehavior: 'none', touchAction: 'none' }} data-testid="estate-guardian">

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}>
          <div className="max-w-2xl mx-auto px-4 pt-4 pb-4">
            {/* Header — matches SDV, DTS, Beneficiaries format */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.2)' }}>
                <Sparkles className="w-5 h-5 text-[var(--gold)]" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="guardian-hero-title">
                  Estate Guardian AI (EGA)
                </h1>
                <ul className="text-xs text-[var(--t5)] mt-1 space-y-0.5">
                  <li>· AI estate planning assistant trained in all 50 U.S. states</li>
                  <li>· Analyzes your vault, identifies gaps, generates checklists</li>
                  <li>· Not legal advice — consult a licensed attorney for decisions</li>
                </ul>
              </div>
            </div>

            {/* Recent Conversations */}
            <div className="glass-card p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider">Recent Conversations</h2>
                <button onClick={() => startNewChat()} className="flex items-center gap-1.5 text-xs font-bold text-[var(--gold)]" data-testid="new-chat-btn">
                  <Plus className="w-3.5 h-3.5" /> New Chat
                </button>
              </div>
              {sessionsLoading ? (
                <div className="flex items-center justify-center py-6 text-[var(--t5)]">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-6">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 text-[var(--t5)] opacity-40" />
                  <p className="text-sm text-[var(--t5)]">No conversations yet</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[210px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }} data-testid="session-list">
                  {sessions.map((s) => (
                    <div key={s.session_id} onClick={() => resumeSession(s.session_id)} role="button" tabIndex={0}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-transform duration-150 active:scale-[0.98] cursor-pointer"
                      style={{ border: '1px solid var(--b)' }} data-testid={`session-${s.session_id}`}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.12)' }}>
                        <MessageSquare className="w-3 h-3 text-[var(--gold)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--t2)] truncate">{s.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-[var(--t5)] flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {timeAgo(s.last_message_at)}</span>
                          <span className="text-[10px] text-[var(--t5)]">{s.message_count} msgs</span>
                        </div>
                      </div>
                      <button onClick={(e) => deleteSession(e, s.session_id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--t5)] active:text-red-400 active:bg-red-400/10 transition-colors flex-shrink-0"
                        data-testid={`delete-session-${s.session_id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="glass-card p-4 mb-4">
              <h2 className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-3">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-2">
                {actionButtons.map(({ key, label, icon: Icon, color }) => {
                  const isReadiness = key === 'analyze_readiness';
                  const shouldBounce = isReadiness && !guidedFlowDone;
                  return (
                  <button key={key} onClick={() => { startNewChat(); setTimeout(() => sendMessage('', key, `chat_${user?.id || 'anon'}_${Date.now().toString(36)}`), 200); }}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-transform duration-150 active:scale-[0.96] w-full"
                    style={{
                      background: `${color}12`, border: `1px solid ${color}25`, color,
                      animation: shouldBounce ? 'gentlePulse 2s ease-in-out infinite' : 'none',
                    }}
                    data-testid={`landing-action-${key}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                  );
                })}
                <style>{`@keyframes gentlePulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); box-shadow: 0 0 12px rgba(245,166,35,0.3); } }`}</style>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed input at bottom */}
        <div className="flex-shrink-0 px-3 pb-2 pt-1">
          <form onSubmit={handleLandingSubmit}>
            <div className="rounded-2xl px-3 py-1.5 max-w-2xl mx-auto" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              <textarea
                ref={landingInputRef}
                value={landingInput}
                onChange={(e) => setLandingInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleLandingSubmit(e); } }}
                placeholder="Ask anything about your estate plan..."
                className="w-full bg-transparent text-sm text-[var(--t)] placeholder:text-[var(--t5)] outline-none resize-none px-1 py-2"
                rows={3}
                style={{ overflow: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}
                data-testid="landing-input"
              />
              <div className="flex items-center justify-between pb-1">
                <button type="button" onClick={() => toggleVoiceInput(setLandingInput, landingInput)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-transform ${isListening ? 'bg-red-500/20 text-red-400' : 'text-[var(--gold)] hover:bg-[var(--gold)]/10'}`}
                  data-testid="landing-mic-button">
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <button type="submit" disabled={!landingInput.trim()}
                  className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
                  style={{ background: landingInput.trim() ? 'linear-gradient(135deg, #d4af37, #b8962e)' : 'var(--s)', color: landingInput.trim() ? '#080e1a' : 'var(--t5)' }}
                  data-testid="landing-send-button">
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // CHAT VIEW
  // ═══════════════════════════════════════════════
  return (
    <div ref={guardianRef} className="fixed inset-0 flex flex-col bg-[var(--bg)] z-10 lg:relative lg:inset-auto" style={{ top: headerHeight + 'px', bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', overscrollBehavior: 'none', touchAction: 'none' }} data-testid="estate-guardian">

      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{
        borderBottom: '1px solid var(--b)',
      }}>
        <div className="flex items-center gap-2">
          <button onClick={goBackToLanding}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--s)]"
            data-testid="back-to-landing-btn">
            <ArrowLeft className="w-4 h-4 text-[var(--t3)]" />
          </button>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.2)' }}>
            <Sparkles className="w-4 h-4 text-[var(--gold)]" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-[var(--t)] leading-none" style={{ fontFamily: 'Outfit, sans-serif' }}>Estate Guardian AI (EGA)</h1>
            <span className="text-[var(--t5)] text-[10px] flex items-center gap-1">
              <Shield className="w-2 h-2 text-[#22C993]" /> AES-256 encrypted session
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => startNewChat()} title="New Chat"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--s)]"
            data-testid="chat-new-btn">
            <Plus className="w-3.5 h-3.5 text-[var(--t4)]" />
          </button>
          <button onClick={handleChecklistExport} disabled={checklistExporting} title="Export Checklist PDF"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--s)]"
            style={{ color: '#22C993' }}
            data-testid="export-checklist-pdf-btn">
            {checklistExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListChecks className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleExport} disabled={exporting} title="Export Estate PDF"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--s)]"
            style={{ color: '#d4af37' }}
            data-testid="export-pdf-btn">
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }} data-testid="chat-messages-area">
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
                {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              </div>
              <div className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                msg.role === 'user' ? 'bg-[var(--gold)] text-[#0b1120] rounded-tr-md' : 'text-[var(--t2)] rounded-tl-md'
              }`} style={msg.role === 'assistant' ? { background: 'var(--s)', border: '1px solid var(--b)' } : {}}>
                {msg.role === 'assistant' ? <MarkdownText content={msg.content} /> : <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                {msg.role === 'assistant' && !loading && (
                  <button onClick={() => { navigator.clipboard.writeText(msg.content); toast.success('Copied to clipboard'); }}
                    className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--t5)] hover:text-[var(--gold)] transition-colors"
                    data-testid={`copy-message-${index}`}>
                    <Copy className="w-3 h-3" /> Copy
                  </button>
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

          {/* Welcome chips — only before first user message */}
          {!hasConversation && !loading && (
            <div className="pt-2 space-y-3" data-testid="welcome-actions">
              <div className="flex flex-wrap gap-2 justify-center">
                {actionButtons.map(({ key, label, icon: Icon, color }) => (
                  <button key={key} onClick={() => sendMessage('', key)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-transform duration-150 active:scale-[0.96]"
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
                    style={{ border: '1px solid var(--b)' }}
                    data-testid={`suggested-question-${i}`}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && <ThinkingIndicator actionLoading={actionLoading} onStop={stopAnalysis} />}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2 relative" style={{
        borderTop: '1px solid var(--s)',
        background: 'linear-gradient(180deg, transparent 0%, rgba(15,22,41,0.5) 100%)',
      }}>
        {showQuestions && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl overflow-hidden z-10" style={{
            background: 'rgba(20,28,51,0.98)', border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.4)', 
          }} data-testid="questions-popover">
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--b)' }}>
              <span className="text-xs font-bold text-[var(--t3)]">Helpful Questions</span>
              <button onClick={() => setShowQuestions(false)} className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-[var(--t4)] active:scale-90 transition-transform"><X className="w-3.5 h-3.5" /></button>
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
            boxShadow: '0 -8px 32px rgba(0,0,0,0.4)', 
          }} data-testid="actions-popover">
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--b)' }}>
              <span className="text-xs font-bold text-[var(--t3)]">Guardian Actions</span>
              <button onClick={() => setShowActions(false)} className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-[var(--t4)] active:scale-90 transition-transform"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-2 space-y-0.5">
              {actionButtons.map(({ key, label, icon: Icon, color }) => (
                <button key={key} onClick={() => { sendMessage('', key); setShowActions(false); }}
                  disabled={loading}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-[var(--t3)] hover:bg-[var(--s)] transition-colors"
                  data-testid={`guardian-action-popover-${key}`}>
                  {actionLoading === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" style={{ color }} />}
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Persistent "Return to Dashboard" during onboarding */}
        {showOnboardingReturn && (
          <div className="flex justify-center px-4 py-2">
            <button onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-transform active:scale-[0.97]"
              style={{
                background: 'linear-gradient(135deg, #d4af37, #b8962e)',
                color: '#080e1a',
                boxShadow: '0 4px 20px rgba(212,175,55,0.3)',
                animation: 'onboardingPulse 2.5s ease-in-out infinite',
              }}
              data-testid="ega-return-dashboard-btn">
              Return to Dashboard to complete the onboarding process
            </button>
            <style>{`@keyframes onboardingPulse { 0%,100% { transform: scale(1); box-shadow: 0 4px 20px rgba(212,175,55,0.3); } 50% { transform: scale(1.03); box-shadow: 0 6px 28px rgba(212,175,55,0.5); } }`}</style>
          </div>
        )}

        <div className="flex items-center gap-1.5 justify-center mb-1">
          <span className="text-[9px] text-[var(--t5)]">Encrypted · Not legal advice</span>
        </div>

        <form onSubmit={handleChatSubmit} className="flex items-end gap-2 max-w-3xl mx-auto px-3 pb-2">
          <div className="flex-1 rounded-2xl px-3 py-1.5" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim() && !loading) { sendMessage(input); } } }}
              placeholder="Ask about your estate plan..."
              className="w-full bg-transparent text-sm text-[var(--t)] placeholder:text-[var(--t5)] outline-none resize-none py-1.5"
              rows={3}
              style={{ overflow: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}
              disabled={loading}
              data-testid="guardian-input"
            />
            <div className="flex items-center justify-between pt-1 pb-0.5">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => toggleVoiceInput(setInput, input)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-transform ${isListening ? 'bg-red-500/20 text-red-400' : 'text-[var(--gold)] hover:bg-[var(--gold)]/10'}`}
                  data-testid="chat-mic-button">
                  {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </button>
                {hasConversation && (
                  <>
                    <button type="button" onClick={() => { setShowActions(!showActions); setShowQuestions(false); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--gold)] active:scale-90 transition-transform"
                      data-testid="actions-toggle">
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => { setShowQuestions(!showQuestions); setShowActions(false); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--t4)] active:scale-90 transition-transform"
                      data-testid="questions-toggle">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                {loading ? (
                  <button type="button" onClick={stopAnalysis}
                    className="w-8 h-8 rounded-xl flex items-center justify-center bg-[var(--rd)] text-white active:scale-90 transition-transform"
                    data-testid="stop-btn">
                    <StopCircle className="w-4 h-4" />
                  </button>
                ) : (
                  <button type="submit" disabled={!input.trim()}
                    className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
                    style={{ background: input.trim() ? 'linear-gradient(135deg, #d4af37, #b8962e)' : 'var(--s)', color: input.trim() ? '#080e1a' : 'var(--t5)' }}
                    data-testid="guardian-send-button">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {showReturnPopup && (
        <ReturnPopup step="guardian" onReturn={() => { setShowReturnPopup(false); navigate('/dashboard'); }} />
      )}
    </div>
  );
};

export default GuardianPage;
