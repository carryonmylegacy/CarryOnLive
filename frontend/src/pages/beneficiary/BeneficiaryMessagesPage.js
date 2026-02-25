import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { MessageSquare, ChevronLeft, Lock, Heart } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BeneficiaryMessagesPage = () => {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMsg, setSelectedMsg] = useState(null);

  useEffect(() => { fetchMessages(); }, []);

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
    return <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-4"><Skeleton className="h-10 w-64 bg-[var(--s)]" /><div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 bg-[var(--s)] rounded-2xl" />)}</div></div>;
  }

  // Message Detail View
  if (selectedMsg) {
    const m = selectedMsg;
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 animate-fade-in" data-testid="ben-message-detail">
        <button onClick={() => setSelectedMsg(null)} className="inline-flex items-center gap-1 text-sm font-bold text-[#60A5FA] mb-5">
          <ChevronLeft className="w-4 h-4" /> All Messages
        </button>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">{typeEmoji[m.trigger_type] || '💌'}</span>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-[var(--t)]">{m.title}</h1>
            <p className="text-sm text-[var(--pr2)] capitalize">{m.trigger_type?.replace(/_/g, ' ')} · {m.message_type === 'text' ? 'Written Message' : 'Video Message'}</p>
          </div>
        </div>
        <Card className="glass-card">
          <CardContent className="p-5 lg:p-8">
            <p className="text-[var(--t)] text-sm lg:text-base leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'Georgia, serif', letterSpacing: '.01em' }}>
              {m.content}
            </p>
          </CardContent>
        </Card>
        {m.is_delivered && m.delivered_at && (
          <p className="text-xs text-[var(--t5)] mt-3 text-center">
            Delivered: {new Date(m.delivered_at).toLocaleDateString()}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="beneficiary-messages"
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
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Milestone Messages</h1>
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
