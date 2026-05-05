import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Sparkles, Send, ArrowLeft, Loader2, AlertTriangle, BookOpen, ChevronDown, ChevronUp, FileText, X } from 'lucide-react';
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
  const [previewDoc, setPreviewDoc] = useState(null); // { id, name, category, snippet, truncated, loading }
  const scrollerRef = useRef(null);

  const openDocPreview = useCallback(async (docId) => {
    if (!estateId || !docId) return;
    setPreviewDoc({ id: docId, loading: true });
    try {
      const res = await axios.get(`${API_URL}/beneficiary/concierge/document/${docId}`, {
        ...getAuthHeaders(),
        params: { estate_id: estateId },
      });
      setPreviewDoc({ ...res.data, loading: false });
    } catch (e) {
      setPreviewDoc({
        id: docId,
        loading: false,
        error: e?.response?.data?.detail || 'Could not load this document preview.',
      });
    }
  }, [estateId, getAuthHeaders]);
  const closeDocPreview = useCallback(() => setPreviewDoc(null), []);

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
        turns.push({ role: 'assistant', content: m.answer, citations: m.citations || {}, ts: m.created_at });
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
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: res.data?.answer || '',
        citations: res.data?.citations || {},
        ts: new Date().toISOString(),
      }]);
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
  // Pre-transition with nothing yet shared = empty-state message
  // instead of a chat the user can't actually use. Per founder
  // directive (May 5, 2026): if the tier-gate is on but the
  // benefactor hasn't designated any documents to flow into the
  // Concierge yet, surface the "your benefactor hasn't shared any
  // documents with you yet — once they do, the Concierge will
  // activate here" copy. Once docs are shared, the chat unlocks
  // automatically on next visit.
  const isPreTransitionEmpty = !status?.is_transitioned && (status?.accessible_doc_count || 0) === 0;

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
            <p className="text-xs text-[var(--t4)]">{status?.is_transitioned
              ? `An AI guide grounded only in the documents ${benefactorFirst} shared with you.`
              : `An AI guide grounded only in the documents ${benefactorFirst} has chosen to share with you so far.`}</p>
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
              <button
                key={d.id}
                type="button"
                onClick={() => openDocPreview(d.id)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:border-[var(--gold)] transition-colors cursor-pointer"
                style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                data-testid={`concierge-shared-doc-${d.id}`}
              >
                <FileText className="w-4 h-4 text-[var(--gold)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--t)] truncate">{d.name}</p>
                  <p className="text-[11px] text-[var(--t5)] uppercase tracking-wider">{d.category}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat surface — or pre-transition empty-state if nothing
          has been shared yet. The empty-state still sits inside the
          regular page chrome so the beneficiary can see what BEC will
          look like once the benefactor designates a document. */}
      {isPreTransitionEmpty ? (
        <Card className="glass-card" data-testid="concierge-pre-empty">
          <CardContent className="p-8 lg:p-10 text-center">
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-4" style={{ background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.35)' }}>
              <BookOpen className="w-6 h-6 text-[var(--gold)]" />
            </div>
            <h2 className="text-base lg:text-lg font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'var(--sans)' }}>
              Your Concierge is ready and waiting
            </h2>
            <p className="text-sm text-[var(--t3)] leading-relaxed max-w-md mx-auto mb-3">
              {benefactorFirst} hasn't shared any documents with you yet — once they do, the Concierge will activate here and you can ask anything about them.
            </p>
            <p className="text-xs text-[var(--t5)] italic max-w-md mx-auto">
              Common pre-transition documents include the healthcare directive, living will, and general or financial Powers of Attorney. Your Concierge can help you understand them the moment {benefactorFirst} releases them to you.
            </p>
          </CardContent>
        </Card>
      ) : (
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
              <Bubble key={i} role={m.role} content={m.content} citations={m.citations} error={m.error} onCitationClick={openDocPreview} />
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
      )}

      {previewDoc && <DocPreviewModal doc={previewDoc} onClose={closeDocPreview} />}
    </div>
  );
}

function DocPreviewModal({ doc, onClose }) {
  // Closes on Escape so a grieving beneficiary can dismiss without
  // hunting for the X button.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
      data-testid="concierge-doc-preview-backdrop"
    >
      <div
        className="rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        style={{ background: 'var(--bg2)', border: '1px solid rgba(212,175,55,0.35)' }}
        onClick={(e) => e.stopPropagation()}
        data-testid="concierge-doc-preview-modal"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--b)]">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.35)' }}>
              <FileText className="w-4 h-4 text-[var(--gold)]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-[var(--t)] truncate" data-testid="concierge-doc-preview-title">{doc.name || 'Document'}</h3>
              {doc.category && (
                <p className="text-[11px] text-[var(--t5)] uppercase tracking-wider">{doc.category}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--s)] text-[var(--t4)]"
            data-testid="concierge-doc-preview-close"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1" data-testid="concierge-doc-preview-body">
          {doc.loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--gold)]" />
            </div>
          ) : doc.error ? (
            <div className="text-sm text-[#FCA5A5]" data-testid="concierge-doc-preview-error">{doc.error}</div>
          ) : (
            <>
              {doc.description && (
                <p className="text-xs italic text-[var(--t5)] mb-3 leading-relaxed">{doc.description}</p>
              )}
              <pre
                className="text-sm leading-relaxed text-[var(--t2)] whitespace-pre-wrap break-words font-sans"
                data-testid="concierge-doc-preview-snippet"
              >{doc.snippet}</pre>
              {doc.truncated && (
                <p className="text-[11px] text-[var(--t5)] mt-3 italic">
                  Showing the first portion of this document. Ask the Concierge for specifics if you need more.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, content, citations, error, onCitationClick }) {
  const isUser = role === 'user';
  // Inline-cite renderer: convert [#N] markers in the assistant's
  // answer into small clickable gold chips that show the source
  // document's name. Clicking opens a preview modal with a snippet
  // of the underlying document. Hallucinated markers (any [#N] not
  // in the citations map) are stripped server-side.
  const renderContent = () => {
    if (typeof content !== 'string') return content;
    if (!citations || Object.keys(citations).length === 0) return content;
    const parts = [];
    const regex = /\[(#\d+)\]/g;
    let lastIndex = 0;
    let match;
    let chipIdx = 0;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index));
      const marker = match[1];
      const cite = citations[marker];
      if (cite) {
        const clickable = !!onCitationClick && !!cite.id;
        const label = cite.name && cite.name.length > 28 ? cite.name.slice(0, 25) + '…' : (cite.name || marker);
        parts.push(
          clickable ? (
            <button
              key={`c-${chipIdx++}`}
              type="button"
              title={`View source: ${cite.name}`}
              onClick={() => onCitationClick(cite.id)}
              className="inline-flex items-center align-baseline mx-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold leading-tight cursor-pointer hover:brightness-110 transition"
              style={{ background: 'rgba(212,175,55,0.18)', border: '1px solid rgba(212,175,55,0.45)', color: '#FCD34D' }}
              data-testid={`concierge-citation-${marker}`}
            >
              {label}
            </button>
          ) : (
            <span
              key={`c-${chipIdx++}`}
              title={cite.name}
              className="inline-flex items-center align-baseline mx-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold leading-tight"
              style={{ background: 'rgba(212,175,55,0.18)', border: '1px solid rgba(212,175,55,0.45)', color: '#FCD34D' }}
              data-testid={`concierge-citation-${marker}`}
            >
              {label}
            </span>
          )
        );
      } else {
        parts.push(match[0]); // unknown marker fallback (shouldn't happen)
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) parts.push(content.slice(lastIndex));
    return <>{parts}</>;
  };

  // Sources footer — distinct list of cited documents under the
  // assistant's reply. Clicking the bubble's chips inline tells the
  // beneficiary WHICH doc supports each line; the footer summarizes
  // every document referenced in this answer.
  const citedMarkers = (() => {
    if (typeof content !== 'string' || !citations) return [];
    const found = new Set();
    const regex = /\[(#\d+)\]/g;
    let m;
    while ((m = regex.exec(content)) !== null) found.add(m[1]);
    return [...found];
  })();

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
        <div>{renderContent()}</div>
        {!isUser && !error && citedMarkers.length > 0 && (
          <div className="mt-3 pt-2 border-t border-[var(--b)] flex flex-wrap items-center gap-1.5" data-testid="concierge-sources">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--t5)] mr-1">Sources</span>
            {citedMarkers.map((mk) => {
              const cite = citations?.[mk];
              const clickable = !!onCitationClick && !!cite?.id;
              const label = cite?.name || mk;
              return clickable ? (
                <button
                  key={mk}
                  type="button"
                  onClick={() => onCitationClick(cite.id)}
                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer hover:brightness-110 transition"
                  style={{ background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.30)', color: '#FCD34D' }}
                  data-testid={`concierge-source-${mk}`}
                  title={`View source: ${label}`}
                >
                  {label}
                </button>
              ) : (
                <span
                  key={mk}
                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold"
                  style={{ background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.30)', color: '#FCD34D' }}
                  data-testid={`concierge-source-${mk}`}
                >
                  {label}
                </span>
              );
            })}
          </div>
        )}
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
