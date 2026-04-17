import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { cachedGet } from '../utils/apiCache';
import { ReturnPopup } from '../components/GuidedActivation';
import {
  MessageSquare,
  Plus,
  Video,
  Send,
  X,
  Mic,
  MicOff,
  Loader2,
  Camera,
  StopCircle,
  Gift,
  GraduationCap,
  Heart,
  Star,
  Pencil,
  CalendarDays,
  Calendar,
  Download,
  ArrowLeft,
  ArrowRight,
  Check,
  Paperclip,
  FileText
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from '../utils/toast';
import { platformDownload, downloadFile } from '../utils/downloadFile';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';
import { Checkbox } from '../components/ui/checkbox';
import SlidePanel from '../components/SlidePanel';
import { resolvePhotoUrl } from '../utils/photoUrl';
import { API_URL } from '../config';
import VideoPlaybackModal from '../components/messages/VideoPlaybackModal';
import MessageCard from '../components/messages/MessageCard';
import VideoRecordingOverlay from '../components/messages/VideoRecordingOverlay';

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
  const navigate = useNavigate();
  const location = useLocation();
  const fromGettingStarted = location.state?.fromGettingStarted;
  const [messages, setMessages] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [estate, setEstate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  // Guided mode — simplified wizard for onboarding
  const [guidedMode, setGuidedMode] = useState(false);
  const [guidedStep, setGuidedStep] = useState(1);
  const autoOpenedRef = useRef(false);
  
  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [messageType, setMessageType] = useState('text');
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [triggerType, setTriggerType] = useState('immediate');
  const [triggerValue, setTriggerValue] = useState('');
  const [triggerAge, setTriggerAge] = useState('');
  const [triggerDate, setTriggerDate] = useState('');
  const [customEventLabel, setCustomEventLabel] = useState('');
  const [playingVideoUrl, setPlayingVideoUrl] = useState(null);
  const [loadingPlayback, setLoadingPlayback] = useState(false);
  const [showReturnPopup, setShowReturnPopup] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  
  // Video recording state
  const [isRecording, setIsRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoPosterUrl, setVideoPosterUrl] = useState(null);
  const [videoRemoved, setVideoRemoved] = useState(false);
  const [voiceRemoved, setVoiceRemoved] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentRemoved, setAttachmentRemoved] = useState(false);
  const attachmentInputRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [showRecordingOverlay, setShowRecordingOverlay] = useState(false);
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const videoThumbnailRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const [isSpeechListening, setIsSpeechListening] = useState(false);

  const toggleSpeechToText = () => {
    if (isSpeechListening) {
      speechRecognitionRef.current?.stop();
      setIsSpeechListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.error('Voice input not supported in this browser'); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    let finalTranscript = content || '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? ' ' : '') + event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setContent(finalTranscript + (interim ? ' ' + interim : ''));
    };
    recognition.onerror = () => setIsSpeechListening(false);
    recognition.onend = () => setIsSpeechListening(false);
    speechRecognitionRef.current = recognition;
    recognition.start();
    setIsSpeechListening(true);
  };

  // Voice recording state
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open guided creation when arriving from Getting Started
  useEffect(() => {
    if (!loading && fromGettingStarted && !autoOpenedRef.current && messages.length === 0 && estate) {
      autoOpenedRef.current = true;
      setGuidedMode(true);
      setGuidedStep(1);
      setMessageType('text');
      // Auto-select all beneficiaries
      if (beneficiaries.length > 0) {
        setSelectedRecipients(beneficiaries.map(b => b.user_id || b.id));
      }
      setShowCreateModal(true);
    }
  }, [loading, fromGettingStarted, messages.length, estate]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const estatesRes = await cachedGet(axios, `${API_URL}/estates`, getAuthHeaders());
      if (estatesRes.data.length > 0) {
        const savedId = localStorage.getItem('selected_estate_id');
        const selected = (savedId && estatesRes.data.find(e => e.id === savedId)) || estatesRes.data[0];
        setEstate(selected);
        const [msgsRes, bensRes] = await Promise.all([
          axios.get(`${API_URL}/messages/${selected.id}`, getAuthHeaders()),
          axios.get(`${API_URL}/beneficiaries/${selected.id}`, getAuthHeaders())
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
        video: { facingMode: { ideal: mode }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true }
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
      
      // Low bitrate for long recordings — 500kbps video + 64kbps audio ≈ 4MB/min
      let recorderOptions = { videoBitsPerSecond: 500000, audioBitsPerSecond: 64000 };
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        recorderOptions.mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        recorderOptions.mimeType = 'video/webm';
      }
      // iOS Safari: no mimeType needed, defaults to mp4
      mediaRecorderRef.current = new MediaRecorder(streamRef.current, recorderOptions);
      chunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        // Use the actual recorded MIME type
        const actualMime = mediaRecorderRef.current.mimeType || 'video/mp4';
        const blob = new Blob(chunksRef.current, { type: actualMime });
        setVideoBlob(blob);
        const blobUrl = URL.createObjectURL(blob);
        setVideoUrl(blobUrl);
        releaseCamera();
        // Generate poster thumbnail from recorded video
        try {
          const tempVideo = document.createElement('video');
          tempVideo.muted = true;
          tempVideo.playsInline = true;
          tempVideo.preload = 'auto';
          tempVideo.src = blobUrl;
          tempVideo.currentTime = 0.5;
          tempVideo.addEventListener('seeked', () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = tempVideo.videoWidth || 640;
              canvas.height = tempVideo.videoHeight || 480;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
              const posterDataUrl = canvas.toDataURL('image/jpeg', 0.8);
              setVideoPosterUrl(posterDataUrl);
            } catch { /* non-critical */ }
          }, { once: true });
          tempVideo.load();
        } catch { /* non-critical */ }
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);

      // Capture thumbnail from live video feed
      try {
        if (videoRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 180;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          videoThumbnailRef.current = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
        }
      } catch { /* non-critical */ }
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
      // Get mic permission FIRST (may show permission dialog)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // THEN run the countdown so user isn't waiting during permission prompt
      await runCountdown();

      audioRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      audioRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      audioRecorderRef.current.onstop = () => {
        // Use the actual recorded MIME type (Safari uses mp4, Chrome uses webm)
        const mimeType = audioRecorderRef.current?.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };

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
    if (!title) { toast.error('Message Title is required'); return; }
    if (!content) { toast.error('Message Content is required'); return; }
    if (selectedRecipients.length === 0) {
      toast.error('Please select at least one recipient');
      return;
    }
    
    setCreating(true);
    try {
      let videoThumbnail = videoThumbnailRef.current || null;

      // Create message first (without video data)
      const payload = {
        title,
        content,
        message_type: messageType,
        video_data: null,
        video_thumbnail: videoThumbnail,
        voice_data: null,
        recipients: selectedRecipients,
        trigger_type: triggerType,
        trigger_value: triggerValue || null,
        trigger_age: triggerAge ? parseInt(triggerAge) : null,
        trigger_date: triggerDate || null,
        custom_event_label: triggerValue === 'custom' ? customEventLabel : null,
      };

      // For voice, include inline (small)
      if (audioBlob) {
        const reader = new FileReader();
        const voiceData = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(audioBlob);
        });
        payload.voice_data = voiceData;
      }

      // When editing, include explicit removal flags
      if (editingMessage) {
        if (videoRemoved && !videoBlob) payload.remove_video = true;
        if (voiceRemoved && !audioBlob) payload.remove_voice = true;
      }

      let messageId = null;

      if (editingMessage) {
        await axios.put(`${API_URL}/messages/${editingMessage.id}`, payload, getAuthHeaders());
        messageId = editingMessage.id;
      } else {
        const res = await axios.post(`${API_URL}/messages`, { ...payload, estate_id: estate.id }, getAuthHeaders());
        messageId = res.data?.id;
      }

      // Upload video separately if present (chunked via FormData)
      if (videoBlob && videoBlob !== 'existing' && messageId) {
        const formData = new FormData();
        formData.append('video', videoBlob, 'video.mp4');
        await axios.post(`${API_URL}/messages/${messageId}/upload-video`, formData, {
          headers: { ...getAuthHeaders().headers, 'Content-Type': 'multipart/form-data' },
          timeout: 300000, // 5 min timeout for large videos
        });
      }

      // Upload attachment separately if present
      if (attachmentFile && messageId) {
        const formData = new FormData();
        formData.append('file', attachmentFile, attachmentFile.name);
        await axios.post(`${API_URL}/messages/${messageId}/upload-attachment`, formData, {
          headers: { ...getAuthHeaders().headers, 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        });
      }

      setShowCreateModal(false);
      const wasFirstMessage = !editingMessage && messages.length === 0;
      setEditingMessage(null);
      resetForm();
      fetchData();
      if (wasFirstMessage) {
        try {
          const prog = await axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders());
          if (!prog.data?.already_graduated) setTimeout(() => setShowReturnPopup(true), 500);
        } catch { /* skip popup */ }
      }
    } catch (error) {
      console.error('Save error:', error);
      const detail = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to ${editingMessage ? 'update' : 'create'} message: ${detail}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (messageId) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;
    
    try {
      await axios.delete(`${API_URL}/messages/${messageId}`, getAuthHeaders());
      // toast removed
      setMessages(messages.filter(m => m.id !== messageId));
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete message');
    }
  };

  const handleDownload = async (msg) => {
    setDownloadingId(msg.id);
    try {
      const msgType = msg.message_type || 'text';
      const safeTitle = (msg.title || msgType).replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'message';

      // No progress toasts — the promptToSave overlay handles user interaction
      const onProgress = undefined;

      let result;
      if ((msgType === 'video' && msg.video_url) || (msgType === 'voice' && msg.voice_url)) {
        const isVideo = msgType === 'video';
        const action = isVideo ? 'message_video' : 'message_voice';
        const params = isVideo ? { video_id: msg.video_url } : { voice_id: msg.voice_url };
        const ext = isVideo ? 'mp4' : 'webm';
        const filename = `${safeTitle}.${ext}`;

        result = await platformDownload({
          action,
          params,
          filename,
          onProgress,
          onFallback: async () => {
            const endpoint = isVideo
              ? `${API_URL}/messages/video/${msg.video_url}`
              : `${API_URL}/messages/voice/${msg.voice_url}`;
            const res = await axios.get(endpoint, { ...getAuthHeaders(), responseType: 'blob' });
            const blob = new Blob([res.data], { type: res.data.type || (isVideo ? 'video/mp4' : 'audio/webm') });
            await downloadFile(blob, filename);
          },
        });
      } else {
        // Text message → PDF
        const filename = `${safeTitle}.pdf`;
        result = await platformDownload({
          action: 'message_pdf',
          params: { message_id: msg.id },
          filename,
          onProgress,
          onFallback: async () => {
            const res = await axios.get(`${API_URL}/messages/${msg.id}/download`, { ...getAuthHeaders(), responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'application/pdf' });
            await downloadFile(blob, filename);
          },
        });
      }
      if (result === 'shared' || result === 'saved') toast.success('Saved');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('MM Download error:', err);
      toast.error(err?.message || 'Failed to download');
    } finally {
      setDownloadingId(null);
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
    setCustomEventLabel('');
    setVideoBlob(null);
    setVideoUrl(null);
    setVideoPosterUrl(null);
    setVideoRemoved(false);
    setAudioBlob(null);
    setAudioUrl(null);
    setVoiceRemoved(false);
    setAttachmentFile(null);
    setAttachmentRemoved(false);
    setEditingMessage(null);
    setCountdown(null);
    setGuidedMode(false);
    setGuidedStep(1);
    releaseCamera();
  };

  const openEdit = (msg) => {
    setEditingMessage(msg);
    setTitle(msg.title || '');
    setContent(msg.content || '');
    setMessageType(msg.message_type || 'text');
    setSelectedRecipients(msg.recipients || []);
    setTriggerType(msg.trigger_type || 'immediate');
    setTriggerValue(msg.trigger_value || '');
    setTriggerAge(msg.trigger_age ? String(msg.trigger_age) : '');
    setTriggerDate(msg.trigger_date || '');
    setCustomEventLabel(msg.custom_event_label || '');
    setShowCreateModal(true);
  };

  const toggleRecipient = (beneficiaryId) => {
    setSelectedRecipients(prev => 
      prev.includes(beneficiaryId)
        ? prev.filter(id => id !== beneficiaryId)
        : [...prev, beneficiaryId]
    );
  };

  const downloadAttachment = async (msg) => {
    try {
      const res = await axios.get(`${API_URL}/messages/${msg.id}/attachment`, {
        ...getAuthHeaders(), responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = msg.attachment_name || 'attachment';
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to download attachment'); }
  };


  const playVideo = async (msg) => {
    if (!msg.video_url) return;
    setLoadingPlayback(true);
    try {
      const res = await axios.get(`${API_URL}/messages/video/${msg.video_url}`, {
        ...getAuthHeaders(),
        responseType: 'blob',
        timeout: 30000,
      });
      if (res.data.size === 0) {
        toast.error('Video file is empty or unavailable');
        return;
      }
      setPlayingVideoUrl(URL.createObjectURL(res.data));
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        toast.error('Video took too long to load. Please try again.');
      } else if (err.response?.status === 404) {
        toast.error('Video not found. It may have been removed.');
      } else {
        toast.error('Could not load video');
      }
    } finally {
      setLoadingPlayback(false);
    }
  };

  const filteredMessages = activeTab === 'all' 
    ? messages 
    : messages.filter(m => m.trigger_type === activeTab);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6">
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
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="milestone-messages"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(139,92,246,0.15), transparent 55%), radial-gradient(ellipse at bottom right, rgba(124,58,237,0.08), transparent 55%)' }}>

      {/* Getting Started context banner */}
      {fromGettingStarted && (
        <div className="flex items-center gap-3 rounded-2xl p-4" data-testid="getting-started-banner"
          style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)' }}>
            <MessageSquare className="w-5 h-5 text-[#8b5cf6]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--t)]">Getting Started — Leave a Message</p>
            <p className="text-xs text-[var(--t4)]">Write a short message for your loved ones. You can always edit it later.</p>
          </div>
          <button onClick={() => navigate('/dashboard')}
            className="flex-shrink-0 text-xs font-bold text-[var(--t4)] px-3 py-2 rounded-xl transition-colors hover:bg-[var(--s)]"
            data-testid="back-to-dashboard-btn">
            <ArrowLeft className="w-4 h-4 inline mr-1" />Back
          </button>
        </div>
      )}

      {/* Header - matching prototype */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(124,58,237,0.15))' }}>
            <MessageSquare className="w-5 h-5 text-[#B794F6]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
              Milestone Messages (MM)
            </h1>
            <p className="text-xs text-[var(--t5)]">
              {messages.length} messages · Delivered at life milestones
            </p>
          </div>
        </div>
        <Button
          className="gold-button w-full sm:w-auto"
          onClick={() => { setEditingMessage(null); resetForm(); setShowCreateModal(true); }}
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
                <MessageSquare className="w-16 h-16 mx-auto text-[#8b5cf6] mb-4 opacity-50" />
                <h3 className="text-xl font-semibold text-white mb-2">Leave a Message for Your Loved Ones</h3>
                <p className="text-[#94a3b8] mb-2">Record a video, voice, or written message — delivered when they need it most.</p>
                <p className="text-xs text-[#64748b] mb-6">You can edit or re-record anytime. Nothing is permanent until you say so.</p>
                <Button className="gold-button text-sm sm:text-base px-5 sm:px-8 py-3" onClick={() => { setEditingMessage(null); resetForm(); setShowCreateModal(true); }}>
                  <Plus className="w-5 h-5 mr-2 flex-shrink-0" />
                  <span>Create Your First Milestone Message</span>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMessages.map((msg) => (
                <MessageCard
                  key={msg.id}
                  msg={msg}
                  user={user}
                  triggerIcons={triggerIcons}
                  loadingPlayback={loadingPlayback}
                  downloadingId={downloadingId}
                  openEdit={openEdit}
                  handleDelete={handleDelete}
                  handleDownload={handleDownload}
                  playVideo={playVideo}
                  downloadAttachment={downloadAttachment}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Message Panel */}
      <SlidePanel
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditingMessage(null); resetForm(); }}
        title={guidedMode ? `Step ${guidedStep} of 3` : (editingMessage ? 'Edit Message' : 'Create Milestone Message')}
        subtitle={guidedMode ? 'Getting Started — Leave a Milestone Message' : (editingMessage ? 'Update your message content and delivery settings' : 'Leave a heartfelt message for your loved ones')}
      >
        {/* ===== GUIDED MODE: Simplified step-by-step wizard ===== */}
        {guidedMode && !editingMessage ? (
          <div className="space-y-6" data-testid="guided-message-wizard">
            {/* Progress dots */}
            <div className="flex items-center justify-center gap-3 pb-2">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                    guidedStep > s ? 'bg-[#10b981] text-white' :
                    guidedStep === s ? 'bg-[var(--gold)] text-[#080e1a] ring-4 ring-[var(--gold)]/20' :
                    'bg-[var(--s)] text-[var(--t5)]'
                  }`}>
                    {guidedStep > s ? <Check className="w-4 h-4" /> : s}
                  </div>
                  {s < 3 && <div className={`w-8 h-0.5 rounded-full transition-colors ${guidedStep > s ? 'bg-[#10b981]' : 'bg-[var(--b)]'}`} />}
                </div>
              ))}
            </div>

            {/* Step 1: Title */}
            {guidedStep === 1 && (
              <div className="space-y-4 animate-in fade-in duration-300" data-testid="guided-step-1">
                <div className="rounded-2xl p-5" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
                  <h3 className="text-lg font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'var(--sans)' }}>
                    Give your message a name
                  </h3>
                  <p className="text-sm text-[var(--t4)] leading-relaxed">
                    This is just a label so you can find it later. Something simple like "To my family" or "Happy Birthday" works great.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[var(--t3)] text-base font-bold">Message Title</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder='e.g., "To my family" or "Happy 30th Birthday"'
                    className="input-field text-base h-14"
                    data-testid="message-title-input"
                    autoFocus
                  />
                </div>
                <Button
                  onClick={() => setGuidedStep(2)}
                  disabled={!title.trim()}
                  className="w-full h-14 text-base gold-button"
                  data-testid="guided-next-1"
                >
                  Next — Write Your Message <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            )}

            {/* Step 2: Content */}
            {guidedStep === 2 && (
              <div className="space-y-4 animate-in fade-in duration-300" data-testid="guided-step-2">
                <div className="rounded-2xl p-5" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
                  <h3 className="text-lg font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'var(--sans)' }}>
                    Write your message
                  </h3>
                  <p className="text-sm text-[var(--t4)] leading-relaxed">
                    Write whatever is in your heart. You can always come back and change it later — nothing is permanent.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[var(--t3)] text-base font-bold">Your Message</Label>
                    <span className="text-xs text-[var(--t5)] px-2 py-1 rounded-lg bg-[var(--s)]">
                      "{title}"
                    </span>
                  </div>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write your heartfelt message here..."
                    className="input-field min-h-[180px] text-base leading-relaxed"
                    data-testid="message-content-input"
                    autoFocus
                  />
                  <button type="button" onClick={toggleSpeechToText}
                    className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl transition-colors ${isSpeechListening ? 'bg-red-500/20 text-red-400' : 'text-[var(--t5)] hover:text-[var(--t3)] hover:bg-[var(--s)]'}`}
                    data-testid="message-mic-button">
                    {isSpeechListening ? <><MicOff className="w-4 h-4" /> Stop Dictation</> : <><Mic className="w-4 h-4" /> Speak Instead of Typing</>}
                  </button>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setGuidedStep(1)}
                    className="border-[var(--b)] text-[var(--t3)] h-14 px-6"
                    data-testid="guided-back-2"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button
                    onClick={() => {
                      // Ensure all beneficiaries are selected
                      if (beneficiaries.length > 0 && selectedRecipients.length === 0) {
                        setSelectedRecipients(beneficiaries.map(b => b.user_id || b.id));
                      }
                      setGuidedStep(3);
                    }}
                    disabled={!content.trim()}
                    className="flex-1 h-14 text-base gold-button"
                    data-testid="guided-next-2"
                  >
                    Next — Review & Save <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Review & Save */}
            {guidedStep === 3 && (
              <div className="space-y-4 animate-in fade-in duration-300" data-testid="guided-step-3">
                <div className="rounded-2xl p-5" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
                  <h3 className="text-lg font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'var(--sans)' }}>
                    Almost done — review your message
                  </h3>
                  <p className="text-sm text-[var(--t4)] leading-relaxed">
                    Everything looks good? Just tap "Save Message" below. You can always edit it later.
                  </p>
                </div>

                {/* Preview card */}
                <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                  <div>
                    <p className="text-xs font-bold text-[var(--t5)] uppercase tracking-wider mb-1">Title</p>
                    <p className="text-base font-bold text-[var(--t)]">{title}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--t5)] uppercase tracking-wider mb-1">Message</p>
                    <p className="text-sm text-[var(--t3)] whitespace-pre-wrap leading-relaxed">{content.length > 200 ? content.slice(0, 200) + '...' : content}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--t5)] uppercase tracking-wider mb-1">Sending To</p>
                    <div className="flex flex-wrap gap-2">
                      {beneficiaries.filter(b => selectedRecipients.includes(b.user_id || b.id)).map(b => (
                        <span key={b.id} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>
                          {b.name}
                        </span>
                      ))}
                      {selectedRecipients.length === 0 && (
                        <span className="text-xs text-[var(--t5)]">All your beneficiaries</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--t5)] uppercase tracking-wider mb-1">Delivery</p>
                    <p className="text-sm text-[var(--t3)]">When your estate transitions to your beneficiaries</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setGuidedStep(2)}
                    className="border-[var(--b)] text-[var(--t3)] h-14 px-6"
                    data-testid="guided-back-3"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={creating}
                    className="flex-1 h-14 text-base gold-button"
                    data-testid="create-message-submit"
                  >
                    {creating ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Saving...</>
                    ) : (
                      <><Check className="w-5 h-5 mr-2" /> Save Message</>
                    )}
                  </Button>
                </div>

                <p className="text-center text-xs text-[var(--t5)] leading-relaxed">
                  You can edit this message anytime, add a video or voice recording, and change the delivery settings later.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* ===== NORMAL MODE: Full-featured form ===== */
          <>
          <div className="space-y-5">
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
              <Button
                variant={messageType === 'attachment' ? 'default' : 'outline'}
                onClick={() => setMessageType('attachment')}
                className={messageType === 'attachment' ? 'gold-button' : 'border-[var(--b)] text-white'}
                data-testid="msg-type-attachment"
              >
                <Paperclip className="w-4 h-4 mr-2" />
                Attachment
              </Button>
            </div>
            
            {/* Title */}
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Message Title <span className="text-red-400">*</span></Label>
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
              <Label className="text-[#94a3b8]">Message Content <span className="text-red-400">*</span></Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your heartfelt message here..."
                className="input-field min-h-[120px]"
                data-testid="message-content-input"
              />
              <button type="button" onClick={toggleSpeechToText}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${isSpeechListening ? 'bg-red-500/20 text-red-400' : 'text-[var(--t5)] hover:text-[var(--t3)] hover:bg-[var(--s)]'}`}
                data-testid="message-mic-button">
                {isSpeechListening ? <><MicOff className="w-3.5 h-3.5" /> Stop Dictation</> : <><Mic className="w-3.5 h-3.5" /> Dictate Message</>}
              </button>
            </div>
            
            {/* Video Recording */}
            {messageType === 'video' && (
              <div className="space-y-3">
                <Label className="text-[#94a3b8]">Video Recording</Label>
                <div className="border border-[var(--b)] rounded-xl p-4 bg-black/20">
                  {(videoUrl || videoBlob === 'existing') ? (
                    <div className="space-y-3">
                      {videoUrl ? (
                        <video src={videoUrl} poster={videoPosterUrl || undefined} controls playsInline preload="metadata" className="w-full rounded-lg" style={{ maxHeight: '300px' }} />
                      ) : (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" />
                          <span className="text-sm text-[#94a3b8] ml-2">Loading video...</span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button variant="outline" className="border-[var(--b)] text-white flex-1" onClick={() => { if (videoUrl && videoBlob === 'existing') URL.revokeObjectURL(videoUrl); setVideoBlob(null); setVideoUrl(null); setVideoPosterUrl(null); setVideoRemoved(true); }}>
                          <X className="w-4 h-4 mr-2" /> Remove
                        </Button>
                        <Button variant="outline" className="border-[var(--b)] text-[#8b5cf6]" onClick={() => { if (videoUrl && videoBlob === 'existing') URL.revokeObjectURL(videoUrl); setVideoBlob(null); setVideoUrl(null); setVideoPosterUrl(null); setVideoRemoved(true); }}>
                          <Camera className="w-4 h-4 mr-2" /> Re-record
                        </Button>
                      </div>
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

            {/* Attachment Upload */}
            {messageType === 'attachment' && (
              <div className="space-y-3">
                <Label className="text-[#94a3b8]">Upload Document or Photo</Label>
                <div className="border border-[var(--b)] rounded-xl p-4 bg-black/20">
                  {attachmentFile ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.15)' }}>
                        <FileText className="w-5 h-5 text-[var(--gold)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{attachmentFile.name}</p>
                        <p className="text-xs text-[var(--t5)]">{(attachmentFile.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <Button variant="outline" size="sm" className="border-[var(--b)] text-white" onClick={() => setAttachmentFile(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 py-6">
                      <Paperclip className="w-12 h-12 text-[var(--t5)]" />
                      <p className="text-sm text-[var(--t4)] text-center">Upload a handwritten note, document, or photo</p>
                      <Button onClick={() => attachmentInputRef.current?.click()} className="gold-button" data-testid="attachment-upload-btn">
                        <Paperclip className="w-5 h-5 mr-2" />
                        Choose File
                      </Button>
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        accept="image/*,.pdf,.doc,.docx,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            if (f.size > 25 * 1024 * 1024) { toast.error('File must be under 25 MB'); return; }
                            setAttachmentFile(f);
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Fullscreen Video Recording Overlay */}
            <VideoRecordingOverlay
              videoRef={videoRef}
              isRecording={isRecording}
              countdown={countdown}
              facingMode={facingMode}
              showRecordingOverlay={showRecordingOverlay}
              startRecording={startRecording}
              stopRecording={stopRecording}
              releaseCamera={releaseCamera}
              flipCamera={flipCamera}
            />
            
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
                        onClick={() => { setAudioBlob(null); setAudioUrl(null); setVoiceRemoved(true); }}
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
                          <span className="text-5xl font-bold text-[var(--gold)] animate-pulse" style={{ fontFamily: 'var(--sans)' }}>{countdown}</span>
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
                {beneficiaries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = beneficiaries.map(b => b.user_id || b.id);
                      const allSelected = allIds.every(id => selectedRecipients.includes(id));
                      setSelectedRecipients(allSelected ? [] : allIds);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl cursor-pointer active:scale-[0.98] transition-transform duration-150"
                    style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}
                    data-testid="select-all-recipients"
                  >
                    <Checkbox
                      checked={beneficiaries.length > 0 && beneficiaries.every(b => selectedRecipients.includes(b.user_id || b.id))}
                      onCheckedChange={() => {}}
                    />
                    <span className="text-sm font-semibold" style={{ color: 'var(--gold)' }}>
                      {beneficiaries.every(b => selectedRecipients.includes(b.user_id || b.id)) ? 'Deselect All' : 'Select All'}
                    </span>
                  </button>
                )}
                {beneficiaries.length === 0 ? (
                  <p className="text-[#64748b] text-sm">No beneficiaries added yet</p>
                ) : (
                  beneficiaries.map((ben) => (
                    <div
                      key={ben.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--s)] cursor-pointer active:scale-[0.98] transition-transform duration-150"
                      onClick={(e) => { e.preventDefault(); toggleRecipient(ben.user_id || ben.id); }}
                    >
                      <Checkbox
                        checked={selectedRecipients.includes(ben.user_id || ben.id)}
                        onCheckedChange={() => {}}
                      />
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold overflow-hidden"
                        style={{ backgroundColor: ben.photo_url ? 'transparent' : ben.avatar_color + '30', color: ben.avatar_color }}
                      >
                        {ben.photo_url ? (
                          <img src={resolvePhotoUrl(ben.photo_url)} alt={ben.name} className="w-full h-full object-cover" />
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
                <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
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
                <div className="grid grid-cols-2 gap-2">
                  {eventTypes.map((event) => {
                    const active = triggerValue === event.value;
                    return (
                      <button key={event.value} type="button" onClick={() => setTriggerValue(event.value)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-transform duration-150 active:scale-[0.96]"
                        style={{
                          background: active ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
                          border: active ? '2px solid rgba(212,175,55,0.5)' : '1px solid rgba(255,255,255,0.08)',
                          color: active ? '#d4af37' : '#94a3b8',
                        }}
                        data-testid={`event-type-${event.value}`}
                      >
                        <event.icon className="w-4 h-4" />
                        {event.label}
                      </button>
                    );
                  })}
                </div>
                {triggerValue === 'custom' && (
                  <div className="mt-3 space-y-2">
                    <Label className="text-[#94a3b8] text-sm">Common Life Events</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {['First Child', 'Retirement', 'First Home', 'New Job', 'Divorce', 'Turned 18', 'Turned 25', 'Adoption', 'Deployment', 'Custom'].map(evt => (
                        <button key={evt} type="button"
                          onClick={() => { if (evt === 'Custom') { setCustomEventLabel(''); } else { setCustomEventLabel(evt); } }}
                          className="px-3 py-1.5 rounded-full text-xs font-bold transition-transform duration-150 active:scale-95"
                          style={{
                            background: customEventLabel === evt ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
                            border: customEventLabel === evt ? '1.5px solid rgba(212,175,55,0.4)' : '1px solid rgba(255,255,255,0.08)',
                            color: customEventLabel === evt ? '#d4af37' : '#94a3b8',
                          }}
                          data-testid={`custom-event-${evt.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          {evt}
                        </button>
                      ))}
                    </div>
                    {(customEventLabel === '' || !['First Child', 'Retirement', 'First Home', 'New Job', 'Divorce', 'Turned 18', 'Turned 25', 'Adoption', 'Deployment'].includes(customEventLabel)) && (
                      <div className="mt-2 space-y-1.5">
                        <Label className="text-[#94a3b8] text-sm">Describe Your Event</Label>
                        <Input
                          value={customEventLabel}
                          onChange={(e) => setCustomEventLabel(e.target.value)}
                          placeholder="e.g., Birth of first grandchild"
                          className="input-field"
                          data-testid="custom-event-label"
                        />
                        <p className="text-xs text-[var(--t5)]">The beneficiary will confirm this event to trigger delivery.</p>
                      </div>
                    )}
                  </div>
                )}
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
          
          <div className="flex justify-end gap-3 pt-4">
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
          </>
        )}
      </SlidePanel>

      {/* Video Playback Modal */}
      {playingVideoUrl && (
        <VideoPlaybackModal 
          url={playingVideoUrl} 
          onClose={() => { URL.revokeObjectURL(playingVideoUrl); setPlayingVideoUrl(null); }} 
        />
      )}

      </SectionLockedOverlay>

      {showReturnPopup && (
        <ReturnPopup step="message" onReturn={() => { setShowReturnPopup(false); navigate('/dashboard'); }}
          onAlternate={() => { setShowReturnPopup(false); setEditingMessage(null); resetForm(); setShowCreateModal(true); }} />
      )}
    </div>
  );
};

export default MessagesPage;
