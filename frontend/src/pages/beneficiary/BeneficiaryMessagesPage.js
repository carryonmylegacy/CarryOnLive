import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  MessageSquare,
  Video,
  Lock,
  Heart,
  Calendar,
  Play
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { Skeleton } from '../../components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BeneficiaryMessagesPage = () => {
  const { getAuthHeaders } = useAuth();
  const [messages, setMessages] = useState([]);
  const [estates, setEstates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      setEstates(estatesRes.data);
      
      // Fetch messages from all accessible estates
      const transitionedEstates = estatesRes.data.filter(e => e.status === 'transitioned');
      const allMsgs = [];
      
      for (const estate of transitionedEstates) {
        const msgsRes = await axios.get(`${API_URL}/messages/${estate.id}`, getAuthHeaders());
        allMsgs.push(...msgsRes.data.map(m => ({ ...m, estate_name: estate.name })));
      }
      
      setMessages(allMsgs);
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const hasAccessibleEstates = estates.some(e => e.status === 'transitioned');

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-white/5" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48 bg-white/5 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!hasAccessibleEstates) {
    return (
      <div className="p-6 animate-fade-in">
        <h1 className="text-3xl font-bold text-white mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Delivered Messages
        </h1>
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Lock className="w-16 h-16 mx-auto text-[#f59e0b] mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Messages Sealed</h3>
            <p className="text-[#94a3b8]">
              Messages left for you will be delivered once the estate has been transitioned.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in" data-testid="beneficiary-messages">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Delivered Messages
        </h1>
        <p className="text-[#94a3b8] mt-1">
          Messages and memories left for you by your loved ones
        </p>
      </div>

      {/* Messages Grid */}
      {messages.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <MessageSquare className="w-16 h-16 mx-auto text-[#64748b] mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Messages Yet</h3>
            <p className="text-[#94a3b8]">
              Messages will appear here once they've been delivered based on their triggers.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {messages.map((msg) => (
            <Card
              key={msg.id}
              className="glass-card cursor-pointer hover:border-[#d4af37]/30 transition-all"
              onClick={() => setSelectedMessage(msg)}
              data-testid={`message-${msg.id}`}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    msg.message_type === 'video' ? 'bg-[#8b5cf6]/20' : 'bg-[#d4af37]/20'
                  }`}>
                    {msg.message_type === 'video' ? (
                      <Video className="w-7 h-7 text-[#8b5cf6]" />
                    ) : (
                      <Heart className="w-7 h-7 text-[#d4af37]" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white mb-1">{msg.title}</h3>
                    <p className="text-[#94a3b8] text-sm">From: {msg.estate_name}</p>
                  </div>
                </div>
                
                <p className="text-[#94a3b8] line-clamp-3 mb-4">{msg.content}</p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#64748b] text-sm">
                    <Calendar className="w-4 h-4" />
                    <span>
                      Delivered {msg.delivered_at ? new Date(msg.delivered_at).toLocaleDateString() : 'Recently'}
                    </span>
                  </div>
                  
                  <Button variant="ghost" className="text-[#d4af37]">
                    {msg.message_type === 'video' ? (
                      <>
                        <Play className="w-4 h-4 mr-1" />
                        Watch
                      </>
                    ) : (
                      'Read More'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Message Detail Modal */}
      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="glass-card border-white/10 sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                selectedMessage?.message_type === 'video' ? 'bg-[#8b5cf6]/20' : 'bg-[#d4af37]/20'
              }`}>
                {selectedMessage?.message_type === 'video' ? (
                  <Video className="w-6 h-6 text-[#8b5cf6]" />
                ) : (
                  <Heart className="w-6 h-6 text-[#d4af37]" />
                )}
              </div>
              <div>
                <DialogTitle className="text-white text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {selectedMessage?.title}
                </DialogTitle>
                <p className="text-[#94a3b8] text-sm">From: {selectedMessage?.estate_name}</p>
              </div>
            </div>
          </DialogHeader>
          
          <div className="py-4">
            {selectedMessage?.message_type === 'video' && selectedMessage?.video_url && (
              <div className="mb-4 rounded-xl overflow-hidden bg-black/20">
                <div className="aspect-video flex items-center justify-center">
                  <p className="text-[#94a3b8]">Video player placeholder</p>
                </div>
              </div>
            )}
            
            <div className="prose prose-invert max-w-none">
              <p className="text-white whitespace-pre-wrap leading-relaxed">
                {selectedMessage?.content}
              </p>
            </div>
            
            {selectedMessage?.delivered_at && (
              <div className="mt-6 pt-4 border-t border-white/10 text-[#64748b] text-sm">
                Delivered on {new Date(selectedMessage.delivered_at).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BeneficiaryMessagesPage;
