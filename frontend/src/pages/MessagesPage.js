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
  Mic,
  Loader2,
  Camera,
  StopCircle,
  Gift,
  GraduationCap,
  Heart,
  Star,
  Pencil,
  CalendarDays,
  SwitchCamera
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from '../utils/toast';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';
import { Checkbox } from '../components/ui/checkbox';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const triggerIcons = {
  immediate: Send,
  age_milestone: Calendar,
  event: Star,
  specific_date: CalendarDays,
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
  const [cameraReady, setCameraReady] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [showRecordingOverlay, setShowRecordingOverlay] = useState(false);
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  // Voice recording state
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Request camera when switching to video mode
  const initCamera = async (facing) => {
    try {
      // Show overlay first so videoRef mounts
      setShowRecordingOverlay(true);

      // Release any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      const mode = facing || facingMode;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode } },
        audio: true
      });
      streamRef.current = stream;

      // Wait a tick for the overlay DOM to mount
      await new Promise(r => setTimeout(r, 100));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (error) {
      console.error('Camera error:', error);
      toast.error('Camera access denied. Please allow camera permissions.');
      setShowRecordingOverlay(false);
    }
  };

  const flipCamera = async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    if (cameraReady && !isRecording) {
      await initCamera(newMode);
    }
  };

  // Clean up camera stream
  const releaseCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setShowRecordingOverlay(false);
  };

  const runCountdown = () => {
    return new Promise((resolve) => {
      setCountdown(3);
      setTimeout(() => { setCountdown(2); }, 1000);
      setTimeout(() => { setCountdown(1); }, 2000);
      setTimeout(() => { setCountdown(null); resolve(); }, 3000);
    });
  };

  const startRecording = async () => {
    try {
      // Camera should already be initialized
      if (!streamRef.current) await initCamera();
      
      // 3-2-1 countdown
      await runCountdown();
      
      mediaRecorderRef.current = new MediaRecorder(streamRef.current);
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
        releaseCamera();
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

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      audioRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      audioRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };

      // 3-2-1 countdown
      await runCountdown();

      audioRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Voice recording error:', error);
      toast.error('Failed to start recording. Please check microphone permissions.');
    }
  };

  const stopVoiceRecording = () => {
    if (audioRecorderRef.current && isRecording) {
      audioRecorderRef.current.stop();
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

      let voiceData = null;
      if (audioBlob) {
        const reader = new FileReader();
        voiceData = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(audioBlob);
        });
      }
      
      const payload = {
        title,
        content,
        message_type: messageType,
        video_data: videoData,
        voice_data: voiceData,
        recipients: selectedRecipients,
        trigger_type: triggerType,
        trigger_value: triggerValue || null,
        trigger_age: triggerAge ? parseInt(triggerAge) : null,
        trigger_date: triggerDate || null
      };

      if (editingMessage) {
        // Edit existing
        await axios.put(`${API_URL}/messages/${editingMessage.id}`, payload, getAuthHeaders());
        // toast removed
      } else {
        // Create new
        await axios.post(`${API_URL}/messages`, { ...payload, estate_id: estate.id }, getAuthHeaders());
        // toast removed
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
      // toast removed
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
    setAudioBlob(null);
    setAudioUrl(null);
    setEditingMessage(null);
    setCountdown(null);
    releaseCamera();
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
        <Skeleton className="h-12 w-64 bg-[var(--s)]" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-48 bg-[var(--s)] rounded-2xl" />
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
              Milestone Messages (MM)
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

      <SectionLockedOverlay sectionId="messages">
      {/* Delivery info */}
      <div className="rounded-xl p-3" style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.1)' }}>
        <p className="text-xs text-[var(--bl3)] leading-relaxed">
          Messages will be securely stored and automatically delivered when the beneficiary reports each milestone through the platform. You can edit or delete any message at any time before transition.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          <TabsList className="bg-[var(--s)] p-1 w-max">
            <TabsTrigger value="all" className="text-sm data-[state=active]:bg-[#d4af37] data-[state=active]:text-[#0b1120]">
              All
            </TabsTrigger>
            <TabsTrigger value="immediate" className="text-sm data-[state=active]:bg-[#d4af37] data-[state=active]:text-[#0b1120]">
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Immediate
            </TabsTrigger>
            <TabsTrigger value="age_milestone" className="text-sm data-[state=active]:bg-[#d4af37] data-[state=active]:text-[#0b1120]">
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              Age
            </TabsTrigger>
            <TabsTrigger value="event" className="text-sm data-[state=active]:bg-[#d4af37] data-[state=active]:text-[#0b1120]">
              <Star className="w-3.5 h-3.5 mr-1.5" />
              Event
            </TabsTrigger>
          </TabsList>
        </div>

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
                            msg.message_type === 'video' ? 'bg-[#8b5cf6]/20' : msg.message_type === 'voice' ? 'bg-[#22c993]/20' : 'bg-[#d4af37]/20'
                          }`}>
                            {msg.message_type === 'video' ? (
                              <Video className="w-5 h-5 text-[#8b5cf6]" />
                            ) : msg.message_type === 'voice' ? (
                              <Mic className="w-5 h-5 text-[#22c993]" />
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
                              {msg.trigger_type === 'specific_date' && `On ${msg.trigger_date || 'specific date'}`}
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
                              aria-label="Edit message"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[#ef4444]"
                              onClick={() => handleDelete(msg.id)}
                              aria-label="Delete message"
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
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-2xl max-h-[90vh] overflow-y-scroll !top-[5vh] !translate-y-0">
          <DialogHeader>
            <DialogTitle className="text-white text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {editingMessage ? 'Edit Message' : 'Create Milestone Message'}
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              {editingMessage ? 'Update your message content and delivery settings' : 'Leave a heartfelt message for your loved ones'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-4">
            {/* Message Type Toggle */}
            <div className="flex gap-2">
              <Button
                variant={messageType === 'text' ? 'default' : 'outline'}
                onClick={() => setMessageType('text')}
                className={messageType === 'text' ? 'gold-button' : 'border-[var(--b)] text-white'}
                data-testid="msg-type-text"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Written
              </Button>
              <Button
                variant={messageType === 'voice' ? 'default' : 'outline'}
                onClick={() => setMessageType('voice')}
                className={messageType === 'voice' ? 'gold-button' : 'border-[var(--b)] text-white'}
                data-testid="msg-type-voice"
              >
                <Mic className="w-4 h-4 mr-2" />
                Voice
              </Button>
              <Button
                variant={messageType === 'video' ? 'default' : 'outline'}
                onClick={() => setMessageType('video')}
                className={messageType === 'video' ? 'gold-button' : 'border-[var(--b)] text-white'}
                data-testid="msg-type-video"
              >
                <Video className="w-4 h-4 mr-2" />
                Video
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
                <div className="border border-[var(--b)] rounded-xl p-4 bg-black/20">
                  {videoUrl ? (
                    <div className="space-y-3">
                      <video
                        src={videoUrl}
                        controls
                        className="w-full rounded-lg"
                        style={{ maxHeight: '300px' }}
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          setVideoBlob(null);
                          setVideoUrl(null);
                        }}
                        className="border-[var(--b)] text-white w-full"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Remove Video
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 py-6">
                      <Camera className="w-12 h-12 text-[var(--t5)]" />
                      <p className="text-sm text-[var(--t4)]">Record a video message for your loved one</p>
                      <Button onClick={() => initCamera()} className="gold-button">
                        <Camera className="w-5 h-5 mr-2" />
                        Open Camera
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Fullscreen Video Recording Overlay */}
            {showRecordingOverlay && (
              <div className="fixed inset-0 z-[200] bg-black flex flex-col" data-testid="video-recording-overlay">
                {/* Camera feed */}
                <div className="flex-1 relative">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                  />

                  {/* Countdown overlay */}
                  {countdown !== null && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <span className="text-8xl font-bold text-white animate-pulse" style={{ fontFamily: 'Outfit, sans-serif' }}>{countdown}</span>
                    </div>
                  )}

                  {/* Recording indicator */}
                  {isRecording && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
                      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-white text-sm font-bold">Recording</span>
                    </div>
                  )}

                  {/* Top controls — close & flip */}
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
                    <button
                      onClick={() => { if (isRecording) stopRecording(); releaseCamera(); }}
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
                      data-testid="recording-close-btn"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                    {!isRecording && (
                      <button
                        onClick={flipCamera}
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
                        data-testid="camera-flip-btn"
                      >
                        <SwitchCamera className="w-5 h-5 text-white" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Bottom controls */}
                <div className="flex-shrink-0 flex items-center justify-center py-8 px-6" style={{ background: 'rgba(0,0,0,0.8)', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}>
                  {!isRecording && countdown === null ? (
                    <button
                      onClick={startRecording}
                      className="w-20 h-20 rounded-full flex items-center justify-center transition-transform active:scale-90"
                      style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', boxShadow: '0 4px 24px rgba(212,175,55,0.4)' }}
                      data-testid="start-recording-btn"
                    >
                      <Camera className="w-8 h-8 text-[#080e1a]" />
                    </button>
                  ) : isRecording ? (
                    <button
                      onClick={stopRecording}
                      className="w-20 h-20 rounded-full flex items-center justify-center transition-transform active:scale-90"
                      style={{ background: '#ef4444', boxShadow: '0 4px 24px rgba(239,68,68,0.4)' }}
                      data-testid="stop-recording-btn"
                    >
                      <StopCircle className="w-8 h-8 text-white" />
                    </button>
                  ) : (
                    <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.1)' }}>
                      <span className="text-3xl font-bold text-white">{countdown}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Voice Recording */}
            {messageType === 'voice' && (
              <div className="space-y-3">
                <Label className="text-[#94a3b8]">Voice Recording</Label>
                <div className="border border-[var(--b)] rounded-xl p-4 bg-black/20">
                  {audioUrl ? (
                    <div className="space-y-3">
                      <audio src={audioUrl} controls className="w-full" data-testid="voice-playback" />
                      <Button
                        variant="outline"
                        onClick={() => { setAudioBlob(null); setAudioUrl(null); }}
                        className="border-[var(--b)] text-white w-full"
                        data-testid="remove-voice-btn"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Remove Recording
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 py-4">
                      {/* Countdown overlay for voice */}
                      {countdown !== null && (
                        <div className="flex items-center justify-center">
                          <span className="text-5xl font-bold text-[var(--gold)] animate-pulse" style={{ fontFamily: 'Outfit, sans-serif' }}>{countdown}</span>
                        </div>
                      )}
                      {isRecording && (
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-red-400 text-sm font-medium">Recording...</span>
                        </div>
                      )}
                      <div className="flex justify-center gap-3">
                        {!isRecording && countdown === null ? (
                          <Button onClick={startVoiceRecording} className="gold-button" data-testid="start-voice-btn">
                            <Mic className="w-5 h-5 mr-2" />
                            Start Recording
                          </Button>
                        ) : isRecording ? (
                          <Button onClick={stopVoiceRecording} className="bg-[#ef4444] hover:bg-[#dc2626] text-white" data-testid="stop-voice-btn">
                            <StopCircle className="w-5 h-5 mr-2" />
                            Stop Recording
                          </Button>
                        ) : null}
                      </div>
                      <p className="text-[#525c72] text-xs text-center">Record a voice message for your loved ones</p>
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
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--s)] cursor-pointer"
                      onClick={() => toggleRecipient(ben.user_id || ben.id)}
                    >
                      <Checkbox
                        checked={selectedRecipients.includes(ben.user_id || ben.id)}
                        onCheckedChange={() => toggleRecipient(ben.user_id || ben.id)}
                      />
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold overflow-hidden"
                        style={{ backgroundColor: ben.photo_url ? 'transparent' : ben.avatar_color + '30', color: ben.avatar_color }}
                      >
                        {ben.photo_url ? (
                          <img src={ben.photo_url} alt={ben.name} className="w-full h-full object-cover" />
                        ) : ben.initials}
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
                <SelectContent className="bg-[#1A2440] border-[var(--b)]">
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
                  <SelectItem value="specific_date">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4" />
                      On Specific Date
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
                  <SelectContent className="bg-[#1A2440] border-[var(--b)]">
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

            {triggerType === 'specific_date' && (
              <div className="space-y-2">
                <Label className="text-[#94a3b8]">Delivery Date</Label>
                <Input
                  type="date"
                  value={triggerDate}
                  onChange={(e) => setTriggerDate(e.target.value)}
                  className="input-field"
                  data-testid="message-trigger-date"
                />
                <p className="text-xs text-[var(--t5)]">Message will be delivered to the selected beneficiary(ies) on this date, after transition.</p>
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setEditingMessage(null);
                resetForm();
              }}
              className="border-[var(--b)] text-white"
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
                  {editingMessage ? 'Saving...' : 'Creating...'}
                </>
              ) : (
                <>
                  {editingMessage ? <Pencil className="w-5 h-5 mr-2" /> : <Plus className="w-5 h-5 mr-2" />}
                  {editingMessage ? 'Save Changes' : 'Create Message'}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </SectionLockedOverlay>
    </div>
  );
};

export default MessagesPage;
