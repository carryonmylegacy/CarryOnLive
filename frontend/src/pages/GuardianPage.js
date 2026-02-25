import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Bot,
  Send,
  User,
  Loader2,
  Sparkles,
  MessageCircle
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const suggestedQuestions = [
  "What should I include in my will?",
  "How do I set up a trust for my children?",
  "What documents do I need for estate planning?",
  "How can I minimize estate taxes?",
  "What is a power of attorney?",
];

const GuardianPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    // Initialize with welcome message
    setMessages([{
      role: 'assistant',
      content: `Hello ${user?.name?.split(' ')[0] || 'there'}! 👋 I'm the Estate Guardian, your AI assistant for estate planning. I can help you understand estate planning concepts, organize your documents, and answer questions about wills, trusts, and more. How can I assist you today?`
    }]);
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (messageText) => {
    if (!messageText.trim()) return;
    
    const userMessage = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    
    try {
      const response = await axios.post(`${API_URL}/chat/guardian`, {
        message: messageText,
        session_id: sessionId
      }, getAuthHeaders());
      
      setSessionId(response.data.session_id);
      setMessages(prev => [...prev, { role: 'assistant', content: response.data.response }]);
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Failed to get response. Please try again.');
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'I apologize, but I encountered an issue. Please try again or contact support if the problem persists.' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="p-6 h-[calc(100vh-4rem)] lg:h-screen flex flex-col animate-fade-in" data-testid="estate-guardian">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#d4af37] to-[#fcd34d] flex items-center justify-center gold-glow">
            <Bot className="w-6 h-6 text-[#0b1120]" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Estate Guardian
            </h1>
            <p className="text-[#94a3b8] text-sm flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              AI-powered estate planning assistant
            </p>
          </div>
        </div>
      </div>

      {/* Chat Container */}
      <Card className="glass-card flex-1 flex flex-col overflow-hidden">
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
                    ? 'bg-[#d4af37]/20 text-[#d4af37]' 
                    : 'bg-gradient-to-br from-[#d4af37] to-[#fcd34d] text-[#0b1120]'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-[#d4af37] text-[#0b1120]'
                    : 'bg-white/5 text-white'
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
                <div className="bg-white/5 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 text-[#94a3b8]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Suggested Questions */}
        {messages.length <= 1 && (
          <div className="px-4 pb-2">
            <p className="text-[#64748b] text-xs mb-2">Suggested questions:</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((q, index) => (
                <button
                  key={index}
                  onClick={() => sendMessage(q)}
                  className="text-xs px-3 py-1.5 rounded-full bg-white/5 text-[#94a3b8] hover:bg-white/10 hover:text-white transition-colors"
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
              placeholder="Ask the Estate Guardian..."
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
