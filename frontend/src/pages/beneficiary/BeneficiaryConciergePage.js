import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Sparkles, Send, ArrowLeft, Loader2, AlertTriangle, BookOpen, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

/**
 * BeneficiaryConciergePage — POST-transition AI for the beneficiary side.
 *
 * The benefactor has passed. This page lets the beneficiary ask
 * questions about that benefactor's wishes, grounded ONLY in the
 * documents the benefactor specifically shared with them.
 *
 * All gating is enforced server-side (post-transition + Premium-tier
 * feature flag + beneficiary-on-estate + designated-document scope).
 * This component just renders the UX and surfaces the gate reasons.
 *
 * Distinct from /guardian (Estate Guardian AI = benefactor-side
 * estate-law gap analyzer). Critical pathway — see AGENT_RULES.md.
 */
export default function BeneficiaryConciergePage() {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const estateId = typeof window !== 'undefined' ? localStorage.getItem('beneficiary_estate_id') : null;

  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showSharedPanel, setShowSharedPanel] = useState(false);
  const scrollerRef = useRef(null);

  const loadStatusAndHistory = useCallback(async () => {
    if (!estateId) {
      setStatus({ available: false, reason: 'no_estate_selected' });
      setLoading(false);
      return;
    }
    try {
      const [statusRes, historyRes] = await Promise.all([
        axios.get(`${API_URL}/beneficiary/concierge/status`, { ...getAuthHeaders(), params: { estate_id: estateId } }),
        axios.get(`${API_URL}/beneficiary/concierge/history`, { ...getAuthHeaders(), params: { estate_id: estateId } }).catch(() => ({ data: { messages: [] } })),
      ]);
      setStatus(statusRes.data || { available: false });
      const turns = [];
      for (const m of (historyRes.data?.messages || [])) {
        turns.push({ role: 'user', content: m.question, ts: m.created_at });
        turns.push({ role: 'assistant', content: m.answer, ts: m.created_at });
      }
      setMessages(turns);
    } catch {
      setStatus({ available: false, reason: 'load_failed' });
    } finally {
      setLoading(false);
    }
  }, [estateId, getAuthHeaders]);

  useEffect(() => { loadStatusAndHistory(); }, [loadStatusAndHistory]);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages, sending]);

  const send = async () => {
    const q = input.trim();
    if (!q || sending) return;
    setMessages((prev) => [...prev, { role: 'user', content: q, ts: new Date().toISOString() }]);
    setInput('');
    setSending(true);
    try {
      const res = await axios.post(`${API_URL}/beneficiary/concierge/ask`, { estate_id: estateId, question: q }, getAuthHeaders());
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data?.answer || '', ts: new Date().toISOString() }]);
    } catch (e) {
      const detail = e?.response?.data?.detail || 'I’m having trouble right now. Please try again in a moment.';
      setMessages((prev) => [...prev, { role: 'assistant', content: `(${detail})`, ts: new Date().toISOString(), error: true }]);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" />
      </div>
    );
  }

  if (!status?.available) {
    return <ConciergeUnavailable reason={status?.reason} onBack={() => navigate('/beneficiary/dashboard')} />;
  }

  const benefactorFirst = status?.benefactor_first_name || 'your loved one';

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 animate-fade-in" data-testid="beneficiary-concierge-page">
      {/* Header */}
      <div className="mb-5">
        <button onClick={() => navigate('/beneficiary/dashboard')} className="inline-flex items-center gap-1 text-sm font-bold text-[#60A5FA] mb-3" data-testid="concierge-back">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </button>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.35)' }}>
            <Sparkles className="w-5 h-5 text-[var(--gold)]" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
              Estate Concierge
            </h1>
            <p className="text-xs text-[var(--t4)]">An AI guide grounded only in the documents {benefactorFirst} shared with you.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--t5)]">
          <BookOpen className="w-3.5 h-3.5" />
          <span data-testid="concierge-doc-count">{status.accessible_doc_count} document{status.accessible_doc_count === 1 ? '' : 's'} available to you</span>
          {status.accessible_doc_count > 0 && (
            <button
              onClick={() => setShowSharedPanel((s) => !s)}
              className="ml-1 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--gold)] hover:underline"
              data-testid="concierge-shared-toggle"
            >
              {showSharedPanel ? <>Hide list <ChevronUp className="w-3 h-3" /></> : <>Show what I'm reading <ChevronDown className="w-3 h-3" /></>}
            </button>
          )}
        </div>
      </div>

      {/* "What I shared" panel — lists the exact documents feeding the
          Concierge's answers. Helps the beneficiary trust the source
          and spot anything missing they might need to ask the executor
          to designate. Server only sends id/name/category — never raw
          document text. */}
      {showSharedPanel && status.accessible_doc_count > 0 && (
        <div
          className="rounded-2xl p-4 lg:p-5 mb-4"
          style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.25)' }}
          data-testid="concierge-shared-panel"
        >
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h2 className="text-sm font-bold text-[var(--gold)]" style={{ fontFamily: 'var(--sans)' }}>
              Documents informing these answers
            </h2>
            <span className="text-[11px] text-[var(--t5)]">{status.documents?.length || 0} total</span>
          </div>
          <p className="text-xs text-[var(--t4)] mb-3 leading-relaxed">
            The Concierge only sees these documents. If something you expect to be here is missing, ask the executor or family — only {benefactorFirst} (and now their executor) can change what's shared with you.
          </p>
          <div className="grid gap-2">
            {(status.documents || []).map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                data-testid={`concierge-shared-doc-${d.id}`}
              >
                <FileText className="w-4 h-4 text-[var(--gold)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--t)] truncate">{d.name}</p>
                  <p className="text-[11px] text-[var(--t5)] uppercase tracking-wider">{d.category}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat surface */}
      <Card className="glass-card">
        <CardContent className="p-0">
          <div ref={scrollerRef} className="overflow-y-auto px-4 lg:px-6 py-5 space-y-4" style={{ maxHeight: '60vh', minHeight: '40vh' }} data-testid="concierge-scroller">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-[var(--t3)] mb-2">Ask about anything in {benefactorFirst}'s estate documents.</p>
                <p className="text-xs text-[var(--t5)] italic">Examples: "What did {benefactorFirst} want for the house?" · "Who is the executor?" · "What does the will say about the cabin?"</p>
              </div>
            )}
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} error={m.error} />
            ))}
            {sending && (
              <Bubble role="assistant" content={<span className="inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</span>} />
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-[var(--b)] p-3 lg:p-4">
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Ask the Concierge about ${benefactorFirst}'s estate…`}
                className="flex-1 px-3 py-2 rounded-lg text-base text-[var(--t)] outline-none focus:ring-1 focus:ring-[var(--gold)]"
                style={{ background: 'var(--bg2)', border: '1px solid var(--b2)', resize: 'none', fontSize: '16px' }}
                data-testid="concierge-input"
              />
              <Button onClick={send} disabled={!input.trim() || sending} className="gold-button shrink-0" data-testid="concierge-send">
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[11px] text-[var(--t5)] mt-2 italic">
              Answers come only from the documents {benefactorFirst} shared with you. The Concierge isn’t a lawyer — for legal questions, contact the executor or {benefactorFirst}'s attorney.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Bubble({ role, content, error }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`} data-testid={`concierge-bubble-${role}`}>
      <div
        className="max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
        style={
          isUser
            ? { background: 'rgba(37,99,235,0.18)', color: '#DBEAFE', border: '1px solid rgba(37,99,235,0.35)' }
            : { background: error ? 'rgba(239,68,68,0.10)' : 'var(--s)', color: error ? '#FCA5A5' : 'var(--t2)', border: `1px solid ${error ? 'rgba(239,68,68,0.30)' : 'var(--b)'}` }
        }
      >
        {content}
      </div>
    </div>
  );
}

function ConciergeUnavailable({ reason, onBack }) {
  const messageMap = {
    no_estate_selected: ['No estate selected', 'Open the Estate Plan Network from the sidebar and pick a benefactor’s estate first.'],
    not_a_beneficiary: ['Not a beneficiary on this estate', 'You’re not listed as a beneficiary on the estate you have selected.'],
    pre_transition: ['Available after a transition event', 'The Estate Concierge unlocks once the benefactor has passed and the transition has been verified.'],
    feature_disabled_for_tier: ['Not included in this estate’s plan', 'The Estate Concierge is a Premium-plan feature on the benefactor’s side. Reach out to the family if you’d like to learn more.'],
    benefactor_missing: ['Benefactor account unavailable', 'We couldn’t load this estate’s benefactor record. Please try again later.'],
    estate_not_found: ['Estate not found', 'We couldn’t find that estate. Please go back and pick a different one.'],
    load_failed: ['Couldn’t reach the Concierge', 'There was a problem loading the Concierge. Please try again in a moment.'],
  };
  const [title, body] = messageMap[reason] || ['Estate Concierge unavailable', 'This feature isn’t available right now.'];
  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto" data-testid="concierge-unavailable">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-bold text-[#60A5FA] mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </button>
      <Card className="glass-card">
        <CardContent className="p-6 lg:p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }}>
            <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
          </div>
          <h2 className="text-lg font-bold text-[var(--t)] mb-2" data-testid="concierge-unavailable-title">{title}</h2>
          <p className="text-sm text-[var(--t4)] leading-relaxed" data-testid={`concierge-reason-${reason || 'unknown'}`}>{body}</p>
        </CardContent>
      </Card>
    </div>
  );
}
