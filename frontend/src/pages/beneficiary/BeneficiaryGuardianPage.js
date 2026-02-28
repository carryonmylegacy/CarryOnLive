import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  Bot, Send, User, Loader2, Sparkles, ChevronLeft, Lock, FileText
} from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ScrollArea } from '../../components/ui/scroll-area';
import { toast } from 'sonner';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BeneficiaryGuardianPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [estateId, setEstateId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const scrollRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const eid = localStorage.getItem('beneficiary_estate_id');
    setEstateId(eid);
    fetchDocs(eid);
    setMessages([{
      role: 'assistant',
      content: `Hello ${user?.name?.split(' ')[0] || 'there'}. I'm EGA — your AI estate law specialist.\n\nI have access to the **sealed vault documents** and can help you understand the estate plan, answer questions about the documents, and provide guidance on the IAC.\n\n**Note:** The vault is sealed and read-only. I can analyze documents but cannot modify anything.`
    }]);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, loading]);

  const fetchDocs = async (eid) => {
    if (!eid) return;
    try {
      const res = await axios.get(`${API_URL}/documents/${eid}`, getAuthHeaders());
      setDocuments(res.data);
    } catch (err) { console.error(err); }
  };

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/chat/guardian`, {
        message: text,
        session_id: sessionId,
        estate_id: estateId
      }, { ...getAuthHeaders(), timeout: 120000 });
      setSessionId(res.data.session_id);
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'I encountered an issue. Please try again.' }]);
    } finally { setLoading(false); }
  };

  const handleSubmit = (e) => { e.preventDefault(); sendMessage(input); };

  return (
    <div className="p-4 lg:p-6 h-[calc(100vh-4rem)] lg:h-screen flex flex-col animate-fade-in pt-20 lg:pt-6" data-testid="beneficiary-guardian">
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.2), rgba(14,165,233,0.15))' }}>
            <Sparkles className="w-5 h-5 text-[#60A5FA]" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Estate Guardian (EGA)</h1>
            <p className="text-xs text-[var(--t5)]">50-State Estate Law Brain · Vault-Analyzed · Read-Only</p>
          </div>
        </div>
      </div>

      {/* Sealed notice + Disclaimer */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="flex-1 rounded-xl p-2.5 flex items-center gap-2" style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.1)' }}>
          <Lock className="w-4 h-4 text-[#7AABFD] flex-shrink-0" />
          <span className="text-xs text-[var(--t4)]">Sealed vault · {documents.length} documents accessible</span>
        </div>
        <div className="flex-1 rounded-xl p-2.5" style={{ background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.15)' }}>
          <span className="text-xs text-[var(--yw)]">EGA does not provide legal advice. Consult licensed professionals.</span>
        </div>
      </div>

      {/* Chat */}
      <Card className="glass-card flex-1 flex flex-col overflow-hidden min-h-0">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user' ? 'bg-[var(--gold)]/20 text-[var(--gold)]' : 'bg-gradient-to-br from-[#d4af37] to-[#fcd34d] text-[#0b1120]'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user' ? 'bg-[var(--gold)] text-[#0b1120]' : 'bg-[var(--s)] text-[var(--t2)]'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#d4af37] to-[#fcd34d] flex items-center justify-center">
                  <Bot className="w-4 h-4 text-[#0b1120]" />
                </div>
                <div className="bg-[var(--s)] rounded-2xl px-4 py-3 flex items-center gap-2 text-[var(--t4)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Analyzing sealed vault...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Vault sidebar (desktop) */}
        {documents.length > 0 && (
          <div className="hidden lg:block border-t border-[var(--b)] p-3">
            <div className="text-xs font-bold text-[var(--t4)] uppercase tracking-wider mb-2">Sealed Vault ({documents.length})</div>
            <div className="flex flex-wrap gap-1">
              {documents.slice(0, 8).map(d => (
                <span key={d.id} className="text-xs px-2 py-1 rounded bg-[var(--s)] text-[var(--t3)] truncate max-w-[140px]">{d.name}</span>
              ))}
              {documents.length > 8 && <span className="text-xs text-[var(--t5)]">+{documents.length - 8} more</span>}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-[var(--b)]">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about the sealed vault documents..." className="input-field flex-1" disabled={loading} data-testid="ben-guardian-input" />
            <Button type="submit" disabled={loading || !input.trim()} className="gold-button px-4" data-testid="ben-guardian-send">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
};

export default BeneficiaryGuardianPage;
