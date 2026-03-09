import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  Camera,
  Gift,
  GraduationCap,
  Heart,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Save,
  Send,
  Star,
  StopCircle,
  SwitchCamera,
  Users,
  Video,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Skeleton } from '../components/ui/skeleton';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../utils/toast';
import { cachedGet } from '../utils/apiCache';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const eventTypes = [
  { value: 'birthday', label: 'Birthday', icon: Gift },
  { value: 'graduation', label: 'Graduation', icon: GraduationCap },
  { value: 'marriage', label: 'Marriage', icon: Heart },
  { value: 'custom', label: 'Custom Event', icon: Star },
];

export default function EditMilestoneMessagePage() {
  const { messageId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAuthHeaders } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [messageRecord, setMessageRecord] = useState(location.state?.message || null);
  const [beneficiaries, setBeneficiaries] = useState([]);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [messageType, setMessageType] = useState('text');
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [triggerType, setTriggerType] = useState('immediate');
  const [triggerValue, setTriggerValue] = useState('');
  const [triggerAge, setTriggerAge] = useState('');
  const [triggerDate, setTriggerDate] = useState('');
  const [customEventLabel, setCustomEventLabel] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoPosterUrl, setVideoPosterUrl] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [showRecordingOverlay, setShowRecordingOverlay] = useState(false);
  const [isSpeechListening, setIsSpeechListening] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);

  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const videoThumbnailRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const loadMessageIntoForm = (message) => {
    setMessageRecord(message);
    setTitle(message.title || '');
    setContent(message.content || '');
    setMessageType(message.message_type || 'text');
    setSelectedRecipients(message.recipients || []);
    setTriggerType(message.trigger_type || 'immediate');
    setTriggerValue(message.trigger_value || '');
    setTriggerAge(message.trigger_age ? String(message.trigger_age) : '');
    setTriggerDate(message.trigger_date || '');
    setCustomEventLabel(message.custom_event_label || '');
  };

  useEffect(() => {
    const fetchMessageData = async () => {
      try {
        const estatesRes = await cachedGet(axios, `${API_URL}/estates`, getAuthHeaders());
        const estateId = estatesRes.data?.[0]?.id;
        if (!estateId) {
          toast.error('Estate not found');
          navigate('/messages', { replace: true });
          return;
        }

        const [messagesRes, beneficiariesRes] = await Promise.all([
          axios.get(`${API_URL}/messages/${estateId}`, getAuthHeaders()),
          axios.get(`${API_URL}/beneficiaries/${estateId}`, getAuthHeaders()),
        ]);

        setBeneficiaries(beneficiariesRes.data || []);
        const target = messagesRes.data.find((item) => item.id === messageId);
        if (!target) {
          toast.error('Message not found');
          navigate('/messages', { replace: true });
          return;
        }
        loadMessageIntoForm(target);
      } catch (error) {
        console.error('Fetch message error:', error);
        toast.error('Failed to load message details');
        navigate('/messages', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    fetchMessageData();
  }, [getAuthHeaders, messageId, navigate]);

  useEffect(() => {
    const loadExistingVideo = async () => {
      if (!messageRecord?.video_url) {
        setVideoBlob(null);
        setVideoUrl(null);
        setVideoPosterUrl(null);
        return;
      }

      setVideoBlob('existing');
      if (messageRecord.video_thumbnail) {
        setVideoPosterUrl(`data:image/jpeg;base64,${messageRecord.video_thumbnail}`);
      } else {
        setVideoPosterUrl(null);
      }

      try {
        const response = await axios.get(`${API_URL}/messages/video/${messageRecord.video_url}`, {
          ...getAuthHeaders(),
          responseType: 'blob',
        });
        const blobUrl = URL.createObjectURL(response.data);
        setVideoUrl(blobUrl);
      } catch (error) {
        console.error('Load video error:', error);
        setVideoBlob(null);
        setVideoUrl(null);
        setVideoPosterUrl(null);
        toast.error('Could not load video');
      }
    };

    if (!loading) {
      loadExistingVideo();
    }

    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [getAuthHeaders, loading, messageRecord?.video_thumbnail, messageRecord?.video_url]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      speechRecognitionRef.current?.stop?.();
    };
  }, [audioUrl, videoUrl]);

  const toggleSpeechToText = () => {
    if (isSpeechListening) {
      speechRecognitionRef.current?.stop();
      setIsSpeechListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice input not supported in this browser');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    let finalTranscript = content || '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) {
          finalTranscript += `${finalTranscript ? ' ' : ''}${event.results[index][0].transcript}`;
        } else {
          interim += event.results[index][0].transcript;
        }
      }
      setContent(finalTranscript + (interim ? ` ${interim}` : ''));
    };
    recognition.onerror = () => setIsSpeechListening(false);
    recognition.onend = () => setIsSpeechListening(false);
    speechRecognitionRef.current = recognition;
    recognition.start();
    setIsSpeechListening(true);
  };

  const initCamera = async (facing) => {
    try {
      setShowRecordingOverlay(true);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing || facingMode }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      await new Promise((resolve) => setTimeout(resolve, 100));
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
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    if (cameraReady && !isRecording) {
      await initCamera(nextMode);
    }
  };

  const releaseCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setShowRecordingOverlay(false);
  };

  const runCountdown = () => new Promise((resolve) => {
    setCountdown(3);
    setTimeout(() => setCountdown(2), 1000);
    setTimeout(() => setCountdown(1), 2000);
    setTimeout(() => {
      setCountdown(null);
      resolve();
    }, 3000);
  });

  const startRecording = async () => {
    try {
      if (!streamRef.current) await initCamera();
      await runCountdown();

      const recorderOptions = { videoBitsPerSecond: 500000, audioBitsPerSecond: 64000 };
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        recorderOptions.mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        recorderOptions.mimeType = 'video/webm';
      }

      mediaRecorderRef.current = new MediaRecorder(streamRef.current, recorderOptions);
      chunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      mediaRecorderRef.current.onstop = () => {
        const actualMime = mediaRecorderRef.current.mimeType || 'video/mp4';
        const blob = new Blob(chunksRef.current, { type: actualMime });
        setVideoBlob(blob);
        const blobUrl = URL.createObjectURL(blob);
        setVideoUrl(blobUrl);
        releaseCamera();
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
              const context = canvas.getContext('2d');
              context.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
              setVideoPosterUrl(canvas.toDataURL('image/jpeg', 0.8));
            } catch {
              // non-critical preview error
            }
          }, { once: true });
          tempVideo.load();
        } catch {
          // non-critical preview error
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);

      try {
        if (videoRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 180;
          const context = canvas.getContext('2d');
          context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          videoThumbnailRef.current = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
        }
      } catch {
        // non-critical preview error
      }
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

      await runCountdown();

      audioRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      audioRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      audioRecorderRef.current.onstop = () => {
        const mimeType = audioRecorderRef.current?.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const blobUrl = URL.createObjectURL(blob);
        setAudioUrl(blobUrl);
        stream.getTracks().forEach((track) => track.stop());
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

  const toggleRecipient = (beneficiaryId) => {
    setSelectedRecipients((current) => (
      current.includes(beneficiaryId)
        ? current.filter((id) => id !== beneficiaryId)
        : [...current, beneficiaryId]
    ));
  };

  const clearExistingVideo = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoBlob(null);
    setVideoUrl(null);
    setVideoPosterUrl(null);
  };

  const handleSave = async () => {
    if (!title) { toast.error('Message Title is required'); return; }
    if (!content) { toast.error('Message Content is required'); return; }
    if (selectedRecipients.length === 0) {
      toast.error('Please select at least one recipient');
      return;
    }

    setSaving(true);
    try {
      let videoThumbnail = videoThumbnailRef.current || messageRecord?.video_thumbnail || null;
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
        trigger_age: triggerAge ? parseInt(triggerAge, 10) : null,
        trigger_date: triggerDate || null,
        custom_event_label: triggerValue === 'custom' ? customEventLabel : null,
      };

      if (audioBlob) {
        const reader = new FileReader();
        payload.voice_data = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(audioBlob);
        });
      }

      await axios.put(`${API_URL}/messages/${messageId}`, payload, getAuthHeaders());

      if (videoBlob && videoBlob !== 'existing') {
        const formData = new FormData();
        formData.append('video', videoBlob, 'video.mp4');
        await axios.post(`${API_URL}/messages/${messageId}/upload-video`, formData, {
          headers: { ...getAuthHeaders().headers, 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
        });
      }

      toast.success('Message updated');
      navigate('/messages', { replace: true });
    } catch (error) {
      console.error('Update message error:', error);
      const detail = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to update message: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6" data-testid="edit-message-loading-page">
        <Skeleton className="h-12 w-60 bg-[var(--s)]" />
        <Skeleton className="h-64 rounded-3xl bg-[var(--s)]" />
        <Skeleton className="h-80 rounded-3xl bg-[var(--s)]" />
      </div>
    );
  }

  if (messageRecord?.is_delivered) {
    return (
      <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6" data-testid="edit-message-delivered-page">
        <Card className="glass-card max-w-2xl">
          <CardContent className="space-y-4 p-6">
            <Button variant="ghost" className="w-fit px-0 text-[var(--t3)] hover:bg-transparent hover:text-[var(--t)]" onClick={() => navigate('/messages')} data-testid="edit-message-back-from-delivered-button">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Messages
            </Button>
            <h1 className="text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Delivered messages can’t be edited</h1>
            <p className="text-sm text-[var(--t5)]">This route is protected against direct edits after delivery, matching the original platform rules.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-slide-in-right"
      data-testid="edit-message-page"
      style={{
        background: 'radial-gradient(ellipse at top left, rgba(139,92,246,0.15), transparent 55%), radial-gradient(ellipse at bottom right, rgba(124,58,237,0.08), transparent 55%)',
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Button variant="ghost" className="w-fit px-0 text-[var(--t3)] hover:bg-transparent hover:text-[var(--t)]" onClick={() => navigate('/messages')} data-testid="edit-message-back-button">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Messages
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(124,58,237,0.15))' }}>
              <Pencil className="h-6 w-6 text-[#B794F6]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="edit-message-title">
                Edit Milestone Message
              </h1>
              <p className="text-sm text-[var(--t5)]" data-testid="edit-message-subtitle">
                Update content and delivery rules
              </p>
            </div>
          </div>
        </div>
        <Button className="gold-button w-full sm:w-auto" onClick={handleSave} disabled={saving} data-testid="edit-message-save-top-button">
          {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
          Save Changes
        </Button>
      </div>

      <SectionLockBanner sectionId="messages" />

      <SectionLockedOverlay sectionId="messages">
        <div className="grid gap-6 xl:grid-cols-[340px,minmax(0,1fr)]">
          <Card className="glass-card h-fit animate-bounce-tile" data-testid="edit-message-summary-card">
            <CardContent className="space-y-5 p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d4af37]">Current Message</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--t)]" data-testid="edit-message-current-title">{title || 'Untitled message'}</h2>
                <p className="mt-2 text-sm text-[var(--t5)]" data-testid="edit-message-current-trigger">
                  {triggerType === 'immediate' && 'Deliver on estate transition'}
                  {triggerType === 'age_milestone' && `Deliver at age ${triggerAge || '—'}`}
                  {triggerType === 'event' && `Deliver on ${triggerValue === 'custom' ? customEventLabel || 'custom event' : triggerValue || 'event'}`}
                  {triggerType === 'specific_date' && `Deliver on ${triggerDate || 'selected date'}`}
                </p>
              </div>

              <div className="rounded-2xl border p-4" style={{ background: 'rgba(212,175,55,0.06)', borderColor: 'rgba(212,175,55,0.15)' }} data-testid="edit-message-status-card">
                <div className="flex items-center gap-2 text-sm text-[#d4af37]">
                  <Users className="h-4 w-4" />
                  {selectedRecipients.length} recipient{selectedRecipients.length === 1 ? '' : 's'} selected
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d4af37]">Message Format</p>
                <div className="grid gap-2">
                  {[
                    { key: 'text', label: 'Written', icon: MessageSquare },
                    { key: 'voice', label: 'Voice', icon: Mic },
                    { key: 'video', label: 'Video', icon: Video },
                  ].map((option) => {
                    const active = messageType === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        className="flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-transform active:scale-[0.98]"
                        style={{
                          background: active ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
                          borderColor: active ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.08)',
                          color: active ? '#d4af37' : 'var(--t)',
                        }}
                        onClick={() => setMessageType(option.key)}
                        data-testid={`edit-message-type-${option.key}`}
                      >
                        <option.icon className="h-4 w-4" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="glass-card animate-bounce-tile" data-testid="edit-message-content-card">
              <CardHeader>
                <CardTitle className="text-base text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Message Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Message Title <span className="text-red-400">*</span></Label>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g., Happy 30th Birthday!" className="input-field" data-testid="edit-message-title-input" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Message Content <span className="text-red-400">*</span></Label>
                  <Textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write your heartfelt message here..." className="input-field min-h-[150px]" data-testid="edit-message-content-input" />
                  <button
                    type="button"
                    onClick={toggleSpeechToText}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${isSpeechListening ? 'bg-red-500/20 text-red-400' : 'text-[var(--t5)] hover:bg-[var(--s)] hover:text-[var(--t3)]'}`}
                    data-testid="edit-message-dictation-button"
                  >
                    {isSpeechListening ? <><MicOff className="h-3.5 w-3.5" /> Stop Dictation</> : <><Mic className="h-3.5 w-3.5" /> Dictate Message</>}
                  </button>
                </div>
              </CardContent>
            </Card>

            {messageType === 'video' && (
              <Card className="glass-card animate-bounce-tile" data-testid="edit-message-video-card">
                <CardHeader>
                  <CardTitle className="text-base text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Video Recording</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-2xl border border-[var(--b)] bg-black/20 p-4">
                    {(videoUrl || videoBlob === 'existing') ? (
                      <div className="space-y-4">
                        {videoUrl ? (
                          <video src={videoUrl} poster={videoPosterUrl || undefined} controls playsInline preload="metadata" className="w-full rounded-xl" style={{ maxHeight: '360px' }} data-testid="edit-message-video-preview" />
                        ) : (
                          <div className="flex items-center justify-center py-10 text-sm text-[#94a3b8]" data-testid="edit-message-video-loading">
                            <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#8b5cf6]" />
                            Loading video...
                          </div>
                        )}
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button variant="outline" className="border-[var(--b)] text-white flex-1" onClick={clearExistingVideo} data-testid="edit-message-remove-video-button">
                            <X className="mr-2 h-4 w-4" /> Remove
                          </Button>
                          <Button variant="outline" className="border-[var(--b)] text-[#8b5cf6] flex-1" onClick={() => { clearExistingVideo(); initCamera(); }} data-testid="edit-message-rerecord-video-button">
                            <Camera className="mr-2 h-4 w-4" /> Re-record
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4 py-8 text-center">
                        <Camera className="h-12 w-12 text-[var(--t5)]" />
                        <p className="text-sm text-[var(--t4)]">Record a new video message for your loved ones.</p>
                        <Button onClick={() => initCamera()} className="gold-button" data-testid="edit-message-open-camera-button">
                          <Camera className="mr-2 h-5 w-5" />
                          Open Camera
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {showRecordingOverlay && (
              <div className="fixed inset-0 z-[200] flex flex-col bg-black" data-testid="edit-message-recording-overlay">
                <div className="relative flex-1">
                  <video ref={videoRef} className="h-full w-full object-cover" muted playsInline style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} />
                  {countdown !== null && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <span className="text-8xl font-bold text-white animate-pulse" style={{ fontFamily: 'Outfit, sans-serif' }}>{countdown}</span>
                    </div>
                  )}
                  {isRecording && (
                    <div className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2" style={{ background: 'rgba(0,0,0,0.75)' }}>
                      <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm font-bold text-white">Recording</span>
                    </div>
                  )}
                  <div className="absolute left-4 right-4 top-4 flex items-center justify-between" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
                    <button onClick={() => { if (isRecording) stopRecording(); releaseCamera(); }} className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.7)' }} data-testid="edit-message-recording-close-button">
                      <X className="h-5 w-5 text-white" />
                    </button>
                    {!isRecording && (
                      <button onClick={flipCamera} className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.7)' }} data-testid="edit-message-camera-flip-button">
                        <SwitchCamera className="h-7 w-7 text-white" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center justify-center px-6 py-8" style={{ background: 'rgba(0,0,0,0.8)', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}>
                  {!isRecording && countdown === null ? (
                    <button onClick={startRecording} className="flex h-20 w-20 items-center justify-center rounded-full transition-transform active:scale-90" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', boxShadow: '0 4px 24px rgba(212,175,55,0.4)' }} data-testid="edit-message-start-recording-button">
                      <Camera className="h-8 w-8 text-[#080e1a]" />
                    </button>
                  ) : isRecording ? (
                    <button onClick={stopRecording} className="flex h-20 w-20 items-center justify-center rounded-full transition-transform active:scale-90" style={{ background: '#ef4444', boxShadow: '0 4px 24px rgba(239,68,68,0.4)' }} data-testid="edit-message-stop-recording-button">
                      <StopCircle className="h-8 w-8 text-white" />
                    </button>
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
                      <span className="text-3xl font-bold text-white">{countdown}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {messageType === 'voice' && (
              <Card className="glass-card animate-bounce-tile" data-testid="edit-message-voice-card">
                <CardHeader>
                  <CardTitle className="text-base text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Voice Recording</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-2xl border border-[var(--b)] bg-black/20 p-4">
                    {audioUrl ? (
                      <div className="space-y-3">
                        <audio src={audioUrl} controls className="w-full" data-testid="edit-message-voice-playback" />
                        <Button variant="outline" onClick={() => { setAudioBlob(null); setAudioUrl(null); }} className="w-full border-[var(--b)] text-white" data-testid="edit-message-remove-voice-button">
                          <X className="mr-2 h-4 w-4" />
                          Remove Recording
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4 py-6 text-center">
                        {countdown !== null && <span className="text-5xl font-bold text-[var(--gold)] animate-pulse" style={{ fontFamily: 'Outfit, sans-serif' }}>{countdown}</span>}
                        {isRecording && (
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-sm font-medium text-red-400">Recording...</span>
                          </div>
                        )}
                        {!isRecording && countdown === null ? (
                          <Button onClick={startVoiceRecording} className="gold-button" data-testid="edit-message-start-voice-button">
                            <Mic className="mr-2 h-5 w-5" />
                            Start Recording
                          </Button>
                        ) : isRecording ? (
                          <Button onClick={stopVoiceRecording} className="bg-[#ef4444] text-white hover:bg-[#dc2626]" data-testid="edit-message-stop-voice-button">
                            <StopCircle className="mr-2 h-5 w-5" />
                            Stop Recording
                          </Button>
                        ) : null}
                        <p className="text-xs text-[#525c72]">Record a voice message for your loved ones.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="glass-card animate-bounce-tile" data-testid="edit-message-recipients-card">
              <CardHeader>
                <CardTitle className="text-base text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Recipients</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {beneficiaries.length === 0 ? (
                  <p className="text-sm text-[#64748b]" data-testid="edit-message-no-recipients">No beneficiaries added yet.</p>
                ) : (
                  beneficiaries.map((beneficiary) => {
                    const recipientId = beneficiary.user_id || beneficiary.id;
                    const active = selectedRecipients.includes(recipientId);
                    return (
                      <button
                        key={beneficiary.id}
                        type="button"
                        className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-transform active:scale-[0.99]"
                        style={{
                          background: active ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.03)',
                          borderColor: active ? 'rgba(212,175,55,0.25)' : 'rgba(255,255,255,0.08)',
                        }}
                        onClick={() => toggleRecipient(recipientId)}
                        data-testid={`edit-message-recipient-${beneficiary.id}`}
                      >
                        <input type="checkbox" checked={active} readOnly className="h-4 w-4 accent-[#d4af37]" data-testid={`edit-message-recipient-checkbox-${beneficiary.id}`} />
                        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-sm font-semibold" style={{ backgroundColor: beneficiary.photo_url ? 'transparent' : `${beneficiary.avatar_color}30`, color: beneficiary.avatar_color }}>
                          {beneficiary.photo_url ? <img src={beneficiary.photo_url} alt={beneficiary.name} className="h-full w-full object-cover" /> : beneficiary.initials}
                        </div>
                        <div>
                          <p className="text-sm text-[var(--t)]">{beneficiary.name}</p>
                          <p className="text-xs text-[#64748b]">{beneficiary.relation}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="glass-card animate-bounce-tile" data-testid="edit-message-trigger-card">
              <CardHeader>
                <CardTitle className="text-base text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Delivery Trigger</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[#94a3b8]">Trigger Type</Label>
                  <select value={triggerType} onChange={(event) => setTriggerType(event.target.value)} className="input-field h-11 w-full rounded-xl px-3" data-testid="edit-message-trigger-select">
                    <option value="immediate">Deliver on Estate Transition</option>
                    <option value="age_milestone">At Specific Age</option>
                    <option value="event">On Life Event</option>
                    <option value="specific_date">On Specific Date</option>
                  </select>
                </div>

                {triggerType === 'age_milestone' && (
                  <div className="space-y-2">
                    <Label className="text-[#94a3b8]">At Age</Label>
                    <Input type="number" value={triggerAge} onChange={(event) => setTriggerAge(event.target.value)} placeholder="e.g., 30" className="input-field" min="1" max="100" data-testid="edit-message-trigger-age-input" />
                  </div>
                )}

                {triggerType === 'event' && (
                  <div className="space-y-3">
                    <Label className="text-[#94a3b8]">Event Type</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {eventTypes.map((event) => {
                        const active = triggerValue === event.value;
                        return (
                          <button
                            key={event.value}
                            type="button"
                            onClick={() => setTriggerValue(event.value)}
                            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-transform duration-150 active:scale-[0.96]"
                            style={{
                              background: active ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
                              border: active ? '2px solid rgba(212,175,55,0.5)' : '1px solid rgba(255,255,255,0.08)',
                              color: active ? '#d4af37' : '#94a3b8',
                            }}
                            data-testid={`edit-message-event-${event.value}`}
                          >
                            <event.icon className="h-4 w-4" />
                            {event.label}
                          </button>
                        );
                      })}
                    </div>
                    {triggerValue === 'custom' && (
                      <div className="space-y-2">
                        <Label className="text-[#94a3b8]">Describe Your Event</Label>
                        <Input value={customEventLabel} onChange={(event) => setCustomEventLabel(event.target.value)} placeholder="e.g., Birth of first grandchild" className="input-field" data-testid="edit-message-custom-event-input" />
                      </div>
                    )}
                  </div>
                )}

                {triggerType === 'specific_date' && (
                  <div className="space-y-2">
                    <Label className="text-[#94a3b8]">Delivery Date</Label>
                    <Input type="date" value={triggerDate} onChange={(event) => setTriggerDate(event.target.value)} className="input-field" data-testid="edit-message-trigger-date-input" />
                  </div>
                )}

                <div className="rounded-2xl border p-4" style={{ background: 'rgba(59,130,246,0.05)', borderColor: 'rgba(59,130,246,0.15)' }} data-testid="edit-message-trigger-note">
                  <div className="flex items-start gap-3 text-xs text-[#93c5fd]">
                    {triggerType === 'immediate' && <Send className="mt-0.5 h-4 w-4" />}
                    {triggerType === 'age_milestone' && <Calendar className="mt-0.5 h-4 w-4" />}
                    {triggerType === 'event' && <Star className="mt-0.5 h-4 w-4" />}
                    {triggerType === 'specific_date' && <CalendarDays className="mt-0.5 h-4 w-4" />}
                    <span>Delivery settings are preserved exactly as configured.</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" className="border-[var(--b)] text-white" onClick={() => navigate('/messages')} data-testid="edit-message-cancel-button">
                Cancel
              </Button>
              <Button className="gold-button" onClick={handleSave} disabled={saving} data-testid="edit-message-save-bottom-button">
                {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </SectionLockedOverlay>
    </div>
  );
}