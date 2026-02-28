import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Clock, FileText, Users, MessageSquare, CheckCircle2,
  Shield, Activity, Loader2, ChevronDown, Filter, ChevronRight, Pencil
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORY_CONFIG = {
  milestone:  { icon: Shield,        color: '#d4af37', bg: 'rgba(212,175,55,0.12)',  label: 'Milestones' },
  document:   { icon: FileText,      color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  label: 'Documents' },
  family:     { icon: Users,         color: '#22C993', bg: 'rgba(34,201,147,0.12)',  label: 'Family' },
  message:    { icon: MessageSquare, color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', label: 'Messages' },
  checklist:  { icon: CheckCircle2,  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', label: 'Checklist' },
  activity:   { icon: Activity,      color: '#94A3B8', bg: 'rgba(148,163,184,0.08)', label: 'Activity' },
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
};

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
};

const groupByDate = (events) => {
  const groups = {};
  events.forEach(e => {
    const key = formatDate(e.date) || 'Unknown Date';
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });
  return Object.entries(groups);
};

const TimelineEvent = ({ event, index, isLast, onNavigate }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const config = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.activity;
  const Icon = config.icon;
  const isEdited = event.type?.includes('edited');
  const hasLink = !!event.link;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex gap-4 group" style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateX(0)' : 'translateX(-20px)',
      transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${index * 0.05}s`,
    }}>
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
          style={{ background: config.bg, border: `2px solid ${config.color}40`, boxShadow: `0 0 12px ${config.color}15` }}>
          {isEdited ? <Pencil className="w-4 h-4" style={{ color: config.color }} /> : <Icon className="w-4 h-4" style={{ color: config.color }} />}
        </div>
        {!isLast && (
          <div className="w-[2px] flex-1 my-1" style={{ background: `linear-gradient(180deg, ${config.color}30, transparent)` }} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <div
          onClick={() => hasLink && onNavigate(event.link)}
          className={`rounded-xl p-4 transition-all duration-300 ${hasLink ? 'cursor-pointer hover:border-[var(--gold)]/30 hover:bg-white/[0.03]' : ''}`}
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
          data-testid={`timeline-event-${event.type}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h4 className="text-[var(--t)] font-semibold text-sm">{event.title}</h4>
              <p className="text-[var(--t4)] text-sm mt-0.5 truncate">{event.description}</p>
              {event.metadata?.recipient && (
                <p className="text-[var(--t5)] text-xs mt-1">For: {event.metadata.recipient}</p>
              )}
              {event.metadata?.edited_by && (
                <p className="text-[var(--t5)] text-xs mt-1">By: {event.metadata.edited_by}</p>
              )}
              {event.metadata?.category && (
                <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-xs"
                  style={{ background: config.bg, color: config.color }}>
                  {event.metadata.category}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[var(--t5)] text-xs whitespace-nowrap">{formatTime(event.date)}</span>
              {hasLink && <ChevronRight className="w-4 h-4 text-[var(--t5)] opacity-0 group-hover:opacity-100 transition-opacity" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const LegacyTimelinePage = () => {
  const { token } = useAuth();
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        let estateId = localStorage.getItem('selected_estate_id');
        
        // If no estate selected, fetch estates and pick the first one
        if (!estateId) {
          const estatesRes = await axios.get(`${API_URL}/estates`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const estates = estatesRes.data || [];
          if (estates.length > 0) {
            estateId = estates[0].id;
            localStorage.setItem('selected_estate_id', estateId);
          }
        }
        
        if (!estateId) { setLoading(false); return; }
        const res = await axios.get(`${API_URL}/timeline/${estateId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setEvents(res.data.events || []);
        setSummary(res.data.summary || null);
      } catch (err) {
        console.error('Timeline fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    if (token) fetchTimeline();
  }, [token]);

  const filteredEvents = filter === 'all' ? events : events.filter(e => e.category === filter);
  const displayEvents = showAll ? filteredEvents : filteredEvents.slice(0, 30);
  const dateGroups = groupByDate(displayEvents);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-[var(--gold)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in max-w-4xl mx-auto" data-testid="legacy-timeline-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Legacy Timeline
        </h1>
        <p className="text-[var(--t4)] mt-1 text-sm sm:text-base">
          A chronological story of your estate — every document, message, and milestone.
        </p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="timeline-summary">
          {[
            { label: 'Documents', value: summary.documents, color: '#60A5FA', icon: FileText },
            { label: 'Beneficiaries', value: summary.beneficiaries, color: '#22C993', icon: Users },
            { label: 'Messages', value: summary.messages, color: '#A78BFA', icon: MessageSquare },
            { label: 'Completed', value: summary.checklist_completed, color: '#F59E0B', icon: CheckCircle2 },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4 text-center" style={{
              background: `linear-gradient(135deg, ${s.color}08, transparent)`,
              border: `1px solid ${s.color}15`,
            }}>
              <s.icon className="w-5 h-5 mx-auto mb-2" style={{ color: s.color }} />
              <div className="text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
              <div className="text-[var(--t5)] text-xs">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap" data-testid="timeline-filters">
        <Filter className="w-4 h-4 text-[var(--t5)]" />
        <button onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            filter === 'all' ? 'bg-[var(--gold)] text-[#080e1a]' : 'bg-[var(--s)] text-[var(--t4)] hover:text-[var(--t)]'
          }`} data-testid="filter-all">
          All ({events.length})
        </button>
        {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
          const count = events.filter(e => e.category === key).length;
          if (count === 0) return null;
          return (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filter === key ? 'text-[#080e1a]' : 'text-[var(--t4)] hover:text-[var(--t)]'
              }`}
              style={{
                background: filter === key ? cfg.color : 'var(--s)',
              }}
              data-testid={`filter-${key}`}>
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {filteredEvents.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Clock className="w-12 h-12 text-[var(--t5)] mx-auto mb-3" />
            <h3 className="text-[var(--t)] font-semibold text-lg mb-1">No Events Yet</h3>
            <p className="text-[var(--t4)] text-sm">
              Your legacy timeline will grow as you add documents, messages, and beneficiaries.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div data-testid="timeline-events">
          {dateGroups.map(([date, groupEvents], gi) => (
            <div key={date} className="mb-2">
              {/* Date header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="px-3 py-1 rounded-lg text-xs font-bold text-[var(--gold)]"
                  style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)' }}>
                  {date}
                </div>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(212,175,55,0.15), transparent)' }} />
              </div>

              {/* Events for this date */}
              {groupEvents.map((event, i) => (
                <TimelineEvent
                  key={`${gi}-${i}`}
                  event={event}
                  index={i}
                  isLast={gi === dateGroups.length - 1 && i === groupEvents.length - 1}
                />
              ))}
            </div>
          ))}

          {/* Show more */}
          {!showAll && filteredEvents.length > 30 && (
            <div className="text-center mt-4">
              <Button onClick={() => setShowAll(true)} variant="outline"
                className="text-[var(--t4)] border-[var(--b)] hover:border-[var(--gold)] hover:text-[var(--gold)]"
                data-testid="timeline-show-more">
                <ChevronDown className="w-4 h-4 mr-2" />
                Show All {filteredEvents.length} Events
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LegacyTimelinePage;
