import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, X } from 'lucide-react';

/**
 * PieProgress — Asymptotic pie-fill progress indicator.
 * Advances steadily but decelerates approaching ~90%, so it never
 * "finishes" before the real work is done.
 * Extracted from GuardianPage. Zero logic changes.
 */
export const PieProgress = ({ size = 18, color = 'currentColor', duration = 8 }) => {
  const r = (size - 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const progress = Math.min(1 - Math.exp((-2 * elapsed) / duration), 0.92);
      setOffset(circumference * (1 - progress));
    };
    const id = setInterval(tick, 80);
    return () => clearInterval(id);
  }, [circumference, duration]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={1.5} opacity={0.2} />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none" stroke={color} strokeWidth={2}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.1s linear' }}
      />
    </svg>
  );
};

/**
 * MarkdownText — Renders markdown-like content (headers, bold, lists, numbered items).
 * Extracted from GuardianPage. Zero logic changes.
 */
export const MarkdownText = ({ content }) => {
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
      inList = false; // eslint-disable-line no-unused-vars
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

/**
 * timeAgo — Human-readable relative time string.
 * Extracted from GuardianPage. Zero logic changes.
 */
export const timeAgo = (dateStr) => {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * ThinkingIndicator — Animated "AI is thinking" bubble with elapsed time and stop button.
 * Extracted from GuardianPage. Zero logic changes.
 */
export const ThinkingIndicator = ({ actionLoading, onStop }) => {
  const [elapsed, setElapsed] = useState(0);
  const [msgIndex, setMsgIndex] = useState(0);

  const thinkingMessages = actionLoading === 'analyze_vault'
    ? ['Reading your documents...', 'Reviewing legal provisions...', 'Checking for gaps...', 'Preparing analysis...']
    : actionLoading === 'generate_todo'
    ? ['Reviewing your estate...', 'Identifying gaps...', 'Prioritizing tasks...', 'Building your to-do list...']
    : actionLoading === 'generate_iac'
    ? ['Reading your vault documents...', 'Extracting contacts and policy numbers...', 'Building beneficiary action items...', 'Prioritizing by urgency...']
    : actionLoading === 'analyze_readiness'
    ? ['Scoring your documents...', 'Evaluating messages...', 'Checking your checklist...', 'Calculating readiness...']
    : actionLoading === 'concierge_ask'
    ? ['Reading what they shared with you...', 'Looking for the answer in their words...', 'Cross-referencing the documents...', 'Composing a careful answer...']
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
          <span className="text-[11px] text-[var(--t5)] tabular-nums">{timeStr} elapsed</span>
          <button onClick={onStop}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[var(--rd)] transition-all hover:bg-[var(--rd)]/10"
            style={{ border: '1px solid rgba(239,68,68,0.3)' }}
            data-testid="stop-analysis-btn">
            <X className="w-2.5 h-2.5 inline mr-0.5" /> Stop
          </button>
        </div>
      </div>
    </div>
  );
};
