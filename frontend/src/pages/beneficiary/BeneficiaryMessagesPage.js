import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { MessageSquare, ChevronLeft, Lock, Heart, Play, Pause, Volume2 } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BeneficiaryMessagesPage = () => {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState(null);
  const [videoLoading, setVideoLoading] = useState(false);

  useEffect(() => { fetchMessages();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMessages = async () => {
    try {
      const estateId = localStorage.getItem('beneficiary_estate_id');
      if (!estateId) { navigate('/beneficiary'); return; }
      const res = await axios.get(`${API_URL}/messages/${estateId}`, getAuthHeaders());
      setMessages(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const typeEmoji = { immediate: '💌', age_milestone: '🎂', event: '🎯', birthday: '🎂', wedding: '💒', graduation: '🎓', retirement: '🏖️' };

  if (loading) {
    return <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-4"><Skeleton className="h-10 w-64 bg-[var(--s)]" /><div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 bg-[var(--s)] rounded-2xl" />)}</div></div>;
  }

  // Message Detail View
  if (selectedMsg) {
    const m = selectedMsg;
    const formatLabel = m.message_type === 'text' ? 'Written Message' : m.message_type === 'video' ? 'Video Recording' : 'Voice Recording';
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 animate-fade-in" data-testid="ben-message-detail">
        <button onClick={() => { setSelectedMsg(null); setVideoBlobUrl(null); }} className="inline-flex items-center gap-1 text-sm font-bold text-[#60A5FA] mb-5">
          <ChevronLeft className="w-4 h-4" /> All Messages
        </button>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">{typeEmoji[m.trigger_type] || '💌'}</span>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-[var(--t)]">{m.title}</h1>
            <p className="text-sm text-[var(--pr2)] capitalize">{m.trigger_type?.replace(/_/g, ' ')} · {formatLabel}</p>
          </div>
        </div>

        {/* Format badge */}
        <div className="mb-4">
          <span className="inline-block px-4 py-2 rounded-lg text-sm font-bold" style={{ background: 'rgba(37,99,235,0.15)', color: 'var(--bl3)' }}>
            {m.message_type === 'text' ? '✍️ Written Message' : m.message_type === 'video' ? '🎬 Video Recording' : '🎤 Voice Recording'}
          </span>
        </div>

        {/* Text message */}
        {m.message_type === 'text' && (
          <Card className="glass-card">
            <CardContent className="p-5 lg:p-8">
              <p className="text-[var(--t)] text-sm lg:text-base leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'Georgia, serif', letterSpacing: '.01em' }}>
                {m.content}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Voice message player */}
        {(m.message_type === 'voice' || (m.message_type !== 'text' && m.message_type !== 'video')) && m.message_type !== 'text' && m.video_url && (
          <Card className="glass-card">
            <CardContent className="p-5 lg:p-8 text-center">
              <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center cursor-pointer transition-all" style={{ background: 'rgba(37,99,235,0.15)', border: '3px solid var(--bl3)' }}>
                <Play className="w-8 h-8 text-[var(--bl3)] ml-1" />
              </div>
              <div className="text-sm font-bold text-[var(--t)] mb-1">Voice Message</div>
              <div className="text-xs text-[var(--t4)]">Tap to play</div>
              <div className="h-1 bg-[var(--b)] rounded-full mt-4 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: '0%', background: 'linear-gradient(90deg, #2563EB, #0EA5E9)' }} />
              </div>
              {m.content && <p className="text-sm text-[var(--t3)] mt-4 leading-relaxed">{m.content}</p>}
            </CardContent>
          </Card>
        )}

        {/* Video message player */}
        {m.message_type === 'video' && (
          <Card className="glass-card">
            <CardContent className="p-5 lg:p-8">
              {m.video_url ? (
                videoBlobUrl ? (
                  <div className="rounded-xl overflow-hidden mb-4" style={{ background: '#000', aspectRatio: '16/9' }}>
                    <video controls autoPlay playsInline className="w-full h-full" src={videoBlobUrl}>
                      Your browser does not support video playback.
                    </video>
                  </div>
                ) : (
                  <div
                    className="rounded-xl flex items-center justify-center mb-4 cursor-pointer transition-all active:scale-[0.98]"
                    style={{ background: 'rgba(37,99,235,0.05)', border: '2px dashed rgba(37,99,235,0.2)', aspectRatio: '16/9' }}
                    onClick={async () => {
                      setVideoLoading(true);
                      try {
                        const res = await axios.get(`${API_URL}/messages/video/${m.video_url}`, { ...getAuthHeaders(), responseType: 'blob' });
                        setVideoBlobUrl(URL.createObjectURL(res.data));
                      } catch { /* silent */ }
                      finally { setVideoLoading(false); }
                    }}
                  >
                    <div className="text-center">
                      {videoLoading ? (
                        <div className="w-12 h-12 mx-auto border-3 border-[var(--bl3)] border-t-transparent rounded-full animate-spin mb-2" />
                      ) : (
                        <Play className="w-12 h-12 mx-auto text-[var(--bl3)] mb-2" />
                      )}
                      <div className="text-sm text-[var(--t4)]">{videoLoading ? 'Loading...' : 'Tap to play video'}</div>
                    </div>
                  </div>
                )
              ) : (
                <div className="rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(37,99,235,0.05)', border: '2px dashed rgba(37,99,235,0.2)', aspectRatio: '16/9' }}>
                  <div className="text-center">
                    <Play className="w-12 h-12 mx-auto text-[var(--bl3)] mb-2" />
                    <div className="text-sm text-[var(--t4)]">Video message</div>
                  </div>
                </div>
              )}
              {m.content && <p className="text-sm text-[var(--t3)] leading-relaxed">{m.content}</p>}
            </CardContent>
          </Card>
        )}

        {/* Text fallback for non-text types */}
        {m.message_type === 'text' || (!m.video_url && m.message_type !== 'video') ? null : null}

        {m.is_delivered && m.delivered_at && (
          <p className="text-xs text-[var(--t5)] mt-3 text-center">
            Delivered: {new Date(m.delivered_at).toLocaleDateString()}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="beneficiary-messages"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(139,92,246,0.12), transparent 55%)' }}>
      {/* Back */}
      <button onClick={() => navigate('/beneficiary/dashboard')} className="inline-flex items-center gap-1 text-sm font-bold text-[#60A5FA]">
        <ChevronLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(124,58,237,0.15))' }}>
          <Heart className="w-5 h-5 text-[#B794F6]" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Milestone Messages (MM)</h1>
          <p className="text-xs text-[var(--t5)]">{messages.length} messages from your benefactor</p>
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-xl p-3" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)' }}>
        <p className="text-xs text-[var(--pr2)] leading-relaxed">
          These messages were prepared by your benefactor for specific milestones in your life. Some messages are delivered immediately upon transition; others are unlocked when you report a life milestone.
        </p>
      </div>

      {/* Message Cards */}
      {messages.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <MessageSquare className="w-12 h-12 mx-auto text-[var(--t5)] mb-4" />
          <h3 className="font-bold text-[var(--t)] mb-2">No messages yet</h3>
          <p className="text-sm text-[var(--t4)]">Messages will appear here when delivered.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map(m => (
            <Card key={m.id} className="glass-card cursor-pointer hover:border-[var(--pr2)]/30 transition-all" onClick={() => setSelectedMsg(m)} data-testid={`ben-msg-${m.id}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <span className="text-2xl flex-shrink-0">{typeEmoji[m.trigger_type] || '💌'}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[var(--t)] text-sm truncate">{m.title}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[var(--pr2)]">{m.message_type === 'text' ? 'Written' : 'Video'}</span>
                    <span className="text-xs px-2 py-0.5 rounded-md capitalize" style={{ background: 'var(--prbg)', border: '1px solid rgba(139,92,246,0.2)', color: 'var(--pr2)' }}>
                      {m.trigger_type?.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Report Milestone CTA */}
      <div className="glass-card p-5 text-center">
        <Heart className="w-8 h-8 mx-auto text-[var(--gn2)] mb-3" />
        <h3 className="font-bold text-[var(--t)] mb-1">Have a life milestone to share?</h3>
        <p className="text-sm text-[var(--t4)] mb-3">Reporting a milestone may unlock additional messages from your benefactor.</p>
        <button onClick={() => navigate('/beneficiary/milestone')} className="gold-button px-6 py-2 rounded-xl text-sm font-bold">
          Report a Milestone
        </button>
      </div>
    </div>
  );
};

export default BeneficiaryMessagesPage;
