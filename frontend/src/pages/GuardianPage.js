import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import apiClient from '../utils/apiClient';
import { cachedGet } from '../utils/apiCache';
import { useAuth } from '../contexts/AuthContext';
import { useLabelCleaner } from '../utils/brandLabel';
import { PieProgress, MarkdownText, timeAgo, ThinkingIndicator } from '../components/guardian/GuardianWidgets';
import { useDraftState } from '../hooks/useDraftState';

import {
  User,
  Users,
  Loader2,
  Sparkles,
  ArrowUp,
  StopCircle,
  FileSearch,
  ListChecks,
  ScanSearch,
  ClipboardList,
  Gauge,
  CheckCircle2,
  HelpCircle,
  X,
  FileDown,
  ArrowLeft,
  MessageSquare,
  Plus,
  Trash2,
  Clock,
  Shield,
  Copy,
  Mic,
  MicOff,
  Download,
  Landmark,
  AlertCircle,
  ChevronRight
} from 'lucide-react';

import { toast } from '../utils/toast';
import { downloadFile, platformDownload } from '../utils/downloadFile';
import CachedPdfIcon from '../components/CachedPdfIcon';
import { openPdfPreview } from '../utils/openPdfPreview';
import { API_URL } from '../config';
import { Button } from '../components/ui/button';
// removed unused SectionLock from '../components/security/SectionLock';

const suggestedQuestions = [
  "What documents am I missing for a complete estate plan?",
  "What are my state's probate requirements?",
  "How do I protect my assets for my children?",
  "Review my estate for any legal gaps",
  "What is the difference between a will and a trust?",
];

const actionButtons = [
  { key: 'analyze_vault', label: 'Analyze Vault', icon: FileSearch, color: '#3B7BF7' },
  { key: 'generate_todo', label: 'Generate To-Do List', icon: ClipboardList, color: '#22C993' },
  { key: 'find_inconsistencies', label: 'Find Inconsistencies', icon: ScanSearch, color: '#F59E0B' },
  { key: 'analyze_readiness', label: 'Readiness Score', icon: Gauge, color: '#F5A623' },
  { key: 'beneficiary_review', label: 'Beneficiary Review', icon: Users, color: '#8b5cf6' },
  { key: 'state_law_brief', label: 'State Law Brief', icon: Landmark, color: '#ef4444' },
];

// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════
const GuardianPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const cleanLabel = useLabelCleaner();
  const navigate = useNavigate();
  const guardianRef = useRef(null);
  const location = useLocation();
  const fromGettingStarted = location.state?.fromGettingStarted === true;
  const [headerHeight, setHeaderHeight] = useState(48);
  const [mobileHeaderVisible, setMobileHeaderVisible] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [showOnboardingReturn, setShowOnboardingReturn] = useState(fromGettingStarted);
  const recognitionRef = useRef(null);
  const [guidedFlowDone, setGuidedFlowDone] = useState(true);
  const [hasAddress, setHasAddress] = useState(null); // null = loading, true/false = resolved

  // Measure actual header height to position Guardian correctly.
  // .mobile-header is `lg:hidden` so it exists in the DOM but is display:none
  // on iPad landscape / desktop, where offsetHeight returns 0 — that used to
  // drop the EGA chat header onto the iOS status bar. Now: if the header
  // is hidden, keep the default 48 and add safe-area inset via CSS calc().
  useEffect(() => {
    const measure = () => {
      const header = document.querySelector('.mobile-header');
      if (header && header.offsetParent !== null) {
        setHeaderHeight(header.offsetHeight);
        setMobileHeaderVisible(true);
      } else {
        setHeaderHeight(48);
        setMobileHeaderVisible(false);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  // View state: 'landing' or 'chat'
  const [view, setView] = useState('landing');

  // Landing state
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  // Draft persistence — if the user types a question on the EGA
  // landing screen but navigates away before submitting, restore it
  // when they come back. Keyed per-user (the chat is user-scoped, not
  // estate-scoped, since EGA conversations follow the user across
  // benefactor / beneficiary contexts).
  const draftUserId = user?.id || null;
  const [landingInput, setLandingInput, clearLandingInputDraft] = useDraftState(
    draftUserId ? `ega_landing_input:${draftUserId}` : null,
    '',
  );

  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput, clearInputDraft] = useDraftState(
    draftUserId ? `ega_chat_input:${draftUserId}` : null,
    '',
  );
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
      const res = await apiClient.get(`${API_URL}/chat/sessions`, getAuthHeaders());
      setSessions(res.data);
    } catch (err) { /* silent */ }
    finally { setSessionsLoading(false); }
  }, [getAuthHeaders]);

  const fetchEstate = useCallback(async () => {
    try {
      const res = await cachedGet(axios, `${API_URL}/estates`, getAuthHeaders());
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
    // Warm up xAI connection in background (prevents timeout on first EGA use)
    apiClient.post(`${API_URL}/warmup`, {}, getAuthHeaders()).catch(() => {});
    // Check if user has address on file
    apiClient.get(`${API_URL}/auth/profile`, getAuthHeaders())
      .then(res => {
        const profile = res.data || {};
        setHasAddress(!!(profile.address_street && profile.address_state));
      })
      .catch(() => setHasAddress(true)); // Don't block on error
    // Check if onboarding is complete to control pulse animation
    apiClient.get(`${API_URL}/onboarding/progress`, getAuthHeaders())
      .then(res => { if (!res.data?.celebration_shown && !res.data?.all_complete) setGuidedFlowDone(false); })
      .catch(() => {});
    // Auto-resume active session if returning from another page
    try {
      const saved = localStorage.getItem('ega_active_session');
      if (saved) {
        resumeSession(saved).catch(() => {
          try { localStorage.removeItem('ega_active_session'); } catch (e) { /* silent */ }
          setView('landing');
          setLoading(false);
        });
      }
    } catch (e) { /* localStorage unavailable — stay on landing */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Scroll within the messages container only, not the page
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
  }, [messages, loading]);

  // Refresh sessions when user navigates back to guardian while on landing view
  useEffect(() => {
    if (location.pathname === '/guardian' && view === 'landing') {
      fetchSessions();
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Chat Actions ───
  const startNewChat = (initialMessage = null, action = null) => {
    const newId = `chat_${user?.id || 'anon'}_${Date.now().toString(36)}`;
    setSessionId(newId);
    // Only show the greeting placeholder when the user opens a *blank*
    // new chat. If they're entering with a quick-action click or an
    // initial prompt from the landing input, the greeting would render
    // for ~200ms before the user message + loader pushes it up, causing
    // a jarring "flash and slide" transition. Skipping the greeting in
    // those cases lets sendMessage populate the chat surface cleanly.
    const hasImmediateIntent = !!initialMessage || !!action;
    setMessages(hasImmediateIntent ? [] : [{
      role: 'assistant',
      content: `Hey ${user?.name?.split(' ')[0] || 'there'}! I'm EGA — your AI estate planning specialist working inside your encrypted vault.\n\nI've got eyes on your documents, your beneficiary setup, and your overall readiness. I can **analyze your Vault**, **generate a personalized IAC**, or **break down your Readiness Score**.\n\nWhat's on your mind?`
    }]);
    setView('chat');
    clearLandingInputDraft();
    setLandingInput('');
    try { localStorage.setItem('ega_active_session', newId); } catch (e) { /* silent */ }
    if (initialMessage) {
      setTimeout(() => sendMessage(initialMessage, null, newId), 100);
    } else if (action) {
      setTimeout(() => sendMessage('', action, newId), 200);
    }
  };

  const resumeSession = async (sid) => {
    setSessionId(sid);
    setView('chat');
    setLoading(true);
    try { localStorage.setItem('ega_active_session', sid); } catch (e) { /* silent */ }
    try {
      const res = await apiClient.get(`${API_URL}/chat/history/${sid}`, getAuthHeaders());
      const history = res.data.map(m => {
        const msg = { role: m.role, content: m.content };
        if (m.action_result?.action === 'readiness_analyzed' && m.action_result?.readiness) {
          msg.readiness = m.action_result.readiness;
        }
        if (m.action_result?.action === 'checklist_generated' || m.action_result?.action === 'iac_generated') {
          msg.actionBadge = `${m.action_result.items_added} IAC items added`;
          if (m.action_result.duplicates_skipped > 0) {
            msg.actionBadge += ` · ${m.action_result.duplicates_skipped} duplicate${m.action_result.duplicates_skipped !== 1 ? 's' : ''} skipped`;
          }
          msg.showIacDownload = true;
          msg.iacSummary = {
            added: m.action_result.items_added,
            skipped: m.action_result.duplicates_skipped || 0,
            titles: m.action_result.duplicate_titles || [],
          };
        }
        if (m.action_result?.action === 'todo_generated') {
          msg.showTodoDownload = true;
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
      await apiClient.delete(`${API_URL}/chat/sessions/${sid}`, getAuthHeaders());
      setSessions(prev => prev.filter(s => s.session_id !== sid));
      // toast removed
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
      const status = err?.response?.status;
      // Defensive: if the row is already gone server-side (404), treat the
      // user's intent as honored — drop it from the local list and tell
      // them rather than throwing a confusing error.
      if (status === 404) {
        setSessions(prev => prev.filter(s => s.session_id !== sid));
        toast.success('Conversation removed');
        return;
      }
      toast.error(`Failed to delete: ${detail}`);
    }
  };

  // Delete the conversation the user is currently viewing AND reset the
  // chat surface to a fresh "start a new chat" state. Surfaced as a
  // header button on the chat layout (Apr 27, 2026) so users with a
  // single conversation have an obvious way to clear it without having
  // to detour through the Recent-chats list.
  const deleteCurrentSession = async () => {
    if (!sessionId) return;
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await apiClient.delete(`${API_URL}/chat/sessions/${sessionId}`, getAuthHeaders());
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 404) {
        const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
        toast.error(`Failed to delete: ${detail}`);
        return;
      }
      // 404 = already gone server-side; fall through to local cleanup.
    }
    setSessions(prev => prev.filter(s => s.session_id !== sessionId));
    setSessionId(null);
    setMessages([]);
    setView('landing');
    try { localStorage.removeItem('ega_active_session'); } catch {}
    toast.success('Conversation deleted');
  };

  const goBackToLanding = () => {
    setView('landing');
    setSessionId(null);
    setMessages([]);
    setShowQuestions(false);
    setShowActions(false);
    try { localStorage.removeItem('ega_active_session'); } catch (e) { /* silent */ }
    fetchSessions();
  };

  // Hard-delete EVERY conversation belonging to the current user. Surfaced
  // as a "Clear all" pill in the Recent Conversations header so users with
  // long histories (or test-leak residue) can wipe in one shot instead of
  // clicking the trash icon 30+ times.
  const clearAllSessions = async () => {
    if (!sessions.length) return;
    if (!window.confirm(`Delete ALL ${sessions.length} conversations? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`${API_URL}/chat/sessions`, getAuthHeaders());
      setSessions([]);
      setSessionId(null);
      setMessages([]);
      setView('landing');
      try { localStorage.removeItem('ega_active_session'); } catch {}
      toast.success('All conversations cleared');
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
      toast.error(`Failed to clear: ${detail}`);
    }
  };

  const handleChecklistExport = async () => {
    setChecklistExporting(true);
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `CarryOn_IAC_${dateStr}.pdf`;
      await openPdfPreview({
        navigate,
        pdfType: 'ega_checklist',
        filename,
        title: 'IAC Checklist',
        subtitle: dateStr,
        blobFetcher: async () => {
          const headers = getAuthHeaders()?.headers;
          const res = await apiClient.post(`${API_URL}/guardian/export-checklist`, {}, { headers, responseType: 'blob', timeout: 120000 });
          return new Blob([res.data], { type: 'application/pdf' });
        },
      });
    } catch (err) {
      toast.error(err.response?.status === 404 ? 'No IAC items found — generate one first' : 'Failed to export checklist');
    }
    setChecklistExporting(false);
  };

  const handleTodoDownload = async (content) => {
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `CarryOn_ToDo_${dateStr}.pdf`;
      await openPdfPreview({
        navigate,
        pdfType: 'ega_todo',
        filename,
        title: 'EGA To-Do List',
        subtitle: dateStr,
        blobFetcher: async () => {
          const headers = getAuthHeaders()?.headers;
          const res = await apiClient.post(`${API_URL}/guardian/export-todo`, { content }, { headers, responseType: 'blob', timeout: 60000 });
          return new Blob([res.data], { type: 'application/pdf' });
        },
      });
    } catch (err) {
      toast.error('Failed to generate PDF');
    }
  };

  const handleIacDownload = async (content) => {
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `CarryOn_IAC_Report_${dateStr}.pdf`;
      await openPdfPreview({
        navigate,
        pdfType: 'ega_iac',
        filename,
        title: 'IAC Report',
        subtitle: dateStr,
        blobFetcher: async () => {
          const headers = getAuthHeaders()?.headers;
          const res = await apiClient.post(`${API_URL}/guardian/export-iac-report`, { content }, { headers, responseType: 'blob', timeout: 120000 });
          return new Blob([res.data], { type: 'application/pdf' });
        },
      });
    } catch (err) {
      toast.error('Failed to generate IAC Report PDF');
    }
  };

  const handleExportTranscript = async () => {
    if (!sessionId) { toast.error('No active conversation'); return; }
    setExporting(true);
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `CarryOn_Transcript_${dateStr}.pdf`;
      await openPdfPreview({
        navigate,
        pdfType: 'ega_transcript',
        filename,
        title: 'EGA Conversation Transcript',
        subtitle: dateStr,
        blobFetcher: async () => {
          const headers = getAuthHeaders()?.headers;
          const res = await apiClient.post(`${API_URL}/guardian/export-conversation`, { session_id: sessionId }, { headers, responseType: 'blob', timeout: 60000 });
          return new Blob([res.data], { type: 'application/pdf' });
        },
      });
    } catch (err) { toast.error('Failed to export transcript'); }
    setExporting(false);
  };

  const [planExporting, setPlanExporting] = useState(false);
  const handleExportPlan = async () => {
    if (!sessionId) { toast.error('No active conversation'); return; }
    setPlanExporting(true);
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `CarryOn_Plan_of_Action_${dateStr}.pdf`;
      await openPdfPreview({
        navigate,
        pdfType: 'ega_plan',
        filename,
        title: 'EGA Plan of Action',
        subtitle: dateStr,
        blobFetcher: async () => {
          const headers = getAuthHeaders()?.headers;
          const res = await apiClient.post(`${API_URL}/guardian/export-plan-of-action`, { session_id: sessionId }, { headers, responseType: 'blob', timeout: 120000 });
          return new Blob([res.data], { type: 'application/pdf' });
        },
      });
    } catch (err) { toast.error('Failed to generate Plan of Action'); }
    setPlanExporting(false);
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

    const lastUserMessage = messageText;
    const activeSessionId = overrideSessionId || sessionId;

    const displayText = action
      ? { analyze_vault: 'Analyze my Document Vault', generate_todo: 'Generate my Estate To-Do List', find_inconsistencies: 'Find inconsistencies, mismatches, and gaps in my estate documents and recommend specific fixes', analyze_readiness: 'Analyze my Estate Readiness Score', beneficiary_review: 'Review my beneficiary designations and coverage', state_law_brief: 'Give me a brief on my state\'s estate planning laws' }[action] || messageText
      : messageText;

    setMessages(prev => [...prev, { role: 'user', content: displayText }]);
    clearInputDraft();
    setInput('');
    if (action) setActionLoading(action);
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestPayload = {
      message: messageText || displayText,
      session_id: activeSessionId,
      estate_id: estateId,
      action
    };
    const requestConfig = { ...getAuthHeaders(), timeout: 120000, signal: controller.signal };

    // Helper — single API call attempt
    const tryCall = () => apiClient.post(`${API_URL}/chat/guardian`, requestPayload, requestConfig);

    try {
      let response;
      try {
        response = await tryCall();
      } catch (firstErr) {
        // If cancelled by user, propagate immediately
        if (axios.isCancel(firstErr) || firstErr.name === 'AbortError' || firstErr.code === 'ERR_CANCELED') throw firstErr;
        // Silent auto-retry once — connection may have gone stale after idle
        await new Promise(r => setTimeout(r, 2000));
        response = await tryCall();
      }

      if (!overrideSessionId) setSessionId(response.data.session_id);
      // Always keep localStorage in sync with the active session
      try { localStorage.setItem('ega_active_session', response.data.session_id || activeSessionId); } catch (e) { /* silent */ }
      const assistantMsg = { role: 'assistant', content: response.data.response };

      if (response.data.action_result) {
        const result = response.data.action_result;
        if (result.action === 'iac_generated') {
          let badge = `${result.items_added} IAC items added`;
          if (result.duplicates_skipped > 0) {
            badge += ` · ${result.duplicates_skipped} duplicate${result.duplicates_skipped !== 1 ? 's' : ''} skipped`;
          }
          assistantMsg.actionBadge = badge;
          assistantMsg.showIacDownload = true;
          assistantMsg.iacSummary = {
            added: result.items_added,
            skipped: result.duplicates_skipped || 0,
            titles: result.duplicate_titles || [],
          };
          // Toast so the user sees the result even on long responses
          if (result.items_added > 0 && result.duplicates_skipped > 0) {
            toast.success(`${result.items_added} new items added · ${result.duplicates_skipped} duplicate${result.duplicates_skipped !== 1 ? 's' : ''} skipped`);
          } else if (result.items_added > 0) {
            toast.success(`${result.items_added} new IAC items added to your checklist`);
          } else if (result.duplicates_skipped > 0) {
            toast(`All ${result.duplicates_skipped} items already exist in your checklist — no duplicates added`);
          }
        } else if (result.action === 'todo_generated') {
          assistantMsg.showTodoDownload = true;
        } else if (result.action === 'readiness_analyzed' && result.readiness) {
          assistantMsg.readiness = result.readiness;
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
      const errDetail = error.response?.data?.detail || '';
      toast.error(errDetail || 'Failed to get response');
      setMessages(prev => [...prev, { role: 'assistant', content: errDetail || 'I encountered a temporary issue connecting to the AI service. Please try again — it usually works on the second attempt.', isError: true, retryMessage: lastUserMessage }]);
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
  // ADDRESS GATE — frosted glass overlay if no address on file
  // ═══════════════════════════════════════════════
  const renderAddressGate = () => {
    if (hasAddress !== false) return null;
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-6"
        data-testid="address-gate-overlay"
        style={{ animation: 'addressGateFadeIn 0.6s ease forwards' }}>
        <style>{`
          @keyframes addressGateFadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes addressGateBounce {
            0% { opacity: 0; transform: scale(0.85) translateY(30px); }
            60% { transform: scale(1.02) translateY(-4px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
        <div className="absolute inset-0" style={{
          backdropFilter: 'blur(20px) saturate(130%)',
          WebkitBackdropFilter: 'blur(20px) saturate(130%)',
          background: 'var(--guided-overlay-bg, rgba(8,14,26,0.82))',
        }} />
        <div className="relative rounded-2xl p-8 max-w-sm w-full text-center"
          style={{
            background: 'var(--bg2, #0F1629)',
            border: '1px solid var(--b, rgba(255,255,255,0.08))',
            boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
            animation: 'addressGateBounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s forwards',
            opacity: 0,
          }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}>
            <Landmark className="w-8 h-8 text-[var(--gold)]" />
          </div>
          <h2 className="text-xl font-bold mb-3" style={{ fontFamily: 'var(--sans)', color: 'var(--t, #ffffff)' }}>
            Primary Residence Needed
          </h2>
          <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--t4, #94a3b8)' }}>
            EGA uses your primary residence address to analyze estate law specific to your state. Please add your address in Settings before using this feature.
          </p>
          <button onClick={() => navigate(`/settings?editAddress=true${fromGettingStarted ? '&fromOnboarding=true' : ''}`)}
            className="w-full py-3.5 rounded-xl text-sm font-bold mb-3 flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: 'var(--bg)', boxShadow: '0 8px 32px rgba(var(--gold-rgb), 0.3)' }}
            data-testid="address-gate-settings-btn">
            Go to Settings <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => navigate('/dashboard')}
            className="w-full py-2.5 rounded-xl text-xs"
            style={{ color: 'var(--t4, #94a3b8)', border: '1px solid var(--b, rgba(255,255,255,0.08))' }}
            data-testid="address-gate-back-btn">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════
  // LANDING VIEW
  // ═══════════════════════════════════════════════
  if (view === 'landing') {
    return (
      <div ref={guardianRef} className="fixed inset-0 flex flex-col bg-[var(--bg)] z-10" style={{ top: 'calc(var(--cy-header-safe-top, env(safe-area-inset-top, 0px)) + 56px + var(--cy-offline-banner-h, 0px))', bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', left: 0, overscrollBehavior: 'contain' }} data-testid="estate-guardian">
      <style>{`@media (min-width: 1024px) { [data-testid="estate-guardian"] { left: var(--sb-offset, var(--sidebar-width, 260px)) !important; top: var(--cy-offline-banner-h, 0px) !important; bottom: 0 !important; } }`}</style>
      {renderAddressGate()}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto flex flex-col" style={{ overscrollBehavior: 'contain', touchAction: 'pan-y',
          // Signature page glow — matches MM/SDV/CFP/IAC/Beneficiaries pattern.
          background: 'radial-gradient(ellipse at top left, rgba(var(--gold-rgb), 0.12), transparent 55%), radial-gradient(ellipse at bottom right, rgba(240,201,92,0.06), transparent 55%)' }}>
          <div className="w-full max-w-[1400px] mx-auto p-4 lg:p-6 pt-4 lg:pt-6 pb-4 space-y-5">
            {/* Header — standardized icon-box + title + 1-line description,
                matching MM/SDV/CFP/IAC/Beneficiaries/DTS. */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, rgba(var(--gold-rgb), 0.2), rgba(240,201,92,0.15))' }}>
                  <Sparkles className="w-5 h-5 text-[var(--gold)]" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }} data-testid="guardian-hero-title">
                    Estate Guardian AI (EGA)
                  </h1>
                  <p className="text-xs text-[var(--t5)]">
                    AI estate assistant trained in all 50 U.S. states — not legal advice
                  </p>
                </div>
              </div>
              <Button
                onClick={() => startNewChat()}
                className="gold-button w-full sm:w-auto"
                data-testid="new-chat-header-btn"
              >
                <Plus className="w-5 h-5 mr-2" /> New Chat
              </Button>
            </div>

            {/* Recent Conversations */}
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-bold text-[var(--t5)] uppercase tracking-wider">Recent Conversations</h2>
                <div className="flex items-center gap-3">
                  {sessions.length >= 2 && (
                    <button onClick={clearAllSessions} className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--t5)] active:text-red-400 transition-colors" data-testid="clear-all-sessions-btn" title="Delete every conversation">
                      <Trash2 className="w-3 h-3" /> Clear all
                    </button>
                  )}
                  <button onClick={() => startNewChat()} className="flex items-center gap-1.5 text-xs font-bold text-[var(--gold)]" data-testid="new-chat-btn">
                    <Plus className="w-3.5 h-3.5" /> New Chat
                  </button>
                </div>
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
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(var(--gold-rgb), 0.08)', border: '1px solid rgba(var(--gold-rgb), 0.12)' }}>
                        <MessageSquare className="w-3 h-3 text-[var(--gold)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--t2)] truncate">{s.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-[var(--t5)] flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {timeAgo(s.last_message_at)}</span>
                          <span className="text-[11px] text-[var(--t5)]">{s.message_count} msgs</span>
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
            <div className="glass-card p-4">
              <h2 className="text-[11px] font-bold text-[var(--t5)] uppercase tracking-wider mb-3">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-2">
                {actionButtons.map(({ key, label, icon: Icon, color }) => {
                  const isReadiness = key === 'analyze_readiness';
                  const shouldBounce = isReadiness && !guidedFlowDone;
                  return (
                  <button key={key} onClick={() => startNewChat(null, key)}
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
            <div className="rounded-2xl px-3 py-1.5 max-w-2xl lg:max-w-5xl mx-auto" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
              <textarea
                ref={landingInputRef}
                value={landingInput}
                onChange={(e) => setLandingInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleLandingSubmit(e); } }}
                placeholder="Ask anything about your estate plan..."
                className="w-full bg-transparent text-base text-[var(--t)] placeholder:text-[var(--t5)] outline-none resize-none px-1 py-2"
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
    <div ref={guardianRef} className="fixed inset-0 flex flex-col bg-[var(--bg)] z-10" style={{
      top: mobileHeaderVisible
        ? headerHeight + 'px'
        : `calc(${headerHeight}px + env(safe-area-inset-top, 0px))`,
      bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
      left: 0,
      overscrollBehavior: 'contain'
    }} data-testid="estate-guardian">
      <style>{`@media (min-width: 1024px) { [data-testid="estate-guardian"] { left: var(--sidebar-width, 260px) !important; bottom: 0 !important; } }`}</style>
      {renderAddressGate()}

      {/* Chat Header */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 gap-2" style={{
        borderBottom: '1px solid var(--b)',
      }}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button onClick={goBackToLanding}
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--s)] flex-shrink-0"
            data-testid="back-to-landing-btn">
            <ArrowLeft className="w-5 h-5 text-[var(--t3)]" />
          </button>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.2)' }}>
            <Sparkles className="w-4 h-4 text-[var(--gold)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-[var(--t)] leading-tight whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontFamily: 'var(--sans)' }}>Estate Guardian AI{cleanLabel(' (EGA)') && <span className="text-[var(--t4)] font-normal">{cleanLabel(' (EGA)')}</span>}</h1>
            <span className="text-[var(--t5)] text-[11px] flex items-center gap-1 whitespace-nowrap overflow-hidden text-ellipsis">
              <Shield className="w-2 h-2 text-[#22C993] flex-shrink-0" /> <span className="truncate">AES-256 encrypted session</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="hidden lg:inline-flex"><CachedPdfIcon pdfType="ega_transcript" /></span>
          <button onClick={handleExportTranscript} disabled={exporting || !sessionId} title="Download Transcript"
            className="h-9 px-2 lg:px-3 rounded-lg flex items-center gap-1.5 transition-all hover:bg-[var(--s)]"
            style={{ color: '#94a3b8' }}
            data-testid="export-transcript-btn">
            {exporting ? <PieProgress size={18} color="#94a3b8" duration={4} /> : <FileDown className="w-4.5 h-4.5" />}
            <span className="hidden lg:inline text-xs font-bold">Transcript</span>
          </button>
          <span className="hidden lg:inline-flex"><CachedPdfIcon pdfType="ega_plan" /></span>
          <button onClick={handleExportPlan} disabled={planExporting || !sessionId} title="Download Plan of Action"
            className="h-9 px-2 lg:px-3 rounded-lg flex items-center gap-1.5 transition-all hover:bg-[var(--s)]"
            style={{ color: 'var(--gold)' }}
            data-testid="export-plan-btn">
            {planExporting ? <PieProgress size={18} color="#d4af37" duration={15} /> : <ClipboardList className="w-4.5 h-4.5" />}
            <span className="hidden lg:inline text-xs font-bold">Plan</span>
          </button>
          <span className="hidden lg:inline-flex"><CachedPdfIcon pdfType="ega_checklist" /></span>
          <button onClick={handleChecklistExport} disabled={checklistExporting} title="Export IAC Checklist"
            className="h-9 px-2 lg:px-3 rounded-lg flex items-center gap-1.5 transition-all hover:bg-[var(--s)]"
            style={{ color: '#22C993' }}
            data-testid="export-checklist-pdf-btn">
            {checklistExporting ? <PieProgress size={18} color="#22C993" duration={4} /> : <ListChecks className="w-4.5 h-4.5" />}
            <span className="hidden lg:inline text-xs font-bold">Checklist</span>
          </button>
          <button onClick={deleteCurrentSession} disabled={!sessionId} title="Delete this conversation"
            className="h-9 px-2 lg:px-3 rounded-lg flex items-center gap-1.5 transition-all hover:bg-[var(--s)] disabled:opacity-40"
            style={{ color: '#ef4444' }}
            data-testid="delete-current-chat-btn"
            aria-label="Delete this conversation">
            <Trash2 className="w-4.5 h-4.5" />
            <span className="hidden lg:inline text-xs font-bold">Delete</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }} data-testid="chat-messages-area">
        <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 lg:px-8 py-4 space-y-4">
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
                    className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--t5)] hover:text-[var(--gold)] transition-colors"
                    data-testid={`copy-message-${index}`}>
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                )}
                {msg.isError && msg.retryMessage && !loading && (
                  <button onClick={() => sendMessage(msg.retryMessage)}
                    className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
                    data-testid={`retry-message-${index}`}>
                    Try Again
                  </button>
                )}
                {msg.iacSummary && (
                  <div className="mt-3 rounded-xl p-3 space-y-2" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }} data-testid={`iac-summary-${index}`}>
                    <p className="text-sm font-bold" style={{ color: 'var(--t1)' }}>IAC Generation Summary</p>
                    <div className="flex items-center gap-3">
                      {msg.iacSummary.added > 0 && (
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-[#22c993]">
                          <CheckCircle2 className="w-4 h-4" />
                          {msg.iacSummary.added} new item{msg.iacSummary.added !== 1 ? 's' : ''} added
                        </div>
                      )}
                      {msg.iacSummary.skipped > 0 && (
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-[#F59E0B]">
                          <AlertCircle className="w-4 h-4" />
                          {msg.iacSummary.skipped} duplicate{msg.iacSummary.skipped !== 1 ? 's' : ''} skipped
                        </div>
                      )}
                      {msg.iacSummary.added === 0 && msg.iacSummary.skipped === 0 && (
                        <div className="text-sm text-[var(--t4)]">No items generated</div>
                      )}
                    </div>
                    {msg.iacSummary.skipped > 0 && msg.iacSummary.titles.length > 0 && (
                      <details className="text-xs text-[var(--t4)]">
                        <summary className="cursor-pointer font-medium text-[#F59E0B] hover:underline">
                          View {msg.iacSummary.skipped} skipped duplicate{msg.iacSummary.skipped !== 1 ? 's' : ''}
                        </summary>
                        <ul className="mt-1.5 space-y-0.5 pl-3">
                          {msg.iacSummary.titles.map((t, i) => (
                            <li key={i} className="flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-[#F59E0B] flex-shrink-0" />
                              {t}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
                {msg.actionBadge && !msg.iacSummary && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#22c993]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {msg.actionBadge}
                  </div>
                )}
                {msg.showTodoDownload && !loading && (
                  <button onClick={() => handleTodoDownload(msg.content)}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                    style={{ background: 'rgba(34,201,147,0.12)', border: '1px solid rgba(34,201,147,0.3)', color: '#22C993' }}
                    data-testid={`download-todo-${index}`}>
                    <Download className="w-3.5 h-3.5" /> Download To-Do List PDF
                  </button>
                )}
                {msg.showIacDownload && !loading && (
                  <button onClick={() => handleIacDownload(msg.content)}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                    style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#F59E0B' }}
                    data-testid={`download-iac-report-${index}`}>
                    <Download className="w-3.5 h-3.5" /> Download IAC Report PDF
                  </button>
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
                        <div className="text-[11px] text-[var(--t4)]">{label}</div>
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
            <button onClick={async () => {
              try { await apiClient.post(`${API_URL}/onboarding/complete-step/review_readiness`, {}, getAuthHeaders()); } catch {}
              navigate('/dashboard');
            }}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-transform active:scale-[0.97]"
              style={{
                background: 'linear-gradient(135deg, #d4af37, #b8962e)',
                color: 'var(--bg)',
                boxShadow: '0 4px 20px rgba(var(--gold-rgb), 0.3)',
                animation: 'onboardingPulse 2.5s ease-in-out infinite',
              }}
              data-testid="ega-return-dashboard-btn">
              Done — Return to Dashboard
            </button>
            <style>{`@keyframes onboardingPulse { 0%,100% { transform: scale(1); box-shadow: 0 4px 20px rgba(var(--gold-rgb), 0.3); } 50% { transform: scale(1.03); box-shadow: 0 6px 28px rgba(var(--gold-rgb), 0.5); } }`}</style>
          </div>
        )}

        <div className="flex items-center gap-1.5 justify-center mb-1">
          <span className="text-[11px] text-[var(--t5)]">Encrypted · Not legal advice</span>
        </div>

        <form onSubmit={handleChatSubmit} className="flex items-end gap-2 max-w-3xl lg:max-w-5xl mx-auto px-3 lg:px-8 pb-2">
          <div className="flex-1 rounded-2xl px-3 py-1" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim() && !loading) { sendMessage(input); } } }}
              placeholder="Ask about your estate plan..."
              className="w-full bg-transparent text-base text-[var(--t)] placeholder:text-[var(--t5)] outline-none resize-none py-1"
              rows={2}
              style={{ overflow: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent', maxHeight: '120px' }}
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
    </div>
  );
};

export default GuardianPage;
