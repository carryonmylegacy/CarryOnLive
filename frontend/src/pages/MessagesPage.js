import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  MessageSquare,
  Plus,
  Video,
  Trash2,
  Play,
  Pause,
  Clock,
  Users,
  Calendar,
  Send,
  X,
  Loader2,
  Camera,
  StopCircle,
  Gift,
  GraduationCap,
  Heart,
  Star,
  Pencil,
  CalendarDays
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { SectionLockBanner } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';
import { Checkbox } from '../components/ui/checkbox';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const triggerIcons = {
  immediate: Send,
  age_milestone: Calendar,
  event: Star,
};

const eventTypes = [
  { value: 'birthday', label: 'Birthday', icon: Gift },
  { value: 'graduation', label: 'Graduation', icon: GraduationCap },
  { value: 'marriage', label: 'Marriage', icon: Heart },
  { value: 'custom', label: 'Custom Event', icon: Star },
];

const MessagesPage = () => {
  const { user, getAuthHeaders } = useAuth();
  const [messages, setMessages] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  
  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [messageType, setMessageType] = useState('text');
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [triggerType, setTriggerType] = useState('immediate');
  const [triggerValue, setTriggerValue] = useState('');
  const [triggerAge, setTriggerAge] = useState('');
  const [triggerDate, setTriggerDate] = useState('');
  
  // Video recording state
  const [isRecording, setIsRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const estatesRes = await axios.get(`${API_URL}/estates`, getAuthHeaders());
      if (estatesRes.data.length > 0) {
        setEstate(estatesRes.data[0]);
        const [msgsRes, bensRes] = await Promise.all([
          axios.get(`${API_URL}/messages/${estatesRes.data[0].id}`, getAuthHeaders()),
          axios.get(`${API_URL}/beneficiaries/${estatesRes.data[0].id}`, getAuthHeaders())
        ]);
        setMessages(msgsRes.data);
        setBeneficiaries(bensRes.data);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      videoRef.current.srcObject = stream;
      videoRef.current.play();
      
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setVideoBlob(blob);
        setVideoUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Recording error:', error);
      toast.error('Failed to start recording. Please check camera permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleCreate = async () => {
    if (!title || !content) {
      toast.error('Please fill in title and message');
      return;
    }
    
    setCreating(true);
    try {
      let videoData = null;
      if (videoBlob) {
        const reader = new FileReader();
        videoData = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(videoBlob);
        });
      }
      
      const payload = {
        title,
        content,
        message_type: messageType,
        video_data: videoData,
        recipients: selectedRecipients,
        trigger_type: triggerType,
        trigger_value: triggerValue || null,
        trigger_age: triggerAge ? parseInt(triggerAge) : null,
        trigger_date: triggerDate || null
      };

      if (editingMessage) {
        // Edit existing
        await axios.put(`${API_URL}/messages/${editingMessage.id}`, payload, getAuthHeaders());
        toast.success('Message updated');
      } else {
        // Create new
        await axios.post(`${API_URL}/messages`, { ...payload, estate_id: estate.id }, getAuthHeaders());
        toast.success('Message created');
      }
      
      setShowCreateModal(false);
      setEditingMessage(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Save error:', error);
      toast.error(editingMessage ? 'Failed to update message' : 'Failed to create message');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (messageId) => {
    if (!confirm('Are you sure you want to delete this message?')) return;
    
    try {
      await axios.delete(`${API_URL}/messages/${messageId}`, getAuthHeaders());
      toast.success('Message deleted');
      setMessages(messages.filter(m => m.id !== messageId));
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete message');
    }
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setMessageType('text');
    setSelectedRecipients([]);
    setTriggerType('immediate');
    setTriggerValue('');
    setTriggerAge('');
    setTriggerDate('');
    setVideoBlob(null);
    setVideoUrl(null);
    setEditingMessage(null);
  };

  const openEdit = (msg) => {
    setEditingMessage(msg);
    setTitle(msg.title);
    setContent(msg.content);
    setMessageType(msg.message_type || 'text');
    setSelectedRecipients(msg.recipients || []);
    setTriggerType(msg.trigger_type || 'immediate');
    setTriggerValue(msg.trigger_value || '');
    setTriggerAge(msg.trigger_age ? String(msg.trigger_age) : '');
    setTriggerDate(msg.trigger_date || '');
    setVideoBlob(null);
    setVideoUrl(null);
    setShowCreateModal(true);
  };

  const toggleRecipient = (beneficiaryId) => {
    setSelectedRecipients(prev => 
      prev.includes(beneficiaryId)
        ? prev.filter(id => id !== beneficiaryId)
        : [...prev, beneficiaryId]
    );
  };

  const filteredMessages = activeTab === 'all' 
    ? messages 
    : messages.filter(m => m.trigger_type === activeTab);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-6">
        <Skeleton className="h-12 w-64 bg-white/5" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-48 bg-white/5 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="milestone-messages"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(139,92,246,0.15), transparent 55%), radial-gradient(ellipse at bottom right, rgba(124,58,237,0.08), transparent 55%)' }}>
      {/* Header - matching prototype */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(124,58,237,0.15))' }}>
            <MessageSquare className="w-5 h-5 text-[#B794F6]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Milestone Messages
            </h1>
            <p className="text-xs text-[var(--t5)]">
              {messages.length} messages · Delivered at life milestones
            </p>
          </div>
        </div>
        <Button
          className="gold-button w-full sm:w-auto"
          onClick={() => setShowCreateModal(true)}
          data-testid="create-message-button"
        >
          <Plus className="w-5 h-5 mr-2" />
          Create Message
        </Button>
      </div>

      {/* Section Lock */}
      <SectionLockBanner sectionId="messages" />

      {/* Delivery info */}
      <div className="rounded-xl p-3" style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.1)' }}>
        <p className="text-xs text-[var(--bl3)] leading-relaxed">
          Messages will be securely stored and automatically delivered when the beneficiary reports each milestone through the platform. You can edit or delete any message at any time before transition.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white/5 p-1">
          <TabsTrigger value="all" className="data-[state=active]:bg-[#d4af37] data-[state=active]:text-[#0b1120]">
            All Messages
          </TabsTrigger>
          <TabsTrigger value="immediate" className="data-[state=active]:bg-[#d4af37] data-[state=active]:text-[#0b1120]">
            <Send className="w-4 h-4 mr-2" />
            Immediate
          </TabsTrigger>
          <TabsTrigger value="age_milestone" className="data-[state=active]:bg-[#d4af37] data-[state=active]:text-[#0b1120]">
            <Calendar className="w-4 h-4 mr-2" />
            Age Milestone
          </TabsTrigger>
          <TabsTrigger value="event" className="data-[state=active]:bg-[#d4af37] data-[state=active]:text-[#0b1120]">
            <Star className="w-4 h-4 mr-2" />
            Event Triggered
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredMessages.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-12 text-center">
                <MessageSquare className="w-16 h-16 mx-auto text-[#64748b] mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No messages yet</h3>
                <p className="text-[#94a3b8] mb-6">
                  Create your first milestone message
                </p>
                <Button className="gold-button" onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-5 h-5 mr-2" />
                  Create Message
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMessages.map((msg) => {
                const TriggerIcon = triggerIcons[msg.trigger_type] || Send;
                return (
                  <Card key={msg.id} className="glass-card group" data-testid={`message-${msg.id}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            msg.message_type === 'video' ? 'bg-[#8b5cf6]/20' : 'bg-[#d4af37]/20'
                          }`}>
                            {msg.message_type === 'video' ? (
                              <Video className="w-5 h-5 text-[#8b5cf6]" />
                            ) : (
                              <MessageSquare className="w-5 h-5 text-[#d4af37]" />
                            )}
                          </div>
                          <div>
                            <h3 className="text-white font-medium">{msg.title}</h3>
                            <p className="text-[#64748b] text-sm flex items-center gap-1">
                              <TriggerIcon className="w-3 h-3" />
                              {msg.trigger_type === 'immediate' && 'Deliver on transition'}
                              {msg.trigger_type === 'age_milestone' && `At age ${msg.trigger_age}`}
                              {msg.trigger_type === 'event' && `On ${msg.trigger_value}`}
                            </p>
                          </div>
                        </div>
                        
                        {msg.is_delivered && (
                          <span className="px-2 py-1 bg-[#10b981]/20 text-[#10b981] text-xs rounded-full">
                            Delivered
                          </span>
                        )}
                      </div>
                      
                      <p className="text-[#94a3b8] text-sm line-clamp-3 mb-4">{msg.content}</p>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[#64748b] text-xs">
                          <Users className="w-3 h-3" />
                          {msg.recipients?.length || 0} recipients
                        </div>
                        
                        {user?.role === 'benefactor' && !msg.is_delivered && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[#60A5FA]"
                              onClick={() => openEdit(msg)}
                              data-testid={`edit-message-${msg.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[#ef4444]"
                              onClick={() => handleDelete(msg.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Message Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="glass-card border-white/10 sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Create Milestone Message
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              Leave a heartfelt message for your loved ones
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-4">
            {/* Message Type Toggle */}
            <div className="flex gap-2">
              <Button
                variant={messageType === 'text' ? 'default' : 'outline'}
                onClick={() => setMessageType('text')}
                className={messageType === 'text' ? 'gold-button' : 'border-white/10 text-white'}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Text Message
              </Button>
              <Button
                variant={messageType === 'video' ? 'default' : 'outline'}
                onClick={() => setMessageType('video')}
                className={messageType === 'video' ? 'gold-button' : 'border-white/10 text-white'}
              >
                <Video className="w-4 h-4 mr-2" />
                Video Message
              </Button>
            </div>
            
            {/* Title */}
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Message Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Happy 30th Birthday!"
                className="input-field"
                data-testid="message-title-input"
              />
            </div>
            
            {/* Content */}
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Message Content</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your heartfelt message here..."
                className="input-field min-h-[120px]"
                data-testid="message-content-input"
              />
            </div>
            
            {/* Video Recording */}
            {messageType === 'video' && (
              <div className="space-y-3">
                <Label className="text-[#94a3b8]">Video Recording</Label>
                <div className="border border-white/10 rounded-xl p-4 bg-black/20">
                  {videoUrl ? (
                    <div className="space-y-3">
                      <video
                        src={videoUrl}
                        controls
                        className="w-full rounded-lg max-h-[200px]"
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          setVideoBlob(null);
                          setVideoUrl(null);
                        }}
                        className="border-white/10 text-white w-full"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Remove Video
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <video
                        ref={videoRef}
                        className="w-full rounded-lg max-h-[200px] bg-[#0F1629]"
                        muted
                      />
                      <div className="flex justify-center gap-3">
                        {!isRecording ? (
                          <Button onClick={startRecording} className="gold-button">
                            <Camera className="w-5 h-5 mr-2" />
                            Start Recording
                          </Button>
                        ) : (
                          <Button onClick={stopRecording} className="bg-[#ef4444] hover:bg-[#dc2626] text-white">
                            <StopCircle className="w-5 h-5 mr-2" />
                            Stop Recording
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Recipients */}
            <div className="space-y-3">
              <Label className="text-[#94a3b8]">Recipients</Label>
              <div className="space-y-2">
                {beneficiaries.length === 0 ? (
                  <p className="text-[#64748b] text-sm">No beneficiaries added yet</p>
                ) : (
                  beneficiaries.map((ben) => (
                    <div
                      key={ben.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/5 cursor-pointer"
                      onClick={() => toggleRecipient(ben.user_id || ben.id)}
                    >
                      <Checkbox
                        checked={selectedRecipients.includes(ben.user_id || ben.id)}
                        onCheckedChange={() => toggleRecipient(ben.user_id || ben.id)}
                      />
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
                        style={{ backgroundColor: ben.avatar_color + '30', color: ben.avatar_color }}
                      >
                        {ben.initials}
                      </div>
                      <div>
                        <p className="text-white text-sm">{ben.name}</p>
                        <p className="text-[#64748b] text-xs">{ben.relation}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            {/* Trigger */}
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Delivery Trigger</Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger className="input-field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2440] border-white/10">
                  <SelectItem value="immediate">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4" />
                      Deliver on Estate Transition
                    </div>
                  </SelectItem>
                  <SelectItem value="age_milestone">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      At Specific Age
                    </div>
                  </SelectItem>
                  <SelectItem value="event">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4" />
                      On Life Event
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Trigger Value */}
            {triggerType === 'age_milestone' && (
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">At Age</Label>
                <Input
                  type="number"
                  value={triggerAge}
                  onChange={(e) => setTriggerAge(e.target.value)}
                  placeholder="e.g., 30"
                  className="input-field"
                  min="1"
                  max="100"
                />
              </div>
            )}
            
            {triggerType === 'event' && (
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">Event Type</Label>
                <Select value={triggerValue} onValueChange={setTriggerValue}>
                  <SelectTrigger className="input-field">
                    <SelectValue placeholder="Select event type" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A2440] border-white/10">
                    {eventTypes.map((event) => (
                      <SelectItem key={event.value} value={event.value}>
                        <div className="flex items-center gap-2">
                          <event.icon className="w-4 h-4" />
                          {event.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                resetForm();
              }}
              className="border-white/10 text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !title || !content}
              className="gold-button"
              data-testid="create-message-submit"
            >
              {creating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 mr-2" />
                  Create Message
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MessagesPage;
